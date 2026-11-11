// Gerador de mensagens para grupos (ata 2026-11-10). Funções PURAS: nada de banco, rede ou relógio.
// Seis modelos x dois canais (Telegram em HTML seguro, WhatsApp em texto simples).
// Regras: todo número vem do dado recebido; sem "de/por", sem "% OFF" de marketplace; linha com variável vazia some;
// a palavra "afiliado" nunca aparece; Amazon nunca (preço da Amazon fica fora de mensagem).

export type GroupChannel = 'tg' | 'wa';
export type GroupModel = 'menor-preco' | 'abaixo-media' | 'comparativo' | 'resumo-dia' | 'foto-preco' | 'departamento';

export const GROUP_LINK_BASE = 'https://www.egeek86.com';
export const MESSAGE_KEY_RE = /^[a-z0-9-]{3,40}$/;
export const BLACK_FRIDAY_LABEL = '27/11';
export const TELEGRAM_MAX_CHARS = 4096;

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
];

/** Devolve os problemas encontrados no texto final (vazio = limpo). */
export function textProblems(text: string, channel: GroupChannel): string[] {
  const out: string[] = [];
  for (const [re, label] of BANNED) if (re.test(text)) out.push(`termo proibido: ${label}`);
  if (/amazon/i.test(text)) out.push('menção à Amazon');
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
