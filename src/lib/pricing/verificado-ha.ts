// "verificado há X" (puro, sem dependências: entra no JavaScript do cliente do cartão).

/** Arredonda PARA BAIXO (2h31 vira "há 2 h"): nunca superestima a idade da checagem. Calculado no cliente, com o relógio do navegador. */
export function verificadoHaTexto(iso: string, agoraMs: number): string {
  const mins = Math.max(0, Math.floor((agoraMs - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `verificado há ${Math.max(1, mins)} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `verificado há ${h} h`;
  return `verificado há ${Math.floor(h / 24)} dias`;
}
