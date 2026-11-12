/**
 * Nome e código do cupom lidos na página (migration 0049: offer_coupon_reads.coupon_name / coupon_code). Mesmo molde da 0047: o código só grava as
 * colunas com CUPOM_NOME_COLUNAS=1, depois da migration aplicada. Enquanto isso o POST aceita e valida name/code mas não os guarda (a mensagem
 * cai no passo a passo do tipo (b) ou no título da lista de cupons). A leitura é tolerante a coluna ausente (to_jsonb).
 */
export function nomeColunasLigadas(env: Record<string, string | undefined> = process.env): boolean {
  return env.CUPOM_NOME_COLUNAS === '1';
}
