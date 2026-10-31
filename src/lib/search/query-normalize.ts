/**
 * Normalização, pontuação e título limpo da busca de produtos. PURO (sem I/O,
 * sem server-only): usado por `src/server/queries/search-products.ts` e
 * testável por script. Nada aqui inventa dado: só compara texto do termo
 * digitado com o nome de `master_products` já existentes.
 *
 * Pipeline igual dos dois lados (termo e nome do produto):
 *   acentos/caixa -> apóstrofos fora -> plataforma extraída -> pontuação vira
 *   espaço -> "fc25" vira "fc 25" -> numeral romano vira arábico.
 * O SQL (search-products.ts) replica só a parte barata (acentos, pontuação,
 * letra+dígito) para pré-filtrar candidatos; a decisão final é daqui.
 */
import type { GamePlatformGen } from '@/db/schema';

// ---------------------------------------------------------------------------
// Texto base
// ---------------------------------------------------------------------------

export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/&/g, ' ');
}

/** Plataformas por abreviação. Ordem importa (específico antes do genérico). */
const PLATFORM_RULES: Array<{ platform: GamePlatformGen; re: RegExp }> = [
  { platform: 'switch_2', re: /\b(?:nintendo\s+)?switch\s*2\b|\bns2\b/g },
  { platform: 'ps5', re: /\b(?:play\s?station|ps|play)\s*5\b/g },
  { platform: 'ps4', re: /\b(?:play\s?station|ps|play)\s*4\b/g },
  { platform: 'xbox_series', re: /\bxbox\s*(?:series|serie)(?:\s*[xs])?\b|\bseries\s*[xs]\b|\bxsx\b|\bxss\b/g },
  { platform: 'xbox_360', re: /\bxbox\s*360\b|\bx360\b/g },
  { platform: 'xbox_one', re: /\bxbox\s*one(?:\s*[xs])?\b|\bxone\b|\bxb1\b/g },
  { platform: 'switch_1', re: /\b(?:nintendo\s+)?switch\b|\bnsw\b/g },
];

/** Remove termos de plataforma e devolve as plataformas citadas (sem repetição). */
export function extractPlatforms(folded: string): { text: string; platforms: GamePlatformGen[] } {
  let text = folded;
  const found: GamePlatformGen[] = [];
  for (const { platform, re } of PLATFORM_RULES) {
    const before = text;
    text = text.replace(re, ' ');
    if (before !== text) found.push(platform);
  }
  return { text, platforms: found };
}

const ROMAN_RE = /^(?:x{0,2})(?:ix|iv|v?i{0,3})$/;
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10 };

function romanToArabic(token: string): string | null {
  if (!token || !ROMAN_RE.test(token)) return null;
  // "i" sozinho é pronome ("I Am Alive"): não vira 1.
  if (token === 'i') return null;
  let total = 0;
  for (let i = 0; i < token.length; i++) {
    const v = ROMAN_VALUES[token[i]];
    const next = ROMAN_VALUES[token[i + 1]];
    total += next && next > v ? -v : v;
  }
  return total > 0 ? String(total) : null;
}

/** Palavras que não identificam o jogo: nunca são exigidas e não contam como "sobra". */
const STOP_WORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e', 'a', 'o', 'os', 'as', 'the', 'of', 'and', 'for', 'to', 'in',
  'em', 'no', 'na', 'com', 'para', 'um', 'uma', 'by', 'at', 'on', 'or',
  // marca/plataforma sem versão
  'nintendo', 'playstation', 'xbox', 'sony', 'microsoft',
  // ruído comercial
  'jogo', 'jogos', 'game', 'games', 'fisico', 'fisica', 'midia', 'midias', 'original', 'originais',
  'lacrado', 'lacrada', 'novo', 'nova', 'edicao', 'edition', 'standard', 'standart', 'padrao',
  'br', 'ptbr', 'pt', 'brasil', 'nacional', 'dublado', 'legendado', 'portugues', 'brinde',
  'pronta', 'entrega', 'envio', 'imediato', 'imediata', 'frete', 'gratis', 'garantia', 'oficial',
  'cartucho', 'disco', 'cd', 'versao', 'nfe', 'nf', 'usa', 'eur', 'lancamento', 'promocao',
  'direct', 'from', 'japan', 'sealed', 'new', 'midia',
]);

/** Siglas de franquia -> texto por extenso (variante extra do termo). */
const ALIASES: Record<string, string> = {
  gta: 'grand theft auto',
  cod: 'call of duty',
  tlou: 'the last of us',
  rdr: 'red dead redemption',
  botw: 'breath of the wild',
  totk: 'tears of the kingdom',
  re: 'resident evil',
  ff: 'final fantasy',
  dmc: 'devil may cry',
  ac: 'assassins creed',
  nfs: 'need for speed',
  dq: 'dragon quest',
  kh: 'kingdom hearts',
  mgs: 'metal gear solid',
  pes: 'efootball',
  gow: 'god of war',
  mk: 'mortal kombat',
};

export interface ParsedVariant {
  /** Palavras significativas (sem números, sem stop words, >= 2 letras). */
  words: string[];
  /** Números de sequência (já com romanos convertidos). */
  numbers: string[];
}

export interface ParsedQuery {
  raw: string;
  /** Termo normalizado e legível (sem plataforma). */
  normalized: string;
  /** Plataforma deduzida do termo; null se não citada ou ambígua (ex.: "ps5 xbox"). */
  platform: GamePlatformGen | null;
  platformAmbiguous: boolean;
  variants: ParsedVariant[];
  /** true se o termo pede kit/lote/combo (então bundles não são escondidos). */
  wantsBundle: boolean;
  /** Sem palavra, sem número e sem plataforma: termo vazio ou só ruído. */
  generic: boolean;
  hasText: boolean;
}

interface Tokenized {
  words: string[];
  numbers: string[];
  all: string[];
}

function tokenizeFolded(text: string): Tokenized {
  const spaced = text
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .trim();
  const words: string[] = [];
  const numbers: string[] = [];
  const all: string[] = [];
  for (let token of spaced.split(/\s+/)) {
    if (!token) continue;
    const roman = romanToArabic(token);
    if (roman) token = roman;
    if (/^\d+$/.test(token)) {
      numbers.push(token);
      all.push(token);
      continue;
    }
    if (token.length < 2) continue;
    all.push(token);
    if (!STOP_WORDS.has(token)) words.push(token);
  }
  return { words, numbers, all };
}

export function parseQuery(raw: string): ParsedQuery {
  const folded = foldText(raw ?? '');
  const { text, platforms } = extractPlatforms(folded);
  const base = tokenizeFolded(text);

  const variants: ParsedVariant[] = [{ words: base.words, numbers: base.numbers }];
  const expandedWords: string[] = [];
  let expanded = false;
  for (const w of base.words) {
    const alias = ALIASES[w];
    if (alias) {
      expanded = true;
      expandedWords.push(...tokenizeFolded(alias).words);
    } else {
      expandedWords.push(w);
    }
  }
  if (expanded) variants.push({ words: expandedWords, numbers: base.numbers });

  const platformAmbiguous = platforms.length > 1;
  const hasText = variants.some((v) => v.words.length > 0 || v.numbers.length > 0);
  return {
    raw,
    normalized: base.all.join(' '),
    platform: platforms.length === 1 ? platforms[0] : null,
    platformAmbiguous,
    variants,
    wantsBundle: base.words.some((w) => w === 'kit' || w === 'lote' || w === 'combo'),
    hasText,
    generic: !hasText && platforms.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Pontuação do nome do produto contra o termo
// ---------------------------------------------------------------------------

export interface NameInfo {
  words: string[];
  numbers: string[];
  /** Palavras que identificam o produto (sem stop words) usadas para medir "sobra". */
  core: string[];
}

export function analyzeName(name: string): NameInfo {
  const { text } = extractPlatforms(foldText(name));
  const t = tokenizeFolded(text);
  return { words: t.all.filter((x) => !/^\d+$/.test(x)), numbers: t.numbers, core: t.words };
}

/** Distância de edição com corte (devolve max+1 se passar do limite). */
export function levenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function stem(w: string): string {
  return w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
}

interface TokenMatch {
  grade: number;
  index: number;
  fuzzy: boolean;
}

function matchToken(token: string, nameWords: string[], opts: { prefix: boolean; relaxed: boolean }): TokenMatch {
  let best: TokenMatch = { grade: 0, index: -1, fuzzy: false };
  const st = stem(token);
  for (let i = 0; i < nameWords.length; i++) {
    const nw = nameWords[i];
    let grade = 0;
    let fuzzy = false;
    if (nw === token) grade = 1;
    else if (stem(nw) === st) grade = 0.95;
    else if (token.length >= 3 && opts.prefix && nw.startsWith(token)) grade = 0.9;
    else if (token.length >= 4 && nw.startsWith(token) && token.length / nw.length >= 0.6) grade = 0.85;
    else {
      if (opts.relaxed) {
        // só para "quis dizer": tolera inserção/remoção/troca
        const maxEdit = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
        if (maxEdit > 0 && levenshtein(token, nw, maxEdit) <= maxEdit) {
          grade = 0.7;
          fuzzy = true;
        }
      } else if (token.length >= 6 && nw.length === token.length && levenshtein(token, nw, 1) <= 1) {
        // resultado de verdade: só troca de 1 letra no mesmo tamanho ("resdent"
        // não, "residnt" sim). "mario"/"wario" e "controle"/"control" são
        // palavras diferentes e NÃO casam.
        grade = 0.75;
        fuzzy = true;
      }
    }
    if (grade > best.grade) best = { grade, index: i, fuzzy };
  }
  return best;
}

export interface NameScore {
  /** 0..1 (já com bônus de título exato). */
  relevance: number;
  exact: boolean;
}

export interface ScoreOptions {
  /** Último token digitado pode ser prefixo (autocomplete). */
  prefixLast?: boolean;
  /** Tolera erro de digitação maior (usado só para sugestão "quis dizer"). */
  relaxed?: boolean;
  /** Similaridade trigram vinda do banco (0..1); entra como desempate leve. */
  trigram?: number;
}

function scoreVariant(v: ParsedVariant, name: NameInfo, opts: ScoreOptions): NameScore | null {
  // Número de sequência exato: "mario kart 8" nunca traz "mario kart 7".
  for (const n of v.numbers) if (!name.numbers.includes(n)) return null;

  const words = v.words;
  let coverageNum = 0;
  let coverageDen = 0;
  let misses = 0;
  let fuzzyCount = 0;
  const matchedIdx: number[] = [];
  const usedName = new Set<number>();

  words.forEach((w, i) => {
    const weight = Math.min(w.length, 8);
    const m = matchToken(w, name.words, { prefix: opts.prefixLast ? i === words.length - 1 : false, relaxed: !!opts.relaxed });
    coverageDen += weight;
    if (m.grade === 0) {
      misses++;
      matchedIdx.push(-1);
      return;
    }
    coverageNum += weight * m.grade;
    if (m.fuzzy) fuzzyCount++;
    matchedIdx.push(m.index);
    usedName.add(m.index);
  });

  const allowedMisses = opts.relaxed ? (words.length >= 3 ? 1 : 0) : words.length >= 5 ? 1 : 0;
  if (misses > allowedMisses) return null;
  if (!opts.relaxed && fuzzyCount > 1) return null;

  const coverage = coverageDen > 0 ? coverageNum / coverageDen : 1;

  // Ordem das palavras no nome: contígua > em ordem > fora de ordem.
  const idx = matchedIdx.filter((i) => i >= 0);
  let order = 0.4;
  if (idx.length <= 1) order = 1;
  else {
    const inOrder = idx.every((v2, k) => k === 0 || v2 > idx[k - 1]);
    const contiguous = inOrder && idx.every((v2, k) => k === 0 || v2 === idx[k - 1] + 1);
    order = contiguous ? 1 : inOrder ? 0.7 : 0.4;
  }

  // Sobra: palavras identificadoras do nome que o termo não citou.
  const extra = name.words.filter((w, i) => !usedName.has(i) && !STOP_WORDS.has(w)).length;
  const tightness = 1 / (1 + extra * 0.35);

  const numsOk = v.numbers.length > 0 ? 1 : 0.5;
  let relevance = 0.55 * coverage + 0.15 * order + 0.1 * tightness + 0.1 * numsOk + 0.1 * Math.min(1, opts.trigram ?? 0);
  if (words.length === 0 && v.numbers.length > 0) relevance = 0.7 + 0.2 * tightness;

  const sameNumbers = v.numbers.length === name.numbers.length && v.numbers.every((n) => name.numbers.includes(n));
  const exact = misses === 0 && fuzzyCount === 0 && extra === 0 && sameNumbers && words.length > 0 && coverage >= 0.95;
  if (exact) relevance = 1;
  return { relevance: Math.min(1, relevance), exact };
}

/** Melhor pontuação entre as variantes do termo (original e siglas expandidas); null = rejeitado. */
export function scoreName(q: ParsedQuery, name: NameInfo, opts: ScoreOptions = {}): NameScore | null {
  let best: NameScore | null = null;
  for (const v of q.variants) {
    if (v.words.length === 0 && v.numbers.length === 0) continue;
    const s = scoreVariant(v, name, opts);
    if (s && (!best || s.relevance > best.relevance)) best = s;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Título limpo (EG-18)
// ---------------------------------------------------------------------------

const PLATFORM_STRIP: RegExp[] = [
  /\bnintendo\s+switch\s*2\b/gi,
  /\bnintendo\s+switch\b/gi,
  /\bswitch\s*2\b/gi,
  /\bswitch\b/gi,
  /\bplay\s?station\s*[45]\b/gi,
  /\bps\s*[45]\b/gi,
  /\bxbox\s*(?:series|serie)(?:\s*[xs](?:\s*[/|&]\s*[xs])?)?\b/gi,
  /\bxbox\s*one(?:\s*[xs])?\b/gi,
  /\bxbox\s*360\b/gi,
];

const NOISE_STRIP: RegExp[] = [
  /[\[【(][^\]】)]*(?:direct from japan|japan|importado)[^\]】)]*[\]】)]/gi,
  // parênteses que só repetem ruído: "(Original)", "(físico)"
  /\(\s*(?:original|f[ií]sic[oa]|m[ií]dia\s+f[ií]sica|lacrad[oa]|novo|nova)\s*\)/gi,
  /\b(?:m[ií]dia\s+f[ií]sica|f[ií]sic[oa])\b/gi,
  /\b(?:lacrad[oa]|novo|nova|original|pronta\s+entrega|envio\s+imediato|open\s*box|nacional|importado)\b/gi,
  /\b(?:dublado|legendado)(?:\s+em\s+portugu[eê]s)?\b/gi,
  /\b(?:com\s+)?(?:nf|nfe|nota\s+fiscal)(?:\s+e\s+garantia(?:\s+de\s+\d+\s+an?os?)?)?\b/gi,
  /\+\s*brinde\w*/gi,
  /\b100\s*%/g,
  /^\s*(?:jogo|game)\s+(?:de\s+)?/gi,
  /\bjogo\b/gi,
];

/** Palavras coladas conhecidas no catálogo (só as certas; nada é adivinhado). */
const GLUED_WORDS: Array<[RegExp, string]> = [
  [/\bthewild\b/gi, 'The Wild'],
  [/\bthekingdom\b/gi, 'The Kingdom'],
];

/** Siglas que o catálogo grafa como palavra comum. */
const ACRONYMS: Record<string, string> = { gta: 'GTA', fifa: 'FIFA', wwe: 'WWE', nba: 'NBA', nhl: 'NHL', nfl: 'NFL', ufc: 'UFC' };

const PLACEHOLDER_SPORTS = 'SWITCHSPORTSPLACEHOLDER';

function titleCaseIfShouting(s: string): string {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 6) return s;
  const upper = letters.replace(/[^A-ZÀ-Ý]/g, '').length;
  if (upper / letters.length < 0.7) return s;
  return s.toLowerCase().replace(/(^|[\s:(\-–])([a-zà-ÿ])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** Tira pontuação solta nas pontas e entre pontuações; repete até estabilizar. */
function trimDanglingPunctuation(input: string): string {
  let s = input;
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s
      .replace(/\(\s*\)/g, ' ')
      .replace(/\s*[-–—,:|/+]\s*(?=[-–—,:|/+]|$)/g, ' ')
      .replace(/^\s*[-–—,:|/+]\s*/g, '')
      .replace(/\s*[-–—,:|/+]\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (s === before) break;
  }
  return s;
}

export interface CleanTitleOptions {
  /**
   * Mantém plataforma no texto. Para console e acessório a plataforma
   * identifica o produto ("Bateria para Controle Xbox One"); só o jogo mostra
   * a plataforma à parte (rótulo).
   */
  keepPlatform?: boolean;
}

/**
 * Título de exibição: o nome do master sem plataforma, formato, condição
 * comercial e brindes; sem ™®©; espaço depois de ":"; palavras coladas
 * conhecidas separadas; siglas (GTA, FIFA...) em caixa alta. Se a limpeza
 * esvaziar o texto, devolve o nome original (aparado). Só remove ruído e
 * corrige grafia certa; não inventa palavra.
 */
export function cleanProductTitle(name: string, opts: CleanTitleOptions = {}): string {
  const original = (name ?? '').replace(/\s+/g, ' ').trim();
  let s = original.replace(/[™®©]/g, '');
  // "Nintendo Switch Sports" é o nome do jogo, não a plataforma
  s = s.replace(/\b(?:nintendo\s+)?switch\s+sports\b/gi, PLACEHOLDER_SPORTS);
  if (!opts.keepPlatform) for (const re of PLATFORM_STRIP) s = s.replace(re, ' ');
  for (const re of NOISE_STRIP) s = s.replace(re, ' ');
  s = s.replace(new RegExp(PLACEHOLDER_SPORTS, 'g'), 'Nintendo Switch Sports');
  s = s.replace(/[\[\]【】]/g, ' ');
  s = trimDanglingPunctuation(s);
  if (s.length < 3) s = trimDanglingPunctuation(original.replace(/[™®©]/g, ''));

  for (const [re, rep] of GLUED_WORDS) s = s.replace(re, rep);
  // "Zelda:breath" -> "Zelda: Breath" (letra:letra; hora 12:30 e "Cor:" com dígito não mudam)
  s = s.replace(/([A-Za-zÀ-ÿ]):(?=[A-Za-zÀ-ÿ])/g, '$1: ');
  s = s.replace(/:\s+([a-zà-ÿ])/g, (_m, c: string) => ': ' + c.toUpperCase());
  s = s.replace(/\s+([:,;])/g, '$1');
  s = s.replace(/\b[A-Za-z]{3,4}\b/g, (w) => (w === w.toLowerCase() || w === w[0].toUpperCase() + w.slice(1).toLowerCase() ? ACRONYMS[w.toLowerCase()] ?? w : w));
  return titleCaseIfShouting(s.replace(/\s+/g, ' ').trim());
}
