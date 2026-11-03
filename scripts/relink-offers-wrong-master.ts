/**
 * Relink de ofertas ATIVAS ligadas ao master errado (Fase 0 do conselho de
 * 2026-11-01; regra do dono: separar tudo, juntar só item IDÊNTICO).
 *
 *   npx tsx scripts/relink-offers-wrong-master.ts                # dry-run (padrão): só SELECT
 *   npx tsx scripts/relink-offers-wrong-master.ts --apply        # ESCREVE (exige autorização do dono)
 *
 * Opções:
 *   --limit N                  --apply move só as N primeiras ofertas do plano (lote pequeno primeiro)
 *   --backup-max-age-hours H   idade máxima do backup em backup/dados (padrão 12)
 *
 * Dry-run (somente leitura, duas conexões no máximo, consultas sequenciais):
 *   1. Detecta ofertas ativas cujo título contradiz o master (numeral de
 *      sequência, plataforma, franquia/título, composição, edição, condição).
 *   2. Para cada uma procura DESTINO: master ativo (sem mergedInto) IDÊNTICO ao
 *      título da oferta (mesma regra de findExistingMasterProduct: isSameProduct
 *      com Jaccard >= 0,8, mesmos marcadores de edição e mesmos numerais, mesma
 *      plataforma RESOLVIDA, mesmo tipo, mesmo formato). A busca roda em memória
 *      sobre a lista de masters já carregada (a função oficial abre pool e uma
 *      consulta por oferta). Nunca cria master. Sem destino único = "sem destino".
 *      Plataforma 'unknown' nunca é padrão: deriva do título da oferta e, se não
 *      houver, da plataforma não contradita do master atual; senão não move.
 *   3. Grava docs/relink-ofertas-dryrun-2026-11-01.csv (+ resumo por motivo) e
 *      docs/precos-absurdos-quarentena-2026-11-01.csv.
 *
 * --apply: só confiança ALTA com destino único idêntico. Exige backup de
 * backup/dados <= 12 h que contenha as ofertas e os masters do plano
 * (rode `node --env-file=.env.local backup/backup-pre-fusao.mjs`). Uma
 * transação: trava as ofertas, revalida (continuam ativas, no master esperado,
 * destino não arquivado), troca SOMENTE affiliate_offers.master_product_id
 * (cotações acompanham a oferta; nenhum valor é reescrito; nada é apagado),
 * confere contagem de ofertas e de cotações por oferta e só então grava o log
 * reversível backup/dados/relink-log-*.json (offer_id, master_antigo,
 * master_novo) antes do COMMIT. Nenhuma credencial é impressa.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  compareIdentity,
  isSameProduct,
  mentionsMultipleGenerations,
  normalizeTitle,
  numeralsOf,
  unifyNumerals,
  type MasterRow,
  type NormalizedTitle,
} from '../src/lib/affiliate/dedup';
import { derivePlatformFromTitle } from '../src/lib/affiliate/game-classification';
import { connect, csvCell, describeBackup, readBackupIds, type Sql, type Tx } from './_dup-shared';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = argValue('--limit') ? Number(argValue('--limit')) : undefined;
const MAX_AGE = argValue('--backup-max-age-hours') ? Number(argValue('--backup-max-age-hours')) : 12;

const DATE = '2026-11-01';
const DOCS = path.resolve(process.cwd(), 'docs');
const FRESH_DAYS = 7; // ADR 0002 (OFFER_FRESHNESS_DAYS)
const FLOOR = 0.35; // ADR 0002 (PLAUSIBILITY_FLOOR_PERCENT)
const MIN_OFFERS = 3; // ADR 0002 (PLAUSIBILITY_MIN_OFFERS)
const ABSURD_CENTS = 50_000 * 100;
const RATIO_MIN = 0.35;
const RATIO_MAX = 3;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Confidence = 'alta' | 'media' | 'baixa';
const CONF_RANK: Record<Confidence, number> = { alta: 3, media: 2, baixa: 1 };

type ReasonCode =
  | 'numeral_sequencia'
  | 'plataforma'
  | 'franquia_titulo'
  | 'composicao'
  | 'edicao'
  | 'condicao_regiao'
  | 'numeral_ausente'
  | 'capacidade'
  | 'variante'
  | 'geracao_cruzada';

interface Reason {
  code: ReasonCode;
  confidence: Confidence;
  detail: string;
}

interface MasterFull extends MasterRow {
  edition: string;
}

interface OfferRow {
  id: string;
  masterId: string;
  title: string;
  status: string;
  priceCents: number;
  networkId: string;
  storeName: string | null;
  sellerId: string | null;
  lastCheckedAt: Date | null;
  lastPriceChangeAt: Date | null;
  createdAt: Date;
}

interface MasterInfo {
  m: MasterFull;
  n: NormalizedTitle;
  /** plataforma efetiva: o nome do master vence um cadastro contraditório; senão o cadastro. */
  platform: string;
  digital: boolean;
}

interface Flagged {
  offer: OfferRow;
  master: MasterInfo;
  reasons: Reason[];
  primary: Reason;
  confidence: Confidence;
  destination: MasterInfo | null;
  /** 'mover' | 'sem_destino' | 'destino_ambiguo' | 'plataforma_nao_resolvida' | 'revisao' */
  plan: string;
  ambiguous: MasterInfo[];
  snapshots: number;
}

// ---------------------------------------------------------------------------
// Identidade: numerais, plataforma, marcadores
// ---------------------------------------------------------------------------

function coreTokens(core: string): string[] {
  return core.split(' ').filter(Boolean);
}

// Numerais (dígitos, romanos e anos: 4 = IV, 24 = 2024) vêm de dedup.ts (numeralsOf / unifyNumerals):
// UMA regra só para o dedup e para o relink (auditoria de pureza 2026-11-03).

/** Tokens de nome (sem numerais), base da checagem de franquia/título. */
function wordTokens(core: string): Set<string> {
  const toks = coreTokens(core);
  return new Set(
    toks.filter(
      (t, i) => !/^\d+$/.test(t) && unifyNumerals(toks)[i] === t && !GENERIC_TOKENS.has(t)
    )
  );
}

/** Termos de plataforma/marca que sobram no núcleo e não identificam a franquia. */
const GENERIC_TOKENS = new Set([
  'wii', 'wiiu', 'ds', '3ds', '2ds', 'ps1', 'ps2', 'ps3', 'psp', 'vita', 'gamecube', 'n64', 'snes', 'nes', 'gba',
  'sega', 'genesis', 'mega', 'drive', 'dreamcast', 'atari', 'pc', 'xbox', 'one', 'series', 'serie', 'x', 's',
  'sony', 'microsoft', 'nintendo', 'playstation', 'switch', 'ou', 'e', 'a', 'o',
]);

/** Plataformas legadas fora do enum game_platform_gen: o título as cita, o cadastro não consegue representá-las. */
const LEGACY_PLATFORM_RE =
  /\b(wii\s*u|wii|3ds|2ds|ds|ps\s*[123]|psp|vita|gamecube|game\s*cube|n64|nintendo\s*64|snes|nes|gba|game\s*boy|dreamcast|mega\s*drive|master\s*system|atari|playstation\s*[123]|ps\s*one|psone)\b/;
function mentionsLegacyPlatform(title: string): boolean {
  return LEGACY_PLATFORM_RE.test(title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const CONDITION_MARKERS = new Set([
  'loose', 'usado', 'seminovo', 'openbox', 'japao', 'importado', 'regiaousa', 'regiaoeur', 'regiaoasia',
  'espanhol', 'spanish', 'ingles',
]);
const COMPOSITION_MARKERS = new Set([
  'dlc', 'upgrade', 'expansao', 'pass', 'bundle', 'kit', 'lote', 'combo', 'trilogy',
  'encarte', 'caixavazia', 'faceplate', 'capa', 'case', 'somente', 'apenas', 'replica', 'manual',
  'amiibo', 'controle', 'console', 'volante', 'cabo', 'dock', 'headset', 'suporte', 'carregador',
  'sem', 'cartao', 'codigo', 'pelucia', 'funko', 'miniatura', 'poster', 'camiseta',
]);
/** Marcador presente SÓ na oferta que prova que ela não é o jogo completo/novo do master. */
const STRONG_OFFER_ONLY = new Set([
  'dlc', 'upgrade', 'expansao', 'pass', 'bundle', 'kit', 'lote', 'combo', 'encarte', 'caixavazia',
  'usado', 'seminovo', 'loose', 'openbox', 'codigo', 'faceplate',
]);

function effectivePlatform(name: string, dbPlatform: string): string {
  const fromName = derivePlatformFromTitle(name);
  return fromName !== 'unknown' ? fromName : dbPlatform;
}

function toInfo(m: MasterFull): MasterInfo {
  const n = normalizeTitle(m.name);
  return {
    m,
    n,
    platform: effectivePlatform(m.name, m.gamePlatformGen),
    digital: m.gameFormat === 'digital' || n.markers.includes('digital'),
  };
}

function analyzeOffer(title: string, master: MasterInfo): Reason[] {
  const reasons: Reason[] = [];
  const o = normalizeTitle(title);
  const mn = master.n;
  if (!o.coreTitle) return reasons;
  const isGame = master.m.productType === 'game';

  // 1. Numeral de sequência.
  const oNum = numeralsOf(o.coreTitle);
  const mNum = numeralsOf(mn.coreTitle);
  if (oNum.length && mNum.length && !sameList(oNum, mNum)) {
    reasons.push({
      code: 'numeral_sequencia',
      confidence: isGame ? 'alta' : 'media',
      detail: `numerais oferta [${oNum.join(',')}] x master [${mNum.join(',')}]`,
    });
  } else if (oNum.length !== mNum.length && (oNum.length === 0 || mNum.length === 0) && isGame) {
    reasons.push({
      code: 'numeral_ausente',
      confidence: 'media',
      detail: `numerais oferta [${oNum.join(',')}] x master [${mNum.join(',')}]`,
    });
  }

  // 2. Plataforma (título da oferta x plataforma efetiva do master).
  const oPlat = mentionsMultipleGenerations(title) ? 'unknown' : derivePlatformFromTitle(title);
  const mPlat = mentionsMultipleGenerations(master.m.name) ? 'unknown' : master.platform;
  if (oPlat !== 'unknown' && mPlat !== 'unknown' && oPlat !== mPlat) {
    reasons.push({
      code: 'plataforma',
      confidence: master.m.productType === 'accessory' ? 'media' : 'alta',
      detail: `plataforma oferta ${oPlat} x master ${mPlat}`,
    });
  }

  // 3. Franquia/título (cobertura dos tokens do master no título da oferta).
  const ow = wordTokens(o.coreTitle);
  const mw = wordTokens(mn.coreTitle);
  if (mw.size > 0) {
    let shared = 0;
    for (const t of mw) if (ow.has(t)) shared++;
    const cov = shared / mw.size;
    if (shared === 0) {
      reasons.push({
        code: 'franquia_titulo',
        confidence: mw.size >= 2 && ow.size >= 1 ? 'alta' : 'media',
        detail: `nenhum termo em comum: oferta {${[...ow].slice(0, 6).join(' ')}} x master {${[...mw].slice(0, 6).join(' ')}}`,
      });
    } else if (cov < 0.5) {
      reasons.push({
        code: 'franquia_titulo',
        confidence: 'media',
        detail: `cobertura do master no título da oferta ${(cov * 100).toFixed(0)}%`,
      });
    }
  }

  // 4. Edição, composição e condição (marcadores).
  if (isGame) {
    const oSet = new Set(o.markers);
    const mSet = new Set(mn.markers);
    const offerOnly = o.markers.filter((x) => !mSet.has(x));
    const masterOnly = mn.markers.filter((x) => !oSet.has(x));
    for (const mk of offerOnly) {
      const strong = STRONG_OFFER_ONLY.has(mk);
      const code: ReasonCode = COMPOSITION_MARKERS.has(mk) ? 'composicao' : CONDITION_MARKERS.has(mk) ? 'condicao_regiao' : 'edicao';
      reasons.push({
        code,
        confidence: strong ? 'alta' : 'media',
        detail: `marcador só na oferta: ${mk}`,
      });
    }
    for (const mk of masterOnly) {
      const code: ReasonCode = COMPOSITION_MARKERS.has(mk) ? 'composicao' : CONDITION_MARKERS.has(mk) ? 'condicao_regiao' : 'edicao';
      reasons.push({ code, confidence: 'baixa', detail: `marcador só no master: ${mk}` });
    }
  } else {
    // Console/acessório: só condição (usado/seminovo/importado) distingue com segurança.
    const oSet = new Set(o.markers);
    const mSet = new Set(mn.markers);
    for (const mk of o.markers) {
      if (CONDITION_MARKERS.has(mk) && !mSet.has(mk)) {
        reasons.push({ code: 'condicao_regiao', confidence: 'media', detail: `marcador só na oferta: ${mk}` });
      }
    }
    for (const mk of mn.markers) {
      if (CONDITION_MARKERS.has(mk) && !oSet.has(mk)) {
        reasons.push({ code: 'condicao_regiao', confidence: 'baixa', detail: `marcador só no master: ${mk}` });
      }
    }
  }

  // 5. Eixos de hardware e geração (mesmo motor de identidade do dedup e da coleta).
  const o2 = normalizeTitle(title, { productType: master.m.productType });
  const m2 = normalizeTitle(master.m.name, { productType: master.m.productType });
  for (const d of compareIdentity(o2, m2)) {
    if (!d.hard) continue;
    if (d.axis === 'capacidade') reasons.push({ code: 'capacidade', confidence: 'alta', detail: d.detail });
    else if (d.axis === 'variante') reasons.push({ code: 'variante', confidence: 'alta', detail: d.detail });
    else if (d.axis === 'geracao_cruzada') reasons.push({ code: 'geracao_cruzada', confidence: 'media', detail: d.detail });
  }

  return reasons;
}

const REASON_PRIORITY: ReasonCode[] = [
  'numeral_sequencia', 'plataforma', 'capacidade', 'variante', 'franquia_titulo', 'composicao', 'condicao_regiao', 'edicao',
  'geracao_cruzada', 'numeral_ausente',
];

function pickPrimary(reasons: Reason[]): Reason {
  return [...reasons].sort(
    (a, b) =>
      CONF_RANK[b.confidence] - CONF_RANK[a.confidence] ||
      REASON_PRIORITY.indexOf(a.code) - REASON_PRIORITY.indexOf(b.code)
  )[0];
}

// ---------------------------------------------------------------------------
// Destino idêntico (espelha findExistingMasterProduct, em memória)
// ---------------------------------------------------------------------------

function findIdenticalDestinations(
  offer: OfferRow,
  current: MasterInfo,
  masters: MasterInfo[]
): { matches: MasterInfo[]; unresolvedPlatform: boolean } {
  const o = normalizeTitle(offer.title);
  if (!o.coreTitle) return { matches: [], unresolvedPlatform: false };
  // Plataforma do título da oferta; se o título não diz, a do master atual quando
  // NÃO contradita (nunca 'unknown' por padrão).
  let platform: string = mentionsMultipleGenerations(offer.title) ? 'unknown' : derivePlatformFromTitle(offer.title);
  if (platform === 'unknown' && mentionsLegacyPlatform(offer.title)) return { matches: [], unresolvedPlatform: true };
  if (platform === 'unknown' && !mentionsLegacyPlatform(current.m.name)) {
    platform = mentionsMultipleGenerations(current.m.name) ? 'unknown' : current.platform;
  }
  if (platform === 'unknown') return { matches: [], unresolvedPlatform: true };
  const oDigital = o.markers.includes('digital');
  const matches: MasterInfo[] = [];
  for (const c of masters) {
    if (c.m.id === current.m.id) continue;
    if (c.m.mergedInto) continue;
    if (c.m.productType !== current.m.productType) continue;
    if (c.platform !== platform) continue;
    if (c.digital !== oDigital) continue;
    if (!isSameProduct(o, c.n, 0.8)) continue;
    // O destino não pode ser, ele próprio, contraditado pelo título da oferta.
    if (analyzeOffer(offer.title, c).some((r) => CONF_RANK[r.confidence] >= CONF_RANK.media)) continue;
    matches.push(c);
  }
  return { matches, unresolvedPlatform: false };
}

// ---------------------------------------------------------------------------
// Leitura (uma consulta por vez, transação READ ONLY)
// ---------------------------------------------------------------------------

async function readOnly<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin('read only', async (tx) => {
    await tx`SET LOCAL statement_timeout = '120s'`;
    return fn(tx);
  })) as T;
}

async function loadMasters(sql: Sql): Promise<MasterFull[]> {
  const rows = await readOnly(sql, (tx) => tx<
    {
      id: string; name: string; product_type: string; game_platform_gen: string; game_format: string;
      game_edition_type: string; created_at: Date; merged_into: string | null;
    }[]
  >`SELECT id, name, product_type::text, game_platform_gen::text, game_format::text, game_edition_type::text, created_at,
           attributes ->> 'mergedInto' AS merged_into
    FROM master_products`);
  return rows.map((r) => ({
    id: r.id, name: r.name, productType: r.product_type, gamePlatformGen: r.game_platform_gen,
    gameFormat: r.game_format, edition: r.game_edition_type, createdAt: r.created_at, mergedInto: r.merged_into,
    activeOffers: 0, totalOffers: 0, snapshots: 0,
  }));
}

async function loadOffers(sql: Sql): Promise<OfferRow[]> {
  const rows = await readOnly(sql, (tx) => tx<
    {
      id: string; master_product_id: string; title: string; status: string; current_price_cents: string | number;
      network_id: string; store_name: string | null; seller_id: string | null;
      last_checked_at: Date | null; last_price_change_at: Date | null; created_at: Date;
    }[]
  >`SELECT id, master_product_id, title, status::text, current_price_cents, network_id, store_name, seller_id,
           last_checked_at, last_price_change_at, created_at
    FROM affiliate_offers`);
  return rows.map((r) => ({
    id: r.id, masterId: r.master_product_id, title: r.title, status: r.status,
    priceCents: Number(r.current_price_cents), networkId: r.network_id, storeName: r.store_name,
    sellerId: r.seller_id, lastCheckedAt: r.last_checked_at, lastPriceChangeAt: r.last_price_change_at,
    createdAt: r.created_at,
  }));
}

/** Cotações (snapshots) por oferta, em lotes pequenos e sequenciais. */
async function countSnapshots(sql: Sql, offerIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < offerIds.length; i += 150) {
    const chunk = offerIds.slice(i, i + 150);
    const rows = await readOnly(sql, (tx) => tx<{ offer_id: string; n: string }[]>`
      SELECT offer_id::text AS offer_id, count(*) AS n FROM affiliate_price_snapshots
      WHERE offer_id = ANY(${chunk}::uuid[]) GROUP BY offer_id`);
    for (const r of rows) out.set(r.offer_id, Number(r.n));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Estatística simples (dados reais, sem interpolar valores de preço exibidos)
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const a = [...values].sort((x, y) => x - y);
  const n = a.length;
  if (!n) return NaN;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Plano
// ---------------------------------------------------------------------------

function buildPlan(masters: MasterInfo[], offers: OfferRow[]) {
  const byId = new Map(masters.map((m) => [m.m.id, m]));
  const live = masters.filter((m) => !m.m.mergedInto);
  const active = offers.filter((o) => o.status === 'active');
  let orphan = 0;
  let onArchived = 0;
  const flagged: Flagged[] = [];
  const identityFlaggedIds = new Set<string>();

  for (const offer of active) {
    const master = byId.get(offer.masterId);
    if (!master) { orphan++; continue; }
    if (master.m.mergedInto) { onArchived++; continue; }
    const reasons = analyzeOffer(offer.title, master);
    if (!reasons.length) continue;
    const primary = pickPrimary(reasons);
    const confidence = primary.confidence;
    if (CONF_RANK[confidence] >= CONF_RANK.media) identityFlaggedIds.add(offer.id);
    // baixa não vira lista de relink: só revisão informativa.
    const { matches, unresolvedPlatform } = findIdenticalDestinations(offer, master, live);
    let destination: MasterInfo | null = null;
    let plan: string;
    if (matches.length === 1) {
      destination = matches[0];
      plan = confidence === 'alta' ? 'mover' : 'revisao';
    } else if (matches.length > 1) {
      plan = 'destino_ambiguo';
    } else {
      plan = unresolvedPlatform ? 'plataforma_nao_resolvida' : 'sem_destino';
    }
    flagged.push({ offer, master, reasons, primary, confidence, destination, plan, ambiguous: matches.length > 1 ? matches : [], snapshots: 0 });
  }
  return { flagged, identityFlaggedIds, activeCount: active.length, orphan, onArchived };
}

function buildQuarantine(masters: MasterInfo[], offers: OfferRow[], identityFlaggedIds: Set<string>) {
  const byId = new Map(masters.map((m) => [m.m.id, m]));
  const now = Date.now();
  const freshMs = FRESH_DAYS * 86_400_000;
  // Redes "vivas" (ADR 0002): oferta criada antes da janela cujo preço mudou dentro dela.
  const liveNetworks = new Set(
    offers
      .filter((o) => o.createdAt.getTime() < now - freshMs && o.lastPriceChangeAt && o.lastPriceChangeAt.getTime() >= now - freshMs)
      .map((o) => o.networkId)
  );
  const active = offers.filter((o) => o.status === 'active' && o.priceCents > 0);
  const fresh = active.filter(
    (o) =>
      o.lastCheckedAt && o.lastCheckedAt.getTime() >= now - freshMs &&
      ((o.lastPriceChangeAt ?? o.createdAt).getTime() >= now - freshMs || liveNetworks.has(o.networkId))
  );
  const freshByMaster = new Map<string, OfferRow[]>();
  for (const o of fresh) (freshByMaster.get(o.masterId) ?? freshByMaster.set(o.masterId, []).get(o.masterId)!).push(o);
  const freshSet = new Set(fresh.map((o) => o.id));
  const isPublicFast = (o: OfferRow): boolean => {
    if (!freshSet.has(o.id)) return false;
    const list = freshByMaster.get(o.masterId)!;
    if (list.length < MIN_OFFERS) return true;
    return o.priceCents > median(list.map((x) => x.priceCents)) * FLOOR;
  };

  // Mediana do master sobre ofertas ativas com título idêntico (sem sinal de identidade média/alta).
  const cleanByMaster = new Map<string, OfferRow[]>();
  for (const o of active) {
    if (identityFlaggedIds.has(o.id)) continue;
    (cleanByMaster.get(o.masterId) ?? cleanByMaster.set(o.masterId, []).get(o.masterId)!).push(o);
  }

  const rows: Array<{
    offer: OfferRow; master: MasterInfo | undefined; medianCents: number; n: number; ratio: number | null;
    motivos: string[]; publica: boolean; nivel: string; z: number | null;
  }> = [];
  for (const o of active) {
    if (identityFlaggedIds.has(o.id)) continue; // título não idêntico: tratado no relink, não é caso de preço
    const master = byId.get(o.masterId);
    const clean = cleanByMaster.get(o.masterId) ?? [];
    const med = clean.length >= MIN_OFFERS ? median(clean.map((x) => x.priceCents)) : NaN;
    const ratio = Number.isFinite(med) && med > 0 ? o.priceCents / med : null;
    const motivos: string[] = [];
    if (o.priceCents > ABSURD_CENTS) motivos.push('acima_de_R$50.000');
    if (ratio !== null && ratio < RATIO_MIN) motivos.push('razao_abaixo_de_0,35');
    if (ratio !== null && ratio > RATIO_MAX) motivos.push('razao_acima_de_3');
    // Cauda inferior robusta (parecer do estatístico, S5): z em log > 3,5 abaixo da mediana e desvio > 20%,
    // só com >= 10 ofertas limpas. Entra como REVISÃO (não é quarentena automática).
    let z: number | null = null;
    if (clean.length >= 10 && Number.isFinite(med) && med > 0) {
      const logs = clean.map((x) => Math.log(x.priceCents));
      const lm = Math.log(med);
      const mad = median(logs.map((v) => Math.abs(v - lm)));
      const sc = 1.4826 * mad;
      if (sc > 0) z = (Math.log(o.priceCents) - lm) / sc;
      if (z !== null && z < -3.5 && Math.abs(o.priceCents / med - 1) > 0.2) motivos.push('cauda_inferior_robusta');
    }
    if (!motivos.length) continue;
    const nivel = motivos.some((m) => m !== 'cauda_inferior_robusta') ? 'quarentena' : 'revisao';
    rows.push({ offer: o, master, medianCents: med, n: clean.length, ratio, motivos, publica: isPublicFast(o), nivel, z });
  }
  rows.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'quarentena' ? -1 : 1) || b.offer.priceCents - a.offer.priceCents);
  return rows;
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

function writeCsv(file: string, header: string[], lines: unknown[][]) {
  const body = [header.join(';'), ...lines.map((l) => l.map(csvCell).join(';'))].join('\n');
  fs.writeFileSync(file, '﻿' + body, 'utf8');
}

function planLabel(p: string): string {
  return (
    { mover: 'mover (destino idêntico)', revisao: 'revisão (destino idêntico, confiança < alta)', sem_destino: 'sem destino',
      destino_ambiguo: 'destino ambíguo (>1 master idêntico)', plataforma_nao_resolvida: 'sem destino (plataforma não resolvida)' } as Record<string, string>
  )[p] ?? p;
}

async function main() {
  const sql = connect();
  try {
    console.log(`Modo: ${APPLY ? 'APPLY (escreve)' : 'DRY-RUN (somente SELECT)'}`);
    const masterRows = await loadMasters(sql);
    console.log(`Masters lidos: ${masterRows.length}`);
    const offers = await loadOffers(sql);
    console.log(`Ofertas lidas: ${offers.length} (ativas: ${offers.filter((o) => o.status === 'active').length})`);

    const masters = masterRows.map(toInfo);
    const { flagged, identityFlaggedIds, activeCount, orphan, onArchived } = buildPlan(masters, offers);

    // Cotações afetadas: só das ofertas sinalizadas (média/alta e as que têm destino).
    const toCount = flagged.filter((f) => CONF_RANK[f.confidence] >= CONF_RANK.media).map((f) => f.offer.id);
    const snaps = await countSnapshots(sql, toCount);
    for (const f of flagged) f.snapshots = snaps.get(f.offer.id) ?? 0;

    flagged.sort(
      (a, b) =>
        CONF_RANK[b.confidence] - CONF_RANK[a.confidence] ||
        a.master.m.name.localeCompare(b.master.m.name) ||
        a.offer.title.localeCompare(b.offer.title)
    );

    // --- CSV de relink -------------------------------------------------
    const relinkFile = path.join(DOCS, `relink-ofertas-dryrun-${DATE}.csv`);
    writeCsv(
      relinkFile,
      [
        'oferta_id', 'titulo_oferta', 'loja', 'preco_atual_brl', 'master_atual_id', 'master_atual_nome',
        'master_destino_id', 'master_destino_nome', 'motivo', 'todos_os_motivos', 'confianca', 'situacao',
        'cotacoes_afetadas', 'candidatos_ambiguos',
      ],
      flagged.map((f) => [
        f.offer.id, f.offer.title, f.offer.storeName ?? '', brl(f.offer.priceCents), f.master.m.id, f.master.m.name,
        f.destination?.m.id ?? '', f.destination?.m.name ?? '', f.primary.code,
        f.reasons.map((r) => `${r.code}[${r.confidence}]: ${r.detail}`).join(' | '), f.confidence, planLabel(f.plan),
        CONF_RANK[f.confidence] >= CONF_RANK.media ? f.snapshots : '',
        f.ambiguous.map((m) => `${m.m.id} ${m.m.name}`).join(' || '),
      ])
    );

    // --- Resumo por motivo ---------------------------------------------
    const key = (f: Flagged) => `${f.primary.code}|${f.confidence}`;
    const groups = new Map<string, Flagged[]>();
    for (const f of flagged) (groups.get(key(f)) ?? groups.set(key(f), []).get(key(f))!).push(f);
    const summaryRows = [...groups.entries()]
      .map(([k, list]) => {
        const [code, conf] = k.split('|');
        return [
          code, conf, list.length,
          list.filter((f) => f.plan === 'mover').length,
          list.filter((f) => f.plan === 'revisao').length,
          list.filter((f) => f.plan === 'sem_destino' || f.plan === 'plataforma_nao_resolvida').length,
          list.filter((f) => f.plan === 'destino_ambiguo').length,
          new Set(list.map((f) => f.master.m.id)).size,
          CONF_RANK[conf as Confidence] >= CONF_RANK.media ? list.reduce((a, f) => a + f.snapshots, 0) : '',
        ];
      })
      .sort((a, b) => CONF_RANK[b[1] as Confidence] - CONF_RANK[a[1] as Confidence] || Number(b[2]) - Number(a[2]));
    const summaryFile = path.join(DOCS, `relink-ofertas-dryrun-${DATE}-resumo.csv`);
    writeCsv(
      summaryFile,
      ['motivo', 'confianca', 'ofertas', 'mover_destino_identico', 'revisao_destino_conf_menor', 'sem_destino', 'destino_ambiguo', 'masters_afetados', 'cotacoes_afetadas'],
      summaryRows
    );

    // --- Quarentena de preços ------------------------------------------
    const quar = buildQuarantine(masters, offers, identityFlaggedIds);
    const quarFile = path.join(DOCS, `precos-absurdos-quarentena-${DATE}.csv`);
    writeCsv(
      quarFile,
      [
        'oferta_id', 'titulo_oferta', 'loja', 'vendedor_id', 'preco_brl', 'master_id', 'master_nome',
        'mediana_master_brl', 'ofertas_na_mediana', 'razao_preco_mediana', 'z_robusto_log', 'motivo', 'nivel', 'publica_hoje_adr0002',
      ],
      quar.map((q) => [
        q.offer.id, q.offer.title, q.offer.storeName ?? '', q.offer.sellerId ?? '', brl(q.offer.priceCents),
        q.offer.masterId, q.master?.m.name ?? '', Number.isFinite(q.medianCents) ? brl(q.medianCents) : '', q.n,
        q.ratio === null ? '' : q.ratio.toFixed(2).replace('.', ','), q.z === null ? '' : q.z.toFixed(1).replace('.', ','),
        q.motivos.join('+'), q.nivel, q.publica ? 'sim' : 'nao',
      ])
    );

    // --- Console -------------------------------------------------------
    const nBy = (c: Confidence) => flagged.filter((f) => f.confidence === c).length;
    const moves = flagged.filter((f) => f.plan === 'mover');
    console.log('');
    console.log(`Ofertas ativas analisadas: ${activeCount} (sem master: ${orphan}; em master arquivado: ${onArchived})`);
    console.log(`Ofertas com título contraditório: ${flagged.length} (alta ${nBy('alta')}, média ${nBy('media')}, baixa ${nBy('baixa')})`);
    console.log(
      `Plano: mover (alta + destino idêntico único) ${moves.length}; revisão com destino ${flagged.filter((f) => f.plan === 'revisao').length}; ` +
        `sem destino ${flagged.filter((f) => f.plan === 'sem_destino' || f.plan === 'plataforma_nao_resolvida').length}; ambíguo ${flagged.filter((f) => f.plan === 'destino_ambiguo').length}`
    );
    console.log(`Cotações das ofertas a mover: ${moves.reduce((a, f) => a + f.snapshots, 0)}`);
    console.log('Resumo por motivo [motivo, confiança, ofertas, mover, revisão, sem destino, ambíguo, masters, cotações]:');
    for (const r of summaryRows) console.log('  ' + r.join(' | '));
    console.log(`Preços fora do padrão: ${quar.length} ofertas (quarentena ${quar.filter((q) => q.nivel === 'quarentena').length}, revisão cauda inferior ${quar.filter((q) => q.nivel === 'revisao').length}; públicas hoje: ${quar.filter((q) => q.publica).length})`);
    for (const q of quar.slice(0, 12)) {
      console.log(`  R$ ${brl(q.offer.priceCents)} | ${q.motivos.join('+')} | ${q.master?.m.name ?? '?'} | pública: ${q.publica ? 'sim' : 'não'}`);
    }
    console.log(`Arquivos: ${path.relative(process.cwd(), relinkFile)}, ${path.relative(process.cwd(), summaryFile)}, ${path.relative(process.cwd(), quarFile)}`);

    // --- Backup --------------------------------------------------------
    const backup = describeBackup(process.cwd(), MAX_AGE);
    for (const i of backup.info) {
      console.log(`Backup ${i.file}: ${i.exists ? `${i.ageHours.toFixed(1)}h de idade, ${i.bytes} bytes` : 'AUSENTE'}`);
    }
    const backupOffers = readBackupIds(path.join(backup.dir, 'affiliate_offers.ndjson'));
    const backupMasters = readBackupIds(path.join(backup.dir, 'master_products.ndjson'));
    const toMove = LIMIT !== undefined ? moves.slice(0, LIMIT) : moves;
    const missOffers = toMove.filter((f) => !backupOffers.has(f.offer.id)).length;
    const missMasters = new Set(
      toMove.flatMap((f) => [f.master.m.id, f.destination!.m.id]).filter((id) => !backupMasters.has(id))
    ).size;
    console.log(`Plano ausente no backup: ofertas ${missOffers}, masters ${missMasters}`);
    const backupOk = backup.ok && missOffers === 0 && missMasters === 0;

    if (!APPLY) {
      console.log(
        backupOk
          ? 'Backup OK para --apply.'
          : `ATENÇÃO: --apply seria RECUSADO (backup <= ${MAX_AGE}h contendo as ofertas e masters do plano). Rode: node --env-file=.env.local backup/backup-pre-fusao.mjs`
      );
      console.log('Dry-run concluído. Nada foi escrito no banco.');
      return;
    }

    if (!backupOk) throw new Error(`Backup ausente, antigo (> ${MAX_AGE}h) ou sem as ofertas/masters do plano. Atualize backup/dados e rode de novo.`);
    if (!toMove.length) { console.log('Nada a mover.'); return; }
    await applyMoves(sql, toMove);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

interface LogEntry { offer_id: string; master_antigo: string; master_novo: string; titulo: string; cotacoes: number; motivo: string }

async function applyMoves(sql: Sql, plan: Flagged[]) {
  const logFile = path.resolve(process.cwd(), 'backup', 'dados', `relink-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const ids = plan.map((f) => f.offer.id);
  const newIds = [...new Set(plan.map((f) => f.destination!.m.id))];
  const log: LogEntry[] = [];

  await sql
    .begin(async (tx) => {
      await tx`SET LOCAL statement_timeout = '300s'`;
      const [{ n: offersBefore }] = await tx<{ n: string }[]>`SELECT count(*) AS n FROM affiliate_offers`;

      // Trava e revalida.
      const locked = await tx<{ id: string; master_product_id: string; status: string; title: string }[]>`
        SELECT id, master_product_id, status::text, title FROM affiliate_offers WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`;
      if (locked.length !== ids.length) throw new Error('Oferta sumiu desde o plano.');
      const lockedById = new Map(locked.map((l) => [l.id, l]));
      for (const f of plan) {
        const l = lockedById.get(f.offer.id)!;
        if (l.status !== 'active') throw new Error(`Oferta ${f.offer.id} deixou de ser ativa desde o plano.`);
        if (l.master_product_id !== f.master.m.id) throw new Error(`Oferta ${f.offer.id} já mudou de master desde o plano.`);
        if (l.title !== f.offer.title) throw new Error(`Título da oferta ${f.offer.id} mudou desde o plano.`);
      }
      const dest = await tx<{ id: string; merged_into: string | null }[]>`
        SELECT id, attributes ->> 'mergedInto' AS merged_into FROM master_products WHERE id = ANY(${newIds}::uuid[]) FOR SHARE`;
      if (dest.length !== newIds.length) throw new Error('Master de destino sumiu desde o plano.');
      if (dest.some((d) => d.merged_into)) throw new Error('Master de destino foi arquivado desde o plano.');

      const countSnaps = async () => {
        const rows = await tx<{ offer_id: string; n: string }[]>`
          SELECT offer_id::text AS offer_id, count(*) AS n FROM affiliate_price_snapshots
          WHERE offer_id = ANY(${ids}::uuid[]) GROUP BY offer_id`;
        return new Map(rows.map((r) => [r.offer_id, Number(r.n)]));
      };
      const snapsBefore = await countSnaps();

      // Única escrita: affiliate_offers.master_product_id. Cotações acompanham a oferta.
      for (const f of plan) {
        const upd = await tx`
          UPDATE affiliate_offers SET master_product_id = ${f.destination!.m.id}, updated_at = now()
          WHERE id = ${f.offer.id} AND master_product_id = ${f.master.m.id} AND status = 'active'`;
        if (upd.count !== 1) throw new Error(`Falha ao mover a oferta ${f.offer.id}.`);
        log.push({
          offer_id: f.offer.id, master_antigo: f.master.m.id, master_novo: f.destination!.m.id,
          titulo: f.offer.title, cotacoes: snapsBefore.get(f.offer.id) ?? 0, motivo: f.primary.code,
        });
      }

      // Verificação pós-gravação (qualquer falha = ROLLBACK).
      const after = await tx<{ id: string; master_product_id: string }[]>`
        SELECT id, master_product_id FROM affiliate_offers WHERE id = ANY(${ids}::uuid[])`;
      const afterById = new Map(after.map((a) => [a.id, a.master_product_id]));
      for (const f of plan) {
        if (afterById.get(f.offer.id) !== f.destination!.m.id) throw new Error(`Verificação: oferta ${f.offer.id} não está no master novo.`);
      }
      const [{ n: offersAfter }] = await tx<{ n: string }[]>`SELECT count(*) AS n FROM affiliate_offers`;
      if (offersBefore !== offersAfter) throw new Error('Contagem de ofertas mudou: rollback.');
      const snapsAfter = await countSnaps();
      for (const id of ids) {
        if ((snapsBefore.get(id) ?? 0) !== (snapsAfter.get(id) ?? 0)) throw new Error(`Verificação: cotações da oferta ${id} mudaram.`);
      }

      // Log escrito ANTES do commit: se o commit falhar o arquivo é renomeado .invalido.
      fs.writeFileSync(logFile, JSON.stringify({ criado_em: new Date().toISOString(), movimentos: log }, null, 2), 'utf8');
    })
    .catch((err) => {
      if (fs.existsSync(logFile)) fs.renameSync(logFile, `${logFile}.invalido`);
      throw err;
    });

  console.log(`Relink concluído: ${log.length} ofertas. Log reversível: ${path.relative(process.cwd(), logFile)}`);
  console.log('Lembrete: recalcular estatísticas dos masters afetados e revalidar o cache das vitrines (60-300 s).');
}

main().catch((err) => {
  console.error('Falha:', err instanceof Error ? err.message : 'erro desconhecido');
  process.exit(1);
});
