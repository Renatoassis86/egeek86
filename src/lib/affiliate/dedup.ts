import { and, eq, inArray, sql } from 'drizzle-orm';
import { masterProducts } from '@/db/schema';
import {
  derivePlatformFromTitle,
  fixPlatformTypos,
  generationsMentioned,
  legacyPlatformsMentioned,
  mentionsMultipleGenerations,
  stripCompatMentions,
} from '@/lib/affiliate/game-classification';
import { titleHardwareKind, type TitleKind } from '@/lib/catalog/dimensions';
import { isBundleTitle } from '@/lib/affiliate/product-type-classifier';

export { mentionsMultipleGenerations };

// NOTA: `@/lib/db` (server-only + pool) é importado de forma preguiçosa dentro
// de findExistingMasterProduct, para que as funções PURAS deste arquivo
// (normalizeTitle, analyzeDuplicates) possam ser usadas por scripts de CLI
// (scripts/dry-run-dup-report.ts, scripts/merge-duplicate-masters.ts) sem
// abrir conexão nem quebrar no import de 'server-only'.

// ---------------------------------------------------------------------------
// Normalização de título
// ---------------------------------------------------------------------------
//
// REGRA MÃE (decisão do dono, 2026-11-03): separar tudo, juntar só o idêntico.
// Eixos que separam produtos (cada um vira marcador, número ou campo próprio):
//   edição (Deluxe, Gold, Limitada, Especial, Colecionador, Aniversário...),
//   relançamento (Greatest Hits, Platinum, Essentials, Player's Choice, Nintendo Selects),
//   região/importado (USA, EUR, Japão, Ásia) e idioma estrangeiro,
//   condição (usado/seminovo, Open Box), cross-gen (uma geração por produto),
//   conteúdo (remake, remaster, HD, collection, trilogia, director's cut),
//   hardware: capacidade (825GB x 1TB), modelo (Slim/Pro/OLED/Lite/Digital/Edge/Elite)
//   e variante (Series S x X, One S x X), numeral (4 = IV, 2024 = 24).
// NÃO separam: cor comum (junta), ruído comercial (lacrado, frete, garantia...).

/**
 * Ruído comercial: palavras que descrevem o anúncio, não o produto. Removidas
 * do "núcleo" do título. Achado real (2026-10-31, auditoria EG-01): "Resident
 * Evil Village Ps5 Física Lacrado Pronta Entrega" e "...Standart PS5 BR Open
 * Box" não casavam com "Resident Evil Village" (Jaccard 0,6) e viravam
 * master_products separados: 83 grupos / 105 excedentes só em jogos.
 * ("usa", "eur" e "open box" SAÍRAM daqui em 2026-11-03: agora são região e condição.)
 */
const NOISE_WORDS = new Set([
  'fisico', 'fisica', 'fisicos', 'fisicas', 'midia', 'midias', 'jogo', 'jogos', 'game', 'games',
  'original', 'originais', 'lacrado', 'lacrada', 'novo', 'nova', 'novos', 'novas', 'nna', 'edicao',
  'edition', 'standard', 'standart', 'padrao', 'classico', 'portugues', 'dublado', 'legendado',
  'br', 'ptbr', 'pt', 'brasil', 'brasileira', 'brasileiro', 'nacional', 'nsc',
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
  'digital', 'trilogy', 'collection', 'directorscut', 'comfio',
  // relançamentos (produtos próprios)
  'greatesthits', 'platinum', 'essentials', 'playerschoice', 'nintendoselects', 'favoritos', 'relancamento',
  // condição / região / idioma
  'loose', 'usado', 'seminovo', 'openbox', 'japao', 'importado', 'regiaousa', 'regiaoeur', 'regiaoasia',
  'espanhol', 'spanish', 'ingles', 'classics', 'wireless',
  // conteúdo que não é o jogo completo
  'dlc', 'upgrade', 'expansao', 'pass', 'bundle', 'kit', 'lote', 'combo',
  // peças, embalagens e acessórios
  'encarte', 'caixavazia', 'faceplate', 'capa', 'case', 'somente', 'apenas', 'replica', 'manual',
  'amiibo', 'controle', 'console', 'volante', 'cabo', 'dock', 'headset', 'suporte', 'carregador',
  'sem', 'cartao', 'codigo', 'pelucia', 'funko', 'miniatura', 'poster', 'camiseta', 'oled', 'lite',
]);

/** Palavra antes de "edition"/depois de "edição" que NÃO é edição especial (plataforma, idioma, padrão). */
const EDITION_IGNORE = new Set([
  'standard', 'standart', 'padrao', 'normal', 'nacional', 'brasileira', 'brasileiro', 'fisica', 'fisico', 'original',
  'oficial', 'switch', 'nintendo', 'playstation', 'xbox', 'series', 'game', 'games', 'jogo', 'midia', 'base', 'portugues',
  'brasil', 'com', 'para', 'the', 'and', 'por', 'uma', 'dos', 'das', 'sem', 'nova', 'novo', 'lacrada', 'lacrado', 'regular',
]);

/** Marcadores só para jogo ("HD" em hardware é descrição de tela/disco, não edição). */
const GAME_ONLY_MARKERS = new Set(['hd']);
/** Modelos de hardware (console/acessório): DualSense Edge, Xbox Elite, PS5 Slim/Pro, PS4 Fat... */
const HARDWARE_MODEL_WORDS = new Set(['slim', 'pro', 'fat', 'edge', 'elite', 'mini', 'portal', 'vr', 'vr2']);

/** Cor comum NÃO separa produto (decisão do dono); removida do núcleo de hardware. */
const COLOR_WORDS = new Set([
  'preto', 'preta', 'branco', 'branca', 'azul', 'vermelho', 'vermelha', 'verde', 'rosa', 'roxo', 'roxa',
  'cinza', 'prata', 'dourado', 'dourada', 'amarelo', 'amarela', 'laranja', 'bege', 'marrom', 'azeviche',
  'black', 'white', 'blue', 'red', 'green', 'pink', 'purple', 'gray', 'grey', 'silver', 'yellow', 'orange',
  'cor', 'coral', 'turquesa', 'translucido', 'transparente', 'neon', 'camuflado', 'camuflada',
  'midnight', 'cosmic', 'starlight', 'galactic', 'volcanic', 'sterling', 'carbon', 'electric', 'volt',
  'shock', 'aqua', 'pulse', 'velocity', 'mineral', 'stormcloud', 'nocturnal', 'cobalt', 'sunburst',
]);

/** Franquias com edição de console/controle temática (edição limitada de verdade). */
const THEMED =
  'zelda|pokemon|mario|splatoon|animal crossing|astro bot|spider ?man|god of war|call of duty|fortnite|hello kitty|monster hunter|kirby|final fantasy|dragon quest|metroid|xenoblade|pikachu|hyrule|tears of the kingdom|ragnarok|gran turismo|returnal|demon souls|horizon|the last of us|ghost of tsushima|cyberpunk|star wars|batman|marvel|fifa|hogwarts';

/** Frases multi-palavra que viram um único token antes da tokenização (ordem importa). */
const PHRASE_RULES: Array<[RegExp, string]> = [
  [/\bgame of the year\b/g, ' goty '],
  [/\bjogo do ano\b/g, ' goty '],
  [/\bcaixa vazia\b/g, ' caixavazia '],
  [/\bsteel ?book\b/g, ' steelbook '],
  [/\bcollector'?s?\b/g, ' collector '],
  [/\bcolecionadores?\b/g, ' collector '],
  [/\bcolecionador\b/g, ' collector '],
  [/\bedicao (?:de )?colecao\b/g, ' collector '],
  [/\bremaster(?:ed|izad[oa]|s)?\b/g, ' remastered '],
  // "com fio" separa (outro produto); "sem fio"/wireless é tratado em normalizeTitle (normal no controle, marcador no headset)
  [/\bcom[\s-]?fio\b|\bc\/ ?fio\b|\bwired\b/g, ' comfio '],
  // ruído de anúncio que não descreve o produto
  [/\bsem juros\b|\b(?:apenas|somente|so) hoje\b|\blancamento (?:19|20)\d{2}\b|\bcapa fisica\b|\bcom capa\b|\bcase original\b/g, ' '],
  [/\bcontroller\b/g, ' controle '],
  // siglas e apelidos de franquia (a oferta e o master escrevem de jeitos diferentes)
  [/\bgta\b/g, ' grand theft auto '],
  [/\bcod\b/g, ' call of duty '],
  [/\bgow\b/g, ' god of war '],
  [/\btlou\b/g, ' the last of us '],
  [/\bdbz\b/g, ' dragon ball z '],
  [/\bre ?(\d)\b/g, ' resident evil $1 '],
  [/\bff ?(\d+|[ivx]+)\b/g, ' final fantasy $1 '],
  [/\bmk ?(\d+|[ivx]+)\b/g, ' mortal kombat $1 '],
  [/\bmw ?(\d)\b/g, ' modern warfare $1 '],
  [/\bparte\b/g, ' part '],
  [/\bescarlate\b/g, ' scarlet '],
  [/\bvioleta\b/g, ' violet '],
  [/\bpre[\s-]?venda\b/g, ' prevenda '],
  [/\bday[\s-]?one\b/g, ' dayone '],
  [/\bexpansion\b/g, ' expansao '],
  [/\bseason pass\b|\bpasse de temporada\b/g, ' dlc '],
  [/\b100\s*%/g, ' '],
  [/\bea sports\b/g, ' ea '],
  [/\bnintendo switch\s+sports\b|\bswitch\s+sports\b/g, ' switchsports '],
  // condição: Open Box e usado/seminovo/recondicionado são condição própria, nunca "novo"
  [/\bopen[\s-]?box\b/g, ' openbox '],
  [/\b(?:usad[oa]s?|seminov[oa]s?|recondicionad[oa]s?|refurbished|pre[\s-]?owned|segunda mao|vitrine|mostruario)\b/g, ' usado '],
  // defeito, sucata e peças também não são "novo" (achado do guardião, 2026-11-03)
  [/\b(?:com )?defeito\b|\bsucata\b|\b(?:para )?retirada de pecas\b|\bquebrad[oa]s?\b|\bnao liga\b|\bconserto\b|\bdesbloquead[oa]s?\b/g, ' usado '],
  // relançamentos
  [/\bgreatest hit[sz]?\b|\bps ?hits\b|\bplaystation hits\b|(?<!platinum )\bhits\b/g, ' greatesthits '],
  [/\bclassics\b|\bbest sellers?\b/g, ' classics '],
  [/\bplatinum(?: hits?)?\b|\bplatina\b/g, ' platinum '],
  [/\bplayer'?s? choice\b/g, ' playerschoice '],
  [/\bessentials?\b/g, ' essentials '],
  [/\bnintendo selects\b/g, ' nintendoselects '],
  [/\bfavoritos\b/g, ' favoritos '],
  [/\brelancamento\b|\breedicao\b|\bre-?release\b|\bre lancamento\b/g, ' relancamento '],
  // edição em português / outras grafias
  [/\b(?:edicao|versao) (?:de )?luxo\b/g, ' deluxe '],
  [/\b(?:edicao|versao) completa\b/g, ' complete '],
  [/\b(?:edicao|versao) definitiva\b/g, ' definitive '],
  [/\b(?:edicao|versao) especial\b|\bspecial edition\b/g, ' special '],
  [/\b(?:edicao|versao) limitada\b|\blimited edition\b|\blimited run\b/g, ' limited '],
  [/\baniversario\b/g, ' anniversary '],
  [/\b(?:edicao|versao) (?:do )?diretor\b|\bdirector'?s? cut\b/g, ' directorscut '],
  [/\btrilogia\b/g, ' trilogy '],
  [/\bcolec(?:ao|oes)\b|\banthology\b|\bcompilation\b|\bcompilacao\b/g, ' collection '],
  // região / idioma (importado é produto separado)
  // (o "USA"/"EUR" em maiúsculas é capturado em normalizeTitle antes do lowercase: "usa" minúsculo é o verbo)
  [/\bjapan\b|\bjp\b|\bjapones(?:a)?\b|\bjapanese\b|\bjpn\b|\bntsc-?j\b/g, ' japao '],
  [/\bnum ?us\b|\b(?:original|versao|import(?:ado|ada)?|ntsc) (?:de )?us\b|\bntsc-?u(?:\/c)?\b|\bntsc\b|\bamerican[oa]\b|\bversao americana\b|\bus version\b|\beua\b|\bestados unidos\b/g, ' regiaousa '],
  [/\beur\b|\beuro\b|\beuropeu\b|\beuropean\b|\beuropa\b|\bpal\b|\buk\b|\beu\b|\balemanha\b|\balemao\b/g, ' regiaoeur '],
  [/\basia(?:tico|tica|n)?\b|\bchines(?:a)?\b|\bchinese\b|\bcoreano\b|\bkorean?\b|\bhong kong\b|\bhk\b/g, ' regiaoasia '],
  [/\bimport(?:ado|ada)?\b|\bimportacao\b/g, ' importado '],
  [/\bem ingles\b|\benglish\b|\bversao inglesa\b/g, ' ingles '],
  [/\bespanol\b|\bcastellano\b/g, ' espanhol '],
];

/** Só hardware: "revisado" de console é condição; em jogo é "edição revisada". */
const HARDWARE_USED_RE = /\brevisad[oa]s?\b/g;
/** Só hardware: edição temática (Zelda, Pokémon, Astro Bot...) é edição limitada. */
const THEMED_EDITION_RES: RegExp[] = [
  new RegExp(`\\b(?:edicao|edition|colecao)\\s+(?:especial\\s+|limitada\\s+|limited\\s+)?(?:${THEMED})\\b`, 'g'),
  new RegExp(`\\b(?:${THEMED})\\s+(?:edicao|edition)\\b`, 'g'),
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
];

/** Capacidade de armazenamento: eixo de identidade em hardware (825GB x 1TB); ruído em jogo. */
const CAPACITY_RE = /\b(\d{1,2}(?:[.,]\d)?)\s?(?:tb|tera(?:byte)?s?)\b|\b(\d{2,4})\s?gb\b/g;

function parseCapacityGb(text: string): number | null {
  CAPACITY_RE.lastIndex = 0;
  const m = CAPACITY_RE.exec(text);
  if (!m) return null;
  let gb = m[1] ? Math.round(parseFloat(m[1].replace(',', '.')) * 1000) : Number(m[2]);
  if (gb === 1024) gb = 1000;
  if (gb === 2048) gb = 2000;
  return Number.isFinite(gb) && gb > 0 ? gb : null;
}

/** Variante de console que a mesma plataforma esconde: Series S x X, One S x X. */
function parseConsoleVariant(text: string): string | null {
  // `\b` depois de series/serie: sem ele "series" casava "serie"+"s" e "Xbox Series 1TB" virava Series S
  const series = /xbox\s*(?:series|serie)\b\s*([xs])\b(?:\s*(?:[/|&]|e)\s*([xs])\b)?/.exec(text);
  if (series) return 'series_' + [...new Set([series[1], series[2]].filter(Boolean))].sort().join('');
  if (/\bxsx\b/.test(text)) return 'series_x';
  if (/\bxss\b/.test(text)) return 'series_s';
  const bare = /\bseries\s*([xs])\b/.exec(text);
  if (bare) return 'series_' + bare[1];
  const one = /xbox\s*one\s*([xs])\b/.exec(text);
  if (one) return 'one_' + one[1];
  return null;
}

const ROMAN: Record<string, number> = {
  ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
};

/**
 * Numerais unificados: 4 = IV, 24 = 2024. Romano de 2+ letras vale em núcleo com
 * 2+ palavras; "V"/"X" soltos só no fim do nome ou antes de número/"hd" ("GTA V",
 * "Final Fantasy X HD"), para não confundir com o "x" de "Mario x Rabbids".
 * Entrada: tokens do núcleo; saída: tokens com numerais em dígitos.
 */
export function unifyNumerals(core: string[]): string[] {
  return core.map((t, i) => {
    if (/^(19|20)\d{2}$/.test(t)) return String(Number(t.slice(2)));
    const r = ROMAN[t];
    if (r === undefined) return t;
    if (core.length < 2) return t;
    if (t.length === 1) {
      const next = core[i + 1];
      if (!(i === core.length - 1 || (next !== undefined && (/^\d+$/.test(next) || next === 'hd')))) return t;
    }
    return String(r);
  });
}

/** Numerais de sequência de um núcleo (dígitos, romanos e anos já unificados), ordenados e sem repetição. */
export function numeralsOf(core: string): string[] {
  const toks = unifyNumerals(core.split(' ').filter(Boolean));
  return [...new Set(toks.filter((t) => /^\d+$/.test(t)))].sort();
}

export interface NormalizedTitle {
  /** Núcleo do título (sem plataforma, sem ruído, sem marcadores), tokens separados por espaço. */
  coreTitle: string;
  /** Alias de compatibilidade: coreTitle + marcadores, a "identidade" completa do título. */
  cleanTitle: string;
  /** Plataforma derivada do TÍTULO (pode ser 'unknown' se o título não indica). */
  platform: string;
  /** Marcadores de edição/condição/região/peça presentes (ordenados, sem repetição). */
  markers: string[];
  /** Tokens numéricos do núcleo, já unificados (4 = IV, 24 = 2024). */
  numbers: string[];
  /** jogo, console ou acessório (o que o título descreve; hardware tem eixos próprios). */
  kind: TitleKind;
  /** Gerações citadas no disco/aparelho (descontada a "compatibilidade"); 2+ da mesma família = cross-gen. */
  gens: string[];
  /** Plataformas legadas citadas (ps3, wii_u, 3ds...); fora do enum de plataforma. */
  legacy: string[];
  /** Capacidade em GB (hardware); null se não citada. 1TB = 1000. */
  capacityGb: number | null;
  /** Variante de console (series_s, series_x, series_sx, one_s, one_x); null se não citada. */
  variant: string | null;
}

export interface NormalizeOptions {
  /** Tipo do cadastro (master/oferta): evita inferir pelo título. */
  productType?: string | null;
}

/**
 * Normaliza o título de um item para comparação/deduplicação.
 * Remove acentos, pontuação, plataforma e ruído comercial; separa os
 * marcadores de edição (que impedem a fusão) do núcleo do nome.
 */
export function normalizeTitle(title: string, options: NormalizeOptions = {}): NormalizedTitle {
  const platform = derivePlatformFromTitle(title);
  const kind: TitleKind =
    options.productType === 'game' || options.productType === 'console' || options.productType === 'accessory'
      ? options.productType
      : titleHardwareKind(title);
  const hardware = kind !== 'game';

  // "USA"/"EUR" em MAIÚSCULAS é a região; "usa" minúsculo é o verbo ("usa pilhas"). Lido antes do lowercase.
  const caseAware = title.replace(/\bUSA\b/g, ' regiaousa ').replace(/\bEUR\b/g, ' regiaoeur ');

  // "(compatível com PS5)" é compatibilidade, não parte do nome nem a geração do disco.
  let text = stripCompatMentions(
    fixPlatformTypos(
      caseAware
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        // símbolos de marca somem; apóstrofo é removido ("Assassin's" = "Assassins"); decimal cola ("7.1" = "71")
        .replace(/[®™©'’´`]/g, '')
        .replace(/\b[57]\.1\b/g, ' ')
        .replace(/\b(\d)\.(\d)\b/g, '$1$2')
    )
  );

  // "Sem fio"/wireless/bluetooth é o normal do controle (não separa), mas em headset/mouse é outro produto.
  const isController = /\b(?:controle|controller|joystick|joy ?con|dualsense|dualshock|gamepad|manete)\b/.test(text);
  text = text.replace(/\bsem[\s-]?fio\b|\bs\/ ?fio\b|\bwireless\b|\bbluetooth\b/g, hardware && !isController ? ' wireless ' : ' ');

  for (const [pattern, replacement] of PHRASE_RULES) text = text.replace(pattern, replacement);
  // Qualquer "X Edition" / "Edição X" cujo X não seja padrão vira marcador próprio (Launch, Ouro, Founders...).
  text = text.replace(/\b([a-z]{3,}) edition\b/g, (m: string, w: string) => (EDITION_IGNORE.has(w) || MARKER_WORDS.has(w) || COLOR_WORDS.has(w) ? m : ` edx${w} `));
  text = text.replace(/\bedicao ([a-z]{3,})\b/g, (m: string, w: string) => (EDITION_IGNORE.has(w) || MARKER_WORDS.has(w) || COLOR_WORDS.has(w) ? m : ` edx${w} `));
  if (hardware) {
    text = text.replace(HARDWARE_USED_RE, ' usado ');
    for (const re of THEMED_EDITION_RES) text = text.replace(re, ' limited $& ');
  }

  // Eixos de hardware lidos ANTES de a plataforma ser removida do texto.
  const capacityGb = hardware ? parseCapacityGb(text) : null;
  const variant = kind === 'console' ? parseConsoleVariant(text) : null;

  for (const pattern of PLATFORM_STRIP) text = text.replace(pattern, ' ');
  text = text.replace(CAPACITY_RE, ' ');

  text = text.replace(/[^a-z0-9\s]+/g, ' ');
  // "fc25" -> "fc 25": o mesmo jogo aparece colado e separado nos anúncios.
  text = text.replace(/\b([a-z]{2,})(\d{1,3})\b/g, '$1 $2');
  // "2k25" -> "2k 25" (NBA 2K25 e NBA 2K 25 são o mesmo jogo)
  text = text.replace(/\b(\d[a-z])(\d{2})\b/g, '$1 $2');

  const rawCore: string[] = [];
  const markers = new Set<string>();
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    // Dígito único é parte do nome ("Mario Kart 8"); o filtro antigo de
    // length > 1 apagava o 8 e igualava "Kart 8" a "Kart 7". "V" e "X"
    // soltos são numeral romano ("Final Fantasy X", "GTA V"); as demais
    // letras soltas são sobra de pontuação ("Link's" -> "link s").
    if (token.length < 2 && !/^[0-9vx]$/.test(token)) continue;
    if (NOISE_WORDS.has(token)) continue;
    if (hardware && COLOR_WORDS.has(token)) continue;
    // "console" é só o substantivo quando o item já é console; "premium" em acessório é adjetivo de anúncio.
    if ((kind === 'console' && token === 'console') || (hardware && token === 'premium')) continue;
    if (
      MARKER_WORDS.has(token) ||
      (token.startsWith('edx') && token.length > 4) ||
      (hardware && HARDWARE_MODEL_WORDS.has(token)) ||
      (!hardware && GAME_ONLY_MARKERS.has(token))
    ) {
      markers.add(token);
      continue;
    }
    rawCore.push(token);
  }

  // Console com jogo/2 controles/kit é OUTRO produto que o console puro (selo Bundle, fora da média do console puro).
  if (kind === 'console' && isBundleTitle(title)) markers.add('bundle');

  const core = unifyNumerals(rawCore);
  const markerList = [...markers].sort();
  // Console/acessório nunca tem núcleo vazio ("Console Xbox Series S 512GB" é só o aparelho):
  // sem isso o título não casava nem com ele mesmo e cada oferta criava um master novo.
  const coreTitle = core.join(' ').trim() || (hardware ? kind : '');
  return {
    coreTitle,
    cleanTitle: [coreTitle, ...markerList, capacityGb ? `${capacityGb}gb` : '', variant ?? ''].filter(Boolean).join(' '),
    platform,
    markers: markerList,
    numbers: [...new Set(core.filter((t) => /^\d+$/.test(t)))].sort(),
    kind,
    gens: generationsMentioned(title),
    legacy: legacyPlatformsMentioned(title),
    capacityGb,
    variant,
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

// ---------------------------------------------------------------------------
// Comparação de identidade por eixo (usada por dedup, relink e checagem da oferta)
// ---------------------------------------------------------------------------

export type IdentityAxis =
  | 'plataforma'
  | 'geracao_cruzada'
  | 'edicao'
  | 'regiao'
  | 'idioma'
  | 'relancamento'
  | 'condicao'
  | 'modelo'
  | 'composicao'
  | 'conteudo'
  | 'formato'
  | 'numeral'
  | 'capacidade'
  | 'variante'
  | 'titulo';

export interface IdentityDivergence {
  axis: IdentityAxis;
  detail: string;
  /** Divergência segura: basta para tirar a oferta da cesta (modo oferta). */
  hard: boolean;
  /** Divergência só por informação ausente de um lado; não impede fundir masters. */
  lenient?: boolean;
}

/** Eixo a que cada marcador pertence (o que não está aqui é edição). */
const MARKER_AXIS: Record<string, IdentityAxis> = {
  remastered: 'conteudo', remake: 'conteudo', trilogy: 'conteudo', collection: 'conteudo', directorscut: 'conteudo', hd: 'conteudo',
  greatesthits: 'relancamento', platinum: 'relancamento', essentials: 'relancamento', playerschoice: 'relancamento',
  nintendoselects: 'relancamento', favoritos: 'relancamento', relancamento: 'relancamento', classics: 'relancamento', wireless: 'modelo',
  loose: 'condicao', usado: 'condicao', seminovo: 'condicao', openbox: 'condicao',
  japao: 'regiao', importado: 'regiao', regiaousa: 'regiao', regiaoeur: 'regiao', regiaoasia: 'regiao',
  espanhol: 'idioma', spanish: 'idioma', ingles: 'idioma',
  digital: 'formato', comfio: 'modelo',
  dlc: 'composicao', upgrade: 'composicao', expansao: 'composicao', pass: 'composicao', bundle: 'composicao', kit: 'composicao',
  lote: 'composicao', combo: 'composicao', encarte: 'composicao', caixavazia: 'composicao', faceplate: 'composicao',
  capa: 'composicao', case: 'composicao', somente: 'composicao', apenas: 'composicao', replica: 'composicao', manual: 'composicao',
  amiibo: 'composicao', controle: 'composicao', console: 'composicao', volante: 'composicao', cabo: 'composicao', dock: 'composicao',
  headset: 'composicao', suporte: 'composicao', carregador: 'composicao', sem: 'composicao', cartao: 'composicao', codigo: 'composicao',
  pelucia: 'composicao', funko: 'composicao', miniatura: 'composicao', poster: 'composicao', camiseta: 'composicao',
  oled: 'modelo', lite: 'modelo', slim: 'modelo', pro: 'modelo', fat: 'modelo', edge: 'modelo', elite: 'modelo', mini: 'modelo',
  portal: 'modelo', vr: 'modelo', vr2: 'modelo',
};

/** Códigos de modelo de hardware: letras + dígitos (g435, h510, k70, dsx2). */
export function modelCodes(core: string): string[] {
  return core.split(' ').filter((t) => /^[a-z]{1,3}\d{2,4}[a-z]?$/.test(t));
}

/** Um núcleo é o outro com um número NO FIM ("kiwami 2" x "kiwami"): sequência diferente. */
function trailingNumberOnlyDifference(x: string, y: string): boolean {
  const tx = x.split(' ').filter(Boolean);
  const ty = y.split(' ').filter(Boolean);
  const [long, short] = tx.length >= ty.length ? [tx, ty] : [ty, tx];
  if (long.length !== short.length + 1) return false;
  if (!/^\d+$/.test(long[long.length - 1])) return false;
  return short.every((t, i) => t === long[i]);
}

/** Marcadores que são só o substantivo do item: a ausência no título do anúncio não prova outro produto. */
const SOFT_WHEN_MASTER_ONLY = new Set([
  'controle', 'console', 'volante', 'cabo', 'dock', 'headset', 'suporte', 'carregador', 'case', 'capa', 'cartao', 'manual', 'sem', 'somente', 'apenas',
]);

export function markerAxis(marker: string): IdentityAxis {
  return MARKER_AXIS[marker] ?? 'edicao';
}

/**
 * Todas as divergências de identidade entre dois títulos normalizados. `a` é o
 * candidato (oferta ou título novo) e `b` a referência (master). Sem divergência
 * = mesmo produto pelos eixos (o núcleo do nome é comparado à parte).
 */
export function compareIdentity(a: NormalizedTitle, b: NormalizedTitle): IdentityDivergence[] {
  const out: IdentityDivergence[] = [];

  if (a.platform !== 'unknown' && b.platform !== 'unknown' && a.platform !== b.platform) {
    out.push({ axis: 'plataforma', detail: `${a.platform} x ${b.platform}`, hard: true });
  }
  // Cross-gen só importa para JOGO (o disco é de uma geração). Acessório/console cita PS4 e PS5 por compatibilidade.
  if (a.kind === 'game' && b.kind === 'game' && a.gens.length > 0 && b.gens.length > 0 && !sameList(a.gens, b.gens)) {
    out.push({ axis: 'geracao_cruzada', detail: `[${a.gens.join(',')}] x [${b.gens.join(',')}]`, hard: true });
  }

  if (a.legacy.length > 0 || b.legacy.length > 0) {
    const known = (n: NormalizedTitle) => (n.legacy.length ? n.legacy : n.platform !== 'unknown' ? [n.platform] : []);
    const ka = known(a);
    const kb = known(b);
    const already = out.some((d) => d.axis === 'plataforma');
    if (!already && ka.length > 0 && kb.length > 0 && !sameList(ka, kb)) {
      out.push({ axis: 'plataforma', detail: `${ka.join('+')} x ${kb.join('+')}`, hard: true });
    }
  }

  const aSet = new Set(a.markers);
  const bSet = new Set(b.markers);
  for (const m of a.markers) {
    if (!bSet.has(m)) out.push({ axis: markerAxis(m), detail: `${m} só no título A`, hard: true });
  }
  for (const m of b.markers) {
    // O master tem a edição/região/relançamento/modelo e o título não diz: a oferta "padrão" silenciosa não é essa edição.
    // Só substantivos que o anúncio costuma omitir (controle, console, cabo...) não pesam.
    if (!aSet.has(m)) out.push({ axis: markerAxis(m), detail: `${m} só no master`, hard: !SOFT_WHEN_MASTER_ONLY.has(m) });
  }

  if (!sameList(a.numbers, b.numbers)) {
    const both = a.numbers.length > 0 && b.numbers.length > 0;
    // Número só de um lado: se ele fecha o nome ("Yakuza Kiwami" x "Yakuza Kiwami 2") é outra sequência;
    // se está no meio ("Resident Evil Village" x "Resident Evil VIII Village") é o mesmo jogo escrito de outro jeito.
    out.push({
      axis: 'numeral',
      detail: `[${a.numbers.join(',')}] x [${b.numbers.join(',')}]`,
      hard: both || trailingNumberOnlyDifference(a.coreTitle, b.coreTitle),
    });
  }

  // Hardware: código de modelo (G435 x G733, H510 x H350) diferente em ambos os lados é outro produto.
  if (a.kind !== 'game' && b.kind !== 'game') {
    const ca = modelCodes(a.coreTitle);
    const cb = modelCodes(b.coreTitle);
    if (ca.length > 0 && cb.length > 0 && !ca.some((c) => cb.includes(c))) {
      out.push({ axis: 'modelo', detail: `código ${ca.join('/')} x ${cb.join('/')}`, hard: true });
    }
  }

  if (a.capacityGb != null && b.capacityGb != null && a.capacityGb !== b.capacityGb) {
    out.push({ axis: 'capacidade', detail: `${a.capacityGb}GB x ${b.capacityGb}GB`, hard: true });
  } else if ((a.capacityGb == null) !== (b.capacityGb == null)) {
    out.push({ axis: 'capacidade', detail: `${a.capacityGb ?? 'sem'} x ${b.capacityGb ?? 'sem'}`, hard: false, lenient: true });
  }

  if (a.kind === 'console' && b.kind === 'console' && a.variant !== b.variant) {
    out.push({
      axis: 'variante',
      detail: `${a.variant ?? 'sem S/X'} x ${b.variant ?? 'sem S/X'}`,
      // oferta sem a letra enquanto o master tem: ambíguo, não entra na cesta; o inverso não prova nada
      hard: b.variant != null,
    });
  }

  return out;
}

/**
 * Dois títulos já normalizados são o MESMO produto? Mesmos marcadores de
 * edição/região/condição, mesmos numerais (4 = IV), mesma capacidade e variante
 * de console, mesma geração, e núcleo idêntico ou Jaccard >= limiar.
 */
export function isSameProduct(a: NormalizedTitle, b: NormalizedTitle, threshold = 0.8): boolean {
  if (!a.coreTitle || !b.coreTitle) return false;
  if (compareIdentity(a, b).some((d) => !d.lenient)) return false;
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
  const normInput = normalizeTitle(name, { productType: options.productType });
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
      productType: masterProducts.productType,
    })
    .from(masterProducts)
    .where(and(...conditions));

  const crossGenInput = mentionsMultipleGenerations(name);

  for (const candidate of candidates) {
    const normCand = normalizeTitle(candidate.name, { productType: candidate.productType });

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

    // Cross-gen (cita 2 gerações) só casa com master igualmente cross-gen da mesma lista de gerações.
    if (crossGenInput && !sameList(normCand.gens, normInput.gens)) continue;

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
    const n = normalizeTitle(r.name, { productType: r.productType });
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
    const key = [p, r.productType, formatClass(r, n), n.markers.join(','), n.coreTitle, n.capacityGb ?? '', n.variant ?? ''].join('|');
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
    const key = [p, formatClass(r, n), n.markers.join(','), n.numbers.join(','), n.capacityGb ?? '', n.variant ?? ''].join('|');
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
    const key = [r.productType, effPlatform.get(r.id), n.markers.join(','), n.coreTitle, n.capacityGb ?? '', n.variant ?? ''].join('|');
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
