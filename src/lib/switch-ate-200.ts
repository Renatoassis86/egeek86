// Seção "Jogos de Nintendo Switch 1 e 2 até R$ 200" (dono, 2026-11-17). Regra PURA: a lista pública já vem filtrada (produto novo, porteiro, sem quarentena);
// aqui só se aplica o teto de preço e o recorte de geração. Preço = preço atual da oferta (centavos).
export const TETO_SWITCH_CENTAVOS = 20_000;
export type GeracaoSwitch = 'switch_1' | 'switch_2';
export const GERACOES_SWITCH: readonly GeracaoSwitch[] = ['switch_1', 'switch_2'];

export interface OfertaMin {
  id: string;
  currentPriceCents: number;
  masterProduct: { gamePlatformGen: string; productType?: string };
}

export function geracaoValida(v: string | null | undefined): GeracaoSwitch | null {
  return v === 'switch_1' || v === 'switch_2' ? v : null;
}

/** Só jogo Switch com preço > 0 e <= teto; opcionalmente uma geração. Ordem ascendente de preço, estável por id. */
export function filtrarSwitchAte200<T extends OfertaMin>(ofertas: readonly T[], geracao: GeracaoSwitch | null = null, teto: number = TETO_SWITCH_CENTAVOS): T[] {
  return ofertas
    .filter((o) => o.currentPriceCents > 0 && o.currentPriceCents <= teto)
    .filter((o) => (o.masterProduct.productType ?? 'game') === 'game')
    .filter((o) => (geracao ? o.masterProduct.gamePlatformGen === geracao : GERACOES_SWITCH.includes(o.masterProduct.gamePlatformGen as GeracaoSwitch)))
    .sort((a, b) => a.currentPriceCents - b.currentPriceCents || a.id.localeCompare(b.id));
}

export function contarPorGeracao<T extends OfertaMin>(ofertas: readonly T[]): { total: number; switch_1: number; switch_2: number } {
  const lista = filtrarSwitchAte200(ofertas);
  return {
    total: lista.length,
    switch_1: lista.filter((o) => o.masterProduct.gamePlatformGen === 'switch_1').length,
    switch_2: lista.filter((o) => o.masterProduct.gamePlatformGen === 'switch_2').length,
  };
}

export const POR_PAGINA_SWITCH = 48;
export function paginaValida(v: string | null | undefined, total: number): number {
  const n = Number(v);
  const max = Math.max(1, Math.ceil(total / POR_PAGINA_SWITCH));
  return Number.isInteger(n) && n >= 1 && n <= max ? n : 1;
}
