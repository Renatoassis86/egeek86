// PONTOS DE ENCAIXE por rede para o Agente de Cupons (item 5 do pedido de 2026-11-11). Declarativo e puro: diz o que cada rede
// já tem, o que falta e quem decide. NENHUMA leitura por página logada de Amazon ou Shopee é implementada aqui (decisão do dono pendente).
//
// Como encaixar uma rede nova quando o dono decidir (nenhuma tabela nova é necessária):
//  1. Leitura por anúncio -> gravar em `offer_coupon_reads` (offer_id é de qualquer rede; coluna `source` identifica a origem, ex.:
//     'amazon-pagina' / 'shopee-pagina'). A rota de fila (/api/ingest/cupons-revalidar) já aceita `?rede=` e o adaptador devolve a URL.
//  2. Lista de cupons/vouchers -> gravar em `coupon_items` com network_slug da rede (a CHECK já aceita 'amazon' e 'shopee').
//  3. Código do dono -> /admin/cupons-campanha (já aceita ML e Shopee).
//  4. Ligar a rede em ITEM_READ_NETWORKS / LIST_NETWORKS (src/lib/coupons/agulha.ts) e trocar `status` abaixo para 'ativo'.
//  Sem (4) a mensagem NUNCA leva cupom da rede: o motor registra `rede_sem_leitura_autorizada` na auditoria.

export type AdapterStatus = 'ativo' | 'pendente_decisao_do_dono' | 'sem_fonte_de_comprador';

export interface CouponNetworkAdapter {
  network: 'mercado-livre' | 'shopee' | 'amazon';
  status: AdapterStatus;
  /** Leitura do "preço com cupom" na página do anúncio (aba logada do dono). */
  itemRead: AdapterStatus;
  /** Lista de cupons/vouchers da loja. */
  listRead: AdapterStatus;
  /** Código digitado pelo dono em /admin/cupons-campanha. */
  ownerCode: AdapterStatus;
  /** O que falta para ligar, em linguagem de decisão. */
  falta: string[];
}

export const COUPON_ADAPTERS: Record<CouponNetworkAdapter['network'], CouponNetworkAdapter> = {
  'mercado-livre': {
    network: 'mercado-livre',
    status: 'ativo',
    itemRead: 'ativo',
    listRead: 'ativo',
    ownerCode: 'ativo',
    falta: [
      'Chrome consumir /api/ingest/cupons-revalidar (fila priorizada) no lugar de /api/ingest/cupons-item GET (mesmo formato; ambos servem a fila nova).',
      'Ler a regra (compra mínima, teto, %) de cada campanha lida no anúncio: hoje só 1 de 64 anúncios com cupom tem a regra na lista (campaign_id sem linha em coupon_items).',
    ],
  },
  shopee: {
    network: 'shopee',
    status: 'pendente_decisao_do_dono',
    itemRead: 'pendente_decisao_do_dono',
    listRead: 'pendente_decisao_do_dono',
    ownerCode: 'ativo',
    falta: [
      'Decisão do dono: ler vouchers/"preço com cupom" pela aba logada da Shopee (hoje só código digitado pelo dono).',
      'shopee_campaigns são campanhas de comissão do programa (links por categoria), NÃO cupom de comprador: nunca viram cupom de mensagem.',
      'Adaptador de leitura (extração do preço com voucher na página do item) e a fila por rede em cupons-revalidar.',
    ],
  },
  amazon: {
    network: 'amazon',
    status: 'pendente_decisao_do_dono',
    itemRead: 'pendente_decisao_do_dono',
    listRead: 'sem_fonte_de_comprador',
    ownerCode: 'pendente_decisao_do_dono',
    falta: [
      'Decisão do dono: ler o selo de cupom ("clip") e o preço com cupom na página do produto pela coleta assistida da Amazon (aba logada, 2/2 h).',
      'Amazon não tem lista pública de cupons por loja; o cupom nasce do anúncio. Encaixa em offer_coupon_reads com source = amazon-pagina.',
      'Aceitar código do dono da Amazon em /admin/cupons-campanha (hoje só ML e Shopee).',
    ],
  },
};

export function adapterFor(network: string): CouponNetworkAdapter | null {
  return (COUPON_ADAPTERS as Record<string, CouponNetworkAdapter>)[network] ?? null;
}
