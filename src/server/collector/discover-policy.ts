/**
 * Política conservadora da DESCOBERTA automática (2026-11-03). Funções PURAS (sem banco, sem rede),
 * testadas em scripts/test-discover-policy.ts. O fluxo em discover-products.ts as usa para decidir:
 *  - quando um master NOVO deve nascer em `review` por dúvida (invisível ao público até conferência);
 *  - quando uma oferta que se anexa a um master existente tem preço fora da faixa e deve ser descartada;
 *  - limites de execução (teto de masters novos, sondas por termo, orçamento de tempo).
 * Não substitui o porteiro (gate.ts): soma sinais que só a descoberta conhece (como o tipo foi resolvido,
 * dispersão de preço entre vendedores).
 */

/** Como o tipo (jogo/console/acessório) foi resolvido; só `category` é sinal forte. */
export type KindSource = 'category' | 'title' | 'term' | 'classifier';

export interface DoubtInput {
  kindSource: KindSource;
  productType: 'game' | 'console' | 'accessory';
  /** game_platform_gen final (depois de derivar do título). */
  platform: string;
  gameFormat: string | null | undefined;
  /** Menor preço por vendedor (centavos), vendedores com item novo. */
  sellerPricesCents: number[];
  /** A plataforma veio só do termo de busca (o título não a indica). */
  platformFromTerm?: boolean;
}

/** Acima disto o preço é tratado como absurdo (mesmo corte da quarentena: R$ 50.000). */
export const ABSURD_HIGH_CENTS = 5_000_000;
/** Mesmo piso do ADR 0002. */
export const BAIT_RATIO = 0.35;
/** Mesmo teto da quarentena (3x a mediana). */
export const HIGH_RATIO = 3;

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export { medianOf };

/**
 * Dúvidas que mandam um master NOVO para `review`. Lista vazia = pode nascer pelo veredito do porteiro.
 * Códigos estáveis (vão para attributes.discovery.doubts e para o log).
 */
export function discoveryDoubts(i: DoubtInput): string[] {
  const out: string[] = [];
  if (i.kindSource === 'classifier') out.push('tipo_por_classificador_estatistico');
  if (i.kindSource === 'term') out.push('tipo_pelo_termo_de_busca');
  if (i.platform === 'unknown' && i.productType !== 'accessory') out.push('plataforma_desconhecida');
  if (i.platformFromTerm) out.push('plataforma_pelo_termo_de_busca');
  if (i.productType === 'game' && i.gameFormat !== 'physical') {
    out.push(i.gameFormat === 'digital' ? 'formato_digital' : 'formato_desconhecido');
  }
  const prices = i.sellerPricesCents.filter((p) => p > 0);
  const best = prices.length ? Math.min(...prices) : 0;
  if (best >= ABSURD_HIGH_CENTS) out.push('preco_absurdo_alto');
  if (prices.length >= 3) {
    const med = medianOf(prices);
    if (med != null && best < med * BAIT_RATIO) out.push('menor_preco_isca_vs_vendedores');
  }
  return out;
}

/**
 * Oferta que vai anexar a um master existente: o preço (menor entre vendedores) precisa caber na faixa das
 * cotações ativas reais do master. Sem 2+ referências não há como julgar: aceita (mesma regra do ADR 0002).
 */
export function attachPriceVerdict(bestPriceCents: number, masterReferenceCents: number[]): 'ok' | 'low' | 'high' {
  if (masterReferenceCents.length < 2) return 'ok';
  const med = medianOf(masterReferenceCents);
  if (med == null || med <= 0) return 'ok';
  if (bestPriceCents < med * BAIT_RATIO) return 'low';
  if (bestPriceCents > med * HIGH_RATIO) return 'high';
  return 'ok';
}

export interface DiscoveryTrace {
  source: 'discover-products';
  at: string;
  doubts: string[];
  bornAs: 'approved' | 'review';
}

/**
 * Monta `attributes` do master novo. `gateAttributes` é o retorno de entryGateAttributes (já traz o veredito).
 * Com dúvida (ou modo review_all), força catalogGate = review/unverified, preservando um review mais específico
 * do porteiro. Sempre anexa `discovery` para auditoria (query por attributes->'discovery').
 */
export function buildNewMasterAttributes(
  gateAttributes: Record<string, unknown>,
  doubts: string[],
  mode: 'doubt' | 'review_all',
  nowIso: string,
): Record<string, unknown> {
  const gate = gateAttributes.catalogGate as { verdict?: string } | undefined;
  const gateVerdict = gate?.verdict ?? 'approved';
  const forceReview = gateVerdict === 'approved' && (doubts.length > 0 || mode === 'review_all');
  const reasonDoubts = doubts.length ? doubts : ['modo_review_all'];
  const attrs: Record<string, unknown> = { ...gateAttributes };
  if (forceReview) {
    attrs.catalogGate = {
      verdict: 'review',
      category: 'unverified',
      reason: `descoberta_duvida:${reasonDoubts.join('+')}`,
      matched: null,
      version: 1,
      at: nowIso,
    };
  }
  const bornAs: 'approved' | 'review' = forceReview || gateVerdict === 'review' ? 'review' : 'approved';
  const trace: DiscoveryTrace = { source: 'discover-products', at: nowIso, doubts, bornAs };
  attrs.discovery = trace;
  return attrs;
}

export interface DiscoveryLimits {
  /** Teto de masters NOVOS por execução (tudo acima é descartado até a próxima rotação). */
  maxNewMasters: number;
  /** Sondas /products/{id}/items por termo. */
  probesPerTerm: number;
  /** Termos por execução. */
  termsPerRun: number;
  /** Orçamento de tempo da execução (ms). */
  timeBudgetMs: number;
  /** Erros consecutivos de sonda que interrompem o termo. */
  maxConsecutiveProbeErrors: number;
  mode: 'doubt' | 'review_all';
}

export const DEFAULT_LIMITS: DiscoveryLimits = {
  maxNewMasters: 10,
  probesPerTerm: 25,
  termsPerRun: 4,
  timeBudgetMs: 90_000,
  maxConsecutiveProbeErrors: 4,
  mode: 'doubt',
};

const HARD_MAX = { maxNewMasters: 50, probesPerTerm: 60, termsPerRun: 10 };

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Lê limites de overrides (query/env) com tetos duros. Valor inválido = padrão conservador. */
export function resolveLimits(over: Partial<Record<keyof DiscoveryLimits, unknown>> = {}): DiscoveryLimits {
  const mode = over.mode === 'review_all' ? 'review_all' : DEFAULT_LIMITS.mode;
  return {
    maxNewMasters: intIn(over.maxNewMasters, 0, HARD_MAX.maxNewMasters, DEFAULT_LIMITS.maxNewMasters),
    probesPerTerm: intIn(over.probesPerTerm, 1, HARD_MAX.probesPerTerm, DEFAULT_LIMITS.probesPerTerm),
    termsPerRun: intIn(over.termsPerRun, 1, HARD_MAX.termsPerRun, DEFAULT_LIMITS.termsPerRun),
    timeBudgetMs: intIn(over.timeBudgetMs, 5_000, 100_000, DEFAULT_LIMITS.timeBudgetMs),
    maxConsecutiveProbeErrors: intIn(over.maxConsecutiveProbeErrors, 1, 20, DEFAULT_LIMITS.maxConsecutiveProbeErrors),
    mode,
  };
}
