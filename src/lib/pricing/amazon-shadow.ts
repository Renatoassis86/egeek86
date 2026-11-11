// Modo sombra da Amazon (PRICE_AMAZON_MODE=shadow): tipos e resumo PUROS da comparação "média pública (sem Amazon)" x "média COM Amazon".
// Só medição para auditoria antes de ligar o modo `on`; nada daqui é exibido ao público nem altera mensagem.

/** Diferença, de HOJE, de um produto que tem oferta da Amazon. */
export interface AmazonShadowDiff {
  productId: string;
  day: string;
  amazonOffers: number;
  nPublic: number;
  nWith: number;
  avgPublicCents: number | null;
  avgWithCents: number | null;
  /** (avgWith / avgPublic - 1) * 100; null se alguma das médias não existe (menos de 3 ofertas). */
  avgChangePct: number | null;
  minPublicCents: number | null;
  minWithCents: number | null;
  amazonIsMin: boolean;
}

export interface AmazonShadowSummary {
  productsCompared: number;
  avgChanged: number;
  absChangeOver2: number;
  absChangeOver5: number;
  maxAbsChangePct: number | null;
  meanAbsChangePct: number | null;
  amazonIsMin: number;
  /** Maiores variações da média (compactas: cabem no teto de 4000 caracteres de collector_runs.meta). p=produto, pct, nP/nW=ofertas sem/com Amazon. */
  top: Array<{ p: string; pct: number; nP: number; nW: number; am: number }>;
}

export function summarizeAmazonShadow(diffs: AmazonShadowDiff[], topN = 8): AmazonShadowSummary {
  const ch = diffs.filter((d) => d.avgChangePct != null);
  const abs = ch.map((d) => Math.abs(d.avgChangePct as number));
  return {
    productsCompared: diffs.length,
    avgChanged: ch.filter((d) => d.avgChangePct !== 0).length,
    absChangeOver2: abs.filter((x) => x > 2).length,
    absChangeOver5: abs.filter((x) => x > 5).length,
    maxAbsChangePct: abs.length ? Math.max(...abs) : null,
    meanAbsChangePct: abs.length ? Math.round((abs.reduce((a, b) => a + b, 0) / abs.length) * 100) / 100 : null,
    amazonIsMin: diffs.filter((d) => d.amazonIsMin).length,
    top: [...ch]
      .sort((a, b) => Math.abs(b.avgChangePct as number) - Math.abs(a.avgChangePct as number))
      .slice(0, topN)
      .map((d) => ({ p: d.productId.slice(0, 8), pct: d.avgChangePct as number, nP: d.nPublic, nW: d.nWith, am: d.amazonOffers })),
  };
}
