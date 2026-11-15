// R2-13 (dono, 2026-11-14): "a única restrição é não seguir produtos usados e retrô". O filtro de usado do título não pega o caso em que o box de compra ATIVO da
// página do item da Amazon é de usado ("Usado - Como novo", vendido por "Amazon Quase Novo"/Warehouse). Esta função PURA lê o texto do box de compra e decide.
// Sem banco, sem rede, sem server-only: testada em scripts/test-usado-lido-na-pagina.ts.

export interface UsadoLido { usado: boolean; termo: string | null }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * `texto` = texto do box de compra (buybox) e do bloco do vendedor da página do item, NÃO a página inteira (o link "Novos e usados: 2 a partir de" existe em
 * página de produto novo e não conta). Conta como usado: condição "Usado - ..." (Como novo, Muito bom, Bom, Aceitável), "Amazon Quase Novo", Warehouse e Reembalado.
 */
export function usadoLidoNaPagina(texto: unknown): UsadoLido {
  const t = norm(String(texto ?? '')).slice(0, 1500);
  if (!t) return { usado: false, termo: null };
  const padroes: Array<[string, RegExp]> = [
    ['usado_condicao', /\busado\s*[-–—:]\s*(como novo|muito bom|bom|aceitavel)\b/],
    ['amazon_quase_novo', /\bquase novo\b/],
    ['warehouse', /\bwarehouse\b/],
    ['reembalado', /\breembalad[oa]s?\b/],
    ['condicao_usado', /\bcondicao\s*:?\s*usad[oa]\b/],
  ];
  for (const [nome, re] of padroes) if (re.test(t)) return { usado: true, termo: nome };
  return { usado: false, termo: null };
}
