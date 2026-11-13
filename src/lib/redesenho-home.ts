/**
 * Flag REDESENHO_HOME (checklist #16): decide qual home o visitante recebe.
 * Parte pura (sem I/O), testada em scripts/test-redesenho-home.ts.
 *
 * Regras:
 * - percentual 0 a 100 (padrao 0 = home atual intacta);
 * - o mesmo visitante cai sempre no mesmo grupo (hash do cookie eg_v);
 * - `?v=2` forca a nova home e `?v=1` forca a atual, SO para admin; para os demais o parametro e ignorado.
 */
export const COOKIE_VISITANTE_HOME = 'eg_v';

/** Aceita numero ou texto ("25", "25%", " 25 "); invalido, negativo ou vazio vira 0; acima de 100 vira 100. */
export function parsePercentual(bruto: unknown): number {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? Math.min(100, Math.max(0, Math.round(bruto))) : 0;
  if (typeof bruto !== 'string') return 0;
  const n = Number(bruto.trim().replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

/** Balde 0..99 estavel para um identificador (FNV-1a de 32 bits). */
export function baldeDoVisitante(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

export interface EntradaVersaoHome {
  percentual: number;
  visitanteId: string | null;
  /** valor de ?v= (somente "1" ou "2" valem) */
  forcar: string | null;
  admin: boolean;
}

export function escolherVersaoHome({ percentual, visitanteId, forcar, admin }: EntradaVersaoHome): 1 | 2 {
  if (admin && forcar === '2') return 2;
  if (admin && forcar === '1') return 1;
  if (percentual <= 0 || !visitanteId) return 1; // sem cookie ainda: home atual
  if (percentual >= 100) return 2;
  return baldeDoVisitante(visitanteId) < percentual ? 2 : 1;
}
