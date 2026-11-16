// COFRE DE VALIDAÇÃO OBRIGATÓRIA DE CUPOM E BENEFÍCIO (R-64 a R-67, dono 2026-11-16). PURO: sem banco, sem rede, sem relógio.
//
// Problema: cupons/benefícios errados chegaram ao dono três vezes (Itaú 15% da Amazon, CUPOM ATIVO da P1S/NIC.3D, e antes as médias) porque CADA elo validava um pedaço e
// ninguém era dono da pergunta "este cupom/benefício foi PROVADO neste item, agora?" (ver docs/causa-raiz-erros-de-cupom-2026-11-16.md). Aqui a pergunta tem UMA função,
// `podeDivulgar`, e ela é o ÚNICO caminho para mensagem, card, lista, site, alerta privado e cálculo de preço final.
//
// Máquina de estados:  lido -> validado -> divulgavel -> revalidando -> revogado
//   lido        : o leitor viu o texto; NÃO é prova.
//   validado    : existe prova de um tipo aceito pelo validador da rede, ainda dentro do TTL.
//   divulgavel  : validado e liberado para o uso pedido (preço final exige prova de valor final).
//   revalidando : a prova passou da metade do TTL; segue divulgável, mas entra na fila de releitura.
//   revogado    : a prova venceu, divergiu ou foi negada por leitura mais nova; retira o aviso.
//
// PADRÃO NEGADO: rede sem validador registrado, tipo de benefício sem validador e uso não previsto = BLOQUEADO.

export type TipoProva = 'modal_oficial_do_item' | 'bloco_de_compra_escopado' | 'valor_final_impresso_pela_pagina' | 'simulacao_de_checkout';
export type UsoCupom = 'mensagem' | 'card' | 'lista' | 'site' | 'alerta_privado' | 'preco_final';
export type EstadoCofre = 'lido' | 'validado' | 'divulgavel' | 'revalidando' | 'revogado';
export type TipoItem = 'cupom' | 'beneficio';

/** TTL de cada tipo de prova, em minutos (quanto tempo a prova sustenta a divulgação). */
export const TTL_PROVA_MIN: Record<TipoProva, number> = {
  modal_oficial_do_item: 10, // o modal /cupons/pdp do MESMO item confirma campanha ativa agora (cupom some em minutos)
  bloco_de_compra_escopado: 120, // texto dentro do bloco de compra/pagamento do próprio item (selo, parcelas, "à vista no Pix")
  valor_final_impresso_pela_pagina: 10, // a página mostra o valor final com o benefício
  simulacao_de_checkout: 30, // simulação até ANTES de pagar (nunca compra)
};

/** Provas que sustentam preço final (cálculo ou texto "com o desconto: R$ X"). Bloco de compra NÃO basta: um selo não diz o valor final. */
export const PROVAS_DE_PRECO_FINAL: readonly TipoProva[] = ['valor_final_impresso_pela_pagina', 'simulacao_de_checkout'];

export interface Validador {
  rede: string;
  /** Tipos de prova que ESTA rede aceita, por tipo de item. Ausente/vazio = tipo de item bloqueado na rede. */
  aceita: Partial<Record<TipoItem, readonly TipoProva[]>>;
  /** Quem produz a prova (leitor/arquivo); vai para a trilha. */
  leitor: string;
}

/**
 * REGISTRO DE VALIDADORES POR REDE (etapa 1: ML e Amazon). Rede nova só é liberada quando alguém registra o validador aqui E o teste de cobertura passa.
 * Shopee: sem validador (bloqueada por padrão) até a etapa 2.
 */
export const VALIDADORES: readonly Validador[] = [
  // Benefício do ML SEM validador (QA R-67 F10): o leitor do ML lê parcelas/"à vista" do TEXTO INTEIRO da página (não só do bloco de compra); só volta com leitor escopado.
  { rede: 'mercado-livre', leitor: 'public/loops/ml-cupons-item.js', aceita: { cupom: ['modal_oficial_do_item', 'simulacao_de_checkout'] } },
  { rede: 'amazon', leitor: 'public/loops/cupons-24h.js', aceita: { cupom: ['bloco_de_compra_escopado', 'simulacao_de_checkout'], beneficio: ['bloco_de_compra_escopado', 'valor_final_impresso_pela_pagina', 'simulacao_de_checkout'] } },
  // PROVISÓRIO (etapa 2 audita o leitor da Shopee): cupom lido do bloco do item; benefício de cartão da Shopee não tem validador = bloqueado.
  { rede: 'shopee', leitor: 'loop Shopee (provisório até a etapa 2)', aceita: { cupom: ['bloco_de_compra_escopado', 'simulacao_de_checkout'] } },
];

export const validadorDaRede = (rede: string): Validador | null => VALIDADORES.find((v) => v.rede === rede) ?? null;
/** Redes ativas sem validador registrado (o teste falha se esta lista tiver rede que divulga cupom). */
export function redesSemValidador(redesAtivas: readonly string[]): string[] {
  return redesAtivas.filter((r) => !validadorDaRede(r));
}

export interface Prova {
  tipo: TipoProva;
  /** Quando a prova foi lida/validada. */
  validadaEm: Date;
  /** Valores provados (o que a prova mostra); o que a divulgação disser tem de bater. */
  nome?: string | null;
  valorFinalCents?: number | null;
  minimoCents?: number | null;
  /** Revogada por leitura mais nova ou por divergência. */
  revogada?: boolean;
}

export interface PedidoDivulgacao {
  rede: string;
  tipoItem: TipoItem;
  uso: UsoCupom;
  provas: readonly Prova[];
  now: Date;
  /** Valor final que a divulgação pretende dizer (se houver): tem de bater com o provado. */
  valorFinalDito?: number | null;
  /** Tolerância de arredondamento entre o dito e o provado. */
  toleranciaCents?: number;
}

export type MotivoCofre =
  | 'rede_sem_validador'
  | 'tipo_sem_validador'
  | 'sem_prova'
  | 'prova_de_tipo_nao_aceito_pela_rede'
  | 'prova_vencida'
  | 'prova_revogada'
  | 'simulacao_nao_aplicou'
  | 'preco_final_sem_prova_de_valor'
  | 'valor_dito_diverge_do_provado';

export interface Decisao {
  ok: boolean;
  estado: EstadoCofre;
  motivo?: MotivoCofre;
  /** Prova que liberou (ou a mais recente, quando barrou). */
  prova?: Prova;
  /** Quando a prova que liberou vence. */
  expiraEm?: Date;
}

const idadeMin = (p: Prova, now: Date) => (now.getTime() - p.validadaEm.getTime()) / 60_000;

/**
 * `podeDivulgar`: a ÚNICA decisão. Padrão negado. Escolhe a prova mais nova aceita pela rede e vigente; revalidando = passou da metade do TTL.
 */
export function podeDivulgar(p: PedidoDivulgacao): Decisao {
  const v = validadorDaRede(p.rede);
  if (!v) return { ok: false, estado: 'lido', motivo: 'rede_sem_validador' };
  const aceitos = v.aceita[p.tipoItem];
  if (!aceitos || !aceitos.length) return { ok: false, estado: 'lido', motivo: 'tipo_sem_validador' };
  if (!p.provas.length) return { ok: false, estado: 'lido', motivo: 'sem_prova' };
  // VETO (QA F4/F6): simulação de checkout que provou que o cupom NÃO aplica, dentro do TTL, barra qualquer outra prova (inclusive campaign_id + modal).
  const veto = p.provas.find((x) => x.tipo === 'simulacao_de_checkout' && x.revogada && idadeMin(x, p.now) <= TTL_PROVA_MIN.simulacao_de_checkout);
  if (veto) return { ok: false, estado: 'revogado', motivo: 'simulacao_nao_aplicou', prova: veto };
  const doTipo = p.provas.filter((x) => aceitos.includes(x.tipo));
  if (!doTipo.length) return { ok: false, estado: 'lido', motivo: 'prova_de_tipo_nao_aceito_pela_rede' };
  const vivas = doTipo.filter((x) => !x.revogada);
  if (!vivas.length) return { ok: false, estado: 'revogado', motivo: 'prova_revogada', prova: doTipo[0] };
  const vigentes = vivas.filter((x) => idadeMin(x, p.now) <= TTL_PROVA_MIN[x.tipo]).sort((a, b) => b.validadaEm.getTime() - a.validadaEm.getTime());
  if (!vigentes.length) return { ok: false, estado: 'revogado', motivo: 'prova_vencida', prova: vivas.sort((a, b) => b.validadaEm.getTime() - a.validadaEm.getTime())[0] };
  // Preço final (cálculo ou texto "com o desconto: R$ X"): só prova de valor final.
  let escolhida = vigentes[0]!;
  if (p.uso === 'preco_final' || p.valorFinalDito != null) {
    const comValor = vigentes.find((x) => PROVAS_DE_PRECO_FINAL.includes(x.tipo) && x.valorFinalCents != null);
    if (!comValor) return { ok: false, estado: 'validado', motivo: 'preco_final_sem_prova_de_valor', prova: escolhida };
    escolhida = comValor;
    if (p.valorFinalDito != null && Math.abs(p.valorFinalDito - (comValor.valorFinalCents as number)) > (p.toleranciaCents ?? 2)) {
      return { ok: false, estado: 'revogado', motivo: 'valor_dito_diverge_do_provado', prova: comValor };
    }
  }
  const expiraEm = new Date(escolhida.validadaEm.getTime() + TTL_PROVA_MIN[escolhida.tipo] * 60_000);
  const metade = TTL_PROVA_MIN[escolhida.tipo] / 2;
  return { ok: true, estado: idadeMin(escolhida, p.now) > metade ? 'revalidando' : 'divulgavel', prova: escolhida, expiraEm };
}

/** Traduz a leitura do ML (campaign_id + status do ingest) em prova. Sem os dois = nenhuma prova. */
export function provaDoCupomMl(r: { campaignId: string | null; status: string | null; readAt: Date; nome?: string | null; valorFinalCents?: number | null; minimoCents?: number | null }): Prova[] {
  if (!r.campaignId || !/^\d{3,12}$/.test(r.campaignId) || r.status !== 'confirmado_modal') return [];
  return [{ tipo: 'modal_oficial_do_item', validadaEm: r.readAt, nome: r.nome ?? null, valorFinalCents: r.valorFinalCents ?? null, minimoCents: r.minimoCents ?? null }];
}

/** Traduz a leitura da Amazon: selo/benefício lido DENTRO do bloco de compra do item e já verificado pelas leituras do item. */
export function provaDoCupomAmazon(r: { verificado: boolean; readAt: Date; valorFinalCents?: number | null; nome?: string | null }): Prova[] {
  if (!r.verificado) return [];
  return [{ tipo: 'bloco_de_compra_escopado', validadaEm: r.readAt, valorFinalCents: r.valorFinalCents ?? null, nome: r.nome ?? null }];
}

/** Benefício de cartão/pagamento: só o que a página imprime junto do preço do item (parcelas, "à vista no Pix") tem prova de bloco de compra; % de cartão/Pix e cashback não têm. */
export function provaDoBeneficio(b: { kind: string; lastSeenAt: Date }): Prova[] {
  if (b.kind !== 'parcelas' && b.kind !== 'preco_a_vista') return [];
  return [{ tipo: 'bloco_de_compra_escopado', validadaEm: b.lastSeenAt }];
}

export interface CupomLido {
  net: string;
  campaignId: string | null;
  status: string | null;
  src: string | null;
  isPromo: boolean;
  promoVerificada: boolean;
  readAt: Date;
  nome?: string | null;
  now: Date;
  /** Provas de simulação de checkout da oferta/cupom (aplicadas ou revogadas). */
  simulacoes?: readonly Prova[];
}

/**
 * Decisão do cofre para UM cupom lido do anúncio (usada por `lookupItemCouponDetail`; o teste de guarda exige que o lookup chame esta função e dê `continue` quando barra).
 * ML: base = campaign_id + `confirmado_modal`; simulação APLICADA só SOMA a uma base existente (campaign_id presente), nunca substitui a prova do modal; simulação NÃO APLICADA veta.
 * Amazon/Shopee: bloco de compra escopado (selo/promo verificada) e simulação.
 */
export function decidirCupomLido(c: CupomLido): Decisao {
  const base: Prova[] = c.net === 'mercado-livre' ? provaDoCupomMl({ campaignId: c.campaignId, status: c.status, readAt: c.readAt, nome: c.nome })
    : c.net === 'amazon' ? provaDoCupomAmazon({ verificado: c.isPromo ? c.promoVerificada : /^(amazon-pagina|amazon-item-confirmado)$/.test(String(c.src)), readAt: c.readAt, nome: c.nome })
    : c.net === 'shopee' ? provaDoCupomAmazon({ verificado: /^shopee-pagina$/.test(String(c.src)), readAt: c.readAt, nome: c.nome }) : [];
  const sims = (c.simulacoes ?? []).filter((s) => s.revogada || c.net !== 'mercado-livre' || !!c.campaignId);
  return podeDivulgar({ rede: c.net, tipoItem: 'cupom', uso: 'mensagem', provas: [...base, ...sims], now: c.now });
}
