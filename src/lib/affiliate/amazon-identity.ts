// Sem 'server-only': funções puras (sem banco, sem rede), importáveis pelo coletor, por scripts tsx e por testes.
import { isbn10to13, isGenericBrand, isIsbn13 } from '../catalog/vertical/identity';
import { chaveImpressora3d, diametroDe, marcaCanonica, massaOuVolumeDe, materialDe, tipoResinaDe } from '../catalog/vertical/i3d-fields';
import { scopeIssue } from '../catalog/vertical/scope';
import { mentionsRetroPlatformOnly } from '../catalog/gate';
import type { Vertical } from '../catalog/verticais';

/**
 * IDENTIDADE DA COLETA ASSISTIDA DA AMAZON (ata 2026-11-11-amazon-na-media-unica.md, decisões D4 e D5).
 *
 * Dado um MASTER já cadastrado e aprovado e um candidato lido na busca da Amazon (ASIN, título, preço), decide:
 *   accept  mesmo produto, com todos os portões duros aprovados  -> oferta ATIVA (entra na média);
 *   draft   portões duros passam, mas há DÚVIDA (atributo ausente num lado, modelo só num lado, cobertura de título na faixa
 *           intermediária) -> oferta 'draft' (o código já exclui draft de média, mediana, menor preço, selo e vitrine);
 *   reject  outro produto, condição não nova, pacote, acessório, patrocinado ou inválido -> nada é gravado.
 *
 * Regra D4: dúvida fica FORA. Nunca se anexa a um master errado e nunca se inventa atributo: o que o título não diz fica ausente
 * e "ausente num lado só" é dúvida, não aprovação. Cor NUNCA separa (cor junta); tamanho de calçado/roupa NUNCA separa.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface AmzCand {
  a: string;
  t: string;
  p: string | null;
  l: string | null;
  /** 1 = patrocinado (anúncio pago da busca): fora. */
  s: number;
  /** URL da capa na CDN da Amazon (só o link; a Licença de PI permite guardar o link por até 24 h, então é renovado a cada leitura). */
  i?: string | null;
  /** 1 = o preço `p` foi lido na PÁGINA do produto (/dp/ASIN), nunca no card da busca. Só assim um resultado patrocinado pode ser aceito. */
  pg?: number;
}

/**
 * FLEXIBILIZACAO DA APROVACAO (dono, 2026-11-12). Liga por padrao; `AMAZON_ID_FLEX=off` (variavel de ambiente) volta ao comportamento
 * anterior sem deploy de codigo, e cada funcao de veredito aceita `{ flex: false }` (usado nos testes e na simulacao "antes").
 * Principio: os portoes DUROS (condicao nova, pacote/kit/acessorio, plataforma, edicao, regiao, voltagem, tamanho/capacidade, variante,
 * modelo diferente, retro/fora de linha) nao mudam. So o limiar de COBERTURA DE TITULO baixa, e apenas quando ha chave forte
 * (marca + codigo de modelo); o que fica na fronteira vira rascunho + pergunta na fila de classificacao, nunca vai direto para a media.
 */
export const AMAZON_FLEX_DEFAULT = (process.env.AMAZON_ID_FLEX ?? 'on').toLowerCase() !== 'off';
export interface JudgeOpts {
  flex?: boolean;
  /** ASINs de ofertas ATIVAS ja cadastradas para este master (identidade ja comprovada); usado para aceitar o resultado patrocinado. */
  knownAsins?: ReadonlySet<string>;
}
/**
 * Limiares da flexibilizacao (objeto mutavel so para a simulacao calibrar; em producao ficam estes valores).
 *  strongAccept/strongBorder: marca + codigo de modelo; cobertura do master >= strongAccept aceita; entre strongBorder e strongAccept vai para a fila.
 *  noCodeBorder*: sem codigo de modelo (so com marca no titulo): nunca aceita sozinho, so fronteira.
 *  game*: jogos (sem marca/codigo): plataforma e edicao ja iguais; todos os tokens do master presentes e covC >= gameAcceptC aceita;
 *  covM >= gameBorderM e covC >= gameBorderC vai para a fila.
 */
export const FLEX = {
  strongAccept: 0.3, strongBorder: 0.15,
  noCodeBorderM: 0.65, noCodeBorderC: 0.35,
  gameAcceptC: 0.4, gameBorderM: 0.5, gameBorderC: 0.75,
};

export type VerdictCounter = 'fora_de_linha_ou_retro' | 'aceito' | 'draft_identidade' | 'rejeitado_condicao' | 'rejeitado_composicao' | 'sem_match' | 'patrocinado' | 'invalido';

export interface Verdict {
  outcome: 'accept' | 'draft' | 'reject';
  counter: VerdictCounter;
  /** Motivo curto e estável (log/auditoria). */
  reason: string;
  score: number;
  /** Preço lido, em centavos (só em accept/draft). */
  price?: number;
  /** Rascunho de FRONTEIRA (chave forte, cobertura baixa): vai para a fila de classificação com pergunta ao dono. */
  border?: boolean;
  /** Resultado patrocinado que seria aceito se o preço vier da página do produto: o cliente deve abrir /dp/ASIN e reenviar com pg=1. */
  needsPage?: boolean;
  covM?: number;
  covC?: number;
}

/** Master como o coletor o enxerga (vem de master_products + brands + attributes.vertical). */
export interface MasterIdentity {
  vertical: Vertical;
  name: string;
  /** game_platform_gen (só games). */
  gen: string | null;
  /** attributes.vertical.segment (ex.: smart-tv, tenis, livros). */
  segment: string | null;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  /** attributes.vertical.catalogAttributes: BRAND, MODEL, ALPHANUMERIC_MODEL, VOLTAGE, GENDER, AUTHOR, BOOK_TITLE, BOOK_PUBLISHER... */
  cat: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Minúsculas sem acento, preservando pontuação (decimais, aspas de polegada). */
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const compactOf = (s: string) => norm(s).replace(/ /g, '');

export function parseBrl(p: string | null | undefined): number | null {
  if (!p) return null;
  const v = Number(p.replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
}

const ASIN_RE = /^[A-Z0-9]{10}$/;
const eqSet = <T>(a: Set<T>, b: Set<T>) => a.size === b.size && [...a].every((x) => b.has(x));
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function invalid(reason: string): Verdict {
  return { outcome: 'reject', counter: 'invalido', reason, score: 0 };
}
function reject(counter: VerdictCounter, reason: string, score = 0): Verdict {
  return { outcome: 'reject', counter, reason, score };
}

/**
 * Pré-filtros comuns (ASIN válido, preço lido). Devolve o preço ou o veredito de saída.
 * Patrocinado: sem `flex` é sempre recusado. Com `flex`, o card patrocinado NUNCA fornece preço: o título é julgado normalmente e,
 * se o resultado seria aceito/duvidoso, o veredito pede a PÁGINA do produto (`needsPage`); só com pg=1 (preço lido na /dp/ASIN)
 * o patrocinado é aceito (ver `finishSponsored`).
 */
function precheck(c: AmzCand, flex: boolean): { price: number; sponsored: boolean } | { out: Verdict } {
  if (!c || typeof c.a !== 'string' || !ASIN_RE.test(c.a)) return { out: invalid('asin_invalido') };
  const sponsored = Boolean(c.s);
  if (sponsored && !flex) return { out: reject('patrocinado', 'patrocinado') };
  const price = parseBrl(c.p);
  if (sponsored && c.pg !== 1) return { price: price ?? 1, sponsored }; // preço do card ignorado; o julgamento segue só pelo título
  if (!price) return { out: invalid('sem_preco') };
  return { price, sponsored };
}

/** Pós-julgamento do patrocinado: sem página, só pede a página (ou recusa); com página (pg=1), vale o veredito do título + a regra do ASIN conhecido. */
function finishSponsored(judged: Verdict, c: AmzCand, opts: JudgeOpts): Verdict {
  if (c.pg !== 1) {
    const knownLowCov = (opts.knownAsins?.has(c.a) ?? false) && judged.outcome === 'reject' && judged.reason === 'cobertura_baixa';
    return judged.outcome === 'reject' && !knownLowCov
      ? reject('patrocinado', 'patrocinado')
      : { outcome: 'reject', counter: 'patrocinado', reason: 'patrocinado_precisa_pagina', score: judged.score, needsPage: true };
  }
  const known = opts.knownAsins?.has(c.a) ?? false;
  // ASIN já cadastrado e ativo neste master: a identidade já foi aprovada antes; cobertura de título baixa não derruba.
  if (known && judged.outcome === 'reject' && judged.counter === 'sem_match' && judged.reason === 'cobertura_baixa') {
    return { outcome: 'accept', counter: 'aceito', reason: 'patrocinado_asin_conhecido', score: judged.score, price: parseBrl(c.p) as number };
  }
  if (judged.outcome === 'accept') return { ...judged, reason: `patrocinado_pagina:${judged.reason}` };
  if (judged.outcome === 'draft') return { ...judged, reason: `patrocinado_pagina:${judged.reason}` };
  return judged;
}

// ---------------------------------------------------------------------------
// Condição e composição (valem para todos os departamentos)
// ---------------------------------------------------------------------------

/** Não novo / não original / fora do mercado nacional: condição NOVA é portão duro (usado e recondicionado nunca entram). */
const COND_RE = /\b(usado|usada|usados|seminovo|seminova|recondicionad[oa]s?|renovad[oa]s?|renewed|refurbished|used|reembalad[oa]s?|open ?box|vitrine|mostruario|avariad[oa]s?|defeito|sucata|sem caixa|caixa aberta|internacional|importad[oa]s?|replica|falsificad[oa]s?|paralelo)\b/;
/** Pacote, kit, lote: outro produto que o item único. Só vale quando o MASTER não tem a palavra. */
const PACK_RE = /\b(kit|combo|pack|conjunto|lote|bundle|pacote|\d+ ?(?:unidades|unids?|un|pecas|pcs|pares)|leve \d+|c ?\/ ?\d+ ?(?:un|unid)|2 em 1|3 em 1)\b/;
/** Acessório/peça/compatível: só vale quando o MASTER não tem a palavra. */
const ACC_RE = /\b(compativel com|compativel|reposicao|refil|pelicula|protetor de tela|capinha|capa para|case para|suporte para|cabo para|adaptador para|carregador para)\b/;
const DIGITAL_BOOK_RE = /\b(kindle|ebook|e book|audiobook|audiolivro|versao digital|livro digital)\b/;
/** Modelo claramente descontinuado/antigo no título (eletrônicos, casa, tecnologia): fora; dúvida vira draft nos demais portões. */
const DISCONTINUED_RE = /\b(modelo antigo|modelo anterior|geracao anterior|geracao passada|versao anterior|versao antiga|descontinuado|descontinuada|fora de linha|ultimas unidades do modelo|estoque antigo|linha antiga)\b/;
const REGION_RAW_RE = /\b(USA|EUA)\b/;
const REGION_RE = /\b(japao|japones|japan|asia|europeu|europeia|us version|versao americana)\b/g;
const EDITION_RE = /\b(limitad[ao]|limited|colecionador|collector|aniversario|anniversary|edicao especial|special edition|founders|signature)\b/g;

/** Termos que o título tem e o master NÃO tem (a presença no master legitima: "Kit Sobremesa" master aceita "kit"). */
function onlyInCand(re: RegExp, mNorm: string, cNorm: string): string | null {
  const c = re.exec(cNorm);
  if (!c) return null;
  return re.test(mNorm) ? null : c[0];
}

// ---------------------------------------------------------------------------
// GAMES (lógica original da coleta, preservada; só a classificação por contador é nova)
// ---------------------------------------------------------------------------

function platformSet(text: string): Set<string> {
  const t = ' ' + norm(text) + ' ';
  const s = new Set<string>();
  if (/ ps ?5 | playstation ?5 /.test(t)) s.add('ps5');
  if (/ ps ?4 | playstation ?4 /.test(t)) s.add('ps4');
  if (/ ps ?3 | playstation ?3 /.test(t)) s.add('ps3');
  if (/ switch ?2 | ns2 /.test(t)) s.add('switch2');
  else if (/ switch /.test(t)) s.add('switch1');
  if (/ xbox series | series x | series s /.test(t)) s.add('xboxs');
  if (/ xbox one /.test(t)) s.add('xboxone');
  if (/ xbox 360 /.test(t)) s.add('xbox360');
  return s;
}
const GEN_PLAT: Record<string, string> = { ps5: 'ps5', ps4: 'ps4', ps3: 'ps3', switch_1: 'switch1', switch_2: 'switch2', xbox_series: 'xboxs', xbox_one: 'xboxone', xbox_360: 'xbox360' };
const GEN_LABEL: Record<string, string> = { ps5: 'PS5', ps4: 'PS4', ps3: 'PS3', xbox_series: 'Xbox Series', xbox_one: 'Xbox One', switch_1: 'Nintendo Switch', switch_2: 'Nintendo Switch 2', pc: 'PC' };
const GAME_STOP = new Set('jogo jogos midia fisica fisico novo nova original lacrado de do da dos das para e com o a os as the of sony standard padrao edition versao em portugues br pronta entrega envio imediato nacional game games video videogame ns2'.split(' '));
const PLAT_PHRASES = /\b(playstation ?[345]|ps ?[345]|xbox series x ?\/? ?s?|xbox series|series x ?\/? ?s?|xbox one|xbox 360|nintendo switch ?2|switch ?2|nintendo switch|switch)\b/g;
const COLORS = ['preto', 'branco', 'ouro', 'azul', 'vermelho', 'cinza', 'verde', 'rosa', 'roxo', 'amarelo', 'cobalt', 'starlight', 'galactic', 'cosmic', 'chroma'];
const EDITION = ['deluxe', 'ultimate', 'gold', 'goty', 'collector', 'colecionador', 'limitada', 'limited', 'edge', 'complete', 'completa', 'remastered', 'director', 'premium', 'special', 'especial', 'definitive', 'definitiva', 'anniversary', 'aniversario', 'launch', 'day'];
const EDMAP: Record<string, string> = { limited: 'limitada', completa: 'complete', especial: 'special', definitiva: 'definitive', aniversario: 'anniversary', colecionador: 'collector' };
/** Pacote/acessório/outro tipo de item (jogo): o conjunto original da coleta. */
const BAD_GAME = /\b(bundle|pacote|kit|combo|usado|seminovo|internacional|importado|importada|codigo|cartao|gift|amiibo|manga|livro|pelicula|skin|capa|suporte|cabo|compativel)\b/;
const MODERN_RE = /\b(?:ps ?[45]|playstation ?[45]|xbox series|series [sx]|switch)\b/;
const COND_GAME = /\b(usado|seminovo|internacional|importado|importada|recondicionad[oa]|renovad[oa]|open ?box|vitrine|reembalad[oa])\b/;

const gameTokens = (s: string): string[] => norm(s).replace(PLAT_PHRASES, ' ').split(' ').filter((w) => w && !GAME_STOP.has(w));
const colorSet = (s: string) => { const t = new Set(norm(s).split(' ')); return new Set(COLORS.filter((c) => t.has(c))); };
const editionSet = (s: string) => { const t = new Set(norm(s).split(' ')); const out = new Set<string>(); for (const e of EDITION) if (t.has(e)) out.add(EDMAP[e] ?? e); return out; };

/** Texto de busca do master de jogo: nome limpo + rótulo da plataforma quando o nome não a cita. */
export function buildAmazonQuery(name: string, gen: string | null): string {
  let q = name.replace(/[®™©]/g, ' ').replace(/\b(jogo|m[ií]dia f[ií]sica|midia fisica|novo|original|lacrado|pronta entrega|envio imediato|nacional)\b/gi, ' ').replace(/[-–]+/g, ' ').replace(/"/g, '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  const l = gen ? GEN_LABEL[gen] : undefined;
  if (l && !q.toLowerCase().includes(l.toLowerCase().split(' ')[0])) q += ' ' + l;
  return q;
}

export interface GameCtx { mPlat: Set<string>; mTok: string[]; mEd: Set<string>; mCol: Set<string>; mDigital: boolean }

/** null = master sem plataforma identificável (não há como casar com segurança). */
export function prepareGame(m: { name: string; gen: string | null }): GameCtx | null {
  const mPlat = platformSet(m.name + ' ' + buildAmazonQuery(m.name, m.gen));
  const gp = m.gen ? GEN_PLAT[m.gen] : undefined;
  if (gp) { mPlat.clear(); mPlat.add(gp); }
  if (mPlat.size === 0) return null;
  if ([...mPlat].some((p) => ['ps3', 'xboxone', 'xbox360'].includes(p))) return null; // master fora de linha: nunca recebe oferta nova da Amazon
  return { mPlat, mTok: gameTokens(m.name), mEd: editionSet(m.name), mCol: colorSet(m.name), mDigital: /\bdigital\b/.test(norm(m.name)) };
}

/** Numerais romanos de sequência/edição anual (ex.: "II", "XXIII"). Só tokens inequívocos; "x", "xl", "xxl" ficam de fora (tamanhos). */
const ROMAN_TOKENS = new Set('ii iii iv vi vii viii ix xi xii xiii xiv xv xvi xvii xviii xix xxi xxii xxiii xxiv xxv xxvi xxvii'.split(' '));
const romanSet = (nrm: string): Set<string> => new Set(nrm.split(' ').filter((t) => ROMAN_TOKENS.has(t)));
const isNumeralToken = (t: string) => /^\d{1,4}$/.test(t) || ROMAN_TOKENS.has(t);

export function judgeGame(ctx: GameCtx, c: AmzCand, opts: JudgeOpts = {}): Verdict {
  const flex = opts.flex ?? AMAZON_FLEX_DEFAULT;
  const pre = precheck(c, flex);
  if ('out' in pre) return pre.out;
  const v = judgeGameTitle(ctx, c, pre.price, flex);
  return pre.sponsored ? finishSponsored(v, c, opts) : v;
}

function judgeGameTitle(ctx: GameCtx, c: AmzCand, price: number, flex: boolean): Verdict {
  const title = String(c.t ?? '').slice(0, 300);
  const ct = norm(title);
  const retro = mentionsRetroPlatformOnly(ct) ?? (/\b(xbox one|ps ?[123]|wii|3ds|nintendo ds)\b/.test(ct) && !MODERN_RE.test(ct) ? 'retro' : null);
  if (retro) return reject('fora_de_linha_ou_retro', `plataforma_fora_de_linha:${retro}`);
  if (BAD_GAME.test(ct) || COND_GAME.test(ct)) return COND_GAME.test(ct) ? reject('rejeitado_condicao', 'condicao_nao_nova') : reject('rejeitado_composicao', 'pacote_ou_acessorio');
  if (!ctx.mDigital && /\bdigital\b/.test(ct) && !/midia fisica|fisico/.test(ct)) return reject('rejeitado_composicao', 'formato_digital');
  const cPlat = platformSet(title);
  const platOk = ctx.mPlat.has('xboxs') || ctx.mPlat.has('xboxone') ? [...ctx.mPlat].every((x) => cPlat.has(x)) : eqSet(ctx.mPlat, cPlat);
  if (!platOk) return reject('sem_match', 'plataforma_diferente');
  if (!eqSet(ctx.mEd, editionSet(title))) return reject('sem_match', 'edicao_diferente');
  const cCol = colorSet(title);
  if (ctx.mCol.size && cCol.size && ![...ctx.mCol].some((x) => cCol.has(x))) return reject('sem_match', 'cor_diferente');
  if (!ctx.mCol.size && cCol.size && /ouro|edicao limitada/.test(ct) && !ctx.mEd.size) return reject('sem_match', 'edicao_ouro');
  const cTok = gameTokens(title), cs = new Set(cTok);
  const inter = ctx.mTok.filter((w) => cs.has(w)).length;
  const covM = ctx.mTok.length ? inter / ctx.mTok.length : 0, covC = cTok.length ? inter / cTok.length : 0;
  const score = covM * 0.6 + covC * 0.4;
  if (covM >= 0.8 && covC >= 0.5) {
    if (flex && !eqSet(romanSet(norm(ctx.mTok.join(' '))), romanSet(ct))) return { ...reject('sem_match', 'sequencia_romana_diferente', score), covM, covC };
    return { outcome: 'accept', counter: 'aceito', reason: 'jogo_cobertura', score, price, covM, covC };
  }
  if (!flex) return reject('sem_match', 'cobertura_baixa');
  // Flexibilizacao (jogos): plataforma e edicao ja sao iguais. O que sobra de diferenca esta nos tokens extras do titulo (subtitulo,
  // editora, "Midia Fisica"...). Numeral/romano extra ou faltando = outra sequencia: recusa. Sem isso: aceite (todos os tokens do master
  // presentes e cobertura razoavel) ou fronteira (fila).
  const ms = new Set(ctx.mTok);
  const extras = cTok.filter((t) => !ms.has(t));
  if (extras.some(isNumeralToken)) return { ...reject('sem_match', 'numeral_extra_no_titulo', score), covM, covC };
  if (!eqSet(romanSet(norm(ctx.mTok.join(' '))), romanSet(ct))) return { ...reject('sem_match', 'sequencia_romana_diferente', score), covM, covC };
  if (covM >= 0.8 && covC >= FLEX.gameAcceptC && covM === 1) return { outcome: 'accept', counter: 'aceito', reason: 'jogo_cobertura_flex', score, price, covM, covC };
  if (covM >= FLEX.gameBorderM && covC >= FLEX.gameBorderC) {
    return { outcome: 'draft', counter: 'draft_identidade', reason: 'fronteira:jogo_cobertura', score, price, border: true, covM, covC };
  }
  return { ...reject('sem_match', 'cobertura_baixa', score), covM, covC };
}

// ---------------------------------------------------------------------------
// Extração de atributos do título (demais departamentos)
// ---------------------------------------------------------------------------

const GENERIC_STOP = new Set((
  'de do da dos das para por com sem e ou o a os as um uma em no na nos nas ao ate ' +
  'original novo nova lacrado lacrada oficial garantia nota fiscal frete gratis gratuito envio imediato pronta entrega nacional brasil full prime oferta promocao lancamento ' +
  'tamanho cor modelo versao linha serie unidade unidades produto item pol polegada polegadas ' +
  'preto preta branco branca azul vermelho vermelha verde amarelo amarela rosa roxo roxa laranja cinza prata prateado prateada dourado dourada grafite marrom bege black white blue red green silver gold pink gray grey ' +
  'masculino masculina feminino feminina unissex infantil juvenil menino menina adulto adulta'
).split(' '));

const VARIANT_WORDS = new Set('ti super xt xtx pro max plus ultra lite mini slim oled qled neo fe gt gte oc'.split(' '));
const GENDER_MAP: Array<[string, RegExp]> = [
  ['m', /\b(masculin[oa]s?|homem|homens)\b/],
  ['f', /\b(feminin[oa]s?|mulher|mulheres)\b/],
  ['u', /\bunissex\b/],
  ['k', /\b(infantil|juvenil|menino|menina|kids|crianca)\b/],
];

/** Sem unidade/ruído: o que NÃO é código de modelo ("4k", "hdr10", "wifi6", "ddr5", "1080p", "24h", "usbc"...). */
const CODE_NOISE = /^(?:\d+[a-z]{1,2}|\d+in\d+|\d+x\d+|[248]k|hdr\d*|wifi\d*|usb\d*|usbc|hdmi\d*|cat\d+|ddr\d+x?|gddr\d+x?|lpddr\d+x?|pcie\d*|nvme\d*|sata\d*|ip\d+x?|ipx\d|ac\d+|dc\d+|mp\d+|h26\d|ps\d|xbox\d+|rj\d+|rgb\d*|bt\d+|type\d*c?|fullhd|ultrahd|dolby\w*|atmos|bivolt|\d+gb|\d+tb|\d+hz|\d+mah|\d+btus?)$/;
const isMixed = (t: string) => /[a-z]/.test(t) && /\d/.test(t);
const looksLikeCode = (t: string) => t.length >= 4 && t.length <= 24 && isMixed(t) && !CODE_NOISE.test(t);

export interface Feat {
  norm: string;
  compact: string;
  words: Set<string>;
  tokens: string[];
  codes: string[];
  inches: Set<number>;
  qty: Map<string, Set<number>>;
  volts: Set<string>;
  gender: Set<string>;
  variants: Set<string>;
  editions: Set<string>;
  region: Set<string>;
  nums: Set<string>;
  years: Set<string>;
  /** Códigos de modelo FRACOS (hifenizados: "AFON-12L", "PE-45-6X"). Só servem para CONFIRMAR um modelo; nunca para recusar por "modelo diferente". */
  hcodes: string[];
  /** Numerais romanos do título (sequência/edição anual: "II", "XXIII"). */
  roman: Set<string>;
}

function parseNum(s: string): number {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  return Number(s.replace(',', '.'));
}

const NOUN_INCH_SEGMENTS = new Set(['smart-tv', 'monitor', 'notebook', 'tablet', 'projetor', 'e-reader']);

/** Extrai os atributos de identidade de um texto (título do anúncio ou nome do master). */
export function extractFeat(text: string, segment: string | null = null): Feat {
  let w = ' ' + fold(text) + ' ';
  const rawText = text;
  const qty = new Map<string, Set<number>>();
  const addQty = (k: string, v: number) => { if (Number.isFinite(v)) { if (!qty.has(k)) qty.set(k, new Set()); qty.get(k)!.add(v); } };
  const inches = new Set<number>();

  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    w = w.replace(re, (...args) => {
      const groups = args.slice(0, -2) as string[];
      fn(groups as unknown as RegExpExecArray);
      return ' ';
    });
  };

  // polegadas: 50", 50 pol, 50 polegadas, "tv 50"
  take(/(\d{2,3}(?:[.,]\d)?)\s?(?:"|''|”|“|pol\b|polegadas?\b|inch\b)/g, (m) => inches.add(parseNum(m[1])));
  if (segment && NOUN_INCH_SEGMENTS.has(segment)) {
    take(/\b(?:tv|monitor|notebook|tablet|tela|display|projetor)\s+(?:de\s+)?(\d{2,3}(?:[.,]\d)?)(?=\s|$)/g, (m) => inches.add(parseNum(m[1])));
  }
  // armazenamento/memória
  take(/(\d+(?:[.,]\d+)?)\s?(tb|gb)\b/g, (m) => addQty('gb', parseNum(m[1]) * (m[2] === 'tb' ? 1000 : 1)));
  // volume
  take(/(\d+(?:[.,]\d+)?)\s?(litros?|lts?|ml|l)\b/g, (m) => addQty('ml', parseNum(m[1]) * (m[2] === 'ml' ? 1 : 1000)));
  // massa (g só com 2+ dígitos e >= 50, para não confundir com a rede 5G)
  take(/(\d+(?:[.,]\d+)?)\s?(kgs?|quilos?)\b/g, (m) => addQty('g', parseNum(m[1]) * 1000));
  take(/\b(\d{2,4})\s?(gr|gramas|g)\b/g, (m) => { const v = Number(m[1]); if (v >= 50) addQty('g', v); });
  // potência, BTU, frequência, bateria
  take(/(\d+(?:[.,]\d{3})*)\s?btus?\b/g, (m) => addQty('btu', parseNum(m[1])));
  take(/\b(\d{2,5})\s?(?:w|watts?)\b/g, (m) => addQty('w', Number(m[1])));
  take(/\b(\d{2,3})\s?hz\b/g, (m) => addQty('hz', Number(m[1])));
  take(/\b(\d{3,6})\s?mah\b/g, (m) => addQty('mah', Number(m[1])));

  // voltagem (127 e 110 são a mesma classe no varejo brasileiro)
  const volts = new Set<string>();
  take(/\b(110|127)\s?\/\s?220\s?v?\b/g, () => volts.add('bivolt'));
  take(/\bbi[- ]?volt\b/g, () => volts.add('bivolt'));
  take(/\b(110|127|220)\s?v(?:olts?)?\b/g, (m) => volts.add(m[1] === '220' ? '220' : '110'));

  // tamanho de calçado/roupa NUNCA separa: sai do texto
  w = w.replace(/\b(?:tamanho|tam\.?|numero|num|n)\s?:?\s?\d{1,2}(?:\s?[/-]\s?\d{1,2})?\b/g, ' ');

  const nrm = norm(w);
  const words = new Set(nrm.split(' ').filter(Boolean));
  const gender = new Set<string>();
  for (const [k, re] of GENDER_MAP) if (re.test(nrm)) gender.add(k);
  // "Ultra HD" é resolução, não a variante Ultra
  const nVar = ' ' + nrm.replace(/\bultra ?hd\b/g, ' ').replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2') + ' ';
  const variants = new Set<string>();
  for (const v of VARIANT_WORDS) if (nVar.includes(' ' + v + ' ')) variants.add(v);
  const editions = new Set<string>();
  for (const m of nrm.matchAll(EDITION_RE)) editions.add(m[1].replace('limited', 'limitada').replace('collector', 'colecionador').replace('anniversary', 'aniversario'));
  const region = new Set<string>();
  if (REGION_RAW_RE.test(rawText)) region.add('eua');
  for (const m of nrm.matchAll(REGION_RE)) region.add(m[1]);

  const tokens: string[] = [];
  const nums = new Set<string>();
  const years = new Set<string>();
  const codes: string[] = [];
  for (const t of nrm.split(' ')) {
    if (!t) continue;
    if (/^(19|20)\d{2}$/.test(t)) { years.add(t); continue; }
    if (/^\d{1,4}$/.test(t)) { nums.add(String(Number(t))); tokens.push(t); continue; }
    if (looksLikeCode(t)) codes.push(t);
    if (GENERIC_STOP.has(t) || t.length < 2) continue;
    tokens.push(t);
  }
  // Códigos hifenizados: primeiro segmento só letras (2+), tem dígito, 5+ caracteres juntos, e não é ruído técnico (wi-fi6, usb-c3...).
  const hcodes: string[] = [];
  for (const m of fold(text).matchAll(/\b([a-z]{2,}(?:[-/][a-z0-9]+)+)\b/g)) {
    const c = m[1].replace(/[-/]/g, '');
    if (c.length >= 5 && c.length <= 24 && /\d/.test(c) && !CODE_NOISE.test(c) && !hcodes.includes(c)) hcodes.push(c);
  }
  const roman = new Set(nrm.split(' ').filter((t) => ROMAN_TOKENS.has(t)));
  return { norm: nrm, compact: nrm.replace(/ /g, ''), words, tokens, codes, inches, qty, volts, gender, variants, editions, region, nums, years, hcodes, roman };
}

// ---------------------------------------------------------------------------
// Casamento de códigos de modelo
// ---------------------------------------------------------------------------

function codeMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 7 && l.includes(s)) return true;
  return s.length >= 5 && l.startsWith(s) && l.length - s.length <= 6;
}

/** Casamento FRACO (candidato com código hifenizado, normalmente sem o sufixo de cor/região): igual, ou o do master = o do candidato + até 4 LETRAS (sem dígito). "ZV-E10" não casa "zve10m2" (M2 = Mark II). */
function weakCodeMatch(masterCode: string, cand: string): boolean {
  if (masterCode === cand) return true;
  return cand.length >= 5 && masterCode.startsWith(cand) && /^[a-z]{1,4}$/.test(masterCode.slice(cand.length));
}

/** Códigos do master: atributos MODEL/ALPHANUMERIC_MODEL/MPN (na forma compacta) + tokens do nome. */
function masterCodes(m: MasterIdentity, f: Feat): string[] {
  const out = new Set<string>(f.codes);
  const add = (v: unknown) => {
    const s = str(v);
    if (!s) return;
    for (const part of s.split(/[,;/]/)) {
      const c = compactOf(part);
      if (c.length >= 4 && c.length <= 24 && isMixed(c) && !CODE_NOISE.test(c)) out.add(c);
    }
  };
  add(m.cat?.MODEL); add(m.cat?.ALPHANUMERIC_MODEL); add(m.mpn); add(m.cat?.MPN);
  return [...out];
}

function brandOf(m: MasterIdentity): string | null {
  const b = str(m.cat?.BRAND) ?? str(m.brand);
  return b && !isGenericBrand(b) ? b : null;
}

function brandInTitle(brand: string, cf: Feat): boolean {
  const bn = norm(brand);
  if (!bn) return false;
  const bc = bn.replace(/ /g, '');
  const first = bn.split(' ')[0];
  return cf.compact.includes(bc) || (first.length >= 4 && cf.words.has(first));
}

// ---------------------------------------------------------------------------
// Contexto do master (departamentos que não são games)
// ---------------------------------------------------------------------------

export interface GenericCtx {
  m: MasterIdentity;
  mNorm: string;
  f: Feat;
  brand: string | null;
  codes: string[];
  /** Tokens do atributo MODEL que não são código (ex.: "Pegasus 41"): precisam estar no título. */
  modelWords: string[];
  genderFamily: boolean;
  segment: string | null;
  isbn: string | null;
  bookTitleTokens: string[];
  author: string[];
  publisher: string[];
  i3d: { kind: 'impressora' | 'filamento' | 'resina'; key: string | null; material: string | null; diametro: string | null; massa: string | null; tipo: string | null } | null;
}

const GENDER_FAMILY_SEGMENTS = new Set(['tenis', 'chuteira', 'sandalia-chinelo', 'camisa-de-time', 'meia-esportiva', 'bone', 'mochila-esportiva', 'bolsa-de-treino', 'luva-de-goleiro', 'luva-de-academia', 'caneleira', 'roupa-de-ciclismo', 'roupa-de-compressao']);

function masterIsbn(m: MasterIdentity): string | null {
  for (const v of [m.gtin, str(m.cat?.GTIN)]) {
    const d = (v ?? '').replace(/[-\s]/g, '');
    if (isIsbn13(d)) return d;
  }
  return null;
}

const tokensOf = (s: string | null): string[] => (s ? norm(s).split(' ').filter((t) => t.length >= 3 && !GENERIC_STOP.has(t)) : []);

export function prepareGeneric(m: MasterIdentity): GenericCtx {
  const attrText = ['MEMORY_SIZE', 'CAPACITY', 'TOTAL_CAPACITY', 'VOLTAGE', 'GENDER'].map((k) => str(m.cat?.[k])).filter(Boolean).join(' ');
  const f = extractFeat(`${m.name} ${attrText}`, m.segment);
  const brand = brandOf(m);
  const codes = masterCodes(m, f);
  const modelAttr = str(m.cat?.MODEL);
  const modelIsCode = modelAttr ? codes.includes(compactOf(modelAttr)) : false;
  let modelWords = modelAttr && !modelIsCode ? tokensOf(modelAttr).filter((t) => !brand || !norm(brand).split(' ').includes(t)) : [];
  if (m.segment && !GENDER_FAMILY_SEGMENTS.has(m.segment) && m.vertical !== 'esporte') modelWords = [];
  let i3d: GenericCtx['i3d'] = null;
  const text = `${m.name} ${attrText}`;
  if (m.segment === 'impressora-3d') i3d = { kind: 'impressora', key: chaveImpressora3d(str(m.cat?.BRAND) ?? m.brand, m.name, str(m.cat?.MODEL)), material: null, diametro: null, massa: null, tipo: null };
  else if (m.segment === 'filamento-3d') i3d = { kind: 'filamento', key: null, material: materialDe(text), diametro: diametroDe(text), massa: massaOuVolumeDe(m.name), tipo: null };
  else if (m.segment === 'resina-3d') i3d = { kind: 'resina', key: null, material: null, diametro: null, massa: massaOuVolumeDe(m.name), tipo: tipoResinaDe(text) };
  return {
    m, mNorm: norm(m.name), f, brand, codes, modelWords,
    genderFamily: Boolean(m.segment && GENDER_FAMILY_SEGMENTS.has(m.segment)),
    segment: m.segment,
    isbn: masterIsbn(m),
    bookTitleTokens: tokensOf(str(m.cat?.BOOK_TITLE) ?? m.name),
    author: tokensOf(str(m.cat?.AUTHOR)),
    publisher: tokensOf(str(m.cat?.BOOK_PUBLISHER)),
    i3d,
  };
}

// ---------------------------------------------------------------------------
// Veredito (demais departamentos)
// ---------------------------------------------------------------------------

function subsetEitherWay<T>(a: Set<T>, b: Set<T>): boolean {
  return [...a].every((x) => b.has(x)) || [...b].every((x) => a.has(x));
}

/** Cobertura de tokens: covM = fração do master presente no candidato; covC = fração do candidato presente no master. */
function coverage(mTok: string[], cTok: string[]): { covM: number; covC: number } {
  const ms = new Set(mTok), cs = new Set(cTok);
  let inter = 0;
  for (const t of ms) if (cs.has(t)) inter++;
  return { covM: ms.size ? inter / ms.size : 0, covC: cs.size ? inter / cs.size : 0 };
}

function conditionOrPack(ctx: GenericCtx, cNorm: string, title: string): Verdict | null {
  const cond = COND_RE.exec(cNorm);
  if (cond && !COND_RE.test(ctx.mNorm)) return reject('rejeitado_condicao', `condicao:${cond[0]}`);
  const old = DISCONTINUED_RE.exec(cNorm);
  if (old && !DISCONTINUED_RE.test(ctx.mNorm)) return reject('fora_de_linha_ou_retro', `modelo_fora_de_linha:${old[0]}`);
  if (REGION_RAW_RE.test(title) && !REGION_RAW_RE.test(ctx.m.name)) return reject('rejeitado_condicao', 'regiao:eua');
  const pack = onlyInCand(PACK_RE, ctx.mNorm, cNorm);
  if (pack) return reject('rejeitado_composicao', `pacote:${pack}`);
  const acc = onlyInCand(ACC_RE, ctx.mNorm, cNorm);
  if (acc) return reject('rejeitado_composicao', `acessorio:${acc}`);
  if (ctx.segment) {
    const issue = scopeIssue(ctx.segment, title);
    if (issue) return reject('rejeitado_composicao', `${issue.reason}:${issue.matched}`);
  }
  return null;
}

function judgeBook(ctx: GenericCtx, c: AmzCand, title: string, price: number): Verdict {
  const cNorm = norm(title);
  const cond = COND_RE.exec(cNorm);
  if (cond && !COND_RE.test(ctx.mNorm)) return reject('rejeitado_condicao', `condicao:${cond[0]}`);
  if (DIGITAL_BOOK_RE.test(cNorm) && !DIGITAL_BOOK_RE.test(ctx.mNorm)) return reject('rejeitado_composicao', 'formato_digital');
  const pack = onlyInCand(/\b(box|kit|combo|colecao|trilogia|saga completa|pack|lote|\d+ livros)\b/, ctx.mNorm, cNorm);
  if (pack) return reject('rejeitado_composicao', `pacote:${pack}`);

  // ISBN do candidato: no título ou no próprio ASIN (livro impresso: ASIN = ISBN-10)
  let cIsbn: string | null = null;
  const inTitle = /\b(97[89]\d{10})\b/.exec(title.replace(/(?<=\d)-(?=\d)/g, ''));
  if (inTitle && isIsbn13(inTitle[1])) cIsbn = inTitle[1];
  if (!cIsbn) cIsbn = isbn10to13(c.a);
  if (cIsbn && ctx.isbn) {
    return cIsbn === ctx.isbn
      ? { outcome: 'accept', counter: 'aceito', reason: 'isbn_igual', score: 1, price }
      : reject('sem_match', 'isbn_diferente');
  }

  // Sem ISBN dos dois lados: título + autor + editora normalizados.
  const cf = extractFeat(title, 'livros');
  const { covM, covC } = coverage(ctx.bookTitleTokens.length ? ctx.bookTitleTokens : ctx.f.tokens, cf.tokens);
  if (covM < 0.9 || covC < 0.3) return reject('sem_match', 'titulo_diferente', covM);
  // volume/numeral: "Volume 2" não é "Volume 3"
  const mNums = ctx.f.nums;
  for (const n of cf.nums) if (mNums.size && !mNums.has(n)) return reject('sem_match', 'numeral_diferente', covM);
  for (const n of mNums) if (!cf.nums.has(n)) return reject('sem_match', 'numeral_ausente', covM);
  const hasAuthor = ctx.author.length > 0 && ctx.author.some((t) => cf.words.has(t));
  const hasPublisher = ctx.publisher.length > 0 && ctx.publisher.some((t) => cf.words.has(t));
  if (hasAuthor && hasPublisher) return { outcome: 'accept', counter: 'aceito', reason: 'titulo_autor_editora', score: covM, price };
  return { outcome: 'draft', counter: 'draft_identidade', reason: ctx.isbn ? 'sem_isbn_no_candidato' : 'sem_isbn', score: covM, price };
}

function judgeI3d(ctx: GenericCtx, cNorm: string, title: string, price: number): Verdict | null {
  const i = ctx.i3d;
  if (!i) return null;
  const brandCanon = ctx.brand ? marcaCanonica(ctx.brand) : '';
  const brandOk = brandCanon ? compactOf(title).includes(brandCanon) : false;
  const ok = (reason: string): Verdict => ({ outcome: 'accept', counter: 'aceito', reason, score: 1, price });
  const dr = (reason: string): Verdict => ({ outcome: 'draft', counter: 'draft_identidade', reason, score: 0.5, price });
  if (i.kind === 'impressora') {
    if (!i.key) return null;
    const ck = chaveImpressora3d(str(ctx.m.cat?.BRAND) ?? ctx.m.brand, title, null);
    if (ck === i.key) return ok('familia_igual');
    if (!ck) return dr('familia_nao_reconhecida');
    return reject('sem_match', 'familia_ou_variante_diferente');
  }
  const cf = { material: materialDe(title), diametro: diametroDe(title), massa: massaOuVolumeDe(title), tipo: tipoResinaDe(title) };
  const pairs: Array<[string | null, string | null, string]> = i.kind === 'filamento'
    ? [[i.material, cf.material, 'material'], [i.diametro, cf.diametro, 'diametro'], [i.massa, cf.massa, 'massa']]
    : [[i.tipo, cf.tipo, 'tipo'], [i.massa, cf.massa, 'volume']];
  if (pairs.some(([mv]) => mv == null)) return null; // master sem campo: segue o caminho genérico (no máximo draft)
  for (const [mv, cv, nome] of pairs) if (cv != null && mv !== cv) return reject('sem_match', `${nome}_diferente`);
  if (!brandOk) return reject('sem_match', 'marca_ausente_ou_diferente');
  if (pairs.some(([, cv]) => cv == null)) return dr('campo_ausente_no_candidato');
  void cNorm;
  return ok('campos_iguais');
}

export function judgeGeneric(ctx: GenericCtx, c: AmzCand, opts: JudgeOpts = {}): Verdict {
  const flex = opts.flex ?? AMAZON_FLEX_DEFAULT;
  const pre = precheck(c, flex);
  if ('out' in pre) return pre.out;
  const v = judgeGenericTitle(ctx, c, pre.price, flex);
  return pre.sponsored ? finishSponsored(v, c, opts) : v;
}

function judgeGenericTitle(ctx: GenericCtx, c: AmzCand, price0: number, flex: boolean): Verdict {
  const title = String(c.t ?? '').slice(0, 300);
  if (ctx.m.vertical === 'livros') return judgeBook(ctx, c, title, price0);
  const cNorm = norm(title);
  const early = conditionOrPack(ctx, cNorm, title);
  if (early) return early;
  const price = price0;

  const i3dv = judgeI3d(ctx, cNorm, title, price);
  if (i3dv) return i3dv;

  const cf = extractFeat(title, ctx.segment);
  const mf = ctx.f;
  const doubts: string[] = []; // sempre viram draft
  const soft: string[] = []; // viram draft, salvo se o modelo bate (chave forte)

  // Região / edição / variante: diferença em QUALQUER sentido é outro produto.
  for (const r of cf.region) if (!mf.region.has(r)) return reject('rejeitado_condicao', `regiao:${r}`);
  if (!eqSet(cf.editions, mf.editions)) return reject('sem_match', 'edicao_diferente');
  if (!eqSet(cf.variants, mf.variants)) return reject('sem_match', `variante_diferente:${[...cf.variants].filter((x) => !mf.variants.has(x)).concat([...mf.variants].filter((x) => !cf.variants.has(x))).join(',')}`);

  // Modelo: código igual = chave forte; códigos presentes e nenhum igual = outro modelo.
  const codeHit = ctx.codes.some((mc) => cf.codes.some((cc) => codeMatch(mc, cc)) || (mc.length >= 6 && cf.compact.includes(mc)));
  if (ctx.codes.length && cf.codes.length && !codeHit) return reject('sem_match', 'modelo_diferente');
  // Flex: código hifenizado do título ("AFON-12L") confirma o modelo (casamento fraco, nunca recusa).
  const weakHit = flex && !codeHit && ctx.codes.some((mc) => cf.hcodes.some((hc) => weakCodeMatch(mc, hc)));
  const strong = codeHit || weakHit;
  if (ctx.codes.length && !cf.codes.length && !strong) doubts.push('modelo_ausente_no_candidato');

  // Flex: numeral romano (sequência / edição anual: "Player XXIII" x "XXV", "Slick II"): diferente = outro produto; só num lado = dúvida.
  if (flex) {
    const mr = mf.roman, cr = cf.roman;
    if (mr.size && cr.size) { if (!eqSet(mr, cr)) return reject('sem_match', `numeral_romano_diferente:${[...mr].join('/')}x${[...cr].join('/')}`); }
    else if (mr.size || cr.size) doubts.push('numeral_romano_so_num_lado');
  }

  // Marca.
  if (!ctx.brand) doubts.push('marca_do_master_desconhecida');
  else if (!brandInTitle(ctx.brand, cf)) {
    const tokenCodeHit = ctx.codes.some((mc) => cf.codes.some((cc) => codeMatch(mc, cc)));
    if (!tokenCodeHit) return reject('sem_match', 'marca_ausente_ou_diferente');
    doubts.push('marca_ausente_no_titulo');
  }

  // Tamanho (polegadas) e quantidades (GB, litros, kg, W, BTU, Hz, mAh).
  if (mf.inches.size && cf.inches.size) {
    if (!eqSet(mf.inches, cf.inches)) return reject('sem_match', `tamanho_diferente:${[...mf.inches].join('/')}x${[...cf.inches].join('/')}`);
  } else if (mf.inches.size || cf.inches.size) soft.push('tamanho_so_num_lado');
  for (const k of new Set([...mf.qty.keys(), ...cf.qty.keys()])) {
    const a = mf.qty.get(k), b = cf.qty.get(k);
    if (a && b) {
      if (!subsetEitherWay(a, b)) return reject('sem_match', `capacidade_diferente:${k}`);
      if (!eqSet(a, b)) soft.push(`capacidade_parcial:${k}`);
    } else soft.push(`capacidade_so_num_lado:${k}`);
  }

  // Voltagem: ausente num lado é dúvida SEMPRE (não é cleared pelo modelo).
  if (mf.volts.size && cf.volts.size) {
    if (!eqSet(mf.volts, cf.volts)) return reject('sem_match', 'voltagem_diferente');
  } else if (mf.volts.size || cf.volts.size) doubts.push('voltagem_so_num_lado');

  // Gênero (calçado/roupa/bolsa): diferente = outro produto; ausente num lado = dúvida.
  if (ctx.genderFamily) {
    if (mf.gender.size && cf.gender.size) { if (!eqSet(mf.gender, cf.gender)) return reject('sem_match', 'genero_diferente'); }
    else doubts.push('genero_so_num_lado');
  }

  // Numerais (geração/série/volume): diferença é outro produto.
  for (const n of mf.nums) if (!cf.nums.has(n)) return reject('sem_match', `numeral_ausente:${n}`);
  const extra = [...cf.nums].filter((n) => !mf.nums.has(n));
  if (extra.length) { if (mf.nums.size) return reject('sem_match', `numeral_extra:${extra.join(',')}`); soft.push('numeral_extra'); }
  if (mf.years.size && cf.years.size && !eqSet(mf.years, cf.years)) return reject('sem_match', 'ano_diferente');
  else if (cf.years.size !== mf.years.size) soft.push('ano_so_num_lado');

  // Palavras do modelo (atributo MODEL que não é código): precisam estar no título.
  if (ctx.modelWords.length) {
    const have = ctx.modelWords.filter((t) => cf.words.has(t)).length / ctx.modelWords.length;
    if (have < 0.6) return reject('sem_match', 'modelo_ausente');
    if (have < 1) doubts.push('modelo_parcial');
  }

  // Cobertura de título.
  const { covM, covC } = coverage(mf.tokens, cf.tokens);
  const score = covM * 0.6 + covC * 0.4;
  const brandOk = Boolean(ctx.brand && brandInTitle(ctx.brand, cf));
  const strongId = strong && brandOk; // marca + código de modelo
  let borderWhy: string | null = null;
  if (strong ? covM < 0.5 : covM < 0.8 || covC < 0.45) {
    if (flex && strongId && covM >= FLEX.strongAccept) {
      // marca + código de modelo coincidem: cobertura baixa de título (título do master cheio de ruído) não derruba
    } else if (flex && strongId && covM >= FLEX.strongBorder) borderWhy = 'marca_modelo_cobertura_baixa';
    else if (flex && !strong && brandOk && covM >= FLEX.noCodeBorderM && covC >= FLEX.noCodeBorderC) borderWhy = 'marca_sem_modelo_cobertura_media';
    else return { ...reject('sem_match', 'cobertura_baixa', score), covM, covC };
  }

  const reasons = [...doubts, ...(strong ? [] : soft)];
  if (borderWhy) return { outcome: 'draft', counter: 'draft_identidade', reason: `fronteira:${[borderWhy, ...reasons].join('+')}`, score, price, border: true, covM, covC };
  if (reasons.length) return { outcome: 'draft', counter: 'draft_identidade', reason: reasons.join('+'), score, price, covM, covC };
  if (strong) return { outcome: 'accept', counter: 'aceito', reason: weakHit ? 'modelo_igual_hifenizado' : 'modelo_igual', score, price, covM, covC };
  if (!ctx.codes.length && covM >= 0.85 && covC >= 0.6) return { outcome: 'accept', counter: 'aceito', reason: 'marca_modelo_cobertura', score, price, covM, covC };
  return { outcome: 'draft', counter: 'draft_identidade', reason: 'cobertura_intermediaria', score, price, covM, covC };
}

// ---------------------------------------------------------------------------
// Termo de busca por departamento
// ---------------------------------------------------------------------------

const COLOR_STRIP = /\b(preto|preta|branco|branca|azul|vermelho|vermelha|verde|amarelo|amarela|rosa|roxo|roxa|laranja|cinza|prata|prateado|prateada|dourado|dourada|grafite|marrom|bege|black|white|blue|red|green|silver|gold|pink|gray|grey)\b/gi;

/** Termo de busca da Amazon para um master de qualquer departamento (nome limpo + marca/modelo; livros por ISBN ou título+autor). */
export function buildQueryFor(m: MasterIdentity): string {
  if (m.vertical === 'games') return buildAmazonQuery(m.name, m.gen);
  const cap = (q: string) => q.replace(/\s+/g, ' ').trim().split(' ').slice(0, 11).join(' ').slice(0, 110);
  if (m.vertical === 'livros') {
    const isbn = masterIsbn(m);
    if (isbn) return isbn;
    const title = str(m.cat?.BOOK_TITLE) ?? m.name;
    const author = str(m.cat?.AUTHOR);
    return cap(`${title} ${author && !norm(title).includes(norm(author)) ? author.split(',')[0] : ''}`);
  }
  const brand = brandOf(m);
  const f = extractFeat(m.name, m.segment);
  const codes = masterCodes(m, f);
  // código de modelo do atributo MODEL (o mais curto e específico) tem prioridade
  const modelAttr = str(m.cat?.MODEL);
  const modelCode = modelAttr && codes.includes(compactOf(modelAttr)) ? modelAttr.replace(/\s+/g, '') : codes.find((c) => c.length >= 5) ?? null;
  const base = m.name.replace(/[®™©"|]/g, ' ').replace(COLOR_STRIP, ' ').replace(/\b(?:tamanho|tam\.?|numero|n[º°o]\.?)\s*:?\s*\d{1,2}\b/gi, ' ').replace(/\+\s*nfe/gi, ' ');
  if (modelCode && brand) {
    const tail = base.split(/\s+/).filter((w) => w && !norm(w).split(' ').every((x) => !x || norm(brand).split(' ').includes(x))).slice(0, 4).join(' ');
    return cap(`${brand} ${modelCode} ${tail}`);
  }
  const hasBrand = brand ? norm(base).includes(norm(brand).split(' ')[0]) : true;
  return cap(`${hasBrand ? '' : brand + ' '}${base}`);
}
