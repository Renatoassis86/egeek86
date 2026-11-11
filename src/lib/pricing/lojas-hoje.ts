// "Lojas de hoje" (Fase 3, painel 2): as ofertas ELEGÍVEIS do dia, uma linha por oferta, ordenadas pelo menor preço.
// Módulo PURO. NÃO recalcula regra de negócio: o conjunto de ofertas vem de `loadLiveOffers`/`loadOfferMeta` (as MESMAS consultas
// do "preço agora": ativa, preço > 0, `eligibleOfferSql` = fora de quarentena, fora de rascunho, fora de placeholder redundante,
// identidade visível e catálogo aprovado) e o frescor/faixa usam as MESMAS funções de `daily-state` (FRESH_MAX_AGE_MS,
// plausibleBand/inBand) e `storesToday`. Invariantes conferidas em scripts/test-parecer-produto.ts:
//   total == freshOffers do preço agora;  lojasDistintas == stores.count do cartão.
// Sem dado fake: só o que veio do cadastro; lacuna é lacuna.
import { FRESH_MAX_AGE_MS, inBand, plausibleBand, type LiveOfferInput } from '@/lib/pricing/daily-state';
import { storesToday } from '@/lib/pricing/price-verdict-v2';
import type { LojaHojeLinha, LojasHoje } from '@/lib/pricing/lojas-hoje-tipos';

export { LOJAS_LINHAS_VISIVEIS, linhasReservadas, type LojaHojeLinha, type LojasHoje } from '@/lib/pricing/lojas-hoje-tipos';

export interface OfertaLojaInput extends LiveOfferInput {
  /** Apelido do vendedor; null = vendedor não identificado. */
  vendedor: string | null;
  /** Nome da rede/marketplace. */
  rede: string;
  /** Vendedor de baixa reputação (mesma regra de `weakSellerSql`). */
  baixaReputacao: boolean;
}

/** Mesmo frescor de `computeLiveMinFromOffers`: preço > 0, cotação E checagem com no máximo 48 h (ou o teto da própria oferta: Amazon 24 h pela confirmação). */
export function ofertaFresca(l: LiveOfferInput, now: Date): boolean {
  if (!(l.priceCents > 0) || !l.quotedAt || !l.checkedAt) return false;
  const max = l.maxAgeMs ?? FRESH_MAX_AGE_MS;
  return now.getTime() - l.quotedAt.getTime() <= max && now.getTime() - l.checkedAt.getTime() <= max;
}

/**
 * Quantas ofertas frescas estão FORA da faixa de preço plausível do dia (mesma régua de `buildLojasHoje` e de `storesToday`).
 * 0 = nenhuma oferta descartada: o aviso "preços muito fora do normal" não deve aparecer.
 */
export function contarForaDaFaixa(ofertas: LiveOfferInput[], now: Date): number {
  const frescas = ofertas.filter((o) => ofertaFresca(o, now));
  const band = plausibleBand(frescas.map((o) => o.priceCents));
  return frescas.filter((o) => !inBand(o.priceCents, band)).length;
}

export function buildLojasHoje(ofertas: OfertaLojaInput[], now: Date): LojasHoje {
  const frescas = ofertas.filter((o) => ofertaFresca(o, now));
  const band = plausibleBand(frescas.map((o) => o.priceCents));
  const linhas: LojaHojeLinha[] = frescas.map((o) => ({
    vendedor: o.vendedor,
    rede: o.rede,
    cents: o.priceCents,
    checkedAtIso: (o.checkedAt as Date).toISOString(),
    baixaReputacao: o.baixaReputacao,
    foraDaFaixa: !inBand(o.priceCents, band),
  }));
  linhas.sort((a, b) => a.cents - b.cents || (a.vendedor ?? '').localeCompare(b.vendedor ?? '', 'pt-BR') || a.rede.localeCompare(b.rede, 'pt-BR'));
  // Contagem de lojas pela MESMA função do cartão (chave de loja = vendedor, ou a rede se faltar).
  const lojas = storesToday(frescas.map((o) => ({ storeKey: o.sellerId ?? o.networkId ?? o.offerId, priceCents: o.priceCents })));
  return { total: frescas.length, lojasDistintas: lojas.storeCount, linhas };
}
