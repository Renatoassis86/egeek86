import 'server-only';
import { ImageResponse } from 'next/og';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { loadOffers } from '@/server/pricing/price-daily';
import { amazonScope } from '@/lib/pricing/amazon-mode';
import {
  OFFER_ACTIVE_DAYS,
  PRICE_DAILY_REGIME_START,
  addDays,
  computeDayState,
  computeLiveMinFromOffers,
  computePeriodMetrics,
  spDay,
  type OfferInput,
  type PeriodDay,
} from '@/lib/pricing/daily-state';
import { readPlatform } from '@/lib/catalog/platform';
import {
  CALLOUT_H,
  CALLOUT_W,
  CALLOUT_X,
  CARD_COLORS as C,
  CARD_CURRENT_MAX_AGE_MS,
  CARD_H,
  CARD_MAX_DAYS,
  CARD_W,
  PLOT,
  buildAlt,
  buildCaption,
  buildCardModel,
  formatDayShort,
  formatStamp,
  layoutCard,
  platformLabel,
  type CardCurrent,
  type CardDay,
  type CardInput,
  type CardLayout,
  type CardModel,
} from '@/lib/pricing/price-card-model';

/**
 * CARTÃO DE HISTÓRICO DE PREÇO (PNG 1200x675) para Telegram e WhatsApp (ata 2026-11-10, seção 4). SOMENTE LEITURA do banco.
 *  - Série: a MESMA regra do site (`computeDayState`, ADR 0004: cada oferta vale 1 por dia), recalculada em memória; a Amazon segue a flag
 *    PRICE_AMAZON_MODE (`off`/`shadow`: fora; `on`: dentro, só games). Nada é interpolado.
 *  - Média única: `computePeriodMetrics` sobre os mesmos dias desenhados (oferta-dias, não média das médias).
 *  - Preço atual: menor preço hoje entre ofertas ATIVAS, elegíveis, com link pronto e confirmadas nas últimas 6 h, só Mercado Livre e Shopee.
 *  - Devolve null quando não há dado suficiente (< 3 dias medidos, sem preço atual válido, produto inexistente). Nunca desenha curva inventada.
 * A imagem é gerada em memória (next/og) e não é arquivo de public/images.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => new Date(v as string | Date);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ofertas ELEGÍVEIS do produto com as linhas oferta-dia, na MESMA leitura do site (`loadOffers`). A Amazon segue a flag PRICE_AMAZON_MODE:
 * `off`/`shadow` = sem Amazon (contrato: cache de preço <= 24 h; ela nunca entra no histórico); `on` = com Amazon, só games, frescor 24 h.
 */
export async function loadCardOffers(masterProductId: string, fromDay: string): Promise<OfferInput[]> {
  return (await loadOffers(db, [masterProductId], fromDay)).get(masterProductId) ?? [];
}

/** Menor preço de HOJE: ofertas ativas, elegíveis, com link pronto, confirmadas há <= 6 h, só Mercado Livre e Shopee. */
async function loadCurrent(masterProductId: string, now: Date): Promise<CardCurrent | null> {
  const since = new Date(now.getTime() - CARD_CURRENT_MAX_AGE_MS).toISOString();
  const rows = await db.execute<Row>(sql`
    SELECT o.id, o.network_id, o.seller_id, n.name AS net_name, o.current_price_cents, o.last_price_confirmed_at
    FROM affiliate_offers o
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.master_product_id = ${masterProductId}::uuid AND o.status = 'active' AND o.current_price_cents > 0
      AND o.affiliate_link_pending = false AND COALESCE(o.affiliate_url, '') <> ''
      AND o.last_price_confirmed_at >= ${since}::timestamptz
      AND n.slug IN ('mercado-livre', 'shopee') AND ${eligibleOfferSql('o')}
  `);
  const names = new Map<string, string>();
  const live = computeLiveMinFromOffers(
    rows.map((r) => {
      names.set(String(r.id), String(r.net_name));
      const at = iso(r.last_price_confirmed_at);
      return { offerId: String(r.id), networkId: (r.network_id as string | null) ?? null, sellerId: (r.seller_id as string | null) ?? null, priceCents: Number(r.current_price_cents), quotedAt: at, checkedAt: at };
    }),
    now
  );
  if (!live) return null;
  return { cents: live.minCents, confirmedAt: live.observedAt, store: names.get(live.offerId) ?? 'Loja' };
}

/** Carrega e calcula a entrada do cartão (dados reais do banco). null = produto inexistente. */
export async function loadCardInput(masterProductId: string, now: Date): Promise<CardInput | null> {
  if (!UUID.test(masterProductId)) return null;
  const mp = await db.execute<Row>(sql`SELECT name, game_platform_gen FROM master_products WHERE id = ${masterProductId}::uuid`);
  if (!mp[0]) return null;
  const today = spDay(now);
  const windowFrom = addDays(today, -(CARD_MAX_DAYS - 1));
  const firstDay = windowFrom > PRICE_DAILY_REGIME_START ? windowFrom : PRICE_DAILY_REGIME_START;

  const [offers, current] = await Promise.all([loadCardOffers(masterProductId, addDays(firstDay, -OFFER_ACTIVE_DAYS)), loadCurrent(masterProductId, now)]);

  const days: CardDay[] = [];
  const periodDays: PeriodDay[] = [];
  for (let d = firstDay; d <= today; d = addDays(d, 1)) {
    const st = computeDayState(d, now, offers);
    if ((st.quality === 'complete' || st.quality === 'partial') && st.minCents != null) {
      days.push({ day: d, minCents: st.minCents, partial: st.quality === 'partial' });
      periodDays.push({ day: d, members: st.members, minCents: st.minCents });
    }
  }
  const pm = computePeriodMetrics(periodDays, current?.cents ?? null);
  const title = String(mp[0].name);
  const rp = readPlatform(mp[0].game_platform_gen as Parameters<typeof readPlatform>[0], title);
  return {
    title,
    platformLabel: platformLabel(rp.platform, rp.legacyLabel),
    days,
    avgCents: pm.avgOfferDayCents != null ? Math.round(pm.avgOfferDayCents) : null,
    distinctOffers: pm.distinctOffers,
    current,
    now,
  };
}

// ------------------------------------------------------------------------------------------------
// Desenho (JSX do satori: só flexbox e posicionamento absoluto; formas em SVG, textos em div)
// ------------------------------------------------------------------------------------------------

const abs = (left: number, top: number, extra: Record<string, string | number> = {}) => ({ position: 'absolute' as const, display: 'flex' as const, left, top, ...extra });

function CardView({ m, L }: { m: CardModel; L: CardLayout }) {
  const stamp = `Atualizado em ${formatStamp(m.current.confirmedAt)} (Brasília)`;
  const note = `Traço: menor preço de cada dia entre as lojas${amazonScope() === 'include' ? '' : ', sem a Amazon'}. Eixo de valores não parte do zero.${m.hasPartial ? ' Traço claro: dia com 1 a 2 ofertas.' : ''}`;
  const subtitle = `Histórico de ${formatDayShort(m.firstDay)} a ${formatDayShort(m.lastDay)} (${m.nDays} dias medidos)`;
  return (
    <div style={{ width: CARD_W, height: CARD_H, display: 'flex', position: 'relative', background: C.canvas, color: C.text }}>
      <svg width={CARD_W} height={CARD_H} viewBox={`0 0 ${CARD_W} ${CARD_H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        <rect x={0} y={0} width={CARD_W} height={CARD_H} fill={C.canvas} />
        <rect x={PLOT.l} y={PLOT.t} width={PLOT.r - PLOT.l} height={PLOT.b - PLOT.t} fill={C.surface} />
        {L.yTicks.map((t, i) => (
          <line key={`gy${i}`} x1={PLOT.l} x2={PLOT.r} y1={t.y} y2={t.y} stroke={C.grid} strokeWidth={1} />
        ))}
        {L.xTicks.map((t, i) => (
          <line key={`gx${i}`} x1={t.x} x2={t.x} y1={PLOT.t} y2={PLOT.b} stroke={C.grid} strokeWidth={1} />
        ))}
        <line x1={PLOT.l} x2={PLOT.r} y1={PLOT.b} y2={PLOT.b} stroke={C.secondary} strokeWidth={1} />
        {L.avgY != null && <line x1={PLOT.l} x2={PLOT.r} y1={L.avgY} y2={L.avgY} stroke={C.secondary} strokeWidth={2} strokeDasharray="10 7" />}
        <line x1={L.record.x} x2={PLOT.r} y1={L.record.y} y2={L.record.y} stroke={C.text} strokeWidth={1.5} strokeDasharray="2 5" />
        <line x1={PLOT.l} x2={PLOT.r} y1={L.current.y} y2={L.current.y} stroke={C.orange} strokeWidth={1.5} strokeDasharray="6 6" opacity={0.6} />
        {L.vSegs.map((s, i) => (
          <line key={`v${i}`} x1={s.x} x2={s.x} y1={s.y0} y2={s.y1} stroke={C.gold} strokeWidth={3} />
        ))}
        {L.hSegs.map((s, i) => (
          <line key={`h${i}`} x1={s.x0} x2={s.x1} y1={s.y} y2={s.y} stroke={C.gold} strokeWidth={3} opacity={s.partial ? 0.5 : 1} />
        ))}
        {L.callouts.map((c) => (
          <line key={`l${c.key}`} x1={PLOT.r} y1={c.pointY} x2={CALLOUT_X} y2={c.boxCy} stroke={c.color} strokeWidth={1.5} opacity={0.8} />
        ))}
        <rect x={L.record.x - 7} y={L.record.y - 7} width={14} height={14} fill={C.text} stroke={C.canvas} strokeWidth={2} />
        <rect x={L.current.x - 8} y={L.current.y - 8} width={16} height={16} fill={C.orange} stroke={C.canvas} strokeWidth={2} />
      </svg>

      <div style={abs(48, 30, { fontSize: 34, color: C.text, width: 1104 })}>{m.title}</div>
      <div style={abs(48, 84, { alignItems: 'center', fontSize: 18, color: C.secondary })}>
        {m.platformLabel ? (
          <div style={{ display: 'flex', border: `1px solid ${C.gold}`, color: C.gold, padding: '3px 10px', marginRight: 14, fontSize: 16 }}>{m.platformLabel}</div>
        ) : null}
        <div style={{ display: 'flex' }}>{subtitle}</div>
      </div>
      <div style={abs(48, 128, { fontSize: 15, color: C.secondary })}>Menor preço entre as lojas monitoradas, em reais</div>

      {L.yTicks.map((t, i) => (
        <div key={`ty${i}`} style={abs(36, t.y - 11, { width: PLOT.l - 36 - 12, justifyContent: 'flex-end', fontSize: 16, color: C.secondary })}>{t.label}</div>
      ))}
      {L.xTicks.map((t, i) => (
        <div key={`tx${i}`} style={abs(t.x - 40, PLOT.b + 12, { width: 80, justifyContent: 'center', fontSize: 16, color: C.secondary })}>{t.label}</div>
      ))}

      {L.callouts.map((c) => (
        <div
          key={`c${c.key}`}
          style={abs(CALLOUT_X, c.boxCy - CALLOUT_H / 2, { width: CALLOUT_W, height: CALLOUT_H, flexDirection: 'column', justifyContent: 'center', background: C.surface, borderLeft: `5px solid ${c.color}`, padding: '0 14px' })}
        >
          <div style={{ display: 'flex', fontSize: 13, color: C.secondary, letterSpacing: 1.5 }}>{c.label}</div>
          <div style={{ display: 'flex', fontSize: 31, color: C.text, marginTop: 2 }}>{c.value}</div>
          <div style={{ display: 'flex', fontSize: 14, color: C.secondary, marginTop: 2 }}>{c.sub}</div>
        </div>
      ))}

      <div style={abs(48, 606, { fontSize: 14, color: C.secondary, width: 1104 })}>{note}</div>
      <div style={abs(48, 632, { fontSize: 18, color: C.text })}>{stamp}</div>
      <div style={abs(900, 633, { width: 252, justifyContent: 'flex-end', fontSize: 16, color: C.secondary })}>egeek86.com</div>
    </div>
  );
}

/** Desenha o PNG a partir do modelo já decidido. */
export async function drawHistoryCard(m: CardModel): Promise<Buffer> {
  const res = new ImageResponse(<CardView m={m} L={layoutCard(m)} />, { width: CARD_W, height: CARD_H });
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Cartão de histórico do produto. null = sem dado suficiente (menos de 3 dias medidos, sem preço atual fresco de Mercado Livre/Shopee,
 * ou produto inexistente). `caption` é HTML do Telegram (parse_mode HTML) com 3 linhas factuais; `alt` é o texto alternativo.
 */
export async function renderHistoryCard(masterProductId: string, opts?: { now?: Date }): Promise<{ png: Buffer; caption: string; alt: string } | null> {
  const now = opts?.now ?? new Date();
  const input = await loadCardInput(masterProductId, now);
  if (!input) return null;
  const model = buildCardModel(input);
  if (!model) return null;
  return { png: await drawHistoryCard(model), caption: buildCaption(model), alt: buildAlt(model) };
}
