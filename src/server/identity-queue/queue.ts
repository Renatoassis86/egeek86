import 'server-only';
import { sql } from 'drizzle-orm';
import type { db as Db } from '@/lib/db';
import { slugify } from '@/lib/slugify';
import {
  axisLearnsByTitle,
  consoleCandidate,
  dispersionCandidates,
  identifyConsole,
  titlesSimilar,
  type ConsoleMasterRef,
  type ConsoleOverrides,
  type QueueAxis,
  type QueueCandidate,
  type QueueOption,
} from '@/lib/identity-queue/model';

/**
 * Motor da FILA DE CLASSIFICACAO (dono, 2026-11-11). Todas as funcoes recebem um executor (`db` ou uma transacao), para o teste rodar dentro de
 * transacao revertida. Nada aqui apaga dado: mover oferta, rascunho e quarentena sao reversiveis e cada decisao guarda o estado anterior.
 */
export type Exec = Pick<typeof Db, 'execute'>;

const SNOOZE_DAYS = 7;
const rows = <T>(r: unknown) => r as unknown as T[];
const num = (v: unknown) => Number(v);

export interface Rule { id: string; vertical: string; axis: string; value: string; titleNorm: string; title: string; fromMasterId: string | null }

/** Regras aprendidas (decisoes do dono ainda validas), a mais recente primeiro. */
export async function loadRules(exec: Exec): Promise<Rule[]> {
  const r = await exec.execute(sql`
    SELECT id::text, vertical, axis, value, title_norm AS "titleNorm", title, from_master_id::text AS "fromMasterId"
    FROM identity_decisions
    WHERE is_rule AND undone_at IS NULL AND kind IN ('escolha','nao_e_este')
    ORDER BY decided_at DESC`);
  return rows<Rule>(r);
}

export async function countRulesLearned(exec: Exec): Promise<number> {
  const r = await exec.execute(sql`
    SELECT count(*)::int AS n FROM (SELECT DISTINCT vertical, axis, title_norm FROM identity_decisions
      WHERE is_rule AND undone_at IS NULL AND kind IN ('escolha','nao_e_este')) x`);
  return num(rows<{ n: number }>(r)[0]?.n ?? 0);
}

/** Regra que resolve o candidato sozinha: titulo igual/muito parecido ja decidido pelo dono no mesmo eixo (e, na identidade, no mesmo master). */
export function findRule(rules: Rule[], c: Pick<QueueCandidate, 'vertical' | 'axis' | 'title' | 'titleNorm' | 'masterId' | 'options'>): Rule | null {
  if (!axisLearnsByTitle(c.axis)) return null;
  for (const r of rules) {
    if (r.vertical !== c.vertical || r.axis !== c.axis) continue;
    if (c.axis === 'identidade' && r.fromMasterId !== c.masterId) continue;
    if (!c.options.some((o) => o.value === r.value)) continue;
    if (r.titleNorm === c.titleNorm || titlesSimilar(r.title, c.title)) return r;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// Geracao da fila
// ------------------------------------------------------------------------------------------------
export interface GenerateStats { candidatos: number; criados: number; autoResolvidos: number; jaExistentes: number; porFonte: Record<string, number> }

async function insertItem(exec: Exec, c: QueueCandidate): Promise<string | null> {
  const r = await exec.execute(sql`
    INSERT INTO identity_review_items (offer_id, master_id, vertical, axis, source, reason, understood, options, title, title_norm)
    VALUES (${c.offerId}::uuid, ${c.masterId}::uuid, ${c.vertical}, ${c.axis}, ${c.source}, ${c.reason}, ${JSON.stringify(c.understood)}::jsonb,
            ${JSON.stringify(c.options)}::jsonb, ${c.title}, ${c.titleNorm})
    ON CONFLICT (offer_id, axis) DO NOTHING
    RETURNING id::text AS id`);
  return rows<{ id: string }>(r)[0]?.id ?? null;
}

/** Candidatos a partir do banco (somente SELECT). Console: so masters de console; dispersao e preco: todos os departamentos. */
export async function collectCandidates(exec: Exec): Promise<QueueCandidate[]> {
  const out: QueueCandidate[] = [];
  const consoleMasters = rows<ConsoleMasterRef>(
    await exec.execute(sql`
      SELECT id::text AS id, name, attributes->>'identityKey' AS "identityKey" FROM master_products
      WHERE vertical = 'games' AND product_type = 'console' AND (attributes->>'mergedInto') IS NULL`)
  );
  const consoleIds = consoleMasters.map((m) => m.id);
  if (consoleIds.length) {
    const offers = rows<{ id: string; title: string; mid: string }>(
      await exec.execute(sql`
        SELECT id::text AS id, title, master_product_id::text AS mid FROM affiliate_offers
        WHERE status = 'active' AND quarantined_at IS NULL AND current_price_cents > 0
          AND master_product_id = ANY(${sql.raw(`ARRAY[${consoleIds.map((i) => `'${i.replace(/[^0-9a-f-]/gi, '')}'`).join(',')}]::uuid[]`)})`)
    );
    const ans = rows<{ offer_id: string; axis: string; value: string }>(
      await exec.execute(sql`
        SELECT offer_id::text AS offer_id, axis, value FROM identity_decisions
        WHERE undone_at IS NULL AND kind IN ('escolha','auto_regra') AND axis IN ('modelo','midia','armazenamento')`)
    );
    const answered = new Map<string, ConsoleOverrides>();
    for (const a of ans) {
      const o = answered.get(a.offer_id) ?? {};
      (o as Record<string, string>)[a.axis] = a.value;
      answered.set(a.offer_id, o);
    }
    for (const o of offers) {
      const c = consoleCandidate({ id: o.id, title: o.title, masterId: o.mid }, consoleMasters, answered.get(o.id) ?? {});
      if (c) out.push(c);
    }
  }
  const all = rows<{ id: string; mid: string; title: string; price: string; mname: string; vertical: string }>(
    await exec.execute(sql`
      SELECT o.id::text AS id, o.master_product_id::text AS mid, o.title, o.current_price_cents::text AS price, m.name AS mname, m.vertical
      FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0 AND (m.attributes->>'mergedInto') IS NULL
        AND o.master_product_id IN (
          SELECT master_product_id FROM affiliate_offers WHERE status = 'active' AND quarantined_at IS NULL AND current_price_cents > 0
          GROUP BY master_product_id HAVING count(*) >= 3)`)
  );
  const byMaster = new Map<string, typeof all>();
  for (const r of all) (byMaster.get(r.mid) ?? byMaster.set(r.mid, []).get(r.mid)!).push(r);
  for (const [mid, offs] of byMaster) {
    out.push(...dispersionCandidates({ id: mid, name: offs[0].mname, vertical: offs[0].vertical }, offs.map((o) => ({ id: o.id, price: num(o.price), title: o.title }))));
  }
  return out;
}

/** Grava a fila a partir dos candidatos. Idempotente (1 item por oferta+eixo). Titulo com regra aprendida e resolvido sozinho. */
export async function generateQueue(exec: Exec, candidates?: QueueCandidate[]): Promise<GenerateStats> {
  const cands = candidates ?? (await collectCandidates(exec));
  const rules = await loadRules(exec);
  const stats: GenerateStats = { candidatos: cands.length, criados: 0, autoResolvidos: 0, jaExistentes: 0, porFonte: {} };
  for (const c of cands) {
    const id = await insertItem(exec, c);
    if (!id) { stats.jaExistentes++; continue; }
    stats.criados++;
    stats.porFonte[c.source] = (stats.porFonte[c.source] ?? 0) + 1;
    const rule = findRule(rules, c);
    if (rule) {
      const res = await applyInTx(exec, { itemId: id, value: rule.value, userId: null, ruleSourceId: rule.id });
      if (res.ok && !res.already) stats.autoResolvidos++;
    }
  }
  return stats;
}

// ------------------------------------------------------------------------------------------------
// Leitura para o popup
// ------------------------------------------------------------------------------------------------
export interface QueueCard {
  id: string; offerId: string; axis: QueueAxis; source: string; reason: string; understood: Record<string, unknown>; options: QueueOption[];
  title: string; vertical: string; masterName: string | null; priceCents: number | null; imageUrl: string | null; store: string | null; network: string | null;
}

const CARD_SELECT = sql`
  SELECT i.id::text AS id, i.offer_id::text AS "offerId", i.axis, i.source, i.reason, i.understood, i.options, i.title, i.vertical,
         m.name AS "masterName", o.current_price_cents::text AS price, o.image_url AS "imageUrl",
         COALESCE(o.store_name, '') AS store, n.name AS network
  FROM identity_review_items i
  LEFT JOIN affiliate_offers o ON o.id = i.offer_id
  LEFT JOIN master_products m ON m.id = o.master_product_id
  LEFT JOIN affiliate_networks n ON n.id = o.network_id`;

function toCard(r: Record<string, unknown>): QueueCard {
  return {
    id: String(r.id), offerId: String(r.offerId), axis: r.axis as QueueAxis, source: String(r.source), reason: String(r.reason),
    understood: (r.understood ?? {}) as Record<string, unknown>, options: (r.options ?? []) as QueueOption[], title: String(r.title), vertical: String(r.vertical),
    masterName: (r.masterName as string) ?? null, priceCents: r.price == null ? null : num(r.price), imageUrl: (r.imageUrl as string) || null,
    store: (r.store as string) || null, network: (r.network as string) ?? null,
  };
}

export async function getPendingCards(exec: Exec, limit = 50): Promise<QueueCard[]> {
  const r = await exec.execute(sql`${CARD_SELECT}
    WHERE i.status = 'pending' AND (i.snoozed_until IS NULL OR i.snoozed_until < now())
    ORDER BY (i.source = 'preco') DESC, i.created_at, i.id LIMIT ${limit}`);
  return rows<Record<string, unknown>>(r).map(toCard);
}

export async function countPending(exec: Exec): Promise<number> {
  const r = await exec.execute(sql`SELECT count(*)::int AS n FROM identity_review_items WHERE status = 'pending' AND (snoozed_until IS NULL OR snoozed_until < now())`);
  return num(rows<{ n: number }>(r)[0]?.n ?? 0);
}

export async function getCard(exec: Exec, itemId: string): Promise<QueueCard | null> {
  const r = await exec.execute(sql`${CARD_SELECT} WHERE i.id = ${itemId}::uuid`);
  const x = rows<Record<string, unknown>>(r)[0];
  return x ? toCard(x) : null;
}

// ------------------------------------------------------------------------------------------------
// Aplicar decisao
// ------------------------------------------------------------------------------------------------
export interface ApplyResult { ok: boolean; already?: boolean; error?: string; decisionId?: string; recalc?: string[] }

/** Acha (ou cria, depois de checar duplicata) o master de console com a identidade escolhida. */
export async function ensureConsoleMaster(exec: Exec, create: { name: string; key: string; platform: string }): Promise<{ id: string; created: boolean }> {
  const ex = rows<{ id: string }>(await exec.execute(sql`
    SELECT id::text AS id FROM master_products
    WHERE vertical = 'games' AND product_type = 'console' AND (attributes->>'mergedInto') IS NULL AND attributes->>'identityKey' = ${create.key}
    ORDER BY created_at LIMIT 1`))[0];
  if (ex) return { id: ex.id, created: false };
  // Master de console ja existente cuja identidade (lida do nome) e a mesma chave: tambem e o mesmo produto.
  const named = rows<{ id: string; name: string }>(await exec.execute(sql`
    SELECT id::text AS id, name FROM master_products
    WHERE vertical = 'games' AND product_type = 'console' AND (attributes->>'mergedInto') IS NULL AND game_platform_gen::text = ${create.platform}`));
  for (const m of named) {
    const mi = identifyConsole(m.name);
    if (mi.scope === 'in' && mi.condition === 'new' && mi.key === create.key) return { id: m.id, created: false };
  }
  // Checagem de duplicata por titulo+plataforma normalizados (regra inegociavel), aceita so se a chave de identidade bater.
  try {
    const { findExistingMasterProduct } = await import('@/lib/affiliate/dedup');
    const dup = await findExistingMasterProduct(create.name, create.platform, { productType: 'console' });
    if (dup) {
      const di = identifyConsole(String(dup.name));
      if (di.scope === 'in' && di.key === create.key) return { id: String(dup.id), created: false };
    }
  } catch {
    /* sem leitura de duplicata extra: a checagem por chave acima ja vale */
  }
  let slug = slugify(create.name);
  const taken = rows<{ n: number }>(await exec.execute(sql`SELECT count(*)::int AS n FROM master_products WHERE slug = ${slug}`))[0];
  if (num(taken?.n) > 0) slug = `${slug}-${slugify(create.key).slice(0, 24)}`;
  const ins = rows<{ id: string }>(await exec.execute(sql`
    INSERT INTO master_products (name, slug, product_type, game_platform_gen, vertical, attributes, classified_at)
    VALUES (${create.name}, ${slug}, 'console', ${create.platform}::game_platform_gen, 'games',
            ${JSON.stringify({ identityKey: create.key, createdBy: 'fila-classificacao' })}::jsonb, now())
    RETURNING id::text AS id`))[0];
  return { id: ins.id, created: true };
}

interface ItemRow { id: string; offer_id: string; master_id: string | null; vertical: string; axis: QueueAxis; title: string; title_norm: string; options: QueueOption[]; status: string; decision_id: string | null }

/** Aplica a resposta a um item da fila DENTRO de uma transacao do chamador. Idempotente: item ja resolvido devolve `already`. */
export async function applyInTx(tx: Exec, p: { itemId: string; value: string; userId: string | null; ruleSourceId?: string | null }): Promise<ApplyResult> {
  const item = rows<ItemRow>(await tx.execute(sql`SELECT id::text AS id, offer_id::text AS offer_id, master_id::text AS master_id, vertical, axis, title, title_norm, options, status, decision_id::text AS decision_id
    FROM identity_review_items WHERE id = ${p.itemId}::uuid FOR UPDATE`))[0];
  if (!item) return { ok: false, error: 'item_inexistente' };
  if (item.status !== 'pending') return { ok: true, already: true, decisionId: item.decision_id ?? undefined };
  const opt = item.options.find((o) => o.value === p.value);
  if (!opt) return { ok: false, error: 'opcao_invalida' };
  const offer = rows<{ id: string; master_product_id: string; status: string; quarantined_at: string | null }>(await tx.execute(sql`
    SELECT id::text AS id, master_product_id::text AS master_product_id, status::text AS status, quarantined_at::text AS quarantined_at
    FROM affiliate_offers WHERE id = ${item.offer_id}::uuid FOR UPDATE`))[0];
  if (!offer) return { ok: false, error: 'oferta_inexistente' };

  const fromMaster = offer.master_product_id;
  let toMaster: string | null = null;
  let createdMaster: string | null = null;
  const recalc = new Set<string>();
  let prevStatus: string | null = null;
  let prevQuarantine: string | null = null;
  let kind: 'escolha' | 'nao_sei' | 'nao_e_este' | 'auto_regra' = p.ruleSourceId ? 'auto_regra' : opt.kind;

  if (opt.kind === 'nao_sei') {
    // Nada muda na oferta; a pergunta volta depois.
  } else if (opt.kind === 'nao_e_este') {
    prevStatus = offer.status;
    await tx.execute(sql`UPDATE affiliate_offers SET status = 'draft', updated_at = now() WHERE id = ${offer.id}::uuid`);
    recalc.add(fromMaster);
  } else if (item.axis === 'preco') {
    if (opt.value === 'preco_errado') {
      prevQuarantine = offer.quarantined_at;
      await tx.execute(sql`UPDATE affiliate_offers SET quarantined_at = COALESCE(quarantined_at, now()), updated_at = now() WHERE id = ${offer.id}::uuid`);
      recalc.add(fromMaster);
    }
  } else if (item.axis === 'identidade') {
    // 'sim': confirma que a oferta pertence ao master; nada se move.
  } else {
    // Eixo de console: leva a oferta para o master da identidade escolhida.
    let target = opt.targetMasterId ?? null;
    if (target) {
      const ok = rows<{ id: string }>(await tx.execute(sql`SELECT id::text AS id FROM master_products WHERE id = ${target}::uuid AND (attributes->>'mergedInto') IS NULL`))[0];
      if (!ok) target = null;
    }
    if (!target && opt.create) {
      const m = await ensureConsoleMaster(tx, opt.create);
      target = m.id;
      if (m.created) createdMaster = m.id;
    }
    if (!target) return { ok: false, error: 'sem_master_de_destino' };
    toMaster = target;
    if (target !== fromMaster) {
      await tx.execute(sql`UPDATE affiliate_offers SET master_product_id = ${target}::uuid, updated_at = now() WHERE id = ${offer.id}::uuid AND master_product_id = ${fromMaster}::uuid`);
      await tx.execute(sql`UPDATE price_daily_offer SET master_product_id = ${target}::uuid WHERE offer_id = ${offer.id}::uuid AND master_product_id <> ${target}::uuid`);
      recalc.add(fromMaster);
      recalc.add(target);
    }
  }

  const isRule = kind !== 'nao_sei' && kind !== 'auto_regra' && axisLearnsByTitle(item.axis);
  const recalcArr = [...recalc];
  const dec = rows<{ id: string }>(await tx.execute(sql`
    INSERT INTO identity_decisions (item_id, offer_id, vertical, axis, value, value_label, kind, title, title_norm, from_master_id, to_master_id, created_master_id,
      prev_status, prev_quarantined_at, decided_by, rule_source_id, is_rule, recalc_masters)
    VALUES (${item.id}::uuid, ${offer.id}::uuid, ${item.vertical}, ${item.axis}, ${opt.value}, ${opt.label}, ${kind}, ${item.title}, ${item.title_norm},
      ${fromMaster}::uuid, ${toMaster}::uuid, ${createdMaster}::uuid, ${prevStatus}, ${prevQuarantine}::timestamptz, ${p.userId}::uuid, ${p.ruleSourceId ?? null}::uuid, ${isRule},
      ${sql.raw(`ARRAY[${recalcArr.map((i) => `'${i.replace(/[^0-9a-f-]/gi, '')}'`).join(',')}]::uuid[]`)})
    RETURNING id::text AS id`))[0];

  if (opt.kind === 'nao_sei') {
    await tx.execute(sql`UPDATE identity_review_items SET decision_id = ${dec.id}::uuid, snoozed_until = now() + ${SNOOZE_DAYS} * interval '1 day' WHERE id = ${item.id}::uuid`);
  } else {
    await tx.execute(sql`UPDATE identity_review_items SET status = ${p.userId ? 'resolved' : 'auto_resolved'}, decision_id = ${dec.id}::uuid, resolved_at = now(), snoozed_until = NULL WHERE id = ${item.id}::uuid`);
  }
  return { ok: true, decisionId: dec.id, recalc: recalcArr };
}

/** Desfaz uma decisao: devolve a oferta ao estado anterior, desliga a regra e reabre o item. Idempotente. */
export async function undoInTx(tx: Exec, p: { decisionId: string; userId: string | null }): Promise<ApplyResult> {
  const d = rows<{ id: string; item_id: string | null; offer_id: string; kind: string; axis: string; value: string; from_master_id: string | null; to_master_id: string | null; prev_status: string | null; prev_quarantined_at: string | null; undone_at: string | null; recalc_masters: string[] | string }>(
    await tx.execute(sql`SELECT id::text AS id, item_id::text AS item_id, offer_id::text AS offer_id, kind, axis, value, from_master_id::text AS from_master_id, to_master_id::text AS to_master_id,
      prev_status, prev_quarantined_at::text AS prev_quarantined_at, undone_at::text AS undone_at, recalc_masters::text[] AS recalc_masters
      FROM identity_decisions WHERE id = ${p.decisionId}::uuid FOR UPDATE`)
  )[0];
  if (!d) return { ok: false, error: 'decisao_inexistente' };
  if (d.undone_at) return { ok: true, already: true, decisionId: d.id };
  if (d.to_master_id && d.from_master_id && d.to_master_id !== d.from_master_id) {
    await tx.execute(sql`UPDATE affiliate_offers SET master_product_id = ${d.from_master_id}::uuid, updated_at = now() WHERE id = ${d.offer_id}::uuid AND master_product_id = ${d.to_master_id}::uuid`);
    await tx.execute(sql`UPDATE price_daily_offer SET master_product_id = ${d.from_master_id}::uuid WHERE offer_id = ${d.offer_id}::uuid AND master_product_id <> ${d.from_master_id}::uuid`);
  }
  if (d.prev_status) {
    await tx.execute(sql`UPDATE affiliate_offers SET status = ${d.prev_status}::affiliate_offer_status, updated_at = now() WHERE id = ${d.offer_id}::uuid AND status = 'draft'`);
  }
  if (d.axis === 'preco' && d.value === 'preco_errado') {
    // Devolve a quarentena ao estado anterior (NULL se a oferta nao estava em quarentena).
    await tx.execute(sql`UPDATE affiliate_offers SET quarantined_at = ${d.prev_quarantined_at}::timestamptz, updated_at = now() WHERE id = ${d.offer_id}::uuid`);
  }
  await tx.execute(sql`UPDATE identity_decisions SET undone_at = now(), undone_by = ${p.userId}::uuid, recalc_done_at = NULL,
    recalc_masters = ARRAY(SELECT DISTINCT unnest(recalc_masters || ARRAY[from_master_id, to_master_id]) ) WHERE id = ${d.id}::uuid`);
  if (d.item_id) {
    await tx.execute(sql`UPDATE identity_review_items SET status = 'pending', decision_id = NULL, resolved_at = NULL, snoozed_until = NULL WHERE id = ${d.item_id}::uuid`);
  }
  return { ok: true, decisionId: d.id };
}

// ------------------------------------------------------------------------------------------------
// Recalculo das metricas dos masters tocados (codigo existente: price-daily / daily-state, como scripts/auditar-consoles.ts)
// ------------------------------------------------------------------------------------------------
export async function recalcMasters(exec: Exec, masterIds: string[], now = new Date()): Promise<number> {
  const ids = [...new Set(masterIds.filter(Boolean))];
  if (!ids.length) return 0;
  const { PRICE_DAILY_REGIME_START, spDay, reconstructMinEvents } = await import('@/lib/pricing/daily-state');
  const pd = await import('@/server/pricing/price-daily');
  const today = spDay(now);
  const list = sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
  await exec.execute(sql`DELETE FROM price_daily_state WHERE master_product_id IN (${list}) AND day >= ${PRICE_DAILY_REGIME_START}::date AND quality <> 'legacy'`);
  const { rows: st } = await pd.computeStatesForBatch(exec, ids, PRICE_DAILY_REGIME_START, today, now);
  await pd.upsertStates(exec, st);
  await exec.execute(sql`DELETE FROM price_min_events WHERE master_product_id IN (${list}) AND source = 'reconstructed'`);
  const fromAt = new Date(`${PRICE_DAILY_REGIME_START}T03:00:00Z`);
  const recon = await pd.loadReconOffers(exec, ids, fromAt.toISOString());
  for (const [pid, offs] of recon) await pd.insertEvents(exec, pid, reconstructMinEvents(offs, fromAt), 'reconstructed');
  return ids.length;
}

/** Fila de recalculo: decisoes com masters pendentes de recalculo. Marca como feito ao terminar. */
export async function drainRecalc(dbx: typeof Db, limit = 20): Promise<{ decisoes: number; masters: number }> {
  const pend = rows<{ id: string; m: string[] }>(await dbx.execute(sql`
    SELECT id::text AS id, recalc_masters::text[] AS m FROM identity_decisions
    WHERE recalc_done_at IS NULL AND cardinality(recalc_masters) > 0 ORDER BY decided_at LIMIT ${limit}`));
  if (!pend.length) return { decisoes: 0, masters: 0 };
  const masters = [...new Set(pend.flatMap((p) => (Array.isArray(p.m) ? p.m : String(p.m).replace(/[{}]/g, '').split(',').filter(Boolean))))];
  await dbx.transaction(async (tx) => {
    await recalcMasters(tx as unknown as Exec, masters);
    const idl = sql.join(pend.map((p) => sql`${p.id}::uuid`), sql`, `);
    await tx.execute(sql`UPDATE identity_decisions SET recalc_done_at = now() WHERE id IN (${idl})`);
  });
  return { decisoes: pend.length, masters: masters.length };
}
