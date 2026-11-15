/**
 * PLAUSIBILIDADE DE PREÇO POR TIPO (dono, 2026-11-15, decisão 3: quarentena em lote SEM barreira de extração).
 * Pura (sem banco, sem server-only): serve ao script de lote, à coleta (gancho em recordPriceSnapshot) e aos testes.
 * O preço continua sendo LIDO e gravado; a quarentena só tira a oferta da vitrine, das médias e das mensagens.
 *
 * Regras (a primeira que bater vence):
 *   1. preço <= 0: não julga.
 *   2. piso absoluto: abaixo de R$ 3,00 é isca/erro em qualquer tipo (item miúdo de R$ 3,99 a R$ 4,99 é do porteiro, não desta regra).
 *   3. teto absoluto geral: R$ 150.000 (nada do catálogo de consumo custa isso; 1000x de erro de moeda cai aqui).
 *   4. teto por tipo (vertical/product_type), com exceção de "caro por natureza" (drone, câmera, receiver, impressora 3D, TV, notebook...), que sobe ao teto geral
 *      e passa a ser julgado só pela faixa relativa ao master.
 *   5. faixa relativa: com >= 2 outras ofertas ativas do mesmo master (3+ no total), abaixo de 35% ou acima de 300% da mediana das outras.
 */

export const PISO_ABSOLUTO_CENTS = 300;
export const TETO_ABSOLUTO_GERAL_CENTS = 15_000_000;
export const RAZAO_MIN = 0.35;
export const RAZAO_MAX = 3;
export const MIN_REFERENCIAS = 2;

/** Teto por tipo de produto, em centavos. Chave: `${vertical}/${product_type}`; cai em `${vertical}` e depois em padrão. */
export const TETO_POR_TIPO_CENTS: Record<string, number> = {
  'games/game': 800_000,
  'games/console': 1_500_000,
  'games/accessory': 1_000_000,
  esporte: 3_000_000,
  livros: 500_000,
  eletrodomesticos: 4_000_000,
  tecnologia: 6_000_000,
  impressao3d: 4_500_000,
  eletroeletronicos: 6_000_000,
};
export const TETO_PADRAO_CENTS = 3_000_000;

/** Itens que são caros por natureza: o teto do tipo não vale (o teto geral e a faixa relativa continuam valendo). */
export const CARO_POR_NATUREZA =
  /\b(?:drones?|c[aâ]meras?|mirrorless|dslr|receiver|receptor|projetor|impressora 3d|impressoras 3d|cortadora a laser|gravadora a laser|smart tv|tv|televis[aã]o|televisor|notebook|laptop|macbook|workstation|pc gamer|computador|servidor|geladeira|refrigerador|freezer|lava[- ]lou[cç]as|m[aá]quina de lavar|lava e seca|ar[- ]condicionado|soundbar|home theater|monitor|placa de v[ií]deo|rtx|oscilosc[oó]pio|scanner 3d|rob[oô] aspirador|fog[aã]o|forno|bicicleta el[eé]trica|patinete el[eé]trico|piano|sintetizador|mesa de som)\b/i;

export type MotivoPreco =
  | 'preco_irrisorio_abaixo_do_piso'
  | 'preco_acima_do_teto_absoluto'
  | 'preco_acima_do_teto_do_tipo'
  | 'preco_abaixo_de_35pct_da_mediana'
  | 'preco_acima_de_300pct_da_mediana';

/** Master de console mal tipado como 'game' (ex.: Switch 2 edição Zelda, PS5 Slim): vale o teto de console, não o de jogo. */
const TITULO_DE_CONSOLE = /\bconsole\b|\bswitch ?2\b|\bps ?5 (?:slim|pro|digital)\b|\bplaystation ?5\b|\bxbox series [sx]\b/i;

export function tetoDoTipo(vertical: string, productType: string, titulo: string): number {
  if (vertical === 'games' && productType === 'game' && TITULO_DE_CONSOLE.test(titulo)) return TETO_POR_TIPO_CENTS['games/console'];
  const base = TETO_POR_TIPO_CENTS[`${vertical}/${productType}`] ?? TETO_POR_TIPO_CENTS[vertical] ?? TETO_PADRAO_CENTS;
  if (vertical === 'games' && productType === 'console') return base; // console nunca é "caro por natureza": o teto vale
  return CARO_POR_NATUREZA.test(titulo) ? TETO_ABSOLUTO_GERAL_CENTS : base;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface EntradaPreco {
  priceCents: number;
  vertical: string;
  productType: string;
  titulo: string;
  /** Preços (centavos) das OUTRAS ofertas ativas, fora de quarentena, do mesmo master. */
  referenciasCents?: number[];
}

/** Só a parte ABSOLUTA (não precisa de referência): é o que o gancho da coleta aplica a cada leitura. */
export function avaliarPrecoAbsoluto(e: Omit<EntradaPreco, 'referenciasCents'>): MotivoPreco | null {
  const p = e.priceCents;
  if (!Number.isFinite(p) || p <= 0) return null;
  if (p < PISO_ABSOLUTO_CENTS) return 'preco_irrisorio_abaixo_do_piso';
  if (p > TETO_ABSOLUTO_GERAL_CENTS) return 'preco_acima_do_teto_absoluto';
  if (p > tetoDoTipo(e.vertical, e.productType, e.titulo)) return 'preco_acima_do_teto_do_tipo';
  return null;
}

export function avaliarPrecoRelativo(priceCents: number, referenciasCents: number[]): MotivoPreco | null {
  if (referenciasCents.length < MIN_REFERENCIAS) return null;
  const m = mediana(referenciasCents);
  if (m == null || m <= 0) return null;
  if (priceCents < m * RAZAO_MIN) return 'preco_abaixo_de_35pct_da_mediana';
  if (priceCents > m * RAZAO_MAX) return 'preco_acima_de_300pct_da_mediana';
  return null;
}

/** Veredito completo (absoluto + relativo). null = plausível. */
export function avaliarPrecoPlausivel(e: EntradaPreco): MotivoPreco | null {
  return avaliarPrecoAbsoluto(e) ?? avaliarPrecoRelativo(e.priceCents, e.referenciasCents ?? []);
}
