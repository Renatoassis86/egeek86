// Regras dos gatilhos e limites anti-spam das mensagens para grupos (ata 2026-11-10). PURO: recebe fatos, devolve decisões.
// Nada aqui lê banco, relógio ou env: o chamador passa `now` e os fatos medidos.

import {
  buildGroupMessages,
  cleanProductName,
  fmtBRL,
  makeMessageKey,
  pctBelow,
  productDisplayName,
  departmentLabel,
  type GroupMessageInput,
  type MoveDetail,
  type MoveKind,
  type RenderedGroupMessage,
} from '@/lib/messaging/group-messages';

// ---------------------------------------------------------------------------
// Limiares (medidos e decididos na ata)
// ---------------------------------------------------------------------------
export const RULES = {
  /** G1 (legado): queda mínima sobre o menor anterior. */
  G1_MIN_DROP_PCT: 8,
  /** G1/G2/G3: abaixo da média mínimo. */
  MIN_BELOW_AVG_PCT: 15,
  /** Acima disso fica RETIDO (nunca sai sozinho). Onda 2: > 45% contra a média (era 40%). */
  REVIEW_ABOVE_BELOW_AVG_PCT: 45,
  /** Queda sobre o preço anterior acima disso: retido. */
  REVIEW_ABOVE_DROP_PCT: 45,
  /** Preço abaixo desta fração da mediana das ofertas ativas: retido. */
  /** Faixa de plausibilidade (dono, 2026-11-11): preço abaixo de 0,35x ou acima de 3x a mediana das ofertas = retido. */
  REVIEW_BELOW_MEDIAN_RATIO: 0.35,
  REVIEW_ABOVE_MEDIAN_RATIO: 3,
  /** Faixa verde (automático): desconto contra a média <= 30% (era 25%) e queda <= 30%. De 30 a 45%: aprovação humana. */
  GREEN_MAX_BELOW_AVG_PCT: 30,
  GREEN_MAX_DROP_PCT: 30,
  MIN_STORES: 3,
  /** G3: diferença mínima entre as melhores ofertas de duas redes. */
  G3_MIN_DIFF_PCT: 15,
  /** G5: mínimo de ofertas ativas para "alta procura". */
  G5_MIN_OFFERS: 20,
  /** Frescor do preço na detecção e no envio. */
  DETECT_MAX_AGE_MIN: 180, // onda 2: 3 h (era 2 h)
  SEND_MAX_AGE_MIN: 30,
  /** Preço precisa ter sido reconfirmado pelo menos este tempo depois da mudança. */
  CONFIRM_GAP_MIN: 15,
  /** Revalidação no envio: tolerância de variação do preço. */
  SEND_PRICE_TOLERANCE_PCT: 2,
  /** Vendedor ML. */
  ML_MIN_SALES: 50,
  ML_OK_REPUTATIONS: ['5_green', '4_light_green'],

  // ---- Política v2 (ata 2026-11-10 §1, pacote aprovado pelo dono) ----
  /** Teto global por dia (Brasília). SEM silêncio noturno: a noite vira mensagem silenciosa. */
  // Decisão do dono (2026-11-11): 400 por dia e 60 por hora ("eu quero o canal movimentado"; antes 30/40 por dia).
  DAILY_CAP: 400,
  DAILY_CAP_BLACK_FRIDAY: 400,
  HOURLY_CAP: 60,
  BLACK_FRIDAY_WEEK: { from: '2026-11-20', to: '2026-11-27' },
  /** No máximo 8 mensagens por dia com notificação sonora; o resto sai com disable_notification. */
  SOUND_CAP: 20,
  /** Intervalo mínimo entre duas mensagens sonoras (a segunda sai silenciosa se vier antes). */
  SOUND_MIN_GAP_MIN: 0,
  /** Noite = das 22h às 8h (Brasília): tudo silencioso; classes C, D, E não saem; no máximo 3 alertas. */
  NIGHT_FROM_HOUR: 22,
  NIGHT_UNTIL_HOUR: 8,
  NIGHT_ALERT_CAP: 400,
  /** Tetos por classe [normal, 20 a 27/11]. */
  CLASS_CAP: { alerta: [400, 400], radar: [400, 400], insight: [400, 400], resumo: [400, 400], cupom: [400, 400], plataforma: [400, 400] },
  /** Intervalo mínimo entre duas mensagens da mesma classe (minutos). */
  CLASS_GAP_MIN: { alerta: 0, radar: 45, insight: 0, resumo: 0, cupom: 0, plataforma: 20 },
  /** Radar: UMA mensagem com 3 a 6 itens, na hora cheia (execuções dos minutos 0 a 14), das 7h às 23h. */
  RADAR_MIN_ITEMS: 3,
  RADAR_MAX_ITEMS: 6,
  RADAR_FROM_HOUR: 7,
  RADAR_UNTIL_HOUR: 23,
  RADAR_SLOT_MINUTES: 15,
  /** Insight e cupom: das 9h às 21h. Resumo: 8h e 20h (22h na semana da Black Friday). */
  DAYTIME_FROM_HOUR: 9,
  DAYTIME_UNTIL_HOUR: 21,
  SUMMARY_HOURS: [8, 20],
  SUMMARY_HOURS_BLACK_FRIDAY: [8, 20, 22],
  PRODUCT_DEDUP_HOURS: 48,
  /** Fora do alerta (radar, insight): o produto repete só depois de 24 h ou com mudança de preço >= 2%. */
  SOFT_DEDUP_HOURS: 24,
  SOFT_DEDUP_CHANGE_PCT: 2,
  /** Rompe a janela de 48 h: novo menor preço >= 5% abaixo do enviado, depois de 6 h. */
  REBREAK_PCT: 5,
  REBREAK_AFTER_HOURS: 6,
  /** Cartão de histórico: no máximo 4 por dia e o mesmo produto 1 vez a cada 7 dias. */
  CARD_DAILY_CAP: 4,
  CARD_REPEAT_DAYS: 7,
  /** Resumo do dia. */
  G4_MIN_ITEMS: 2,
  G4_MAX_ITEMS: 3,

  // ---- Gatilhos por movimento (série diária do próprio produto) ----
  /** Dias de série (incluindo hoje) exigidos para afirmar. */
  MOVE_MIN_DAYS: 7,
  MOVE_MIN_DAYS_T1: 4,
  /** OK1: novo menor valor >= 5% abaixo do menor anterior. */
  OK1_MIN_DROP_PCT: 5,
  /** OK2: queda de ontem para hoje >= 5% (>= 8% vira alerta; entre 5 e 8 vai ao radar). */
  OK2_MIN_DROP_PCT: 5,
  OK2_ALERT_DROP_PCT: 8,
  /** T1: caiu 2 dias seguidos, queda acumulada >= 3%. */
  T1_MIN_CUM_DROP_PCT: 3,
  /** T2: a até 4% acima do menor registrado. */
  T2_NEAR_PCT: 4,

  // ---- Amazon (decisão do dono A, por conta e risco dele; ata §5b) ----
  AMAZON_DETECT_MAX_AGE_MIN: 60,
  AMAZON_SEND_MAX_AGE_MIN: 40,
  /** Duas observações separadas por pelo menos isto; vale também para voltar depois de sumir da busca. */
  AMAZON_OBS_GAP_MIN: 15,
  /** Sem lote da coleta assistida por mais que isto: a classe Amazon pausa. */
  AMAZON_LOOP_STALE_MIN: 90,
  /** Amazon só vai a automático com queda <= 30% sobre a mínima diária anterior da própria Amazon. */
  AMAZON_AUTO_MAX_DROP_PCT: 30,

  // ---- ONDA 2 (2026-11-11) ----
  /** Intervalo mínimo desde a ÚLTIMA mensagem enviada (qualquer classe). Dono: 1 min, dia e noite iguais, sem jitter. */
  SPACING_DAY_MIN: 1,
  SPACING_NIGHT_MIN: 1,
  /** Amplitude do jitter determinístico por hora (dia + hora). 0 = desligado (decisão do dono). */
  SPACING_JITTER_MIN: 0,
  /** Mesmo produto: no mínimo 90 min entre duas mensagens (dono, 2026-11-11; substitui 48 h/24 h/3 h). */
  PRODUCT_GAP_MIN: 90,
  /** Novo mínimo (OK1/G1) pode repetir o produto depois disto, se o preço for menor que o do último envio. */
  NEW_MIN_REPEAT_MIN: 30,
  /** Proposta (e proposta automática) com mais de 6 h expira. */
  PROPOSAL_MAX_AGE_HOURS: 6,
  RADAR_PROPOSAL_MAX_AGE_MIN: 20,
  /** Radar composto é opcional: desligado por padrão (uma mensagem por item). Quando ligado: 1 a cada 45 min. */
  RADAR_COMPOSITE_ENABLED: false,
  /** Diversidade só como desempate: alternativa com movimento >= 70% do da primeira. */
  DIVERSITY_MIN_QUALITY_RATIO: 0.7,
  /** Shopee pode sair automática SE a reconferência ao vivo passar e a queda for <= 20%. */
  SHOPEE_AUTO_MAX_DROP_PCT: 20,
  /** Reconferência ao vivo: limite por consulta; preço gravado mais velho que isto pede consulta ao vivo. */
  LIVE_CHECK_TIMEOUT_MS: 8000,
  LIVE_STALE_AFTER_MIN: 30,
  LIVE_MAX_COMPETITORS_PER_PRODUCT: 4,
  /** "Na média ou abaixo": média com pelo menos 3 ofertas e 1 dia de série medida (dono, 2026-11-11: série pequena é permitida; o texto diz a série). */
  MED_MIN_OFFERS: 3,
  MED_MIN_SERIES_DAYS: 1,

  // ---- Classe PLATAFORMA (P1 a P5) ----
  PLATFORM_EVERY_N_PRICE: 6,
  PLATFORM_MIN_GAP_MIN: 20,
  PLATFORM_PAUSE_MIN: 30,
  /** P2: diferença mínima entre as lojas, em centavos (R$ 20). */
  P2_MIN_DIFF_CENTS: 2000,
  BLACK_FRIDAY_DAY: '2026-11-27',
  TRACKING_SINCE_DAY: '2026-10-31',
} as const;

/** Departamentos liberados no porteiro e no /go. Os demais geram G6 marcado como não enviável. */
export const RELEASED_VERTICALS: readonly string[] = ['games'];

export type Trigger = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'OK1' | 'OK2' | 'T1' | 'T2' | 'RADAR' | 'CUPOM' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

/** Classes de mensagem (ata §1.1): A alerta imediato, B radar horário, C insight, D resumo, E cupom verificado. */
export type MessageClass = 'alerta' | 'radar' | 'insight' | 'resumo' | 'cupom' | 'plataforma';
export const MESSAGE_CLASSES: readonly MessageClass[] = ['alerta', 'radar', 'insight', 'resumo', 'cupom', 'plataforma'];

/** Classe padrão de cada gatilho (OK2 com queda entre 5% e 8% é rebaixado para radar na avaliação). */
export const TRIGGER_CLASS: Record<Trigger, MessageClass> = {
  G1: 'alerta',
  G2: 'alerta',
  G3: 'insight',
  G4: 'resumo',
  G5: 'insight',
  G6: 'insight',
  OK1: 'alerta',
  OK2: 'alerta',
  T1: 'radar',
  T2: 'radar',
  RADAR: 'radar',
  CUPOM: 'cupom',
  P1: 'plataforma',
  P2: 'plataforma',
  P3: 'plataforma',
  P4: 'plataforma',
  P5: 'plataforma',
};

/** Ponto da série diária do menor preço do produto (dias ANTERIORES a hoje, ordem crescente). */
export interface DayPoint {
  /** 'YYYY-MM-DD' (Brasília). */
  day: string;
  minCents: number;
}

// ---------------------------------------------------------------------------
// Fatos de entrada
// ---------------------------------------------------------------------------
export interface OfferFact {
  offerId: string;
  slug: string;
  title: string;
  networkSlug: string;
  networkName: string;
  sellerId: string | null;
  sellerReputation: string | null;
  sellerTotalSales: number | null;
  priceCents: number;
  /** last_price_confirmed_at: a API devolveu preço neste instante. */
  confirmedAt: Date | null;
  /** last_price_change_at (ou created_at): quando o preço atual apareceu. */
  priceSince: Date | null;
  affiliateLinkPending: boolean;
  quarantined: boolean;
  /** Amazon: ausências seguidas na busca da coleta assistida (consecutive_miss_count). > 0 = fora dos gatilhos. */
  missCount?: number;
  /** Amazon: primeira observação depois de uma ausência (group_offer_watch). null = nunca sumiu / sem registro. */
  returnedAt?: Date | null;
  /** Preço conferido AO VIVO na API oficial neste ciclo de envio: dispensa o intervalo de 15 min entre duas coletas. */
  liveVerifiedAt?: Date | null;
}

export interface ProductFacts {
  masterProductId: string;
  /** Nome do master (cadastro). */
  masterName: string;
  vertical: string;
  productType: string; // 'game' | 'console' | ...
  platformLabel: string | null; // nunca 'unknown'
  format: 'physical' | 'digital' | 'unknown';
  catalogGate: string | null; // 'review' | 'rejected' | 'approved' | null
  /** Ofertas ATIVAS e elegíveis (eligibleOfferSql) com preço recente. */
  offers: OfferFact[];
  /** Média do período por oferta-dia (computePeriodMetrics). null = sem série. */
  avg: { cents: number; distinctOffers: number; offerDays: number; spanDays: number; eligible: boolean } | null;
  /** Último evento 'live' de queda do menor preço dentro da janela de detecção. */
  minEvent: { at: Date; minCents: number; prevMinCents: number | null; offerId: string | null } | null;
  /** Primeiro evento de menor preço do produto e menor valor registrado. */
  record: { since: Date; minCents: number } | null;
  /** Foto anterior (G5 em 24/11 e 27/11). */
  baseline?: { day: string; lowestCents: number } | null;
  /** Série diária do menor preço de Mercado Livre/Shopee (dias anteriores a hoje, qualidade complete/partial). */
  series?: DayPoint[];
  /** Série diária só das ofertas Amazon (a Amazon só se compara com o histórico dela mesma). */
  amazonSeries?: DayPoint[];
}

// ---------------------------------------------------------------------------
// Título: região, edição, condição
// ---------------------------------------------------------------------------
export function foldTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const REGION_RE = /\b(japon\w*|japan\w*|jp|jpn|ntsc\w*|pal|eur|euro\w*|usa|eua|asia\w*|asiatic\w*|chin\w*|korea\w*|coreano|hk|import\w*|american\w*|regiao|region\w*)\b|\bversao internacional\b/;
const REGION_US_RE = /\bversao us\b|\boriginal us\b|\bimportado us\b/;
const CONDITION_RE = /\b(open ?box|usado|usada|seminovo|seminova|recondicionad\w*|vitrine|mostruario|sem lacre)\b/;

const EDITION_MARKERS: Array<[string, RegExp]> = [
  ['deluxe', /\bdeluxe\b/],
  ['gold', /\bgold\b/],
  ['ultimate', /\bultimate\b/],
  ['collector', /\bcollector\w*|\bcolecionador\b/],
  ['limitada', /\blimitada\b|\blimited\b/],
  ['especial', /\bedicao especial\b|\bspecial edition\b/],
  ['steelbook', /\bsteelbook\b/],
  ['goty', /\bgoty\b|\bgame of the year\b/],
  ['premium', /\bpremium\b/],
  ['definitive', /\bdefinitive\b|\bdefinitiva\b/],
  ['anniversary', /\banniversary\b|\baniversario\b/],
  ['remaster', /\bremaster\w*\b/],
  ['greatest-hits', /\bgreatest hits\b|\bplatinum\b|\bessentials\b|\bplayer s choice\b|\bnintendo selects\b/],
];

/** O texto cita região/importação (Europeu, Japonês, Importado, USA, Americano, Asiático, Versão Internacional, Região)? */
export function hasRegionMarker(raw: string): boolean {
  const f = foldTitle(raw);
  return REGION_RE.test(f) || REGION_US_RE.test(f) || /\bUS\b/.test(raw);
}

/** Região no nome do master ou no título da oferta (mensagem de preço não sai para outra região); ou edição que separa produto. null = ok. */
export function titleIdentityBlock(offerTitle: string, masterName: string): string | null {
  const t = foldTitle(offerTitle);
  const m = foldTitle(masterName);
  if (CONDITION_RE.test(t)) return 'condicao_nao_nova_no_titulo';
  // Onda 2: olha o NOME DO MASTER e o título da oferta. Antes só barrava se o master NÃO tinha a palavra, e
  // "Hokko Life Nintendo Switch Europeu" passou porque o master também dizia Europeu.
  if (hasRegionMarker(masterName)) return 'regiao_no_nome_do_master';
  if (hasRegionMarker(offerTitle)) return 'regiao_no_titulo';
  for (const [name, re] of EDITION_MARKERS) {
    if (re.test(t) && !re.test(m)) return `edicao_diferente_no_titulo:${name}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filtros por oferta
// ---------------------------------------------------------------------------
export type NetKind = 'ml' | 'shopee' | 'amazon' | 'other';
export function netKind(o: { networkSlug: string; networkName: string }): NetKind {
  const s = `${o.networkSlug} ${o.networkName}`.toLowerCase();
  if (s.includes('mercado')) return 'ml';
  if (s.includes('shopee')) return 'shopee';
  if (s.includes('amazon')) return 'amazon';
  return 'other';
}

export interface OfferVerdict {
  /** block = descartada; review = só com aprovação humana; ok. */
  kind: 'ok' | 'review' | 'block';
  reasons: string[];
}

export interface JudgeOptions {
  /** Amazon entra nas mensagens (decisão do dono, 2026-11-10). Sem isto a Amazon é bloqueada (comportamento legado G1-G6). */
  allowAmazon?: boolean;
  /** Frescor máximo da Amazon (60 min na detecção, 40 no envio). */
  amazonMaxAgeMin?: number;
  /** Classe Amazon pausada (coleta assistida sem lote há mais de 90 min). */
  amazonPaused?: boolean;
}

/** Amazon: oferta que sumiu da busca sai dos gatilhos; para voltar precisa de 2 observações separadas por >= 15 min. */
export function amazonReadmission(o: Pick<OfferFact, 'missCount' | 'returnedAt' | 'confirmedAt'>): { ok: boolean; reason?: string } {
  if ((o.missCount ?? 0) > 0) return { ok: false, reason: 'amazon_ausente_da_busca' };
  if (o.returnedAt && o.confirmedAt) {
    const gapMin = (o.confirmedAt.getTime() - o.returnedAt.getTime()) / 60_000;
    if (gapMin < RULES.AMAZON_OBS_GAP_MIN) return { ok: false, reason: 'amazon_aguardando_2a_observacao_apos_voltar' };
  }
  return { ok: true };
}

/** A classe Amazon fica pausada se a coleta assistida ficou mais de 90 min sem lote (collector_runs job 'amazon-assistida'). */
export function amazonLoopPaused(lastRunAt: Date | null, now: Date): boolean {
  if (!lastRunAt) return true;
  return (now.getTime() - lastRunAt.getTime()) / 60_000 > RULES.AMAZON_LOOP_STALE_MIN;
}

export function judgeOffer(o: OfferFact, p: Pick<ProductFacts, 'masterName'>, now: Date, maxAgeMin: number, opts: JudgeOptions = {}): OfferVerdict {
  const block = (r: string): OfferVerdict => ({ kind: 'block', reasons: [r] });
  const kind = netKind(o);
  if (kind === 'amazon' && !opts.allowAmazon) return block('amazon_desligada');
  if (kind === 'other') return block('rede_fora_do_escopo');
  if (kind === 'amazon' && opts.amazonPaused) return block('amazon_laco_parado_mais_de_90min');
  if (o.quarantined) return block('quarentena');
  if (o.affiliateLinkPending) return block('link_pendente');
  if (!(o.priceCents > 0)) return block('preco_invalido');
  if (!o.confirmedAt) return block('sem_confirmacao_de_preco');
  // Amazon tem limite próprio: 60 min na detecção, 40 min no envio (independe do limite das demais redes).
  const ageLimit = kind === 'amazon' ? (opts.amazonMaxAgeMin ?? RULES.AMAZON_DETECT_MAX_AGE_MIN) : maxAgeMin;
  const ageMin = (now.getTime() - o.confirmedAt.getTime()) / 60_000;
  if (ageMin > ageLimit) return block(`preco_velho_${Math.round(ageMin)}min`);
  if (ageMin < -5) return block('confirmacao_no_futuro');
  if (kind === 'amazon') {
    const re = amazonReadmission(o);
    if (!re.ok) return block(re.reason as string);
  }
  const idBlock = titleIdentityBlock(o.title, p.masterName);
  if (idBlock) return block(idBlock);
  // Preço visto em duas coletas separadas por >= 15 min (o preço apareceu e foi reconfirmado depois).
  const since = o.priceSince ?? o.confirmedAt;
  if (!o.liveVerifiedAt && o.confirmedAt.getTime() - since.getTime() < RULES.CONFIRM_GAP_MIN * 60_000) return block('preco_nao_reconfirmado_em_15min');
  const reasons: string[] = [];
  if (kind === 'shopee') reasons.push('shopee_so_com_aprovacao_humana');
  if (kind === 'ml') {
    const rep = o.sellerReputation;
    if (!rep) reasons.push('vendedor_sem_reputacao');
    else if (!(RULES.ML_OK_REPUTATIONS as readonly string[]).includes(rep)) return block(`vendedor_reputacao_${rep}`);
    else if ((o.sellerTotalSales ?? 0) < RULES.ML_MIN_SALES) reasons.push('vendedor_poucas_vendas');
  }
  return reasons.length ? { kind: 'review', reasons } : { kind: 'ok', reasons: [] };
}

/** Lojas distintas (rede + vendedor; oferta sem vendedor conta como uma loja própria). */
export function countStores(offers: OfferFact[]): number {
  return new Set(offers.map((o) => `${netKind(o)}:${o.sellerId ?? o.offerId}`)).size;
}

export function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// ---------------------------------------------------------------------------
// Candidato
// ---------------------------------------------------------------------------
export interface Candidate {
  /** Chave do link (`m`). */
  messageKey: string;
  trigger: Trigger;
  model: GroupMessageInput['model'];
  masterProductId: string;
  /** Ofertas citadas (a primeira é a principal). */
  offerIds: string[];
  vertical: string;
  networkSlug: string;
  name: string;
  priceCents: number;
  avgCents: number | null;
  belowAvgPct: number | null;
  dropPct: number | null;
  /** Motivo legível de ter sido proposto. */
  reason: string;
  /** auto = pode sair sozinho (Telegram em send); review = só com aprovação humana. */
  status: 'auto' | 'review';
  reviewReasons: string[];
  /** Classe de mensagem (A a E). */
  cls: MessageClass;
  /** RETIDO: nunca sai sozinho e nem vai para aprovação normal; só aparece no admin (desconto > 40%, queda > 45%, preço < 0,5x a mediana). */
  held: boolean;
  heldReasons: string[];
  /** Quanto o movimento vale, para ordenar o radar (maior = mais forte). */
  moveScore: number;
  /** Radar: os itens da mensagem (um por produto). */
  items?: RadarItemMeta[];
  /** Detalhe do movimento (OK1, OK2, T1, T2). */
  move?: MoveDetail;
  offerSlug: string;
  networkName: string;
  /** Plataforma do jogo (rodízio de categoria na fila). */
  platformLabel?: string | null;
  sendable: boolean;
  notSendableReason: string | null;
  confirmedAt: string;
  dedupKey: string;
  texts: { telegram: string; whatsapp: string };
  textProblems: string[];
}

export interface RadarItemMeta {
  masterProductId: string;
  offerId: string;
  priceCents: number;
  kind: MoveKind;
}

export interface Blocked {
  masterProductId: string;
  name: string;
  trigger: Trigger;
  reasons: string[];
}

export interface EvalContext {
  now: Date;
  maxAgeMin: number;
  adTag: string;
  /** Frescor máximo da Amazon nesta avaliação (60 na detecção, 40 no envio). */
  amazonMaxAgeMin?: number;
  /** Classe Amazon pausada (laço da coleta assistida parado). */
  amazonPaused?: boolean;
}

/** Janela de 6 h (fuso de São Paulo) para o dedup por oferta/gatilho. */
export function windowKey(now: Date): string {
  const ms = now.getTime() - 3 * 3600_000; // Brasil sem horário de verão: UTC-3 fixo
  const d = new Date(ms);
  const day = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `${day}-${Math.floor(d.getUTCHours() / 6)}`;
}

/** Título limpo e "Switch · mídia física" separados, para o layout novo (título em negrito, plataforma em itálico). */
export function displayParts(p: ProductFacts): { title: string; meta: string | null } {
  if (p.productType !== 'game') return { title: p.masterName.replace(/\s+/g, ' ').trim(), meta: null };
  const fmt = p.format === 'physical' ? 'mídia física' : p.format === 'digital' ? 'mídia digital' : '';
  const meta = [p.platformLabel ?? '', fmt].filter(Boolean).join(' · ');
  return { title: cleanProductName(p.masterName), meta: meta || null };
}

export function nameOf(p: ProductFacts): string {
  return productDisplayName(p.masterName, { platformLabel: p.platformLabel, format: p.format, isGame: p.productType === 'game' });
}

const SHOPEE_REVIEW_REASON = 'shopee_so_com_aprovacao_humana';

/**
 * Onda 2: a Shopee deixa de exigir aprovação SÓ por ser Shopee quando a queda é <= 20%. Ela só sai sozinha se a
 * reconferência ao vivo (obrigatória para Shopee no envio automático) passar; sem ela a linha expira.
 */
function relaxShopee(reasons: string[], primary: OfferFact, dropPct: number | null): string[] {
  if (netKind(primary) !== 'shopee') return reasons;
  if (dropPct != null && dropPct > RULES.SHOPEE_AUTO_MAX_DROP_PCT) return reasons;
  return reasons.filter((r) => r !== SHOPEE_REVIEW_REASON);
}

export function finish(
  p: ProductFacts,
  trigger: Trigger,
  input: GroupMessageInput,
  base: {
    offerIds: string[];
    primary: OfferFact;
    reason: string;
    avgCents: number | null;
    belowPct: number | null;
    dropPct: number | null;
    reviewReasons: string[];
    notSendable?: string | null;
    dedupSuffix?: string;
    cls?: MessageClass;
    held?: string[];
    moveScore?: number;
    move?: MoveDetail;
  },
  ctx: EvalContext
): Candidate {
  let rendered: RenderedGroupMessage;
  let problems: string[] = [];
  try {
    rendered = buildGroupMessages(input);
    problems = rendered.problems;
  } catch (e) {
    rendered = { telegram: '', whatsapp: '', problems: [] };
    problems = [e instanceof Error ? e.message : 'erro ao montar texto'];
  }
  const notSendable =
    base.notSendable ?? (problems.length ? `texto reprovado: ${problems.join('; ')}` : null) ?? null;
  const reviewReasons = relaxShopee(base.reviewReasons, base.primary, base.dropPct);
  return {
    messageKey: input.messageKey,
    trigger,
    model: input.model,
    masterProductId: p.masterProductId,
    offerIds: base.offerIds,
    vertical: p.vertical,
    networkSlug: base.primary.networkSlug,
    name: nameOf(p),
    priceCents: base.primary.priceCents,
    avgCents: base.avgCents,
    belowAvgPct: base.belowPct,
    dropPct: base.dropPct,
    reason: base.reason,
    status: reviewReasons.length ? 'review' : 'auto',
    reviewReasons,
    platformLabel: p.platformLabel,
    cls: base.cls ?? TRIGGER_CLASS[trigger],
    move: base.move,
    offerSlug: base.primary.slug,
    networkName: base.primary.networkName,
    held: !!base.held?.length,
    heldReasons: base.held ?? [],
    moveScore: base.moveScore ?? base.belowPct ?? 0,
    sendable: !notSendable,
    notSendableReason: notSendable,
    confirmedAt: (base.primary.confirmedAt ?? ctx.now).toISOString(),
    dedupKey: `${p.masterProductId}:${trigger}:${base.dedupSuffix ?? windowKey(ctx.now)}`,
    texts: { telegram: rendered.telegram, whatsapp: rendered.whatsapp },
    textProblems: problems,
  };
}

export function toMsgOffer(o: OfferFact) {
  return { slug: o.slug, networkSlug: o.networkSlug, networkName: o.networkName, priceCents: o.priceCents, confirmedAt: o.confirmedAt as Date };
}

function humanReview(price: number, avg: number | null, dropPct: number | null, median: number | null): string[] {
  const out: string[] = [];
  if (avg && pctBelow(price, avg) > RULES.REVIEW_ABOVE_BELOW_AVG_PCT) out.push(`desconto_acima_de_${RULES.REVIEW_ABOVE_BELOW_AVG_PCT}pct_da_media`);
  if (dropPct != null && dropPct > RULES.REVIEW_ABOVE_DROP_PCT) out.push(`queda_acima_de_${RULES.REVIEW_ABOVE_DROP_PCT}pct`);
  if (median && price < median * RULES.REVIEW_BELOW_MEDIAN_RATIO) out.push('preco_abaixo_de_035x_a_mediana_das_ofertas');
  return out;
}

/**
 * Avalia UM produto para G1, G2, G3, G5 (G4 compõe depois; G6 é G1/G2/G5 num departamento não liberado).
 * Devolve candidatos e bloqueios (com motivo) para auditoria.
 */
export function evaluateProduct(p: ProductFacts, ctx: EvalContext): { candidates: Candidate[]; blocked: Blocked[] } {
  const candidates: Candidate[] = [];
  const blocked: Blocked[] = [];
  const nm = nameOf(p);
  const stop = (trigger: Trigger, reasons: string[]) => blocked.push({ masterProductId: p.masterProductId, name: nm, trigger, reasons });
  const released = RELEASED_VERTICALS.includes(p.vertical);
  const isConsole = p.productType === 'console';

  if (p.vertical === 'games' && p.productType !== 'game' && !isConsole) {
    stop('G2', ['tipo_de_produto_fora_do_escopo']);
    return { candidates, blocked };
  }
  if (p.catalogGate === 'review' || p.catalogGate === 'rejected') {
    stop('G2', [`porteiro_${p.catalogGate}`]);
    return { candidates, blocked };
  }
  if (p.vertical === 'games' && !p.platformLabel) {
    stop('G2', ['plataforma_desconhecida']);
    return { candidates, blocked };
  }

  const verdicts = p.offers.map((o) => ({ o, v: judgeOffer(o, p, ctx.now, ctx.maxAgeMin) }));
  const usable = verdicts.filter((x) => x.v.kind !== 'block').sort((a, b) => a.o.priceCents - b.o.priceCents);
  const stores = countStores(p.offers.filter((o) => judgeOffer(o, p, ctx.now, ctx.maxAgeMin).kind !== 'block'));
  const median = medianOf(p.offers.filter((o) => netKind(o) !== 'amazon').map((o) => o.priceCents));
  const model = (trigger: Trigger): GroupMessageInput['model'] =>
    trigger === 'G1' ? 'menor-preco' : trigger === 'G2' ? 'abaixo-media' : trigger === 'G3' ? 'comparativo' : trigger === 'G5' ? 'foto-preco' : 'departamento';
  void model;
  const avg = p.avg && p.avg.eligible && p.avg.cents > 0 ? p.avg : null;
  const cheapestAll = [...p.offers].sort((a, b) => a.priceCents - b.priceCents)[0];

  const base = { vertical: p.vertical, adTag: ctx.adTag };
  const keyOf = (t: Trigger, extra = '') => makeMessageKey(t, `${p.masterProductId}:${t}:${extra}:${windowKey(ctx.now)}`, ctx.now);
  const departmentGate = released ? null : 'departamento_em_review_nao_liberado_no_go';
  const asG6 = !released;

  // ---------------- G1: menor preço registrado ----------------
  if (p.minEvent && p.minEvent.prevMinCents && p.minEvent.minCents < p.minEvent.prevMinCents) {
    const drop = ((p.minEvent.prevMinCents - p.minEvent.minCents) / p.minEvent.prevMinCents) * 100;
    const holder = usable[0];
    if (!cheapestAll) stop('G1', ['sem_oferta_vigente']);
    else if (drop < RULES.G1_MIN_DROP_PCT) stop('G1', [`queda_${drop.toFixed(1)}pct_abaixo_de_${RULES.G1_MIN_DROP_PCT}pct`]);
    else if (!holder || holder.o.offerId !== cheapestAll.offerId) {
      const why = verdicts.find((x) => x.o.offerId === cheapestAll.offerId)?.v.reasons ?? ['oferta_mais_barata_bloqueada'];
      stop('G1', ['a_oferta_mais_barata_nao_passa_nos_filtros', ...why]);
    } else if (holder.o.priceCents > p.minEvent.minCents * 1.02) stop('G1', ['preco_atual_acima_do_evento']);
    else if (!avg) stop('G1', ['sem_media_elegivel']);
    else if (stores < RULES.MIN_STORES) stop('G1', [`lojas_${stores}_abaixo_de_${RULES.MIN_STORES}`]);
    else if (!p.record) stop('G1', ['sem_primeiro_evento_para_dizer_desde_quando']);
    else if (pctBelow(holder.o.priceCents, avg.cents) < RULES.MIN_BELOW_AVG_PCT) stop('G1', ['abaixo_da_media_insuficiente']);
    else {
      const o = holder.o;
      const trigger: Trigger = asG6 ? 'G6' : 'G1';
      const review = [...holder.v.reasons, ...humanReview(o.priceCents, avg.cents, drop, median)];
      const messageKey = keyOf(trigger, o.offerId);
      const input: GroupMessageInput = asG6
        ? { ...base, messageKey, model: 'departamento', name: nm, departmentLabel: departmentLabel(p.vertical), offer: toMsgOffer(o), avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers } }
        : { ...base, messageKey, model: 'menor-preco', name: nm, offer: toMsgOffer(o), prevMinCents: p.minEvent.prevMinCents, trackingSince: p.record.since, avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers } };
      candidates.push(
        finish(p, trigger, input, {
          offerIds: [o.offerId],
          primary: o,
          reason: `Novo menor preço registrado: ${fmtBRL(o.priceCents)} (queda de ${drop.toFixed(1).replace('.', ',')}% sobre ${fmtBRL(p.minEvent.prevMinCents)}), ${pctBelow(o.priceCents, avg.cents)}% abaixo da média.`,
          avgCents: Math.round(avg.cents),
          belowPct: pctBelow(o.priceCents, avg.cents),
          dropPct: Math.round(drop * 10) / 10,
          reviewReasons: review,
          notSendable: departmentGate,
        }, ctx)
      );
    }
  }

  // ---------------- G2: bem abaixo da média ----------------
  const g1Done = candidates.some((c) => c.trigger === 'G1' || (c.trigger === 'G6' && c.model === 'departamento'));
  if (!g1Done) {
    const best = usable[0];
    if (!best) stop('G2', ['nenhuma_oferta_passa_nos_filtros']);
    else if (!avg) stop('G2', ['sem_media_elegivel(>=3_ofertas,>=5_oferta_dias,>=14_dias)']);
    else if (stores < RULES.MIN_STORES) stop('G2', [`lojas_${stores}_abaixo_de_${RULES.MIN_STORES}`]);
    else {
      const pct = pctBelow(best.o.priceCents, avg.cents);
      const raw = ((avg.cents - best.o.priceCents) / avg.cents) * 100;
      if (raw < RULES.MIN_BELOW_AVG_PCT) stop('G2', [`abaixo_da_media_${raw.toFixed(1)}pct_menor_que_${RULES.MIN_BELOW_AVG_PCT}pct`]);
      else {
        const o = best.o;
        const trigger: Trigger = asG6 ? 'G6' : 'G2';
        const review = [...best.v.reasons, ...humanReview(o.priceCents, avg.cents, null, median)];
        const messageKey = keyOf(trigger, o.offerId);
        const input: GroupMessageInput = asG6
          ? { ...base, messageKey, model: 'departamento', name: nm, departmentLabel: departmentLabel(p.vertical), offer: toMsgOffer(o), avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers } }
          : { ...base, messageKey, model: 'abaixo-media', name: nm, offer: toMsgOffer(o), avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers } };
        candidates.push(
          finish(p, trigger, input, {
            offerIds: [o.offerId],
            primary: o,
            reason: `${pct}% abaixo da média de ${fmtBRL(avg.cents)} (${avg.distinctOffers} ofertas, ${avg.offerDays} oferta-dias, ${avg.spanDays} dias).`,
            avgCents: Math.round(avg.cents),
            belowPct: pct,
            dropPct: null,
            reviewReasons: review,
            notSendable: departmentGate,
          }, ctx)
        );
      }
    }
  }

  // ---------------- G3: mesma mídia mais barata em outra loja ----------------
  if (!asG6) {
    const bestByNet = new Map<NetKind, { o: OfferFact; v: OfferVerdict }>();
    for (const x of usable) if (!bestByNet.has(netKind(x.o))) bestByNet.set(netKind(x.o), x);
    const nets = [...bestByNet.values()].sort((a, b) => a.o.priceCents - b.o.priceCents);
    if (nets.length >= 2) {
      const [cheap, other] = nets;
      const diffPct = ((other.o.priceCents - cheap.o.priceCents) / other.o.priceCents) * 100;
      if (diffPct >= RULES.G3_MIN_DIFF_PCT) {
        if (other.v.kind !== 'ok') stop('G3', ['a_rede_mais_cara_exige_aprovacao', ...other.v.reasons]);
        else {
          const sameNet = p.offers.filter((o) => netKind(o) === netKind(other.o) && judgeOffer(o, p, ctx.now, ctx.maxAgeMin).kind !== 'block');
          const maxC = Math.max(...sameNet.map((o) => o.priceCents));
          const messageKey = keyOf('G3', `${cheap.o.offerId}:${other.o.offerId}`);
          const input: GroupMessageInput = {
            ...base,
            messageKey,
            model: 'comparativo',
            name: nm,
            cheap: toMsgOffer(cheap.o),
            other: { ...toMsgOffer(other.o), offersCount: sameNet.length, maxCents: maxC },
            avg: avg ? { cents: Math.round(avg.cents), offers: avg.distinctOffers } : null,
          };
          candidates.push(
            finish(p, 'G3', input, {
              offerIds: [cheap.o.offerId, other.o.offerId],
              primary: cheap.o,
              reason: `Mesma mídia ${diffPct.toFixed(0)}% mais barata ${cheap.o.networkName} (${fmtBRL(cheap.o.priceCents)}) do que ${other.o.networkName} (${fmtBRL(other.o.priceCents)}).`,
              avgCents: avg ? Math.round(avg.cents) : null,
              belowPct: avg ? pctBelow(cheap.o.priceCents, avg.cents) : null,
              dropPct: null,
              reviewReasons: [...cheap.v.reasons, ...humanReview(cheap.o.priceCents, avg?.cents ?? null, null, median)],
            }, ctx)
          );
        }
      }
    }
  }

  // ---------------- G5: foto de preço ----------------
  if (!asG6 && (p.productType === 'game' || isConsole)) {
    const priced = p.offers.filter((o) => netKind(o) !== 'amazon' && judgeOffer(o, p, ctx.now, ctx.maxAgeMin).kind !== 'block');
    if (p.offers.filter((o) => netKind(o) !== 'amazon').length >= RULES.G5_MIN_OFFERS && priced.length >= 3 && usable[0]) {
      const sorted = priced.map((o) => o.priceCents).sort((a, b) => a - b);
      const lead = usable[0];
      const med = medianOf(p.offers.filter((o) => netKind(o) !== 'amazon').map((o) => o.priceCents)) as number;
      const messageKey = keyOf('G5', 'foto');
      const input: GroupMessageInput = {
        ...base,
        messageKey,
        model: 'foto-preco',
        name: nm,
        offer: toMsgOffer(lead.o),
        top: sorted.slice(0, 3),
        medianCents: med,
        offersCount: p.offers.filter((o) => netKind(o) !== 'amazon').length,
        record: p.record ? { cents: p.record.minCents, since: p.record.since } : null,
        baseline: p.baseline ?? null,
      };
      candidates.push(
        finish(p, 'G5', input, {
          offerIds: [lead.o.offerId],
          primary: lead.o,
          reason: `Foto de preço: ${p.offers.length} ofertas ativas, menor ${fmtBRL(lead.o.priceCents)}, mediana ${fmtBRL(med)}. Não afirma desconto.`,
          avgCents: null,
          belowPct: null,
          dropPct: null,
          reviewReasons: lead.v.reasons,
          dedupSuffix: windowKey(ctx.now).slice(0, 8),
        }, ctx)
      );
    }
  }
  return { candidates, blocked };
}

// ---------------------------------------------------------------------------
// G4: resumo do dia (compõe sobre G1/G2 auto)
// ---------------------------------------------------------------------------
export function buildDailySummary(
  cands: Candidate[],
  facts: Map<string, ProductFacts>,
  ctx: EvalContext
): Candidate | null {
  const pool = cands
    .filter((c) => (c.trigger === 'G1' || c.trigger === 'G2') && c.status === 'auto' && c.sendable && c.belowAvgPct != null)
    .sort((a, b) => (b.belowAvgPct ?? 0) - (a.belowAvgPct ?? 0));
  const items = pool.slice(0, RULES.G4_MAX_ITEMS);
  if (items.length < RULES.G4_MIN_ITEMS) return null;
  const messageKey = makeMessageKey('G4', `resumo:${items.map((i) => i.masterProductId).join(',')}:${windowKey(ctx.now).slice(0, 8)}`, ctx.now);
  const first = facts.get(items[0].masterProductId) as ProductFacts;
  const mk = (c: Candidate) => {
    const p = facts.get(c.masterProductId) as ProductFacts;
    const o = p.offers.find((x) => x.offerId === c.offerIds[0]) as OfferFact;
    return {
      name: productDisplayName(p.masterName, { isGame: p.productType === 'game' }),
      platformLabel: p.platformLabel,
      offer: toMsgOffer(o),
      avg: { cents: c.avgCents as number, offers: p.avg?.distinctOffers ?? 0 },
    };
  };
  const input: GroupMessageInput = { vertical: first.vertical, adTag: ctx.adTag, messageKey, model: 'resumo-dia', items: items.map(mk) };
  const primary = (first.offers.find((x) => x.offerId === items[0].offerIds[0]) as OfferFact);
  return finish(first, 'G4', input, {
    offerIds: items.map((i) => i.offerIds[0]),
    primary,
    reason: `Resumo do dia com ${items.length} itens que passaram em G1/G2.`,
    avgCents: null,
    belowPct: null,
    dropPct: null,
    reviewReasons: [],
    dedupSuffix: windowKey(ctx.now).slice(0, 8),
  }, ctx);
}


// ---------------------------------------------------------------------------
// Gatilhos por MOVIMENTO (ata 2026-11-10 §2): medidos na série diária do menor preço do próprio produto.
// Descritivos: nunca previsão. Não exigem média; a média entra só como contexto (e como faixa de risco).
// ---------------------------------------------------------------------------
function prevDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface MovementHit extends MoveDetail {
  /** Os outros gatilhos que a série também cumpre. */
  also: MoveKind[];
}

/**
 * Detecta os gatilhos para o preço ATUAL `currentCents` contra a série dos dias anteriores a `today` ('YYYY-MM-DD').
 * Precedência: OK1 > OK2 > T1 > T2. Devolve [] quando nada vale ou a série é curta demais para afirmar.
 *  - OK1: preço atual <= 95% do menor valor anterior (novo mínimo >= 5%); exige 7 dias de série (contando hoje);
 *  - OK2: preço atual <= 95% do menor de ontem (o dia anterior precisa existir); exige 7 dias;
 *  - T1: hoje < ontem < anteontem (dias consecutivos) e queda acumulada >= 3%; exige 4 dias;
 *  - T2: acima do menor registrado e até 4% acima dele (não bateu o piso); exige 7 dias.
 */
export function detectMovement(history: DayPoint[], currentCents: number, today: string): MovementHit[] {
  const pts = history.filter((h) => h.day < today && h.minCents > 0).sort((a, b) => a.day.localeCompare(b.day));
  if (!(currentCents > 0) || !pts.length) return [];
  const n = pts.length + 1;
  const since = pts[0].day;
  const byDay = new Map(pts.map((h) => [h.day, h.minCents]));
  const ref = Math.min(...pts.map((h) => h.minCents));
  const d1 = prevDay(today);
  const d2 = prevDay(d1);
  const y = byDay.get(d1);
  const y2 = byDay.get(d2);
  const hits: MovementHit[] = [];
  const mk = (kind: MoveKind, extra: Partial<MoveDetail>): MovementHit => ({
    kind,
    sinceDay: since,
    seriesDays: n,
    refCents: ref,
    prevCents: y ?? null,
    dropPct: 0,
    also: [],
    ...extra,
  });
  if (n >= RULES.MOVE_MIN_DAYS && currentCents * 100 <= ref * (100 - RULES.OK1_MIN_DROP_PCT)) {
    hits.push(mk('OK1', { prevCents: ref, dropPct: ((ref - currentCents) / ref) * 100 }));
  }
  if (n >= RULES.MOVE_MIN_DAYS && y != null && currentCents * 100 <= y * (100 - RULES.OK2_MIN_DROP_PCT)) {
    hits.push(mk('OK2', { prevCents: y, dropPct: ((y - currentCents) / y) * 100 }));
  }
  if (n >= RULES.MOVE_MIN_DAYS_T1 && y != null && y2 != null && currentCents < y && y < y2 && currentCents * 100 <= y2 * (100 - RULES.T1_MIN_CUM_DROP_PCT)) {
    hits.push(mk('T1', { prevCents: y, dropPct: ((y2 - currentCents) / y2) * 100, path: [y2, y, currentCents] }));
  }
  if (n >= RULES.MOVE_MIN_DAYS && currentCents > ref && currentCents * 100 <= ref * (100 + RULES.T2_NEAR_PCT)) {
    hits.push(mk('T2', { prevCents: null, dropPct: 0, nearPct: ((currentCents - ref) / ref) * 100 }));
  }
  if (!hits.length) return [];
  const kinds = hits.map((h) => h.kind);
  return hits.map((h) => ({ ...h, also: kinds.filter((k) => k !== h.kind) }));
}

/** Faixas de risco (§2.1). held = retido (nunca sai sozinho); review = aprovação humana; ambos vazios = verde. */
export function riskAssess(
  priceCents: number,
  avgCents: number | null,
  dropPct: number | null,
  medianCents: number | null
): { review: string[]; held: string[] } {
  const held: string[] = [];
  const review: string[] = [];
  const below = avgCents && avgCents > 0 ? ((avgCents - priceCents) / avgCents) * 100 : null;
  if (below != null && below > RULES.REVIEW_ABOVE_BELOW_AVG_PCT) held.push(`desconto_acima_de_${RULES.REVIEW_ABOVE_BELOW_AVG_PCT}pct_da_media`);
  if (dropPct != null && dropPct > RULES.REVIEW_ABOVE_DROP_PCT) held.push(`queda_acima_de_${RULES.REVIEW_ABOVE_DROP_PCT}pct`);
  if (medianCents && priceCents < medianCents * RULES.REVIEW_BELOW_MEDIAN_RATIO) held.push('preco_abaixo_de_035x_a_mediana_das_ofertas');
  if (medianCents && priceCents > medianCents * RULES.REVIEW_ABOVE_MEDIAN_RATIO) held.push('preco_acima_de_3x_a_mediana_das_ofertas');
  if (!held.length) {
    if (below != null && below > RULES.GREEN_MAX_BELOW_AVG_PCT) review.push(`desconto_acima_de_${RULES.GREEN_MAX_BELOW_AVG_PCT}pct_da_media`);
    if (dropPct != null && dropPct > RULES.GREEN_MAX_DROP_PCT) review.push(`queda_acima_de_${RULES.GREEN_MAX_DROP_PCT}pct`);
  }
  return { review, held };
}

function scopeBlock(p: ProductFacts): string | null {
  if (p.vertical === 'games' && p.productType !== 'game' && p.productType !== 'console') return 'tipo_de_produto_fora_do_escopo';
  if (p.catalogGate === 'review' || p.catalogGate === 'rejected') return `porteiro_${p.catalogGate}`;
  if (p.vertical === 'games' && !p.platformLabel) return 'plataforma_desconhecida';
  return null;
}

const SCOPE_BLOCK_RE = /^(tipo_de_produto_fora_do_escopo|porteiro_|plataforma_desconhecida)/;

/** Candidatos legados (G3, G5, G6) viram retidos quando o motivo de revisão for de faixa vermelha. */
function legacyRisk(c: Candidate): Candidate {
  const held = c.reviewReasons.filter((r) => /^(desconto_acima_de_45|queda_acima_de_45|preco_abaixo_de_035x|preco_acima_de_3x)/.test(r));
  if (!held.length) return c;
  return { ...c, held: true, heldReasons: held, reviewReasons: c.reviewReasons.filter((r) => !held.includes(r)) };
}

function moveReason(m: MoveDetail, price: number): string {
  const pct = (x: number) => x.toFixed(1).replace('.', ',');
  switch (m.kind) {
    case 'OK1':
      return `Novo menor preço da série (${m.seriesDays} dias desde ${m.sinceDay}): ${fmtBRL(price)}, ${pct(m.dropPct)}% abaixo do menor anterior de ${fmtBRL(m.refCents)}.`;
    case 'OK2':
      return `Queda de ${pct(m.dropPct)}% de ontem para hoje: ${fmtBRL(m.prevCents as number)} para ${fmtBRL(price)} (${m.seriesDays} dias de série).`;
    case 'T1':
      return `Caiu dois dias seguidos (${(m.path ?? []).map(fmtBRL).join(', ')}), ${pct(m.dropPct)}% acumulados.`;
    case 'T2':
      return `A ${pct(m.nearPct ?? 0)}% acima do menor valor registrado (${fmtBRL(m.refCents)}), sem bater o piso.`;
  }
}

/**
 * Avalia UM produto na política v2: gatilhos por movimento (OK1, OK2, T1, T2) para ML/Shopee e, em separado, para a
 * Amazon (só contra o histórico dela mesma), mais G3/G5/G6 do avaliador legado. G1/G2 (que exigiam média elegível) saem.
 * Classe: OK1 e OK2 >= 8% = alerta; OK2 entre 5% e 8%, T1 e T2 = radar. Amazon só em alerta.
 */
export function evaluateProductV2(p: ProductFacts, ctx: EvalContext): { candidates: Candidate[]; blocked: Blocked[] } {
  const legacy = evaluateProduct(p, ctx);
  const candidates = legacy.candidates.filter((c) => c.trigger !== 'G1' && c.trigger !== 'G2').map(legacyRisk);
  const blocked = legacy.blocked.filter((b) => b.trigger !== 'G1' && (b.trigger !== 'G2' || SCOPE_BLOCK_RE.test(b.reasons[0] ?? '')));
  if (scopeBlock(p)) return { candidates, blocked };

  const nm = nameOf(p);
  const today = spDayStr(ctx.now);
  const jopts: JudgeOptions = { allowAmazon: true, amazonMaxAgeMin: ctx.amazonMaxAgeMin, amazonPaused: ctx.amazonPaused };
  const verdicts = p.offers.map((o) => ({ o, v: judgeOffer(o, p, ctx.now, ctx.maxAgeMin, jopts) }));
  const stores = countStores(verdicts.filter((x) => x.v.kind !== 'block').map((x) => x.o));
  const median = medianOf(p.offers.filter((o) => netKind(o) !== 'amazon').map((o) => o.priceCents));
  // Média do V2: a mesma do selo, mas com o critério do dono (>= 3 ofertas e >= 3 dias de série medida), não os 14 dias do selo.
  const avg = p.avg && p.avg.cents > 0 && p.avg.distinctOffers >= RULES.MED_MIN_OFFERS && p.avg.spanDays >= RULES.MED_MIN_SERIES_DAYS ? p.avg : null;
  const released = RELEASED_VERTICALS.includes(p.vertical);

  for (const isAmz of [false, true]) {
    const series = isAmz ? p.amazonSeries : p.series;
    const pool = verdicts.filter((x) => (netKind(x.o) === 'amazon') === isAmz).sort((a, b) => a.o.priceCents - b.o.priceCents);
    if (!pool.length) continue;
    const cheapest = pool[0];
    const hits = series?.length ? detectMovement(series, cheapest.o.priceCents, today) : [];
    // Dono (2026-11-11): "preços na média ou abaixo da média" é gatilho; novo mínimo (OK1) e queda do dia (OK2) têm prioridade.
    // A Amazon não entra em "na média" (só se compara com o próprio histórico e segue só em alerta).
    const strong = hits[0] && (hits[0].kind === 'OK1' || hits[0].kind === 'OK2');
    const medOk = !isAmz && !strong && !!avg && cheapest.o.priceCents <= avg.cents;
    if (!hits.length && !medOk) continue;
    const stop = (reasons: string[]) => blocked.push({ masterProductId: p.masterProductId, name: nm, trigger: medOk ? 'G2' : hits[0].kind, reasons: [isAmz ? 'amazon' : 'mercado', ...reasons] });
    const holder = pool.find((x) => x.v.kind !== 'block');
    if (!holder || holder.o.offerId !== cheapest.o.offerId) {
      stop(['a_oferta_mais_barata_nao_passa_nos_filtros', ...cheapest.v.reasons]);
      continue;
    }
    if (stores < RULES.MIN_STORES) {
      stop([`lojas_${stores}_abaixo_de_${RULES.MIN_STORES}`]);
      continue;
    }
    if (!released) {
      stop(['departamento_em_review_nao_liberado_no_go']);
      continue;
    }
    const o = holder.o;
    const parts = displayParts(p);

    if (medOk && avg) {
      // ---- G2 (novo): preço atual <= média única oferta-dia (mesma do selo) ----
      const risk = riskAssess(o.priceCents, avg.cents, null, median);
      const rawBelow = ((avg.cents - o.priceCents) / avg.cents) * 100;
      const refCents = series?.length ? Math.min(...series.map((x) => x.minCents)) : null;
      const messageKey = makeMessageKey('G2', `${p.masterProductId}:G2med:${o.offerId}:${windowKey(ctx.now)}`, ctx.now);
      const input: GroupMessageInput = {
        vertical: p.vertical,
        adTag: ctx.adTag,
        messageKey,
        model: 'media',
        name: nm,
        title: parts.title,
        meta: parts.meta,
        offer: toMsgOffer(o),
        avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers },
        seriesDays: avg.spanDays,
        refCents,
        sinceDay: series?.[0]?.day ?? daysBefore(today, Math.max(0, avg.spanDays - 1)),
      };
      candidates.push(
        finish(p, 'G2', input, {
          offerIds: [o.offerId],
          primary: o,
          reason: `${rawBelow > 0.05 ? `${rawBelow.toFixed(1).replace('.', ',')}% abaixo da` : 'No nível da'} média de ${fmtBRL(avg.cents)} (${avg.distinctOffers} ofertas, ${avg.spanDays} dias de série): ${fmtBRL(o.priceCents)}.`,
          avgCents: Math.round(avg.cents),
          belowPct: rawBelow > 0 ? pctBelow(o.priceCents, avg.cents) : 0,
          dropPct: null,
          reviewReasons: [...holder.v.reasons, ...risk.review],
          held: risk.held,
          cls: 'insight',
          moveScore: Math.max(0, rawBelow),
          dedupSuffix: windowKey(ctx.now) + 'med',
        }, ctx)
      );
      continue;
    }

    const hit = hits[0];
    const cls: MessageClass = hit.kind === 'OK1' ? 'alerta' : hit.kind === 'OK2' ? (hit.dropPct >= RULES.OK2_ALERT_DROP_PCT ? 'alerta' : 'radar') : 'radar';
    if (isAmz && cls !== 'alerta') {
      stop(['amazon_so_em_alerta']);
      continue;
    }
    const risk = riskAssess(o.priceCents, isAmz ? null : (avg?.cents ?? null), hit.kind === 'T2' ? null : hit.dropPct, median);
    const move: MoveDetail = {
      kind: hit.kind,
      sinceDay: hit.sinceDay,
      seriesDays: hit.seriesDays,
      refCents: hit.refCents,
      prevCents: hit.prevCents,
      dropPct: Math.round(hit.dropPct * 10) / 10,
      path: hit.path,
      nearPct: hit.nearPct == null ? undefined : Math.round(hit.nearPct * 10) / 10,
    };
    const messageKey = makeMessageKey(hit.kind, `${p.masterProductId}:${hit.kind}:${o.offerId}:${windowKey(ctx.now)}`, ctx.now);
    const avgIn = !isAmz && avg ? { cents: Math.round(avg.cents), offers: avg.distinctOffers } : null;
    const input: GroupMessageInput = {
      vertical: p.vertical,
      adTag: ctx.adTag,
      messageKey,
      model: 'movimento',
      name: nm,
      title: parts.title,
      meta: parts.meta,
      offer: toMsgOffer(o),
      move,
      avg: avgIn,
    };
    const score = hit.kind === 'T2' ? Math.max(0, RULES.T2_NEAR_PCT - (hit.nearPct ?? RULES.T2_NEAR_PCT)) : hit.dropPct;
    candidates.push(
      finish(p, hit.kind, input, {
        offerIds: [o.offerId],
        primary: o,
        reason: `${moveReason(move, o.priceCents)}${hit.also.length ? ` Também cumpre: ${hit.also.join(', ')}.` : ''}`,
        avgCents: avgIn?.cents ?? null,
        belowPct: avgIn && avgIn.cents > o.priceCents ? pctBelow(o.priceCents, avgIn.cents) : null,
        dropPct: hit.kind === 'T2' ? null : move.dropPct,
        reviewReasons: [...holder.v.reasons, ...risk.review],
        held: risk.held,
        cls,
        moveScore: score,
        move,
        dedupSuffix: windowKey(ctx.now) + (isAmz ? '-amz' : ''),
      }, ctx)
    );
  }
  return { candidates, blocked };
}

// ---------------------------------------------------------------------------
// Radar horário (classe B): UMA mensagem com 3 a 6 itens ordenados por movimento
// ---------------------------------------------------------------------------
export function spMinute(now: Date): number {
  return new Date(now.getTime() - 3 * 3600_000).getUTCMinutes();
}

/** Hora (0-23) em Brasília. */
export function spHour(now: Date): number {
  return new Date(now.getTime() - 3 * 3600_000).getUTCHours();
}
export function spDayStr(now: Date): string {
  return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Dono (2026-11-11): radar SEM restrição de hora ou minuto. Mantida por compatibilidade (sempre verdadeira). */
export function isRadarSlot(now: Date): boolean {
  void now;
  return true;
}

export function radarHourKey(now: Date): string {
  const ms = now.getTime() - 3 * 3600_000;
  return new Date(ms).toISOString().slice(0, 13).replace(/[-T]/g, '');
}

/** Compõe a mensagem do radar a partir de candidatos de classe radar (ordem = movimento decrescente). Null se < 3 itens. */
export function composeRadar(items: Candidate[], ctx: EvalContext): Candidate | null {
  const pool = items
    .filter((c) => c.cls === 'radar' && c.trigger !== 'RADAR' && c.move && !c.held && c.sendable && c.status === 'auto' && !/amazon/i.test(c.networkSlug))
    .sort((a, b) => b.moveScore - a.moveScore || a.masterProductId.localeCompare(b.masterProductId));
  const seen = new Set<string>();
  const picked: Candidate[] = [];
  for (const c of pool) {
    if (seen.has(c.masterProductId)) continue;
    seen.add(c.masterProductId);
    picked.push(c);
    if (picked.length >= RULES.RADAR_MAX_ITEMS) break;
  }
  if (picked.length < RULES.RADAR_MIN_ITEMS) return null;
  const hourKey = radarHourKey(ctx.now);
  const messageKey = makeMessageKey('RADAR', `radar:${hourKey}:${picked.map((c) => c.masterProductId).join(',')}`, ctx.now);
  const input: GroupMessageInput = {
    vertical: 'games',
    adTag: ctx.adTag,
    messageKey,
    model: 'radar',
    items: picked.map((c) => ({
      name: c.name,
      offer: { slug: c.offerSlug, networkSlug: c.networkSlug, networkName: c.networkName, priceCents: c.priceCents, confirmedAt: new Date(c.confirmedAt) },
      move: c.move as MoveDetail,
    })),
  };
  let rendered: RenderedGroupMessage;
  try {
    rendered = buildGroupMessages(input);
  } catch (e) {
    rendered = { telegram: '', whatsapp: '', problems: [e instanceof Error ? e.message : 'erro ao montar radar'] };
  }
  const first = picked[0];
  return {
    messageKey,
    trigger: 'RADAR',
    model: 'radar',
    masterProductId: first.masterProductId,
    offerIds: picked.map((c) => c.offerIds[0]),
    vertical: 'games',
    networkSlug: first.networkSlug,
    name: `Radar com ${picked.length} itens`,
    priceCents: first.priceCents,
    avgCents: null,
    belowAvgPct: null,
    dropPct: null,
    reason: `Radar das ${String(spHour(ctx.now)).padStart(2, '0')}h com ${picked.length} itens que mudaram, ordenados por movimento: ${picked.map((c) => `${c.name} (${c.move?.kind})`).join('; ')}.`,
    status: 'auto',
    reviewReasons: [],
    cls: 'radar',
    held: false,
    heldReasons: [],
    moveScore: first.moveScore,
    items: picked.map((c) => ({ masterProductId: c.masterProductId, offerId: c.offerIds[0], priceCents: c.priceCents, kind: (c.move as MoveDetail).kind })),
    offerSlug: first.offerSlug,
    networkName: first.networkName,
    sendable: !rendered.problems.length,
    notSendableReason: rendered.problems.length ? `texto reprovado: ${rendered.problems.join('; ')}` : null,
    confirmedAt: new Date(Math.min(...picked.map((c) => new Date(c.confirmedAt).getTime()))).toISOString(),
    dedupKey: `RADAR:${hourKey}`,
    texts: { telegram: rendered.telegram, whatsapp: rendered.whatsapp },
    textProblems: rendered.problems,
  };
}

// ---------------------------------------------------------------------------
// Limites (política v2): SEM silêncio noturno; a noite vira mensagem silenciosa
// ---------------------------------------------------------------------------
export interface SentRecord {
  /** '' = mensagem sem produto único (radar, resumo). */
  masterProductId: string;
  priceCents: number;
  sentAt: Date;
  networkSlug?: string | null;
  trigger?: string | null;
  cls?: MessageClass | null;
  sound?: boolean;
  /** Foi enviada com cartão de histórico. */
  card?: boolean;
  /** Registro derivado dos itens de um radar: vale para o dedup por produto, NÃO conta nos tetos. */
  itemOnly?: boolean;
  /** Mensagem de plataforma (P1..P5): produto citado (não entra no dedup de preço do produto). */
  platformProductId?: string | null;
  /** Para a diversidade (desempate). */
  vertical?: string | null;
  platformLabel?: string | null;
}

/** Noite (22h às 8h, Brasília): não há silêncio; a mensagem sai SEM notificação sonora. */
export function isNightHour(now: Date): boolean {
  const h = spHour(now);
  return h >= RULES.NIGHT_FROM_HOUR || h < RULES.NIGHT_UNTIL_HOUR;
}

export function isBlackFridayWeek(now: Date): boolean {
  const d = spDayStr(now);
  return d >= RULES.BLACK_FRIDAY_WEEK.from && d <= RULES.BLACK_FRIDAY_WEEK.to;
}

export function dailyCap(now: Date): number {
  return isBlackFridayWeek(now) ? RULES.DAILY_CAP_BLACK_FRIDAY : RULES.DAILY_CAP;
}

export function classCap(cls: MessageClass, now: Date): number {
  return RULES.CLASS_CAP[cls][isBlackFridayWeek(now) ? 1 : 0];
}

export function isDaytime(now: Date): boolean {
  const h = spHour(now);
  return h >= RULES.DAYTIME_FROM_HOUR && h < RULES.DAYTIME_UNTIL_HOUR;
}

export function isSummarySlot(now: Date): boolean {
  const hours: readonly number[] = isBlackFridayWeek(now) ? RULES.SUMMARY_HOURS_BLACK_FRIDAY : RULES.SUMMARY_HOURS;
  return hours.includes(spHour(now)) && spMinute(now) < RULES.RADAR_SLOT_MINUTES;
}

/**
 * Duplicata do produto (dono, 2026-11-11): o mesmo produto só repete depois de 90 min. Exceção: novo mínimo (OK1/G1) com preço
 * MENOR que o do último envio pode repetir depois de 30 min.
 */
export function productDedupBlock(
  c: Pick<Candidate, 'masterProductId' | 'priceCents' | 'trigger'> & { cls?: MessageClass },
  history: SentRecord[],
  now: Date
): string | null {
  if (!c.masterProductId) return null;
  const prior = history
    .filter((h) => h.masterProductId === c.masterProductId && now.getTime() - h.sentAt.getTime() < RULES.PRODUCT_GAP_MIN * 60_000)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  if (!prior) return null;
  const minSince = (now.getTime() - prior.sentAt.getTime()) / 60_000;
  if ((c.trigger === 'G1' || c.trigger === 'OK1') && c.priceCents < prior.priceCents && minSince >= RULES.NEW_MIN_REPEAT_MIN) return null;
  return `produto_ja_enviado_ha_${Math.floor(minSince)}min`;
}

const TRIGGER_RANK: Record<Trigger, number> = { G1: 0, OK1: 0, G2: 1, OK2: 1, T1: 2, T2: 3, G3: 4, G4: 5, G5: 6, G6: 7, RADAR: 8, CUPOM: 9, P1: 10, P2: 11, P3: 12, P4: 13, P5: 14 };
/** Prioridade (dono, 2026-11-11): alerta > insight > radar; resumo logo depois do alerta; cupom por último. */
const CLASS_RANK: Record<MessageClass, number> = { alerta: 0, resumo: 1, insight: 2, radar: 3, plataforma: 4, cupom: 5 };

// ---------------------------------------------------------------------------
// Espaçamento entre mensagens (onda 2)
// ---------------------------------------------------------------------------
export interface SpacingCfg {
  /** Intervalo mínimo de dia (8h-22h) e de noite, em minutos. */
  dayMin: number;
  nightMin: number;
  /** Amplitude do jitter determinístico por hora (0 = sem jitter). */
  jitterAmp: number;
}
export const DEFAULT_SPACING: SpacingCfg = { dayMin: RULES.SPACING_DAY_MIN, nightMin: RULES.SPACING_NIGHT_MIN, jitterAmp: RULES.SPACING_JITTER_MIN };

/** Jitter determinístico de -amp a +amp minutos, derivado do DIA e da HORA (Brasília). Sem aleatoriedade: o mesmo instante dá o mesmo valor. */
export function jitterMin(now: Date, amp: number = RULES.SPACING_JITTER_MIN): number {
  if (!(amp > 0)) return 0;
  const key = `${spDayStr(now)}T${spHour(now)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % (2 * amp + 1)) - amp;
}

/** Intervalo mínimo vigente em `now`: base de dia ou de noite mais o jitter da hora. */
export function minGapMinutes(now: Date, cfg: SpacingCfg = DEFAULT_SPACING): number {
  const base = isNightHour(now) ? cfg.nightMin : cfg.dayMin;
  return Math.max(1, base + jitterMin(now, cfg.jitterAmp));
}

export interface SpacingState {
  gapMin: number;
  lastSentAt: Date | null;
  minutesSince: number | null;
  /** Intervalo mínimo ou teto por hora impede enviar agora. */
  blocked: boolean;
  reason: string | null;
  /** Primeiro instante em que o espaçamento libera (now se já liberado). */
  nextEligibleAt: Date;
  hourSent: number;
  hourlyCap: number;
}

const lastReal = (real: SentRecord[]) => [...real].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0] ?? null;

export function spacingState(history: SentRecord[], now: Date, cfg: SpacingCfg = DEFAULT_SPACING, hourlyCap: number = RULES.HOURLY_CAP): SpacingState {
  const real = history.filter((h) => !h.itemOnly);
  const last = lastReal(real);
  const gapMin = minGapMinutes(now, cfg);
  const minutesSince = last ? (now.getTime() - last.sentAt.getTime()) / 60_000 : null;
  const hourAgo = now.getTime() - 3600_000;
  const recent = real.filter((h) => h.cls !== 'plataforma' && h.sentAt.getTime() > hourAgo && h.sentAt.getTime() <= now.getTime()).sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  let reason: string | null = null;
  let next = now.getTime();
  if (last && minutesSince != null && minutesSince < gapMin) {
    reason = `intervalo_minimo_${gapMin}min_desde_a_ultima`;
    // primeiro minuto t >= now em que (t - último) >= intervalo vigente em t
    for (let t = now.getTime(); t < now.getTime() + 6 * 3600_000; t += 60_000) {
      if ((t - last.sentAt.getTime()) / 60_000 >= minGapMinutes(new Date(t), cfg)) {
        next = t;
        break;
      }
    }
  }
  if (recent.length >= hourlyCap) {
    reason = reason ?? `teto_horario_${hourlyCap}`;
    next = Math.max(next, recent[recent.length - hourlyCap].sentAt.getTime() + 3600_000);
  }
  return {
    gapMin,
    lastSentAt: last?.sentAt ?? null,
    minutesSince,
    blocked: reason != null,
    reason,
    nextEligibleAt: new Date(next),
    hourSent: recent.length,
    hourlyCap,
  };
}

/** Algum item do radar composto enviado há menos de 90 min. Conta também os itens de radar (itemOnly). */
export function productGapBlock(c: Pick<Candidate, 'masterProductId' | 'items' | 'trigger'>, history: SentRecord[], now: Date): string | null {
  if (c.trigger === 'G4') return null;
  const ids = c.items?.length ? c.items.map((i) => i.masterProductId) : c.masterProductId ? [c.masterProductId] : [];
  const limit = RULES.PRODUCT_GAP_MIN * 60_000;
  const hit = history.find((h) => h.masterProductId && ids.includes(h.masterProductId) && now.getTime() - h.sentAt.getTime() < limit);
  return hit ? `mesmo_produto_ha_menos_de_${RULES.PRODUCT_GAP_MIN}min` : null;
}

/** Proposta com mais de 6 h expira (radar automático composto: 20 min). */
export function proposalExpired(createdAt: Date, now: Date, o: { trigger?: string | null } = {}): boolean {
  const ageMin = (now.getTime() - createdAt.getTime()) / 60_000;
  if (o.trigger === 'RADAR') return ageMin > RULES.RADAR_PROPOSAL_MAX_AGE_MIN;
  return ageMin > RULES.PROPOSAL_MAX_AGE_HOURS * 60;
}

// ---------------------------------------------------------------------------
// Ordem da fila e diversidade (só desempate)
// ---------------------------------------------------------------------------
export interface DiversitySource {
  networkSlug?: string | null;
  vertical?: string | null;
  platformLabel?: string | null;
}
/** Loja (ML/Shopee/Amazon) + departamento + plataforma. */
export function diversityKey(x: DiversitySource): string {
  const slug = x.networkSlug ?? '';
  return `${netKind({ networkSlug: slug, networkName: slug })}|${x.vertical ?? ''}|${x.platformLabel ?? ''}`;
}

/** Classe (alerta > resumo > insight > radar > cupom); dentro dela o maior movimento; depois o gatilho. */
export function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    CLASS_RANK[a.cls] - CLASS_RANK[b.cls] ||
    b.moveScore - a.moveScore ||
    TRIGGER_RANK[a.trigger] - TRIGGER_RANK[b.trigger] ||
    (b.belowAvgPct ?? 0) - (a.belowAvgPct ?? 0) ||
    a.messageKey.localeCompare(b.messageKey)
  );
}

/**
 * Próxima da fila (já ordenada). Diversidade só como DESEMPATE: se a primeira repete loja+departamento+plataforma da última
 * enviada, troca por uma da MESMA classe com movimento parecido (>= 70% do da primeira) que seja diferente; senão fica a primeira.
 */
export function pickNext(sorted: Candidate[], last: DiversitySource | null): Candidate | null {
  const top = sorted[0];
  if (!top) return null;
  if (!last) return top;
  const lk = diversityKey(last);
  if (diversityKey(top) !== lk) return top;
  const alt = sorted.find((c) => c.cls === top.cls && diversityKey(c) !== lk && (top.moveScore <= 0 || c.moveScore >= top.moveScore * RULES.DIVERSITY_MIN_QUALITY_RATIO));
  return alt ?? top;
}

/** Fila inteira na ordem em que sairia (cada escolha vira a "última" da seguinte). */
export function orderQueue(cands: Candidate[], history: SentRecord[]): Candidate[] {
  let last: DiversitySource | null = lastReal(history.filter((h) => !h.itemOnly));
  let rest = [...cands].sort(compareCandidates);
  const out: Candidate[] = [];
  while (rest.length) {
    const n = pickNext(rest, last) as Candidate;
    out.push(n);
    rest = rest.filter((x) => x !== n);
    last = n;
  }
  return out;
}

export interface LimitPlan {
  /** Próximo a sair agora (no máximo um por execução). null = nada a enviar neste momento. */
  next: Candidate | null;
  /** O próximo sai COM notificação sonora? (alerta ou resumo, de dia, dentro de 8/dia e do intervalo mínimo entre sons). */
  nextSound: boolean;
  /** Por que não há `next` ou por que cada outro foi adiado. */
  deferred: Array<{ messageKey: string; reason: string }>;
  state: { night: boolean; sentToday: number; dailyCap: number; soundToday: number; byClass: Record<MessageClass, number>; spacing: SpacingState };
}

/** Som: só alerta e resumo, de dia, dentro de 8 por dia e com pelo menos 15 min desde o último som. O resto sai silencioso. */
export function soundDecision(cls: MessageClass, history: SentRecord[], now: Date): boolean {
  if (cls !== 'alerta' && cls !== 'resumo') return false;
  if (isNightHour(now)) return false;
  const real = history.filter((h) => !h.itemOnly);
  const today = spDayStr(now);
  const sounds = real.filter((h) => h.sound);
  if (sounds.filter((h) => spDayStr(h.sentAt) === today).length >= RULES.SOUND_CAP) return false;
  const last = [...sounds].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  if (last && (now.getTime() - last.sentAt.getTime()) / 60_000 < RULES.SOUND_MIN_GAP_MIN) return false;
  return true;
}

export interface LimitOptions {
  /** Envio manual ("Enviar agora" do admin): ignora o intervalo mínimo (os tetos e a duplicata do produto continuam). */
  ignoreSpacing?: boolean;
  spacing?: SpacingCfg;
}

const PLATFORM_ORDER: Trigger[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

/**
 * Mensagem de PLATAFORMA (P1 a P5) é a única classe com cota de proporção (dono, 2026-11-11): pelo menos 1 a cada 6 mensagens de
 * preço enviadas, no máximo 1 a cada 20 min, e também quando há pausa de preços há mais de 30 min. Não conta como "preço" nos tetos.
 */
export function platformDue(history: SentRecord[], now: Date): { due: boolean; reason: string | null; sincePrice: number; pauseMin: number | null } {
  const all = history.filter((h) => !h.itemOnly);
  const lastPlat = all.filter((h) => h.cls === 'plataforma').sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  const price = all.filter((h) => h.cls !== 'plataforma');
  const lastPrice = price.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  const sincePrice = price.filter((h) => !lastPlat || h.sentAt.getTime() > lastPlat.sentAt.getTime()).length;
  const pauseMin = lastPrice ? (now.getTime() - lastPrice.sentAt.getTime()) / 60_000 : null;
  if (lastPlat && (now.getTime() - lastPlat.sentAt.getTime()) / 60_000 < RULES.PLATFORM_MIN_GAP_MIN) {
    return { due: false, reason: `plataforma_intervalo_${RULES.PLATFORM_MIN_GAP_MIN}min`, sincePrice, pauseMin };
  }
  if (sincePrice >= RULES.PLATFORM_EVERY_N_PRICE) return { due: true, reason: null, sincePrice, pauseMin };
  if (pauseMin == null || pauseMin > RULES.PLATFORM_PAUSE_MIN) return { due: true, reason: null, sincePrice, pauseMin };
  return { due: false, reason: 'plataforma_aguarda_proporcao_1_a_cada_6', sincePrice, pauseMin };
}

/** Modelo seguinte da rotação P1..P5 depois do último enviado. */
function platformRotationIndex(trigger: Trigger, lastTrigger: string | null | undefined): number {
  const last = PLATFORM_ORDER.indexOf((lastTrigger ?? '') as Trigger);
  const i = PLATFORM_ORDER.indexOf(trigger);
  return (i - last - 1 + PLATFORM_ORDER.length * 2) % PLATFORM_ORDER.length;
}

/**
 * Aplica tetos (diário, por hora, por classe, sonoros), intervalo mínimo entre mensagens, duplicata do produto (90 min; novo mínimo
 * repete após 30 min), cota das mensagens de plataforma e desempate por diversidade. Só considera `auto` + enviável + não retido.
 * No máximo UMA mensagem por execução. SEM janela de horário (24 h); de 22h às 8h tudo sai sem som.
 */
export function applyLimits(cands: Candidate[], history: SentRecord[], now: Date, opts: LimitOptions = {}): LimitPlan {
  const deferred: LimitPlan['deferred'] = [];
  const all = history.filter((h) => !h.itemOnly);
  // Plataforma não conta como "preço" nos tetos.
  const real = all.filter((h) => h.cls !== 'plataforma');
  const today = spDayStr(now);
  const sentToday = real.filter((h) => spDayStr(h.sentAt) === today);
  const byClass: Record<MessageClass, number> = { alerta: 0, radar: 0, insight: 0, resumo: 0, cupom: 0, plataforma: 0 };
  for (const h of all) if (h.cls && spDayStr(h.sentAt) === today) byClass[h.cls]++;
  const soundToday = sentToday.filter((h) => h.sound).length;
  const cap = dailyCap(now);
  const night = isNightHour(now);
  const spacing = spacingState(all, now, opts.spacing ?? DEFAULT_SPACING);
  const state = { night, sentToday: sentToday.length, dailyCap: cap, soundToday, byClass, spacing };
  const pool = cands.filter((c) => c.sendable && c.status === 'auto' && !c.held);

  // Teto diário/horário de PREÇO: a plataforma segue podendo sair (não conta nos tetos), mas respeita o intervalo mínimo.
  const dayFull = sentToday.length >= cap;
  const hourFull = spacing.hourSent >= spacing.hourlyCap;
  const spaceBlocked = spacing.blocked && !opts.ignoreSpacing && !spacing.reason?.startsWith('teto_horario');
  if (spaceBlocked) {
    for (const c of pool) deferred.push({ messageKey: c.messageKey, reason: spacing.reason as string });
    return { next: null, nextSound: false, deferred, state };
  }

  const lastRadar = all.filter((h) => h.trigger === 'RADAR').sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  const lastOf = (cls: MessageClass) => all.filter((h) => h.cls === cls).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  const lastPlat = all.filter((h) => h.cls === 'plataforma').sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  const nightAlerts = real.filter((h) => h.cls === 'alerta' && isNightHour(h.sentAt) && now.getTime() - h.sentAt.getTime() < 11 * 3600_000).length;

  const ok: Candidate[] = [];
  for (const c of pool) {
    const cls = c.cls;
    const composite = c.trigger === 'RADAR';
    const platform = cls === 'plataforma';
    let why: string | null = null;
    if (!platform && dayFull) why = `teto_diario_${cap}`;
    else if (!platform && hourFull) why = `teto_horario_${spacing.hourlyCap}`;
    else if (byClass[cls] >= classCap(cls, now)) why = `teto_classe_${cls}_${classCap(cls, now)}`;
    else if (!platform) {
      // Radar composto: no máximo 1 a cada 45 min. Item de radar é mensagem individual, como as demais.
      const last = composite ? lastRadar : cls === 'radar' ? undefined : lastOf(cls);
      const gap = composite ? RULES.CLASS_GAP_MIN.radar : cls === 'radar' ? 0 : RULES.CLASS_GAP_MIN[cls];
      if (gap > 0 && last && (now.getTime() - last.sentAt.getTime()) / 60_000 < gap) why = `intervalo_minimo_${composite ? 'radar' : cls}_${gap}min`;
    }
    if (!why && platform) {
      if (lastPlat && lastPlat.trigger === c.trigger) why = 'plataforma_mesmo_modelo_seguido';
      else if (all.some((h) => h.cls === 'plataforma' && h.platformProductId && h.platformProductId === c.masterProductId && spDayStr(h.sentAt) === today)) why = 'plataforma_produto_ja_hoje';
    }
    if (!why && !platform && night && cls === 'alerta' && nightAlerts >= RULES.NIGHT_ALERT_CAP) why = `noite_maximo_${RULES.NIGHT_ALERT_CAP}_alertas`;
    if (!why && !platform) why = productDedupBlock(c, history, now);
    if (!why && !platform && c.items?.length && !opts.ignoreSpacing) why = productGapBlock(c, history, now);
    if (why) deferred.push({ messageKey: c.messageKey, reason: why });
    else ok.push(c);
  }

  const platOk = ok.filter((c) => c.cls === 'plataforma');
  const priceOk = ok.filter((c) => c.cls !== 'plataforma').sort(compareCandidates);
  const due = platformDue(history, now);
  let next: Candidate | null;
  if (due.due && platOk.length) {
    next = [...platOk].sort((a, b) => platformRotationIndex(a.trigger, lastPlat?.trigger) - platformRotationIndex(b.trigger, lastPlat?.trigger) || b.moveScore - a.moveScore)[0];
  } else {
    for (const c of platOk) deferred.push({ messageKey: c.messageKey, reason: due.reason ?? 'plataforma_aguarda_proporcao_1_a_cada_6' });
    next = pickNext(priceOk, lastReal(real));
  }
  for (const c of ok) if (c !== next && c.cls !== 'plataforma') deferred.push({ messageKey: c.messageKey, reason: 'fila_1_envio_por_execucao' });
  if (next && due.due && platOk.includes(next)) for (const c of platOk) if (c !== next) deferred.push({ messageKey: c.messageKey, reason: 'fila_1_envio_por_execucao' });
  return { next, nextSound: next ? soundDecision(next.cls, real, now) : false, deferred, state };
}

// ---------------------------------------------------------------------------
// Plano do dia (para o admin): quantos slots restam e em que faixas
// ---------------------------------------------------------------------------
export const DAY_BANDS = [
  { id: 'madrugada', label: 'Madrugada (0h às 8h)', from: 0, to: 8, silent: true },
  { id: 'manha', label: 'Manhã (8h às 12h)', from: 8, to: 12, silent: false },
  { id: 'tarde', label: 'Tarde (12h às 18h)', from: 12, to: 18, silent: false },
  { id: 'inicio-noite', label: 'Início da noite (18h às 22h)', from: 18, to: 22, silent: false },
  { id: 'noite', label: 'Noite (22h às 24h)', from: 22, to: 24, silent: true },
] as const;
export type DayBandId = (typeof DAY_BANDS)[number]['id'];

export interface DaySlot {
  at: Date;
  band: DayBandId;
  /** Com notificação sonora possível (de 8h às 22h)? */
  soundWindow: boolean;
}
export interface DayPlan {
  day: string;
  dailyCap: number;
  sentToday: number;
  /** Mensagens que ainda cabem hoje (teto diário - enviadas). */
  remaining: number;
  soundCap: number;
  soundSent: number;
  soundRemaining: number;
  hourlyCap: number;
  gapNowMin: number;
  nextEligibleAt: Date;
  /** Horários estimados de saída se houver mensagem na fila em todos (respeita o intervalo e o teto por hora). */
  slots: DaySlot[];
  bands: Array<{ id: DayBandId; label: string; silent: boolean; slots: number }>;
}

/** Hora de Brasília (fração) de um instante. */
function spHourFloat(ms: number): number {
  const d = new Date(ms - 3 * 3600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/**
 * Plano do dia, puro: a partir do que já saiu hoje, quantos slots restam e quando cada um poderia sair. Cada slot respeita o
 * intervalo mínimo vigente na hora dele, o teto por hora e o teto diário. `caps` permite sobrescrever os tetos (testes, admin).
 */
export function planDaySlots(
  now: Date,
  sent: SentRecord[],
  caps: { daily?: number; sound?: number; hourly?: number } = {},
  cfg: SpacingCfg = DEFAULT_SPACING
): DayPlan {
  const real = sent.filter((h) => !h.itemOnly);
  const day = spDayStr(now);
  const sentToday = real.filter((h) => h.cls !== 'plataforma' && spDayStr(h.sentAt) === day);
  const dailyCapV = caps.daily ?? dailyCap(now);
  const soundCap = caps.sound ?? RULES.SOUND_CAP;
  const hourlyCap = caps.hourly ?? RULES.HOURLY_CAP;
  const remaining = Math.max(0, dailyCapV - sentToday.length);
  const soundSent = sentToday.filter((h) => h.sound).length;
  const sp = spacingState(real, now, cfg, hourlyCap);
  const dayStart = new Date(`${day}T00:00:00-03:00`).getTime();
  const dayEnd = dayStart + 86_400_000;
  const times = real.filter((h) => h.cls !== 'plataforma').map((h) => h.sentAt.getTime()).filter((t) => t <= now.getTime()).sort((a, b) => a - b);
  const slots: DaySlot[] = [];
  let t = sp.nextEligibleAt.getTime();
  let guard = 0;
  while (slots.length < remaining && t < dayEnd && guard++ < 2000) {
    const recent = times.filter((x) => x > t - 3600_000);
    if (recent.length >= hourlyCap) {
      t = recent[recent.length - hourlyCap] + 3600_000;
      continue;
    }
    const hf = spHourFloat(t);
    const band = DAY_BANDS.find((b) => hf >= b.from && hf < b.to) ?? DAY_BANDS[DAY_BANDS.length - 1];
    slots.push({ at: new Date(t), band: band.id, soundWindow: !band.silent });
    times.push(t);
    t += minGapMinutes(new Date(t), cfg) * 60_000;
  }
  return {
    day,
    dailyCap: dailyCapV,
    sentToday: sentToday.length,
    remaining,
    soundCap,
    soundSent,
    soundRemaining: Math.max(0, soundCap - soundSent),
    hourlyCap,
    gapNowMin: sp.gapMin,
    nextEligibleAt: sp.nextEligibleAt,
    slots,
    bands: DAY_BANDS.map((b) => ({ id: b.id, label: b.label, silent: b.silent, slots: slots.filter((s) => s.band === b.id).length })),
  };
}

/** Ajusta o horário de um slot às janelas da classe (radar composto: 7h às 23h nos minutos 0 a 14; cupom: 9h às 21h). */
export function windowAdjust(c: Pick<Candidate, 'trigger' | 'cls'>, at: Date): Date {
  let t = at.getTime();
  const nextHour = (ms: number) => Math.floor((ms - 3 * 3600_000) / 3600_000) * 3600_000 + 3 * 3600_000 + 3600_000;
  for (let i = 0; i < 48; i++) {
    const d = new Date(t);
    const ok = c.trigger === 'RADAR' ? isRadarSlot(d) : true;
    if (ok) return d;
    t = nextHour(t);
  }
  return new Date(t);
}

/** O cartão de histórico cabe? No máximo 4 por dia e o mesmo produto 1 vez a cada 7 dias. */
export function cardAllowed(masterProductId: string, history: SentRecord[], now: Date): boolean {
  const today = spDayStr(now);
  const cards = history.filter((h) => h.card && !h.itemOnly);
  if (cards.filter((h) => spDayStr(h.sentAt) === today).length >= RULES.CARD_DAILY_CAP) return false;
  return !cards.some((h) => h.masterProductId === masterProductId && now.getTime() - h.sentAt.getTime() < RULES.CARD_REPEAT_DAYS * 86_400_000);
}

/** Revalidação no envio: o preço relido precisa estar dentro de 2% do detectado. */
export function priceWithinTolerance(detectedCents: number, currentCents: number): boolean {
  if (detectedCents <= 0) return false;
  return Math.abs(currentCents - detectedCents) / detectedCents <= RULES.SEND_PRICE_TOLERANCE_PCT / 100;
}

/** 'YYYY-MM-DD' menos n dias (para a data de início da série curta). */
export function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
