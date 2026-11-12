// Puro (sem banco, sem rede). Cor de fundo PRÓPRIA por loja (departamento) nos cartões de mensagem, para identificação rápida
// (pedido do dono, 2026-11-12; ata docs/conselho/atas/2026-11-12-calcados-afiliacao-cores.md).
//
// Regras: tons ESCUROS e dessaturados (luminância relativa < 0.03) para manter o tema premium dark e o contraste AA do texto creme
// (#F2E9D8, 4.5:1 exigido; medido em scripts/test-cor-loja.ts). A régua de calor (azul, verde, amarelo, laranja, vermelho) usa cores
// saturadas e vem em faixa/selo próprios no topo: o fundo da loja nunca é uma cor da régua em saturação cheia, só um matiz escuro.
// FLAG: CARD_COR_LOJA=0 devolve o fundo único antigo (#0B0908) em todos os cartões (reversível sem deploy de código).

export const COR_LOJA_ATIVA = process.env.CARD_COR_LOJA !== '0';
export const FUNDO_PADRAO = '#0B0908';

/** Fundo do cartão por departamento. Games violeta, Impressão 3D petróleo, Tecnologia marinho, Livros ameixa, Casa terra, Eletrônicos ardósia, Esporte pinho. */
export const COR_FUNDO_LOJA: Readonly<Record<string, string>> = {
  games: '#2B1760',
  impressao3d: '#0B3D40',
  tecnologia: '#0F2B6B',
  livros: '#4D1239',
  eletrodomesticos: '#4D2D10',
  eletroeletronicos: '#33363D',
  esporte: '#104522',
};

export function fundoDaLoja(vertical: string | null | undefined): string {
  if (!COR_LOJA_ATIVA || !vertical) return FUNDO_PADRAO;
  return COR_FUNDO_LOJA[vertical] ?? FUNDO_PADRAO;
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Razão de contraste WCAG entre dois #RRGGBB. */
export function contraste(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
