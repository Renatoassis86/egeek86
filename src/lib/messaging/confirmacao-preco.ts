// Porteiro central de CONFIRMAÇÃO DE PREÇO para mensagem e exibição (#119, 2026-11-15). PURO: sem banco, sem rede, sem relógio.
//
// Origem: queda "R$ 3.826 -> R$ 3.519,92" do A1 Combo (ACLAPACOMERCIO) no privado. A oferta é (produto, rede, vendedor); a cada ciclo o coletor
// grava o MENOR anúncio do vendedor, sem registrar qual. O link meli.la foi gerado para o anúncio MLB5563781513 (18:28), hoje pausado, e o
// preço lido era de outro anúncio: a "queda" foi troca de anúncio, o link caiu em "Anúncio pausado" e `last_price_confirmed_at` era nulo.
// A lista do privado só olhava `last_checked_at` (carimbado sem preço). Esta regra vale para mensagem de queda, lista e card (grupos, canal
// e privado) e NÃO barra a entrada do produto: só decide se o preço pode ser dito agora.
//
// Flag CONFIRMACAO_PRECO_MENSAGEM: ligada por padrão; '0' | 'off' | 'false' desliga.

export const CONFIRMACAO = {
  /** Mensagem de queda/card: preço confirmado na API há no máximo isto (min). */
  QUEDA_MIN: 60,
  /** Amazon: a coleta assistida roda a cada ~2 h; a janela acompanha o ciclo (honesto: não é 60 min). */
  QUEDA_MIN_AMAZON: 130,
  /** Lista: preço confirmado há no máximo isto (min). */
  LISTA_MIN: 360,
} as const;

export type UsoPreco = 'queda' | 'lista';
export type MotivoConfirmacao =
  | 'oferta_inativa'
  | 'em_quarentena'
  | 'sumiu_da_api'
  | 'sem_confirmacao'
  | 'confirmacao_velha'
  | 'link_de_outro_anuncio'
  | 'troca_de_anuncio'
  | 'link_divergente';

export function confirmacaoLigada(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.CONFIRMACAO_PRECO_MENSAGEM ?? '').trim());
}

/** Vereditos da auditoria de links (offer_link_audit) que tiram a oferta de mensagem e lista. erro_leitura e oferta nunca auditada NÃO bloqueiam (fail-open). */
export const VEREDITOS_BLOQUEANTES = ['preco_divergente', 'item_diferente', 'pausado', 'sem_link'] as const;
/** Auditoria mais velha que isto não vale (a página pode ter mudado). */
export const AUDITORIA_VALE_MIN = 360;

export interface FatosConfirmacao {
  /** Último veredito da auditoria do link (a página do link x a oferta). */
  auditoria?: { verdict: string; checkedAt: Date } | null;
  uso: UsoPreco;
  /** 'mercado-livre' | 'amazon' | 'shopee' | outra (slug da rede). */
  rede: string;
  status: string;
  quarantined?: boolean;
  /** last_price_confirmed_at: a API/página devolveu preço neste instante. */
  confirmedAt: Date | null;
  /** consecutive_miss_count: > 0 = a última coleta NÃO achou o anúncio (pausado, encerrado ou sem estoque). */
  missCount?: number | null;
  /** Anúncio cujo preço está gravado (external_item_id). */
  priceItemId?: string | null;
  /** Anúncio para o qual o link afiliado aponta (link_item_id, ou o id da URL). */
  linkItemId?: string | null;
  now: Date;
}

export interface Veredito {
  ok: boolean;
  motivo?: MotivoConfirmacao;
  /** Texto curto para log e para a lista ("preço a confirmar"). */
  nota?: string;
}

const NOTA: Record<MotivoConfirmacao, string> = {
  oferta_inativa: 'oferta inativa',
  em_quarentena: 'oferta em quarentena',
  sumiu_da_api: 'anúncio não apareceu na última coleta (pausado, encerrado ou sem estoque)',
  sem_confirmacao: 'preço nunca confirmado na API',
  confirmacao_velha: 'preço sem confirmação recente',
  link_de_outro_anuncio: 'o link leva a outro anúncio, não ao que tem o preço lido',
  link_divergente: 'a página do link mostra outro anúncio, outro preço ou anúncio pausado (auditoria de links)',
  troca_de_anuncio: 'o preço lido é de outro anúncio do vendedor (troca de anúncio, não queda)',
};

const falha = (motivo: MotivoConfirmacao): Veredito => ({ ok: false, motivo, nota: NOTA[motivo] });

/** Mesmo id de anúncio? Compara só os dígitos (aceita "MLB-123" e "MLB123"). */
export function mesmoAnuncio(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? '').replace(/\D/g, '');
  const y = (b ?? '').replace(/\D/g, '');
  return x.length > 0 && x === y;
}

/** Id do anúncio ML (MLB123...) a partir de URL de anúncio; link curto meli.la e URL de catálogo (/p/MLB) não identificam anúncio. */
export function itemIdDaUrl(url: string | null | undefined): string | null {
  if (!url || /meli\.la/i.test(url) || /\/p\/MLB/i.test(url)) return null;
  const m = /\/(MLB)-?(\d{6,})/i.exec(url);
  return m ? `MLB${m[2]}` : null;
}

/**
 * O preço desta oferta pode ser dito agora? Ordem: ativa e fora da quarentena; anúncio achado na última coleta; confirmação existente e
 * dentro da janela do uso; o link aponta para o mesmo anúncio do preço (quando os dois são conhecidos).
 * Desligada pela flag: sempre ok (comportamento antigo).
 */
export function avaliarConfirmacao(f: FatosConfirmacao, ligada = true): Veredito {
  if (!ligada) return { ok: true };
  if (f.status !== 'active') return falha('oferta_inativa');
  if (f.quarantined) return falha('em_quarentena');
  if ((f.missCount ?? 0) > 0) return falha('sumiu_da_api');
  if (!f.confirmedAt) return falha('sem_confirmacao');
  const limite = f.uso === 'lista' ? CONFIRMACAO.LISTA_MIN : /amazon/i.test(f.rede) ? CONFIRMACAO.QUEDA_MIN_AMAZON : CONFIRMACAO.QUEDA_MIN;
  const idadeMin = (f.now.getTime() - f.confirmedAt.getTime()) / 60_000;
  if (idadeMin > limite) return falha('confirmacao_velha');
  if (f.auditoria && (VEREDITOS_BLOQUEANTES as readonly string[]).includes(f.auditoria.verdict) && (f.now.getTime() - f.auditoria.checkedAt.getTime()) / 60_000 <= AUDITORIA_VALE_MIN) return falha('link_divergente');
  if (f.linkItemId && f.priceItemId && !mesmoAnuncio(f.linkItemId, f.priceItemId)) return falha('link_de_outro_anuncio');
  return { ok: true };
}

/**
 * "Queda" só existe entre leituras do MESMO anúncio. Anúncio anterior e atual conhecidos e diferentes = troca de anúncio (não é queda).
 * Anúncio anterior desconhecido (lista antiga) com atual conhecido: aceita (compatibilidade).
 */
export function quedaDoMesmoAnuncio(anteriorItemId: string | null | undefined, atualItemId: string | null | undefined): boolean {
  if (!anteriorItemId || !atualItemId) return true;
  return mesmoAnuncio(anteriorItemId, atualItemId);
}

export interface PlanoLink {
  affiliateUrl: string;
  linkItemId: string;
  /** true = ainda sem rastreio de afiliado (sem MELI_TOOL_ID): o /go não redireciona (link em ativação). */
  pending: boolean;
}

/**
 * Link do anúncio que tem o preço. O anúncio do link é `linkItemId` (gravado quando o link foi gerado) ou o id da URL. Conhecido e diferente
 * do anúncio precificado: devolve o plano para apontar o link ao anúncio certo (URL direta do anúncio com matt_tool; o gerador de links
 * regenera o meli.la depois). Desconhecido (meli.la antigo sem registro) ou igual: null (nada a fazer; o porteiro de mensagem decide).
 */
export function planejarLinkDoAnuncio(o: { affiliateUrl: string | null; linkItemId: string | null; itemPrecificado: string | null; toolId?: string | null }): PlanoLink | null {
  const novo = o.itemPrecificado?.trim();
  if (!novo || !/^MLB\d{6,}$/.test(novo)) return null;
  const atual = o.linkItemId || itemIdDaUrl(o.affiliateUrl);
  if (!atual || mesmoAnuncio(atual, novo)) return null;
  const base = `https://produto.mercadolivre.com.br/MLB-${novo.slice(3)}`;
  return { affiliateUrl: o.toolId ? `${base}?matt_tool=${o.toolId}` : base, linkItemId: novo, pending: !o.toolId };
}

export interface EntradaTroca {
  /** Anúncio ao qual a oferta está presa (external_item_id) e o preço/confirmação gravados dele. */
  itemAtual: string | null;
  precoAtualCents: number;
  confirmadoEm: Date | null;
  /** Anúncio do MESMO vendedor lido agora (em outro catálogo ou no mesmo) e o preço dele. */
  itemNovo: string;
  precoNovoCents: number;
  now: Date;
}

/** Janela em que um anúncio já preso à oferta é considerado vivo (foi lido e confirmado há menos que isto). */
export const TROCA_JANELA_MIN = 180;

/**
 * O coletor de verticais lê catálogo por catálogo e a oferta é (produto, rede, vendedor): o vendedor com anúncios em catálogos irmãos fazia o
 * preço (e o anúncio do link) ir e voltar a cada ciclo. Regra: anúncio novo igual ao preso, ou oferta sem anúncio preso, grava; anúncio
 * irmão MAIS BARATO grava (a oferta segue o menor anúncio do vendedor); anúncio irmão mais caro com o preso lido há menos de 3 h é ignorado
 * (o preso continua vivo); com o preso sem leitura há mais de 3 h (provável pausado/encerrado) o irmão assume.
 */
export function decidirTrocaDeAnuncio(e: EntradaTroca): 'gravar' | 'ignorar_irmao' {
  if (!e.itemAtual || mesmoAnuncio(e.itemAtual, e.itemNovo)) return 'gravar';
  if (e.precoNovoCents < e.precoAtualCents) return 'gravar';
  const idadeMin = e.confirmadoEm ? (e.now.getTime() - e.confirmadoEm.getTime()) / 60_000 : Infinity;
  return idadeMin <= TROCA_JANELA_MIN ? 'ignorar_irmao' : 'gravar';
}
