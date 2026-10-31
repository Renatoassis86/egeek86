import { and, eq, inArray, sql } from 'drizzle-orm';
import { masterProducts } from '@/db/schema';
import { derivePlatformFromTitle } from '@/lib/affiliate/game-classification';

// NOTA: `@/lib/db` (server-only + pool) é importado de forma preguiçosa dentro
// de findExistingMasterProduct, para que as funções PURAS deste arquivo
// (normalizeTitle, analyzeDuplicates) possam ser usadas por scripts de CLI
// (scripts/dry-run-dup-report.ts, scripts/merge-duplicate-masters.ts) sem
// abrir conexão nem quebrar no import de 'server-only'.

// ---------------------------------------------------------------------------
// Normalização de título
// ---------------------------------------------------------------------------

/**
 * Ruído comercial: palavras que descrevem o anúncio, não o produto. Removidas
 * do "núcleo" do título. Achado real (2026-10-31, auditoria EG-01): "Resident
 * Evil Village Ps5 Física Lacrado Pronta Entrega" e "...Standart PS5 BR Open
 * Box" não casavam com "Resident Evil Village" (Jaccard 0,6) e viravam
 * master_products separados: 83 grupos / 105 excedentes só em jogos.
 */
const NOISE_WORDS = new Set([
  'fisico', 'fisica', 'fisicos', 'fisicas', 'midia', 'midias', 'jogo', 'jogos', 'game', 'games',
  'original', 'originais', 'lacrado', 'lacrada', 'novo', 'nova', 'novos', 'novas', 'nna', 'edicao',
  'edition', 'standard', 'standart', 'padrao', 'classico', 'portugues', 'dublado', 'legendado',
  'br', 'ptbr', 'pt', 'brasil', 'brasileira', 'brasileiro', 'nacional', 'usa', 'eur', 'nsc',
  'brinde', 'promocao', 'promo', 'oferta', 'imperdivel', 'lancamento', 'pronta', 'pronto',
  'entrega', 'envio', 'imediato', 'imediata', 'rapido', 'rapida', 'frete', 'gratis', 'garantia',
  'oficial', 'cartucho', 'disco', 'cd', 'versao', 'nfe', 'nota', 'fiscal', 'full', 'juros',
  'de', 'do', 'da', 'dos', 'das', 'para', 'com', 'the', 'of', 'and', 'em', 'no', 'na', 'um', 'uma',
  'nintendo', 'playstation', 'xbox', 'sony', 'microsoft',
]);

/**
 * Marcadores que DEFINEM um produto distinto (edição, condição, região, peça
 * ou acessório). Nunca são tratados como ruído: dois títulos só são o mesmo
 * produto se tiverem exatamente o mesmo conjunto de marcadores. É o que
 * impede fundir Deluxe/GOTY/Remastered/Collector's/Gold com a edição base, ou
 * o jogo com o encarte, a caixa vazia, o controle ou o kit.
 */
const MARKER_WORDS = new Set([
  // edições
  'deluxe', 'goty', 'remastered', 'remake', 'collector', 'gold', 'ultimate', 'premium', 'complete',
  'definitive', 'legendary', 'anniversary', 'steelbook', 'special', 'limited', 'dayone', 'prevenda',
  'digital', 'trilogy',
  // condição / região / idioma
  'loose', 'usado', 'seminovo', 'japao', 'importado', 'espanhol', 'spanish', 'ingles',
  // conteúdo que não é o jogo completo
  'dlc', 'upgrade', 'expansao', 'pass', 'bundle', 'kit', 'lote', 'combo',
  // peças, embalagens e acessórios
  'encarte', 'caixavazia', 'faceplate', 'capa', 'case', 'somente', 'apenas', 'replica', 'manual',
  'amiibo', 'controle', 'console', 'volante', 'cabo', 'dock', 'headset', 'suporte', 'carregador',
  'sem', 'cartao', 'codigo', 'pelucia', 'funko', 'miniatura', 'poster', 'camiseta', 'oled', 'lite',
]);

/** Frases multi-palavra que viram um único token antes da tokenização. */
const PHRASE_RULES: Array<[RegExp, string]> = [
  [/\bgame of the year\b/g, ' goty '],
  [/\bjogo do ano\b/g, ' goty '],
  [/\bcaixa vazia\b/g, ' caixavazia '],
  [/\bsteel ?book\b/g, ' steelbook '],
  [/\bcollector'?s?\b/g, ' collector '],
  [/\bcolecionadores?\b/g, ' collector '],
  [/\bcolecionador\b/g, ' collector '],
  [/\bremaster(?:ed|izado)?\b/g, ' remastered '],
  [/\bpre[\s-]?venda\b/g, ' prevenda '],
  [/\bday[\s-]?one\b/g, ' dayone '],
  [/\bjapan\b|\bjp\b/g, ' japao '],
  [/\bimport(?:ado|ada)?\b/g, ' importado '],
  [/\bexpansion\b/g, ' expansao '],
  [/\bseason pass\b|\bpasse de temporada\b/g, ' dlc '],
  [/\bopen ?box\b/g, ' '],
  [/\b100\s*%/g, ' '],
  [/\bea sports\b/g, ' ea '],
  [/\bnintendo switch\s+sports\b|\bswitch\s+sports\b/g, ' switchsports '],
];

/**
 * Remoção de termos de plataforma. A plataforma é comparada à parte
 * (campo estruturado ou derivada do título), nunca dentro do núcleo.
 */
const PLATFORM_STRIP: RegExp[] = [
  /\bnintendo\s+switch\s*2\b/g,
  /\bswitch\s*2\b/g,
  /\bnintendo\s+switch\b/g,
  /\bswitch\b/g,
  /\bnsw\b|\bns2\b/g,
  /\bplaystation\s*[45]\b/g,
  /\bps\s*[45]\b/g,
  /\bxbox\s*(?:series|serie)(?:\s*[xs])?(?:\s*[/|&]\s*[xs]\b)?/g,
  /\bseries\s*[xs]\b|\bxsx\b/g,
  /\bxbox\s*one(?:\s*[xs]\b)?|\bxone\b|\bxb1\b/g,
  /\bxbox\s*360\b|\bx360\b/g,
  // capacidade de armazenamento não diferencia o produto (achado 2026-08-03:
  // "Switch Lite 32gb" x "Switch Lite" fundidos).
  /\b\d{2,4}\s?gb\b/g,
  /\b\d\s?tb\b/g,
];

export interface NormalizedTitle {
  /** Núcleo do título (sem plataforma, sem ruído, sem marcadores), tokens separados por espaço. */
  coreTitle: string;
  /** Alias de compatibilidade: coreTitle + marcadores, a "identidade" completa do título. */
  cleanTitle: string;
  /** Plataforma derivada do TÍTULO (pode ser 'unknown' se o título não indica). */
  platform: string;
  /** Marcadores de edição/condição/peça presentes (ordenados, sem repetição). */
  markers: string[];
  /** Tokens numéricos do núcleo (sequências: 8 vs 7, 25 vs 26). */
  numbers: string[];
}

/**
 * Normaliza o título de um item para comparação/deduplicação.
 * Remove acentos, pontuação, plataforma e ruído comercial; separa os
 * marcadores de edição (que impedem a fusão) do núcleo do nome.
 */
export function normalizeTitle(title: string): NormalizedTitle {
  const platform = derivePlatformFromTitle(title);

  let text = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  for (const [pattern, replacement] of PHRASE_RULES) text = text.replace(pattern, replacement);
  for (const pattern of PLATFORM_STRIP) text = text.replace(pattern, ' ');

  text = text.replace(/[^a-z0-9\s]+/g, ' ');
  // "fc25" -> "fc 25": o mesmo jogo aparece colado e separado nos anúncios.
  text = text.replace(/\b([a-z]{2,})(\d{1,3})\b/g, '$1 $2');

  const core: string[] = [];
  const markers = new Set<string>();
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    // Dígito único é parte do nome ("Mario Kart 8"); o filtro antigo de
    // length > 1 apagava o 8 e igualava "Kart 8" a "Kart 7". "V" e "X"
    // soltos são numeral romano ("Final Fantasy X", "GTA V"); as demais
    // letras soltas são sobra de pontuação ("Link's" -> "link s").
    if (token.length < 2 && !/^[0-9vx]$/.test(token)) continue;
    if (NOISE_WORDS.has(token)) continue;
    if (MARKER_WORDS.has(token)) {
      markers.add(token);
      continue;
    }
    core.push(token);
  }

  const markerList = [...markers].sort();
  const coreTitle = core.join(' ').trim();
  return {
    coreTitle,
    cleanTitle: [coreTitle, ...markerList].filter(Boolean).join(' '),
    platform,
    markers: markerList,
    numbers: core.filter((t) => /^\d+$/.test(t)).sort(),
  };
}

/** Jaccard simétrico sobre os tokens do núcleo. */
export function coreSimilarity(a: string, b: string): number {
  const sa = new Set(a.split(' ').filter(Boolean));
  const sb = new Set(b.split(' ').filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Dois títulos já normalizados são o MESMO produto? Mesmos marcadores de
 * edição, mesmos números (sequência) e núcleo idêntico ou Jaccard >= limiar.
 */
export function isSameProduct(a: NormalizedTitle, b: NormalizedTitle, threshold = 0.8): boolean {
  if (!a.coreTitle || !b.coreTitle) return false;
  if (!sameList(a.markers, b.markers)) return false;
  if (!sameList(a.numbers, b.numbers)) return false;
  if (a.coreTitle === b.coreTitle) return true;
  return coreSimilarity(a.coreTitle, b.coreTitle) >= threshold;
}

// ---------------------------------------------------------------------------
// Busca de duplicata no cadastro (usada pelos coletores e ações do admin)
// ---------------------------------------------------------------------------

/**
 * Busca um masterProduct correspondente no banco por título+plataforma
 * normalizados. A plataforma vem do argumento (classificação estruturada do
 * marketplace) e, se for 'unknown', é DERIVADA do título; candidatos com
 * plataforma 'unknown' no banco entram na comparação quando o título deles
 * indica a plataforma (a duplicata real fica escondida atrás do 'unknown').
 * Masters já fundidos (attributes.mergedInto) nunca são candidatos.
 */
export async function findExistingMasterProduct(
  name: string,
  platformGen: string,
  options: { productType?: 'game' | 'console' | 'accessory' } = {}
): Promise<any | null> {
  const normInput = normalizeTitle(name);
  if (!normInput.coreTitle) return null;

  const platform =
    platformGen && platformGen !== 'unknown' ? platformGen : normInput.platform;

  const { db } = await import('@/lib/db');

  const conditions = [
    sql`(${masterProducts.attributes} ->> 'mergedInto') IS NULL`,
    platform === 'unknown'
      ? eq(masterProducts.gamePlatformGen, 'unknown' as any)
      : inArray(masterProducts.gamePlatformGen, [platform, 'unknown'] as any),
  ];
  if (options.productType) conditions.push(eq(masterProducts.productType, options.productType));

  const candidates = await db
    .select({
      id: masterProducts.id,
      name: masterProducts.name,
      gamePlatformGen: masterProducts.gamePlatformGen,
    })
    .from(masterProducts)
    .where(and(...conditions));

  for (const candidate of candidates) {
    const normCand = normalizeTitle(candidate.name);

    if (candidate.gamePlatformGen === 'unknown') {
      // Candidato sem plataforma estruturada: só vale se o título dele
      // indicar a MESMA plataforma (ou, se ambos desconhecidos, igualdade exata).
      if (platform === 'unknown') {
        if (normCand.platform !== 'unknown') continue;
        if (
          normCand.coreTitle === normInput.coreTitle &&
          sameList(normCand.markers, normInput.markers)
        ) {
          return candidate;
        }
        continue;
      }
      if (normCand.platform !== platform) continue;
    }

    if (isSameProduct(normInput, normCand, 0.8)) return candidate;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Análise de duplicatas em lote (puro; usado pelos scripts de relatório e fusão)
// ---------------------------------------------------------------------------

export interface MasterRow {
  id: string;
  name: string;
  productType: string;
  gamePlatformGen: string;
  gameFormat: string;
  createdAt: string | Date;
  /** attributes.mergedInto (master já fundido/arquivado). */
  mergedInto: string | null;
  activeOffers: number;
  totalOffers: number;
  snapshots: number;
}

export interface DupMember extends MasterRow {
  role: 'canonical' | 'merge';
}

export interface AutoGroup {
  key: string;
  platform: string;
  productType: string;
  coreTitle: string;
  markers: string[];
  members: DupMember[];
  canonicalId: string;
  /** canônico tem game_platform_gen 'unknown' no banco mas o grupo resolveu a plataforma pelo título */
  platformFixNeeded: boolean;
}

export type ReviewKind =
  | 'near_duplicate'
  | 'unknown_platform'
  | 'platform_conflict'
  | 'non_game_exact';

export interface ReviewCluster {
  kind: ReviewKind;
  note: string;
  members: MasterRow[];
}

export interface DupAnalysis {
  totalMasters: number;
  archivedMasters: number;
  autoGroups: AutoGroup[];
  reviewClusters: ReviewCluster[];
  /** grupos (plataforma+núcleo) com edições distintas mantidas separadas de propósito */
  distinctEditionGroups: number;
  /** jogos cujo título cita mais de uma geração (PS4/PS5, Xbox One/Series): fora da fusão automática */
  ambiguousGenerationTitles: number;
  unknownPlatform: { total: number; games: number; derivableFromTitle: number; gamesDerivable: number };
  derivedPlatformById: Map<string, string>;
}

/**
 * O título cita mais de uma geração da mesma família ("PS4/PS5", "Xbox
 * One/Series X", "Switch 1 e 2")? O disco é de uma geração só (ou cross-gen),
 * então o título não prova qual master é o certo: fica fora da fusão
 * automática.
 */
export function mentionsMultipleGenerations(title: string): boolean {
  const t = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const ps = [/\b(playstation\s*4|ps\s*4)\b/, /\b(playstation\s*5|ps\s*5)\b/].filter((re) => re.test(t)).length;
  const xbox = [/xbox\s*series|\bseries\s*[xs]\b|\bxsx\b/, /xbox\s*360|\bx360\b/, /xbox\s*one|\bxone\b/].filter((re) =>
    re.test(t)
  ).length;
  const sw2 = /\b(nintendo\s+)?switch\s*2\b|\bns2\b/.test(t);
  const sw1 = /\bswitch\b|\bnsw\b/.test(t.replace(/\b(nintendo\s+)?switch\s*2\b|\bns2\b/g, ' '));
  return ps >= 2 || xbox >= 2 || (sw2 && sw1);
}

function isoTime(d: string | Date): number {
  return new Date(d).getTime();
}

/** Canônico = mais ofertas ativas, depois mais ofertas, mais snapshots, mais antigo. */
export function pickCanonical<T extends MasterRow>(rows: T[]): T {
  return [...rows].sort(
    (a, b) =>
      b.activeOffers - a.activeOffers ||
      b.totalOffers - a.totalOffers ||
      b.snapshots - a.snapshots ||
      isoTime(a.createdAt) - isoTime(b.createdAt) ||
      a.id.localeCompare(b.id)
  )[0];
}

/**
 * Agrupa duplicatas. Fusão automática SÓ para: product_type='game',
 * plataforma resolvida (campo estruturado ou título), mesmo formato
 * (físico/digital), mesmos marcadores de edição e núcleo de título idêntico.
 * Todo o resto (quase-duplicatas, plataforma desconhecida, conflito
 * banco x título, consoles/acessórios) vai para revisão manual.
 */
export function analyzeDuplicates(allRows: MasterRow[]): DupAnalysis {
  const rows = allRows.filter((r) => !r.mergedInto);
  const archivedMasters = allRows.length - rows.length;

  const derivedPlatformById = new Map<string, string>();
  const norm = new Map<string, NormalizedTitle>();
  const effPlatform = new Map<string, string>();
  const conflict = new Set<string>();
  const ambiguous = new Set<string>();
  const unknownPlatform = { total: 0, games: 0, derivableFromTitle: 0, gamesDerivable: 0 };

  for (const r of rows) {
    const n = normalizeTitle(r.name);
    norm.set(r.id, n);
    const db = r.gamePlatformGen;
    let eff = db;
    if (db === 'unknown') {
      unknownPlatform.total++;
      if (r.productType === 'game') unknownPlatform.games++;
      if (n.platform !== 'unknown') {
        eff = n.platform;
        derivedPlatformById.set(r.id, n.platform);
        unknownPlatform.derivableFromTitle++;
        if (r.productType === 'game') unknownPlatform.gamesDerivable++;
      }
    } else if (r.productType === 'game' && n.platform !== 'unknown' && n.platform !== db && !mentionsMultipleGenerations(r.name)) {
      conflict.add(r.id);
    }
    if (r.productType === 'game' && mentionsMultipleGenerations(r.name)) ambiguous.add(r.id);
    effPlatform.set(r.id, eff);
  }

  const formatClass = (r: MasterRow, n: NormalizedTitle) =>
    r.gameFormat === 'digital' || n.markers.includes('digital') ? 'digital' : 'phys';

  // --- Fusão automática: chave exata -----------------------------------
  const exact = new Map<string, MasterRow[]>();
  for (const r of rows) {
    if (r.productType !== 'game' || conflict.has(r.id) || ambiguous.has(r.id)) continue;
    const n = norm.get(r.id)!;
    const p = effPlatform.get(r.id)!;
    if (p === 'unknown' || !n.coreTitle) continue;
    const key = [p, r.productType, formatClass(r, n), n.markers.join(','), n.coreTitle].join('|');
    const list = exact.get(key);
    if (list) list.push(r);
    else exact.set(key, [r]);
  }

  const autoGroups: AutoGroup[] = [];
  const inAuto = new Map<string, string>(); // master id -> group key
  for (const [key, members] of exact) {
    if (members.length < 2) continue;
    const canonical = pickCanonical(members);
    const n = norm.get(canonical.id)!;
    autoGroups.push({
      key,
      platform: effPlatform.get(canonical.id)!,
      productType: canonical.productType,
      coreTitle: n.coreTitle,
      markers: n.markers,
      canonicalId: canonical.id,
      platformFixNeeded: canonical.gamePlatformGen === 'unknown',
      members: members
        .map((m) => ({ ...m, role: (m.id === canonical.id ? 'canonical' : 'merge') as DupMember['role'] }))
        .sort((a, b) => (a.role === b.role ? 0 : a.role === 'canonical' ? -1 : 1)),
    });
    for (const m of members) inAuto.set(m.id, key);
  }
  autoGroups.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));

  const reviewClusters: ReviewCluster[] = [];

  // --- Revisão: quase-duplicatas (mesmo bucket, núcleo parecido, não idêntico) ---
  // Nó = grupo automático (representado pelo canônico) ou master solto.
  const nodeOf = (r: MasterRow) => {
    const k = inAuto.get(r.id);
    return k ?? r.id;
  };
  const buckets = new Map<string, MasterRow[]>();
  for (const r of rows) {
    if (r.productType !== 'game' || conflict.has(r.id) || ambiguous.has(r.id)) continue;
    const n = norm.get(r.id)!;
    const p = effPlatform.get(r.id)!;
    if (p === 'unknown' || !n.coreTitle) continue;
    const key = [p, formatClass(r, n), n.markers.join(','), n.numbers.join(',')].join('|');
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  };
  const NEAR = 0.7;
  const nearNodes = new Set<string>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const na = nodeOf(a);
        const nb = nodeOf(b);
        if (na === nb) continue;
        if (coreSimilarity(norm.get(a.id)!.coreTitle, norm.get(b.id)!.coreTitle) >= NEAR) {
          parent.set(find(na), find(nb));
          nearNodes.add(na);
          nearNodes.add(nb);
        }
      }
    }
  }
  const clusterMembers = new Map<string, Set<string>>();
  for (const r of rows) {
    const node = nodeOf(r);
    if (!nearNodes.has(node)) continue;
    const root = find(node);
    if (!clusterMembers.has(root)) clusterMembers.set(root, new Set());
    clusterMembers.get(root)!.add(r.id);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const ids of clusterMembers.values()) {
    if (ids.size < 2) continue;
    reviewClusters.push({
      kind: 'near_duplicate',
      note: `Jaccard do núcleo >= ${NEAR} (não idêntico), mesma plataforma/formato/edição`,
      members: [...ids].map((id) => byId.get(id)!),
    });
  }

  // --- Revisão: plataforma 'unknown' com núcleo igual a um grupo conhecido ---
  const knownByCore = new Map<string, MasterRow[]>();
  for (const r of rows) {
    if (r.productType !== 'game') continue;
    const n = norm.get(r.id)!;
    if (!n.coreTitle || effPlatform.get(r.id) === 'unknown') continue;
    const key = [n.markers.join(','), n.coreTitle].join('|');
    const list = knownByCore.get(key);
    if (list) list.push(r);
    else knownByCore.set(key, [r]);
  }
  const unknownByCore = new Map<string, MasterRow[]>();
  for (const r of rows) {
    if (r.productType !== 'game' || effPlatform.get(r.id) !== 'unknown') continue;
    const n = norm.get(r.id)!;
    if (!n.coreTitle) continue;
    const key = [n.markers.join(','), n.coreTitle].join('|');
    const list = unknownByCore.get(key);
    if (list) list.push(r);
    else unknownByCore.set(key, [r]);
  }
  for (const [key, unk] of unknownByCore) {
    const known = knownByCore.get(key) ?? [];
    if (unk.length + known.length < 2) continue;
    reviewClusters.push({
      kind: 'unknown_platform',
      note: 'Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master',
      members: [...unk, ...known],
    });
  }

  // --- Revisão: conflito entre plataforma do cadastro e do título ---
  const conflicts = rows.filter((r) => conflict.has(r.id));
  if (conflicts.length > 0) {
    reviewClusters.push({
      kind: 'platform_conflict',
      note: 'game_platform_gen do cadastro difere da plataforma citada no título (cada linha é um caso isolado)',
      members: conflicts,
    });
  }

  // --- Revisão: consoles/acessórios com mesma chave exata ---
  const nonGame = new Map<string, MasterRow[]>();
  for (const r of rows) {
    if (r.productType === 'game') continue;
    const n = norm.get(r.id)!;
    const key = [r.productType, effPlatform.get(r.id), n.markers.join(','), n.coreTitle].join('|');
    const list = nonGame.get(key);
    if (list) list.push(r);
    else nonGame.set(key, [r]);
  }
  for (const list of nonGame.values()) {
    if (list.length < 2) continue;
    reviewClusters.push({
      kind: 'non_game_exact',
      note: 'Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título',
      members: list,
    });
  }

  // --- Informativo: edições distintas preservadas ---
  const byCore = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.productType !== 'game' || conflict.has(r.id) || ambiguous.has(r.id)) continue;
    const n = norm.get(r.id)!;
    const p = effPlatform.get(r.id)!;
    if (p === 'unknown' || !n.coreTitle) continue;
    const key = [p, formatClass(r, n), n.coreTitle].join('|');
    if (!byCore.has(key)) byCore.set(key, new Set());
    byCore.get(key)!.add(n.markers.join(','));
  }
  let distinctEditionGroups = 0;
  for (const set of byCore.values()) if (set.size > 1) distinctEditionGroups++;

  return {
    totalMasters: allRows.length,
    archivedMasters,
    autoGroups,
    reviewClusters,
    distinctEditionGroups,
    ambiguousGenerationTitles: ambiguous.size,
    unknownPlatform,
    derivedPlatformById,
  };
}
