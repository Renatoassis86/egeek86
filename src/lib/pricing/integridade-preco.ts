// Módulo único `integridade-preco` (PURO, #119): as 6 invariantes que impedem a divergência entre o que a mensagem diz e o que a página mostra.
//   1. Toda oferta ML ativa tem anúncio concreto (external_item_id MLB..., nunca o id do catálogo).
//   2. O preço é o desse anúncio; trocar de anúncio zera previous_price e invalida o link.
//   3. O link afiliado aponta para esse mesmo anúncio (verificado pela leitura da página: offer_link_audit).
//   4. Anúncio que sumiu da coleta expira.
//   5. Pausado/encerrado/sem estoque = inativo e fora de tudo.
//   6. Anúncio com variações de preço diferentes: preço com contexto ("a partir de R$ X").
// Aplicação: na ESCRITA (recordPriceSnapshot com itemId, decidirTrocaDeAnuncio), no LINK (alinharLinkAoAnuncio, auditoria) e na MENSAGEM
// (avaliarConfirmacao, live-recheck). Este arquivo reúne as decisões puras em um só lugar e reexporta o porteiro.

export {
  avaliarConfirmacao, confirmacaoLigada, decidirTrocaDeAnuncio, itemIdDaUrl, mesmoAnuncio, planejarLinkDoAnuncio, quedaDoMesmoAnuncio, rigidoPrivadoLigado,
  CONFIRMACAO, VEREDITOS_BLOQUEANTES,
} from '@/lib/messaging/confirmacao-preco';

export interface AnuncioCatalogo { item_id: string; price: number; original_price: number | null; condition: string | null }

/** id de ANÚNCIO ML? (MLB + dígitos). O id de catálogo tem o mesmo formato: quem chama compara com `external_ref`. */
export function anuncioConcreto(itemId: string | null | undefined, catalogoRef?: string | null): boolean {
  const i = (itemId ?? '').trim();
  return /^MLB\d{6,}$/.test(i) && i !== (catalogoRef ?? '').trim();
}

/** Anúncio do vendedor a gravar: o do link, se estiver na lista; senão o mais barato (anúncios novos). Vazio = null. */
export function escolherAnuncio(anuncios: AnuncioCatalogo[], linkItemId: string | null): AnuncioCatalogo | null {
  const novos = anuncios.filter((a) => a.condition === 'new' || a.condition == null).sort((a, b) => a.price - b.price);
  if (!novos.length) return null;
  const digitos = (s: string) => s.replace(/\D/g, '');
  return (linkItemId ? novos.find((a) => digitos(a.item_id) === digitos(linkItemId)) : undefined) ?? novos[0]!;
}

export type Invariante = 'I1_sem_anuncio_concreto' | 'I3_link_de_outro_anuncio' | 'I4_sumiu_da_coleta' | 'I5_inativa' | 'I6_variacao_sem_contexto';

export interface FatosIntegridade {
  rede: string;
  status: string;
  externalItemId: string | null;
  externalRef: string | null;
  linkItemId: string | null;
  missCount: number;
  /** variant_min_cents/variant_max_cents da oferta (quando o anúncio tem variações com preços diferentes). */
  variantMinCents?: number | null;
  variantMaxCents?: number | null;
}

/** Violações das invariantes de UMA oferta. Lista vazia = íntegra. Só ML tem anúncio/link; Amazon e Shopee só I4/I5. */
export function violacoes(f: FatosIntegridade): Invariante[] {
  const v: Invariante[] = [];
  const ml = /mercado/i.test(f.rede);
  if (f.status !== 'active') v.push('I5_inativa');
  if (f.missCount > 0) v.push('I4_sumiu_da_coleta');
  if (ml) {
    if (!anuncioConcreto(f.externalItemId, f.externalRef)) v.push('I1_sem_anuncio_concreto');
    if (f.linkItemId && f.externalItemId && f.linkItemId.replace(/\D/g, '') !== f.externalItemId.replace(/\D/g, '')) v.push('I3_link_de_outro_anuncio');
  }
  if (f.variantMinCents && f.variantMaxCents && f.variantMaxCents > f.variantMinCents) v.push('I6_variacao_sem_contexto');
  return v;
}

/** Texto de preço com contexto de variação (invariante 6): "a partir de R$ X" quando há faixa; senão o preço simples. */
export function textoPrecoComVariacao(centsAtual: number, min?: number | null, max?: number | null, rotuloVariacao?: string | null): string {
  const brl = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (min && max && max > min) return `a partir de ${brl(min)}${rotuloVariacao ? ` (${rotuloVariacao})` : ''}`;
  return brl(centsAtual);
}
