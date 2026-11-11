// Regras dos gatilhos e limites anti-spam das mensagens para grupos (ata 2026-11-10). PURO: recebe fatos, devolve decisões.
// Nada aqui lê banco, relógio ou env: o chamador passa `now` e os fatos medidos.

import {
  buildGroupMessages,
  fmtBRL,
  makeMessageKey,
  pctBelow,
  productDisplayName,
  departmentLabel,
  type GroupMessageInput,
  type RenderedGroupMessage,
} from '@/lib/messaging/group-messages';

// ---------------------------------------------------------------------------
// Limiares (medidos e decididos na ata)
// ---------------------------------------------------------------------------
export const RULES = {
  /** G1: queda mínima sobre o menor anterior. */
  G1_MIN_DROP_PCT: 8,
  /** G1/G2/G3: abaixo da média mínimo. */
  MIN_BELOW_AVG_PCT: 15,
  /** Acima disso vai para revisão humana (nunca automático). */
  REVIEW_ABOVE_BELOW_AVG_PCT: 40,
  /** Queda sobre o preço anterior acima disso: revisão humana. */
  REVIEW_ABOVE_DROP_PCT: 45,
  /** Preço abaixo desta fração da mediana das ofertas ativas: revisão humana. */
  REVIEW_BELOW_MEDIAN_RATIO: 0.5,
  MIN_STORES: 3,
  /** G3: diferença mínima entre as melhores ofertas de duas redes. */
  G3_MIN_DIFF_PCT: 15,
  /** G5: mínimo de ofertas ativas para "alta procura". */
  G5_MIN_OFFERS: 20,
  /** Frescor do preço na detecção e no envio. */
  DETECT_MAX_AGE_MIN: 120,
  SEND_MAX_AGE_MIN: 30,
  /** Preço precisa ter sido reconfirmado pelo menos este tempo depois da mudança. */
  CONFIRM_GAP_MIN: 15,
  /** Revalidação no envio: tolerância de variação do preço. */
  SEND_PRICE_TOLERANCE_PCT: 2,
  /** Vendedor ML. */
  ML_MIN_SALES: 50,
  ML_OK_REPUTATIONS: ['5_green', '4_light_green'],
  /** Limites anti-spam. */
  DAILY_CAP: 3,
  DAILY_CAP_BLACK_FRIDAY: 6,
  BLACK_FRIDAY_WEEK: { from: '2026-11-20', to: '2026-11-27' },
  HOURLY_CAP: 1,
  QUIET_FROM_HOUR: 22,
  QUIET_UNTIL_HOUR: 8,
  PRODUCT_DEDUP_HOURS: 48,
  /** Rompe a janela de 48 h: novo menor preço >= 5% abaixo do enviado, depois de 6 h. */
  REBREAK_PCT: 5,
  REBREAK_AFTER_HOURS: 6,
  /** Resumo do dia. */
  G4_MIN_ITEMS: 2,
  G4_MAX_ITEMS: 3,
} as const;

/** Departamentos liberados no porteiro e no /go. Os demais geram G6 marcado como não enviável. */
export const RELEASED_VERTICALS: readonly string[] = ['games'];

export type Trigger = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6';

// ---------------------------------------------------------------------------
// Fatos de entrada
// ---------------------------------------------------------------------------
export interface OfferFact {
  offerId: string;
  slug: string;
  title: string;
  networkSlug: string;
  networkName: string;
  sellerId: string | null;
  sellerReputation: string | null;
  sellerTotalSales: number | null;
  priceCents: number;
  /** last_price_confirmed_at: a API devolveu preço neste instante. */
  confirmedAt: Date | null;
  /** last_price_change_at (ou created_at): quando o preço atual apareceu. */
  priceSince: Date | null;
  affiliateLinkPending: boolean;
  quarantined: boolean;
}

export interface ProductFacts {
  masterProductId: string;
  /** Nome do master (cadastro). */
  masterName: string;
  vertical: string;
  productType: string; // 'game' | 'console' | ...
  platformLabel: string | null; // nunca 'unknown'
  format: 'physical' | 'digital' | 'unknown';
  catalogGate: string | null; // 'review' | 'rejected' | 'approved' | null
  /** Ofertas ATIVAS e elegíveis (eligibleOfferSql) com preço recente. */
  offers: OfferFact[];
  /** Média do período por oferta-dia (computePeriodMetrics). null = sem série. */
  avg: { cents: number; distinctOffers: number; offerDays: number; spanDays: number; eligible: boolean } | null;
  /** Último evento 'live' de queda do menor preço dentro da janela de detecção. */
  minEvent: { at: Date; minCents: number; prevMinCents: number | null; offerId: string | null } | null;
  /** Primeiro evento de menor preço do produto e menor valor registrado. */
  record: { since: Date; minCents: number } | null;
  /** Foto anterior (G5 em 24/11 e 27/11). */
  baseline?: { day: string; lowestCents: number } | null;
}

// ---------------------------------------------------------------------------
// Título: região, edição, condição
// ---------------------------------------------------------------------------
export function foldTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const REGION_RE = /\b(japon\w*|japan\w*|jp|jpn|ntsc\w*|pal|eur|euro\w*|usa|eua|asia\w*|asiatic\w*|chin\w*|korea\w*|coreano|hk|import\w*)\b/;
const REGION_US_RE = /\bversao us\b|\boriginal us\b|\bimportado us\b/;
const CONDITION_RE = /\b(open ?box|usado|usada|seminovo|seminova|recondicionad\w*|vitrine|mostruario|sem lacre)\b/;

const EDITION_MARKERS: Array<[string, RegExp]> = [
  ['deluxe', /\bdeluxe\b/],
  ['gold', /\bgold\b/],
  ['ultimate', /\bultimate\b/],
  ['collector', /\bcollector\w*|\bcolecionador\b/],
  ['limitada', /\blimitada\b|\blimited\b/],
  ['especial', /\bedicao especial\b|\bspecial edition\b/],
  ['steelbook', /\bsteelbook\b/],
  ['goty', /\bgoty\b|\bgame of the year\b/],
  ['premium', /\bpremium\b/],
  ['definitive', /\bdefinitive\b|\bdefinitiva\b/],
  ['anniversary', /\banniversary\b|\baniversario\b/],
  ['remaster', /\bremaster\w*\b/],
  ['greatest-hits', /\bgreatest hits\b|\bplatinum\b|\bessentials\b|\bplayer s choice\b|\bnintendo selects\b/],
];

/** Região no título da oferta que o master não tem; ou edição que separa produto. null = ok. */
export function titleIdentityBlock(offerTitle: string, masterName: string): string | null {
  const t = foldTitle(offerTitle);
  const m = foldTitle(masterName);
  if (CONDITION_RE.test(t)) return 'condicao_nao_nova_no_titulo';
  const reg = REGION_RE.test(t) || REGION_US_RE.test(t) || /\bUS\b/.test(offerTitle);
  const regM = REGION_RE.test(m) || REGION_US_RE.test(m) || /\bUS\b/.test(masterName);
  if (reg && !regM) return 'regiao_no_titulo';
  for (const [name, re] of EDITION_MARKERS) {
    if (re.test(t) && !re.test(m)) return `edicao_diferente_no_titulo:${name}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filtros por oferta
// ---------------------------------------------------------------------------
export type NetKind = 'ml' | 'shopee' | 'amazon' | 'other';
export function netKind(o: { networkSlug: string; networkName: string }): NetKind {
  const s = `${o.networkSlug} ${o.networkName}`.toLowerCase();
  if (s.includes('mercado')) return 'ml';
  if (s.includes('shopee')) return 'shopee';
  if (s.includes('amazon')) return 'amazon';
  return 'other';
}

export interface OfferVerdict {
  /** block = descartada; review = só com aprovação humana; ok. */
  kind: 'ok' | 'review' | 'block';
  reasons: string[];
}

export function judgeOffer(o: OfferFact, p: Pick<ProductFacts, 'masterName'>, now: Date, maxAgeMin: number): OfferVerdict {
  const block = (r: string): OfferVerdict => ({ kind: 'block', reasons: [r] });
  const kind = netKind(o);
  if (kind === 'amazon') return block('amazon_desligada');
  if (kind === 'other') return block('rede_fora_do_escopo');
  if (o.quarantined) return block('quarentena');
  if (o.affiliateLinkPending) return block('link_pendente');
  if (!(o.priceCents > 0)) return block('preco_invalido');
  if (!o.confirmedAt) return block('sem_confirmacao_de_preco');
  const ageMin = (now.getTime() - o.confirmedAt.getTime()) / 60_000;
  if (ageMin > maxAgeMin) return block(`preco_velho_${Math.round(ageMin)}min`);
  if (ageMin < -5) return block('confirmacao_no_futuro');
  const idBlock = titleIdentityBlock(o.title, p.masterName);
  if (idBlock) return block(idBlock);
  // Preço visto em duas coletas separadas por >= 15 min (o preço apareceu e foi reconfirmado depois).
  const since = o.priceSince ?? o.confirmedAt;
  if (o.confirmedAt.getTime() - since.getTime() < RULES.CONFIRM_GAP_MIN * 60_000) return block('preco_nao_reconfirmado_em_15min');
  const reasons: string[] = [];
  if (kind === 'shopee') reasons.push('shopee_so_com_aprovacao_humana');
  if (kind === 'ml') {
    const rep = o.sellerReputation;
    if (!rep) reasons.push('vendedor_sem_reputacao');
    else if (!(RULES.ML_OK_REPUTATIONS as readonly string[]).includes(rep)) return block(`vendedor_reputacao_${rep}`);
    else if ((o.sellerTotalSales ?? 0) < RULES.ML_MIN_SALES) reasons.push('vendedor_poucas_vendas');
  }
  return reasons.length ? { kind: 'review', reasons } : { kind: 'ok', reasons: [] };
}

/** Lojas distintas (rede + vendedor; oferta sem vendedor conta como uma loja própria). */
export function countStores(offers: OfferFact[]): number {
  return new Set(offers.map((o) => `${netKind(o)}:${o.sellerId ?? o.offerId}`)).size;
}

export function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// ---------------------------------------------------------------------------
// Candidato
// ---------------------------------------------------------------------------
export interface Candidate {
  /** Chave do link (`m`). */
  messageKey: string;
  trigger: Trigger;
  model: GroupMessageInput['model'];
  masterProductId: string;
  /** Ofertas citadas (a primeira é a principal). */
  offerIds: string[];
  vertical: string;
  networkSlug: string;
  name: string;
  priceCents: number;
  avgCents: number | null;
  belowAvgPct: number | null;
  dropPct: number | null;
  /** Motivo legível de ter sido proposto. */
  reason: string;
  /** auto = pode sair sozinho (Telegram em send); review = só com aprovação humana. */
  status: 'auto' | 'review';
  reviewReasons: string[];
  sendable: boolean;
  notSendableReason: string | null;
  confirmedAt: string;
  dedupKey: string;
  texts: { telegram: string; whatsapp: string };
  textProblems: string[];
}

export interface Blocked {
  masterProductId: string;
  name: string;
  trigger: Trigger;
  reasons: string[];
}

export interface EvalContext {
  now: Date;
  maxAgeMin: number;
  adTag: string;
}

/** Janela de 6 h (fuso de São Paulo) para o dedup por oferta/gatilho. */
export function windowKey(now: Date): string {
  const ms = now.getTime() - 3 * 3600_000; // Brasil sem horário de verão: UTC-3 fixo
  const d = new Date(ms);
  const day = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `${day}-${Math.floor(d.getUTCHours() / 6)}`;
}

function nameOf(p: ProductFacts): string {
  return productDisplayName(p.masterName, { platformLabel: p.platformLabel, format: p.format, isGame: p.productType === 'game' });
}

function finish(
  p: ProductFacts,
  trigger: Trigger,
  input: GroupMessageInput,
  base: {
    offerIds: string[];
    primary: OfferFact;
    reason: string;
    avgCents: number | null;
    belowPct: number | null;
    dropPct: number | null;
    reviewReasons: string[];
    notSendable?: string | null;
    dedupSuffix?: string;
  },
  ctx: EvalContext
): Candidate {
  let rendered: RenderedGroupMessage;
  let problems: string[] = [];
  try {
    rendered = buildGroupMessages(input);
    problems = rendered.problems;
  } catch (e) {
    rendered = { telegram: '', whatsapp: '', problems: [] };
    problems = [e instanceof Error ? e.message : 'erro ao montar texto'];
  }
  const notSendable =
    base.notSendable ?? (problems.length ? `texto reprovado: ${problems.join('; ')}` : null) ?? null;
  return {
    messageKey: input.messageKey,
    trigger,
    model: input.model,
    masterProductId: p.masterProductId,
    offerIds: base.offerIds,
    vertical: p.vertical,
    networkSlug: base.primary.networkSlug,
    name: nameOf(p),
    priceCents: base.primary.priceCents,
    avgCents: base.avgCents,
    belowAvgPct: base.belowPct,
    dropPct: base.dropPct,
    reason: base.reason,
    status: base.reviewReasons.length ? 'review' : 'auto',
    reviewReasons: base.reviewReasons,
    sendable: !notSendable,
    notSendableReason: notSendable,
    confirmedAt: (base.primary.confirmedAt ?? ctx.now).toISOString(),
    dedupKey: `${p.masterProductId}:${trigger}:${base.dedupSuffix ?? windowKey(ctx.now)}`,
    texts: { telegram: rendered.telegram, whatsapp: rendered.whatsapp },
    textProblems: problems,
  };
}

function toMsgOffer(o: OfferFact) {
  return { slug: o.slug, networkSlug: o.networkSlug, networkName: o.networkName, priceCents: o.priceCents, confirmedAt: o.confirmedAt as Date };
}

function humanReview(price: number, avg: number | null, dropPct: number | null, median: number | null): string[] {
  const out: string[] = [];
  if (avg && pctBelow(price, avg) > RULES.REVIEW_ABOVE_BELOW_AVG_PCT) out.push(`desconto_acima_de_${RULES.REVIEW_ABOVE_BELOW_AVG_PCT}pct_da_media`);
  if (dropPct != null && dropPct > RULES.REVIEW_ABOVE_DROP_PCT) out.push(`queda_acima_de_${RULES.REVIEW_ABOVE_DROP_PCT}pct`);
  if (median && price < median * RULES.REVIEW_BELOW_MEDIAN_RATIO) out.push('preco_abaixo_de_meia_mediana_das_ofertas');
  return out;
}

/**
 * Avalia UM produto para G1, G2, G3, G5 (G4 compõe depois; G6 é G1/G2/G5 num departamento não liberado).
 * Devolve candidatos e bloqueios (com motivo) para auditoria.
 */
export function evaluateProduct(p: ProductFacts, ctx: EvalContext): { candidates: Candidate[]; blocked: Blocked[] } {
  const candidates: Candidate[] = [];
  const blocked: Blocked[] = [];
  const nm = nameOf(p);
  const stop = (trigger: Trigger, reasons: string[]) => blocked.push({ masterProductId: p.masterProductId, name: nm, trigger, reasons });
  const released = RELEASED_VERTICALS.includes(p.vertical);
  const isConsole = p.productType === 'console';

  if (p.vertical === 'games' && p.productType !== 'game' && !isConsole) {
    stop('G2', ['tipo_de_produto_fora_do_escopo']);
    return { candidates, blocked };
  }
  if (p.catalogGate === 'review' || p.catalogGate === 'rejected') {
    stop('G2', [`porteiro_${p.catalogGate}`]);
    return { candidates, blocked };
  }
  if (p.vertical === 'games' && !p.platformLabel) {
    stop('G2', ['plataforma_desconhecida']);
    return { candidates, blocked };
  }

  const verdicts = p.offers.map((o) => ({ o, v: judgeOffer(o, p, ctx.now, ctx.maxAgeMin) }));
  const usable = verdicts.filter((x) => x.v.kind !== 'block').sort((a, b) => a.o.priceCents - b.o.priceCents);
  const stores = countStores(p.offers.filter((o) => judgeOffer(o, p, ctx.now, ctx.maxAgeMin).kind !== 'block'));
  const median = medianOf(p.offers.filter((o) => netKind(o) !== 'amazon').map((o) => o.priceCents));
  const model = (trigger: Trigger): GroupMessageInput['model'] =>
    trigger === 'G1' ? 'menor-preco' : trigger === 'G2' ? 'abaixo-media' : trigger === 'G3' ? 'comparativo' : trigger === 'G5' ? 'foto-preco' : 'departamento';
  void model;
  const avg = p.avg && p.avg.eligible && p.avg.cents > 0 ? p.avg : null;
  const cheapestAll = [...p.offers].sort((a, b) => a.priceCents - b.priceCents)[0];

  const base = { vertical: p.vertical, adTag: ctx.adTag };
  const keyOf = (t: Trigger, extra = '') => makeMessageKey(t, `${p.masterProductId}:${t}:${extra}:${windowKey(ctx.now)}`, ctx.now);
  const departmentGate = released ? null : 'departamento_em_review_nao_liberado_no_go';
  const asG6 = !released;

  // ---------------- G1: menor preço registrado ----------------
  if (p.minEvent && p.minEvent.prevMinCents && p.minEvent.minCents < p.minEvent.prevMinCents) {
    const drop = ((p.minEvent.prevMinCents - p.minEvent.minCents) / p.minEvent.prevMinCents) * 100;
    const holder = usable[0];
    if (!cheapestAll) stop('G1', ['sem_oferta_vigente']);
    else if (drop < RULES.G1_MIN_DROP_PCT) stop('G1', [`queda_${drop.toFixed(1)}pct_abaixo_de_${RULES.G1_MIN_DROP_PCT}pct`]);
    else if (!holder || holder.o.offerId !== cheapestAll.offerId) {
      const why = verdicts.find((x) => x.o.offerId === cheapestAll.offerId)?.v.reasons ?? ['oferta_mais_barata_bloqueada'];
      stop('G1', ['a_oferta_mais_barata_nao_passa_nos_filtros', ...why]);
    } else if (holder.o.priceCents > p.minEvent.minCents * 1.02) stop('G1', ['preco_atual_acima_do_evento']);
    else if (!avg) stop('G1', ['sem_media_elegivel']);
    else if (stores < RULES.MIN_STORES) stop('G1', [`lojas_${stores}_abaixo_de_${RULES.MIN_STORES}`]);
    else if (!p.record) stop('G1', ['sem_primeiro_evento_para_dizer_desde_quando']);
    else if (pctBelow(holder.o.priceCents, avg.cents) < RULES.MIN_BELOW_AVG_PCT) stop('G1', ['abaixo_da_media_insuficiente']);
    else {
      const o = holder.o;
      const trigger: Trigger = asG6 ? 'G6' : 'G1';
      const review = [...holder.v.reasons, ...humanReview(o.priceCents, avg.cents, drop, median)];
      const messageKey = keyOf(trigger, o.offerId);
      const input: GroupMessageInput = asG6
        ? { ...base, messageKey, model: 'departamento', name: nm, departmentLabel: departmentLabel(p.vertical), offer: toMsgOffer(o), avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers } }
        : { ...base, messageKey, model: 'menor-preco', name: nm, offer: toMsgOffer(o), prevMinCents: p.minEvent.prevMinCents, trackingSince: p.record.since, avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers } };
      candidates.push(
        finish(p, trigger, input, {
          offerIds: [o.offerId],
          primary: o,
          reason: `Novo menor preço registrado: ${fmtBRL(o.priceCents)} (queda de ${drop.toFixed(1).replace('.', ',')}% sobre ${fmtBRL(p.minEvent.prevMinCents)}), ${pctBelow(o.priceCents, avg.cents)}% abaixo da média.`,
          avgCents: Math.round(avg.cents),
          belowPct: pctBelow(o.priceCents, avg.cents),
          dropPct: Math.round(drop * 10) / 10,
          reviewReasons: review,
          notSendable: departmentGate,
        }, ctx)
      );
    }
  }

  // ---------------- G2: bem abaixo da média ----------------
  const g1Done = candidates.some((c) => c.trigger === 'G1' || (c.trigger === 'G6' && c.model === 'departamento'));
  if (!g1Done) {
    const best = usable[0];
    if (!best) stop('G2', ['nenhuma_oferta_passa_nos_filtros']);
    else if (!avg) stop('G2', ['sem_media_elegivel(>=3_ofertas,>=5_oferta_dias,>=14_dias)']);
    else if (stores < RULES.MIN_STORES) stop('G2', [`lojas_${stores}_abaixo_de_${RULES.MIN_STORES}`]);
    else {
      const pct = pctBelow(best.o.priceCents, avg.cents);
      const raw = ((avg.cents - best.o.priceCents) / avg.cents) * 100;
      if (raw < RULES.MIN_BELOW_AVG_PCT) stop('G2', [`abaixo_da_media_${raw.toFixed(1)}pct_menor_que_${RULES.MIN_BELOW_AVG_PCT}pct`]);
      else {
        const o = best.o;
        const trigger: Trigger = asG6 ? 'G6' : 'G2';
        const review = [...best.v.reasons, ...humanReview(o.priceCents, avg.cents, null, median)];
        const messageKey = keyOf(trigger, o.offerId);
        const input: GroupMessageInput = asG6
          ? { ...base, messageKey, model: 'departamento', name: nm, departmentLabel: departmentLabel(p.vertical), offer: toMsgOffer(o), avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers } }
          : { ...base, messageKey, model: 'abaixo-media', name: nm, offer: toMsgOffer(o), avg: { cents: Math.round(avg.cents), offers: avg.distinctOffers } };
        candidates.push(
          finish(p, trigger, input, {
            offerIds: [o.offerId],
            primary: o,
            reason: `${pct}% abaixo da média de ${fmtBRL(avg.cents)} (${avg.distinctOffers} ofertas, ${avg.offerDays} oferta-dias, ${avg.spanDays} dias).`,
            avgCents: Math.round(avg.cents),
            belowPct: pct,
            dropPct: null,
            reviewReasons: review,
            notSendable: departmentGate,
          }, ctx)
        );
      }
    }
  }

  // ---------------- G3: mesma mídia mais barata em outra loja ----------------
  if (!asG6) {
    const bestByNet = new Map<NetKind, { o: OfferFact; v: OfferVerdict }>();
    for (const x of usable) if (!bestByNet.has(netKind(x.o))) bestByNet.set(netKind(x.o), x);
    const nets = [...bestByNet.values()].sort((a, b) => a.o.priceCents - b.o.priceCents);
    if (nets.length >= 2) {
      const [cheap, other] = nets;
      const diffPct = ((other.o.priceCents - cheap.o.priceCents) / other.o.priceCents) * 100;
      if (diffPct >= RULES.G3_MIN_DIFF_PCT) {
        if (other.v.kind !== 'ok') stop('G3', ['a_rede_mais_cara_exige_aprovacao', ...other.v.reasons]);
        else {
          const sameNet = p.offers.filter((o) => netKind(o) === netKind(other.o) && judgeOffer(o, p, ctx.now, ctx.maxAgeMin).kind !== 'block');
          const maxC = Math.max(...sameNet.map((o) => o.priceCents));
          const messageKey = keyOf('G3', `${cheap.o.offerId}:${other.o.offerId}`);
          const input: GroupMessageInput = {
            ...base,
            messageKey,
            model: 'comparativo',
            name: nm,
            cheap: toMsgOffer(cheap.o),
            other: { ...toMsgOffer(other.o), offersCount: sameNet.length, maxCents: maxC },
            avg: avg ? { cents: Math.round(avg.cents), offers: avg.distinctOffers } : null,
          };
          candidates.push(
            finish(p, 'G3', input, {
              offerIds: [cheap.o.offerId, other.o.offerId],
              primary: cheap.o,
              reason: `Mesma mídia ${diffPct.toFixed(0)}% mais barata ${cheap.o.networkName} (${fmtBRL(cheap.o.priceCents)}) do que ${other.o.networkName} (${fmtBRL(other.o.priceCents)}).`,
              avgCents: avg ? Math.round(avg.cents) : null,
              belowPct: avg ? pctBelow(cheap.o.priceCents, avg.cents) : null,
              dropPct: null,
              reviewReasons: [...cheap.v.reasons, ...humanReview(cheap.o.priceCents, avg?.cents ?? null, null, median)],
            }, ctx)
          );
        }
      }
    }
  }

  // ---------------- G5: foto de preço ----------------
  if (!asG6 && (p.productType === 'game' || isConsole)) {
    const priced = p.offers.filter((o) => netKind(o) !== 'amazon' && judgeOffer(o, p, ctx.now, ctx.maxAgeMin).kind !== 'block');
    if (p.offers.filter((o) => netKind(o) !== 'amazon').length >= RULES.G5_MIN_OFFERS && priced.length >= 3 && usable[0]) {
      const sorted = priced.map((o) => o.priceCents).sort((a, b) => a - b);
      const lead = usable[0];
      const med = medianOf(p.offers.filter((o) => netKind(o) !== 'amazon').map((o) => o.priceCents)) as number;
      const messageKey = keyOf('G5', 'foto');
      const input: GroupMessageInput = {
        ...base,
        messageKey,
        model: 'foto-preco',
        name: nm,
        offer: toMsgOffer(lead.o),
        top: sorted.slice(0, 3),
        medianCents: med,
        offersCount: p.offers.filter((o) => netKind(o) !== 'amazon').length,
        record: p.record ? { cents: p.record.minCents, since: p.record.since } : null,
        baseline: p.baseline ?? null,
      };
      candidates.push(
        finish(p, 'G5', input, {
          offerIds: [lead.o.offerId],
          primary: lead.o,
          reason: `Foto de preço: ${p.offers.length} ofertas ativas, menor ${fmtBRL(lead.o.priceCents)}, mediana ${fmtBRL(med)}. Não afirma desconto.`,
          avgCents: null,
          belowPct: null,
          dropPct: null,
          reviewReasons: lead.v.reasons,
          dedupSuffix: windowKey(ctx.now).slice(0, 8),
        }, ctx)
      );
    }
  }
  return { candidates, blocked };
}

// ---------------------------------------------------------------------------
// G4: resumo do dia (compõe sobre G1/G2 auto)
// ---------------------------------------------------------------------------
export function buildDailySummary(
  cands: Candidate[],
  facts: Map<string, ProductFacts>,
  ctx: EvalContext
): Candidate | null {
  const pool = cands
    .filter((c) => (c.trigger === 'G1' || c.trigger === 'G2') && c.status === 'auto' && c.sendable && c.belowAvgPct != null)
    .sort((a, b) => (b.belowAvgPct ?? 0) - (a.belowAvgPct ?? 0));
  const items = pool.slice(0, RULES.G4_MAX_ITEMS);
  if (items.length < RULES.G4_MIN_ITEMS) return null;
  const messageKey = makeMessageKey('G4', `resumo:${items.map((i) => i.masterProductId).join(',')}:${windowKey(ctx.now).slice(0, 8)}`, ctx.now);
  const first = facts.get(items[0].masterProductId) as ProductFacts;
  const mk = (c: Candidate) => {
    const p = facts.get(c.masterProductId) as ProductFacts;
    const o = p.offers.find((x) => x.offerId === c.offerIds[0]) as OfferFact;
    return {
      name: productDisplayName(p.masterName, { isGame: p.productType === 'game' }),
      platformLabel: p.platformLabel,
      offer: toMsgOffer(o),
      avg: { cents: c.avgCents as number, offers: p.avg?.distinctOffers ?? 0 },
    };
  };
  const input: GroupMessageInput = { vertical: first.vertical, adTag: ctx.adTag, messageKey, model: 'resumo-dia', items: items.map(mk) };
  const primary = (first.offers.find((x) => x.offerId === items[0].offerIds[0]) as OfferFact);
  return finish(first, 'G4', input, {
    offerIds: items.map((i) => i.offerIds[0]),
    primary,
    reason: `Resumo do dia com ${items.length} itens que passaram em G1/G2.`,
    avgCents: null,
    belowPct: null,
    dropPct: null,
    reviewReasons: [],
    dedupSuffix: windowKey(ctx.now).slice(0, 8),
  }, ctx);
}

// ---------------------------------------------------------------------------
// Limites anti-spam
// ---------------------------------------------------------------------------
export interface SentRecord {
  masterProductId: string;
  priceCents: number;
  sentAt: Date;
  networkSlug?: string | null;
  trigger?: string | null;
}

/** Hora (0-23) em Brasília. */
export function spHour(now: Date): number {
  return new Date(now.getTime() - 3 * 3600_000).getUTCHours();
}
export function spDayStr(now: Date): string {
  return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Silêncio das 22h às 8h (Brasília). */
export function isQuietHours(now: Date): boolean {
  const h = spHour(now);
  return h >= RULES.QUIET_FROM_HOUR || h < RULES.QUIET_UNTIL_HOUR;
}

export function dailyCap(now: Date): number {
  const d = spDayStr(now);
  return d >= RULES.BLACK_FRIDAY_WEEK.from && d <= RULES.BLACK_FRIDAY_WEEK.to ? RULES.DAILY_CAP_BLACK_FRIDAY : RULES.DAILY_CAP;
}

/** Duplicata do produto dentro de 48 h, salvo novo menor preço (G1) >= 5% abaixo do enviado depois de 6 h. */
export function productDedupBlock(c: Pick<Candidate, 'masterProductId' | 'priceCents' | 'trigger'>, history: SentRecord[], now: Date): string | null {
  const prior = history
    .filter((h) => h.masterProductId === c.masterProductId && now.getTime() - h.sentAt.getTime() < RULES.PRODUCT_DEDUP_HOURS * 3600_000)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  if (!prior) return null;
  const hoursSince = (now.getTime() - prior.sentAt.getTime()) / 3600_000;
  const lowerEnough = c.priceCents <= prior.priceCents * (1 - RULES.REBREAK_PCT / 100);
  if (c.trigger === 'G1' && lowerEnough && hoursSince >= RULES.REBREAK_AFTER_HOURS) return null;
  return `produto_ja_enviado_ha_${Math.floor(hoursSince)}h`;
}

const PRIORITY: Record<Trigger, number> = { G1: 0, G2: 1, G3: 2, G4: 3, G5: 4, G6: 5 };

export interface LimitPlan {
  /** Próximo a sair agora (no máximo 1 por hora). null = nada a enviar neste momento. */
  next: Candidate | null;
  /** Por que não há `next` ou por que cada outro foi adiado. */
  deferred: Array<{ messageKey: string; reason: string }>;
  state: { quiet: boolean; sentToday: number; dailyCap: number; sentLastHour: number };
}

/**
 * Aplica silêncio, teto diário, 1 por hora, dedup de 48 h e rodízio. Só considera `auto` + sendable (envio
 * automático); as marcadas `review` esperam aprovação humana e não entram aqui.
 */
export function applyLimits(cands: Candidate[], history: SentRecord[], now: Date): LimitPlan {
  const deferred: LimitPlan['deferred'] = [];
  const today = spDayStr(now);
  const sentToday = history.filter((h) => spDayStr(h.sentAt) === today).length;
  const sentLastHour = history.filter((h) => now.getTime() - h.sentAt.getTime() < 3600_000).length;
  const cap = dailyCap(now);
  const quiet = isQuietHours(now);
  const state = { quiet, sentToday, dailyCap: cap, sentLastHour };
  const pool = cands.filter((c) => c.sendable && c.status === 'auto');
  const global = quiet ? 'silencio_22h_as_8h' : sentToday >= cap ? `teto_diario_${cap}` : sentLastHour >= RULES.HOURLY_CAP ? 'limite_1_por_hora' : null;
  if (global) {
    for (const c of pool) deferred.push({ messageKey: c.messageKey, reason: global });
    return { next: null, deferred, state };
  }
  const ok: Candidate[] = [];
  for (const c of pool) {
    const dup = productDedupBlock(c, history, now);
    if (dup) deferred.push({ messageKey: c.messageKey, reason: dup });
    else ok.push(c);
  }
  ok.sort((a, b) => PRIORITY[a.trigger] - PRIORITY[b.trigger] || (b.belowAvgPct ?? 0) - (a.belowAvgPct ?? 0));
  const last = [...history].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  // Rodízio: não repetir a rede da última mensagem quando houver alternativa.
  const alt = last?.networkSlug ? ok.find((c) => c.networkSlug !== last.networkSlug) : null;
  const next = alt ?? ok[0] ?? null;
  for (const c of ok) if (c !== next) deferred.push({ messageKey: c.messageKey, reason: 'fila_1_por_hora' });
  return { next, deferred, state };
}

/** Revalidação no envio: o preço relido precisa estar dentro de 2% do detectado. */
export function priceWithinTolerance(detectedCents: number, currentCents: number): boolean {
  if (detectedCents <= 0) return false;
  return Math.abs(currentCents - detectedCents) / detectedCents <= RULES.SEND_PRICE_TOLERANCE_PCT / 100;
}
