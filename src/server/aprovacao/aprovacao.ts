import 'server-only';
import { sql } from 'drizzle-orm';
import type { db as Db } from '@/lib/db';
import { applyInTx, drainRecalc, selectObvious, undoInTx, type Exec } from '@/server/identity-queue/queue';
import { enfileirarDuvidaAmazon, ORIGEM_DUVIDA_AMAZON } from '@/server/collector/amazon-fila';
import { NAO_E_ESTE, NAO_SEI, type QueueOption } from '@/lib/identity-queue/model';
import { OBVIO_VIA } from '@/lib/identity-queue/obvio';
import { offerTitleFlags } from '@/lib/affiliate/offer-identity';
import { motivoDe, parseKey, quedaReal, valorAprovar, valorRecusar, MIN_OFERTAS_QUEDA, type Motivo } from '@/lib/aprovacao/motivos';

/**
 * CENTRAL DE APROVACAO (dono, 2026-11-12). Camada fina sobre o motor da fila (applyInTx/undoInTx, `queue.ts`): NAO reescreve regra de decisao.
 * Acrescenta (a) o caminho dos rascunhos da Amazon SEM item de fila (cria o item pelo molde existente `enfileirarDuvidaAmazon` e aplica 'sim' na
 * MESMA transacao, entao a decisao fica em identity_decisions com o estado anterior e o desfazer funciona), e (b) a aprovacao do master que
 * nasceu em revisao (gate do catalogo), guardando o gate anterior em attributes.aprovacaoHumana para o desfazer restaurar.
 * Nada e apagado. Cada decisao e uma transacao curta.
 */

type DbT = typeof Db;
const rows = <T>(r: unknown) => r as unknown as T[];
const num = (v: unknown) => Number(v);

export interface Cartao {
  key: string; itemId: string | null; offerId: string; motivo: Motivo; axis: string; reason: string | null;
  title: string; imageUrl: string | null; rede: string; loja: string | null; vertical: string; plataforma: string | null; masterName: string | null;
  priceCents: number | null; refCents: number | null; nRefs: number | null; queda: number | null; draft: boolean; masterEmRevisao: boolean;
  confirmadoHaMin: number | null; options: QueueOption[]; understood: Record<string, unknown>; asin: string | null;
}

const OPCOES_IDENTIDADE: QueueOption[] = [
  { value: 'sim', label: 'É o mesmo produto', kind: 'escolha' }, NAO_E_ESTE, NAO_SEI,
];

/** Candidatos: itens pendentes da fila (oferta ativa ou rascunho) + rascunhos Amazon sem nenhum item. Master rejeitado/mesclado fica fora. */
function candSql(withRef: boolean) {
  return sql`
    WITH cand AS (
      SELECT 'item:' || i.id::text AS key, i.id AS item_id, i.offer_id, i.axis, i.understood->>'origem' AS origem, i.understood->>'tipo' AS tipo,
             i.options, i.reason, i.understood, i.created_at AS ord_at
      FROM identity_review_items i
      WHERE i.status = 'pending' AND (i.snoozed_until IS NULL OR i.snoozed_until < now())
      UNION ALL
      SELECT 'oferta:' || o.id::text, NULL::uuid, o.id, 'identidade', 'sem_item', NULL, NULL::jsonb, NULL, '{}'::jsonb, o.created_at
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
      WHERE n.slug = 'amazon' AND o.status = 'draft' AND o.quarantined_at IS NULL AND o.current_price_cents > 0
        AND NOT EXISTS (SELECT 1 FROM identity_review_items x WHERE x.offer_id = o.id)
    )
    SELECT c.key, c.item_id::text AS "itemId", o.id::text AS "offerId", c.axis, c.origem, c.tipo, c.options, c.reason, c.understood,
           o.title, o.image_url AS "imageUrl", n.slug AS rede, o.store_name AS loja, o.external_ref AS "externalRef", o.status::text AS status,
           o.current_price_cents::text AS price, m.name AS "masterName", m.vertical, m.game_platform_gen::text AS gen,
           (m.attributes->'catalogGate'->>'verdict' = 'review' AND COALESCE(m.attributes->'catalogGate'->>'manual', '') <> 'approved') AS "masterRev",
           EXTRACT(EPOCH FROM (now() - o.last_price_confirmed_at))::int / 60 AS "ageMin"
           ${withRef ? sql`, ref.avg_cents::text AS "refCents", ref.n_offers AS "nRefs"` : sql``}
    FROM cand c
    JOIN affiliate_offers o ON o.id = c.offer_id AND o.status IN ('active', 'draft')
    JOIN affiliate_networks n ON n.id = o.network_id
    JOIN master_products m ON m.id = o.master_product_id
      AND COALESCE(m.attributes->'catalogGate'->>'verdict', '') <> 'rejected' AND (m.attributes->>'mergedInto') IS NULL
    ${withRef ? sql`LEFT JOIN LATERAL (SELECT s.avg_cents, s.n_offers FROM price_daily_state s WHERE s.master_product_id = m.id AND s.avg_cents IS NOT NULL ORDER BY s.day DESC LIMIT 1) ref ON true` : sql``}`;
}

function toCartao(r: Record<string, unknown>): Cartao {
  const draft = r.status === 'draft';
  const masterEmRevisao = r.masterRev === true;
  const axis = String(r.axis);
  const origem = (r.origem as string) ?? null;
  const options = (r.options as QueueOption[] | null) ?? OPCOES_IDENTIDADE;
  const price = r.price == null ? null : num(r.price);
  const ref = r.refCents == null ? null : Math.round(num(r.refCents));
  const nRefs = r.nRefs == null ? null : num(r.nRefs);
  const ext = typeof r.externalRef === 'string' ? r.externalRef : '';
  return {
    key: String(r.key), itemId: (r.itemId as string) ?? null, offerId: String(r.offerId), axis,
    motivo: motivoDe({ axis, origem, tipo: (r.tipo as string) ?? null, draft, masterEmRevisao }),
    reason: (r.reason as string) ?? null, title: String(r.title), imageUrl: (r.imageUrl as string) || null, rede: String(r.rede), loja: (r.loja as string) ?? null,
    vertical: String(r.vertical), plataforma: r.gen && r.gen !== 'unknown' ? String(r.gen) : null, masterName: (r.masterName as string) ?? null,
    priceCents: price, refCents: ref, nRefs, queda: quedaReal(price, ref, nRefs), draft, masterEmRevisao,
    confirmadoHaMin: r.ageMin == null ? null : num(r.ageMin), options, understood: (r.understood as Record<string, unknown>) ?? {},
    asin: ext.startsWith('amazon-') ? ext.slice(7) : null,
  };
}

/** Proximos cartoes: ordem = maior queda real primeiro (queda ate o teto de suspeita vem antes), depois Amazon, depois o mais antigo. 20 por vez. */
export async function proximosCartoes(dbx: DbT, p: { skip?: string[]; limit?: number } = {}): Promise<Cartao[]> {
  const skip = (p.skip ?? []).map((k) => parseKey(k)).filter((k): k is NonNullable<typeof k> => !!k).slice(0, 300);
  const skipOffers = skip.map((k) => (k.tipo === 'oferta' ? k.id : null)).filter(Boolean) as string[];
  const skipItems = skip.map((k) => (k.tipo === 'item' ? k.id : null)).filter(Boolean) as string[];
  const arr = (ids: string[]) => sql.raw(`ARRAY[${ids.map((i) => `'${i}'`).join(',')}]::uuid[]`);
  const r = await dbx.execute(sql`
    SELECT * FROM (${candSql(true)}) q
    WHERE true ${skipItems.length ? sql`AND NOT (q."itemId"::uuid = ANY(${arr(skipItems)}))` : sql``}
      ${skipOffers.length ? sql`AND NOT (q."offerId"::uuid = ANY(${arr(skipOffers)}) AND q."itemId" IS NULL)` : sql``}
    ORDER BY CASE WHEN q."nRefs" >= ${MIN_OFERTAS_QUEDA} AND q."refCents"::numeric > 0 AND q.price::numeric > 0
                   AND (q."refCents"::numeric - q.price::numeric) / q."refCents"::numeric BETWEEN 0 AND 0.5
                  THEN (q."refCents"::numeric - q.price::numeric) / q."refCents"::numeric END DESC NULLS LAST,
             (q.rede = 'amazon') DESC, (q.status = 'draft') DESC, q.price::numeric DESC
    LIMIT ${p.limit ?? 20}`);
  return rows<Record<string, unknown>>(r).map(toCartao);
}

export interface Painel {
  total: number; encerradas: number; liberadasHoje: number; resolvidasHoje: number;
  porMotivo: Array<{ motivo: Motivo; n: number }>; porLoja: Array<{ rede: string; n: number }>; porMotivoLoja: Array<{ motivo: Motivo; rede: string; n: number }>;
  rascunhosAmazon: number;
}

export async function painel(dbx: DbT, userId: string): Promise<Painel> {
  const [g, enc, hoje] = await Promise.all([
    dbx.execute(sql`
      SELECT axis, origem, tipo, (status = 'draft') AS draft, "masterRev" AS rev, rede, count(*)::int AS n
      FROM (${candSql(false)}) q GROUP BY 1,2,3,4,5,6`),
    dbx.execute(sql`SELECT count(*)::int AS n FROM identity_review_items i JOIN affiliate_offers o ON o.id = i.offer_id
      WHERE i.status = 'pending' AND (i.snoozed_until IS NULL OR i.snoozed_until < now()) AND o.status NOT IN ('active', 'draft')`),
    dbx.execute(sql`
      SELECT count(*) FILTER (WHERE prev_status = 'draft' AND value = 'sim' AND kind <> 'nao_sei')::int AS lib, count(*)::int AS tot
      FROM identity_decisions WHERE decided_by = ${userId}::uuid AND undone_at IS NULL AND kind <> 'nao_sei'
        AND decided_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`),
  ]);
  const mm = new Map<string, number>(); const ll = new Map<string, number>(); const ml = new Map<string, number>();
  let total = 0; let rascunhosAmazon = 0;
  for (const x of rows<{ axis: string; origem: string | null; tipo: string | null; draft: boolean; rev: boolean | null; rede: string; n: number }>(g)) {
    const motivo = motivoDe({ axis: x.axis, origem: x.origem, tipo: x.tipo, draft: x.draft, masterEmRevisao: x.rev === true });
    mm.set(motivo, (mm.get(motivo) ?? 0) + x.n); ll.set(x.rede, (ll.get(x.rede) ?? 0) + x.n); ml.set(`${motivo}|${x.rede}`, x.n + (ml.get(`${motivo}|${x.rede}`) ?? 0));
    total += x.n; if (x.draft && x.rede === 'amazon') rascunhosAmazon += x.n;
  }
  return {
    total, encerradas: num(rows<{ n: number }>(enc)[0]?.n ?? 0), liberadasHoje: num(rows<{ lib: number }>(hoje)[0]?.lib ?? 0), resolvidasHoje: num(rows<{ tot: number }>(hoje)[0]?.tot ?? 0),
    porMotivo: [...mm].map(([motivo, n]) => ({ motivo: motivo as Motivo, n })).sort((a, b) => b.n - a.n),
    porLoja: [...ll].map(([rede, n]) => ({ rede, n })).sort((a, b) => b.n - a.n),
    porMotivoLoja: [...ml].map(([k, n]) => { const [motivo, rede] = k.split('|'); return { motivo: motivo as Motivo, rede, n }; }),
    rascunhosAmazon,
  };
}

export interface HistoricoRow { decisionId: string; title: string; label: string; axis: string; value: string; kind: string; via: string | null; decidedAt: string; undoneAt: string | null; liberou: boolean }

export async function historico(dbx: DbT, limit = 50): Promise<HistoricoRow[]> {
  const r = await dbx.execute(sql`
    SELECT id::text AS id, title, value_label, axis, value, kind, decided_via AS via, decided_at::text AS at, undone_at::text AS "undoneAt",
           (prev_status = 'draft' AND value = 'sim') AS liberou
    FROM identity_decisions WHERE decided_by IS NOT NULL AND kind <> 'nao_sei' ORDER BY decided_at DESC LIMIT ${limit}`);
  return rows<{ id: string; title: string; value_label: string | null; axis: string; value: string; kind: string; via: string | null; at: string; undoneAt: string | null; liberou: boolean }>(r)
    .map((x) => ({ decisionId: x.id, title: x.title, label: x.value_label ?? x.value, axis: x.axis, value: x.value, kind: x.kind, via: x.via, decidedAt: x.at, undoneAt: x.undoneAt, liberou: x.liberou === true }));
}

// ------------------------------------------------------------------------------------------------
// Decidir
// ------------------------------------------------------------------------------------------------
export type Acao = 'aprovar' | 'recusar' | 'pular' | 'escolha';
export interface Decisao { ok: boolean; error?: string; already?: boolean; decisionId?: string; liberada?: boolean; masterAprovado?: boolean; recalc?: string[] }

interface OfertaRow { id: string; status: string; title: string; price: number; quarantined: boolean; ext: string | null; mid: string; mname: string; vertical: string; gen: string | null; gate: string | null; manual: string | null; ptype: string | null; image: string | null }

async function carregarOferta(tx: Exec, offerId: string): Promise<OfertaRow | null> {
  const r = rows<Record<string, unknown>>(await tx.execute(sql`
    SELECT o.id::text AS id, o.status::text AS status, o.title, o.current_price_cents AS price, (o.quarantined_at IS NOT NULL) AS quarantined, o.external_ref AS ext,
           m.id::text AS mid, m.name AS mname, m.vertical, m.game_platform_gen::text AS gen, m.attributes->'catalogGate'->>'verdict' AS gate,
           m.attributes->'catalogGate'->>'manual' AS manual, m.product_type::text AS ptype, o.image_url AS image
    FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id WHERE o.id = ${offerId}::uuid FOR UPDATE OF o`))[0];
  return r ? { id: String(r.id), status: String(r.status), title: String(r.title), price: num(r.price), quarantined: r.quarantined === true, ext: (r.ext as string) ?? null, mid: String(r.mid), mname: String(r.mname), vertical: String(r.vertical), gen: (r.gen as string) ?? null, gate: (r.gate as string) ?? null, manual: (r.manual as string) ?? null, ptype: (r.ptype as string) ?? null, image: (r.image as string) ?? null } : null;
}

/** Item de identidade da oferta; cria (molde existente da Amazon) quando o rascunho nao tem nenhum. */
async function garantirItem(tx: Exec, o: OfertaRow): Promise<string | { error: string }> {
  const find = async () => rows<{ id: string; status: string }>(await tx.execute(sql`SELECT id::text AS id, status FROM identity_review_items WHERE offer_id = ${o.id}::uuid AND axis = 'identidade'`))[0];
  let it = await find();
  if (!it) {
    if (!o.ext?.startsWith('amazon-') || o.status !== 'draft') return { error: 'oferta_sem_item' };
    await enfileirarDuvidaAmazon(tx, { offerId: o.id, masterId: o.mid, masterNome: o.mname, vertical: o.vertical, asin: o.ext.slice(7), titulo: o.title, motivo: 'aprovacao-admin: rascunho sem item de fila', fronteira: false, score: 0.5 });
    it = await find();
  }
  return it ? it.id : { error: 'item_nao_criado' };
}

/** Guardas ANTES de promover um rascunho (regras inegociaveis): so novo, sem 2 geracoes, preco lido, sem quarentena, master nao duplicado. */
async function guardaPromocao(o: OfertaRow): Promise<string | null> {
  if (o.quarantined) return 'oferta_em_quarentena';
  if (!(o.price > 0)) return 'sem_preco_lido';
  const f = offerTitleFlags(o.title, o.ptype);
  if (f.condition !== 'new') return f.condition === 'open_box' ? 'open_box_fora' : 'usado_fora';
  if (f.crossGen) return 'duas_geracoes_no_titulo';
  if (o.gate === 'rejected' && o.manual !== 'approved') return 'produto_rejeitado_no_catalogo';
  if (o.gate === 'review' && o.manual !== 'approved' && o.vertical === 'games' && o.gen && o.gen !== 'unknown') {
    // Master que nasceu em revisao: antes de libera-lo, checa duplicata por titulo+plataforma (um jogo, uma media so).
    try {
      const { findExistingMasterProduct } = await import('@/lib/affiliate/dedup');
      const dup = await findExistingMasterProduct(o.mname, o.gen, { productType: o.ptype === 'console' ? 'console' : 'game' });
      if (dup && String(dup.id) !== o.mid) return 'possivel_duplicata_de_outro_produto';
    } catch { return 'verificacao_duplicata_falhou'; } // sem a checagem de duplicata nao libera: um jogo, uma media so
  }
  return null;
}

async function aprovarMaster(tx: Exec, mid: string, decisionId: string, userId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE master_products SET attributes = (attributes - 'catalogGate') || jsonb_build_object(
      'catalogGate', COALESCE(attributes->'catalogGate', '{}'::jsonb) || '{"verdict":"approved","category":"ok","reason":"aprovado_manualmente","manual":"approved"}'::jsonb,
      'aprovacaoHumana', jsonb_build_object('decisionId', ${decisionId}::text, 'por', ${userId}::text, 'em', now()::text, 'gateAnterior', attributes->'catalogGate')),
      updated_at = now()
    WHERE id = ${mid}::uuid`);
}

const CODIGOS = new Set(['promocao_nao_ativou']);
/** Erro ao cliente: so codigos conhecidos; excecao crua de banco nunca sai (fica no log do servidor). */
function erroSeguro(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (!CODIGOS.has(m)) console.error('[aprovacao] falha:', m);
  return CODIGOS.has(m) ? m : 'falha';
}

export async function decidir(dbx: DbT, p: { key: string; acao: Acao; value?: string; userId: string }): Promise<Decisao> {
  const k = parseKey(p.key);
  if (!k) return { ok: false, error: 'pedido_invalido' };
  const out = await dbx.transaction(async (tx0): Promise<Decisao> => {
    const tx = tx0 as unknown as Exec;
    let offerId: string;
    let itemId: string | null = null;
    if (k.tipo === 'item') {
      const it = rows<{ offer_id: string }>(await tx.execute(sql`SELECT offer_id::text FROM identity_review_items WHERE id = ${k.id}::uuid`))[0];
      if (!it) return { ok: false, error: 'item_inexistente' };
      offerId = it.offer_id; itemId = k.id;
    } else offerId = k.id;
    const o = await carregarOferta(tx, offerId);
    if (!o) return { ok: false, error: 'oferta_inexistente' };
    if (!itemId) {
      const g = await garantirItem(tx, o);
      if (typeof g !== 'string') return { ok: false, error: g.error };
      itemId = g;
    }
    const item = rows<{ axis: string; options: QueueOption[]; status: string; understood: Record<string, unknown> | null }>(await tx.execute(sql`SELECT axis, options, status, understood FROM identity_review_items WHERE id = ${itemId}::uuid`))[0];
    if (!item) return { ok: false, error: 'item_inexistente' };
    if (item.status !== 'pending') return { ok: true, already: true };
    let value: string | null;
    if (p.acao === 'pular') value = 'nao_sei';
    else if (p.acao === 'aprovar') value = valorAprovar(item.axis, item.options);
    else if (p.acao === 'recusar') value = valorRecusar(item.axis, item.options);
    else value = typeof p.value === 'string' ? p.value : null;
    if (!value) return { ok: false, error: 'escolha_uma_opcao' };
    if (!item.options.some((x) => x.value === value)) return { ok: false, error: 'opcao_invalida' };
    const promove = o.status === 'draft' && value === 'sim';
    if (promove) {
      if (item.understood?.origem !== ORIGEM_DUVIDA_AMAZON && !(item.understood?.origem === 'shopee_cobertura')) return { ok: false, error: 'rascunho_fora_do_caminho_de_promocao' };
      const bloqueio = await guardaPromocao(o);
      if (bloqueio) return { ok: false, error: bloqueio };
    }
    const res = await applyInTx(tx, { itemId, value, userId: p.userId });
    if (!res.ok) return { ok: false, error: res.error };
    if (res.already) return { ok: true, already: true, decisionId: res.decisionId };
    let masterAprovado = false;
    if (promove) {
      const st = rows<{ status: string }>(await tx.execute(sql`SELECT status::text AS status FROM affiliate_offers WHERE id = ${o.id}::uuid`))[0]?.status;
      if (st !== 'active') throw new Error('promocao_nao_ativou'); // desfaz a transacao inteira: nunca decisao gravada sem efeito
      if (o.gate === 'review' && o.manual !== 'approved') { await aprovarMaster(tx, o.mid, res.decisionId!, p.userId); masterAprovado = true; }
    }
    return { ok: true, decisionId: res.decisionId, liberada: promove, masterAprovado, recalc: res.recalc };
  }).catch((e) => ({ ok: false, error: erroSeguro(e) }) as Decisao);
  if (out.ok && !out.already && out.recalc?.length) await drainRecalc(dbx).catch((e) => console.error('[aprovacao] recalculo adiado:', e instanceof Error ? e.message : e, (e as { cause?: { message?: string } })?.cause?.message ?? ''));
  return out;
}

/** Desfaz: motor existente + restaura o gate do master e o published_at que a aprovacao mexeu. */
export async function desfazer(dbx: DbT, p: { decisionId: string; userId: string }): Promise<Decisao> {
  const out = await dbx.transaction(async (tx0): Promise<Decisao> => {
    const tx = tx0 as unknown as Exec;
    const d = rows<{ offer_id: string; from_master_id: string | null; prev_status: string | null; decided_at: string }>(await tx.execute(sql`
      SELECT offer_id::text, from_master_id::text, prev_status, decided_at::text FROM identity_decisions WHERE id = ${p.decisionId}::uuid`))[0];
    if (!d) return { ok: false, error: 'decisao_inexistente' };
    const res = await undoInTx(tx, { decisionId: p.decisionId, userId: p.userId });
    if (!res.ok) return { ok: false, error: res.error };
    if (res.already) return { ok: true, already: true };
    if (d.from_master_id) {
      await tx.execute(sql`
        UPDATE master_products SET attributes = CASE WHEN attributes->'aprovacaoHumana'->'gateAnterior' IS NULL OR attributes->'aprovacaoHumana'->>'gateAnterior' = 'null'
              THEN (attributes - 'catalogGate' - 'aprovacaoHumana')
              ELSE (attributes - 'aprovacaoHumana') || jsonb_build_object('catalogGate', attributes->'aprovacaoHumana'->'gateAnterior') END, updated_at = now()
        WHERE id = ${d.from_master_id}::uuid AND attributes->'aprovacaoHumana'->>'decisionId' = ${p.decisionId}`);
    }
    if (d.prev_status === 'draft') {
      await tx.execute(sql`UPDATE affiliate_offers SET published_at = NULL WHERE id = ${d.offer_id}::uuid AND status = 'draft' AND published_at >= ${d.decided_at}::timestamptz - interval '1 minute'`);
    }
    return { ok: true, decisionId: p.decisionId, recalc: res.recalc };
  }).catch((e) => ({ ok: false, error: erroSeguro(e) }) as Decisao);
  if (out.ok && !out.already) await drainRecalc(dbx).catch((e) => console.error('[aprovacao] recalculo adiado:', e instanceof Error ? e.message : e, (e as { cause?: { message?: string } })?.cause?.message ?? ''));
  return out;
}

// ------------------------------------------------------------------------------------------------
// Lote dos OBVIOS (criterio existente: obvio.ts). Pre-visualizacao obrigatoria; o servidor recalcula no segundo clique.
// ------------------------------------------------------------------------------------------------
export const LOTE_MAX = 100;
export interface PreviaLote { total: number; grupos: Array<{ criterio: string; n: number; descricao: string; amostra: Array<{ itemId: string; title: string; master: string | null; motivo: string }> }>; ids: string[] }

const DESC_CRITERIO: Record<string, string> = {
  evidencia_api: 'A API oficial da loja prova a resposta',
  gtin_igual: 'O código de barras (GTIN) do anúncio é o mesmo do produto',
  marca_modelo_coerentes: 'Marca e modelo informados pela API da loja batem com o produto',
  titulo_igual_ao_master: 'O título é igual ao do produto e o preço está na faixa normal',
  regra_do_dono: 'Mesmo título que você já decidiu antes',
};

export async function previaObvios(dbx: DbT): Promise<PreviaLote> {
  const { picks } = await selectObvious(dbx as unknown as Exec, 1500);
  const by = new Map<string, typeof picks>();
  for (const x of picks) (by.get(x.criterio) ?? by.set(x.criterio, []).get(x.criterio)!).push(x);
  return {
    total: picks.length,
    grupos: [...by].map(([criterio, l]) => ({ criterio, n: l.length, descricao: DESC_CRITERIO[criterio] ?? criterio, amostra: l.slice(0, 8).map((x) => ({ itemId: x.itemId, title: x.title, master: x.masterName, motivo: x.motivo })) })).sort((a, b) => b.n - a.n),
    ids: picks.slice(0, LOTE_MAX).map((x) => x.itemId),
  };
}

/** Aplica so os ids pre-visualizados que AINDA sao obvios agora (recalculado no servidor). Uma transacao curta por item. */
export async function aplicarObvios(dbx: DbT, p: { ids: string[]; userId: string }): Promise<{ ok: boolean; aplicados: number; mudaram: number; erros: number }> {
  const ids = new Set(p.ids.filter((i) => parseKey(`item:${i}`)).slice(0, LOTE_MAX));
  const { picks } = await selectObvious(dbx as unknown as Exec, 1500);
  const alvo = picks.filter((x) => ids.has(x.itemId));
  let aplicados = 0; let erros = 0;
  for (const k of alvo) {
    try {
      const res = await dbx.transaction((tx) => applyInTx(tx as unknown as Exec, k.ruleSourceId
        ? { itemId: k.itemId, value: k.value, userId: p.userId, ruleSourceId: k.ruleSourceId }
        : { itemId: k.itemId, value: k.value, userId: p.userId, via: OBVIO_VIA, reason: `lote aprovado na /admin/aprovacao (${k.criterio}): ${k.motivo}` }));
      if (res.ok && !res.already) aplicados++; else if (!res.ok) erros++;
    } catch (e) { erros++; console.error('[aprovacao] lote falhou num item:', e instanceof Error ? e.message : e); }
    await new Promise((r) => setTimeout(r, 40));
  }
  if (aplicados > 0) await drainRecalc(dbx).catch((e) => console.error('[aprovacao] recalculo adiado:', e instanceof Error ? e.message : e, (e as { cause?: { message?: string } })?.cause?.message ?? ''));
  return { ok: true, aplicados, mudaram: ids.size - alvo.length, erros };
}
