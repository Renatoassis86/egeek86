// Gerador de mensagens para grupos (ata 2026-11-10). Funções PURAS: nada de banco, rede ou relógio.
// Seis modelos x dois canais (Telegram em HTML seguro, WhatsApp em texto simples).
// Regras: todo número vem do dado recebido; sem "de/por", sem "% OFF" de marketplace; linha com variável vazia some;
// a palavra "afiliado" nunca aparece; Amazon nunca (preço da Amazon fica fora de mensagem).

export type GroupChannel = 'tg' | 'wa';
export type GroupModel = 'menor-preco' | 'abaixo-media' | 'comparativo' | 'resumo-dia' | 'foto-preco' | 'departamento' | 'movimento' | 'media' | 'plataforma' | 'radar';

/** Gatilhos por movimento da série diária (ata 2026-11-10 §2). */
export type MoveKind = 'OK1' | 'OK2' | 'T1' | 'T2';
export interface MoveDetail {
  kind: MoveKind;
  /** Primeiro dia da série ('YYYY-MM-DD'). */
  sinceDay: string;
  /** Dias de série contando hoje. */
  seriesDays: number;
  /** Menor valor anterior da série. */
  refCents: number;
  /** Menor de ontem (OK2, T1) ou o menor anterior (OK1). */
  prevCents: number | null;
  /** Queda em %, uma casa decimal (OK1: sobre o menor anterior; OK2: sobre ontem; T1: acumulada em 2 dias). */
  dropPct: number;
  /** T1: anteontem, ontem, hoje. */
  path?: number[];
  /** T2: quanto está acima do menor registrado, em %. */
  nearPct?: number;
}

/** Dados reais de cada modelo de plataforma (todos lidos do banco no momento do envio). */
export type PlatformData =
  | { kind: 'P1'; minCents: number; minDay: string; avgCents: number | null; todayCents: number; seriesDays: number; sinceDay: string }
  | { kind: 'P2'; cheapNet: string; cheapCents: number; otherNet: string; otherCents: number }
  | { kind: 'P3'; todayCents: number; minCents: number | null; offersCount: number }
  | { kind: 'P4'; avgCents: number; offers: number; offerDays: number; spanDays: number; todayCents: number }
  | { kind: 'P5'; daysLeft: number; firstCents: number; minCents: number; maxCents: number; todayCents: number; sinceDay: string };
export type PlatformKind = PlatformData['kind'];

export const GROUP_LINK_BASE = 'https://www.egeek86.com';
export const MESSAGE_KEY_RE = /^[a-z0-9-]{3,40}$/;
export const BLACK_FRIDAY_LABEL = '27/11';
export const TELEGRAM_MAX_CHARS = 4096;
/** Legenda de foto (sendPhoto). */
export const TELEGRAM_CAPTION_MAX_CHARS = 1024;

// ---------------------------------------------------------------------------
// Utilidades de formato
// ---------------------------------------------------------------------------

/** R$ 1.234,56 sem depender de ICU (espaço comum, nunca NBSP). */
export function fmtBRL(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) throw new Error(`valor inválido: ${cents}`);
  const total = Math.round(cents);
  const reais = Math.floor(total / 100);
  const cent = String(total % 100).padStart(2, '0');
  return `R$ ${String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cent}`;
}

/** Percentual inteiro abaixo da média (arredondado). */
export function pctBelow(priceCents: number, avgCents: number): number {
  if (avgCents <= 0) return 0;
  return Math.round(((avgCents - priceCents) / avgCents) * 100);
}

const brFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function parts(d: Date): { dd: string; mm: string; hh: string; mi: string } {
  const p = brFmt.formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const hh = g('hour') === '24' ? '00' : g('hour');
  return { dd: g('day'), mm: g('month'), hh, mi: g('minute') };
}

/** "10/11" no horário de Brasília. */
export function fmtDay(d: Date): string {
  const p = parts(d);
  return `${p.dd}/${p.mm}`;
}

/** "10/11 às 21:41" no horário de Brasília. */
export function fmtStamp(d: Date): string {
  const p = parts(d);
  return `${p.dd}/${p.mm} às ${p.hh}:${p.mi}`;
}

function fmtClock(d: Date): string {
  const p = parts(d);
  return `${p.hh}:${p.mi}`;
}

/** "Conferido em 10/11 às 21:41 (Brasília)." */
export function conferidoLine(d: Date): string {
  return `Conferido em ${fmtStamp(d)} (Brasília).`;
}

/** Artigo + rede: "no Mercado Livre", "na Shopee". */
export function inNetwork(name: string): string {
  return /shopee|amazon|americanas|netshoes/i.test(name) ? `na ${name}` : `no ${name}`;
}
function theNetwork(name: string): string {
  return /shopee|amazon|americanas|netshoes/i.test(name) ? `A ${name}` : `O ${name}`;
}

// ---------------------------------------------------------------------------
// Escape
// ---------------------------------------------------------------------------

/** Telegram parse_mode HTML: só &, < e > precisam de escape no texto. */
export function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Valor de atributo href em HTML do Telegram. */
export function escapeTelegramAttr(s: string): string {
  return escapeTelegramHtml(s).replace(/"/g, '&quot;');
}

/** WhatsApp: *, _, ~ e ` formatam o texto; num título vindo de marketplace eles quebrariam o negrito. Removidos. */
export function escapeWhatsapp(s: string): string {
  return s.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Nome do produto para o cliente
// ---------------------------------------------------------------------------

const BAD_PHRASES: RegExp[] = [
  /\b\d{1,3}\s*%\s*off\b/gi,
  /\boff\b/gi,
  /\bimperd[ií]vel\b/gi,
  /\bpromo[cç][aã]o( rel[aâ]mpago)?\b/gi,
  /\b[uú]ltimas unidades\b/gi,
  /\bafiliad[oa]s?\b/gi,
];

const NOISE_ANYWHERE: RegExp[] = [
  /\bm[ií]dia f[ií]sica\b/gi,
  /\bformato f[ií]sico\b/gi,
  /\bf[ií]sic[oa]\b/gi,
  /^\s*jogo\b/gi,
  /\blacrad[oa]\b/gi,
  /\bpronta entrega\b/gi,
];

const PLATFORM_TOKEN = '(?:nintendo switch 2|nintendo switch|switch 2|switch|playstation ?[45]|ps ?[45]|xbox (?:one|series ?[xs]?))';
// Plataforma só sai quando está nas pontas do título ("... - PS5", "... Nintendo Switch"), nunca no meio ("Nintendo Switch Sports").
const TRAILING_PLATFORM = new RegExp(String.raw`(?:\s*[-–—:|,]\s*|\s+(?:para|p/)\s+|\s+)${PLATFORM_TOKEN}\s*$`, 'i');
const LEADING_PLATFORM = new RegExp(String.raw`^\s*(?:para\s+)?${PLATFORM_TOKEN}\s*[-–—:|]\s*`, 'i');

/** Limpa o nome vindo do cadastro: tira plataforma/formato/ruído e frases promocionais de marketplace. */
export function cleanProductName(raw: string): string {
  let s = raw;
  for (const re of BAD_PHRASES) s = s.replace(re, ' ');
  let stripped = s;
  for (const re of NOISE_ANYWHERE) stripped = stripped.replace(re, ' ');
  stripped = stripped.replace(/[()[\]|]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    const next = stripped.replace(TRAILING_PLATFORM, '').replace(LEADING_PLATFORM, '').trim();
    if (next === stripped) break;
    stripped = next;
  }
  stripped = stripped.replace(/\s+[-–—:,]\s+/g, ' - ').replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '').replace(/\s+/g, ' ').trim();
  if (stripped.length >= 2) return stripped;
  return s.replace(/\s+/g, ' ').trim() || raw.trim();
}

/** "Tomba! Edição Especial (Switch, mídia física)". Para console/acessório devolve só o nome limpo. */
export function productDisplayName(
  name: string,
  opts: { platformLabel?: string | null; format?: 'physical' | 'digital' | 'unknown' | null; isGame?: boolean } = {}
): string {
  const isGame = opts.isGame !== false;
  if (!isGame) return name.replace(/\s+/g, ' ').trim();
  const base = cleanProductName(name);
  const fmt = opts.format === 'physical' ? 'mídia física' : opts.format === 'digital' ? 'mídia digital' : '';
  const inside = [opts.platformLabel ?? '', fmt].filter(Boolean).join(', ');
  return inside ? `${base} (${inside})` : base;
}

// ---------------------------------------------------------------------------
// Link com origem e mensagem
// ---------------------------------------------------------------------------

export function buildGoLink(slug: string, channel: GroupChannel, messageKey: string): string {
  if (!MESSAGE_KEY_RE.test(messageKey)) throw new Error(`message_key inválida: ${messageKey}`);
  if (!slug || /[\s/?#]/.test(slug)) throw new Error(`slug inválido: ${slug}`);
  return `${GROUP_LINK_BASE}/go/${encodeURIComponent(slug)}?s=${channel}&m=${messageKey}`;
}

/** Link para uma página do site (não é oferta) com a origem: https://www.egeek86.com/<path>?s=tg&m=<id>. */
export function buildSiteLink(path: string, channel: GroupChannel, messageKey: string): string {
  if (!MESSAGE_KEY_RE.test(messageKey)) throw new Error(`message_key inválida: ${messageKey}`);
  if (!/^\/[a-z0-9\-/]+$/i.test(path)) throw new Error(`caminho inválido: ${path}`);
  return `${GROUP_LINK_BASE}${path}?s=${channel}&m=${messageKey}`;
}

/** Hash curto determinístico (FNV-1a, 32 bits) em base 36: não é segurança, é só identificador. */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, '0').slice(-6);
}

/** `m` do link: "g1-261110-abc123". Mesmo candidato no mesmo dia gera a mesma chave. */
export function makeMessageKey(trigger: string, seed: string, now: Date): string {
  const p = parts(now);
  const yy = String(now.getUTCFullYear()).slice(2);
  return `${trigger.toLowerCase()}-${yy}${p.mm}${p.dd}-${shortHash(seed)}`;
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export interface MsgOffer {
  slug: string;
  networkSlug: string;
  networkName: string;
  priceCents: number;
  confirmedAt: Date;
}
export interface MsgAvg {
  cents: number;
  /** Ofertas distintas que entram na média do período. */
  offers: number;
}
interface Common {
  /** Departamento (rótulo "[Tecnologia]" aparece fora de games). */
  vertical: string;
  messageKey: string;
  /** Marcação de publicidade (getAdTag). '' = sem. */
  adTag: string;
}
export type GroupMessageInput = Common &
  (
    | { model: 'menor-preco'; name: string; offer: MsgOffer; prevMinCents: number; trackingSince: Date; avg: MsgAvg }
    | { model: 'abaixo-media'; name: string; offer: MsgOffer; avg: MsgAvg }
    | {
        model: 'comparativo';
        name: string;
        cheap: MsgOffer;
        other: MsgOffer & { offersCount: number; maxCents: number };
        avg?: MsgAvg | null;
      }
    | {
        model: 'resumo-dia';
        items: Array<{ name: string; platformLabel?: string | null; offer: MsgOffer; avg: MsgAvg }>;
      }
    | {
        model: 'foto-preco';
        name: string;
        offer: MsgOffer;
        /** Os três menores preços de hoje (ordem crescente). */
        top: number[];
        medianCents: number;
        offersCount: number;
        record?: { cents: number; since: Date } | null;
        /** Foto anterior para comparar (24/11 e 27/11): só com dado gravado. */
        baseline?: { day: string; lowestCents: number } | null;
      }
    | {
        model: 'departamento';
        name: string;
        departmentLabel: string;
        offer: MsgOffer;
        others?: { minCents: number; maxCents: number } | null;
        avg?: MsgAvg | null;
      }
    | { model: 'movimento'; name: string; offer: MsgOffer; move: MoveDetail; avg?: MsgAvg | null; title?: string; meta?: string | null }
    | {
        /** "Na média ou abaixo": preço atual <= média única oferta-dia (dono, 2026-11-11). */
        model: 'media';
        name: string;
        offer: MsgOffer;
        avg: MsgAvg;
        /** Dias de série medida que sustentam a média. */
        seriesDays: number;
        /** Menor valor registrado na série (dias anteriores) e o primeiro dia dela. */
        refCents?: number | null;
        sinceDay?: string | null;
        title?: string;
        meta?: string | null;
      }
    | { model: 'radar'; items: Array<{ name: string; offer: MsgOffer; move: MoveDetail }> }
    | {
        /** Mensagem de PLATAFORMA (P1 a P5): vende as funcionalidades do site com dado real do produto. */
        model: 'plataforma';
        name: string;
        title: string;
        meta?: string | null;
        /** Página do site (ex.: /monitoramento/comparar/<id>); recebe ?s=<canal>&m=<id>. */
        path: string;
        offer: MsgOffer;
        data: PlatformData;
      }
  );

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------

const DEPARTMENTS: Record<string, string> = {
  games: 'Games',
  tecnologia: 'Tecnologia',
  eletroeletronicos: 'Eletroeletrônicos',
  livros: 'Livros',
  eletrodomesticos: 'Eletrodomésticos',
  esporte: 'Esporte',
};
export function departmentLabel(vertical: string): string {
  return DEPARTMENTS[vertical] ?? vertical;
}

interface Fmt {
  b(s: string): string; // negrito
  t(s: string): string; // texto escapado
  link(url: string, label: string): string;
}
const TG: Fmt = {
  b: (s) => `<b>${escapeTelegramHtml(s)}</b>`,
  t: escapeTelegramHtml,
  link: (url, label) => `<a href="${escapeTelegramAttr(url)}">${escapeTelegramHtml(label)}</a>`,
};
const WA: Fmt = {
  b: (s) => `*${escapeWhatsapp(s)}*`,
  t: escapeWhatsapp,
  link: (url) => url,
};

function guardNetwork(o: { networkSlug: string; networkName: string }) {
  if (/amazon/i.test(o.networkSlug) || /amazon/i.test(o.networkName)) {
    throw new Error('Amazon fica fora das mensagens (preço da Amazon nunca em mensagem).');
  }
}

export function isAmazonOffer(o: { networkSlug: string; networkName: string }): boolean {
  return /amazon/i.test(o.networkSlug) || /amazon/i.test(o.networkName);
}

/** 'YYYY-MM-DD' vira data de meio-dia em Brasília (para fmtDay). */
function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00-03:00`);
}

const fmtPct1 = (x: number) => x.toFixed(1).replace('.', ',');

/** Frase do movimento. Descritiva: só o que a série mostra, com a janela. Nunca previsão. */
function moveSentence(m: MoveDetail, price: number, amazon: boolean): string {
  const since = fmtDay(dayToDate(m.sinceDay));
  const subj = amazon ? 'O preço' : 'O menor preço';
  switch (m.kind) {
    case 'OK1':
      return `${amazon ? 'Menor preço da Amazon que registramos' : 'Menor preço que registramos'} desde ${since}; o anterior era ${fmtBRL(m.refCents)} (queda de ${fmtPct1(m.dropPct)}%).`;
    case 'OK2':
      return `${subj} era ${fmtBRL(m.prevCents as number)} ontem e está em ${fmtBRL(price)} hoje (queda de ${fmtPct1(m.dropPct)}%). Série de ${m.seriesDays} dias, desde ${since}.`;
    case 'T1': {
      const p = m.path ?? [];
      return `${subj} caiu dois dias seguidos: ${fmtBRL(p[0])}, ${fmtBRL(p[1])} e ${fmtBRL(p[2])} hoje. Série de ${m.seriesDays} dias, desde ${since}.`;
    }
    case 'T2':
      return `Está a ${fmtPct1(m.nearPct ?? 0)}% do ${amazon ? 'menor preço da Amazon que registramos' : 'menor preço que registramos'} desde ${since} (${fmtBRL(m.refCents)}).`;
  }
}

/** Carimbo: Amazon sempre "Preço na Amazon em dd/mm às hh:mm, sujeito a alteração."; demais "Conferido em ...". */
function stampLine(o: MsgOffer): string {
  return isAmazonOffer(o) ? `Preço na Amazon em ${fmtStamp(o.confirmedAt)}, sujeito a alteração.` : conferidoLine(o.confirmedAt);
}

/** Rótulo curto do item do radar: só fato medido, com a janela. */
function radarLabel(m: MoveDetail): string {
  const since = fmtDay(dayToDate(m.sinceDay));
  switch (m.kind) {
    case 'OK1':
      return `Menor preço que registramos desde ${since} (queda de ${fmtPct1(m.dropPct)}% sobre o anterior).`;
    case 'OK2':
      return `Caiu ${fmtPct1(m.dropPct)}% de ontem para hoje.`;
    case 'T1':
      return `Caiu dois dias seguidos (${fmtPct1(m.dropPct)}% acumulados).`;
    case 'T2':
      return `A ${fmtPct1(m.nearPct ?? 0)}% do menor preço que registramos desde ${since}.`;
  }
}

// ---------------------------------------------------------------------------
// Mensagem de oferta com storytelling (dono, 2026-11-11): UMA mensagem por item
// ---------------------------------------------------------------------------
type OfferMessageInput = Extract<GroupMessageInput, { model: 'movimento' | 'media' }>;

const EMOJI_DROP = '📉';
const EMOJI_COUPON = '🎟️';
/** No máximo 2 emojis por mensagem, só como marcador (queda e cupom); nenhum no título. */
export const MAX_EMOJIS_PER_MESSAGE = 2;

/** Quantos emojis o texto tem (símbolos pictográficos; variation selector e ZWJ não contam). */
export function countEmojis(text: string): number {
  return (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

const pct1 = (x: number) => x.toFixed(1).replace('.', ',');

/** Frases do insight (2 a 3, só fato medido): o que aconteceu, por que importa e o que o dado permite concluir. Nunca previsão. */
function storySentences(input: OfferMessageInput, amz: boolean): string[] {
  const o = input.offer;
  const price = o.priceCents;
  const net = o.networkName;
  const avg = !amz ? input.avg : null;
  const avgSentence = avg
    ? price < avg.cents
      ? `A média das ${avg.offers} ofertas ativas é ${fmtBRL(avg.cents)}; este preço fica ${fmtBRL(avg.cents - price)} (${pct1(((avg.cents - price) / avg.cents) * 100)}%) abaixo dela.`
      : `A média das ${avg.offers} ofertas ativas é ${fmtBRL(avg.cents)}; este preço está no nível dela.`
    : amz
      ? 'A comparação é só com o histórico da própria Amazon, nunca com as outras lojas.'
      : null;
  if (input.model === 'media') {
    const since = input.sinceDay ? fmtDay(dayToDate(input.sinceDay)) : null;
    const below = ((input.avg.cents - price) / input.avg.cents) * 100;
    const s1 =
      below > 0.05
        ? `${theNetwork(net)} está com ${fmtBRL(price)}, ${pct1(below)}% abaixo da média de ${fmtBRL(input.avg.cents)} das ${input.avg.offers} ofertas ativas.`
        : `${theNetwork(net)} está com ${fmtBRL(price)}, no nível da média de ${fmtBRL(input.avg.cents)} das ${input.avg.offers} ofertas ativas.`;
    // Série pequena é permitida (dono, 2026-11-11), mas o texto SEMPRE diz a série e não afirma tendência com menos de 3 dias.
    const serie = `Série de ${input.seriesDays === 1 ? '1 dia' : `${input.seriesDays} dias`}${since ? `, desde ${since}` : ''}`;
    const s2 = input.refCents != null ? `${serie}; o menor valor medido nela é ${fmtBRL(input.refCents)}.` : `${serie}.`;
    const s3 = input.seriesDays < 3 ? 'Com tão poucos dias de série ainda não dá para falar de tendência; é só a leitura de hoje.' : `A média usa ${input.seriesDays} dias de série medida; é uma leitura do dado de hoje.`;
    return [s1, s2, s3].filter((x): x is string => !!x).slice(0, 3);
  }
  const m = input.move;
  const since = fmtDay(dayToDate(m.sinceDay));
  const scope = amz ? ' da Amazon' : '';
  switch (m.kind) {
    case 'OK1':
      return [
        `Novo menor preço${scope} da série: ${fmtBRL(price)}, ${pct1(m.dropPct)}% abaixo do menor anterior (${fmtBRL(m.refCents)}).`,
        avgSentence,
        `É o menor valor medido em ${m.seriesDays} dias de série, desde ${since}.`,
      ].filter((x): x is string => !!x);
    case 'OK2':
      return [
        `Caiu ${pct1(m.dropPct)}% de ontem (${fmtBRL(m.prevCents as number)}) para hoje (${fmtBRL(price)}).`,
        avgSentence,
        `Na série de ${m.seriesDays} dias, desde ${since}, o menor valor medido é ${fmtBRL(m.refCents)}.`,
      ].filter((x): x is string => !!x);
    case 'T1': {
      const p = m.path ?? [];
      return [
        `Caiu dois dias seguidos: ${fmtBRL(p[0])}, ${fmtBRL(p[1])} e ${fmtBRL(p[2])} hoje (${pct1(m.dropPct)}% acumulados).`,
        avgSentence,
        `Na série de ${m.seriesDays} dias, desde ${since}, o menor valor medido é ${fmtBRL(m.refCents)}.`,
      ].filter((x): x is string => !!x);
    }
    case 'T2':
      return [
        `Está a ${pct1(m.nearPct ?? 0)}% do menor preço registrado (${fmtBRL(m.refCents)}, desde ${since}).`,
        avgSentence,
        `O piso da série de ${m.seriesDays} dias ainda não foi batido.`,
      ].filter((x): x is string => !!x);
  }
}

/** Linha das variações: queda vs ontem, R$ abaixo da média (com a média) e distância do menor registrado. */
function variationParts(input: OfferMessageInput, amz: boolean): string[] {
  const price = input.offer.priceCents;
  const out: string[] = [];
  if (input.model === 'movimento') {
    const m = input.move;
    if ((m.kind === 'OK2' || m.kind === 'T1') && m.prevCents != null && m.prevCents > price) {
      out.push(`queda de ${pct1(((m.prevCents - price) / m.prevCents) * 100)}% vs ontem`);
    }
    if (!amz && input.avg && input.avg.cents > price) out.push(`${fmtBRL(input.avg.cents - price)} abaixo da média (${fmtBRL(input.avg.cents)})`);
    if (m.kind === 'OK1') out.push(`novo menor registrado (antes ${fmtBRL(m.refCents)})`);
    else if (price < m.refCents) out.push(`${pct1(((m.refCents - price) / m.refCents) * 100)}% abaixo do menor registrado (${fmtBRL(m.refCents)})`);
    else if (price === m.refCents) out.push('igual ao menor registrado');
    else out.push(`${pct1(((price - m.refCents) / m.refCents) * 100)}% acima do menor registrado (${fmtBRL(m.refCents)})`);
  } else {
    if (input.avg.cents > price) out.push(`${fmtBRL(input.avg.cents - price)} abaixo da média (${fmtBRL(input.avg.cents)})`);
    else out.push(`no nível da média (${fmtBRL(input.avg.cents)})`);
    const ref = input.refCents;
    if (ref != null) {
      if (price < ref) out.push(`${pct1(((ref - price) / ref) * 100)}% abaixo do menor registrado (${fmtBRL(ref)})`);
      else if (price === ref) out.push('igual ao menor registrado');
      else out.push(`${pct1(((price - ref) / ref) * 100)}% acima do menor registrado (${fmtBRL(ref)})`);
    }
  }
  return out;
}

/**
 * Mensagem de UMA oferta, com a história do preço (dono, 2026-11-11). Layout, no Telegram (HTML):
 *   1. <b>Título</b> <i>Plataforma · formato</i>
 *   2. <b>R$ preço</b> no Mercado Livre
 *   3. <b>variações</b> (queda vs ontem · R$ abaixo da média (média) · distância do menor registrado), com 1 emoji de marcador
 *   4. <blockquote>insight de 2 a 3 frases factuais</blockquote>
 *   5. (cupom verificado, quando houver: ver withCouponBlock)
 *   6. <a>Ver a oferta</a> (s=tg, m=<id>)
 *   7. <i>Conferido em dd/mm às hh:mm (Brasília). #publicidade</i>
 * WhatsApp equivalente com *negrito*, _itálico_ e "> " para a citação. Todo texto de marketplace é escapado.
 */
export function formatOfferMessage(input: OfferMessageInput, channel: GroupChannel): string {
  const f = channel === 'tg' ? TG : WA;
  const o = input.offer;
  const amz = isAmazonOffer(o);
  const title = (input.title ?? input.name).trim();
  const pre = prefix(input, f);
  const italic = (s: string) => (channel === 'tg' ? `<i>${escapeTelegramHtml(s)}</i>` : `_${escapeWhatsapp(s)}_`);
  const head = `${pre}${f.b(title)}${input.meta ? ` ${italic(input.meta)}` : ''}`;
  const priceLine = `${f.b(fmtBRL(o.priceCents))} ${f.t(inNetwork(o.networkName))}`;
  const vars = variationParts(input, amz);
  const dropMarker = input.model === 'movimento' && input.move.kind !== 'T2' ? `${EMOJI_DROP} ` : '';
  const varLine = vars.length ? `${dropMarker}${f.b(vars.join(' · '))}` : null;
  const story = storySentences(input, amz).join(' ');
  const storyBlock = channel === 'tg' ? `<blockquote>${escapeTelegramHtml(story)}</blockquote>` : `> ${escapeWhatsapp(story)}`;
  const link = channel === 'tg' ? f.link(buildGoLink(o.slug, 'tg', input.messageKey), 'Ver a oferta') : buildGoLink(o.slug, 'wa', input.messageKey);
  const foot = italic(withTag(stampLine(o), input.adTag));
  return [head, priceLine, varLine, storyBlock, link, foot].filter((l): l is string => !!l && l.trim() !== '').join('\n');
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Mensagem de PLATAFORMA (dono, 2026-11-11): curta, tom especialista, dado real do produto, link para a página do site.
 * Só fato medido; nenhuma frase de previsão, de/por, % OFF ou da palavra proibida.
 */
export function formatPlatformMessage(input: Extract<GroupMessageInput, { model: 'plataforma' }>, channel: GroupChannel): string {
  const f = channel === 'tg' ? TG : WA;
  const o = input.offer;
  const d = input.data;
  const italic = (s: string) => (channel === 'tg' ? `<i>${escapeTelegramHtml(s)}</i>` : `_${escapeWhatsapp(s)}_`);
  const head = `${prefix(input, f)}${f.b(input.title.trim())}${input.meta ? ` ${italic(input.meta)}` : ''}`;
  let headline = '';
  let facts = '';
  let story = '';
  let label = '';
  const net = inNetwork(o.networkName);
  switch (d.kind) {
    case 'P1': {
      const vsMin = d.todayCents === d.minCents ? 'igual ao menor valor medido' : `${pct1(((d.todayCents - d.minCents) / d.minCents) * 100)}% acima do menor valor medido`;
      headline = 'Veja como o preço se moveu';
      facts = `menor ${fmtBRL(d.minCents)} em ${fmtDay(dayToDate(d.minDay))}${d.avgCents != null ? ` · média ${fmtBRL(d.avgCents)}` : ''} · hoje ${fmtBRL(d.todayCents)}`;
      story = `Série de ${plural(d.seriesDays, 'dia', 'dias')}, desde ${fmtDay(dayToDate(d.sinceDay))}. O menor valor medido foi ${fmtBRL(d.minCents)} em ${fmtDay(dayToDate(d.minDay))}${d.avgCents != null ? ` e a média das ofertas é ${fmtBRL(d.avgCents)}` : ''}; hoje a menor oferta está em ${fmtBRL(d.todayCents)} ${net}, ${vsMin}. O histórico completo está na página do produto.`;
      label = 'Ver o histórico no site';
      break;
    }
    case 'P2': {
      const diff = d.otherCents - d.cheapCents;
      headline = 'Mesmo produto, preços diferentes entre lojas';
      facts = `${fmtBRL(d.cheapCents)} ${inNetwork(d.cheapNet)} · ${fmtBRL(d.otherCents)} ${inNetwork(d.otherNet)} · diferença de ${fmtBRL(diff)}`;
      story = `${theNetwork(d.cheapNet)} está com ${fmtBRL(d.cheapCents)} e ${theNetwork(d.otherNet).replace(/^A /, 'a ').replace(/^O /, 'o ')} com ${fmtBRL(d.otherCents)} para a mesma mídia: ${fmtBRL(diff)} de diferença (${pct1((diff / d.otherCents) * 100)}%). A página de comparação mostra as lojas lado a lado, com o preço conferido agora.`;
      label = 'Comparar as lojas';
      break;
    }
    case 'P3':
      headline = 'Como acompanhar o preço deste produto';
      facts = `hoje ${fmtBRL(d.todayCents)}${d.minCents != null ? ` · menor registrado ${fmtBRL(d.minCents)}` : ''} · ${plural(d.offersCount, 'oferta ativa', 'ofertas ativas')}`;
      story = `Na página do produto no egeek86 estão o histórico do preço e as ${plural(d.offersCount, 'oferta ativa', 'ofertas ativas')} lado a lado. É por lá que você acompanha o movimento; as quedas relevantes também aparecem aqui no canal.`;
      label = 'Acompanhar este produto';
      break;
    case 'P4':
      headline = 'Como calculamos a média';
      facts = `média ${fmtBRL(d.avgCents)} · ${plural(d.offers, 'oferta', 'ofertas')} · hoje ${fmtBRL(d.todayCents)}`;
      story = `Cada oferta vale 1 por dia: se uma loja é coletada várias vezes no mesmo dia, ela conta uma vez só. Neste produto são ${plural(d.offers, 'oferta', 'ofertas')} e ${plural(d.offerDays, 'oferta-dia', 'oferta-dias')} em ${plural(d.spanDays, 'dia', 'dias')}, o que dá a média de ${fmtBRL(d.avgCents)}. Hoje a menor oferta está em ${fmtBRL(d.todayCents)}.`;
      label = 'Ver os números do produto';
      break;
    case 'P5': {
      headline = d.daysLeft <= 0 ? 'É hoje: Black Friday (27/11)' : `Faltam ${plural(d.daysLeft, 'dia', 'dias')} para a Black Friday (27/11)`;
      facts = `começou em ${fmtBRL(d.firstCents)} · menor ${fmtBRL(d.minCents)} · maior ${fmtBRL(d.maxCents)} · hoje ${fmtBRL(d.todayCents)}`;
      story = `Acompanhamos este produto desde ${fmtDay(dayToDate(d.sinceDay))}. Nesse período ele foi de ${fmtBRL(d.minCents)} a ${fmtBRL(d.maxCents)} (${fmtBRL(d.maxCents - d.minCents)} de variação) e hoje está em ${fmtBRL(d.todayCents)}. São números medidos, para comparar com o dia da Black Friday.`;
      label = 'Ver o histórico no site';
      break;
    }
  }
  const storyBlock = channel === 'tg' ? `<blockquote>${escapeTelegramHtml(story)}</blockquote>` : `> ${escapeWhatsapp(story)}`;
  const url = buildSiteLink(input.path, channel, input.messageKey);
  const link = channel === 'tg' ? f.link(url, label) : url;
  const foot = italic(withTag(conferidoLine(o.confirmedAt), input.adTag));
  return [head, f.b(headline), f.b(facts), storyBlock, link, foot].filter((l) => l && l.trim() !== '').join('\n');
}

function withTag(body: string, tag: string): string {
  return tag ? `${body} ${tag}` : body;
}

function prefix(i: Common, f: Fmt): string {
  return i.vertical === 'games' ? '' : `${f.t(`[${departmentLabel(i.vertical)}]`)} `;
}

function avgLine(f: Fmt, price: number, avg: MsgAvg | null | undefined): string | null {
  if (!avg || avg.cents <= price) return null;
  return `${pctBelow(price, avg.cents)}% abaixo da média de ${fmtBRL(avg.cents)} (${avg.offers} ofertas).`;
}

function render(input: GroupMessageInput, channel: GroupChannel): string {
  const f = channel === 'tg' ? TG : WA;
  const lines: Array<string | null> = [];
  const pre = prefix(input, f);

  switch (input.model) {
    case 'menor-preco': {
      guardNetwork(input.offer);
      const o = input.offer;
      lines.push(
        `${pre}${f.b(input.name)}`,
        `${f.b(fmtBRL(o.priceCents))} ${f.t(inNetwork(o.networkName))}. Menor preço que registramos desde ${fmtDay(input.trackingSince)}; o anterior era ${fmtBRL(input.prevMinCents)}.`,
        f.t(avgLine(f, o.priceCents, input.avg) ?? ''),
        conferidoLine(o.confirmedAt),
        withTag(channel === 'tg' ? f.link(buildGoLink(o.slug, 'tg', input.messageKey), 'Ver a oferta') : buildGoLink(o.slug, 'wa', input.messageKey), input.adTag)
      );
      break;
    }
    case 'abaixo-media': {
      guardNetwork(input.offer);
      const o = input.offer;
      lines.push(
        `${pre}${f.b(input.name)}`,
        `${f.b(fmtBRL(o.priceCents))} ${f.t(inNetwork(o.networkName))}, ${pctBelow(o.priceCents, input.avg.cents)}% abaixo da média de ${fmtBRL(input.avg.cents)} (${input.avg.offers} ofertas).`,
        conferidoLine(o.confirmedAt),
        withTag(channel === 'tg' ? f.link(buildGoLink(o.slug, 'tg', input.messageKey), 'Ver a oferta') : buildGoLink(o.slug, 'wa', input.messageKey), input.adTag)
      );
      break;
    }
    case 'comparativo': {
      guardNetwork(input.cheap);
      guardNetwork(input.other);
      const c = input.cheap;
      const o = input.other;
      const diff = o.priceCents - c.priceCents;
      const diffPct = Math.round((diff / o.priceCents) * 100);
      const avg = input.avg && input.avg.cents > c.priceCents ? input.avg : null;
      const stamp = c.confirmedAt.getTime() <= o.confirmedAt.getTime() ? c.confirmedAt : o.confirmedAt;
      lines.push(
        `${pre}${f.b(input.name)}`,
        `Mesma mídia, preços diferentes hoje: ${f.b(fmtBRL(c.priceCents))} ${f.t(inNetwork(c.networkName))} e ${fmtBRL(o.priceCents)} ${f.t(inNetwork(o.networkName))}${
          o.offersCount > 1 ? ` (melhor de ${o.offersCount} ofertas lá, que vão até ${fmtBRL(o.maxCents)})` : ''
        }.`,
        `${f.t(theNetwork(c.networkName))} está ${fmtBRL(diff)} abaixo (${diffPct}%)${avg ? ` e ${pctBelow(c.priceCents, avg.cents)}% abaixo da média do período de ${fmtBRL(avg.cents)}` : ''}.`,
        conferidoLine(stamp)
      );
      if (channel === 'tg') {
        lines.push(
          withTag(
            `${f.link(buildGoLink(c.slug, 'tg', input.messageKey), `Ver ${inNetwork(c.networkName)}`)} · ${f.link(buildGoLink(o.slug, 'tg', input.messageKey), `Ver ${inNetwork(o.networkName)}`)}`,
            input.adTag
          )
        );
      } else {
        lines.push(`${f.t(inNetwork(c.networkName))}: ${buildGoLink(c.slug, 'wa', input.messageKey)}`);
        lines.push(withTag(`${f.t(inNetwork(o.networkName))}: ${buildGoLink(o.slug, 'wa', input.messageKey)}`, input.adTag));
      }
      break;
    }
    case 'resumo-dia': {
      if (input.items.length < 2) throw new Error('resumo do dia exige pelo menos 2 itens');
      input.items.forEach((it) => guardNetwork(it.offer));
      const items = input.items.slice(0, 3);
      const plats = new Set(items.map((i) => i.platformLabel ?? ''));
      const nets = new Set(items.map((i) => i.offer.networkName));
      const platTxt = plats.size === 1 && [...plats][0] ? ` de ${[...plats][0]}` : '';
      const netTxt = nets.size === 1 ? ` ${f.t(`(${[...nets][0]})`)}` : '';
      lines.push(`${pre}${f.b(`${items.length} jogos${platTxt} abaixo da média hoje`)}${netTxt}`);
      items.forEach((it, i) => {
        const nm = plats.size > 1 && it.platformLabel ? `${it.name} (${it.platformLabel})` : it.name;
        const pc = pctBelow(it.offer.priceCents, it.avg.cents);
        const url = buildGoLink(it.offer.slug, channel, input.messageKey);
        lines.push(`${i + 1}. ${f.t(nm)}: ${f.b(fmtBRL(it.offer.priceCents))} (${pc}% abaixo da média)`);
        lines.push(channel === 'tg' ? f.link(url, 'Ver a oferta') : url);
      });
      const times = items.map((i) => i.offer.confirmedAt).sort((a, b) => a.getTime() - b.getTime());
      const first = times[0];
      const last = times[times.length - 1];
      let foot: string;
      if (fmtStamp(first) === fmtStamp(last)) foot = `Conferido em ${fmtStamp(first)} (Brasília).`;
      else if (fmtDay(first) === fmtDay(last)) foot = `Preços conferidos entre ${fmtClock(first)} e ${fmtClock(last)} de ${fmtDay(first)} (Brasília).`;
      else foot = `Preços conferidos entre ${fmtStamp(first)} e ${fmtStamp(last)} (Brasília).`;
      lines.push(withTag(f.t(foot), input.adTag));
      return lines.filter((l): l is string => !!l && l.trim() !== '').join('\n');
    }
    case 'foto-preco': {
      guardNetwork(input.offer);
      const o = input.offer;
      const top = input.top.slice(0, 3);
      const topTxt = top.length === 3 ? `${fmtBRL(top[0])}, ${fmtBRL(top[1])} e ${fmtBRL(top[2])}` : top.map(fmtBRL).join(', ');
      lines.push(
        `${pre}${f.b(`Foto de preço, ${fmtDay(o.confirmedAt)}: ${input.name}`)}`,
        `Menor preço hoje: ${f.b(fmtBRL(o.priceCents))} ${f.t(inNetwork(o.networkName))}.${top.length >= 2 ? ` Os menores: ${topTxt}.` : ''} Mediana de ${input.offersCount} ofertas: ${fmtBRL(input.medianCents)}.`,
        input.record ? `Menor preço que registramos desde ${fmtDay(input.record.since)}: ${fmtBRL(input.record.cents)}.` : null,
        input.baseline ? `Na foto de ${f.t(input.baseline.day)} o menor preço era ${fmtBRL(input.baseline.lowestCents)}.` : null,
        `Guardamos este registro para comparar com a Black Friday (${BLACK_FRIDAY_LABEL}).`,
        conferidoLine(o.confirmedAt),
        withTag(channel === 'tg' ? f.link(buildGoLink(o.slug, 'tg', input.messageKey), 'Ver a oferta') : buildGoLink(o.slug, 'wa', input.messageKey), input.adTag)
      );
      return lines.filter((l): l is string => !!l && l.trim() !== '').join('\n');
    }
    case 'movimento':
    case 'media':
      return formatOfferMessage(input, channel);
    case 'plataforma':
      return formatPlatformMessage(input, channel);
    case 'radar': {
      if (input.items.length < 3) throw new Error('radar exige pelo menos 3 itens');
      const items = input.items.slice(0, 6);
      if (items.some((it) => isAmazonOffer(it.offer))) throw new Error('Amazon fica fora do radar (só em alerta, com carimbo).');
      lines.push(f.b(`Radar de preços: ${items.length} jogos que mudaram`));
      items.forEach((it, i) => {
        const url = buildGoLink(it.offer.slug, channel, input.messageKey);
        lines.push(`${i + 1}. ${f.t(it.name)}: ${f.b(fmtBRL(it.offer.priceCents))} ${f.t(inNetwork(it.offer.networkName))}. ${f.t(radarLabel(it.move))}`);
        lines.push(channel === 'tg' ? f.link(url, 'Ver a oferta') : url);
      });
      const times = items.map((i) => i.offer.confirmedAt).sort((a, b) => a.getTime() - b.getTime());
      const first = times[0];
      const last = times[times.length - 1];
      let foot: string;
      if (fmtStamp(first) === fmtStamp(last)) foot = `Conferido em ${fmtStamp(first)} (Brasília).`;
      else if (fmtDay(first) === fmtDay(last)) foot = `Preços conferidos entre ${fmtClock(first)} e ${fmtClock(last)} de ${fmtDay(first)} (Brasília).`;
      else foot = `Preços conferidos entre ${fmtStamp(first)} e ${fmtStamp(last)} (Brasília).`;
      lines.push(withTag(f.t(foot), input.adTag));
      return lines.filter((l): l is string => !!l && l.trim() !== '').join('\n');
    }
    case 'departamento': {
      guardNetwork(input.offer);
      const o = input.offer;
      lines.push(
        `${f.t(`[${input.departmentLabel}]`)} ${f.b(input.name)}`,
        `Menor preço hoje entre as ofertas que acompanhamos: ${f.b(fmtBRL(o.priceCents))} ${f.t(inNetwork(o.networkName))}${
          input.others ? ` (outras de ${fmtBRL(input.others.minCents)} a ${fmtBRL(input.others.maxCents)})` : ''
        }.`,
        f.t(avgLine(f, o.priceCents, input.avg) ?? ''),
        conferidoLine(o.confirmedAt),
        withTag(channel === 'tg' ? f.link(buildGoLink(o.slug, 'tg', input.messageKey), 'Ver a oferta') : buildGoLink(o.slug, 'wa', input.messageKey), input.adTag)
      );
      break;
    }
  }
  return lines.filter((l): l is string => !!l && l.trim() !== '').join('\n');
}

// ---------------------------------------------------------------------------
// Barreira de texto (última trava antes de sair)
// ---------------------------------------------------------------------------

const BANNED: Array<[RegExp, string]> = [
  [/afiliad/i, 'afiliado'],
  [/%\s*off\b/i, '% OFF'],
  [/\bde\s*\/\s*por\b/i, 'de/por'],
  [/\bde\s+R\$\s*[\d.,]+\s+por\s+R\$/i, 'De R$ por R$'],
  [/imperd[ií]vel/i, 'imperdível'],
  [/\bcorre\b/i, 'corre'],
  [/[uú]ltimas unidades/i, 'últimas unidades'],
  [/promo[cç][aã]o rel[aâ]mpago/i, 'promoção relâmpago'],
  [/menor pre[cç]o da internet/i, 'menor da internet'],
  [/menor pre[cç]o (da|na) hist[oó]ria|menor pre[cç]o do ano/i, 'menor da história/ano'],
  // Sem previsão (veto do QA, ata 2026-11-10 §8): a tendência é descritiva, nunca "vai cair".
  [/\bvai (cair|baixar|subir|aumentar)\b/i, 'previsão: vai cair'],
  [/\bdeve (cair|baixar|subir|aumentar)\b/i, 'previsão: deve cair'],
  [/\btende a\b/i, 'tende a'],
  [/previs[aã]o/i, 'previsão'],
  [/hora de comprar/i, 'hora de comprar'],
  [/garantid[oa]/i, 'garantido'],
];

/** Devolve os problemas encontrados no texto final (vazio = limpo). */
export function textProblems(text: string, channel: GroupChannel): string[] {
  const out: string[] = [];
  for (const [re, label] of BANNED) if (re.test(text)) out.push(`termo proibido: ${label}`);
  // Amazon só com o carimbo "Preço na Amazon em dd/mm às hh:mm" (decisão do dono, 2026-11-10).
  if (/amazon/i.test(text) && !/Preço na Amazon em \d{2}\/\d{2} às \d{2}:\d{2}/.test(text)) out.push('menção à Amazon sem carimbo de horário');
  if (channel === 'tg' && text.length > TELEGRAM_MAX_CHARS) out.push(`texto acima de ${TELEGRAM_MAX_CHARS} caracteres`);
  if (/\bNaN\b|undefined|null/.test(text)) out.push('variável vazia vazou no texto');
  return out;
}

export interface RenderedGroupMessage {
  telegram: string;
  whatsapp: string;
  /** Vazio = pode sair. */
  problems: string[];
}

/** Monta os dois canais. Nunca lança por texto reprovado: devolve `problems` para o chamador marcar como não enviável. */
export function buildGroupMessages(input: GroupMessageInput): RenderedGroupMessage {
  const telegram = render(input, 'tg');
  const whatsapp = render(input, 'wa');
  return {
    telegram,
    whatsapp,
    problems: [...textProblems(telegram, 'tg'), ...textProblems(whatsapp, 'wa')],
  };
}

export function buildGroupMessage(input: GroupMessageInput, channel: GroupChannel): string {
  return render(input, channel);
}

/** Link "Enviar no WhatsApp" (sem número: o dono escolhe o grupo no próprio app). */
export function waMeLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
// Cupom verificado (ponto de ligação: `couponLookup` injetado pelo engenheiro dos cupons; ata §3.5)
// ---------------------------------------------------------------------------
export interface CouponInfo {
  code: string;
  /** Condições em texto LIDO da loja (valor mínimo, teto, escopo). Nunca inventado. */
  conditions: string;
  /** Validade lida da loja (ISO) ou null quando a loja não informa. */
  expiresAt: string | null;
  /** Quando o cupom foi visto pela última vez (ISO). */
  verifiedAt: string;
}

/** Cupom visto há no máximo 2 h, ainda dentro da validade lida e com código. */
export const COUPON_MAX_AGE_MIN = 120;

export function couponUsable(c: CouponInfo | null | undefined, now: Date): c is CouponInfo {
  if (!c || !c.code?.trim()) return false;
  const seen = new Date(c.verifiedAt).getTime();
  if (!Number.isFinite(seen)) return false;
  const ageMin = (now.getTime() - seen) / 60_000;
  if (ageMin > COUPON_MAX_AGE_MIN || ageMin < -5) return false;
  if (c.expiresAt) {
    const exp = new Date(c.expiresAt).getTime();
    if (!Number.isFinite(exp) || exp <= now.getTime()) return false;
  }
  return true;
}

/**
 * Insere o bloco do cupom antes da última linha (a do link). Se o cupom não vale, ou se o texto final for reprovado
 * pela barreira de termos, devolve o texto ORIGINAL (a mensagem sai sem cupom; nunca com cupom duvidoso).
 */
export function withCouponBlock(text: string, coupon: CouponInfo | null | undefined, channel: GroupChannel, now: Date): string {
  if (!couponUsable(coupon, now)) return text;
  const esc = channel === 'tg' ? escapeTelegramHtml : escapeWhatsapp;
  const cond = coupon.conditions?.trim() ? `, ${esc(coupon.conditions.trim())}` : '';
  const until = coupon.expiresAt ? ` Válido até ${fmtStamp(new Date(coupon.expiresAt))} segundo a loja.` : '';
  const code = channel === 'tg' ? `<code>${esc(coupon.code.trim())}</code>` : esc(coupon.code.trim());
  const mark = channel === 'tg' && countEmojis(text) < MAX_EMOJIS_PER_MESSAGE ? `${EMOJI_COUPON} ` : '';
  const block = `${mark}Cupom: ${code}${cond}.${until} Visto em ${fmtStamp(new Date(coupon.verifiedAt))}.`;
  const lines = text.split('\n');
  if (lines.length < 2) return text;
  // Antes da linha do link (a última com /go/ no texto); nos formatos antigos o link é a última linha.
  let at = lines.length - 1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('/go/')) {
      at = i;
      break;
    }
  }
  lines.splice(at, 0, block);
  const out = lines.join('\n');
  if (textProblems(out, channel).length > textProblems(text, channel).length) return text;
  if (channel === 'tg' && out.length > TELEGRAM_MAX_CHARS) return text;
  return out;
}
