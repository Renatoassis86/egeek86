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
  /**
   * Amazon (R-81, dono 2026-11-16): o preço da Amazon mexe em horas (a P2S Combo subiu R$ 1.000 entre duas leituras) e o link vai direto para a página.
   * Preço de Amazon só é dito (mensagem, card OU lista) com leitura de até 45 min; sem isso a oferta NÃO entra (nunca preço velho). Ajuste: AMAZON_FRESCOR_MIN.
   */
  QUEDA_MIN_AMAZON: 45,
  LISTA_MIN_AMAZON: 45,
  /** Lista: preço confirmado há no máximo isto (min). */
  LISTA_MIN: 360,
} as const;

/** Frescor máximo do preço da Amazon (min). Padrão 45; AMAZON_FRESCOR_MIN válido (10..360) sobrescreve. */
export function amazonFrescorMin(env: Record<string, string | undefined> = process.env): number {
  const n = Number((env.AMAZON_FRESCOR_MIN ?? '').trim());
  return Number.isFinite(n) && n >= 10 && n <= 360 ? Math.round(n) : CONFIRMACAO.LISTA_MIN_AMAZON;
}

export type UsoPreco = 'queda' | 'lista';
export type MotivoConfirmacao =
  | 'oferta_inativa'
  | 'em_quarentena'
  | 'sumiu_da_api'
  | 'sem_confirmacao'
  | 'confirmacao_velha'
  | 'link_de_outro_anuncio'
  | 'troca_de_anuncio'
  | 'link_divergente'
  | 'sem_veredito_ok'
  | 'sem_anuncio_concreto'
  | 'veredito_obsoleto'
  | 'amazon_fora_das_mensagens';

export function confirmacaoLigada(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.CONFIRMACAO_PRECO_MENSAGEM ?? '').trim());
}

/** Vereditos da auditoria de links (offer_link_audit) que tiram a oferta de mensagem e lista. erro_leitura e oferta nunca auditada NÃO bloqueiam (fail-open). */
/**
 * CONTENÇÃO #120 (2026-11-15): a página da Amazon mostrou R$ 8.499,90 (oferta em destaque) e a lista do privado disse R$ 8.074,99 ("Parcelas sem
 * juros") com prazo de outro bloco. Até a correção do leitor estar provada, NENHUMA oferta da Amazon sai em mensagem (lista, card, queda, grupos, canal).
 * Flag AMAZON_FORA_DAS_MENSAGENS: ligada por padrão (Amazon fora); '0' | 'off' | 'false' | 'nao' desliga.
 */
export function amazonForaDasMensagens(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.AMAZON_FORA_DAS_MENSAGENS ?? '').trim());
}
/** Flag AMAZON_PRIVADO (padrão LIGADA): a Amazon volta ao privado das impressoras mesmo com a contenção geral (AMAZON_FORA_DAS_MENSAGENS) ligada; '0'|'off'|'false'|'nao' desliga. */
export function amazonNoPrivado(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.AMAZON_PRIVADO ?? '').trim());
}
export function redeForaDasMensagens(rede: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return /amazon/i.test(rede ?? '') && amazonForaDasMensagens(env);
}

export const VEREDITOS_BLOQUEANTES = ['preco_divergente', 'item_diferente', 'pausado', 'sem_link', 'pendente_de_anuncio'] as const;
/** Auditoria mais velha que isto não vale (a página pode ter mudado). */
export const AUDITORIA_VALE_MIN = 360;

export interface FatosConfirmacao {
  /** Último veredito da auditoria do link (a página do link x a oferta). */
  auditoria?: { verdict: string; checkedAt: Date; okEm?: Date | null } | null;
  /** REGRA RÍGIDA (privado do dono, #119): exige veredito `ok` da auditoria nas últimas 6 h; sem veredito ou só erro_leitura = não sai. */
  estrito?: boolean;
  /** Liberação da contenção #120 SÓ para o privado do dono (P2S/P1S Combo): Amazon vale pela confirmação fresca (<= 5 min na queda, 6 h na lista) e leitor da oferta em destaque. */
  liberaAmazon?: boolean;
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
  /** external_ref (catálogo): o anúncio concreto não pode ser igual a ele. */
  catalogoRef?: string | null;
  /** Anúncio para o qual o link afiliado aponta (link_item_id, ou o id da URL). */
  linkItemId?: string | null;
  /** last_price_change_at e item_trocado_at: um veredito ok anterior a eles não vale (corrida coleta x envio). */
  precoMudouEm?: Date | null;
  itemTrocadoEm?: Date | null;
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
  sem_anuncio_concreto: 'oferta sem anúncio concreto gravado (só o catálogo é conhecido)',
  veredito_obsoleto: 'o preço ou o anúncio mudou depois do último veredito ok (precisa auditar de novo)',
  sem_veredito_ok: 'sem veredito ok da auditoria do link nas últimas 6 h (fica na fila para auditar)',
  link_divergente: 'a página do link mostra outro anúncio, outro preço ou anúncio pausado (auditoria de links)',
  amazon_fora_das_mensagens: 'contenção #120: ofertas da Amazon fora das mensagens até o preço da oferta em destaque estar provado (AMAZON_FORA_DAS_MENSAGENS)',
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
 * Parte da AUDITORIA do porteiro (veredito da página do link). Bloqueante recente barra sempre. No modo estrito (privado; canal com
 * CONFIRMACAO_ESTRITA_CANAL): ML exige anúncio concreto e veredito ok <= 6 h posterior à última mudança de preço/troca de anúncio.
 * Amazon e Shopee não têm página auditada: no estrito valem pela janela de confirmação (avaliarConfirmacao), sem veredito.
 */
export function avaliarAuditoria(f: Pick<FatosConfirmacao, 'rede' | 'auditoria' | 'estrito' | 'priceItemId' | 'catalogoRef' | 'precoMudouEm' | 'itemTrocadoEm' | 'now'>): Veredito {
  const recente = (d: Date) => (f.now.getTime() - d.getTime()) / 60_000 <= AUDITORIA_VALE_MIN;
  if (f.auditoria && (VEREDITOS_BLOQUEANTES as readonly string[]).includes(f.auditoria.verdict) && recente(f.auditoria.checkedAt)) return falha('link_divergente');
  const ml = /mercado/i.test(f.rede);
  if (!f.estrito || !ml) return { ok: true };
  const item = (f.priceItemId ?? '').trim();
  if (!(/^MLB\d{6,}$/.test(item) && item !== (f.catalogoRef ?? '').trim())) return falha('sem_anuncio_concreto');
  const okEm = f.auditoria?.verdict === 'ok' ? f.auditoria.checkedAt : f.auditoria?.okEm ?? null;
  if (!okEm || !recente(okEm)) return falha('sem_veredito_ok');
  const mudou = Math.max(f.precoMudouEm?.getTime() ?? 0, f.itemTrocadoEm?.getTime() ?? 0);
  if (mudou > okEm.getTime()) return falha('veredito_obsoleto');
  return { ok: true };
}

/** Flag CONFIRMACAO_ESTRITA_CANAL (padrão DESLIGADA): estende o modo estrito a grupos e canal (live-recheck). */
export function estritaCanalLigada(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|on|true|sim)$/i.test((env.CONFIRMACAO_ESTRITA_CANAL ?? '').trim());
}

/**
 * Modo estrito do canal/grupos POR ESCOPO (decisão do dono com o revisor, rodada 2): `CONFIRMACAO_ESTRITA_CANAL_ESCOPO=bambu` liga o estrito
 * só para impressoras Bambu Lab (ML e Amazon); `CONFIRMACAO_ESTRITA_CANAL=1` liga para tudo. Fora do escopo vale o fail-open (veredito ruim bloqueia).
 */
export function estritoCanalPara(ehBambu: boolean | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (estritaCanalLigada(env)) return true;
  return /^bambu$/i.test((env.CONFIRMACAO_ESTRITA_CANAL_ESCOPO ?? '').trim()) && !!ehBambu;
}

/**
 * O preço desta oferta pode ser dito agora? Ordem: ativa e fora da quarentena; anúncio achado na última coleta; confirmação existente e
 * dentro da janela do uso; o link aponta para o mesmo anúncio do preço (quando os dois são conhecidos).
 * Desligada pela flag: sempre ok (comportamento antigo).
 */
export function avaliarConfirmacao(f: FatosConfirmacao, ligada = true): Veredito {
  if (redeForaDasMensagens(f.rede) && !f.liberaAmazon) return falha('amazon_fora_das_mensagens');
  if (!ligada) return { ok: true };
  if (f.status !== 'active') return falha('oferta_inativa');
  if (f.quarantined) return falha('em_quarentena');
  if ((f.missCount ?? 0) > 0) return falha('sumiu_da_api');
  if (!f.confirmedAt) return falha('sem_confirmacao');
  const limite = /amazon/i.test(f.rede) ? amazonFrescorMin() : f.uso === 'lista' ? CONFIRMACAO.LISTA_MIN : CONFIRMACAO.QUEDA_MIN;
  const idadeMin = (f.now.getTime() - f.confirmedAt.getTime()) / 60_000;
  if (idadeMin > limite) return falha('confirmacao_velha');
  const aud = avaliarAuditoria(f);
  if (!aud.ok) return aud;
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

/**
 * Precedência página x coletor (rodada 4, achado 30): a API de catálogo do ML pode demorar horas para refletir o preço que a página já mostra
 * (2d875e9b: página R$ 9.399 às 22:21, API ainda R$ 9.230 às 23:00; hoje a API diz 9.399). Depois de uma correção pela página, o valor ANTIGO
 * que ela substituiu não pode ser regravado pelo coletor por 2 h. A nota do veredito de correção é `corrigido de <veredito>; antes <centavos>`.
 */
export const REJEICAO_JANELA_MIN = 120;
export function precoRejeitadoDaNota(nota: string | null | undefined): number | null {
  const m = /^corrigido de [a-z_]+; antes (\d{3,9})$/.exec((nota ?? '').trim());
  return m ? Number(m[1]) : null;
}
export function deveIgnorarPrecoRejeitado(e: { nota: string | null | undefined; priceCents: number }): boolean {
  const r = precoRejeitadoDaNota(e.nota);
  return r != null && r === e.priceCents;
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

/** Flag RIGIDO_PRIVADO: regra rígida no privado do dono, ligada por padrão; '0'/'off' desliga. */
export function rigidoPrivadoLigado(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false)$/i.test((env.RIGIDO_PRIVADO ?? '').trim());
}

/**
 * Escrita (invariante 2/3, #119): o preço da oferta é o do anúncio do LINK. Anúncio irmão (id diferente do link) lido enquanto o anúncio do link
 * foi confirmado há menos de 3 h NÃO substitui preço nem link (era o que fazia a 93607216 mostrar R$ 8.749 com link de R$ 9.978). Com o do link
 * sem leitura há mais de 3 h (provável pausado) o irmão assume. Sem link conhecido: não ignora.
 */
export function deveIgnorarAnuncioIrmao(e: { linkItemId: string | null; itemNovo: string | null; confirmadoEm: Date | null; now: Date }): boolean {
  if (!e.linkItemId || !e.itemNovo || mesmoAnuncio(e.linkItemId, e.itemNovo)) return false;
  if (!e.confirmadoEm) return false;
  return (e.now.getTime() - e.confirmadoEm.getTime()) / 60_000 <= TROCA_JANELA_MIN;
}

/** O id informado como anúncio é, na verdade, o id de catálogo da oferta (external_ref)? Nunca gravar como external_item_id. */
export function ehIdDeCatalogo(itemId: string | null | undefined, externalRef: string | null | undefined): boolean {
  return !!itemId && !!externalRef && mesmoAnuncio(itemId, externalRef);
}
