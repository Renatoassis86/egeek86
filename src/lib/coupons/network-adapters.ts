// PONTOS DE ENCAIXE por rede para o Agente de Cupons. Declarativo e puro: diz o que cada rede tem, o que falta e quem decide.
// 2026-11-11: o dono autorizou a leitura de cupom da Shopee e da Amazon pela página do item (aba logada do Chrome dele).
//  - Leitura por anúncio -> `offer_coupon_reads` com source 'amazon-pagina' / 'shopee-pagina' (src/lib/coupons/page-read.ts,
//    src/server/coupons/page-reads.ts). Fila por rede e POST de leituras: /api/ingest/cupons-revalidar?rede=amazon|shopee.
//  - Código do dono -> /admin/cupons-campanha (ML, Shopee e Amazon).
//  - Redes ligadas em ITEM_READ_NETWORKS / LIST_NETWORKS (src/lib/coupons/agulha.ts). Sem isso a mensagem NUNCA leva cupom da rede.
//  - `status 'ativo'` aqui = o código está pronto e passa nos testes; leitura real só existe depois que o Chrome do dono rodar o loop
//    (scripts/chrome/cupons-leitura-loop.js). Enquanto não há leitura, a mensagem sai sem cupom (motivo sem_leitura).

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
    status: 'ativo',
    itemRead: 'ativo',
    listRead: 'sem_fonte_de_comprador',
    ownerCode: 'ativo',
    falta: [
      'Leitura real depende do loop no Chrome logado na Shopee (scripts/chrome/cupons-leitura-loop.js); seletores da página não foram validados em produção.',
      'Voucher de comprador sem preço final na página só vira preço se o selo trouxer a regra (% ou R$); selo sem regra legível é descartado.',
      'A URL de leitura é o link oficial da oferta (redireciona pelo link de afiliado): o dono decide se aceita o clique próprio.',
      'shopee_campaigns são campanhas de comissão do programa (links por categoria), NÃO cupom de comprador: nunca viram cupom de mensagem.',
    ],
  },
  amazon: {
    network: 'amazon',
    status: 'ativo',
    itemRead: 'ativo',
    listRead: 'sem_fonte_de_comprador',
    ownerCode: 'ativo',
    falta: [
      'Leitura real depende do loop no Chrome logado na Amazon (scripts/chrome/cupons-leitura-loop.js); seletores do selo de cupom não foram validados em produção.',
      'Amazon não tem lista pública de cupons por loja; o cupom nasce do anúncio. A Amazon quase nunca mostra o preço final na página: o preço é derivado da regra escrita no selo (status derivado_do_rotulo).',
      'Cupom exclusivo (Prime, novos usuários) é barrado pelo rótulo; cupom que exige ação ("marcar") entra com o aviso para marcar antes de pagar.',
    ],
  },
};

export function adapterFor(network: string): CouponNetworkAdapter | null {
  return (COUPON_ADAPTERS as Record<string, CouponNetworkAdapter>)[network] ?? null;
}
