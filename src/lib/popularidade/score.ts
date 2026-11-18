// R-103 (dono, 2026-11-18): popularidade das plataformas como criterio de PRIORIDADE (ordem), nunca de exclusao. Puro (sem banco, sem rede).
// Score 0..1 DENTRO de cada fonte (1 = 1o lugar da lista); nunca comparar entre fontes/redes. Sem sinal = 0 (nao penaliza alem de ficar atras de quem tem).

export const POPULARIDADE_FONTE_ML = 'ml_highlights';
/** Quanto tempo uma leitura de popularidade vale (dias). Depois disso o sinal e ignorado. */
export const POPULARIDADE_VALIDADE_DIAS = 7;

/** 1o lugar = 1; ultimo da lista = 1/tamanho. Posicao fora da lista = 0. */
export function scoreDeRank(rank: number, tamanho: number): number {
  if (!Number.isFinite(rank) || !Number.isFinite(tamanho) || tamanho < 1 || rank < 1 || rank > tamanho) return 0;
  return Math.round(((tamanho - rank + 1) / tamanho) * 10000) / 10000;
}

/** GROUP_POPULARIDADE=off/0/false desliga o peso na ordem da fila (volta a ordem de antes, sem deploy). */
export function popularidadeLigada(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.GROUP_POPULARIDADE ?? '').trim());
}

/** Vertical que o coletor atende numa janela de 30 min (rodizio estavel entre os departamentos com fonte de destaques). */
export function verticalDaJanela(verticais: readonly string[], now: Date = new Date()): string | null {
  if (!verticais.length) return null;
  return verticais[Math.floor(now.getTime() / (30 * 60_000)) % verticais.length];
}
