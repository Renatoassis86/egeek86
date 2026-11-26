// R-124 (dono, 2026-11-25): freio de frescor do Mercado Livre. PURO: sem banco, sem relógio, sem rede.
// A API do ML devolve 403 desde 23/11 17:20 UTC (coleta parada): ofertas do ML seguem 'active' com preço congelado e entravam em menor preço,
// média e comparação ("menor preço que já vimos" falso no caso da Bambu A1). Oferta do ML sem leitura de preço há mais de N horas sai das
// métricas VIVAS (média, mínimo, selo, gráfico, cartão, série da mensagem). NADA é apagado: histórico e dias fechados intactos; a vitrine
// do site (R-90) não é tocada. Variável ML_PRECO_VELHO_HORAS: número 1..168 = N horas (padrão 12); 0 | off | false desliga.

export const ML_PRECO_VELHO_HORAS_PADRAO = 12;

export function mlPrecoVelhoMs(env: Record<string, string | undefined> = process.env): number | null {
  const v = (env.ML_PRECO_VELHO_HORAS ?? '').trim().toLowerCase();
  if (v === '0' || v === 'off' || v === 'false') return null;
  const n = Number(v);
  const horas = v !== '' && Number.isFinite(n) && n >= 1 && n <= 168 ? n : ML_PRECO_VELHO_HORAS_PADRAO;
  return Math.round(horas * 3_600_000);
}

export const isMercadoLivreSlug = (slug: string | null | undefined): boolean => /mercado-?livre/i.test(slug ?? '');

/**
 * Frescor para `OfferInput.freshness` de uma oferta do ML. Sem leitura de preço confirmada (nula) a âncora é a época: vale só a última cotação,
 * que também precisa estar dentro do teto. Fora do ML, ou com o freio desligado: null (regra anterior).
 */
export function frescorMercadoLivre(
  slug: string | null | undefined, confirmedAt: Date | null | undefined, env: Record<string, string | undefined> = process.env,
): { confirmedAt: Date; maxAgeMs: number } | null {
  if (!isMercadoLivreSlug(slug)) return null;
  const max = mlPrecoVelhoMs(env);
  if (max == null) return null;
  return { confirmedAt: confirmedAt ?? new Date(0), maxAgeMs: max };
}
