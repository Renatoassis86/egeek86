// FILA DE CLASSIFICACAO de identidade (dono, 2026-11-11; ADR 0011 rascunho). PURO: sem banco, sem 'server-only', testavel sem rede.
// Fontes de incerteza: (1) console com modelo/midia/armazenamento que o titulo nao prova (console-identity.ts), (2) master com dispersao
// alta (ata 2026-11-11: ratio > 2, gap bimodal, cerca de Tukey em log), (3) oferta com preco implausivel (>= R$ 1 milhao ou > 5x a mediana).
// Regra de ouro: so dado real. Nada e inferido por preco; o preco so ALARMA (abre a pergunta), quem responde e o dono.
import { parseConsoleTitle, type ConsoleIdentity } from '@/lib/catalog/console-identity';
import { foldTitle } from '@/lib/catalog/dimensions';
import { medianCont } from '@/lib/pricing/daily-state';

export type QueueAxis = 'modelo' | 'midia' | 'armazenamento' | 'identidade' | 'preco';
export type QueueSource = 'chave_nd' | 'confianca' | 'dispersao' | 'preco';
export type OptionKind = 'escolha' | 'nao_sei' | 'nao_e_este';

export interface QueueOption {
  value: string;
  label: string;
  hint?: string;
  kind: OptionKind;
  /** Master existente que tem a identidade escolhida (console). null/ausente = nao ha ou nao se aplica. */
  targetMasterId?: string | null;
  /** Quando nao ha master com a identidade escolhida: dados para criar (depois de checar duplicata). */
  create?: { name: string; key: string; platform: string } | null;
}

export interface QueueCandidate {
  offerId: string;
  masterId: string | null;
  vertical: string;
  axis: QueueAxis;
  source: QueueSource;
  reason: string;
  understood: Record<string, unknown>;
  options: QueueOption[];
  title: string;
  titleNorm: string;
}

export const NAO_SEI: QueueOption = { value: 'nao_sei', label: 'Não sei', kind: 'nao_sei' };
export const NAO_E_ESTE: QueueOption = { value: 'nao_e_este', label: 'Não é este produto', hint: 'Sai da média e fica visível em revisão', kind: 'nao_e_este' };

// ------------------------------------------------------------------------------------------------
// Titulo normalizado e similaridade (aprendizado)
// ------------------------------------------------------------------------------------------------
const NOISE = new Set([
  'frete', 'gratis', 'lacrado', 'lacrada', 'novo', 'nova', 'original', 'pronta', 'entrega', 'garantia', 'nf', 'nota', 'fiscal', 'oferta',
  'promocao', 'imediata', 'envio', 'brasil', 'oficial', 'de', 'do', 'da', 'com', 'e', 'para', 'o', 'a',
]);

/** Titulo -> tokens uteis (dobrado, sem ruido comercial). Marcadores de identidade (slim, 1tb, digital...) ficam. */
export function titleTokens(title: string): string[] {
  return foldTitle(title)
    .split(' ')
    .filter((t) => t && !NOISE.has(t));
}

/** Chave textual estavel do titulo (tokens uteis em ordem). */
export function titleNorm(title: string): string {
  return titleTokens(title).join(' ');
}

const hasDigit = (t: string) => /\d/.test(t);

/**
 * "Titulos iguais ou muito parecidos": mesmo texto normalizado, OU Jaccard dos tokens >= 0.9 com os tokens que carregam numero/capacidade
 * IDENTICOS (825gb != 1tb nunca se confundem). Conservador de proposito: na duvida, pergunta de novo.
 */
export function titlesSimilar(a: string, b: string): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(' ') === tb.join(' ')) return true;
  const sa = new Set(ta);
  const sb = new Set(tb);
  const da = [...sa].filter(hasDigit).sort().join(',');
  const db = [...sb].filter(hasDigit).sort().join(',');
  if (da !== db) return false;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union > 0 && inter / union >= 0.9;
}

// ------------------------------------------------------------------------------------------------
// Console: identidade com overlay do piloto (825 GB sem Slim/Pro e sem "digital" = original) e respostas ja dadas
// ------------------------------------------------------------------------------------------------
export interface ConsoleOverrides {
  modelo?: string; // base | slim | pro | series_s | series_x
  midia?: string; // digital | disc
  armazenamento?: string; // 512gb | 1000gb | 2000gb
}

const MODEL_WORD: Record<string, string> = { base: 'fat', slim: 'slim', pro: 'pro', series_s: 'series s', series_x: 'series x' };
const MEDIA_WORD: Record<string, string> = { digital: 'digital', disc: 'com leitor de disco' };
const STORAGE_WORD: Record<string, string> = { '512gb': '512gb', '1000gb': '1tb', '2000gb': '2tb' };

/** Le a identidade do console a partir do TITULO, aplicando as respostas do dono como palavras explicitas (reaproveita o parser, sem duplicar regra). */
export function identifyConsole(title: string, overrides: ConsoleOverrides = {}): ConsoleIdentity {
  const extra = [overrides.modelo && MODEL_WORD[overrides.modelo], overrides.midia && MEDIA_WORD[overrides.midia], overrides.armazenamento && STORAGE_WORD[overrides.armazenamento]]
    .filter(Boolean)
    .join(' ');
  const full = extra ? `${title} ${extra}` : title;
  const t = foldTitle(full.replace(/\bp\.? ?s\.? ?5\b/gi, 'ps5'));
  const use825 = /\b825 ?gb\b/.test(t) && !/\b(slim|pro)\b/.test(t) && !/\b(digital|all digital|sem leitor|sem disco)\b/.test(t);
  return parseConsoleTitle(full, { ps5Unmarked: use825 ? 'base' : 'nd' });
}

const PLATFORM_OF: Record<string, string> = { ps5: 'ps5', xbox_series: 'xbox_series', switch_1: 'switch_1', switch_2: 'switch_2' };

export function consoleDisplayName(id: ConsoleIdentity): string {
  const fam = { ps5: 'Console PlayStation 5', xbox_series: 'Console Xbox Series', switch_1: 'Console Nintendo Switch', switch_2: 'Console Nintendo Switch 2' }[id.family as string] ?? 'Console';
  const model = { base: 'Fat (original)', slim: 'Slim', pro: 'Pro', series_s: 'Series S', series_x: 'Series X', oled: 'OLED', lite: 'Lite', standard: '' }[id.model] ?? '';
  const mid = id.media === 'digital' ? 'Digital' : id.media === 'disc' ? 'com leitor de disco' : '';
  const sto = id.family === 'xbox_series' && id.storageGb ? (id.storageGb >= 1000 ? `${id.storageGb / 1000} TB` : `${id.storageGb} GB`) : '';
  return [fam, model, mid, sto, id.edition ? `Edição ${id.edition}` : '', id.pack ? `Pacote ${id.packSignature}` : '', id.region ? `Região ${id.region}` : ''].filter(Boolean).join(' ');
}

export interface ConsoleMasterRef { id: string; name: string; identityKey?: string | null }

/** Opcao de resposta para um eixo do console, ja resolvida para o master de destino (existente ou a criar). */
function consoleOption(title: string, base: ConsoleOverrides, axis: 'modelo' | 'midia' | 'armazenamento', value: string, label: string, hint: string | undefined, masters: ConsoleMasterRef[]): QueueOption {
  const id = identifyConsole(title, { ...base, [axis]: value });
  const key = id.key;
  if (id.scope !== 'in' || !key) return { value, label, hint, kind: 'escolha', targetMasterId: null, create: null };
  const canon = masters.find((m) => {
    if (m.identityKey) return m.identityKey === key;
    const mi = identifyConsole(m.name);
    return mi.scope === 'in' && mi.key === key && mi.condition === 'new';
  });
  return {
    value, label, hint, kind: 'escolha',
    targetMasterId: canon?.id ?? null,
    create: canon ? null : { name: consoleDisplayName(id), key, platform: PLATFORM_OF[id.family as string] ?? 'unknown' },
  };
}

/** Itens de fila para UMA oferta de console. No maximo um eixo por vez (modelo, depois midia, depois armazenamento). */
export function consoleCandidate(
  offer: { id: string; title: string; masterId: string | null },
  masters: ConsoleMasterRef[],
  answered: ConsoleOverrides = {}
): QueueCandidate | null {
  const id = identifyConsole(offer.title, answered);
  if (id.scope !== 'in' || id.condition !== 'new' || !id.key || !id.family) return null;
  const base = answered;
  const understood = { familia: id.family, modelo: id.model, midia: id.media, armazenamentoGb: id.storageGb, edicao: id.edition, chave: id.key, confianca: id.confidence, naoProvado: id.unresolved };
  const mk = (axis: 'modelo' | 'midia' | 'armazenamento', source: QueueSource, reason: string, opts: Array<[string, string, string?]>): QueueCandidate => ({
    offerId: offer.id, masterId: offer.masterId, vertical: 'games', axis, source, reason, understood,
    options: [...opts.map(([v, l, h]) => consoleOption(offer.title, base, axis, v, l, h, masters)), NAO_SEI, NAO_E_ESTE],
    title: offer.title, titleNorm: titleNorm(offer.title),
  });
  if (!id.edition && id.model === 'nd' && !answered.modelo) {
    if (id.family === 'ps5') {
      return mk('modelo', 'chave_nd', 'O título não prova qual PS5 é (original, Slim ou Pro).', [
        ['base', 'PS5 original', '825 GB, modelo antigo'], ['slim', 'PS5 Slim', '1 TB (digital no Brasil: 825 GB)'], ['pro', 'PS5 Pro', '2 TB'],
      ]);
    }
    if (id.family === 'xbox_series') {
      return mk('modelo', 'chave_nd', 'O título não prova se é Xbox Series S ou X.', [['series_s', 'Series S'], ['series_x', 'Series X']]);
    }
  }
  const midiaAplica = !id.edition && id.model !== 'nd' && id.model !== 'pro' && (id.family === 'ps5' || (id.family === 'xbox_series' && id.model === 'series_x'));
  if (midiaAplica && id.mediaSource === 'presumida' && !answered.midia) {
    return mk('midia', 'confianca', 'O título não diz se é Digital ou com leitor de disco.', [['digital', 'Digital (sem leitor)'], ['disc', 'Com leitor de disco']]);
  }
  if (id.family === 'xbox_series' && !id.edition && id.model !== 'nd' && id.storageGb == null && !answered.armazenamento) {
    return mk('armazenamento', 'confianca', 'O título não cita o armazenamento.', [['512gb', '512 GB'], ['1000gb', '1 TB'], ['2000gb', '2 TB']]);
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// Dispersao e preco implausivel (todas as lojas/departamentos). O preco so alarma.
// ------------------------------------------------------------------------------------------------
export const MILLION_CENTS = 100_000_000;
export const HIGH_MULT = 5;
export const GAP_BIMODAL = 0.4;
export const TUKEY_K = 1.5;
export const MIN_FOR_TUKEY = 5;
export const MAX_DISPERSION_ITEMS_PER_MASTER = 6;

function pct(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export interface PricedOffer { id: string; price: number }

export interface DispersionResult {
  n: number; ratio: number; median: number; bimodal: boolean; flagged: boolean;
  suspects: Array<{ id: string; price: number; why: string }>;
  implausible: Array<{ id: string; price: number; why: string }>;
}

/** Sinais de dispersao de UM master. Oferta implausivel sai da conta e vai para a fonte 'preco'. */
export function dispersionOf(offers: PricedOffer[]): DispersionResult {
  const implausible: DispersionResult['implausible'] = [];
  let rest = offers.filter((o) => (o.price >= MILLION_CENTS ? (implausible.push({ id: o.id, price: o.price, why: 'preço maior ou igual a R$ 1.000.000' }), false) : true));
  const med0 = medianCont(rest.map((o) => o.price)) ?? 0;
  if (rest.length >= 3) rest = rest.filter((o) => (o.price > HIGH_MULT * med0 ? (implausible.push({ id: o.id, price: o.price, why: `mais de ${HIGH_MULT}x a mediana do produto` }), false) : true));
  const base = rest.map((o) => o.price).sort((a, b) => a - b);
  const empty: DispersionResult = { n: base.length, ratio: 1, median: base.length ? (medianCont(base) as number) : 0, bimodal: false, flagged: false, suspects: [], implausible };
  if (base.length < 3) return empty;
  const median = medianCont(base) as number;
  const ratio = base[base.length - 1] / base[0];
  const lg = base.map(Math.log);
  let maxGap = 0;
  let cut = -1;
  for (let i = 2; i <= base.length - 2; i++) {
    const g = lg[i] - lg[i - 1];
    if (g > maxGap) { maxGap = g; cut = i; }
  }
  const bimodal = maxGap > GAP_BIMODAL;
  const suspects: DispersionResult['suspects'] = [];
  const byId = (price: number) => rest.filter((o) => o.price === price);
  if (bimodal) {
    const lowSide = base.slice(0, cut);
    const highSide = base.slice(cut);
    const minority = lowSide.length < highSide.length ? lowSide : highSide;
    for (const p of minority) for (const o of byId(p)) suspects.push({ id: o.id, price: o.price, why: 'grupo de preço separado dos demais (possível produto diferente)' });
  } else if (base.length >= MIN_FOR_TUKEY) {
    const lq1 = pct(lg, 0.25);
    const lq3 = pct(lg, 0.75);
    const hi = Math.exp(lq3 + TUKEY_K * (lq3 - lq1));
    const lo = Math.exp(lq1 - TUKEY_K * (lq3 - lq1));
    for (const o of rest) if (o.price > hi || o.price < lo) suspects.push({ id: o.id, price: o.price, why: 'fora da cerca de preço do produto' });
  } else if (ratio > 2) {
    const far = [...rest].sort((a, b) => Math.abs(Math.log(b.price / median)) - Math.abs(Math.log(a.price / median)))[0];
    suspects.push({ id: far.id, price: far.price, why: 'a mais distante da mediana (poucas ofertas)' });
  }
  // dedup por id (precos repetidos)
  const seen = new Set<string>();
  const uniq = suspects.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))).slice(0, MAX_DISPERSION_ITEMS_PER_MASTER);
  return { n: base.length, ratio, median, bimodal, flagged: ratio > 2, suspects: ratio > 2 ? uniq : [], implausible };
}

export function dispersionCandidates(
  master: { id: string; name: string; vertical: string },
  offers: Array<PricedOffer & { title: string }>
): QueueCandidate[] {
  const d = dispersionOf(offers);
  const title = new Map(offers.map((o) => [o.id, o.title]));
  const out: QueueCandidate[] = [];
  for (const s of d.suspects) {
    const t = title.get(s.id) as string;
    out.push({
      offerId: s.id, masterId: master.id, vertical: master.vertical, axis: 'identidade', source: 'dispersao',
      reason: `Preço destoa do produto (${s.why}).`,
      understood: { produto: master.name, nOfertas: d.n, medianaCents: d.median, razaoMaxMin: Math.round(d.ratio * 100) / 100, bimodal: d.bimodal, precoCents: s.price },
      options: [{ value: 'sim', label: 'É este produto', hint: 'Fica na média', kind: 'escolha' }, NAO_E_ESTE, NAO_SEI],
      title: t, titleNorm: titleNorm(t),
    });
  }
  for (const s of d.implausible) {
    const t = title.get(s.id) as string;
    out.push({
      offerId: s.id, masterId: master.id, vertical: master.vertical, axis: 'preco', source: 'preco',
      reason: `Preço implausível (${s.why}).`,
      understood: { produto: master.name, nOfertas: offers.length, medianaCents: d.median, precoCents: s.price },
      options: [
        { value: 'preco_errado', label: 'Preço errado', hint: 'Sai de toda leitura (quarentena); nada é apagado', kind: 'escolha' },
        { value: 'preco_certo', label: 'Preço certo', hint: 'Mantém a oferta como está', kind: 'escolha' },
        NAO_E_ESTE, NAO_SEI,
      ],
      title: t, titleNorm: titleNorm(t),
    });
  }
  return out;
}

/** Eixos em que a decisao vira REGRA por titulo. Preco e por oferta (muda a cada coleta), nunca por titulo. */
export function axisLearnsByTitle(axis: QueueAxis): boolean {
  return axis !== 'preco';
}
