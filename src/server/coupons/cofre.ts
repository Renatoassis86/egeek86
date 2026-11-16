import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { podeDivulgar, TTL_PROVA_MIN, validadorDaRede, type Decisao, type PedidoDivulgacao, type Prova, type TipoItem, type TipoProva, type UsoCupom } from '@/lib/coupons/cofre';

/**
 * COFRE (servidor): grava a decisão de `podeDivulgar` (estado atual por oferta/cupom + trilha só quando o estado muda), lê provas de SIMULAÇÃO de checkout, revoga o que venceu e dá as
 * métricas para o /admin e para o medidor. Flag `COFRE_CUPONS` (ligada; `0`/`off` desliga SÓ a exigência, a gravação continua). Nunca lança: o cofre não derruba a mensagem de preço.
 */
export function cofreLigado(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false)$/i.test((env.COFRE_CUPONS ?? '').trim());
}

export interface Registro {
  offerId: string;
  couponRef: string;
  tipoItem: TipoItem;
  rede: string;
  uso: UsoCupom;
  decisao: Decisao;
  nome?: string | null;
  valorFinalCents?: number | null;
}

/** Grava a decisão. Escreve só quando o estado muda ou a última decisão tem > 5 min (evita uma linha por consulta). Trilha só na mudança de estado. */
export async function registrarDecisao(r: Registro): Promise<void> {
  try {
    const d = r.decisao;
    const estado = d.ok ? d.estado : d.estado === 'revogado' ? 'revogado' : 'lido';
    const acao = d.ok ? (d.estado === 'revalidando' ? 'revalidando' : 'liberado') : d.estado === 'revogado' ? 'revogado' : 'barrado';
    const prova = d.prova;
    const validator = validadorDaRede(r.rede)?.leitor ?? null;
    await db.execute(sql`
      WITH old AS (SELECT state FROM coupon_validations WHERE offer_id = ${r.offerId}::uuid AND coupon_ref = ${r.couponRef}),
      up AS (
        INSERT INTO coupon_validations (offer_id, coupon_ref, kind, network_slug, proof_type, state, motivo, proved, read_at, validated_at, expires_at, validator, revoked_at, last_decided_at)
        VALUES (${r.offerId}::uuid, ${r.couponRef}, ${r.tipoItem}, ${r.rede}, ${prova?.tipo ?? null}, ${estado}, ${d.motivo ?? null},
                ${JSON.stringify({ nome: r.nome ?? prova?.nome ?? null, valorFinalCents: r.valorFinalCents ?? prova?.valorFinalCents ?? null, minimoCents: prova?.minimoCents ?? null })}::jsonb,
                ${prova?.validadaEm.toISOString() ?? null}::timestamptz, ${prova?.validadaEm.toISOString() ?? null}::timestamptz, ${d.expiraEm?.toISOString() ?? null}::timestamptz, ${validator},
                ${estado === 'revogado' ? new Date().toISOString() : null}::timestamptz, now())
        ON CONFLICT (offer_id, coupon_ref) DO UPDATE SET
          proof_type = EXCLUDED.proof_type, state = EXCLUDED.state, motivo = EXCLUDED.motivo, proved = EXCLUDED.proved, read_at = EXCLUDED.read_at, validated_at = EXCLUDED.validated_at,
          expires_at = EXCLUDED.expires_at, validator = EXCLUDED.validator, revoked_at = EXCLUDED.revoked_at, last_decided_at = now()
        WHERE coupon_validations.state IS DISTINCT FROM EXCLUDED.state OR coupon_validations.last_decided_at < now() - interval '5 minutes'
        RETURNING 1)
      INSERT INTO coupon_validation_trail (offer_id, coupon_ref, network_slug, kind, uso, acao, motivo, proof_type, detalhe)
      SELECT ${r.offerId}::uuid, ${r.couponRef}, ${r.rede}, ${r.tipoItem}, ${r.uso}, ${acao}, ${d.motivo ?? null}, ${prova?.tipo ?? null}, ${JSON.stringify({ estado })}::jsonb
      WHERE EXISTS (SELECT 1 FROM up) AND (SELECT state FROM old) IS DISTINCT FROM ${estado}`);
  } catch (e) {
    console.error('[cofre] falha ao registrar (ignorada):', e instanceof Error ? e.message : e);
  }
}

/**
 * Provas de SIMULAÇÃO de checkout (até antes de pagar) gravadas pela aba para (oferta, cupom): as APLICADAS viram prova; a que provou que NÃO aplica volta como prova `revogada`,
 * que VETA qualquer outra prova do cupom dentro do TTL da simulação (QA F4/F6). `podeDivulgar` filtra o que está vigente.
 */
export async function provasDeSimulacao(offerId: string, couponRef: string): Promise<Prova[]> {
  try {
    const rows = (await db.execute(sql`
      SELECT state, validated_at, proved FROM coupon_validations
      WHERE offer_id = ${offerId}::uuid AND coupon_ref = ${'sim:' + couponRef} AND proof_type = 'simulacao_de_checkout' AND validated_at IS NOT NULL`)) as unknown as { state: string; validated_at: Date | string; proved: { nome?: string | null; valorFinalCents?: number | null; minimoCents?: number | null } | null }[];
    return rows.map((x) => ({ tipo: 'simulacao_de_checkout' as TipoProva, validadaEm: new Date(x.validated_at), nome: x.proved?.nome ?? null, valorFinalCents: x.proved?.valorFinalCents ?? null, minimoCents: x.proved?.minimoCents ?? null, revogada: x.state === 'revogado' }));
  } catch { return []; }
}

/** Simulações aplicadas da oferta (qualquer cupom): único tipo de prova que sustenta PREÇO FINAL de promoção derivada (vitrine). */
export async function provasDeValorFinalDaOferta(offerId: string): Promise<Prova[]> {
  try {
    const rows = (await db.execute(sql`
      SELECT validated_at, proved FROM coupon_validations WHERE offer_id = ${offerId}::uuid AND proof_type = 'simulacao_de_checkout' AND state <> 'revogado' AND validated_at IS NOT NULL`)) as unknown as { validated_at: Date | string; proved: { nome?: string | null; valorFinalCents?: number | null } | null }[];
    return rows.map((x) => ({ tipo: 'simulacao_de_checkout' as TipoProva, validadaEm: new Date(x.validated_at), nome: x.proved?.nome ?? null, valorFinalCents: x.proved?.valorFinalCents ?? null }));
  } catch { return []; }
}

/**
 * Revogação automática (etapa 4): tudo que estava divulgável/revalidando e passou do TTL vira `revogado` e entra na trilha (o guardião retira o aviso quando a leitura
 * mais nova não confirma). Devolve as revogações para o relatório do ciclo (collector_runs job 'cofre-cupons').
 */
export async function revogarVencidos(): Promise<{ revogados: number; porRede: Record<string, number> }> {
  try {
    const rows = (await db.execute(sql`
      WITH v AS (
        UPDATE coupon_validations SET state = 'revogado', motivo = 'prova_vencida', revoked_at = now(), last_decided_at = now()
        WHERE state IN ('divulgavel', 'revalidando') AND expires_at IS NOT NULL AND expires_at < now()
        RETURNING offer_id, coupon_ref, network_slug, kind, proof_type)
      INSERT INTO coupon_validation_trail (offer_id, coupon_ref, network_slug, kind, uso, acao, motivo, proof_type)
      SELECT offer_id, coupon_ref, network_slug, kind, 'revogacao_automatica', 'revogado', 'prova_vencida', proof_type FROM v RETURNING network_slug`)) as unknown as { network_slug: string }[];
    const porRede: Record<string, number> = {};
    for (const r of rows) porRede[r.network_slug] = (porRede[r.network_slug] ?? 0) + 1;
    if (rows.length) await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('cofre-cupons', 'cofre', now(), now(), 0, 'ok', ${JSON.stringify({ revogados: rows.length, porRede })}::jsonb)`);
    return { revogados: rows.length, porRede };
  } catch { return { revogados: 0, porRede: {} }; }
}

export interface MetricasCofre {
  porRedeEstado: { rede: string; estado: string; n: number }[];
  barradosLiberados24h: { rede: string; liberados: number; barrados: number; revogados: number }[];
  recentes: { at: string; rede: string; acao: string; motivo: string | null; prova: string | null; oferta: string }[];
}

/** Métricas do /admin e do medidor. */
export async function metricasCofre(): Promise<MetricasCofre> {
  const out: MetricasCofre = { porRedeEstado: [], barradosLiberados24h: [], recentes: [] };
  try {
    out.porRedeEstado = ((await db.execute(sql`SELECT network_slug AS rede, state AS estado, count(*)::int AS n FROM coupon_validations GROUP BY 1, 2 ORDER BY 1, 2`)) as unknown as { rede: string; estado: string; n: number }[]);
    out.barradosLiberados24h = ((await db.execute(sql`SELECT network_slug AS rede, count(*) FILTER (WHERE acao IN ('liberado','revalidando'))::int AS liberados, count(*) FILTER (WHERE acao = 'barrado')::int AS barrados, count(*) FILTER (WHERE acao = 'revogado')::int AS revogados FROM coupon_validation_trail WHERE at > now() - interval '24 hours' GROUP BY 1 ORDER BY 1`)) as unknown as MetricasCofre['barradosLiberados24h']);
    out.recentes = ((await db.execute(sql`SELECT to_char(at, 'DD/MM HH24:MI') AS at, network_slug AS rede, acao, motivo, proof_type AS prova, left(offer_id::text, 8) AS oferta FROM coupon_validation_trail ORDER BY at DESC LIMIT 15`)) as unknown as MetricasCofre['recentes']);
  } catch { /* tabelas ainda não aplicadas */ }
  return out;
}

export { TTL_PROVA_MIN };
export type { PedidoDivulgacao };

/**
 * RETIRADA DO AVISO (etapa 4): fecha (ended_at, end_reason 'sem_prova_no_cofre', sem card de "cupom acabou") os avisos de cupom abertos que não têm prova vigente no cofre,
 * com mais de 60 min de vida. Atrás da flag `COFRE_RETIRAR_AVISOS=1` (padrão DESLIGADA: ligue depois de reinjetar o leitor ML v1.3.0 e conferir o medidor, senão todo aviso
 * de ML seria fechado por falta de prova nova). Reversível: `UPDATE coupon_announcements SET ended_at = NULL, end_reason = NULL WHERE end_reason = 'sem_prova_no_cofre'`.
 */
export async function retirarAvisosSemProva(dryRun = false): Promise<{ ligado: boolean; candidatos: number; retirados: number }> {
  const ligado = /^(1|on|true)$/i.test((process.env.COFRE_RETIRAR_AVISOS ?? '').trim());
  try {
    const cand = (await db.execute(sql`
      SELECT a.id::text AS id FROM coupon_announcements a
      WHERE a.ended_at IS NULL AND a.offer_id IS NOT NULL AND a.first_sent_at < now() - interval '60 minutes'
        AND NOT EXISTS (SELECT 1 FROM coupon_validations v WHERE v.offer_id = a.offer_id AND v.state IN ('divulgavel', 'revalidando') AND v.expires_at > now())`)) as unknown as { id: string }[];
    if (!ligado || dryRun || !cand.length) return { ligado, candidatos: cand.length, retirados: 0 };
    const r = (await db.execute(sql`
      UPDATE coupon_announcements SET ended_at = now(), end_reason = 'sem_prova_no_cofre', last_checked_at = now()
      WHERE id IN (${sql.join(cand.map((c) => sql`${c.id}::uuid`), sql`, `)}) AND ended_at IS NULL RETURNING id`)) as unknown as unknown[];
    await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('cofre-cupons', 'cofre', now(), now(), 0, 'ok', ${JSON.stringify({ avisosRetirados: r.length })}::jsonb)`);
    return { ligado, candidatos: cand.length, retirados: r.length };
  } catch { return { ligado, candidatos: 0, retirados: 0 }; }
}
