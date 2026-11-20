import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runInBgPool } from '@/lib/db/pool-context';
import { admitir, canaisSombra, horaBucket, pistaConfig } from '@/lib/pistas/admissao';
import { marcaDoCandidato, masterDeLinha, tipoDoCandidato, type FatosOferta } from '@/lib/pistas/candidato';
import type { Candidate, SentRecord } from '@/lib/messaging/group-rules';
import { contadores, gravarLote, reconstruirDeDecisoes } from './contadores';

/**
 * R-112, SOMBRA da pista autonoma. NAO ENVIA NADA e nao toca o envio atual: le as propostas recentes dos canais piloto (PISTA_SOMBRA), roda a
 * admissao e GRAVA a decisao em `pista_decisao`. Chamada por /api/cron/pista-sombra (rota propria; nenhum arquivo do envio e alterado).
 * Falha da sombra nunca derruba nada: tudo em try/catch, orcamento de tempo curto, consultas leves (LIMIT, statement_timeout, pool 'bg').
 * Ponto de gancho ideal na Fase 2 (documentado no Fluxo Mestre R-112): ao final da deteccao de group-offers, chamar `avaliarCandidatos`.
 */
export const SOMBRA_BUDGET_MS = 20_000;
const JANELA_PROPOSTAS_MIN = 20;
const LIM_PROPOSTAS = 300;
const RETENCAO_DIAS = 7;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function leve<T>(ms: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runInBgPool(() => db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = ${ms}`);
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    return fn(tx);
  }));
}
const lista = (xs: readonly string[]) => sql.raw(`ARRAY[${xs.map((c) => `'${c.replace(/[^a-z0-9-]/g, '')}'`).join(',')}]::text[]`);

type LinhaProposta = {
  id: string; vertical: string; master_product_id: string | null; offer_id: string | null; created_at: string; status: string;
  price_cents_detected: string | null; candidate: Record<string, unknown>;
};
type LinhaHist = { master_product_id: string; price_cents_detected: string | null; t: string; trigger: string | null; degrau: string | null; offer_id: string | null; vertical: string; tipo: string | null };

export interface ResumoSombra {
  ligado: boolean; canais: string[]; avaliadas: number; enviaria: number; descartaria: number; gravadas: number; tipoPreenchido: number; ms: number; erro?: string; parou?: string;
}

/** Preenche `tipo` das linhas recentes ja terminais (sem contencao com o envio). Lote pequeno; o backfill de 48 h e feito pelo script proprio. */
async function preencherTipoRecente(canais: readonly string[]): Promise<number> {
  const rows = await leve('4s', (tx) => tx.execute<{ id: string; vertical: string; tipo_c: string | null; nome_c: string | null }>(sql`
    SELECT id::text, vertical::text, candidate ->> 'tipo' AS tipo_c, candidate ->> 'name' AS nome_c FROM group_messages
    WHERE status = ANY(ARRAY['enviada','expirada','rejeitada','retida','erro']::text[]) AND created_at >= now() - interval '3 hours' AND tipo IS NULL
      AND vertical = ANY(${lista(canais)}) LIMIT 200`));
  const porTipo = new Map<string, string[]>();
  for (const r of rows as unknown as Array<{ id: string; vertical: string; tipo_c: string | null; nome_c: string | null }>) {
    const t = tipoDoCandidato(r.vertical, { tipo: r.tipo_c, name: r.nome_c });
    if (!t) continue;
    (porTipo.get(t) ?? porTipo.set(t, []).get(t)!).push(r.id);
  }
  let n = 0;
  for (const [t, ids] of porTipo) {
    await leve('4s', (tx) => tx.execute(sql`UPDATE group_messages SET tipo = ${t} WHERE id = ANY(${sql.raw(`ARRAY[${ids.map((x) => `'${x.replace(/[^0-9a-f-]/g, '')}'`).join(',')}]::uuid[]`)}) AND tipo IS NULL`));
    n += ids.length;
  }
  return n;
}

export async function rodarSombra(now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<ResumoSombra> {
  const t0 = Date.now();
  const canais = canaisSombra(env);
  const r: ResumoSombra = { ligado: canais.length > 0, canais, avaliadas: 0, enviaria: 0, descartaria: 0, gravadas: 0, tipoPreenchido: 0, ms: 0 };
  if (!canais.length) return r;
  const prazo = () => Date.now() - t0 > SOMBRA_BUDGET_MS;
  try {
    const cfg = pistaConfig(env);
    contadores.limpar();
    await reconstruirDeDecisoes(canais);

    // 1) propostas recentes ainda sem decisao (uma consulta, anti-join pelo indice unico de mensagem_id)
    const props = (await leve('5s', (tx) => tx.execute<LinhaProposta>(sql`
      SELECT g.id::text, g.vertical::text, g.master_product_id::text, g.offer_id::text, g.created_at, g.status, g.price_cents_detected::text, g.candidate
      FROM group_messages g LEFT JOIN pista_decisao d ON d.mensagem_id = g.id
      WHERE g.status = ANY(ARRAY['proposta_auto','aprovada','enviando','enviada','expirada','proposta','retida']::text[])
        AND g.created_at >= now() - ${`${JANELA_PROPOSTAS_MIN} minutes`}::interval AND g.channel = 'tg' AND g.vertical = ANY(${lista(canais)})
        AND g.master_product_id IS NOT NULL AND g.trigger NOT IN ('G4', 'RADAR') AND d.id IS NULL
      ORDER BY g.created_at ASC LIMIT ${LIM_PROPOSTAS}`))) as unknown as LinhaProposta[];
    if (!props.length) { r.ms = Date.now() - t0; return r; }

    // 2) historico de repeticao: envios reais (26 h) + o que a sombra simulou enviar (26 h)
    const hist = (await leve('5s', (tx) => tx.execute<LinhaHist>(sql`
      SELECT master_product_id::text, price_cents_detected::text, sent_at AS t, trigger, candidate -> 'regua' ->> 'degrau' AS degrau, offer_id::text, vertical::text, NULL::text AS tipo
      FROM group_messages WHERE status = 'enviada' AND created_at >= now() - interval '30 hours' AND sent_at >= now() - interval '26 hours' AND vertical = ANY(${lista(canais)}) AND master_product_id IS NOT NULL LIMIT 3000`))) as unknown as LinhaHist[];
    const sim = (await leve('5s', (tx) => tx.execute<LinhaHist>(sql`
      SELECT g.master_product_id::text, g.price_cents_detected::text, g.created_at AS t, g.trigger, g.candidate -> 'regua' ->> 'degrau' AS degrau, g.offer_id::text, g.vertical::text, d.tipo
      FROM pista_decisao d JOIN group_messages g ON g.id = d.mensagem_id
      WHERE d.decisao = 'enviaria' AND d.criado_em >= now() - interval '26 hours' AND d.canal = ANY(${lista(canais)}) AND g.master_product_id IS NOT NULL LIMIT 2000`))) as unknown as LinhaHist[];
    const historico: SentRecord[] = [...hist, ...sim].map((h) => ({
      masterProductId: h.master_product_id, priceCents: Number(h.price_cents_detected ?? 0), sentAt: new Date(h.t), trigger: h.trigger,
      degrau: h.degrau == null ? null : Number(h.degrau), offerId: h.offer_id, vertical: h.vertical, tipo: h.tipo,
    }));

    // 3) fatos das ofertas (PK): link do dono (R-70), pendencia, atividade e quarentena
    const ofertaIds = Array.from(new Set(props.map((p) => p.offer_id).filter((x): x is string => !!x)));
    const ofertas = new Map<string, FatosOferta>();
    if (ofertaIds.length) {
      const orows = (await leve('5s', (tx) => tx.execute<{ id: string; affiliate_url: string | null; affiliate_link_pending: boolean; status: string; quarantined_at: string | null }>(sql`
        SELECT id::text, affiliate_url, affiliate_link_pending, status::text, quarantined_at FROM affiliate_offers
        WHERE id = ANY(${sql.raw(`ARRAY[${ofertaIds.map((x) => `'${x.replace(/[^0-9a-f-]/g, '')}'`).join(',')}]::uuid[]`)})`))) as unknown as Array<{ id: string; affiliate_url: string | null; affiliate_link_pending: boolean; status: string; quarantined_at: string | null }>;
      for (const o of orows) ofertas.set(o.id, { url: o.affiliate_url, pend: !!o.affiliate_link_pending, viva: o.status === 'active' && !o.quarantined_at });
    }

    // 4) admissao em ordem de criacao; cada 'enviaria' consome vaga (simulada) e entra no historico
    const decisoes: Array<{ canal: string; msg: string; master: string | null; oferta: string | null; tipo: string | null; marca: string | null; decisao: string; motivo: string; cota: number; janela: Date }> = [];
    for (const p of props) {
      if (prazo()) { r.parou = 'orcamento_de_tempo'; break; }
      const c = p.candidate as unknown as Candidate & { tipo?: string | null };
      const agora = new Date(p.created_at);
      const hora = horaBucket(agora);
      const tipo = tipoDoCandidato(p.vertical, p.candidate);
      const marca = marcaDoCandidato(p.vertical, p.candidate);
      const of = p.offer_id ? ofertas.get(p.offer_id) : undefined;
      const master = masterDeLinha(p, of);
      const res = admitir({ canal: p.vertical, tipo, marca, master, agora, estado: contadores.ler(p.vertical, hora, tipo, marca), historico, config: cfg });
      if (res.decisao === 'enviaria') {
        contadores.incrementar(p.vertical, hora, tipo, marca, 1, true);
        historico.push({ masterProductId: master.masterProductId, priceCents: master.priceCents, sentAt: agora, trigger: master.trigger, degrau: master.regua?.degrau ?? null, offerId: master.offerIds[0] ?? null, vertical: p.vertical, tipo });
        r.enviaria++;
      } else r.descartaria++;
      r.avaliadas++;
      decisoes.push({ canal: p.vertical, msg: p.id, master: p.master_product_id, oferta: p.offer_id, tipo, marca, decisao: res.decisao, motivo: res.motivo.slice(0, 200), cota: res.cotaUsada, janela: hora });
    }

    // 5) grava em lote (um INSERT) + contadores agregados
    if (decisoes.length) {
      const vals = decisoes.map((d) => sql`(${d.canal}, ${d.msg}::uuid, ${d.master}::uuid, ${d.oferta}::uuid, ${d.tipo}, ${d.marca}, ${d.decisao}, ${d.motivo}, ${d.cota}, ${d.janela.toISOString()}::timestamptz)`);
      await leve('5s', (tx) => tx.execute(sql`INSERT INTO pista_decisao (canal, mensagem_id, master_id, oferta_id, tipo, marca, decisao, motivo, cota_usada, janela) VALUES ${sql.join(vals, sql`, `)} ON CONFLICT (mensagem_id) DO NOTHING`));
      r.gravadas = decisoes.length;
      await gravarLote();
    }
  } catch (e) {
    r.erro = String((e as Error)?.message ?? e).slice(0, 200);
  }
  // 6) manutencao leve, sempre isolada (nunca afeta a sombra nem o ciclo)
  try { if (!prazo()) r.tipoPreenchido = await preencherTipoRecente(canais); } catch { /* ignora */ }
  try {
    if (!prazo() && now.getUTCMinutes() < 10) {
      await leve('5s', (tx) => tx.execute(sql`DELETE FROM pista_decisao WHERE id IN (SELECT id FROM pista_decisao WHERE criado_em < now() - ${`${RETENCAO_DIAS} days`}::interval LIMIT 500)`));
      await leve('5s', (tx) => tx.execute(sql`DELETE FROM pista_contador WHERE hora_bucket < now() - ${`${RETENCAO_DIAS} days`}::interval`));
    }
  } catch { /* ignora */ }
  r.ms = Date.now() - t0;
  return r;
}
