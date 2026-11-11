/**
 * AUDITORIA DE CONSOLES (dono, 2026-11-11): um console = UM master = UMA média; pacote com jogo/controle fora da média do console
 * avulso; outlier absurdo fora; usado/Open Box/desbloqueado fora; PS4/Xbox One/360 (fora de linha) nunca entram.
 * Identidade: src/lib/catalog/console-identity.ts (reaproveita normalizeTitle/derivePlatformFromTitle/isBundleTitle do dedup).
 *
 *   # 1) PLANO (padrão, SÓ LEITURA; grava o plano em docs/backups/ e imprime o resumo)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/auditar-consoles.ts [--ps5-sem-marcador base|nd]
 *   # 2) APLICAR (SÓ depois de o dono conferir o plano; exige backup recente + --por)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/auditar-consoles.ts --apply --plano docs/backups/auditar-consoles-plano-<ts>.json --por "Nome" [--so mover,unir,quarentena]
 *   # 3) REVERTER
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/auditar-consoles.ts --rollback backup/logs/auditar-consoles-<ts>.json [--apply]
 *
 * O QUE O --apply ESCREVE (uma transação só; nunca apaga linha de oferta/cotação/master):
 *   MOVER   affiliate_offers.master_product_id (ofertas ativas cuja identidade é de outro master) + price_daily_offer.master_product_id.
 *   UNIR    master duplicado (mesma chave) -> canônico: reaponta todas as FKs (mesmo procedimento de merge-duplicate-masters) e arquiva
 *           (attributes.mergedInto). Reversível pelo log.
 *   QUARENTENA affiliate_offers.quarantined_at (preço > 3x a mediana das demais da mesma identidade ou >= R$ 50.000), igual a
 *           scripts/quarentena-precos-absurdos.ts. A oferta e as cotações continuam no banco.
 *   RECALCULO price_daily_state (de 2026-10-31 até hoje) e price_min_events 'reconstructed' dos masters afetados, PELO CÓDIGO EXISTENTE
 *           (computeStatesForBatch/upsertStates/reconstructMinEvents), como recalcular-mario-kart-world-diario.ts e backfill-price-daily.ts.
 *           product_price_stats/showcase_snapshot são derivadas e o cron refresh-snapshots (15 min) as refaz sozinho.
 * Não toca em src/lib/messaging nem em src/server/coupons.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, type Sql } from './_dup-shared';
import { parseConsoleTitle, type ConsoleIdentity } from '../src/lib/catalog/console-identity';
import { compareIdentity, normalizeTitle } from '../src/lib/affiliate/dedup';
import { medianCont, plausibleBand, inBand, PRICE_DAILY_REGIME_START, spDay } from '../src/lib/pricing/daily-state';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = flag('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const PS5_UNMARKED = (arg('--ps5-sem-marcador') ?? 'base') as 'base' | 'nd';
const HARD_CEILING_CENTS = 5_000_000; // R$ 50.000 (mesmo teto de quarentena-precos-absurdos.ts)
const HIGH_RATIO = 3;
const MIN_OTHERS = 3;
const PLAN_DIR = path.resolve('docs/backups');
const BK_DATA = path.resolve('backup/dados');
const BK_LOGS = path.resolve('backup/logs');
const brl = (c: number | null | undefined) => (c == null ? '-' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

// ----------------------------------------------------------------------------------------------------------------
// Tipos do plano
// ----------------------------------------------------------------------------------------------------------------
interface MasterRow { id: string; name: string; pt: string; plat: string; gate: string | null; createdAt: string; activeOffers: number; totalOffers: number }
interface OfferRow {
  id: string; mid: string; title: string; price: number; net: string; store: string; seller: string | null; quarantined: boolean; pendingLink: boolean;
}
type Action = 'manter' | 'ja_em_quarentena' | 'mover' | 'quarentena' | 'fora_escopo' | 'fora_de_linha' | 'condicao_fora_da_media' | 'sem_master_destino';
interface Decision {
  offerId: string; title: string; price: number; net: string; store: string; fromMasterId: string; toMasterId: string | null;
  key: string | null; action: Action; reasons: string[];
}
interface Stats { n: number; stores: number; mean: number | null; median: number | null; min: number | null; max: number | null; outOfBand: number }

// ----------------------------------------------------------------------------------------------------------------
// Estatística: espelha a regra de produção (faixa plausível 35% a 3x a mediana, média só com >= 3, placeholder redundante fora)
// ----------------------------------------------------------------------------------------------------------------
function statsOf(offers: OfferRow[]): Stats {
  // placeholder redundante (seller nulo havendo oferta com vendedor na mesma rede) fica fora, como EXCLUDE_REDUNDANT_PLACEHOLDER
  const withSeller = new Set(offers.filter((o) => o.seller).map((o) => o.net));
  const elig = offers.filter((o) => !(o.seller === null && withSeller.has(o.net)));
  const prices = elig.map((o) => o.price);
  const band = plausibleBand(prices);
  const kept = elig.filter((o) => inBand(o.price, band));
  const kp = kept.map((o) => o.price);
  const stores = new Set(kept.map((o) => `${o.net}:${o.seller ?? o.store}`));
  return {
    n: kept.length, stores: stores.size,
    mean: kept.length >= 3 ? Math.round(kp.reduce((a, b) => a + b, 0) / kp.length) : null,
    median: medianCont(kp) == null ? null : Math.round(medianCont(kp) as number),
    min: kp.length ? Math.min(...kp) : null, max: kp.length ? Math.max(...kp) : null,
    outOfBand: elig.length - kept.length,
  };
}

// ----------------------------------------------------------------------------------------------------------------
// Conflito de identidade oferta x master: só conta eixo PROVADO nos dois lados (título mais pobre não contradiz o master)
// ----------------------------------------------------------------------------------------------------------------
function softModel(i: ConsoleIdentity) { return i.unresolved.some((u) => u.includes('sem marcador') || u.includes('inferido') || u.includes('não prova')); }
function conflict(offer: ConsoleIdentity, master: ConsoleIdentity): string[] {
  const out: string[] = [];
  if (offer.family !== master.family) out.push(`família ${offer.family} x ${master.family}`);
  if (offer.pack !== master.pack) out.push(offer.pack ? `pacote (${offer.packSignature}) no master avulso` : 'avulso no master de pacote');
  else if (offer.pack && offer.packSignature !== master.packSignature) out.push(`pacote diferente (${offer.packSignature} x ${master.packSignature})`);
  if ((offer.edition ?? null) !== (master.edition ?? null) && (offer.edition || master.edition) && !(master.edition && !offer.edition)) out.push(`edição ${offer.edition ?? '-'} x ${master.edition ?? '-'}`);
  if ((offer.region ?? null) !== (master.region ?? null) && offer.region) out.push(`região ${offer.region} x ${master.region ?? 'br'}`);
  if (!offer.edition && !master.edition) {
    if (offer.model !== master.model && !softModel(offer) && !softModel(master)) out.push(`modelo ${offer.model} x ${master.model}`);
    else if (offer.model !== master.model && offer.model !== 'nd' && master.model !== 'nd' && !softModel(offer)) out.push(`modelo ${offer.model} x ${master.model}`);
    if (offer.media !== master.media && offer.mediaSource === 'titulo' && master.mediaSource === 'titulo') out.push(`mídia ${offer.media} x ${master.media}`);
    if (offer.family === 'xbox_series' && offer.storageGb && master.storageGb && offer.storageGb !== master.storageGb) out.push(`armazenamento ${offer.storageGb} x ${master.storageGb}`);
  }
  return out;
}

// ----------------------------------------------------------------------------------------------------------------
// Construção do plano (SÓ LEITURA)
// ----------------------------------------------------------------------------------------------------------------
async function loadData(sql: Sql) {
  const masters = await sql<MasterRow[]>`
    SELECT m.id::text, m.name, m.product_type::text AS pt, m.game_platform_gen::text AS plat, m.attributes->'catalogGate'->>'verdict' AS gate,
           m.created_at::text AS "createdAt",
           (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS "activeOffers",
           (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id) AS "totalOffers"
    FROM master_products m
    WHERE m.vertical = 'games' AND (m.attributes ->> 'mergedInto') IS NULL AND m.product_type = 'console'`;
  // Masters de hardware gravados com tipo errado (game/accessory) que seguram ofertas de console: entram só como ORIGEM de ofertas.
  const strays = await sql<MasterRow[]>`
    SELECT m.id::text, m.name, m.product_type::text AS pt, m.game_platform_gen::text AS plat, m.attributes->'catalogGate'->>'verdict' AS gate,
           m.created_at::text AS "createdAt",
           (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS "activeOffers",
           (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id) AS "totalOffers"
    FROM master_products m
    WHERE m.vertical = 'games' AND (m.attributes ->> 'mergedInto') IS NULL AND m.product_type <> 'console'
      AND m.name ~* '(^|[^a-z])(console|videogame|video game)([^a-z]|$)|^(sony |nintendo |microsoft )?(playstation ?5|ps5|nintendo switch|xbox series)[^a-z]*(slim|pro|digital|oled|lite|standard|825|1 ?tb)'
      AND EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active')`;
  const all = [...masters, ...strays];
  const ids = all.map((m) => m.id);
  const offers = await sql<OfferRow[]>`
    SELECT o.id::text, o.master_product_id::text AS mid, o.title, o.current_price_cents::float8 AS price, n.slug AS net,
           COALESCE(o.store_name, '') AS store, o.seller_id::text AS seller, (o.quarantined_at IS NOT NULL) AS quarantined,
           o.affiliate_link_pending AS "pendingLink"
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.status = 'active' AND o.master_product_id = ANY(${ids}::uuid[]) AND o.current_price_cents > 0`;
  return { masters, strays, offers };
}

export async function buildPlan(sql: Sql) {
  const { masters, strays, offers } = await loadData(sql);
  const parseOpts = { ps5Unmarked: PS5_UNMARKED } as const;
  const mById = new Map([...masters, ...strays].map((m) => [m.id, m]));
  const mIdent = new Map([...mById.values()].map((m) => [m.id, parseConsoleTitle(m.name, parseOpts)]));
  const consoleMasters = masters; // só estes podem ser DESTINO

  // 1) Decisão por oferta: chave efetiva (a do master, salvo conflito PROVADO no título da oferta).
  const decisions: Decision[] = [];
  const members = new Map<string, OfferRow[]>(); // chave efetiva -> ofertas (novas, não quarentenadas)
  const keyOf = new Map<string, string>(); // offerId -> chave efetiva
  const offerIdent = new Map<string, ConsoleIdentity>();
  for (const o of offers) {
    const m = mById.get(o.mid)!;
    const mi = mIdent.get(o.mid)!;
    const oi = parseConsoleTitle(o.title, parseOpts);
    offerIdent.set(o.id, oi);
    const base: Omit<Decision, 'action' | 'reasons' | 'key' | 'toMasterId'> = { offerId: o.id, title: o.title, price: o.price, net: o.net, store: o.store || o.seller || '', fromMasterId: o.mid };
    if (oi.scope === 'legacy' || (oi.scope === 'not_console' && mi.scope === 'legacy')) { decisions.push({ ...base, toMasterId: null, key: null, action: 'fora_de_linha', reasons: [oi.reason ?? mi.reason ?? 'fora de linha'] }); continue; }
    if (oi.scope !== 'in' || (mi.scope !== 'in' && mi.scope !== 'not_console')) {
      decisions.push({ ...base, toMasterId: null, key: null, action: 'fora_escopo', reasons: [oi.reason ?? 'não é console'] }); continue;
    }
    if (mi.scope !== 'in') { // master é peça/jogo/portal; a oferta é console: sem master de console de origem confiável, trata pelo título da oferta
      // segue com a chave da oferta
    }
    if (oi.condition !== 'new') { decisions.push({ ...base, toMasterId: null, key: oi.key, action: 'condicao_fora_da_media', reasons: [`condição ${oi.condition}: fora das médias`] }); continue; }
    const conf = mi.scope === 'in' ? conflict(oi, mi) : ['master de origem não é console'];
    const key = conf.length ? (oi.key as string) : (mi.key as string);
    keyOf.set(o.id, key);
    decisions.push({ ...base, toMasterId: null, key, action: o.quarantined ? 'ja_em_quarentena' : 'manter', reasons: [...(conf.length ? ['título da oferta contradiz o master: ' + conf.join('; ')] : []), ...(o.quarantined ? ['já em quarentena (fora de toda leitura e média)'] : [])] });
    if (o.quarantined) continue; // já fora de toda leitura
    if (!members.has(key)) members.set(key, []);
    members.get(key)!.push(o);
    void m;
  }

  // 2) Canônico por chave: master de CONSOLE cuja identidade própria = chave; mais ofertas da chave, depois mais ativas, mais antigo.
  const canonical = new Map<string, MasterRow>();
  const byKeyMasters = new Map<string, MasterRow[]>();
  for (const m of consoleMasters) {
    const i = mIdent.get(m.id)!;
    if (i.scope === 'in' && i.key && i.condition === 'new') (byKeyMasters.get(i.key) ?? byKeyMasters.set(i.key, []).get(i.key)!).push(m);
  }
  for (const [key, ms] of byKeyMasters) {
    const inKey = (m: MasterRow) => (members.get(key) ?? []).filter((o) => o.mid === m.id).length;
    canonical.set(key, [...ms].sort((a, b) => inKey(b) - inKey(a) || b.activeOffers - a.activeOffers || b.totalOffers - a.totalOffers || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0]);
  }
  // Sem master de console com a identidade: um master "tipo errado" (game/accessory) cujo PRÓPRIO título tem a identidade vira o master
  // da chave, com RETIPAR para console (corrige o tipo; não cria master). Escolhe o que segura mais ofertas da chave.
  const retype = new Map<string, MasterRow>();
  for (const [key, offs] of members) {
    if (canonical.has(key)) continue;
    const cand = strays.filter((m) => { const i = mIdent.get(m.id)!; return i.scope === 'in' && i.condition === 'new' && i.key === key; });
    if (!cand.length) continue;
    const held = (m: MasterRow) => offs.filter((o) => o.mid === m.id).length;
    const best = [...cand].sort((a, b) => held(b) - held(a) || b.activeOffers - a.activeOffers || a.createdAt.localeCompare(b.createdAt))[0];
    canonical.set(key, best);
    retype.set(best.id, best);
  }
  // Chaves sem master algum: só se alguma oferta existe (pede master novo; o --apply NÃO cria master).
  const needsMaster = new Map<string, OfferRow[]>();
  for (const [key, offs] of members) if (!canonical.has(key)) needsMaster.set(key, offs);

  // 3) Quarentena de absurdo (preço >= R$ 50.000, ou > 3x a mediana das DEMAIS da identidade com >= 3 outras).
  const quarantine = new Set<string>();
  for (const [key, offs] of members) {
    for (const o of offs) {
      if (o.price >= HARD_CEILING_CENTS) { quarantine.add(o.id); continue; }
      const others = offs.filter((x) => x.id !== o.id && x.price < HARD_CEILING_CENTS).map((x) => x.price);
      if (others.length >= MIN_OTHERS) {
        const med = medianCont(others) as number;
        if (o.price > HIGH_RATIO * med) quarantine.add(o.id);
      }
    }
    void key;
  }

  // 4) Movimentos e quarentenas nas decisões.
  const moves: Decision[] = [];
  for (const d of decisions) {
    if (d.action !== 'manter' || !d.key) continue;
    const canon = canonical.get(d.key);
    if (!canon) { d.action = 'sem_master_destino'; d.reasons.push('não há master de console com esta identidade (criar master novo é decisão do dono; o apply não cria)'); continue; }
    d.toMasterId = canon.id;
    if (quarantine.has(d.offerId)) {
      d.action = 'quarentena';
      d.reasons.push(d.price >= HARD_CEILING_CENTS ? 'preço >= R$ 50.000' : `preço > ${HIGH_RATIO}x a mediana das demais da identidade`);
    }
    if (canon.id !== d.fromMasterId) {
      if (d.action === 'manter') d.action = 'mover';
      d.reasons.push(`identidade ${d.key} pertence ao master ${canon.id.slice(0, 8)}`);
      moves.push(d);
    }
  }

  // 5) UNIR: master de console cuja PRÓPRIA identidade = chave de outro canônico (mesma identidade em dois masters).
  const unions: Array<{ dupId: string; canonicalId: string; key: string; dupName: string; canonName: string; dupActive: number; dupTotal: number; dedupHardDivergences: string[] }> = [];
  for (const [key, ms] of byKeyMasters) {
    const canon = canonical.get(key)!;
    for (const m of ms) if (m.id !== canon.id) unions.push({ dupId: m.id, canonicalId: canon.id, key, dupName: m.name, canonName: canon.name, dupActive: m.activeOffers, dupTotal: m.totalOffers, dedupHardDivergences: compareIdentity(normalizeTitle(m.name, { productType: 'console' }), normalizeTitle(canon.name, { productType: 'console' })).filter((d) => d.hard).map((d) => d.axis + ': ' + d.detail) });
  }

  // 6) Métricas antes (por master atual) e depois (por identidade).
  const q = (o: OfferRow) => !quarantine.has(o.id);
  const before: Array<{ masterId: string; name: string; identity: string | null; stats: Stats }> = [];
  for (const m of consoleMasters) {
    const offs = offers.filter((o) => o.mid === m.id && !o.quarantined && offerIdent.get(o.id)?.condition === 'new' && offerIdent.get(o.id)?.scope === 'in');
    if (!offs.length) continue;
    before.push({ masterId: m.id, name: m.name, identity: mIdent.get(m.id)!.key, stats: statsOf(offs) });
  }
  const after: Array<{ key: string; canonicalMasterId: string | null; canonicalName: string | null; stats: Stats; masters: string[]; unresolved: string[]; confidence: string; kind: string }> = [];
  for (const [key, offs] of members) {
    const kept = offs.filter(q);
    if (!kept.length) continue;
    const canon = canonical.get(key) ?? null;
    const sample = parseConsoleTitle(canon ? canon.name : kept[0].title, { ps5Unmarked: PS5_UNMARKED });
    after.push({
      key, canonicalMasterId: canon?.id ?? null, canonicalName: canon?.name ?? null, stats: statsOf(kept),
      masters: [...new Set(offs.map((o) => o.mid))], unresolved: sample.unresolved, confidence: sample.confidence, kind: sample.pack ? 'pacote' : 'avulso',
    });
  }
  after.sort((a, b) => a.key.localeCompare(b.key));

  // 7) Masters que ficam vazios (sem ser união) e masters fora de escopo com oferta.
  const finalCount = new Map<string, number>();
  for (const d of decisions) if (d.action === 'manter' || d.action === 'mover' || d.action === 'quarentena') {
    const dest = d.toMasterId ?? d.fromMasterId;
    finalCount.set(dest, (finalCount.get(dest) ?? 0) + 1);
  }
  const unionDup = new Set(unions.map((u) => u.dupId));
  const staying = (id: string) => decisions.filter((d) => d.fromMasterId === id && !(d.toMasterId && d.toMasterId !== id && (d.action === 'mover' || d.action === 'quarentena'))).length;
  const emptied = consoleMasters.filter((m) => m.activeOffers > 0 && staying(m.id) === 0 && !unionDup.has(m.id) && mIdent.get(m.id)!.scope === 'in').map((m) => ({ id: m.id, name: m.name, activeOffers: m.activeOffers }));

  const inScopeActions = new Set<Action>(['manter', 'ja_em_quarentena', 'mover', 'quarentena', 'condicao_fora_da_media']);
  const holdersByFamily: Record<string, Set<string>> = {};
  for (const d of decisions) {
    if (!inScopeActions.has(d.action) || !d.key) continue;
    (holdersByFamily[d.key.split('|')[0]] ??= new Set()).add(d.fromMasterId);
  }
  const afterByFamily: Record<string, number> = {};
  for (const a of after) afterByFamily[a.key.split('|')[0]] = (afterByFamily[a.key.split('|')[0]] ?? 0) + 1;
  const porFamilia = Object.fromEntries(Object.keys({ ...holdersByFamily, ...afterByFamily }).map((f) => [f, { mastersAntes: holdersByFamily[f]?.size ?? 0, identidadesDepois: afterByFamily[f] ?? 0 }]));
  const mastersConsoleLive = consoleMasters.filter((m) => mIdent.get(m.id)!.scope === 'in');
  const withOffers = (list: MasterRow[]) => list.filter((m) => m.activeOffers > 0).length;
  const summary = {
    mastersTypeConsole: consoleMasters.length,
    mastersConsoleEmLinha: mastersConsoleLive.length,
    mastersConsoleEmLinhaComOfertaAtiva: withOffers(mastersConsoleLive),
    mastersForaDeEscopoComOferta: consoleMasters.filter((m) => mIdent.get(m.id)!.scope !== 'in' && m.activeOffers > 0).length,
    mastersTipoErradoComOfertaDeConsole: strays.length,
    mastersComOfertaDeConsoleAntes: new Set([...Object.values(holdersByFamily)].flatMap((s) => [...s])).size,
    identidadesDepois: after.length,
    identidadesDepoisAvulso: after.filter((a) => a.kind === 'avulso').length,
    identidadesDepoisPacote: after.filter((a) => a.kind === 'pacote').length,
    porFamilia,
    identidadesComMasterExistente: after.filter((a) => a.canonicalMasterId).length,
    identidadesSemMaster: needsMaster.size,
    mastersAArquivarPorUniao: unions.length,
    mastersAReclassificarParaConsole: retype.size,
    mastersQueFicamVaziosSemUniao: emptied.length,
    ofertasAtivasAvaliadas: offers.length,
    ofertasMovidas: moves.length,
    ofertasQuarentena: decisions.filter((d) => d.action === 'quarentena').length,
    ofertasForaDaMediaPorCondicao: decisions.filter((d) => d.action === 'condicao_fora_da_media').length,
    ofertasForaDeEscopo: decisions.filter((d) => d.action === 'fora_escopo').length,
    ofertasForaDeLinha: decisions.filter((d) => d.action === 'fora_de_linha').length,
    ofertasSemMasterDestino: decisions.filter((d) => d.action === 'sem_master_destino').length,
    ps5SemMarcador: PS5_UNMARKED,
  };

  const exId = '0163ced3-f94d-4bc4-8289-655db9195c89';
  const exKey = mIdent.get(exId)?.key ?? null;
  const example = {
    masterId: exId, name: mById.get(exId)?.name ?? null, identity: mIdent.get(exId),
    antes: before.find((b) => b.masterId === exId) ?? null,
    depois: after.find((a) => a.key === exKey) ?? null,
    ofertas: decisions.filter((d) => d.fromMasterId === exId),
    mastersUnidosAEleNaIdentidade: unions.filter((u) => u.canonicalId === exId || u.dupId === exId),
  };

  // Amostra de 15 decisões para conferência humana (estratificada e determinística: ordena por id dentro de cada tipo).
  const pick = (list: Decision[], n: number) => [...list].sort((a, b) => a.offerId.localeCompare(b.offerId)).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n);
  const amostra15 = [
    ...pick(decisions.filter((d) => d.action === 'mover' && d.reasons.some((r) => r.includes('pertence'))), 5),
    ...pick(decisions.filter((d) => d.action === 'condicao_fora_da_media'), 2),
    ...pick(decisions.filter((d) => d.action === 'fora_escopo'), 3),
    ...pick(decisions.filter((d) => d.action === 'fora_de_linha'), 1),
    ...pick(decisions.filter((d) => d.action === 'manter' && (d.key ?? '').includes('pacote')), 2),
    ...decisions.filter((d) => d.fromMasterId === exId && d.action === 'manter').slice(0, 2),
  ].slice(0, 15).map((d) => ({ ...d, masterOrigem: mById.get(d.fromMasterId)?.name ?? null, masterDestino: d.toMasterId ? mById.get(d.toMasterId)?.name ?? null : null }));

  return {
    geradoEm: new Date().toISOString(), versao: 1, ps5SemMarcador: PS5_UNMARKED, regra: {
      pacoteNaMediaDoAvulso: 'NAO: pacote vira identidade/master PROPRIO (composicao e eixo duro em compareIdentity), nunca entra na media do console avulso',
      outlier: `>${HIGH_RATIO}x a mediana das demais da identidade (>=${MIN_OTHERS} outras) ou >= R$ 50.000 => quarentena (reversivel)`,
      condicao: 'usado, recondicionado, Open Box, vitrine, desbloqueado/modificado => fora das medias (ja excluidos pela elegibilidade SQL)',
      foraDeLinha: 'PS4, Xbox One, Xbox 360 e anteriores nao entram',
    }, summary, example, unions, moves,
    retype: [...retype.values()].map((m) => ({ id: m.id, name: m.name, from: m.pt, to: 'console', key: mIdent.get(m.id)!.key, activeOffers: m.activeOffers })),
    amostra15, decisions, before, after,
    needsMaster: [...needsMaster].map(([key, offs]) => ({ key, ofertas: offs.map((o) => ({ id: o.id, title: o.title, price: o.price })) })),
    emptied,
    mastersForaDeEscopo: consoleMasters.filter((m) => mIdent.get(m.id)!.scope !== 'in' && m.activeOffers > 0).map((m) => ({ id: m.id, name: m.name, activeOffers: m.activeOffers, motivo: mIdent.get(m.id)!.reason })),
    strays: strays.map((m) => ({ id: m.id, name: m.name, productType: m.pt, activeOffers: m.activeOffers, identidade: mIdent.get(m.id)!.key })),
  };
}

function printSummary(p: Awaited<ReturnType<typeof buildPlan>>, lines: string[]) {
  const L = (s = '') => lines.push(s);
  L('=== AUDITORIA DE CONSOLES (PLANO, SOMENTE LEITURA) ===');
  L(JSON.stringify(p.summary, null, 2));
  L('\n--- Identidades DEPOIS (n ofertas na media, n lojas, media, mediana) ---');
  for (const a of p.after) L(`${a.kind.padEnd(7)} ${a.key}\n   master ${a.canonicalMasterId?.slice(0, 8) ?? 'SEM MASTER'} | n=${a.stats.n} lojas=${a.stats.stores} media=${brl(a.stats.mean)} mediana=${brl(a.stats.median)} min=${brl(a.stats.min)} max=${brl(a.stats.max)} fora_da_faixa=${a.stats.outOfBand} | conf=${a.confidence} | masters de origem: ${a.masters.map((m) => m.slice(0, 8)).join(',')}`);
  L('\n--- Uniões (master duplicado -> canônico) ---');
  for (const u of p.unions) L(`${u.dupId.slice(0, 8)} (${u.dupActive} ativas) "${u.dupName.slice(0, 55)}" -> ${u.canonicalId.slice(0, 8)} "${u.canonName.slice(0, 45)}" [${u.key}]`);
  L('\n--- Amostra de 15 decisões (conferência humana) ---');
  for (const d of p.amostra15) L(`[${d.action}] ${brl(d.price)} ${d.net} | "${d.title.slice(0, 70)}"\n   origem: ${d.masterOrigem?.slice(0, 60)} (${d.fromMasterId.slice(0, 8)}) -> destino: ${d.masterDestino?.slice(0, 60) ?? '-'} | chave: ${d.key ?? '-'} | ${d.reasons.join('; ').slice(0, 140)}`);
  L('\n--- Masters a reclassificar para console (tipo errado) ---');
  for (const r of p.retype) L(`${r.id.slice(0, 8)} ${r.from} -> console (${r.activeOffers} ativas) "${r.name.slice(0, 70)}" [${r.key}]`);
  L('\n--- Uniões com divergência DURA no léxico do dedup (revisão humana antes de aplicar) ---');
  for (const u of p.unions.filter((x) => x.dedupHardDivergences.length)) L(`${u.dupId.slice(0, 8)} -> ${u.canonicalId.slice(0, 8)}: ${u.dedupHardDivergences.join(' | ')} | "${u.dupName.slice(0, 50)}"`);
  L('\n--- Caso 0163ced3 ---');
  L(JSON.stringify({ antes: p.example.antes?.stats, depois: p.example.depois?.stats, key: p.example.depois?.key }, null, 2));
  for (const d of p.example.ofertas) L(`  ${d.offerId.slice(0, 8)} ${brl(d.price)} ${d.net} ${d.action} ${d.reasons.join(' | ')}`);
}

// ----------------------------------------------------------------------------------------------------------------
// APPLY / ROLLBACK (transação única via drizzle; recálculo pelo código existente)
// ----------------------------------------------------------------------------------------------------------------
const lit = (sqlTag: typeof import('drizzle-orm').sql, list: string[]) => sqlTag.join(list.map((i) => sqlTag`${i}`), sqlTag`, `);
const IDENT = /^[a-z_][a-z0-9_]*$/;
class DryAbort extends Error {}

function recentBackupOk(): string {
  const files = fs.existsSync(BK_DATA) ? fs.readdirSync(BK_DATA).filter((f) => /^affiliate_offers.*\.ndjson$/.test(f)) : [];
  const newest = Math.max(0, ...files.map((f) => fs.statSync(path.join(BK_DATA, f)).mtimeMs));
  const ageH = (Date.now() - newest) / 3_600_000;
  if (!newest || ageH > 12) throw new Error(`Backup de affiliate_offers com ${ageH.toFixed(1)} h (> 12 h). Rode: node --env-file=.env.local backup/backup-pre-fusao.mjs`);
  return `${ageH.toFixed(1)} h`;
}

async function applyPlan() {
  const planFile = arg('--plano');
  const por = arg('--por');
  if (!planFile || !por) throw new Error('--apply exige --plano <arquivo.json> e --por "<quem aprovou>"');
  const only = new Set((arg('--so') ?? 'mover,unir,quarentena,retipar').split(','));
  const plan = JSON.parse(fs.readFileSync(path.resolve(planFile), 'utf8')) as Awaited<ReturnType<typeof buildPlan>>;
  const backupAge = recentBackupOk();
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db');
  const pd = await import('../src/server/pricing/price-daily');
  const ds = await import('../src/lib/pricing/daily-state');

  const retypes = only.has('retipar') ? plan.retype : [];
  const retypeIds = new Set(plan.retype.map((r) => r.id));
  const okRetype = new Set(retypes.map((r) => r.id));
  // Mover para master "tipo errado" só junto com o RETIPAR dele.
  // --so-sem-divergencia: aplica primeiro só o que o léxico do dedup também aceita (uniões sem divergência dura); o resto fica p/ conferência.
  const safeOnly = flag('--so-sem-divergencia');
  const heldBack = new Set(plan.unions.filter((u) => safeOnly && u.dedupHardDivergences.length).map((u) => u.dupId));
  const moves = only.has('mover') ? plan.moves.filter((m) => (m.action === 'mover' || m.action === 'quarentena') && !heldBack.has(m.fromMasterId) && (!retypeIds.has(m.toMasterId as string) || okRetype.has(m.toMasterId as string))) : [];
  const quar = only.has('quarentena') ? plan.decisions.filter((d) => d.action === 'quarentena') : [];
  const unions = only.has('unir') ? plan.unions.filter((u) => !heldBack.has(u.dupId)) : [];
  const moveIds = moves.map((m) => m.offerId);
  const quarIds = quar.map((d) => d.offerId);
  const dupIds = unions.map((u) => u.dupId);
  const affected = [...new Set([...moves.flatMap((m) => [m.fromMasterId, m.toMasterId as string]), ...unions.flatMap((u) => [u.dupId, u.canonicalId]), ...retypes.map((r) => r.id)])];
  const survivors = affected.filter((id) => !dupIds.includes(id));
  const now = new Date();
  const today = spDay(now);
  const logFile = path.join(BK_LOGS, `auditar-consoles-${stamp}.json`);
  fs.mkdirSync(BK_LOGS, { recursive: true });
  fs.mkdirSync(BK_DATA, { recursive: true });
  const log: Record<string, unknown> = { status: 'pending', stamp, por, planFile, backupAge, moves: [], unions: [], quarantined: [], retyped: [], files: {} };
  const rows = async (tx: any, table: string, where: any) => (await tx.execute(sql`SELECT to_jsonb(t) AS j FROM ${sql.raw(table)} t WHERE ${where}`)).map((r: any) => r.j);
  const wr = (n: string, data: unknown[]) => {
    const f = path.join(BK_DATA, `auditar-consoles-${stamp}-${n}.ndjson`);
    fs.writeFileSync(f, data.map((r) => JSON.stringify(r)).join('\n') + (data.length ? '\n' : ''));
    return f;
  };

  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '300s'`);
      // Contagem ESTÁVEL: só linhas anteriores ao início da transação (a coleta ao vivo continua inserindo cotações/ofertas novas; isso não é perda).
      const cutoff = ((await tx.execute(sql`SELECT now() AS t`))[0] as any).t as Date;
      const cutIso = new Date(cutoff).toISOString();
      const cnt = async () => (await tx.execute(sql`SELECT (SELECT count(*) FROM affiliate_offers WHERE created_at <= ${cutIso}::timestamptz)::int o, (SELECT count(*) FROM affiliate_price_snapshots WHERE collected_at <= ${cutIso}::timestamptz)::int s, (SELECT count(*) FROM master_products WHERE created_at <= ${cutIso}::timestamptz)::int m`))[0];
      const c0 = await cnt();

      // Revalidação ao vivo: cada oferta continua ativa no master esperado; destinos/duplicados não arquivados.
      if (moveIds.length) {
        const live = await tx.execute(sql`SELECT id::text, master_product_id::text AS mid, status::text AS st FROM affiliate_offers WHERE id IN (${lit(sql, moveIds)}) FOR UPDATE`);
        const by = new Map<string, any>(live.map((r: any) => [r.id, r]));
        for (const m of moves) { const l = by.get(m.offerId); if (!l || l.mid !== m.fromMasterId || l.st !== 'active') throw new Error(`oferta ${m.offerId} mudou desde o plano; gere o plano de novo`); }
      }
      const mIds = [...new Set([...affected])];
      if (mIds.length) {
        const ms = await tx.execute(sql`SELECT id::text, attributes->>'mergedInto' AS mi FROM master_products WHERE id IN (${lit(sql, mIds)}) FOR UPDATE`);
        if (ms.length !== mIds.length) throw new Error('master do plano sumiu');
        if (ms.some((r: any) => r.mi)) throw new Error('master do plano já foi arquivado; gere o plano de novo');
      }

      // Backups lógicos ANTES de escrever.
      const files: Record<string, string> = {};
      const touchedOffers = [...new Set([...moveIds, ...quarIds])];
      if (touchedOffers.length) files.affiliate_offers = wr('affiliate_offers', await rows(tx, 'affiliate_offers', sql`id IN (${lit(sql, touchedOffers)})`));
      if (mIds.length) {
        files.master_products = wr('master_products', await rows(tx, 'master_products', sql`id IN (${lit(sql, mIds)})`));
        files.offers_of_masters = wr('offers_of_masters', await rows(tx, 'affiliate_offers', sql`master_product_id IN (${lit(sql, mIds)})`));
        files.price_daily_state = wr('price_daily_state', await rows(tx, 'price_daily_state', sql`master_product_id IN (${lit(sql, mIds)}) AND day >= ${PRICE_DAILY_REGIME_START}::date AND quality <> 'legacy'`));
        files.price_min_events = wr('price_min_events', await rows(tx, 'price_min_events', sql`master_product_id IN (${lit(sql, mIds)}) AND source = 'reconstructed'`));
        files.price_daily_offer = wr('price_daily_offer', await rows(tx, 'price_daily_offer', sql`master_product_id IN (${lit(sql, mIds)})`));
      }
      log.files = files;

      // 0) RETIPAR masters de console gravados com tipo errado (o master passa a ser o da identidade; nenhum é criado).
      for (const r of retypes) {
        const up = await tx.execute(sql`UPDATE master_products SET product_type = 'console', updated_at = now() WHERE id = ${r.id}::uuid AND product_type::text = ${r.from} RETURNING id`);
        if (up.length !== 1) throw new Error(`master ${r.id} mudou de tipo desde o plano`);
        (log.retyped as any[]).push({ id: r.id, name: r.name, from: r.from });
      }

      // 1) MOVER ofertas (+ linhas derivadas oferta-dia).
      for (const m of moves) {
        const r = await tx.execute(sql`UPDATE affiliate_offers SET master_product_id = ${m.toMasterId}::uuid, updated_at = now() WHERE id = ${m.offerId}::uuid AND master_product_id = ${m.fromMasterId}::uuid AND status = 'active' RETURNING id`);
        if (r.length !== 1) throw new Error(`oferta ${m.offerId} não pôde ser movida`);
        (log.moves as any[]).push({ offerId: m.offerId, from: m.fromMasterId, to: m.toMasterId, title: m.title, price: m.price });
      }
      if (moveIds.length) await tx.execute(sql`UPDATE price_daily_offer SET master_product_id = o.master_product_id FROM affiliate_offers o WHERE price_daily_offer.offer_id = o.id AND o.id IN (${lit(sql, moveIds)}) AND price_daily_offer.master_product_id <> o.master_product_id`);

      // 2) UNIR masters (mesmo procedimento de merge-duplicate-masters: todas as FKs, watches sem violar o unique, arquiva).
      if (unions.length) {
        const fks = (await tx.execute(sql`
          SELECT cl.relname AS "table", att.attname AS "column" FROM pg_constraint con
          JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
          JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
          WHERE con.contype = 'f' AND con.confrelid = 'public.master_products'::regclass AND ns.nspname = 'public'`)) as Array<{ table: string; column: string }>;
        for (const f of fks) if (!IDENT.test(f.table) || !IDENT.test(f.column)) throw new Error('identificador de FK inesperado');
        for (const u of unions) {
          const moved: Record<string, string[]> = {};
          const deactivated: string[] = [];
          const watches = await tx.execute(sql`SELECT id::text, user_id::text AS user_id FROM affiliate_price_watches WHERE master_product_id = ${u.dupId}::uuid`);
          for (const w of watches as any[]) {
            const ex = await tx.execute(sql`SELECT id FROM affiliate_price_watches WHERE user_id = ${w.user_id}::uuid AND master_product_id = ${u.canonicalId}::uuid`);
            if (ex.length) { await tx.execute(sql`UPDATE affiliate_price_watches SET is_active = false WHERE id = ${w.id}::uuid`); deactivated.push(w.id); }
            else { await tx.execute(sql`UPDATE affiliate_price_watches SET master_product_id = ${u.canonicalId}::uuid WHERE id = ${w.id}::uuid`); (moved['affiliate_price_watches.master_product_id'] ??= []).push(w.id); }
          }
          for (const f of fks) {
            if (f.table === 'affiliate_price_watches') continue;
            const r = await tx.execute(sql`UPDATE ${sql.raw(f.table)} SET ${sql.raw(f.column)} = ${u.canonicalId}::uuid WHERE ${sql.raw(f.column)} = ${u.dupId}::uuid RETURNING id::text AS id`);
            if (r.length) moved[`${f.table}.${f.column}`] = r.map((x: any) => x.id);
          }
          await tx.execute(sql`UPDATE price_daily_offer SET master_product_id = ${u.canonicalId}::uuid WHERE master_product_id = ${u.dupId}::uuid`);
          const note = { mergedInto: u.canonicalId, archived: true, mergedAt: new Date().toISOString(), mergedOfferIds: moved['affiliate_offers.master_product_id'] ?? [], mergedWatchIds: moved['affiliate_price_watches.master_product_id'] ?? [], deactivatedWatchIds: deactivated, mergedBy: 'auditar-consoles' };
          const up = await tx.execute(sql`UPDATE master_products SET attributes = attributes || ${JSON.stringify(note)}::jsonb, updated_at = now() WHERE id = ${u.dupId}::uuid AND (attributes->>'mergedInto') IS NULL RETURNING id`);
          if (up.length !== 1) throw new Error(`falha ao arquivar ${u.dupId}`);
          for (const f of fks) {
            const [{ n }] = await tx.execute(sql`SELECT count(*)::int AS n FROM ${sql.raw(f.table)} WHERE ${sql.raw(f.column)} = ${u.dupId}::uuid`);
            const allowed = f.table === 'affiliate_price_watches' ? deactivated.length : 0;
            if (Number(n) !== allowed) throw new Error(`restaram linhas em ${f.table} apontando para ${u.dupId}`);
          }
          (log.unions as any[]).push({ dupId: u.dupId, canonicalId: u.canonicalId, name: u.dupName, movedRows: moved, deactivatedWatchIds: deactivated });
        }
      }

      // 3) QUARENTENA (só marca; nada é apagado).
      for (const d of quar) {
        const r = await tx.execute(sql`UPDATE affiliate_offers SET quarantined_at = now() WHERE id = ${d.offerId}::uuid AND quarantined_at IS NULL RETURNING id`);
        if (r.length === 1) (log.quarantined as any[]).push({ offerId: d.offerId, price: d.price });
      }

      // 4) RECÁLCULO das métricas derivadas dos masters que continuam vivos (código existente).
      const recalc = survivors;
      if (recalc.length) {
        await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id IN (${lit(sql, recalc)}) AND day >= ${PRICE_DAILY_REGIME_START}::date AND quality <> 'legacy'`);
        const { rows: stRows } = await pd.computeStatesForBatch(tx, recalc, PRICE_DAILY_REGIME_START, today, now);
        await pd.upsertStates(tx, stRows);
        await tx.execute(sql`DELETE FROM price_min_events WHERE master_product_id IN (${lit(sql, recalc)}) AND source = 'reconstructed'`);
        const fromAt = new Date(`${PRICE_DAILY_REGIME_START}T03:00:00Z`);
        const recon = await pd.loadReconOffers(tx, recalc, fromAt.toISOString());
        for (const [pid, offs] of recon) await pd.insertEvents(tx, pid, ds.reconstructMinEvents(offs, fromAt), 'reconstructed');
      }

      const c1 = await cnt();
      if (c0.o !== c1.o || c0.s !== c1.s || c0.m !== c1.m) throw new Error('contagens de ofertas/cotações/masters mudaram: rollback');
      log.status = 'committed';
      log.verificacoes = { contagens: c1, mastersRecalculados: recalc.length };
      fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    });
  } catch (e) {
    if (fs.existsSync(logFile)) fs.renameSync(logFile, logFile + '.invalido');
    throw e;
  }
  console.log(`APLICADO. Log de reversão: ${path.relative(process.cwd(), logFile)}`);
  console.log(`Reverter: npx tsx --conditions=react-server --env-file=.env.local scripts/auditar-consoles.ts --rollback ${path.relative(process.cwd(), logFile)} --apply`);
  console.log('Depois: ?part=stats&force=1 e ?part=showcase&force=1 em /api/cron/refresh-snapshots (ou aguardar o cron de 15 min) e revalidar o cache das vitrines.');
}

const readNd = (f: string): any[] => { const t = fs.readFileSync(path.resolve(f), 'utf8').trim(); return t ? t.split('\n').map((l) => JSON.parse(l)) : []; };

async function rollback(file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (log.status !== 'committed') throw new Error('log sem status committed');
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db');
  const survivors: string[] = [...new Set<string>([...log.moves.flatMap((m: any) => [m.from, m.to]), ...log.unions.map((u: any) => u.canonicalId), ...(log.retyped ?? []).map((r: any) => r.id)])];
  const restoreIds = [...new Set<string>([...survivors, ...log.unions.map((u: any) => u.dupId)])];
  console.log(`${APPLY ? 'REVERTENDO' : 'DRY-RUN da reversão'}: ${log.moves.length} oferta(s) movida(s), ${log.unions.length} união(ões), ${log.quarantined.length} quarentena(s)`);
  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '300s'`);
      for (const q of log.quarantined) await tx.execute(sql`UPDATE affiliate_offers SET quarantined_at = NULL WHERE id = ${q.offerId}::uuid`);
      for (const u of [...log.unions].reverse()) {
        for (const [key, ids] of Object.entries<string[]>(u.movedRows)) {
          const [table, column] = key.split('.');
          if (!IDENT.test(table) || !IDENT.test(column)) throw new Error('identificador inesperado no log');
          if (ids.length) await tx.execute(sql`UPDATE ${sql.raw(table)} SET ${sql.raw(column)} = ${u.dupId}::uuid WHERE id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) AND ${sql.raw(column)} = ${u.canonicalId}::uuid`);
        }
        if (u.deactivatedWatchIds.length) await tx.execute(sql`UPDATE affiliate_price_watches SET is_active = true WHERE id IN (${sql.join(u.deactivatedWatchIds.map((i: string) => sql`${i}::uuid`), sql`, `)})`);
        await tx.execute(sql`UPDATE master_products SET attributes = attributes - 'mergedInto' - 'archived' - 'mergedAt' - 'mergedOfferIds' - 'mergedWatchIds' - 'deactivatedWatchIds' - 'mergedBy', updated_at = now() WHERE id = ${u.dupId}::uuid`);
      }
      for (const m of [...log.moves].reverse()) await tx.execute(sql`UPDATE affiliate_offers SET master_product_id = ${m.from}::uuid, updated_at = now() WHERE id = ${m.offerId}::uuid AND master_product_id = ${m.to}::uuid`);
      for (const r of log.retyped ?? []) await tx.execute(sql`UPDATE master_products SET product_type = ${r.from}::product_type, updated_at = now() WHERE id = ${r.id}::uuid AND product_type = 'console'`);
      // Tabelas derivadas: volta ao retrato salvo (apaga o recalculado dos masters tocados e reinsere o backup).
      const ids = sql.join(restoreIds.map((i) => sql`${i}::uuid`), sql`, `);
      await tx.execute(sql`DELETE FROM price_daily_offer WHERE master_product_id IN (${ids})`);
      await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id IN (${ids}) AND day >= ${PRICE_DAILY_REGIME_START}::date AND quality <> 'legacy'`);
      await tx.execute(sql`DELETE FROM price_min_events WHERE master_product_id IN (${ids}) AND source = 'reconstructed'`);
      for (const [name, table] of [['price_daily_offer', 'price_daily_offer'], ['price_daily_state', 'price_daily_state'], ['price_min_events', 'price_min_events']] as const) {
        const data = log.files[name] ? readNd(log.files[name]) : [];
        if (data.length) await tx.execute(sql`INSERT INTO ${sql.raw(table)} SELECT * FROM jsonb_populate_recordset(NULL::${sql.raw(table)}, ${JSON.stringify(data)}::jsonb)`);
      }
      // Verificação: ofertas voltaram aos masters do backup.
      const bk = readNd(log.files.offers_of_masters ?? log.files.affiliate_offers);
      const live = await tx.execute(sql`SELECT id::text, master_product_id::text AS mid FROM affiliate_offers WHERE id IN (${sql.join(bk.map((r: any) => sql`${r.id}::uuid`), sql`, `)})`);
      const m = new Map<string, string>(live.map((r: any) => [r.id, r.mid]));
      const bad = bk.filter((r: any) => m.get(r.id) !== r.master_product_id).length;
      console.log(`Verificação: ${bk.length - bad} de ${bk.length} ofertas de volta ao master do backup.`);
      if (bad) throw new Error('reversão incompleta: rollback da reversão');
      if (!APPLY) throw new DryAbort();
    });
    console.log('REVERTIDO.');
  } catch (e) {
    if (!(e instanceof DryAbort)) throw e;
    console.log('DRY-RUN da reversão: transação desfeita.');
  }
}

async function main() {
  const rb = arg('--rollback');
  if (rb) { await rollback(rb); process.exit(0); }
  if (APPLY) { await applyPlan(); process.exit(0); }
  const sql = connect();
  try {
    const plan = await sql.begin('read only', async (tx) => buildPlan(tx as unknown as Sql));
    fs.mkdirSync(PLAN_DIR, { recursive: true });
    const f = path.join(PLAN_DIR, `auditar-consoles-plano-${stamp}.json`);
    fs.writeFileSync(f, JSON.stringify(plan, null, 2));
    const lines: string[] = [];
    printSummary(plan, lines);
    const txt = path.join(PLAN_DIR, `auditar-consoles-resumo-${stamp}.txt`);
    fs.writeFileSync(txt, lines.join('\n'));
    console.log(lines.join('\n'));
    console.log(`\nPlano: ${path.relative(process.cwd(), f)}\nResumo: ${path.relative(process.cwd(), txt)}\nDRY-RUN: nada foi escrito no banco.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => { console.error('FALHA:', e instanceof Error ? (e.stack ?? e.message) : e); process.exit(1); });
