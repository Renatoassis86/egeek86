// R-117 (dono, 2026-11-22): destaque "MENOR PREÇO REGISTRADO" em toda mensagem de produto. MÓDULO PURO: sem banco, sem rede, sem relógio.
// Fonte: a série diária do menor preço do produto (DayPoint[], dias FECHADOS anteriores a hoje), a MESMA que já alimenta a média, a faixa e a
// régua (price_daily_offer só de ofertas elegíveis: sem quarentena/preço-isca, sem Open Box, mesma cesta/identidade; Amazon usa a série própria,
// de preço CHEIO). Nenhuma consulta nova no envio. Rollback: MENSAGEM_MENOR_PRECO=off.

export interface MenorPrecoRegistrado {
  /** Menor preço já registrado ANTES de hoje (centavos) e o dia em que ocorreu ('YYYY-MM-DD'). */
  cents: number;
  day: string;
  /** Posição do preço atual (vivo) frente ao mínimo histórico. */
  situacao: 'novo-minimo' | 'igual' | 'acima';
  /** acima: percentual do preço atual sobre o mínimo (uma casa). */
  acimaPct: number | null;
}

/** MENSAGEM_MENOR_PRECO=off (ou 0/false/nao) desliga a linha. Padrão: ligado. */
export function menorPrecoLigado(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(off|0|false|nao|não)$/i.test(String(env.MENSAGEM_MENOR_PRECO ?? '').trim());
}

/** Preço-isca (R-61): ponto da série muito abaixo da mediana da própria série nunca é "menor preço registrado". */
const ISCA_RAZAO = 0.35;
const ISCA_MIN_PONTOS = 4;

/**
 * Menor preço registrado da série frente ao preço atual. null = sem registro anterior (a linha é OMITIDA; nada é inventado).
 * Só conta dia anterior a `hoje` e com preço > 0; empate no mínimo fica com o dia MAIS ANTIGO (a data em que o mínimo apareceu).
 */
export function menorPrecoRegistrado(
  series: ReadonlyArray<{ day: string; minCents: number }> | null | undefined,
  precoAtualCents: number,
  hoje: string
): MenorPrecoRegistrado | null {
  if (!series || !(precoAtualCents > 0)) return null;
  const pts = series.filter((x) => x.minCents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.day) && x.day < hoje);
  if (!pts.length) return null;
  let base = pts;
  if (pts.length >= ISCA_MIN_PONTOS) {
    const ord = pts.map((x) => x.minCents).sort((a, b) => a - b);
    const mediana = ord[Math.floor(ord.length / 2)];
    const sem = pts.filter((x) => x.minCents >= mediana * ISCA_RAZAO);
    if (sem.length) base = sem;
  }
  let min = base[0];
  for (const x of base) if (x.minCents < min.minCents || (x.minCents === min.minCents && x.day < min.day)) min = x;
  if (precoAtualCents < min.minCents) return { cents: min.minCents, day: min.day, situacao: 'novo-minimo', acimaPct: null };
  if (precoAtualCents === min.minCents) return { cents: min.minCents, day: min.day, situacao: 'igual', acimaPct: null };
  return { cents: min.minCents, day: min.day, situacao: 'acima', acimaPct: Math.round(((precoAtualCents - min.minCents) / min.minCents) * 1000) / 10 };
}
