// Regras dos gatilhos e limites anti-spam das mensagens para grupos (ata 2026-11-10). PURO: recebe fatos, devolve decisões.
// Nada aqui lê banco, relógio ou env: o chamador passa `now` e os fatos medidos.

import {
  buildGoLink,
  buildGroupMessages,
  cleanProductName,
  fmtBRL,
  getSlogan,
  makeMessageKey,
  pctBelow,
  priceIndicators,
  productDisplayName,
  departmentLabel,
  stampLine,
  textProblems,
  withTag,
  type GroupMessageInput,
  type MoveDetail,
  type MoveKind,
  type RenderedGroupMessage,
} from '@/lib/messaging/group-messages';
import { AMAZON_OWN_MIN_DAYS, amazonCountsIn, type AmazonMode } from '@/lib/pricing/amazon-mode';
import { emFaseDeFormacao, mediaSimples, minLojas } from '@/lib/messaging/fase-formacao';
import { calcularVeredito, degrauDaQueda, faixaPreco, noMenorRegistrado, reguaConfig, reguaDaLoja, reguaInfoDe, reguaTelegram, reguaWhatsapp, type ReguaInfo } from '@/lib/messaging/regua';
import { AGULHA } from '@/lib/coupons/agulha';
import type { CouponRefMeta } from '@/lib/coupons/guardiao-model';
import type { CouponInfo } from '@/lib/messaging/group-messages';

// ---------------------------------------------------------------------------
// Limiares (medidos e decididos na ata)
// ---------------------------------------------------------------------------
/**
 * Sem teto de quantidade (dono, 2026-11-11: "enviar a quantidade que o Telegram permitir, para todas as lojas").
 * O Telegram NAO limita mensagens por dia: limita a taxa (~1/s por chat, ~20/min por grupo, ~30/s no total). Por isso o teto
 * diario, o horario, o por classe e o de alertas noturnos valem este numero (efetivamente infinito, finito para somar/serializar),
 * e o freio real e o espacamento por CHAT (SPACING_CHAT_SEC) mais o tratamento do HTTP 429 (retry_after) no envio.
 * O conceito dos tetos continua nas funcoes (dailyCap, applyLimits) para WhatsApp/propostas manuais: basta baixar a constante.
 */
export const NO_CAP = 1_000_000;

export const RULES = {
  /** G1 (legado): queda mínima sobre o menor anterior. */
  G1_MIN_DROP_PCT: 8,
  /** G1/G2/G3: abaixo da média mínimo. */
  /** Régua de preço (dono, 2026-11-11): só se envia mensagem de preço quando a cotação do dia está pelo menos este % ABAIXO da média única oferta-dia (era 15). */
  MIN_BELOW_AVG_PCT: 10,
  /** Fase de formação de amostra (dono, 2026-11-11): nas lojas que não são Games, ANTES da data de corte (fase-formacao.ts: DATA_DE_CORTE_FORMACAO), basta o preço estar abaixo da média simples (qualquer % > este piso). Na data de corte a régua de 10% entra SOZINHA. */
  EARLY_MIN_BELOW_AVG_PCT: 0.1,
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
  /** Vendedor ML (dono, 2026-11-12: "só não coloque reputação baixa; as demais deixe o cliente decidir"). */
  ML_MIN_SALES: 10, // legado: não barra mais; a mensagem mostra a reputação
  /** Reputações BAIXAS: únicas que barram a oferta (vermelha e laranja). Amarela, verde-clara, verde e sem reputação entram. */
  ML_LOW_REPUTATIONS: ['1_red', '2_orange'],

  // ---- Política v2 (ata 2026-11-10 §1, pacote aprovado pelo dono) ----
  /** Teto global por dia (Brasília). SEM silêncio noturno: a noite vira mensagem silenciosa. */
  // Decisão do dono (2026-11-11): 400 por dia e 60 por hora ("eu quero o canal movimentado"; antes 30/40 por dia).
  DAILY_CAP: NO_CAP,
  DAILY_CAP_BLACK_FRIDAY: NO_CAP,
  HOURLY_CAP: NO_CAP,
  BLACK_FRIDAY_WEEK: { from: '2026-11-20', to: '2026-11-27' },
  /** No máximo 8 mensagens por dia com notificação sonora; o resto sai com disable_notification. */
  SOUND_CAP: 20,
  /** Intervalo mínimo entre duas mensagens sonoras (a segunda sai silenciosa se vier antes). */
  SOUND_MIN_GAP_MIN: 0,
  /** Noite = das 22h às 8h (Brasília): tudo silencioso; classes C, D, E não saem; no máximo 3 alertas. */
  NIGHT_FROM_HOUR: 22,
  NIGHT_UNTIL_HOUR: 8,
  NIGHT_ALERT_CAP: NO_CAP,
  /** Tetos por classe [normal, 20 a 27/11]. */
  CLASS_CAP: { alerta: [NO_CAP, NO_CAP], radar: [NO_CAP, NO_CAP], insight: [NO_CAP, NO_CAP], resumo: [NO_CAP, NO_CAP], cupom: [NO_CAP, NO_CAP], plataforma: [NO_CAP, NO_CAP] },
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
  /** Telegram automatico: intervalo minimo entre duas mensagens do MESMO chat/loja, em segundos (limite da API: ~1/s por chat e 20/min por grupo => 3 s). Lojas diferentes nao se bloqueiam. */
  SPACING_CHAT_SEC: 3,
  /** Maximo de mensagens por chat em 60 s (limite do Telegram para grupos/canais). */
  CHAT_MAX_PER_MINUTE: 20,
  /** Mesmo produto (mesmo vendedor, mesmo preço): só volta depois de 1 h, se ainda estiver ativo (dono, 2026-11-11, régua anti-saturação). */
  PRODUCT_GAP_MIN: 60,
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
  // ---- ACHADO e DIVERSIDADE (ata 2026-11-12-diversidade-fluxo-plus; dono, 2026-11-12) ----
  /** Achado: o mesmo produto so volta depois disto (o G2 continua em PRODUCT_GAP_MIN = 1 h). */
  ACHADO_PRODUCT_GAP_HOURS: 24,
  /** Achado por loja em 24 h: no minimo isto e, acima disso, ate 25% das mensagens da loja (achados <= nao-achados / 3). */
  ACHADO_MIN_PER_DAY: 3,
  ACHADO_MAX_PER_HOUR: 2,
  /** Oferta citada (a mais barata com link valido) pode estar ate este % acima da mais barata real (que nao tem link); o texto nao diz "menor". */
  ACHADO_FALLBACK_MAX_ABOVE_PCT: 3,
  /** Faixa do preco contra a mediana do TIPO (menor preco por master do mesmo departamento+tipo); amostra minima de masters no tipo. */
  ACHADO_TIPO_MIN_SAMPLE: 5,
  ACHADO_TIPO_RATIO_MIN: 0.5,
  ACHADO_TIPO_RATIO_MAX: 2.5,
  /** Achado em GAMES sem media calculada (dono, 2026-11-12): a faixa e contra a mediana do menor preco por master da mesma PLATAFORMA (mais larga que a dos tipos Plus: jogos vao de R$ 30 a R$ 350). */
  ACHADO_GAMES_PLAT_MIN_SAMPLE: 10,
  ACHADO_GAMES_RATIO_MIN: 0.25,
  ACHADO_GAMES_RATIO_MAX: 4,
  /** Historico proprio do produto (menor preco diario medido): com >= 3 dias, preco <= 1,10x a mediana dele e >= 0,5x. */
  ACHADO_OWN_MIN_DAYS: 3,
  ACHADO_OWN_MAX_RATIO: 1.1,
  ACHADO_OWN_MIN_RATIO: 0.5,
  /** PREÇO AGORA (N1, dono 2026-11-13; produto sem base de preço): por canal (loja), no máximo isto por hora e por dia (GROUP_N1_POR_HORA / GROUP_N1_POR_DIA só podem BAIXAR). */
  N1_MAX_PER_HOUR: 1,
  N1_MAX_PER_DAY: 6,
  /** Cota de diversidade: nenhum TIPO passa desta parcela das mensagens da loja nas ultimas 24 h (so vale com alternativa de outro tipo e depois de TIPO_SHARE_MIN_SENT envios). */
  TIPO_MAX_SHARE_PCT: 30,
  TIPO_SHARE_MIN_SENT: 6,
  /** Cooldown do MESMO produto entre TODOS os gatilhos (dono, 2026-11-13; R-47): horas (GROUP_MASTER_COOLDOWN_H; 0/off desliga). */
  MASTER_COOLDOWN_H: 8,
  /** Exceção do cooldown: nova queda do preço enviado de pelo menos isto (%), depois de MASTER_COOLDOWN_EXC_MIN (GROUP_MASTER_COOLDOWN_QUEDA_PCT). */
  MASTER_COOLDOWN_QUEDA_PCT: 5,
  MASTER_COOLDOWN_EXC_MIN: 120,
  /** Mensagens do mesmo TIPO na mesma loja por hora (soft: só com alternativa de outro tipo na fila; GROUP_TIPO_POR_HORA; 0 = sem teto). */
  TIPO_MAX_PER_HOUR: 2,
  // ---- CUPOM ATIVO (gatilho CUPOM por oferta; dono, 2026-11-12) ----
  /** Mesmo produto: a mensagem de cupom so volta depois disto (conta so entre mensagens de cupom; nao bloqueia a de preco e vice-versa). */
  CUPOM_PRODUCT_GAP_MIN: 60,
  /** Mesmo cupom (mesma leitura do anuncio) divulgado em QUALQUER mensagem (preco com bloco de cupom ou mensagem de cupom): so volta depois disto. */
  CUPOM_COUPON_GAP_MIN: 60,
  /** Cota por loja: no maximo isto de mensagens de cupom por hora e, em 24 h, ate esta parcela das mensagens da loja (so vale com alternativa e depois de CUPOM_SHARE_MIN_SENT envios). */
  CUPOM_MAX_PER_HOUR_STORE: 6,
  CUPOM_MAX_SHARE_PCT: 40,
  CUPOM_SHARE_MIN_SENT: 6,
  BLACK_FRIDAY_DAY: '2026-11-27',
  TRACKING_SINCE_DAY: '2026-10-31',
} as const;

/** Departamentos liberados no porteiro e no /go. Os demais geram G6 marcado como não enviável. */
export const RELEASED_VERTICALS: readonly string[] = ['games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte', 'impressao3d']; // todas as lojas (dono, 2026-11-11): cada uma envia ao seu canal

export type Trigger = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'OK1' | 'OK2' | 'T1' | 'T2' | 'RADAR' | 'CUPOM' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'AC' | 'N1';

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
  AC: 'insight',
  N1: 'insight',
};

/** Ponto da série diária do menor preço do produto (dias ANTERIORES a hoje, ordem crescente). */
export interface DayPoint {
  /** 'YYYY-MM-DD' (Brasília). */
  day: string;
  minCents: number;
  /** Maior cotação plausível do dia (price_daily_state.max_cents; R-44). Ausente = só o menor do dia. */
  maxCents?: number;
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
  /** Link oficial de afiliado (meli.la) já gravado: o programa só gera link para vendedor amarelo ou melhor, então vale como reputação mínima. */
  officialLink?: boolean;
  /** URL de afiliado da oferta (vai no texto da mensagem). */
  affiliateUrl?: string | null;
  /** Nome da loja/vendedor da oferta (store_name da Shopee/Amazon; apelido do vendedor no ML). */
  storeName?: string | null;
  quarantined: boolean;
  /**
   * Identidade do item na fila de classificação (ata 2026-11-11-time-identidade-itens). Ausente = certa/não avaliada (comportamento de sempre).
   * 'incerta' em loja que não é games, durante a fase de formação: o item fica FORA da média simples e não é escolhido para mensagem.
   */
  identidade?: 'certa' | 'incerta';
  /**
   * Oferta "fora da média" (affiliate_offers.avg_excluded_at, migration 0044): continua visível no site, mas NÃO entra na média/mediana e
   * NÃO é escolhida para mensagem (toda mensagem compara com a média). Ausente/false = comportamento de sempre.
   */
  avgExcluded?: boolean;
  /** Amazon: ausências seguidas na busca da coleta assistida (consecutive_miss_count). > 0 = fora dos gatilhos. */
  missCount?: number;
  /** Amazon: primeira observação depois de uma ausência (group_offer_watch). null = nunca sumiu / sem registro. */
  returnedAt?: Date | null;
  /** Amazon, PRICE_AMAZON_MODE=on: mediana oferta-dia dos últimos 14 dias do PRÓPRIO ASIN (régua da Amazon-only). null = série curta (< 7 dias) ou não aplicável. */
  ownMedian14?: { cents: number; days: number } | null;
  /** Preço conferido AO VIVO na API oficial neste ciclo de envio: dispensa o intervalo de 15 min entre duas coletas. */
  liveVerifiedAt?: Date | null;
  /** Selos (opcionais; o coletor ainda NÃO guarda frete nem loja oficial, então hoje chegam vazios e a linha não aparece). */
  freeShipping?: boolean;
  officialStore?: string | null;
  /** Shopee: link da campanha oficial adequada ao departamento (tabela shopee_campaigns). */
  shopeeCampaignUrl?: string | null;
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
  /** PRICE_AMAZON_MODE=on: o produto não tem NENHUMA oferta ativa e elegível fora da Amazon (qualquer frescor). Só então vale a régua do próprio ASIN. */
  amazonOnly?: boolean;
  /** Tipo do produto na loja (classificarTipo, derivado do titulo). Ausente em games. */
  tipo?: string | null;
  /** Mediana (centavos) do menor preco por master do mesmo departamento+tipo e quantos masters entraram. */
  tipoMedianCents?: number | null;
  tipoSample?: number;
  /** Games: true quando o produto AINDA NAO tem media calculada (menos de MED_MIN_OFFERS ofertas ou sem estado diario). So entao o Achado vale para games. */
  semMedia?: boolean;
  /** Games: mediana do menor preco por master da mesma plataforma (ofertas vivas, fora da Amazon) e tamanho da amostra. */
  platMedianCents?: number | null;
  platSample?: number;
  /** Ofertas deste produto com cupom do anuncio que PASSOU na agulha neste instante (server: lookupItemCouponDetail). Ausente/vazio = sem cupom valido. */
  coupons?: CouponOfferFact[];
  /** Ofertas com leitura de cupom recente que a agulha barrou, com o motivo (auditoria; vira `blocked` do gatilho CUPOM). */
  couponMisses?: Array<{ offerId: string; reason: string }>;
}

/** Cupom do anuncio aprovado pela agulha (4 conferencias) para UMA oferta. Tudo lido na pagina do anuncio. */
export interface CouponOfferFact {
  offerId: string;
  /** Identidade da divulgacao (anuncio: id da oferta). */
  couponRef: string;
  name: string;
  /** Preco do anuncio SEM cupom no momento da checagem. */
  offerPriceCents: number;
  /** Preco COM cupom lido na pagina. */
  finalCents: number;
  offCents: number;
  pct: number;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  ruleKnown: boolean;
  /** Texto completo do cupom (CouponInfo.conditions) para o registro da divulgacao. */
  conditions: string;
  activation: string;
  /** Código digitável lido na página (tipo a), se houver. */
  code?: string | null;
  /** Passo a passo curto da loja. */
  howTo?: string[];
  /** false = cupom sem nome (clicar e ativar): `name` é o rótulo do valor lido. */
  named?: boolean;
  readAt: Date;
  expiresAt: Date | null;
}

export interface AmazonRef {
  cents: number;
  offers: number;
  /** market = média única do mercado (inclui a Amazon); amazon = produto só na Amazon, 3+ ASIN ("média na Amazon"); own = mediana de 14 dias do próprio ASIN. */
  scope: 'market' | 'amazon' | 'own';
  ownDays?: number;
}

/**
 * Referência de preço para a régua de 10% de uma oferta da Amazon (ADR 0010, D3). Só com PRICE_AMAZON_MODE=on e departamento liberado.
 *  - média única qualificada (3+ ofertas): vale para a Amazon como para as demais (produto só na Amazon com 3+ ASIN = "média na Amazon");
 *  - sem média e produto só na Amazon (menos de 3 ASIN): mediana de 14 dias do próprio ASIN (mínimo 7 dias de série), nunca "média das lojas";
 *  - qualquer outro caso: null (a régua de 10% bloqueia, como hoje).
 */
export function amazonReference(p: Pick<ProductFacts, 'vertical' | 'amazonOnly'>, o: Pick<OfferFact, 'ownMedian14'>, avg: { cents: number; distinctOffers: number } | null, mode: AmazonMode | undefined): AmazonRef | null {
  if (!amazonCountsIn(mode ?? 'off', p.vertical)) return null;
  if (avg && avg.cents > 0) return { cents: avg.cents, offers: avg.distinctOffers, scope: p.amazonOnly ? 'amazon' : 'market' };
  if (p.amazonOnly && o.ownMedian14 && o.ownMedian14.cents > 0 && o.ownMedian14.days >= AMAZON_OWN_MIN_DAYS) {
    return { cents: o.ownMedian14.cents, offers: 1, scope: 'own', ownDays: o.ownMedian14.days };
  }
  return null;
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
  if (o.avgExcluded) return block('fora_da_media');
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
    // Só reputação BAIXA barra (vermelha/laranja). Amarela, verdes, poucas vendas e sem reputação lida entram: o cliente decide,
    // e a mensagem mostra a reputação quando ela é conhecida (sellerLine).
    const rep = o.sellerReputation;
    if (rep && (RULES.ML_LOW_REPUTATIONS as readonly string[]).includes(rep)) return block(`vendedor_reputacao_${rep}`);
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
  /** Tipo do produto na loja (cota de diversidade). */
  tipo?: string | null;
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
  /** Gatilho CUPOM: identidade do cupom divulgado e o registro para o Agente de Cupons acompanhar o fim dele. */
  couponRef?: string;
  couponInfo?: CouponInfo & CouponRefMeta;
  /** Gatilho CUPOM: preço COM o cupom lido na página do anúncio (centavos); `priceCents` segue sendo o do anúncio sem cupom. Alimenta o card simples. */
  couponFinalCents?: number;
  /** Gatilho CUPOM: nome do cupom (ou rótulo do valor, quando sem nome) para o card simples. */
  couponName?: string;
  /** Régua de destaque (regua.ts, 2026-11-12): degrau, veredito e texto do botão. Só em lojas liberadas por GROUP_REGUA_LOJAS. */
  regua?: ReguaInfo;
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
  /** Régua de preço: % mínimo abaixo da média única para enviar. Padrão RULES.MIN_BELOW_AVG_PCT (10); 0 desliga (só testes legados). */
  minBelowAvgPct?: number;
  now: Date;
  maxAgeMin: number;
  adTag: string;
  /** Frescor máximo da Amazon nesta avaliação (60 na detecção, 40 no envio). */
  amazonMaxAgeMin?: number;
  /** Classe Amazon pausada (laço da coleta assistida parado). */
  amazonPaused?: boolean;
  /** PRICE_AMAZON_MODE desta avaliação (o chamador lê `getAmazonMode()`; este módulo é puro). Ausente = off: comportamento de sempre. */
  amazonMode?: AmazonMode;
  /** Gatilho ACHADO ligado (migration 0032 aplicada). Ausente = desligado: comportamento de sempre. */
  achado?: boolean;
  /** Gatilho N1 'Preço agora' (produto sem média elegível; dono 2026-11-13). Ausente/false = DESLIGADO: comportamento de sempre. */
  neutro?: boolean;
}

/** Janela de 6 h (fuso de São Paulo) para o dedup por oferta/gatilho. */
export function windowKey(now: Date): string {
  const ms = now.getTime() - 3 * 3600_000; // Brasil sem horário de verão: UTC-3 fixo
  const d = new Date(ms);
  const day = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `${day}-${d.getUTCHours()}`; // janela de 2 h (era 6 h): o canal fica movimentado e o mesmo produto pode voltar quando o preço mexe
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

/** Média única oferta-dia do produto com o mínimo do dono (>= 3 ofertas e 1 dia de série): base da régua de destaque. */
function mediaUnicaElegivel(p: { avg?: ProductFacts['avg'] }): boolean {
  return !!p.avg && p.avg.cents > 0 && p.avg.distinctOffers >= RULES.MED_MIN_OFFERS && p.avg.spanDays >= RULES.MED_MIN_SERIES_DAYS;
}

/**
 * Fase de formação POR PRODUTO. Nas lojas com a régua de destaque ligada (GROUP_REGUA_LOJAS), o produto que já tem média única oferta-dia
 * sai da formação e passa a ser julgado pela régua (corte, degraus e percentual sobre a MESMA média do selo); o produto sem média única
 * continua na formação (média simples, sem percentual). Desligar a chave devolve tudo ao comportamento anterior.
 */
export function formacaoDoProduto(p: Pick<ProductFacts, 'vertical'> & { avg?: ProductFacts['avg'] }, now: Date): boolean {
  if (!emFaseDeFormacao(p.vertical, now)) return false;
  return !(reguaDaLoja(p.vertical) && mediaUnicaElegivel(p));
}

/**
 * Régua efetiva de % abaixo da média: 10 (ou o valor do contexto). Lojas liberadas pela régua de destaque (GROUP_REGUA_PCT_MIN, ex.: 3)
 * usam o corte dela. Nas lojas que não são Games, ANTES da data de corte (formação), só o piso EARLY ("abaixo da média"), exceto o produto
 * que a régua assumiu (formacaoDoProduto). Games e, depois da data de corte, todas: régua cheia, sem deploy.
 */
export function effectiveMinBelow(p: Pick<ProductFacts, 'vertical'> & { avg?: ProductFacts['avg'] }, ctxMin: number | undefined, now: Date): number {
  const cfg = reguaConfig();
  const liberada = cfg.pctMin > 0 && cfg.lojas.has(p.vertical);
  const base = ctxMin ?? (liberada ? cfg.pctMin : RULES.MIN_BELOW_AVG_PCT);
  if (base > 0 && formacaoDoProduto(p, now)) return Math.min(base, RULES.EARLY_MIN_BELOW_AVG_PCT);
  return base;
}

/**
 * Régua de destaque da mensagem (regua.ts): só loja liberada, só mensagem de preço com média (modelos 'media' e 'movimento'), nunca Amazon
 * (a Amazon segue o texto e o frescor próprios). Devolve o veredito e os textos Telegram/WhatsApp; null = formato de sempre.
 */
function aplicarRegua(
  p: ProductFacts,
  input: GroupMessageInput,
  primary: OfferFact,
  avgCents: number | null,
  priceClass: MessageClass,
  cfg: ReturnType<typeof reguaConfig>,
  now: Date
): { info: ReguaInfo; telegram: string; whatsapp: string } | null {
  if (!(cfg.pctMin > 0 && cfg.lojas.has(p.vertical))) return null;
  if (input.model !== 'media' && input.model !== 'movimento') return null;
  if (priceClass !== 'alerta' && priceClass !== 'insight' && priceClass !== 'radar') return null;
  if (netKind(primary) === 'amazon' || !input.avg || input.avg.scope === 'own' || !avgCents || avgCents <= 0) return null;
  // Produto que continua na formação (sem média única): formato de sempre, sem percentual.
  if (formacaoDoProduto(p, now)) return null;
  const pct = ((avgCents - primary.priceCents) / avgCents) * 100;
  // Mínima registrada: menor preço diário medido nos últimos 90 dias ANTES de hoje (série ML/Shopee do estado diário), com os dias medidos.
  const serie = (p.series ?? []).filter((x) => x.minCents > 0).slice(-90);
  const minCents = serie.length ? Math.min(...serie.map((x) => x.minCents)) : null;
  // R-44: sem queda de 3% sobre a média, mas no menor preço já registrado (chave GROUP_REGUA_ELEGIVEL_MIN) = degrau 1 neutro.
  const viaMinima = cfg.elegivelMin && noMenorRegistrado(p.series, primary.priceCents, cfg.elegivelMinDias, spDayStr(now), cfg.elegivelMinAmplitudePct).ok;
  const v = calcularVeredito({ pct, nOfertas: input.avg.offers, precoCents: primary.priceCents, minCents, diasHistorico: serie.length, minDias: cfg.minDias, viaMinima });
  if (!v) return null;
  const msg = toMsgOffer(primary);
  const common = {
    veredito: v,
    titulo: ('title' in input && input.title ? input.title : input.name) as string,
    meta: 'meta' in input ? input.meta ?? null : null,
    precoCents: primary.priceCents,
    mediaCents: avgCents,
    loja: primary.networkName,
    plataforma: p.platformLabel,
    carimbo: withTag(stampLine(msg), input.adTag),
    marca: `Espaço Geek 86 · ${getSlogan()}`,
    faixa: cfg.minMaxOn ? faixaPreco(p.series, primary.priceCents, cfg.minMaxDias, spDayStr(now)) : null,
  };
  const link = buildGoLink(primary.slug, 'wa', input.messageKey);
  return { info: reguaInfoDe(v, common.faixa, viaMinima && degrauDaQueda(pct) == null), telegram: reguaTelegram(common), whatsapp: reguaWhatsapp({ ...common, link }) };
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
  let reguaInfo: ReguaInfo | undefined;
  try {
    rendered = buildGroupMessages(input);
    problems = rendered.problems;
    // Régua de destaque (loja liberada): troca o texto de preço pelo da régua e reaplica a barreira de termos a TODOS os textos.
    const rg = aplicarRegua(p, input, base.primary, base.avgCents, (base.cls ?? TRIGGER_CLASS[trigger]) as MessageClass, reguaConfig(), ctx.now);
    if (rg) {
      reguaInfo = rg.info;
      rendered = { telegram: rg.telegram, whatsapp: rg.whatsapp, problems: [] };
      problems = [...textProblems(rg.telegram, 'tg'), ...textProblems(rg.whatsapp, 'wa')];
    }
  } catch (e) {
    rendered = { telegram: '', whatsapp: '', problems: [] };
    problems = [e instanceof Error ? e.message : 'erro ao montar texto'];
  }
  // Régua de 10% (dono, 2026-11-11): mensagem de preço (alerta, insight, radar) só com preço >= 10% abaixo da média única.
  const priceClass = (base.cls ?? TRIGGER_CLASS[trigger]) as MessageClass;
  const belowAvgPct = base.avgCents != null && base.avgCents > 0 ? ((base.avgCents - base.primary.priceCents) / base.avgCents) * 100 : null;
  const minBelow = effectiveMinBelow(p, ctx.minBelowAvgPct, ctx.now);
  // R-44 (dono, 2026-11-12): UNIÃO com o corte de %: o preço no menor já registrado (série real, n suficiente) também é elegível. Chave GROUP_REGUA_ELEGIVEL_MIN.
  const rcfg = reguaConfig();
  const serieDoPreco = netKind(base.primary) === 'amazon' ? p.amazonSeries : p.series;
  const viaMinimo = rcfg.elegivelMin && noMenorRegistrado(serieDoPreco, base.primary.priceCents, rcfg.elegivelMinDias, spDayStr(ctx.now), rcfg.elegivelMinAmplitudePct).ok;
  const belowRule =
    trigger !== 'AC' && trigger !== 'N1' && !viaMinimo && minBelow > 0 && (priceClass === 'alerta' || priceClass === 'insight' || priceClass === 'radar') && (belowAvgPct == null || belowAvgPct < minBelow)
      ? `abaixo_da_media_menos_de_${minBelow}pct`
      : null;
  const notSendable =
    base.notSendable ?? belowRule ?? (problems.length ? `texto reprovado: ${problems.join('; ')}` : null) ?? null;
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
    tipo: p.tipo ?? null,
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
    ...(reguaInfo ? { regua: reguaInfo } : {}),
  };
}

export function toMsgOffer(o: OfferFact) {
  return { slug: o.slug, networkSlug: o.networkSlug, networkName: o.networkName, priceCents: o.priceCents, confirmedAt: o.confirmedAt as Date, seller: { reputation: o.sellerReputation, totalSales: o.sellerTotalSales }, affiliateUrl: o.affiliateUrl ?? null, storeName: o.storeName ?? null, freeShipping: o.freeShipping === true ? true : undefined, officialStore: o.officialStore ?? null, shopeeCampaignUrl: o.shopeeCampaignUrl ?? null };
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
  if (isOutOfLine(p)) {
    stop('G2', ['fora_de_linha_ou_retro']);
    return { candidates, blocked };
  }

  const verdicts = p.offers.map((o) => ({ o, v: judgeOffer(o, p, ctx.now, ctx.maxAgeMin) }));
  const usable = verdicts.filter((x) => x.v.kind !== 'block').sort((a, b) => a.o.priceCents - b.o.priceCents);
  const stores = countStores(p.offers.filter((o) => judgeOffer(o, p, ctx.now, ctx.maxAgeMin).kind !== 'block'));
  const median = medianOf(p.offers.filter((o) => netKind(o) !== 'amazon' && !o.avgExcluded).map((o) => o.priceCents));
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
    else if (pctBelow(holder.o.priceCents, avg.cents) < effectiveMinBelow(p, ctx.minBelowAvgPct, ctx.now)) stop('G1', ['abaixo_da_media_insuficiente']);
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
      if (raw < effectiveMinBelow(p, ctx.minBelowAvgPct, ctx.now)) stop('G2', [`abaixo_da_media_${raw.toFixed(1)}pct_menor_que_${effectiveMinBelow(p, ctx.minBelowAvgPct, ctx.now)}pct`]);
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
export function detectMovement(history: DayPoint[], currentCents: number, today: string, opts: { noMinimo?: boolean; minDiasSerie?: number; amplitudeMinPct?: number } = {}): MovementHit[] {
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
  } else if (opts.noMinimo && !hits.some((h) => h.kind === 'OK1') && pts.length >= (opts.minDiasSerie ?? RULES.MOVE_MIN_DAYS - 1) && currentCents <= ref && (opts.amplitudeMinPct == null || opts.amplitudeMinPct <= 0 || (Math.max(...pts.map((h) => h.minCents)) / ref - 1) * 100 >= opts.amplitudeMinPct)) {
    // R-44 (dono, 2026-11-12): preço NO menor já registrado (queda < 5% sobre ele, que não vira OK1) também é gatilho. nearPct 0 = "no menor registrado".
    hits.push(mk('T2', { prevCents: null, dropPct: 0, nearPct: 0 }));
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

/** Só produto NOVO e EM LINHA (dono, 2026-11-11): plataformas retrô e as que saíram de linha (Xbox One, Xbox 360, PS3 e anteriores, Wii, DS/3DS...) nunca vão para mensagem. */
const OUT_OF_LINE_PLATFORM = /\b(?:xbox one(?: [sx])?|xbox 360|ps ?[123]|playstation ?[123]|psp|ps vita|wii(?: u)?|3ds|2ds|nintendo ds|gamecube|n64|nintendo 64|snes|game ?boy|mega ?drive|dreamcast)\b/i;
/** PS4 como APARELHO saiu de linha (dono, 2026-11-14); jogos de PS4 seguem (ainda vendem novos). */
const OUT_OF_LINE_CONSOLE_ONLY = /(?:ps ?4|playstation ?4)/i;
export function isOutOfLine(p: Pick<ProductFacts, 'vertical' | 'platformLabel'> & { productType?: string | null }): boolean {
  if (p.vertical !== 'games') return false;
  if (OUT_OF_LINE_PLATFORM.test(p.platformLabel ?? '')) return true;
  return p.productType === 'console' && OUT_OF_LINE_CONSOLE_ONLY.test(p.platformLabel ?? '');
}

function scopeBlock(p: ProductFacts): string | null {
  if (isOutOfLine(p)) return 'fora_de_linha_ou_retro';
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
      return (m.nearPct ?? 0) <= 0 ? `No menor valor registrado (${fmtBRL(m.refCents)}; ${m.seriesDays} dias de série).` : `A ${pct(m.nearPct ?? 0)}% acima do menor valor registrado (${fmtBRL(m.refCents)}), sem bater o piso.`;
  }
}

/**
 * Avalia UM produto na política v2: gatilhos por movimento (OK1, OK2, T1, T2) para ML/Shopee e, em separado, para a
 * Amazon (só contra o histórico dela mesma), mais G3/G5/G6 do avaliador legado. G1/G2 (que exigiam média elegível) saem.
 * Classe: OK1 e OK2 >= 8% = alerta; OK2 entre 5% e 8%, T1 e T2 = radar. Amazon só em alerta.
 */
export function evaluateProductV2(p: ProductFacts, ctx: EvalContext): { candidates: Candidate[]; blocked: Blocked[] } {
  const r = evaluateProductV2Prices(p, ctx);
  // Gatilho CUPOM: independente dos de preco (a mensagem de preco continua usando a oferta mais barata).
  if (p.coupons?.length || p.couponMisses?.length) {
    const c = evaluateCoupon(p, ctx);
    r.candidates.push(...c.candidates);
    r.blocked.push(...c.blocked);
  }
  return r;
}

/**
 * CUPOM ATIVO por oferta (dono, 2026-11-12). Entre as ofertas do produto com cupom aprovado na agulha escolhe a de MAIOR desconto em
 * reais (empate: menor preco final) e gera UMA mensagem 'Cupom ativo' com o preco final DAQUELA oferta. Revalida aqui (pura) o que a
 * agulha ja conferiu: leitura <= 120 min, validade, preco do anuncio igual ao da leitura, com cupom < sem cupom; e passa a oferta pelo
 * mesmo juiz das mensagens de preco (link oficial, frescor, identidade, reputacao). Amazon fica fora (carimbo e regras proprias).
 * Nao compara com media e nao alega "menor preco": por isso a regua de 10% nao se aplica a esta classe.
 */
/** Kill-switch do cupom da Amazon no gatilho CUPOM: GROUP_CUPOM_AMAZON=off. */
export function cupomAmazonLigado(env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}): boolean {
  return (env.GROUP_CUPOM_AMAZON ?? '').toLowerCase() !== 'off';
}

export function evaluateCoupon(p: ProductFacts, ctx: EvalContext): { candidates: Candidate[]; blocked: Blocked[] } {
  const candidates: Candidate[] = [];
  const blocked: Blocked[] = [];
  const nm = nameOf(p);
  const stop = (reasons: string[], offerId?: string) =>
    blocked.push({ masterProductId: p.masterProductId, name: nm, trigger: 'CUPOM', reasons: ['cupom', ...(offerId ? [`oferta:${offerId.slice(0, 8)}`] : []), ...reasons] });
  for (const m of p.couponMisses ?? []) stop([`agulha:${m.reason}`], m.offerId);
  const facts = p.coupons ?? [];
  if (!facts.length) return { candidates, blocked };
  const sb = scopeBlock(p);
  if (sb) {
    stop([sb]);
    return { candidates, blocked };
  }
  if (!RELEASED_VERTICALS.includes(p.vertical)) {
    stop(['departamento_em_review_nao_liberado_no_go']);
    return { candidates, blocked };
  }
  const nowMs = ctx.now.getTime();
  const formacao = emFaseDeFormacao(p.vertical, ctx.now);
  // Amazon entra no gatilho CUPOM (dono, 2026-11-12: promoções lidas em amazon-promocoes). Mesmas travas de frescor/readmissão/laço parado do juízo da Amazon;
  // GROUP_CUPOM_AMAZON=off a devolve ao estado anterior. A mediana de referência segue sem a Amazon.
  const amazonCupom = cupomAmazonLigado();
  const jopts: JudgeOptions = { allowAmazon: amazonCupom, amazonMaxAgeMin: ctx.amazonMaxAgeMin, amazonPaused: ctx.amazonPaused };
  const median = medianOf(p.offers.filter((o) => netKind(o) !== 'amazon' && !o.avgExcluded).map((o) => o.priceCents));
  const oks: Array<{ cf: CouponOfferFact; o: OfferFact; v: OfferVerdict }> = [];
  for (const cf of facts) {
    const o = p.offers.find((x) => x.offerId === cf.offerId);
    if (!o) {
      stop(['oferta_do_cupom_fora_das_ofertas_vivas'], cf.offerId);
      continue;
    }
    if (netKind(o) === 'amazon' && !amazonCupom) {
      stop(['amazon_fora_do_gatilho_cupom'], cf.offerId);
      continue;
    }
    if (formacao && o.identidade === 'incerta') {
      stop(['identidade_incerta'], cf.offerId);
      continue;
    }
    const v = judgeOffer(o, p, ctx.now, ctx.maxAgeMin, jopts);
    if (v.kind === 'block') {
      stop(v.reasons, cf.offerId);
      continue;
    }
    const ageMin = (nowMs - cf.readAt.getTime()) / 60_000;
    if (ageMin < -5) stop(['cupom_leitura_no_futuro'], cf.offerId);
    else if (ageMin > AGULHA.ITEM_FRESH_MIN) stop([`cupom_leitura_antiga_${Math.round(ageMin)}min`], cf.offerId);
    else if (cf.expiresAt && cf.expiresAt.getTime() - nowMs < AGULHA.EXPIRY_MARGIN_MIN * 60_000) stop(['cupom_validade_proxima_do_fim'], cf.offerId);
    else if (Math.abs(o.priceCents - cf.offerPriceCents) > AGULHA.PRICE_TOLERANCE_CENTS) stop(['preco_do_anuncio_mudou_apos_a_leitura'], cf.offerId);
    else if (!(cf.finalCents > 0 && cf.finalCents < o.priceCents)) stop(['preco_com_cupom_nao_menor_que_sem_cupom'], cf.offerId);
    else if (cf.pct > AGULHA.MAX_PLAUSIBLE_DISCOUNT_PCT) stop(['desconto_implausivel'], cf.offerId);
    else oks.push({ cf, o, v });
  }
  if (!oks.length) return { candidates, blocked };
  oks.sort((a, b) => b.cf.offCents - a.cf.offCents || a.cf.finalCents - b.cf.finalCents || a.cf.offerId.localeCompare(b.cf.offerId));
  const { cf, o, v } = oks[0];
  const held: string[] = [];
  const review = [...v.reasons];
  if (median && cf.finalCents < median * RULES.REVIEW_BELOW_MEDIAN_RATIO) held.push('preco_com_cupom_abaixo_de_035x_a_mediana_das_ofertas');
  else if (cf.pct > RULES.REVIEW_ABOVE_BELOW_AVG_PCT) review.push(`cupom_acima_de_${RULES.REVIEW_ABOVE_BELOW_AVG_PCT}pct`);
  // Transparencia: outra oferta VALIDA do produto, sem cupom, que fica abaixo do preco final do cupom.
  const cheaper = p.offers
    .filter((x) => x.offerId !== o.offerId && netKind(x) !== 'amazon' && !x.avgExcluded && x.priceCents < cf.finalCents && judgeOffer(x, p, ctx.now, ctx.maxAgeMin, jopts).kind !== 'block')
    .sort((a, b) => a.priceCents - b.priceCents)[0];
  const parts = displayParts(p);
  const messageKey = makeMessageKey('CUPOM', `${p.masterProductId}:CUPOM:${o.offerId}:${windowKey(ctx.now)}`, ctx.now);
  const input: GroupMessageInput = {
    vertical: p.vertical,
    adTag: ctx.adTag,
    messageKey,
    model: 'cupom',
    name: nm,
    title: parts.title,
    meta: parts.meta,
    offer: toMsgOffer(o),
    coupon: { name: cf.name, offCents: cf.offCents, pct: cf.pct, finalCents: cf.finalCents, minOrderCents: cf.minOrderCents, maxDiscountCents: cf.maxDiscountCents, ruleKnown: cf.ruleKnown, activation: cf.activation, code: cf.code ?? null, howTo: cf.howTo, named: cf.named, readAt: cf.readAt, expiresAt: cf.expiresAt },
    cheaperOther: cheaper ? { cents: cheaper.priceCents, networkName: cheaper.networkName } : null,
  };
  const cand = finish(p, 'CUPOM', input, {
    offerIds: [o.offerId],
    primary: o,
    reason: `Cupom ativo '${cf.name}' lido na página do anúncio: ${fmtBRL(cf.finalCents)} com o cupom (${fmtBRL(cf.offCents)} de desconto sobre ${fmtBRL(o.priceCents)}).`,
    avgCents: null,
    belowPct: null,
    dropPct: null,
    reviewReasons: review,
    held,
    cls: 'cupom',
    moveScore: cf.pct,
    dedupSuffix: windowKey(ctx.now) + 'cup',
  }, ctx);
  candidates.push({
    ...cand,
    couponRef: cf.couponRef,
    couponFinalCents: cf.finalCents,
    couponName: cf.name,
    couponInfo: { code: cf.name, typedCode: cf.code ?? null, unnamed: cf.named === false, conditions: cf.conditions, expiresAt: cf.expiresAt ? cf.expiresAt.toISOString() : null, verifiedAt: cf.readAt.toISOString(), couponRef: cf.couponRef, annKind: 'anuncio' },
  });
  return { candidates, blocked };
}

function evaluateProductV2Prices(p: ProductFacts, ctx: EvalContext): { candidates: Candidate[]; blocked: Blocked[] } {
  const legacy = evaluateProduct(p, ctx);
  const candidates = legacy.candidates.filter((c) => c.trigger !== 'G1' && c.trigger !== 'G2').map(legacyRisk);
  const blocked = legacy.blocked.filter((b) => b.trigger !== 'G1' && (b.trigger !== 'G2' || SCOPE_BLOCK_RE.test(b.reasons[0] ?? '')));
  if (scopeBlock(p)) return { candidates, blocked };

  const nm = nameOf(p);
  const today = spDayStr(ctx.now);
  const jopts: JudgeOptions = { allowAmazon: true, amazonMaxAgeMin: ctx.amazonMaxAgeMin, amazonPaused: ctx.amazonPaused };
  // FASE DE FORMAÇÃO (dono, 2026-11-11; fase-formacao.ts): lojas que não são games, antes da data de corte.
  const formacao = formacaoDoProduto(p, ctx.now);
  // Identidade 'incerta' (fila de classificação): na formação o item sai de tudo (média simples, preço mais baixo, escolha da oferta) até ser resolvido.
  const verdicts = p.offers
    .filter((o) => !o.avgExcluded && !(formacao && o.identidade === 'incerta'))
    .map((o) => ({ o, v: judgeOffer(o, p, ctx.now, ctx.maxAgeMin, jopts) }));
  const stores = countStores(verdicts.filter((x) => x.v.kind !== 'block').map((x) => x.o));
  const minStores = formacao ? minLojas(p.vertical, ctx.now, RULES.MIN_STORES) : RULES.MIN_STORES;
  const median = medianOf(p.offers.filter((o) => netKind(o) !== 'amazon' && !o.avgExcluded).map((o) => o.priceCents));
  // Média do V2. Games e depois da corte: a mesma do selo (oferta-dia), com o critério do dono (>= 3 ofertas e >= 1 dia de série medida).
  // Formação: MÉDIA SIMPLES das ofertas ativas (uma por oferta; sem série, sem 14 dias), sem Amazon, sem condição/região/edição
  // diferente no título (Open Box fora) e sem identidade incerta; mínimo de 3 ofertas dentro da faixa de plausibilidade.
  let avg: ProductFacts['avg'] = p.avg && p.avg.cents > 0 && p.avg.distinctOffers >= RULES.MED_MIN_OFFERS && p.avg.spanDays >= RULES.MED_MIN_SERIES_DAYS ? p.avg : null;
  if (formacao) {
    const base = p.offers.filter((o) => netKind(o) !== 'amazon' && netKind(o) !== 'other' && !o.quarantined && !o.avgExcluded && o.priceCents > 0 && o.identidade !== 'incerta' && titleIdentityBlock(o.title, p.masterName) == null);
    const ms = mediaSimples(base.map((o) => o.priceCents));
    avg = ms ? { cents: ms.cents, distinctOffers: ms.ofertas, offerDays: ms.ofertas, spanDays: 0, eligible: false } : null;
  }
  const released = RELEASED_VERTICALS.includes(p.vertical);
  const beforeMain = candidates.length;

  for (const isAmz of [false, true]) {
    const series = isAmz ? p.amazonSeries : p.series;
    const pool = verdicts.filter((x) => (netKind(x.o) === 'amazon') === isAmz).sort((a, b) => a.o.priceCents - b.o.priceCents);
    if (!pool.length) continue;
    const cheapest = pool[0];
    const hits = series?.length ? detectMovement(series, cheapest.o.priceCents, today, { noMinimo: reguaConfig().elegivelMin, minDiasSerie: reguaConfig().elegivelMinDias, amplitudeMinPct: reguaConfig().elegivelMinAmplitudePct }) : [];
    // Dono (2026-11-11): "preços na média ou abaixo da média" é gatilho; novo mínimo (OK1) e queda do dia (OK2) têm prioridade.
    // PRICE_AMAZON_MODE off/shadow: a Amazon não entra em "na média" (só se compara com o próprio histórico e segue só em alerta).
    // on (games): a média única inclui a Amazon, e "na média" deixa de excluí-la (ADR 0010).
    const amzIn = isAmz && amazonCountsIn(ctx.amazonMode ?? 'off', p.vertical);
    const strong = hits[0] && (hits[0].kind === 'OK1' || hits[0].kind === 'OK2');
    const medOk = (!isAmz || amzIn) && !strong && !!avg && cheapest.o.priceCents <= avg.cents;
    if (!hits.length && !medOk) continue;
    const stop = (reasons: string[]) => blocked.push({ masterProductId: p.masterProductId, name: nm, trigger: medOk ? 'G2' : hits[0].kind, reasons: [isAmz ? 'amazon' : 'mercado', ...reasons] });
    const holder = pool.find((x) => x.v.kind !== 'block');
    if (!holder || holder.o.offerId !== cheapest.o.offerId) {
      stop(['a_oferta_mais_barata_nao_passa_nos_filtros', ...cheapest.v.reasons]);
      continue;
    }
    // Amazon-only (PRICE_AMAZON_MODE=on): o produto não tem outra loja; a régua é a do próprio ASIN, então o piso de 3 lojas não se aplica.
    if (stores < minStores && !(amzIn && p.amazonOnly)) {
      stop([`lojas_${stores}_abaixo_de_${minStores}`]);
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
        avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers, ...(amzIn ? { scope: p.amazonOnly ? ('amazon' as const) : ('market' as const) } : {}) },
        seriesDays: formacao ? Math.max(1, (series?.length ?? 0) + 1) : avg.spanDays, // formação: dias reais medidos do produto (a média simples não tem série)
        refCents,
        sinceDay: series?.[0]?.day ?? daysBefore(today, Math.max(0, avg.spanDays - 1)),
        ind: priceIndicators(series, o.priceCents),
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
    // Amazon (modo on): a referência é a média única (ou, produto só na Amazon, a mediana de 14 dias do próprio ASIN). Nos demais modos, sem referência.
    const aref = isAmz ? amazonReference(p, o, avg, ctx.amazonMode) : null;
    const risk = riskAssess(o.priceCents, isAmz ? (aref?.cents ?? null) : (avg?.cents ?? null), hit.kind === 'T2' ? null : hit.dropPct, median);
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
    const avgIn = isAmz
      ? aref
        ? { cents: Math.round(aref.cents), offers: aref.offers, scope: aref.scope, ...(aref.ownDays ? { days: aref.ownDays } : {}) }
        : null
      : avg
        ? { cents: Math.round(avg.cents), offers: avg.distinctOffers }
        : null;
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
      ind: isAmz ? null : priceIndicators(series, o.priceCents),
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
  // ---------------- ACHADO (ata 2026-11-12-diversidade-fluxo-plus) ----------------
  // Preco atual CONFIRMADO de produto que nao gerou mensagem de preco (1 vendedor, sem media, sem movimento). NUNCA compara com media nem
  // alega desconto. Exige: oferta valida (link oficial, frescor, identidade, reputacao), preco dentro da faixa do TIPO (amostra >= 5 masters),
  // coerente com o historico proprio (quando ha >= 3 dias) e plausivel contra as ofertas. Loja que nao e games, ML/Shopee (Amazon fora).
  if (ctx.achado && (p.vertical !== 'games' || p.semMedia === true) && released && !candidates.slice(beforeMain).some((c) => c.sendable)) {
    const acStop = (reasons: string[]) => blocked.push({ masterProductId: p.masterProductId, name: nm, trigger: 'AC', reasons: ['achado', ...reasons] });
    const OK_BLOCK = (r: string) => r === 'link_pendente' || r.startsWith('vendedor_reputacao_') || r === 'preco_nao_reconfirmado_em_15min';
    // Ofertas VIVAS e reais (podem nao ter link): servem para dizer se a citada e a menor e para o teto de 3% acima da mais barata.
    const comparable = verdicts
      .filter((x) => (netKind(x.o) === 'ml' || netKind(x.o) === 'shopee') && (x.v.kind !== 'block' || x.v.reasons.every(OK_BLOCK)))
      .sort((a, b) => a.o.priceCents - b.o.priceCents);
    const holderAc = comparable.find((x) => x.v.kind !== 'block');
    if (!holderAc) {
      acStop([comparable.length ? 'nenhuma_oferta_valida_com_link' : 'sem_oferta_ml_ou_shopee_valida', ...(comparable[0]?.v.reasons ?? [])]);
    } else {
      const o = holderAc.o;
      const price = o.priceCents;
      const cheapest = comparable[0];
      const aboveCheapest = ((price - cheapest.o.priceCents) / cheapest.o.priceCents) * 100;
      const why: string[] = [];
      if (aboveCheapest > RULES.ACHADO_FALLBACK_MAX_ABOVE_PCT) why.push(`mais_barata_sem_link_${Math.round(aboveCheapest)}pct_abaixo`);
      if (o.identidade === 'incerta') why.push('identidade_incerta');
      if (p.vertical === 'games') {
        // Games: sem tipo; a faixa e a da plataforma (jogo sem media: preco sentinela ou kit nao pode passar).
        if (!p.platMedianCents || (p.platSample ?? 0) < RULES.ACHADO_GAMES_PLAT_MIN_SAMPLE) why.push(`amostra_da_plataforma_menor_que_${RULES.ACHADO_GAMES_PLAT_MIN_SAMPLE}`);
        else {
          const ratio = price / p.platMedianCents;
          if (ratio < RULES.ACHADO_GAMES_RATIO_MIN) why.push('preco_abaixo_de_025x_a_mediana_da_plataforma');
          else if (ratio > RULES.ACHADO_GAMES_RATIO_MAX) why.push('preco_acima_de_4x_a_mediana_da_plataforma');
        }
      } else if (!p.tipo || p.tipo === 'outros') why.push('tipo_nao_classificado');
      else if (!p.tipoMedianCents || (p.tipoSample ?? 0) < RULES.ACHADO_TIPO_MIN_SAMPLE) why.push(`amostra_do_tipo_menor_que_${RULES.ACHADO_TIPO_MIN_SAMPLE}`);
      else {
        const ratio = price / p.tipoMedianCents;
        if (ratio < RULES.ACHADO_TIPO_RATIO_MIN) why.push('preco_abaixo_de_05x_a_mediana_do_tipo');
        else if (ratio > RULES.ACHADO_TIPO_RATIO_MAX) why.push('preco_acima_de_25x_a_mediana_do_tipo');
      }
      const ownDays = (p.series ?? []).filter((x) => x.minCents > 0);
      if (ownDays.length >= RULES.ACHADO_OWN_MIN_DAYS) {
        const own = medianOf(ownDays.map((x) => x.minCents)) as number;
        if (price > own * RULES.ACHADO_OWN_MAX_RATIO) why.push('acima_de_110pct_do_historico_proprio');
        else if (price < own * RULES.ACHADO_OWN_MIN_RATIO) why.push('abaixo_de_05x_do_historico_proprio');
      }
      const risk = riskAssess(price, null, null, median);
      why.push(...risk.review, ...risk.held);
      if (why.length) acStop(why);
      else {
        const parts = displayParts(p);
        const messageKey = makeMessageKey('AC', `${p.masterProductId}:AC:${o.offerId}:${windowKey(ctx.now)}`, ctx.now);
        const isLowest = price <= cheapest.o.priceCents;
        const input: GroupMessageInput = {
          vertical: p.vertical,
          adTag: ctx.adTag,
          messageKey,
          model: 'achado',
          name: nm,
          title: parts.title,
          meta: parts.meta,
          offer: toMsgOffer(o),
          offersCount: comparable.length,
          isLowest,
        };
        candidates.push(
          finish(p, 'AC', input, {
            offerIds: [o.offerId],
            primary: o,
            reason: `Achado: preço atual confirmado de ${fmtBRL(price)} (${comparable.length} oferta(s) ativa(s) acompanhada(s); sem média de referência).`,
            avgCents: null,
            belowPct: null,
            dropPct: null,
            reviewReasons: holderAc.v.reasons,
            cls: 'insight',
            moveScore: 0,
            dedupSuffix: windowKey(ctx.now) + 'ac',
          }, ctx)
        );
      }
    }
  }
  // ---------------- N1 'PREÇO AGORA' (dono, 2026-11-13) ----------------
  // Produto SEM média elegível (sem base de preço): mensagem NEUTRA com preço, loja e horário da leitura. NUNCA queda, média, "menor preço" ou selo.
  // Só com ctx.neutro (flag GROUP_NEUTRO_SEM_BASE, desligada por padrão). Só quando o produto passou em TUDO (porteiro, plataforma e fora de linha em
  // scopeBlock; oferta válida em judgeOffer: link, frescor, identidade, vendedor) e NENHUM outro gatilho de preço do produto está enviável.
  // Régua de degraus e G1/G2 seguem exclusivos de produto COM base.
  if (ctx.neutro && released && !(p.avg && p.avg.eligible && p.avg.cents > 0) && !candidates.some((c) => c.sendable && c.trigger !== 'G4')) {
    const n1Stop = (reasons: string[]) => blocked.push({ masterProductId: p.masterProductId, name: nm, trigger: 'N1', reasons: ['preco_agora', ...reasons] });
    const comparable = verdicts.filter((x) => (netKind(x.o) === 'ml' || netKind(x.o) === 'shopee') && x.v.kind !== 'block').sort((a, b) => a.o.priceCents - b.o.priceCents);
    const holder = comparable[0];
    if (!holder) n1Stop(['sem_oferta_ml_ou_shopee_valida']);
    else {
      const o = holder.o;
      const price = o.priceCents;
      const why: string[] = [];
      if (o.identidade === 'incerta') why.push('identidade_incerta');
      // Referência de plausibilidade (sem ela um preço sentinela passaria): faixa do tipo/plataforma, histórico próprio (>= 3 dias) ou >= 3 ofertas.
      let ref = false;
      if (p.vertical === 'games') {
        if (p.platMedianCents && (p.platSample ?? 0) >= RULES.ACHADO_GAMES_PLAT_MIN_SAMPLE) {
          ref = true;
          const ratio = price / p.platMedianCents;
          if (ratio < RULES.ACHADO_GAMES_RATIO_MIN || ratio > RULES.ACHADO_GAMES_RATIO_MAX) why.push('preco_fora_da_faixa_da_plataforma');
        }
      } else if (p.tipo && p.tipo !== 'outros' && p.tipoMedianCents && (p.tipoSample ?? 0) >= RULES.ACHADO_TIPO_MIN_SAMPLE) {
        ref = true;
        const ratio = price / p.tipoMedianCents;
        if (ratio < RULES.ACHADO_TIPO_RATIO_MIN || ratio > RULES.ACHADO_TIPO_RATIO_MAX) why.push('preco_fora_da_faixa_do_tipo');
      }
      const ownDays = (p.series ?? []).filter((x) => x.minCents > 0);
      if (ownDays.length >= RULES.ACHADO_OWN_MIN_DAYS) {
        ref = true;
        const own = medianOf(ownDays.map((x) => x.minCents)) as number;
        if (price > own * RULES.ACHADO_OWN_MAX_RATIO || price < own * RULES.ACHADO_OWN_MIN_RATIO) why.push('preco_fora_do_historico_proprio');
      }
      if (comparable.length >= 3) ref = true;
      if (!ref) why.push('sem_referencia_de_plausibilidade');
      const risk = riskAssess(price, null, null, median);
      why.push(...risk.review, ...risk.held);
      if (why.length) n1Stop(why);
      else {
        const parts = displayParts(p);
        const messageKey = makeMessageKey('N1', `${p.masterProductId}:N1:${o.offerId}:${windowKey(ctx.now)}`, ctx.now);
        const input: GroupMessageInput = { vertical: p.vertical, adTag: ctx.adTag, messageKey, model: 'preco-agora', name: nm, title: parts.title, meta: parts.meta, offer: toMsgOffer(o) };
        candidates.push(
          finish(p, 'N1', input, {
            offerIds: [o.offerId],
            primary: o,
            reason: `Preço agora (sem base de preço): ${fmtBRL(price)} ${o.networkName}, leitura de ${(o.confirmedAt ?? ctx.now).toISOString()}. Não compara, não alega queda nem média.`,
            avgCents: null,
            belowPct: null,
            dropPct: null,
            reviewReasons: holder.v.reasons,
            cls: 'insight',
            moveScore: 0,
            dedupSuffix: windowKey(ctx.now) + 'n1',
          }, ctx)
        );
      }
    }
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
  /** Tipo do produto (cota de diversidade). */
  tipo?: string | null;
  /** Oferta cujo cupom foi divulgado nesta mensagem (mensagem de cupom OU mensagem de preco com bloco de cupom). */
  couponOfferId?: string | null;
  /** Degrau da régua (1 a 5) da mensagem enviada, quando houve (candidate.regua.degrau). */
  degrau?: number | null;
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

/** Cooldown do mesmo produto (R-47): horas. Ausente = padrão (RULES.MASTER_COOLDOWN_H); '0'/'off'/'false' = desligado (comportamento anterior). */
export function masterCooldownHours(env: Record<string, string | undefined> = process.env): number {
  const raw = env.GROUP_MASTER_COOLDOWN_H?.trim();
  if (!raw) return RULES.MASTER_COOLDOWN_H;
  if (/^(off|false|0)$/i.test(raw)) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 72 ? n : RULES.MASTER_COOLDOWN_H;
}

/** Cota por tipo vale também para alertas G2/OK2 (R-47b). GROUP_TIPO_COTA_ALERTA=off volta a isentar todo alerta. */
export function tipoCotaAlertaOn(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(off|false|0)$/i.test(env.GROUP_TIPO_COTA_ALERTA?.trim() ?? '');
}

/** Teto horário por tipo e loja (R-47b). GROUP_TIPO_POR_HORA: inteiro 1 a 60; 0/off = sem teto; ausente = RULES.TIPO_MAX_PER_HOUR. */
export function tipoPorHora(env: Record<string, string | undefined> = process.env): number {
  const raw = env.GROUP_TIPO_POR_HORA?.trim();
  if (!raw) return RULES.TIPO_MAX_PER_HOUR;
  if (/^(off|false|0)$/i.test(raw)) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : RULES.TIPO_MAX_PER_HOUR;
}

/**
 * Cooldown único por produto entre TODOS os gatilhos (dono, 2026-11-13: o mesmo produto saiu em duas mensagens seguidas, CUPOM e Boa compra).
 * O mesmo master só volta depois de masterCooldownHours (padrão 8 h), qualquer que seja o gatilho do envio anterior. Exceções (mudança material,
 * sempre contra o ÚLTIMO envio do produto): (1) cupom NOVO (referência ainda não divulgada em nenhuma mensagem do produto na janela), depois de 1 h;
 * (2) queda adicional de pelo menos MASTER_COOLDOWN_QUEDA_PCT sobre o preço enviado, depois de 2 h; (3) degrau da régua MAIS FORTE que o enviado, depois
 * de 2 h. A mensagem de preço já incorpora o cupom válido (bloco de cupom no envio), então o par CUPOM + preço do mesmo produto vira UMA mensagem.
 * Plataforma, resumo (G4) e radar composto ficam fora (não têm produto único).
 */
export function masterCooldownBlock(
  c: Pick<Candidate, 'masterProductId' | 'priceCents' | 'trigger' | 'offerIds' | 'couponRef' | 'regua'> & { cls?: MessageClass },
  history: SentRecord[],
  now: Date,
  hours: number = masterCooldownHours()
): string | null {
  if (!(hours > 0) || !c.masterProductId || c.trigger === 'G4' || c.trigger === 'RADAR' || c.cls === 'plataforma') return null;
  const winMs = hours * 3600_000;
  const mine = history.filter((h) => h.masterProductId === c.masterProductId && h.cls !== 'plataforma' && h.sentAt.getTime() <= now.getTime() + 5_000 && now.getTime() - h.sentAt.getTime() < winMs);
  if (!mine.length) return null;
  const prior = mine.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  const sinceMin = (now.getTime() - prior.sentAt.getTime()) / 60_000;
  if (c.trigger === 'CUPOM') {
    const ref = c.couponRef ?? c.offerIds[0];
    if (!mine.some((h) => h.couponOfferId && h.couponOfferId === ref) && sinceMin >= RULES.CUPOM_PRODUCT_GAP_MIN) return null;
  }
  const pct = Number(process.env.GROUP_MASTER_COOLDOWN_QUEDA_PCT);
  const minDrop = Number.isFinite(pct) && pct > 0 ? pct : RULES.MASTER_COOLDOWN_QUEDA_PCT;
  // Novo menor preço registrado (G1/OK1) já tinha a exceção de 30 min (NEW_MIN_REPEAT_MIN) com preço menor que o enviado; ela continua, agora exigindo a queda mínima.
  const dropMin = c.trigger === 'G1' || c.trigger === 'OK1' ? RULES.NEW_MIN_REPEAT_MIN : RULES.MASTER_COOLDOWN_EXC_MIN;
  if (sinceMin >= dropMin && prior.priceCents > 0 && c.priceCents > 0 && c.priceCents <= prior.priceCents * (1 - minDrop / 100)) return null;
  if (sinceMin >= RULES.MASTER_COOLDOWN_EXC_MIN && c.regua?.degrau != null && prior.degrau != null && c.regua.degrau > prior.degrau) return null;
  return `produto_em_cooldown_${hours}h_ultimo_envio_ha_${Math.floor(sinceMin)}min_${prior.trigger ?? 'x'}`;
}

/**
 * Duplicata do produto (dono, 2026-11-11): o mesmo produto só repete depois de 1 h. Exceção: novo mínimo (OK1/G1) com preço
 * MENOR que o do último envio pode repetir depois de 30 min.
 */
export function productDedupBlock(
  c: Pick<Candidate, 'masterProductId' | 'priceCents' | 'trigger'> & { cls?: MessageClass },
  history: SentRecord[],
  now: Date
): string | null {
  if (!c.masterProductId) return null;
  const isCupom = c.trigger === 'CUPOM';
  const gapMs = isCupom ? RULES.CUPOM_PRODUCT_GAP_MIN * 60_000 : (c.trigger === 'AC' || c.trigger === 'N1') ? RULES.ACHADO_PRODUCT_GAP_HOURS * 3600_000 : RULES.PRODUCT_GAP_MIN * 60_000;
  // Mensagem de cupom e mensagem de preco do mesmo produto sao independentes: cada uma so conta o proprio tipo (cupom x nao-cupom).
  const prior = history
    .filter((h) => h.masterProductId === c.masterProductId && (h.trigger === 'CUPOM') === isCupom && now.getTime() - h.sentAt.getTime() < gapMs)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  if (!prior) return null;
  const minSince = (now.getTime() - prior.sentAt.getTime()) / 60_000;
  if (isCupom) return `cupom_produto_ja_enviado_ha_${Math.floor(minSince)}min`;
  if ((c.trigger === 'G1' || c.trigger === 'OK1') && c.priceCents < prior.priceCents && minSince >= RULES.NEW_MIN_REPEAT_MIN) return null;
  return c.trigger === 'AC' || c.trigger === 'N1' ? `achado_produto_ja_enviado_ha_${Math.floor(minSince / 60)}h` : `produto_ja_enviado_ha_${Math.floor(minSince)}min`;
}

/** Mesmo cupom (mesma oferta/leitura) ja divulgado ha menos de 1 h, em mensagem de cupom OU de preco com bloco de cupom. null = pode. */
export function cupomDedupBlock(c: Pick<Candidate, 'trigger' | 'offerIds' | 'couponRef'>, history: SentRecord[], now: Date): string | null {
  if (c.trigger !== 'CUPOM') return null;
  const ref = c.couponRef ?? c.offerIds[0];
  const gapMs = RULES.CUPOM_COUPON_GAP_MIN * 60_000;
  const hit = history.filter((h) => !h.itemOnly && h.couponOfferId && h.couponOfferId === ref && now.getTime() - h.sentAt.getTime() < gapMs).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  return hit ? `cupom_ja_divulgado_ha_${Math.floor((now.getTime() - hit.sentAt.getTime()) / 60_000)}min` : null;
}

/** Cota de cupom por loja: no maximo CUPOM_MAX_PER_HOUR_STORE mensagens de cupom por hora na loja. null = pode. */
export function cupomQuotaBlock(vertical: string, history: SentRecord[], now: Date): string | null {
  const n = history.filter((h) => !h.itemOnly && h.trigger === 'CUPOM' && (h.vertical ?? '') === (vertical ?? '') && now.getTime() - h.sentAt.getTime() < 3600_000 && h.sentAt.getTime() <= now.getTime() + 5_000).length;
  return n >= RULES.CUPOM_MAX_PER_HOUR_STORE ? `cupom_maximo_${RULES.CUPOM_MAX_PER_HOUR_STORE}_por_hora_na_loja` : null;
}

/** Parcela das mensagens da loja (24 h) que sao de cupom, e o total. */
export function cupomShare(vertical: string, history: SentRecord[], now: Date): { count: number; total: number; pct: number } {
  const recs = storeLast24h(history, vertical, now);
  const n = recs.filter((h) => h.trigger === 'CUPOM').length;
  return { count: n, total: recs.length, pct: recs.length ? (n / recs.length) * 100 : 0 };
}

const TRIGGER_RANK: Record<Trigger, number> = { G1: 0, OK1: 0, G2: 1, OK2: 1, T1: 2, T2: 3, G3: 4, G4: 5, G5: 6, G6: 7, RADAR: 8, CUPOM: 9, P1: 10, P2: 11, P3: 12, P4: 13, P5: 14, AC: 15, N1: 16 };
/** Prioridade: alerta > resumo > CUPOM > insight (achado incluso) > radar > plataforma. Dono, 2026-11-12: cupom ativo e prioridade ALTA, acima de insight/achado. */
const CLASS_RANK: Record<MessageClass, number> = { alerta: 0, resumo: 1, cupom: 2, insight: 3, radar: 4, plataforma: 5 };

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

/** Mensagens da loja (um chat por departamento) nas ultimas 24 h, sem plataforma e sem itens de radar. */
function storeLast24h(history: SentRecord[], vertical: string, now: Date): SentRecord[] {
  return history.filter((h) => !h.itemOnly && h.cls !== 'plataforma' && (h.vertical ?? '') === (vertical ?? '') && now.getTime() - h.sentAt.getTime() < 24 * 3600_000 && h.sentAt.getTime() <= now.getTime() + 5_000);
}

/**
 * Cota do ACHADO por loja: no maximo 2 por hora e, em 24 h, max(3, 25% das mensagens da loja) (achados <= nao-achados / 3).
 * null = pode enviar.
 */
/** Teto de Achados por hora e por grupo: GROUP_AC_POR_HORA (inteiro 1 a 60), padrão 6 (era 2). */
export function achadoPorHora(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.GROUP_AC_POR_HORA);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : 6;
}

export function achadoQuotaBlock(vertical: string, history: SentRecord[], now: Date): string | null {
  const recs = storeLast24h(history, vertical, now);
  const ac = recs.filter((h) => h.trigger === 'AC');
  const others = recs.length - ac.length;
  // Dono (2026-11-12): produto sem média é oferta legítima; o governo é o teto por hora (GROUP_AC_POR_HORA, padrão 6), então a cota diária acompanha o teto horário.
  const porHora = achadoPorHora();
  const allowed = Math.max(RULES.ACHADO_MIN_PER_DAY, Math.floor(others / 3), porHora * 24);
  if (ac.length >= allowed) return `achado_cota_diaria_da_loja_${ac.length}_de_${allowed}`;
  if (ac.filter((h) => now.getTime() - h.sentAt.getTime() < 3600_000).length >= porHora) return `achado_maximo_${porHora}_por_hora`;
  return null;
}

/**
 * Flag do gatilho N1 'Preço agora' (produto sem base). DESLIGADA por padrão: só o valor exato on/1/true liga (GROUP_NEUTRO_SEM_BASE).
 * Qualquer outra coisa, inclusive vazio ou ausente, é desligado (falha fechada).
 */
export function neutroSemBaseLigado(env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}): boolean {
  const v = (env.GROUP_NEUTRO_SEM_BASE ?? '').trim().toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

/** Cota do N1 por canal (loja). Os números do ambiente só podem ficar ABAIXO dos de RULES (nunca acima). */
export function neutroLimites(env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}): { porHora: number; porDia: number } {
  const lim = (raw: string | undefined, max: number): number => {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= max ? n : max;
  };
  return { porHora: lim(env.GROUP_N1_POR_HORA, RULES.N1_MAX_PER_HOUR), porDia: lim(env.GROUP_N1_POR_DIA, RULES.N1_MAX_PER_DAY) };
}

/** Cota do N1 'Preço agora' por canal: no máximo 1 por hora e 6 por dia (24 h). null = pode enviar. */
export function neutroQuotaBlock(vertical: string, history: SentRecord[], now: Date, env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}): string | null {
  const { porHora, porDia } = neutroLimites(env);
  const n1 = storeLast24h(history, vertical, now).filter((h) => h.trigger === 'N1');
  if (n1.length >= porDia) return `n1_cota_diaria_do_canal_${n1.length}_de_${porDia}`;
  if (n1.filter((h) => now.getTime() - h.sentAt.getTime() < 3600_000).length >= porHora) return `n1_maximo_${porHora}_por_hora`;
  return null;
}

/** Quantas mensagens do TIPO a loja enviou nas ultimas 24 h e quantas no total (cota de diversidade). */
export function tipoShare(vertical: string, tipo: string | null | undefined, history: SentRecord[], now: Date): { tipoCount: number; total: number; pct: number } {
  const recs = storeLast24h(history, vertical, now);
  const n = tipo ? recs.filter((h) => h.tipo === tipo).length : 0;
  return { tipoCount: n, total: recs.length, pct: recs.length ? (n / recs.length) * 100 : 0 };
}

/** Mensagens do TIPO na loja na última hora (teto horário por tipo, R-47b). */
export function tipoHourCount(vertical: string, tipo: string, history: SentRecord[], now: Date): number {
  return storeLast24h(history, vertical, now).filter((h) => h.tipo === tipo && now.getTime() - h.sentAt.getTime() < 3600_000).length;
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

/** Classe (alerta > resumo > cupom > insight > radar > plataforma); dentro dela o maior movimento; depois o gatilho. */
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
  const alt = sorted.find((c) => c.cls === top.cls && (c.regua?.degrau ?? 0) >= (top.regua?.degrau ?? 0) && diversityKey(c) !== lk && (top.moveScore <= 0 || c.moveScore >= top.moveScore * RULES.DIVERSITY_MIN_QUALITY_RATIO));
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

/**
 * Régua de destaque (dono, 2026-11-12): o degrau 1 (queda de 3% a menos de 6%) ocupa no máximo 1/3 das mensagens da última hora em cada
 * grupo (GROUP_REGUA_D1_SHARE_PCT; padrão 33,33). A primeira da hora sempre passa (o grupo não fica parado); o excedente ADIA, não descarta.
 * Conta tudo o que o grupo recebeu na hora (qualquer gatilho), porque o objetivo é não afogar o grupo em avisos fracos.
 */
export function degrau1ShareBlock(c: Pick<Candidate, 'vertical'>, sent: SentRecord[], now: Date, sharePct: number = reguaConfig().d1SharePct): string | null {
  const grupo = sent.filter((h) => !h.itemOnly && h.cls !== 'plataforma' && h.vertical === c.vertical && now.getTime() - h.sentAt.getTime() < 3600_000 && h.sentAt.getTime() <= now.getTime());
  const d1 = grupo.filter((h) => h.degrau === 1).length;
  if (d1 < 1) return null;
  return ((d1 + 1) / (grupo.length + 1)) * 100 > sharePct + 1e-9 ? 'regua_degrau1_acima_de_um_terco_da_hora' : null;
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
  /** Tetos opcionais (WhatsApp/propostas manuais/testes). Ausente = RULES (hoje sem teto: NO_CAP). */
  caps?: { daily?: number; hourly?: number; nightAlert?: number; byClass?: Partial<Record<MessageClass, number>> };
}

/**
 * Espaçamento POR CHAT (um chat por loja/departamento): o Telegram aceita ~1 mensagem/s por chat e 20/min por grupo. Uma loja
 * não bloqueia a outra. null = pode enviar agora.
 */
export function chatSpacingBlock(vertical: string, history: SentRecord[], now: Date): string | null {
  const mine = history.filter((h) => !h.itemOnly && (h.vertical ?? '') === (vertical ?? '') && h.sentAt.getTime() <= now.getTime() + 5_000);
  const last = [...mine].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  if (last && now.getTime() - last.sentAt.getTime() < RULES.SPACING_CHAT_SEC * 1000) return `intervalo_chat_${RULES.SPACING_CHAT_SEC}s`;
  const lastMinute = mine.filter((h) => now.getTime() - h.sentAt.getTime() < 60_000).length;
  if (lastMinute >= RULES.CHAT_MAX_PER_MINUTE) return `limite_telegram_${RULES.CHAT_MAX_PER_MINUTE}_por_minuto_no_chat`;
  return null;
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
  const cap = opts.caps?.daily ?? dailyCap(now);
  const night = isNightHour(now);
  const spacing = spacingState(all, now, opts.spacing ?? DEFAULT_SPACING, opts.caps?.hourly ?? RULES.HOURLY_CAP);
  const state = { night, sentToday: sentToday.length, dailyCap: cap, soundToday, byClass, spacing };
  const pool = cands.filter((c) => c.sendable && c.status === 'auto' && !c.held);

  // Teto diário/horário de PREÇO (hoje sem teto: NO_CAP); a plataforma não conta. O espaçamento agora é POR CHAT (abaixo), não global.
  const dayFull = sentToday.length >= cap;
  const hourFull = spacing.hourSent >= spacing.hourlyCap;

  const lastRadar = all.filter((h) => h.trigger === 'RADAR').sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  const lastOf = (cls: MessageClass) => all.filter((h) => h.cls === cls).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  const lastPlat = all.filter((h) => h.cls === 'plataforma').sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  const nightAlerts = real.filter((h) => h.cls === 'alerta' && isNightHour(h.sentAt) && now.getTime() - h.sentAt.getTime() < 11 * 3600_000).length;

  const ok0: Candidate[] = [];
  for (const c of pool) {
    const cls = c.cls;
    const composite = c.trigger === 'RADAR';
    const platform = cls === 'plataforma';
    let why: string | null = null;
    if (!platform && dayFull) why = `teto_diario_${cap}`;
    else if (!platform && hourFull) why = `teto_horario_${spacing.hourlyCap}`;
    else if (byClass[cls] >= (opts.caps?.byClass?.[cls] ?? classCap(cls, now))) why = `teto_classe_${cls}_${opts.caps?.byClass?.[cls] ?? classCap(cls, now)}`;
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
    if (!why && !opts.ignoreSpacing) why = chatSpacingBlock(c.vertical, all, now);
    if (!why && !platform && night && cls === 'alerta' && nightAlerts >= (opts.caps?.nightAlert ?? RULES.NIGHT_ALERT_CAP)) why = `noite_maximo_${opts.caps?.nightAlert ?? RULES.NIGHT_ALERT_CAP}_alertas`;
    if (!why && !platform) why = productDedupBlock(c, history, now);
    if (!why && !platform && !opts.ignoreSpacing) why = masterCooldownBlock(c, history, now);
    if (!why && c.trigger === 'CUPOM') why = cupomDedupBlock(c, history, now) ?? cupomQuotaBlock(c.vertical, real, now);
    if (!why && !platform && c.items?.length && !opts.ignoreSpacing) why = productGapBlock(c, history, now);
    if (!why && c.trigger === 'AC') why = achadoQuotaBlock(c.vertical, real, now);
    if (!why && c.trigger === 'N1') why = neutroQuotaBlock(c.vertical, real, now);
    if (why) deferred.push({ messageKey: c.messageKey, reason: why });
    else ok0.push(c);
  }

  // Cota de diversidade por TIPO (ata 2026-11-12): nenhum tipo passa de TIPO_MAX_SHARE_PCT das mensagens da loja em 24 h, mas SO se houver
  // alternativa de outro tipo na fila (cota suave: sem alternativa, o canal nao fica parado). Alerta (queda real) nao e freado.
  // R-47b (2026-11-13): o alerta G2/OK2 (quase tudo o que sai) também entra na cota; ficam isentos o novo mínimo (G1/OK1) e os degraus 4 e 5 da régua.
  const cotaAlerta = tipoCotaAlertaOn();
  const porHoraTipo = tipoPorHora();
  const tipoIsento = (c: Candidate): boolean =>
    c.cls === 'plataforma' || (c.cls === 'alerta' && (!cotaAlerta || c.trigger === 'G1' || c.trigger === 'OK1' || (c.regua?.degrau ?? 0) >= 4));
  const tipoOver = (c: Candidate): boolean => {
    if (!c.tipo || !c.vertical || tipoIsento(c)) return false;
    const s = tipoShare(c.vertical, c.tipo, real, now);
    if (s.total >= RULES.TIPO_SHARE_MIN_SENT && s.pct >= RULES.TIPO_MAX_SHARE_PCT) return true;
    return cotaAlerta && porHoraTipo > 0 && tipoHourCount(c.vertical, c.tipo, real, now) >= porHoraTipo;
  };
  // Cota de cupom por loja: cupom nao passa de CUPOM_MAX_SHARE_PCT das mensagens da loja em 24 h, mas so se houver alternativa (nao-cupom) na fila.
  const cupomOver = (c: Candidate): boolean => {
    if (c.trigger !== 'CUPOM') return false;
    const s = cupomShare(c.vertical, real, now);
    return s.total >= RULES.CUPOM_SHARE_MIN_SENT && s.pct >= RULES.CUPOM_MAX_SHARE_PCT;
  };
  const ok: Candidate[] = [];
  for (const c of ok0) {
    // Régua de destaque (dono, 2026-11-12): o teto de 1/3 do degrau 1 só vale quando há oferta dos degraus 2 a 5 elegível esperando no mesmo grupo; sem ela o degrau 1 sai sem teto.
    if (c.regua?.degrau === 1 && ok0.some((x) => x.vertical === c.vertical && (x.regua?.degrau ?? 0) >= 2)) {
      const t = degrau1ShareBlock(c, all, now);
      if (t) {
        deferred.push({ messageKey: c.messageKey, reason: t });
        continue;
      }
    }
    if (cupomOver(c) && ok0.some((x) => x.vertical === c.vertical && x.trigger !== 'CUPOM' && x.cls !== 'plataforma')) {
      deferred.push({ messageKey: c.messageKey, reason: `cupom_acima_de_${RULES.CUPOM_MAX_SHARE_PCT}pct_do_dia_na_loja` });
      continue;
    }
    if (tipoOver(c) && ok0.some((x) => x.vertical === c.vertical && !!x.tipo && x.tipo !== c.tipo && !tipoOver(x))) {
      deferred.push({ messageKey: c.messageKey, reason: `tipo_${c.tipo}_acima_de_${RULES.TIPO_MAX_SHARE_PCT}pct_do_dia_na_loja` });
    } else ok.push(c);
  }

  const platOk = ok.filter((c) => c.cls === 'plataforma');
  // Rodizio de tipos: dentro da mesma classe (insight, radar), o tipo MENOS enviado hoje na loja vai primeiro; depois a ordem de sempre.
  const tipoCountOf = (c: Candidate) => (c.tipo && c.vertical ? tipoShare(c.vertical, c.tipo, real, now).tipoCount : 0);
  const rotates = (c: Candidate) => c.cls === 'insight' || c.cls === 'radar' || (cotaAlerta && c.cls === 'alerta' && c.trigger !== 'G1' && c.trigger !== 'OK1');
  // Chave transitiva: classe; dentro de insight/radar, o ACHADO (sem comparacao) nunca passa na frente de um insight com comparacao real (G2, G3, T1...);
  // depois, o tipo MENOS enviado hoje na loja; depois a ordem de sempre (games e alertas: tipo nulo/classe propria, ordem inalterada entre si).
  const priceOk = ok
    .filter((c) => c.cls !== 'plataforma')
    .sort((a, b) =>
      CLASS_RANK[a.cls] - CLASS_RANK[b.cls] ||
      // Régua de destaque (2026-11-12): o degrau mais alto vai primeiro dentro da classe (sem régua = 0, ordem de sempre).
      (b.regua?.degrau ?? 0) - (a.regua?.degrau ?? 0) ||
      (rotates(a) ? Number(a.trigger === 'AC' || a.trigger === 'N1') : 0) - (rotates(b) ? Number(b.trigger === 'AC' || b.trigger === 'N1') : 0) ||
      (rotates(a) ? tipoCountOf(a) : 0) - (rotates(b) ? tipoCountOf(b) : 0) ||
      compareCandidates(a, b)
    );
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
  // Só cartões de HISTÓRICO (P1/G5) entram na cota: os cards de oferta (centenas por dia) a esgotavam e o P1 nunca recebia card (12 h: 5 de 5 P1 sem card).
  const cards = history.filter((h) => h.card && !h.itemOnly && (h.trigger === 'P1' || h.trigger === 'G5'));
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
