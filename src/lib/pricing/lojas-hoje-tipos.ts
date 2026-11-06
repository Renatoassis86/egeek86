// Tipos e constantes do painel "Lojas de hoje" que o componente cliente também usa. Sem dependências (não puxa regra de preço para o
// JavaScript do cliente). A regra em si fica em `lojas-hoje.ts`.

/** Linhas visíveis de cara; o resto fica em "ver as outras" (recolhido), para a altura da caixa ser previsível. */
export const LOJAS_LINHAS_VISIVEIS = 8;

export interface LojaHojeLinha {
  vendedor: string | null;
  rede: string;
  cents: number;
  /** Última checagem (ISO). */
  checkedAtIso: string;
  baixaReputacao: boolean;
  /** Fora da faixa de preço plausível do dia (mesma régua do valor do meio): aparece, mas não entra na contagem de lojas nem no valor do meio. */
  foraDaFaixa: boolean;
}

export interface LojasHoje {
  /** Ofertas frescas elegíveis (igual a `now.freshOffers` do preço agora). */
  total: number;
  /** Lojas distintas (vendedor, ou a rede se faltar) dentro da faixa: igual a `stores.count` do cartão. */
  lojasDistintas: number;
  /** Ordenadas por menor preço (empate: vendedor, rede). */
  linhas: LojaHojeLinha[];
}

/** Linhas que o skeleton precisa reservar (altura fixa por linha): as visíveis + 1 linha do "ver as outras" se houver mais. */
export function linhasReservadas(totalOfertas: number): number {
  if (totalOfertas <= 0) return 0;
  return totalOfertas <= LOJAS_LINHAS_VISIVEIS ? totalOfertas : LOJAS_LINHAS_VISIVEIS + 1;
}
