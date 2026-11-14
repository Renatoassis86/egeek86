// CUPOM NA AGULHA (Agente de Cupons, dono 2026-11-11): regras PURAS (sem banco, sem rede, sem server-only) que decidem se um cupom
// pode entrar numa mensagem AGORA. Falhou qualquer verificação = o cupom não é usado e a mensagem de preço sai sem cupom.
//
//  (a) LIDO NA FONTE com validade futura;
//  (b) REVALIDADO dentro da janela de frescor da sua fonte;
//  (c) CONDIÇÃO conferida contra a oferta (rede, departamento, público, compra mínima, "seguir a loja");
//  (d) PREÇO FINAL conferido (com cupom < sem cupom; leitura feita sobre o preço de agora; coerente com % e teto quando a regra é conhecida).
//
// Justificativa das janelas (medido em 2026-11-11 sobre offer_coupon_reads, 46 pares "leitura positiva -> próxima leitura do mesmo
// anúncio"): em 1 a 2 h o cupom do anúncio sumiu em 9 de 40 pares (22%); o preço do anúncio mudou em 9 de 40. Quem amplia a janela
// para 6 h publica cupom morto em cerca de 1 de cada 3 mensagens. A alavanca de cobertura é LER MAIS (fila priorizada), não aceitar
// leitura velha. Por isso a janela de mensagem continua 120 min e a releitura-alvo das ofertas que importam é 45 min.

export const AGULHA = {
  /** Preço-com-cupom lido na página do anúncio. */
  ITEM_FRESH_MIN: 120,
  /** Cupom de lista (loja/vendedor/categoria) conferido na lista de cupons. */
  LIST_FRESH_MIN: 120,
  /** Código de campanha digitado pelo dono (confirmação humana vale mais). */
  CAMPANHA_FRESH_MIN: 24 * 60,
  /** Meta de releitura das ofertas que importam (anunciadas, na fila, com cupom): deixa >= 75 min de folga na janela de 120. */
  REREAD_TARGET_MIN: 45,
  /** Releitura das demais ofertas elegíveis. */
  REREAD_BASE_MIN: 90,
  /** Inventário vivo: cupom de lista sem NENHUMA conferência por tanto tempo deixa de constar como verificado. */
  LIST_ALIVE_MIN: 12 * 60,
  /** Validade que acaba em menos que isto não entra (a mensagem fica visível por um tempo). */
  EXPIRY_MARGIN_MIN: 15,
  /** Arredondamento entre o cálculo da regra e o que a loja mostra. */
  PRICE_TOLERANCE_CENTS: 2,
  /** Desconto acima disto é tratado como leitura suspeita (nunca visto em cupom real de loja). */
  MAX_PLAUSIBLE_DISCOUNT_PCT: 70,
} as const;

/** Recebe o motivo (texto curto) quando um cupom é descartado; auditoria em coupon_consults. */
export type MissTrace = (reason: string) => void;

export type AgulhaSource = 'item' | 'campanha' | 'loja_categoria';

export const AGULHA_MISS = [
  'rede_sem_leitura_autorizada',
  'sem_leitura',
  'leitura_antiga',
  'leitura_no_futuro',
  'validade_vencida',
  'validade_proxima_do_fim',
  'validade_nao_lida',
  'cupom_exige_seguir_loja',
  'publico_restrito',
  'conta_lida_nao_elegivel',
  'estado_nao_verificado',
  'tipo_sem_preco_final',
  'vertical_nao_casa',
  'categoria_produtos_selecionados',
  'compra_minima_nao_atingida',
  'preco_da_oferta_invalido',
  'preco_mudou_apos_leitura',
  'preco_com_cupom_invalido',
  'desconto_implausivel',
  'preco_incoerente_com_regra',
] as const;
export type AgulhaMiss = (typeof AGULHA_MISS)[number];

export interface AgulhaRule {
  kind: 'percentual' | 'valor_fixo' | 'frete' | 'cashback' | 'vale';
  /** Percentual (10 = 10%) ou reais (30 = R$ 30), como lido. */
  valueNum: number | null;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  validUntil: string | null;
  state?: string;
  audience?: string;
  eligibleOnReadAccount?: boolean | null;
  scopeKind?: 'loja_inteira' | 'categoria' | 'produto' | 'lista_itens';
  /** Rótulos de categoria declarados pela loja (quando scopeKind = categoria). */
  categorias?: string[];
  conditionsRaw?: string | null;
}

export interface AgulhaOffer {
  network: string;
  vertical: string | null;
  /** Preço de AGORA da oferta (centavos). */
  priceCents: number;
}

export interface AgulhaInput {
  source: AgulhaSource;
  now: Date;
  offer: AgulhaOffer;
  /** Quando a fonte foi lida/conferida (ISO). */
  verifiedAt: string | null;
  /** Item: preço com cupom e preço da oferta no momento da leitura. */
  priceWithCents?: number | null;
  priceSeenCents?: number | null;
  /** Item: rótulo da página ("R$ 91,8 com Cupom por seguir a loja"). */
  label?: string | null;
  /** Validade lida (a página do anúncio não informa: null é aceito só em source = item). */
  validUntil?: string | null;
  /** Regra do cupom lida na lista (pode não existir para cupom de anúncio). */
  rule?: AgulhaRule | null;
  /** Departamentos que o rótulo de categoria do cupom declara (resolvido por quem chama; ver categoria-vertical). */
  categoriaVerticais?: string[];
  /** Promoção Prime NA FINALIZAÇÃO (dono, 2026-11-14): quem chama só liga com a flag GROUP_PROMO_PRIME e com o cupom `assinantes` + `prime_checkout` gravado pela leitura da promoção. Libera só o corte de público Prime; todo o resto da agulha segue. */
  permitirPrimeNaFinalizacao?: boolean;
}

export type AgulhaResult =
  | { ok: true; checks: string[]; ruleKnown: boolean; validityKnown: boolean; finalPriceCents: number | null; discountCents: number | null }
  | { ok: false; reason: AgulhaMiss; detail?: string; checks: string[] };

/** Redes cuja leitura por anúncio está autorizada (aba logada do dono). Amazon e Shopee autorizadas pelo dono em 2026-11-11 (página do item). */
export const ITEM_READ_NETWORKS: readonly string[] = ['mercado-livre', 'amazon', 'shopee'];
/** Redes com lista/código de cupom (cadastro do dono ou lista lida). Amazon: só código do dono (não há lista pública). */
export const LIST_NETWORKS: readonly string[] = ['mercado-livre', 'shopee', 'amazon'];

/**
 * Rótulo do selo que indica público restrito (Prime, novos usuários, primeira compra, membros). A mensagem é para todos.
 * Aplicado só fora do Mercado Livre (o rótulo do ML já tem o seu tratamento: "por seguir a loja").
 */
export const PUBLICO_RESTRITO_RE = /\bprime\b|novos?\s+(usu[aá]rios|clientes|compradores)|primeira\s+compra|\bmembros?\b|assinantes?|selecionad[oa]s?\s+para\s+voc[eê]/i;

export function freshWindowMin(source: AgulhaSource): number {
  return source === 'item' ? AGULHA.ITEM_FRESH_MIN : source === 'campanha' ? AGULHA.CAMPANHA_FRESH_MIN : AGULHA.LIST_FRESH_MIN;
}

/** Desconto esperado pela regra lida, em centavos; null quando a regra não permite calcular preço (frete, cashback, vale). */
export function expectedDiscountCents(rule: Pick<AgulhaRule, 'kind' | 'valueNum' | 'maxDiscountCents'>, priceCents: number): number | null {
  if (rule.valueNum == null || !(rule.valueNum > 0)) return null;
  let d: number;
  if (rule.kind === 'percentual') d = Math.round((priceCents * rule.valueNum) / 100);
  else if (rule.kind === 'valor_fixo') d = Math.round(rule.valueNum * 100);
  else return null;
  if (rule.maxDiscountCents != null && rule.maxDiscountCents > 0) d = Math.min(d, rule.maxDiscountCents);
  return Math.min(d, priceCents);
}

/** Preço final pela regra (cupom de lista/campanha, sem leitura do anúncio). */
export function finalPriceByRule(rule: Pick<AgulhaRule, 'kind' | 'valueNum' | 'maxDiscountCents'>, priceCents: number): number | null {
  const d = expectedDiscountCents(rule, priceCents);
  return d == null ? null : priceCents - d;
}

const ms = (iso: string) => Date.parse(iso);

/** Avalia o cupom. Pura e determinística. `checks` lista o que passou (auditoria). */
export function evaluateAgulha(input: AgulhaInput): AgulhaResult {
  const checks: string[] = [];
  const miss = (reason: AgulhaMiss, detail?: string): AgulhaResult => ({ ok: false, reason, detail, checks });
  const { source, now, offer, rule } = input;
  const nowMs = now.getTime();

  // Rede: leitura por anúncio só onde há autorização; lista/código só nas redes com fonte.
  const nets = source === 'item' ? ITEM_READ_NETWORKS : LIST_NETWORKS;
  if (!nets.includes(offer.network)) return miss('rede_sem_leitura_autorizada', offer.network);
  checks.push('rede');
  if (!(Number.isFinite(offer.priceCents) && offer.priceCents > 0)) return miss('preco_da_oferta_invalido');

  // (a) lido na fonte + (b) frescor.
  if (!input.verifiedAt || !Number.isFinite(ms(input.verifiedAt))) return miss('sem_leitura');
  const ageMin = (nowMs - ms(input.verifiedAt)) / 60_000;
  if (ageMin < -5) return miss('leitura_no_futuro');
  if (ageMin > freshWindowMin(source)) return miss('leitura_antiga', `${Math.round(ageMin)} min`);
  checks.push('frescor');

  // (a) validade futura. O anúncio não informa validade (null aceito só nele); código/lista sem validade lida nunca entram.
  const validUntil = input.validUntil ?? rule?.validUntil ?? null;
  let validityKnown = false;
  if (validUntil) {
    const v = ms(validUntil);
    if (!Number.isFinite(v)) return miss('validade_nao_lida');
    if (v <= nowMs) return miss('validade_vencida');
    if (v - nowMs < AGULHA.EXPIRY_MARGIN_MIN * 60_000) return miss('validade_proxima_do_fim');
    validityKnown = true;
    checks.push('validade');
  } else if (source !== 'item') {
    return miss('validade_nao_lida');
  }

  // (c) condição.
  if (input.label && /seguir/i.test(input.label)) return miss('cupom_exige_seguir_loja');
  if (source === 'item' && offer.network !== 'mercado-livre' && input.label && PUBLICO_RESTRITO_RE.test(input.label) && !input.permitirPrimeNaFinalizacao) return miss('publico_restrito', 'rotulo');
  if (rule) {
    // Anúncio: o preço com cupom exibido pela loja já é a verificação; só cupom vencido/invalidado na lista barra.
    const stateOk = source === 'item' ? rule.state !== 'vencido' && rule.state !== 'invalido' : !rule.state || rule.state === 'verificado';
    if (!stateOk) return miss('estado_nao_verificado', rule.state);
    if (rule.audience && rule.audience !== 'todos' && !(input.permitirPrimeNaFinalizacao && rule.audience === 'assinantes')) return miss('publico_restrito', rule.audience);
    if (rule.eligibleOnReadAccount === false) return miss('conta_lida_nao_elegivel');
    if (rule.scopeKind === 'categoria' && source === 'loja_categoria') {
      // Cupom de categoria sem o anúncio confirmando: só vale se a loja declara TODOS os produtos da categoria e o departamento casa.
      if (/selecionad/i.test(rule.conditionsRaw ?? '') || !/(todos os produtos|toda a categoria|todos os itens)/i.test(rule.conditionsRaw ?? '')) {
        return miss('categoria_produtos_selecionados');
      }
      if (!offer.vertical || !(input.categoriaVerticais ?? []).includes(offer.vertical)) return miss('vertical_nao_casa');
    }
    if (rule.minOrderCents != null && rule.minOrderCents > 0 && offer.priceCents < rule.minOrderCents) return miss('compra_minima_nao_atingida');
    checks.push('condicao');
  }

  // (d) preço final.
  const ruleKnown = !!rule && (rule.kind === 'percentual' || rule.kind === 'valor_fixo') && rule.valueNum != null && rule.valueNum > 0;
  if (rule && (rule.kind === 'cashback' || rule.kind === 'vale')) return miss('tipo_sem_preco_final', rule.kind);

  if (source === 'item') {
    const pw = input.priceWithCents;
    if (pw == null || !Number.isFinite(pw) || !(pw > 0) || pw >= offer.priceCents) return miss('preco_com_cupom_invalido');
    // A leitura precisa ter sido feita sobre o preço de agora: se o preço andou, o "preço com cupom" lido não é mais o preço com cupom.
    if (input.priceSeenCents != null && Math.abs(input.priceSeenCents - offer.priceCents) > AGULHA.PRICE_TOLERANCE_CENTS) return miss('preco_mudou_apos_leitura');
    const seen = input.priceSeenCents ?? offer.priceCents;
    const disc = seen - pw;
    if ((disc / seen) * 100 > AGULHA.MAX_PLAUSIBLE_DISCOUNT_PCT) return miss('desconto_implausivel');
    if (ruleKnown && rule) {
      const exp = expectedDiscountCents(rule, seen);
      if (exp == null || Math.abs(exp - disc) > AGULHA.PRICE_TOLERANCE_CENTS) return miss('preco_incoerente_com_regra', `esperado ${exp} lido ${disc}`);
    }
    checks.push('preco');
    return { ok: true, checks, ruleKnown, validityKnown, finalPriceCents: pw, discountCents: disc };
  }

  // Lista/campanha: o preço final vem da regra (a mensagem mostra o rótulo do cupom, não o preço).
  if (rule?.kind === 'frete') {
    checks.push('preco_na');
    return { ok: true, checks, ruleKnown: false, validityKnown, finalPriceCents: null, discountCents: null };
  }
  if (!rule || !ruleKnown) return miss('tipo_sem_preco_final');
  const final = finalPriceByRule(rule, offer.priceCents);
  if (final == null || !(final > 0) || final >= offer.priceCents) return miss('preco_com_cupom_invalido');
  if (((offer.priceCents - final) / offer.priceCents) * 100 > AGULHA.MAX_PLAUSIBLE_DISCOUNT_PCT) return miss('desconto_implausivel');
  checks.push('preco');
  return { ok: true, checks, ruleKnown: true, validityKnown, finalPriceCents: final, discountCents: offer.priceCents - final };
}
