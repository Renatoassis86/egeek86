import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { loadCardOffers } from '@/server/messaging/price-card';
import { amazonCountsIn, getAmazonMode } from '@/lib/pricing/amazon-mode';
import { readPlatform } from '@/lib/catalog/platform';
import {
  OFFER_CARD_COLORS as C,
  OFFER_CARD_SIZE,
  OFFER_GEOM as G,
  OFFER_TITLE_MAX_CHARS,
  OFFER_TITLE_NOCOVER_MAX_CHARS,
  buildOfferAlt,
  chooseInsight,
  coverBox,
  fitInsight,
  formatMoney,
  isFreshForCard,
  priceFontSize,
  sellerLabel,
  stampLine,
  storePhrase,
  truncateTitle,
  type OfferCardInput,
  type OfferCardStats,
} from '@/lib/pricing/offer-card-model';
import { fundoDaLoja } from '@/lib/pricing/cor-loja';
import { CARD_MAX_DAYS, platformLabel } from '@/lib/pricing/price-card-model';
import { OFFER_ACTIVE_DAYS, PRICE_DAILY_REGIME_START, addDays, computeDayState, computePeriodMetrics, spDay, type PeriodDay } from '@/lib/pricing/daily-state';

/**
 * CARD DE OFERTA (PNG 1080x1080) para Telegram e WhatsApp (pedido do dono, 2026-11-11). SOMENTE LEITURA do banco.
 *  - Logo oficial lida de `public/geek 86.png` em tempo de renderização e embutida como data URI (nada copiado para public/images).
 *  - Capa: `affiliate_offers.image_url` buscada na hora (timeout 5 s, em memória, nada em disco). Falhou ou formato ilegível:
 *    card SEM capa, com o título em destaque. Nunca imagem inventada.
 *  - Série do insight: a MESMA regra do site (`computeDayState`, ADR 0004) com a Amazon segundo a flag PRICE_AMAZON_MODE (off/shadow: sem). Amazon: insight só com o histórico dela mesma, e com a média única quando o modo é `on`.
 *  - Preço: o atual da própria oferta, só se ativa, elegível, com link pronto e confirmada há <= 6 h (Amazon <= 24 h).
 */

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGIME_START = PRICE_DAILY_REGIME_START;
const COVER_TIMEOUT_MS = 5000;
const COVER_MAX_BYTES = 6 * 1024 * 1024;

export async function loadOfferCardInput(
  offerId: string,
  opts?: { now?: Date; simple?: boolean; couponFinalCents?: number | null; couponReadAt?: Date | null; couponName?: string | null }
): Promise<OfferCardInput | null> {
  if (!UUID.test(offerId)) return null;
  const now = opts?.now ?? new Date();
  const rows = await db.execute<Row>(sql`
    SELECT o.id, o.master_product_id, o.status, o.current_price_cents, o.image_url, o.vertical,
           COALESCE(o.last_price_confirmed_at, o.last_checked_at) AS checked_at,
           n.slug AS net_slug, n.name AS net_name, mp.name AS mp_name, mp.game_platform_gen, COALESCE(NULLIF(o.store_name, ''), sl.nickname) AS seller_name,
           (${eligibleOfferSql('o')}) AS eligible,
           (o.affiliate_link_pending = false AND COALESCE(o.affiliate_url, '') <> '') AS link_ok
    FROM affiliate_offers o
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    INNER JOIN master_products mp ON mp.id = o.master_product_id
    LEFT JOIN affiliate_sellers sl ON sl.id = o.seller_id
    WHERE o.id = ${offerId}::uuid
  `);
  const r = rows[0];
  if (!r || r.status !== 'active' || r.eligible !== true || r.link_ok !== true || !r.checked_at) return null;
  const isAmazon = String(r.net_slug) === 'amazon';
  const priceCents = Number(r.current_price_cents);
  const checkedAt = new Date(r.checked_at as string | Date);
  if (!isFreshForCard(priceCents, checkedAt, isAmazon, now)) return null;

  const masterId = String(r.master_product_id);
  const today = spDay(now);

  // Último preço conhecido da PRÓPRIA oferta antes de hoje (card simples não consulta histórico).
  const pv = opts?.simple
    ? []
    : await db.execute<Row>(sql`
    SELECT day::text AS day, last_cents FROM price_daily_offer
    WHERE offer_id = ${offerId}::uuid AND day < ${today}::date AND last_cents > 0 ORDER BY day DESC LIMIT 1
  `);
  const prev = pv[0] ? { cents: Number(pv[0].last_cents), day: String(pv[0].day) } : null;

  const stats: OfferCardStats = { recordCents: null, seriesFirstDay: null, measuredDays: 0, avgCents: null, distinctOffers: 0, prev: opts?.simple ? null : prev };
  // PRICE_AMAZON_MODE=on (games): a Amazon também compara com a média única (que a inclui). off/shadow: só o histórico dela mesma.
  const amazonOn = isAmazon && amazonCountsIn(getAmazonMode(), String(r.vertical));
  let amazonAvg: OfferCardInput['amazonAvg'] = null;
  if (!opts?.simple && (!isAmazon || amazonOn)) {
    const windowFrom = addDays(today, -(CARD_MAX_DAYS - 1));
    const firstDay = windowFrom > REGIME_START ? windowFrom : REGIME_START;
    const offers = await loadCardOffers(masterId, addDays(firstDay, -OFFER_ACTIVE_DAYS));
    if (amazonOn) amazonAvg = offers.some((x) => !x.isAmazon) ? 'market' : 'amazon';
    const periodDays: PeriodDay[] = [];
    let record: number | null = null;
    let first: string | null = null;
    let measured = 0;
    for (let d = firstDay; d <= today; d = addDays(d, 1)) {
      const st = computeDayState(d, now, offers);
      if ((st.quality === 'complete' || st.quality === 'partial') && st.minCents != null) {
        measured++;
        if (first == null) first = d;
        periodDays.push({ day: d, members: st.members, minCents: st.minCents });
        if (d < today && (record == null || st.minCents < record)) record = st.minCents;
      }
    }
    const pm = computePeriodMetrics(periodDays, priceCents);
    stats.recordCents = record;
    stats.seriesFirstDay = first;
    stats.measuredDays = measured;
    stats.avgCents = pm.avgOfferDayCents != null ? Math.round(pm.avgOfferDayCents) : null;
    stats.distinctOffers = pm.distinctOffers;
  }

  const title = String(r.mp_name);
  const rp = readPlatform(r.game_platform_gen as Parameters<typeof readPlatform>[0], title);
  // A capa só vale se o endereço da imagem é da MESMA loja da oferta (incidente 2026-11-11: oferta do ML com imagem da Shopee/Amazon).
  const hostOk: Record<string, RegExp> = { 'mercado-livre': /mlstatic\.com|mercadolivre/i, shopee: /shopee|susercontent|shp\.ee/i, amazon: /media-amazon|ssl-images-amazon/i };
  const rawImg = typeof r.image_url === 'string' && /^https:\/\//i.test(r.image_url.trim()) ? r.image_url.trim() : null;
  const okRe = hostOk[String(r.net_slug)];
  const img = rawImg && (!okRe || okRe.test(rawImg)) ? rawImg : null;
  // Cupom: o preço do card é o COM cupom (lido na página do anúncio) e o do anúncio sem cupom vai riscado; só vale se o com-cupom é menor.
  const withCoupon = opts?.simple && opts.couponFinalCents && opts.couponFinalCents > 0 && opts.couponFinalCents < priceCents ? opts.couponFinalCents : null;
  return {
    simple: opts?.simple ? { withoutCouponCents: withCoupon ? priceCents : null, couponName: withCoupon ? couponCardName(opts.couponName) : null } : undefined,
    title,
    platformLabel: platformLabel(rp.platform, rp.legacyLabel),
    store: String(r.net_name),
    sellerName: sellerLabel(r.seller_name as string | null, String(r.net_name)),
    isAmazon,
    vertical: String(r.vertical),
    amazonAvg,
    priceCents: withCoupon ?? priceCents,
    checkedAt: withCoupon && opts?.couponReadAt ? opts.couponReadAt : checkedAt,
    imageUrl: img,
    today,
    stats,
  };
}

// ------------------------------------------------------------------------------------------------
// Ativos (logo lida do disco; capa buscada na hora)
// ------------------------------------------------------------------------------------------------

let logoUri: string | null = null;
async function loadLogo(): Promise<string | null> {
  if (logoUri) return logoUri;
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'geek 86.png'));
    logoUri = `data:image/png;base64,${buf.toString('base64')}`;
    return logoUri;
  } catch {
    return null;
  }
}

/** Busca a capa em memória. Qualquer falha (rede, status, tipo, tamanho, 5 s) devolve null. */
async function fetchCover(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS), redirect: 'follow' });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200 || buf.length > COVER_MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------
// Desenho
// ------------------------------------------------------------------------------------------------

/** Nome do cupom no card: curto (cabe ao lado do preço) e só texto; vazio = o card mantém "com o cupom". */
function couponCardName(raw: string | null | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > 30 ? `${t.slice(0, 29).trimEnd()}…` : t;
}

const abs = (left: number, top: number, extra: Record<string, string | number> = {}) => ({ position: 'absolute' as const, display: 'flex' as const, left, top, ...extra });

function OfferCardView({ input, cover, logo, insight }: { input: OfferCardInput; cover: string | null; logo: string | null; insight: string | null }) {
  const price = formatMoney(input.priceCents);
  const storeText = storePhrase(input.store);
  const sellerText = input.sellerName ? `Vendido por ${input.sellerName}` : null;
  const wc = input.simple?.withoutCouponCents ?? null;
  const fs = priceFontSize(price, sellerText && sellerText.length > storeText.length ? sellerText : storeText);
  const panel = G.panel;
  const box = coverBox();
  const hasCover = cover != null;
  const panelH = hasCover ? panel.h : 580;
  return (
    <div style={{ width: OFFER_CARD_SIZE, height: OFFER_CARD_SIZE, display: 'flex', position: 'relative', background: fundoDaLoja(input.vertical), color: C.text }}>
      {input.regua ? (
        <>
          <div style={abs(0, 0, { width: OFFER_CARD_SIZE, height: 16, background: input.regua.cor })} />
          <div style={abs(G.pad + OFFER_CARD_SIZE - 2 * G.pad - 560, 44, { width: 560, height: 70, background: input.regua.cor, color: input.regua.corTexto, alignItems: 'center', justifyContent: 'center' })}>
            <div style={{ display: 'flex', marginRight: 14 }}>
              {Array.from({ length: input.regua.degrau }).map((_, i) => (
                <div key={i} style={{ display: 'flex', width: 0, height: 0, marginRight: 4, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: `16px solid ${input.regua?.corTexto}` }} />
              ))}
            </div>
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>{input.regua.rotulo.toLocaleUpperCase('pt-BR')}</div>
          </div>
          {input.regua.pctTexto ? <div style={abs(G.pad + OFFER_CARD_SIZE - 2 * G.pad - 560, 118, { width: 560, justifyContent: 'center', fontSize: 24, color: C.secondary })}>{input.regua.pctTexto}</div> : null}
        </>
      ) : null}
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} width={G.logoW} height={G.logoH} alt="" style={{ position: 'absolute', left: G.pad, top: G.logoTop, width: G.logoW, height: G.logoH }} />
      ) : (
        <div style={abs(G.pad, G.logoTop, { fontSize: 30, color: C.gold })}>ESPAÇO GEEK 86</div>
      )}

      <div style={abs(panel.x, panel.y, { width: panel.w, height: panelH, background: C.surface, border: `1px solid ${C.grid}`, alignItems: 'center', justifyContent: 'center' })}>
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} width={box.w} height={box.h} alt="" style={{ width: box.w, height: box.h, objectFit: 'contain' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', width: panel.w - 2 * G.panelPad, justifyContent: 'center' }}>
            {input.platformLabel ? <div style={{ display: 'flex', fontSize: 26, color: C.gold, marginBottom: 22 }}>{input.platformLabel}</div> : null}
            <div style={{ display: 'flex', fontSize: 62, lineHeight: 1.15, color: C.text }}>{truncateTitle(input.title, OFFER_TITLE_NOCOVER_MAX_CHARS)}</div>
          </div>
        )}
      </div>

      {hasCover ? (
        <div style={abs(G.pad, G.titleTop, { width: G.contentW, height: G.titleLine * 2, overflow: 'hidden', alignItems: 'center', fontSize: G.titleFont, lineHeight: `${G.titleLine}px`, color: C.text })}>
          {truncateTitle(input.title, OFFER_TITLE_MAX_CHARS)}
        </div>
      ) : null}

      <div style={abs(G.pad, G.priceTop, { width: G.contentW, height: G.priceBoxH, alignItems: 'flex-end' })}>
        <div style={{ display: 'flex', fontSize: fs.price, lineHeight: 1, color: C.text, letterSpacing: -2 }}>{price}</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 22, marginBottom: Math.round(fs.price * 0.1) }}>
          {wc ? <div style={{ display: 'flex', fontSize: Math.round(fs.store * 0.9), color: C.gold, marginBottom: 6 }}>{input.simple?.couponName ? `cupom ${input.simple.couponName}` : 'com o cupom'}</div> : null}
          <div style={{ display: 'flex', fontSize: fs.store, color: C.secondary }}>{storeText}</div>
          {sellerText ? <div style={{ display: 'flex', fontSize: Math.round(fs.store * 0.9), color: C.gold, marginTop: 6 }}>{sellerText}</div> : null}
        </div>
      </div>

      {wc ? (
        <div style={abs(G.pad, G.insightTop, { alignItems: 'center', fontSize: G.insightFont - 4, color: C.secondary })}>
          <div style={{ display: 'flex', width: 8, height: G.insightFont - 4, background: C.grid, marginRight: 18 }} />
          <div style={{ display: 'flex', textDecoration: 'line-through' }}>{formatMoney(wc)}</div>
          <div style={{ display: 'flex', marginLeft: 14 }}>sem o cupom</div>
        </div>
      ) : null}

      {insight ? (
        <div style={abs(G.pad, G.insightTop, { alignItems: 'center', fontSize: G.insightFont, color: C.gold })}>
          <div style={{ display: 'flex', width: 8, height: G.insightFont, background: C.gold, marginRight: 18 }} />
          <div style={{ display: 'flex' }}>{insight}</div>
        </div>
      ) : null}

      {input.regua?.faixaTexto ? <div style={abs(G.pad, G.footerTop - 34, { width: G.contentW, fontSize: 22, color: C.secondary })}>{input.regua.faixaTexto}</div> : null}

      <div style={abs(G.pad, G.footerTop, { width: G.contentW, height: 40, justifyContent: 'space-between', alignItems: 'center', fontSize: 22, color: C.secondary })}>
        <div style={{ display: 'flex' }}>egeek86.com</div>
        <div style={{ display: 'flex' }}>{stampLine(input.checkedAt)}</div>
      </div>
    </div>
  );
}

async function draw(input: OfferCardInput, cover: string | null, logo: string | null, insight: string | null): Promise<Buffer> {
  const res = new ImageResponse(<OfferCardView input={input} cover={cover} logo={logo} insight={insight} />, { width: OFFER_CARD_SIZE, height: OFFER_CARD_SIZE });
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Desenha o card a partir da entrada. null = entrada inválida (preço <= 0). A capa é buscada aqui; se falhar (ou o satori não
 * conseguir decodificá-la), o card sai SEM capa, com o título em destaque.
 */
export async function renderOfferCard(input: OfferCardInput): Promise<{ png: Buffer; alt: string } | null> {
  if (!(input.priceCents > 0) || !input.title.trim()) return null;
  const insight = fitInsight(chooseInsight(input)?.text ?? null);
  const [logo, cover] = await Promise.all([loadLogo(), fetchCover(input.imageUrl)]);
  let png: Buffer;
  try {
    png = await draw(input, cover, logo, insight);
  } catch (err) {
    if (!cover) throw err;
    png = await draw(input, null, logo, insight);
  }
  return { png, alt: buildOfferAlt(input, insight) };
}
