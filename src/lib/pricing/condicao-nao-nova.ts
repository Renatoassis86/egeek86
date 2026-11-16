/**
 * R-75 (AUD-14): gatilho permanente de CONDIÇÃO NÃO NOVA no título da oferta (R-10/R-12: só produto novo e em linha; Open Box fora). PURO.
 * Oferta ATIVA cujo título declara Open Box, vitrine (de loja) ou mostruário vai para quarentena reversível com motivo; nunca entra em média,
 * mínimo, selo, mensagem nem vitrine. "Outlet" NÃO entra aqui: condição ambígua, decisão do dono (AUD-14, pendente).
 * Flag CONDICAO_NAO_NOVA: '0' desliga a varredura (padrão ligada).
 */
export const MOTIVO_CONDICAO_NAO_NOVA = 'condicao_nao_nova_open_box_vitrine';
const RE = /(open[\s-]?box|(^|[^a-zà-ú])de\s+vitrine([^a-zà-ú]|$)|(^|[^a-zà-ú])modelo\s+vitrine([^a-zà-ú]|$)|(^|[^a-zà-ú])vitrine([^a-zà-ú]|$)|mostru[aá]rio)/i;
/** Vitrine como PRODUTO (expositor/estante), não como condição do item. */
const VITRINE_PRODUTO = /(expositor|estante|nicho|display|suporte|prateleira|cristaleira|armario|armário|acrilic|case\s+para)/i;

export function condicaoNaoNova(titulo: string | null | undefined): boolean {
  const t = titulo ?? '';
  if (!RE.test(t)) return false;
  if (/open[\s-]?box|mostru[aá]rio/i.test(t)) return true;
  return !VITRINE_PRODUTO.test(t);
}
export const condicaoNaoNovaLigada = (env: Record<string, string | undefined> = process.env): boolean => env.CONDICAO_NAO_NOVA !== '0';
/** Regex equivalente para o Postgres (`~*`), usada na varredura; o teste garante que bate com `condicaoNaoNova`. */
export const CONDICAO_NAO_NOVA_PG = '(open[[:space:]-]?box|(^|[^a-zà-ú])vitrine([^a-zà-ú]|$)|mostru[aá]rio)';
