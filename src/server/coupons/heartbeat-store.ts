import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { PAGE_NETWORKS } from '@/lib/coupons/page-read';
import { sendTelegramMessage } from '@/server/notifications/send-telegram';
import {
  EVENTO_REDE_SEM_LEITURA, HEARTBEAT_JOB, VIGIA_JOB, rodarVigia,
  type Heartbeat, type HeartbeatEstado, type RedeBatimento, type VigiaDecisao, type VigiaResultado,
} from '@/lib/coupons/heartbeat';

/**
 * Persistência do batimento do loop de cupom 24 h e do vigia. Usa a tabela leve que já existe (collector_runs, migration 0025):
 *   - batimento: job 'cupons-batimento', network = rede, status ok|partial(pausado)|error(parado), meta = contagens do ciclo;
 *   - auditoria do vigia: job 'cupons-vigia', network = rede, status 'error', meta.evento = 'rede_sem_leitura' (+ se o aviso foi enviado).
 * Sem token, sem texto livre, sem dado de conta. Tabela ausente = leitura vazia / gravação ignorada (nunca derruba a rota nem o ciclo).
 */
const STATUS_POR_ESTADO: Record<HeartbeatEstado, 'ok' | 'partial' | 'error'> = { ok: 'ok', pausado: 'partial', parado: 'error' };
const ESTADO_POR_STATUS: Record<string, HeartbeatEstado> = { ok: 'ok', partial: 'pausado', error: 'parado' };

export async function gravarBatimento(h: Heartbeat): Promise<boolean> {
  try {
    const meta = { estado: h.estado, motivo: h.motivo, ciclo: h.ciclo, fila: h.fila, lidas: h.lidas, enviadas: h.enviadas, descartadas: h.descartadas, versao: h.versao };
    await db.execute(sql`
      INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, selected, checked, errors, meta)
      VALUES (${HEARTBEAT_JOB}, ${h.rede}, now(), now(), 0, ${STATUS_POR_ESTADO[h.estado]}, ${h.fila}, ${h.lidas}, ${h.erros}, ${JSON.stringify(meta)}::jsonb)`);
    return true;
  } catch (e) {
    console.error('[cupons-heartbeat] gravar falhou:', e instanceof Error ? e.message : e);
    return false;
  }
}

type Linha = { net: string; at: string | Date | null; ok_at: string | Date | null; aviso_at: string | Date | null; status: string | null; motivo: string | null; ciclo: string | null };

/** Último batimento (qualquer estado e só ok) e último aviso do vigia, por rede. Somente leitura. */
export async function lerBatimentos(redes: readonly string[] = PAGE_NETWORKS): Promise<RedeBatimento[]> {
  const rows = (await db.execute<Linha>(sql`
    SELECT n.net,
      (SELECT max(started_at) FROM collector_runs WHERE job = ${HEARTBEAT_JOB} AND network = n.net) AS at,
      (SELECT max(started_at) FROM collector_runs WHERE job = ${HEARTBEAT_JOB} AND network = n.net AND status = 'ok') AS ok_at,
      (SELECT max(started_at) FROM collector_runs WHERE job = ${VIGIA_JOB} AND network = n.net) AS aviso_at,
      l.status, l.meta->>'motivo' AS motivo, l.meta->>'ciclo' AS ciclo
    FROM unnest(${sql.raw(`ARRAY[${redes.map((r) => `'${r.replace(/[^a-z-]/g, '')}'`).join(',')}]::text[]`)}) AS n(net)
    LEFT JOIN LATERAL (SELECT status, meta FROM collector_runs WHERE job = ${HEARTBEAT_JOB} AND network = n.net ORDER BY started_at DESC LIMIT 1) l ON true`)) as unknown as Linha[];
  const d = (v: string | Date | null) => (v ? new Date(v) : null);
  return rows.map((r) => ({
    rede: r.net, ultimoEm: d(r.at), ultimoEstado: r.status ? (ESTADO_POR_STATUS[r.status] ?? null) : null, ultimoMotivo: r.motivo, ultimoCiclo: r.ciclo != null ? Number(r.ciclo) : null,
    ultimoOkEm: d(r.ok_at), ultimoAvisoEm: d(r.aviso_at),
  }));
}

async function registrarAviso(d: VigiaDecisao, enviado: boolean, naoEnviado: string | null): Promise<void> {
  const meta = { evento: EVENTO_REDE_SEM_LEITURA, acao: d.acao, idadeOkMin: d.idadeOkMin, idadeUltimoMin: d.idadeUltimoMin, avisoEnviado: enviado, semEnvio: naoEnviado };
  await db.execute(sql`
    INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
    VALUES (${VIGIA_JOB}, ${d.rede}, now(), now(), 0, 'error', ${JSON.stringify(meta)}::jsonb)`);
}

/** Canal interno já usado nos avisos da equipe (observabilidade do coletor): COLLECTOR_ALERTS=1 + TELEGRAM_ALERT_CHAT_ID. Senão só registra. */
function canalInterno(): ((texto: string) => Promise<boolean>) | null {
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (process.env.COLLECTOR_ALERTS !== '1' || !chat) return null;
  return async (texto) => (await sendTelegramMessage(chat, texto)).ok;
}

/** Passo do agente de cupons (cicloAgenteCupons): confere os batimentos de Amazon e Shopee. Nunca lança. */
export async function vigiaRedesCupons(now: Date = new Date()): Promise<VigiaResultado | null> {
  try {
    return await rodarVigia({ redes: PAGE_NETWORKS, now, lerBatimentos: () => lerBatimentos(), registrar: registrarAviso, enviar: canalInterno() });
  } catch {
    return null;
  }
}
