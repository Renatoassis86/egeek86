/**
 * Ritmo das chamadas à Shopee Open API (documentação lida em 2026-11-10: 8000 chamadas/hora; por segundo e por
 * aplicativo NÃO documentados; erro 10030 = limite, "esperar a próxima janela"). Antes do ritmo, 3 consultas em
 * paralelo sem pausa batiam 10030 após ~108 consultas por rodada e a fila nunca esvaziava.
 * Estado por instância de execução (cada rodada do cron cria o seu): espaçamento mínimo entre INÍCIOS de chamada,
 * dobrado após cada 10030 (teto 2 s) para a própria rodada se adaptar ao limite real.
 */
export const SHOPEE_MIN_SPACING_MS = 480; // ~1,7 chamada/s, abaixo do teto médio de 2,2/s do limite horário
export const SHOPEE_MAX_SPACING_MS = 2000;
export const SHOPEE_RATE_LIMIT_WAIT_MS = 8000;

export interface ShopeePacer {
  /** Espera a vez da próxima chamada (reserva o instante, serializa concorrentes). */
  wait(): Promise<void>;
  /** Registra um 10030: dobra o espaçamento (até o teto). */
  onRateLimit(): void;
  spacingMs(): number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createShopeePacer(initialMs = SHOPEE_MIN_SPACING_MS, now: () => number = Date.now, pause: (ms: number) => Promise<void> = sleep): ShopeePacer {
  let spacing = initialMs;
  let nextAt = 0;
  return {
    async wait() {
      const t = now();
      const at = Math.max(t, nextAt);
      nextAt = at + spacing;
      if (at > t) await pause(at - t);
    },
    onRateLimit() {
      spacing = Math.min(spacing * 2, SHOPEE_MAX_SPACING_MS);
    },
    spacingMs: () => spacing,
  };
}
