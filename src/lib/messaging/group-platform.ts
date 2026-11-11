// Mensagens de PLATAFORMA (P1 a P5; dono, 2026-11-11): insights que vendem as funcionalidades do site na prática, sempre com dado
// real do produto no momento do envio. PURO: recebe os fatos já lidos do banco (ProductFacts) e devolve candidatos.
// Páginas do site usadas (conferidas em src/app): /monitoramento/comparar/<masterProductId> (histórico, comparação entre lojas e
// ofertas do produto). Não existe página própria de "alertas" ou de "média"; todas apontam para a página do produto.

import {
  RELEASED_VERTICALS,
  RULES,
  daysBefore,
  displayParts,
  finish,
  judgeOffer,
  medianOf,
  nameOf,
  netKind,
  spDayStr,
  toMsgOffer,
  type Candidate,
  type EvalContext,
  type OfferFact,
  type OfferVerdict,
  type ProductFacts,
  type Trigger,
} from '@/lib/messaging/group-rules';
import { fmtBRL, makeMessageKey, type GroupMessageInput, type PlatformData, type PlatformKind } from '@/lib/messaging/group-messages';

const SHOPEE_REASON = 'shopee_so_com_aprovacao_humana';

/** Oferta serve de exemplo numa mensagem de plataforma? Ok, ou só com a ressalva da Shopee (a reconferência ao vivo cobre). */
function usableForPlatform(v: OfferVerdict): boolean {
  return v.kind === 'ok' || (v.kind === 'review' && v.reasons.every((r) => r === SHOPEE_REASON));
}

/** Dias inteiros de hoje até a Black Friday (0 = é hoje; negativo = já passou). */
export function daysToBlackFriday(today: string): number {
  const a = new Date(`${today}T12:00:00Z`).getTime();
  const b = new Date(`${RULES.BLACK_FRIDAY_DAY}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

interface Usable {
  p: ProductFacts;
  /** Ofertas ML/Shopee aprovadas, da mais barata para a mais cara. */
  offers: Array<{ o: OfferFact; v: OfferVerdict }>;
  cheapest: OfferFact;
  seriesDays: number;
}

const PATH = (id: string) => `/monitoramento/comparar/${id}`;

/**
 * Candidatos de plataforma a partir dos produtos já avaliados. No máximo um por modelo; um produto diferente por modelo sempre
 * que houver alternativa. Produto fora da faixa de plausibilidade (menos de 0,35x ou mais de 3x a mediana) nunca entra.
 */
export function buildPlatformCandidates(facts: ProductFacts[], ctx: EvalContext): Candidate[] {
  const today = spDayStr(ctx.now);
  const pool: Usable[] = [];
  for (const p of facts) {
    if (!RELEASED_VERTICALS.includes(p.vertical) || (p.productType !== 'game' && p.productType !== 'console') || !p.platformLabel) continue;
    if (p.catalogGate === 'review' || p.catalogGate === 'rejected') continue;
    const offers = p.offers
      .filter((o) => netKind(o) !== 'amazon')
      .map((o) => ({ o, v: judgeOffer(o, p, ctx.now, ctx.maxAgeMin) }))
      .filter((x) => usableForPlatform(x.v))
      .sort((a, b) => a.o.priceCents - b.o.priceCents);
    if (!offers.length) continue;
    const med = medianOf(p.offers.filter((o) => netKind(o) !== 'amazon').map((o) => o.priceCents));
    const cheapest = offers[0].o;
    if (med && (cheapest.priceCents < med * RULES.REVIEW_BELOW_MEDIAN_RATIO || cheapest.priceCents > med * RULES.REVIEW_ABOVE_MEDIAN_RATIO)) continue;
    pool.push({ p, offers, cheapest, seriesDays: (p.series?.length ?? 0) + 1 });
  }

  const used = new Set<string>();
  const out: Candidate[] = [];
  const pick = (cands: Array<{ u: Usable; score: number }>): { u: Usable; score: number } | null => {
    const sorted = [...cands].sort((a, b) => b.score - a.score || a.u.p.masterProductId.localeCompare(b.u.p.masterProductId));
    return sorted.find((c) => !used.has(c.u.p.masterProductId)) ?? sorted[0] ?? null;
  };
  const emit = (kind: PlatformKind, u: Usable, data: PlatformData, reason: string, score: number, offerIds?: string[]) => {
    used.add(u.p.masterProductId);
    const parts = displayParts(u.p);
    const messageKey = makeMessageKey(kind, `${u.p.masterProductId}:${kind}:${today}`, ctx.now);
    const input: GroupMessageInput = {
      vertical: u.p.vertical,
      adTag: ctx.adTag,
      messageKey,
      model: 'plataforma',
      name: nameOf(u.p),
      title: parts.title,
      meta: parts.meta,
      path: PATH(u.p.masterProductId),
      offer: toMsgOffer(u.cheapest),
      data,
    };
    out.push(
      finish(u.p, kind as Trigger, input, {
        offerIds: offerIds ?? [u.cheapest.offerId],
        primary: u.cheapest,
        reason,
        avgCents: u.p.avg?.cents ?? null,
        belowPct: null,
        dropPct: null,
        reviewReasons: [],
        cls: 'plataforma',
        moveScore: score,
        dedupSuffix: today,
      }, ctx)
    );
  };

  // P1: histórico. Produto com mais variação medida na série (precisa de pelo menos 3 dias contando hoje).
  const p1 = pick(
    pool
      .filter((u) => (u.p.series?.length ?? 0) >= 2)
      .map((u) => {
        const vals = [...(u.p.series ?? []).map((x) => x.minCents), u.cheapest.priceCents];
        return { u, score: ((Math.max(...vals) - Math.min(...vals)) / Math.min(...vals)) * 100 };
      })
      .filter((x) => x.score > 0)
  );
  if (p1) {
    const series = p1.u.p.series ?? [];
    const all = [...series, { day: today, minCents: p1.u.cheapest.priceCents }];
    const minPt = all.reduce((m, x) => (x.minCents < m.minCents ? x : m), all[0]);
    emit('P1', p1.u, { kind: 'P1', minCents: minPt.minCents, minDay: minPt.day, avgCents: p1.u.p.avg?.cents ?? null, todayCents: p1.u.cheapest.priceCents, seriesDays: all.length, sinceDay: all[0].day }, `Histórico: menor ${fmtBRL(minPt.minCents)} em ${minPt.day}, hoje ${fmtBRL(p1.u.cheapest.priceCents)} (${all.length} dias de série).`, p1.score);
  }

  // P2: comparar lojas. Mesmo produto mais barato numa loja que na outra (só ML x Shopee), diferença >= R$ 20.
  const p2 = pick(
    pool
      .map((u) => {
        const ml = u.offers.find((x) => netKind(x.o) === 'ml');
        const sp = u.offers.find((x) => netKind(x.o) === 'shopee');
        if (!ml || !sp) return null;
        const [cheap, other] = ml.o.priceCents <= sp.o.priceCents ? [ml.o, sp.o] : [sp.o, ml.o];
        const diff = other.priceCents - cheap.priceCents;
        return diff >= RULES.P2_MIN_DIFF_CENTS ? { u, score: diff / 100, cheap, other } : null;
      })
      .filter((x): x is { u: Usable; score: number; cheap: OfferFact; other: OfferFact } => !!x)
  ) as ({ u: Usable; score: number; cheap: OfferFact; other: OfferFact }) | null;
  if (p2) {
    const u = { ...p2.u, cheapest: p2.cheap };
    emit('P2', u, { kind: 'P2', cheapNet: p2.cheap.networkName, cheapCents: p2.cheap.priceCents, otherNet: p2.other.networkName, otherCents: p2.other.priceCents }, `Comparar lojas: ${p2.cheap.networkName} ${fmtBRL(p2.cheap.priceCents)} x ${p2.other.networkName} ${fmtBRL(p2.other.priceCents)}.`, p2.score, [p2.cheap.offerId, p2.other.offerId]);
  }

  // P3: monitorar. Produto em destaque do dia = o com mais ofertas ativas aprovadas.
  const p3 = pick(pool.filter((u) => u.offers.length >= 3).map((u) => ({ u, score: u.offers.length })));
  if (p3) {
    const series = p3.u.p.series ?? [];
    const minCents = series.length ? Math.min(...series.map((x) => x.minCents), p3.u.cheapest.priceCents) : null;
    emit('P3', p3.u, { kind: 'P3', todayCents: p3.u.cheapest.priceCents, minCents, offersCount: p3.u.offers.length }, `Monitorar: ${p3.u.offers.length} ofertas ativas, hoje ${fmtBRL(p3.u.cheapest.priceCents)}.`, p3.score);
  }

  // P4: média única. Produto com a média mais bem sustentada (mais oferta-dias), com pelo menos 3 ofertas e 1 dia.
  const p4 = pick(
    pool
      .filter((u) => !!u.p.avg && u.p.avg.cents > 0 && u.p.avg.distinctOffers >= RULES.MED_MIN_OFFERS && u.p.avg.spanDays >= RULES.MED_MIN_SERIES_DAYS)
      .map((u) => ({ u, score: u.p.avg?.offerDays ?? 0 }))
  );
  if (p4 && p4.u.p.avg) {
    const a = p4.u.p.avg;
    emit('P4', p4.u, { kind: 'P4', avgCents: Math.round(a.cents), offers: a.distinctOffers, offerDays: a.offerDays, spanDays: a.spanDays, todayCents: p4.u.cheapest.priceCents }, `Média única: ${fmtBRL(a.cents)} (${a.distinctOffers} ofertas, ${a.offerDays} oferta-dias, ${a.spanDays} dias).`, p4.score);
  }

  // P5: Black Friday. Produto acompanhado desde o início da série (31/10) com a maior variação medida.
  const p5 = pick(
    pool
      .filter((u) => (u.p.series?.length ?? 0) >= 2 && (u.p.series?.[0]?.day ?? '9') <= daysBefore(RULES.TRACKING_SINCE_DAY, -1))
      .map((u) => {
        const vals = [...(u.p.series ?? []).map((x) => x.minCents), u.cheapest.priceCents];
        return { u, score: ((Math.max(...vals) - Math.min(...vals)) / Math.min(...vals)) * 100 };
      })
  );
  if (p5) {
    const series = p5.u.p.series ?? [];
    const vals = [...series.map((x) => x.minCents), p5.u.cheapest.priceCents];
    emit('P5', p5.u, { kind: 'P5', daysLeft: daysToBlackFriday(today), firstCents: series[0].minCents, minCents: Math.min(...vals), maxCents: Math.max(...vals), todayCents: p5.u.cheapest.priceCents, sinceDay: series[0].day }, `Black Friday em ${daysToBlackFriday(today)} dias: produto acompanhado desde ${series[0].day}.`, p5.score);
  }
  return out;
}
