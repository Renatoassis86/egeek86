// E1 (R-89/R-90, fila #142): régua PURA do medidor de frescor. Sem banco, sem rede, sem relógio.
// Mede a IDADE do dado exibido por rede; NÃO decide saída de vitrine (R-90: idade nunca expira item exibido).

export interface Distribuicao {
  n: number;
  semLeitura: number;
  p50: number | null;
  p90: number | null;
  max: number | null;
  ate: Record<string, number>;
}

/** Percentil por posição mais próxima (método nearest-rank), em minutos. */
export function percentil(valores: number[], p: number): number | null {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const rank = Math.min(v.length, Math.max(1, Math.ceil((p / 100) * v.length)));
  return v[rank - 1];
}

/** idadesMin: idade de cada oferta em minutos (null/undefined = nunca lida). cortes: ex. {'45min':45,'6h':360}. */
export function distribuicao(idadesMin: Array<number | null | undefined>, cortes: Record<string, number>): Distribuicao {
  const lidas = idadesMin.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0);
  const ate: Record<string, number> = {};
  for (const [nome, lim] of Object.entries(cortes)) ate[nome] = lidas.filter((x) => x <= lim).length;
  return {
    n: idadesMin.length,
    semLeitura: idadesMin.length - lidas.length,
    p50: percentil(lidas, 50),
    p90: percentil(lidas, 90),
    max: lidas.length ? Math.max(...lidas) : null,
    ate,
  };
}

export function idadeMin(lidoEm: Date | string | null | undefined, now: Date): number | null {
  if (!lidoEm) return null;
  const t = new Date(lidoEm).getTime();
  return Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / 60000) : null;
}

/** Texto do rótulo "coletado há X" (R-90): minutos -> "agora", "12 min", "3 h", "2 d". */
export function rotuloColetadoHa(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min < 0) return 'coleta ainda não registrada';
  if (min < 2) return 'coletado agora';
  if (min < 60) return `coletado há ${Math.round(min)} min`;
  if (min < 48 * 60) return `coletado há ${Math.round(min / 60)} h`;
  return `coletado há ${Math.round(min / 1440)} d`;
}

/** Invariante E1: o que foi ENVIADO em mensagem não passa do limite (idade exibida é só informação). */
export function violacoesEnvio(idadesEnvioMin: number[], limiteMin: number): number {
  return idadesEnvioMin.filter((x) => x > limiteMin).length;
}
