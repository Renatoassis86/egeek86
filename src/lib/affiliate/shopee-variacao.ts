// Sem 'server-only': funções puras (sem banco, sem rede), testadas em scripts/test-shopee.ts e scripts/test-shopee-cobertura.ts.

/**
 * VARIAÇÃO DE PREÇO DA SHOPEE (dono, 2026-11-12): item com faixa de preço entre variações ENTRA no banco com o MENOR preço (priceMin,
 * "a partir de"); a variação é marcada, nunca resolvida por chute. Nada aqui inventa valor: só repete o que a API devolveu.
 *
 * Onde a marca vive:
 *  - collector_runs.meta (job cobertura-shopee): sempre, em `variantes` (auditoria e reversão);
 *  - colunas affiliate_offers.variant_min_cents / variant_max_cents / variant_spread (migration 0047, PROPOSTA, não aplicada): só gravadas
 *    com SHOPEE_VARIANTE_COLUNAS=1 (o schema Drizzle não ganhou as colunas, como na 0044/0045: leituras totais quebrariam antes da migração).
 *
 * Texto ao cliente: preço de oferta com `variantSpread` > 1,1 é "a partir de R$ X" (nunca preço fixo de uma variação específica).
 * As regras de mensagem (inclusive 10% abaixo da média) não mudam; ver `precoEhAPartirDe`.
 */

export interface MarcaVariacao {
  variantMinCents: number;
  variantMaxCents: number;
  variantSpread: number;
  /** true = faixa ampla (> SHOPEE_MAX_VARIANT_SPREAD): o preço da oferta é "a partir de". */
  ampla: boolean;
}

export interface NoComVariacao {
  variantMinCents: number | null;
  variantMaxCents: number | null;
  variantSpread: number | null;
  variantAmbigua: boolean;
}

/** Marca de variação do nó, ou null quando o preço é único. */
export function marcaVariacao(n: NoComVariacao): MarcaVariacao | null {
  if (n.variantMinCents == null || n.variantMaxCents == null || n.variantSpread == null) return null;
  return { variantMinCents: n.variantMinCents, variantMaxCents: n.variantMaxCents, variantSpread: n.variantSpread, ampla: n.variantAmbigua };
}

/** A oferta guardada com `variantSpread` acima do limite deve ser descrita ao cliente como "a partir de". Pura; o texto em si é de src/lib/messaging. */
export function precoEhAPartirDe(variantSpread: number | null | undefined, limite = 1.1): boolean {
  return variantSpread != null && Number.isFinite(variantSpread) && variantSpread > limite;
}

/** Colunas de variação só são gravadas com o interruptor ligado (migration 0047 aplicada pelo dono). */
export const variacaoColunasLigada = (env: string | undefined): boolean => env === '1';
