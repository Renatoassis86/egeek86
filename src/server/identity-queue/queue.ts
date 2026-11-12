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
import type { MlEvidence } from '@/lib/identity-queue/api-evidence';
import { judgeObvio, OBVIO_VIA, type ObvioCriterio } from '@/lib/identity-queue/obvio';

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
export async function generateQueue(exec: Exec, candidates?: QueueCandidate[], opts: { deadlineAt?: number } = {}): Promise<GenerateStats & { parcial?: boolean }> {
  const cands = candidates ?? (await collectCandidates(exec));
  const rules = await loadRules(exec);
  const stats: GenerateStats & { parcial?: boolean } = { candidatos: cands.length, criados: 0, autoResolvidos: 0, jaExistentes: 0, porFonte: {} };
  for (const c of cands) {
    // Limite de tempo (cron): para limpo; o que faltou entra na proxima rodada (insercao idempotente por oferta+eixo).
    if (opts.deadlineAt && Date.now() > opts.deadlineAt) { stats.parcial = true; break; }
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
  /** Evidencia da API oficial da loja (R4; migration 0043). null = nao consultada ou migration ainda nao aplicada. */
  evidence?: MlEvidence | null;
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

let evidenceColumn = false;
/** A migration 0043 (colunas de evidencia) esta aplicada? Consulta ao catalogo (nao quebra transacao). Cacheia so o "sim". */
export async function hasEvidenceColumns(exec: Exec): Promise<boolean> {
  if (evidenceColumn) return true;
  const r = rows<{ n: number }>(await exec.execute(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND ((table_name = 'identity_review_items' AND column_name IN ('api_evidence', 'api_checked_at')) OR (table_name = 'identity_decisions' AND column_name = 'decided_via'))`));
  evidenceColumn = num(r[0]?.n) === 3;
  return evidenceColumn;
}

/** Anexa a evidencia da API aos cartoes (leitura separada: o popup continua igual antes da 0043). */
async function attachEvidence(exec: Exec, cards: QueueCard[]): Promise<QueueCard[]> {
  if (!cards.length || !(await hasEvidenceColumns(exec))) return cards;
  const ids = cards.map((c) => c.id.replace(/[^0-9a-f-]/gi, ''));
  const r = rows<{ id: string; ev: MlEvidence | null }>(await exec.execute(sql`
    SELECT id::text AS id, api_evidence AS ev FROM identity_review_items WHERE api_evidence IS NOT NULL
      AND id = ANY(${sql.raw(`ARRAY[${ids.map((i) => `'${i}'`).join(',')}]::uuid[]`)})`));
  const byId = new Map(r.map((x) => [x.id, x.ev]));
  return cards.map((c) => ({ ...c, evidence: byId.get(c.id) ?? null }));
}

export async function getPendingCards(exec: Exec, limit = 50): Promise<QueueCard[]> {
  const r = await exec.execute(sql`${CARD_SELECT}
    WHERE i.status = 'pending' AND (i.snoozed_until IS NULL OR i.snoozed_until < now())
    ORDER BY (i.source = 'preco') DESC, i.created_at, i.id LIMIT ${limit}`);
  return attachEvidence(exec, rows<Record<string, unknown>>(r).map(toCard));
}

export async function countPending(exec: Exec): Promise<number> {
  const r = await exec.execute(sql`SELECT count(*)::int AS n FROM identity_review_items WHERE status = 'pending' AND (snoozed_until IS NULL OR snoozed_until < now())`);
  return num(rows<{ n: number }>(r)[0]?.n ?? 0);
}

export async function getCard(exec: Exec, itemId: string): Promise<QueueCard | null> {
  const r = await exec.execute(sql`${CARD_SELECT} WHERE i.id = ${itemId}::uuid`);
  const x = rows<Record<string, unknown>>(r)[0];
  return x ? (await attachEvidence(exec, [toCard(x)]))[0] : null;
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
  if (ex) {
    // Master arquivado por um desfazer anterior (ficou vazio): volta a valer quando a identidade e escolhida de novo.
    await exec.execute(sql`UPDATE master_products SET attributes = attributes - 'archived' - 'archivedAt' - 'archivedBy', updated_at = now()
      WHERE id = ${ex.id}::uuid AND attributes->>'archivedBy' = 'fila-classificacao-desfazer'`);
    return { id: ex.id, created: false };
  }
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

interface ItemRow { id: string; offer_id: string; master_id: string | null; vertical: string; axis: QueueAxis; title: string; title_norm: string; options: QueueOption[]; status: string; decision_id: string | null; understood: Record<string, unknown> | null }

/** Aplica a resposta a um item da fila DENTRO de uma transacao do chamador. Idempotente: item ja resolvido devolve `already`. */
export async function applyInTx(tx: Exec, p: { itemId: string; value: string; userId: string | null; ruleSourceId?: string | null; via?: 'api_oficial' | 'auto_obvio'; reason?: string }): Promise<ApplyResult> {
  const item = rows<ItemRow>(await tx.execute(sql`SELECT id::text AS id, offer_id::text AS offer_id, master_id::text AS master_id, vertical, axis, title, title_norm, options, status, decision_id::text AS decision_id, understood
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
  // Decisao pela prova da API oficial (R4): kind 'auto_regra' (conta como resposta dada, mas NUNCA vira regra por titulo: is_rule = false).
  let kind: 'escolha' | 'nao_sei' | 'nao_e_este' | 'auto_regra' = p.ruleSourceId || p.via ? 'auto_regra' : opt.kind;

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
    // 'sim': confirma que a oferta pertence ao master; nada se move. Exceção: oferta Shopee nascida de dúvida de cobertura
    // (rascunho criado por shopee-fila.ts) é ATIVADA aqui; o status anterior fica na decisão, então desfazer a devolve a rascunho.
    // Idem a Amazon (rascunho de amazon-fila.ts, origem 'amazon_cobertura'): "sim" ativa, desfazer devolve a rascunho.
    if (opt.value === 'sim' && offer.status === 'draft' && (item.understood?.origem === 'shopee_cobertura' || item.understood?.origem === 'amazon_cobertura')) {
      prevStatus = offer.status;
      await tx.execute(sql`UPDATE affiliate_offers SET status = 'active', published_at = COALESCE(published_at, now()), updated_at = now() WHERE id = ${offer.id}::uuid AND status = 'draft'`);
      recalc.add(fromMaster);
    }
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
      prev_status, prev_quarantined_at, decided_by, rule_source_id, is_rule, recalc_masters${p.via ? sql`, decided_via` : sql``})
    VALUES (${item.id}::uuid, ${offer.id}::uuid, ${item.vertical}, ${item.axis}, ${opt.value}, ${p.reason ? `Auto (óbvio): ${p.reason}`.slice(0, 300) : opt.label}, ${kind}, ${item.title}, ${item.title_norm},
      ${fromMaster}::uuid, ${toMaster}::uuid, ${createdMaster}::uuid, ${prevStatus}, ${prevQuarantine}::timestamptz, ${p.userId}::uuid, ${p.ruleSourceId ?? null}::uuid, ${isRule},
      ${sql.raw(`ARRAY[${recalcArr.map((i) => `'${i.replace(/[^0-9a-f-]/gi, '')}'`).join(',')}]::uuid[]`)}${p.via ? sql`, ${p.via}` : sql``})
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
  const d = rows<{ id: string; item_id: string | null; offer_id: string; kind: string; axis: string; value: string; from_master_id: string | null; to_master_id: string | null; created_master_id: string | null; prev_status: string | null; prev_quarantined_at: string | null; undone_at: string | null; recalc_masters: string[] | string }>(
    await tx.execute(sql`SELECT id::text AS id, item_id::text AS item_id, offer_id::text AS offer_id, kind, axis, value, from_master_id::text AS from_master_id, to_master_id::text AS to_master_id, created_master_id::text AS created_master_id,
      prev_status, prev_quarantined_at::text AS prev_quarantined_at, undone_at::text AS undone_at, recalc_masters::text[] AS recalc_masters
      FROM identity_decisions WHERE id = ${p.decisionId}::uuid FOR UPDATE`)
  )[0];
  if (!d) return { ok: false, error: 'decisao_inexistente' };
  if (d.undone_at) return { ok: true, already: true, decisionId: d.id };
  if (d.to_master_id && d.from_master_id && d.to_master_id !== d.from_master_id) {
    await tx.execute(sql`UPDATE affiliate_offers SET master_product_id = ${d.from_master_id}::uuid, updated_at = now() WHERE id = ${d.offer_id}::uuid AND master_product_id = ${d.to_master_id}::uuid`);
    await tx.execute(sql`UPDATE price_daily_offer SET master_product_id = ${d.from_master_id}::uuid WHERE offer_id = ${d.offer_id}::uuid AND master_product_id <> ${d.from_master_id}::uuid`);
  }
  // Master criado por esta decisao e agora vazio: arquiva (reversivel; reaparece se a identidade for escolhida de novo), em vez de deixar solto.
  if (d.created_master_id && d.created_master_id !== d.from_master_id) {
    await tx.execute(sql`UPDATE master_products SET attributes = attributes || ${JSON.stringify({ archived: true, archivedBy: 'fila-classificacao-desfazer', archivedAt: new Date().toISOString() })}::jsonb, updated_at = now()
      WHERE id = ${d.created_master_id}::uuid AND (attributes->>'createdBy') = 'fila-classificacao' AND (attributes->>'mergedInto') IS NULL
        AND NOT EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = master_products.id)
        AND NOT EXISTS (SELECT 1 FROM affiliate_price_watches w WHERE w.master_product_id = master_products.id)`);
  }
  if (d.prev_status) {
    // 'expired' tambem: a coleta pode ter expirado a oferta-rascunho por falta; a decisao do dono vale ate ser desfeita.
    await tx.execute(sql`UPDATE affiliate_offers SET status = ${d.prev_status}::affiliate_offer_status, updated_at = now() WHERE id = ${d.offer_id}::uuid AND status IN ('draft', 'expired')`);
  }
  if (d.axis === 'identidade' && d.value === 'sim' && d.prev_status === 'draft') {
    // Oferta Shopee de dúvida de cobertura que o "sim" ativou: desfazer a devolve a rascunho (fora da média).
    await tx.execute(sql`UPDATE affiliate_offers SET status = 'draft', updated_at = now() WHERE id = ${d.offer_id}::uuid AND status = 'active' AND (external_ref LIKE 'shopee-%' OR external_ref LIKE 'amazon-%')`);
  }
  if (d.axis === 'preco' && d.value === 'preco_errado') {
    // Devolve a quarentena ao estado anterior (NULL se a oferta nao estava em quarentena).
    await tx.execute(sql`UPDATE affiliate_offers SET quarantined_at = ${d.prev_quarantined_at}::timestamptz, updated_at = now() WHERE id = ${d.offer_id}::uuid`);
  }
  await tx.execute(sql`UPDATE identity_decisions SET undone_at = now(), undone_by = ${p.userId}::uuid, recalc_done_at = NULL,
    recalc_masters = ARRAY(SELECT DISTINCT x FROM unnest(recalc_masters || ARRAY[from_master_id, to_master_id]) AS x WHERE x IS NOT NULL) WHERE id = ${d.id}::uuid`);
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
  const masters = [...new Set(pend.flatMap((p) => (Array.isArray(p.m) ? p.m : String(p.m).replace(/[{}]/g, '').split(',').filter(Boolean))).filter((x) => x && x !== 'NULL' && x !== 'null'))];
  await dbx.transaction(async (tx) => {
    await recalcMasters(tx as unknown as Exec, masters);
    const idl = sql.join(pend.map((p) => sql`${p.id}::uuid`), sql`, `);
    await tx.execute(sql`UPDATE identity_decisions SET recalc_done_at = now() WHERE id IN (${idl})`);
  });
  return { decisoes: pend.length, masters: masters.length };
}

/** Chave do lock de aviso: impede duas geracoes simultaneas (cron x botao). */
const GENERATE_LOCK_KEY = 4286001142;

/** Geracao automatica (cron): lock de sessao na transacao, limite de tempo e recalculo dos masters tocados. Idempotente. */
export async function runQueueGeneration(dbx: typeof Db, opts: { budgetMs?: number } = {}): Promise<{ skipped?: 'em_andamento'; stats?: GenerateStats & { parcial?: boolean }; recalc?: { decisoes: number; masters: number }; autoObvio?: AutoObviousResult; pendentes?: number }> {
  const deadlineAt = Date.now() + (opts.budgetMs ?? 40_000);
  const out = await dbx.transaction(async (tx) => {
    const t = tx as unknown as Exec;
    const got = rows<{ ok: boolean }>(await t.execute(sql`SELECT pg_try_advisory_xact_lock(${GENERATE_LOCK_KEY}) AS ok`))[0]?.ok;
    if (!got) return null;
    return generateQueue(t, undefined, { deadlineAt });
  });
  if (!out) return { skipped: 'em_andamento' };
  let autoObvio: AutoObviousResult | undefined;
  if (process.env.FILA_AUTO_OBVIO !== 'off') {
    try {
      autoObvio = await autoResolveObvious(dbx, { apply: true, budgetMs: 15_000 });
    } catch (e) {
      console.error('[fila-classificacao] auto-obvio adiado:', e instanceof Error ? e.message : e);
    }
  }
  let recalc: { decisoes: number; masters: number } | undefined;
  try {
    recalc = await drainRecalc(dbx);
  } catch (e) {
    console.error('[fila-classificacao] recalculo adiado:', e instanceof Error ? e.message : e);
  }
  return { stats: out, autoObvio, recalc, pendentes: await countPending(dbx) };
}

// ------------------------------------------------------------------------------------------------
// AUTO-RESOLUCAO dos itens OBVIOS (dono, 2026-11-12). Criterio puro em lib/identity-queue/obvio.ts. Reversivel (undoInTx) e auditavel.
// ------------------------------------------------------------------------------------------------
export interface ObviousPick { itemId: string; title: string; masterName: string | null; vertical: string; axis: QueueAxis; value: string; criterio: ObvioCriterio | 'regra_do_dono'; motivo: string; ruleSourceId?: string }

/** Itens pendentes que o criterio libera (somente SELECT). Respeita desfazer: item que ja teve decisao 'auto_obvio' (mesmo desfeita) nunca e refeito. */
export async function selectObvious(exec: Exec, limit = 5000): Promise<{ avaliados: number; picks: ObviousPick[] }> {
  const hasCols = await hasEvidenceColumns(exec);
  const r = rows<{ id: string; vertical: string; axis: QueueAxis; source: string; options: QueueOption[]; understood: Record<string, unknown>; title: string; title_norm: string; master_id: string | null; price: string | null; mname: string | null; gtin: string | null; ev: MlEvidence | null }>(
    await exec.execute(sql`
      SELECT i.id::text AS id, i.vertical, i.axis, i.source, i.options, i.understood, i.title, i.title_norm, i.master_id::text AS master_id,
             o.current_price_cents::text AS price, m.name AS mname, m.gtin,
             ${hasCols ? sql`i.api_evidence` : sql`NULL::jsonb`} AS ev
      FROM identity_review_items i
      JOIN affiliate_offers o ON o.id = i.offer_id AND o.status = 'active'
      LEFT JOIN master_products m ON m.id = o.master_product_id
      WHERE i.status = 'pending' AND (i.snoozed_until IS NULL OR i.snoozed_until < now())
        ${hasCols ? sql`AND NOT EXISTS (SELECT 1 FROM identity_decisions d WHERE d.item_id = i.id AND d.decided_via = ${OBVIO_VIA})` : sql``}
      ORDER BY i.created_at, i.id LIMIT ${limit}`)
  );
  const rules = await loadRules(exec);
  const picks: ObviousPick[] = [];
  for (const x of r) {
    const titleNorm = x.title_norm;
    const rule = findRule(rules, { vertical: x.vertical, axis: x.axis, title: x.title, titleNorm, masterId: x.master_id, options: x.options });
    if (rule) {
      picks.push({ itemId: x.id, title: x.title, masterName: x.mname, vertical: x.vertical, axis: x.axis, value: rule.value, criterio: 'regra_do_dono', motivo: `regra aprendida: "${rule.title.slice(0, 80)}"`, ruleSourceId: rule.id });
      continue;
    }
    const v = judgeObvio({ axis: x.axis, source: x.source, options: x.options, understood: x.understood ?? {}, itemTitle: x.title, masterName: x.mname, masterGtin: x.gtin, evidence: x.ev, priceCents: x.price == null ? null : num(x.price) });
    if (v) picks.push({ itemId: x.id, title: x.title, masterName: x.mname, vertical: x.vertical, axis: x.axis, value: v.value, criterio: v.criterio, motivo: v.motivo });
  }
  return { avaliados: r.length, picks };
}

export interface AutoObviousResult { avaliados: number; liberados: number; aplicados: number; erros: number; porCriterio: Record<string, number>; parcial?: boolean }

/** Aplica o criterio (apply=true) ou so conta (apply=false). Cada item em sua transacao; para limpo no limite de tempo. Recalcula os masters tocados. */
export async function autoResolveObvious(dbx: typeof Db, p: { apply: boolean; budgetMs?: number; max?: number }): Promise<AutoObviousResult> {
  const deadline = Date.now() + (p.budgetMs ?? 30_000);
  const { avaliados, picks } = await selectObvious(dbx as unknown as Exec);
  const out: AutoObviousResult = { avaliados, liberados: picks.length, aplicados: 0, erros: 0, porCriterio: {} };
  for (const k of picks) out.porCriterio[k.criterio] = (out.porCriterio[k.criterio] ?? 0) + 1;
  if (!p.apply) return out;
  for (const k of picks.slice(0, p.max ?? 500)) {
    if (Date.now() > deadline) { out.parcial = true; break; }
    try {
      const res = await dbx.transaction((tx) =>
        applyInTx(tx as unknown as Exec, k.ruleSourceId
          ? { itemId: k.itemId, value: k.value, userId: null, ruleSourceId: k.ruleSourceId }
          : { itemId: k.itemId, value: k.value, userId: null, via: OBVIO_VIA, reason: `${k.criterio}: ${k.motivo}` })
      );
      if (res.ok && !res.already) out.aplicados++;
      else if (!res.ok) out.erros++;
    } catch (e) {
      out.erros++;
      console.error('[fila-classificacao] auto-obvio falhou num item:', e instanceof Error ? e.message : e);
    }
  }
  if (out.aplicados > 0) {
    try { await drainRecalc(dbx); } catch (e) { console.error('[fila-classificacao] recalculo adiado:', e instanceof Error ? e.message : e); }
  }
  return out;
}

export interface AutoResolvedRow { decisionId: string; title: string; label: string; value: string; axis: string; decidedAt: string }

/** Itens resolvidos pelo criterio automatico e ainda NAO desfeitos (para o popup mostrar e permitir desfazer). */
export async function getAutoResolved(exec: Exec, limit = 15): Promise<{ total: number; recentes: AutoResolvedRow[] }> {
  if (!(await hasEvidenceColumns(exec))) return { total: 0, recentes: [] };
  const t = rows<{ n: number }>(await exec.execute(sql`SELECT count(*)::int AS n FROM identity_decisions WHERE decided_via = ${OBVIO_VIA} AND undone_at IS NULL`));
  const r = rows<{ id: string; title: string; value_label: string | null; value: string; axis: string; at: string }>(await exec.execute(sql`
    SELECT id::text AS id, title, value_label, value, axis, decided_at::text AS at FROM identity_decisions
    WHERE decided_via = ${OBVIO_VIA} AND undone_at IS NULL ORDER BY decided_at DESC LIMIT ${limit}`));
  return { total: num(t[0]?.n ?? 0), recentes: r.map((x) => ({ decisionId: x.id, title: x.title, label: x.value_label ?? x.value, value: x.value, axis: x.axis, decidedAt: x.at })) };
}
