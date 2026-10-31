import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Cliques de saída (evento `affiliate_click` gravado por /go/[slug]).
 *
 * O que o evento tem (confirmado em src/app/go/[slug]/route.ts): properties
 * {offerId, networkId, slug, priceCentsAtClick, linkPending}, context {referer,
 * userAgent}, created_at. NÃO grava IP, user_id, anonymous_id nem session_id.
 *
 * Consequências, ditas sem rodeio:
 * - "Único" é APROXIMAÇÃO: visitante = md5(user-agent). Pessoas com o mesmo
 *   aparelho/navegador colapsam (subestima); não há como ligar o mesmo visitante
 *   entre navegadores. Para unicidade real, /go precisa gravar um id anônimo
 *   (cookie) — proposta no doc, não implementada aqui.
 * - Deduplicação aplicada AQUI, na leitura (o evento bruto fica intacto):
 *   (1) bot/crawler por regex no user-agent (ou UA vazio) sai de "válidos";
 *   (2) recarga/duplo clique: mesmo (oferta, UA) dentro de 30 min conta 1 válido.
 * - Cliques com linkPending=true não geram comissão; são devolvidos separados.
 * - Nenhum dado pessoal é devolvido: UA só vira hash para contar distintos.
 */

const BOT_UA_REGEX =
  '(bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|preview|headless|lighthouse|pingdom|uptime|curl/|wget|python-requests|axios|go-http|java/|okhttp|monitor|scanner|embedly|discord|slack)';

const DEDUP_BUCKET = '30 minutes';
const TZ = 'America/Sao_Paulo';

export interface ClickRange {
  from: Date;
  /** Exclusivo. */
  to: Date;
}

export interface ClickMetrics {
  /** Linhas brutas do evento. */
  totalClicks: number;
  /** Bots/UA vazio. */
  botClicks: number;
  /** Não-bot, 1 por (oferta, UA, 30 min). */
  validClicks: number;
  /** Visitantes distintos aproximados (md5 do UA) entre os válidos. */
  uniqueVisitorsApprox: number;
  /** Válidos em ofertas ainda sem link de afiliado (não comissionam). */
  pendingLinkClicks: number;
}

function validClicksCte({ from, to }: ClickRange): SQL {
  return sql`
    base AS (
      SELECT
        ae.id,
        ae.created_at,
        (ae.created_at AT TIME ZONE ${TZ})::date AS day,
        ae.properties->>'offerId' AS offer_id,
        ae.properties->>'networkId' AS network_id,
        COALESCE((ae.properties->>'linkPending')::boolean, false) AS link_pending,
        lower(COALESCE(substring(ae.context->>'referer' from '^https?://([^/:?#]+)'), '')) AS ref_host,
        COALESCE(ae.context->>'userAgent', '') AS ua
      FROM analytics_events ae
      WHERE ae.event_name = 'affiliate_click'
        AND ae.created_at >= ${from.toISOString()}::timestamptz
        AND ae.created_at < ${to.toISOString()}::timestamptz
    ),
    flagged AS (
      SELECT b.*,
        md5(b.ua) AS ua_hash,
        (b.ua = '' OR b.ua ~* ${BOT_UA_REGEX}) AS is_bot,
        date_bin(${DEDUP_BUCKET}::interval, b.created_at, timestamptz '2000-01-01') AS bucket
      FROM base b
    ),
    ranked AS (
      SELECT f.*,
        CASE WHEN f.is_bot THEN 0
             ELSE row_number() OVER (PARTITION BY f.offer_id, f.ua_hash, f.bucket ORDER BY f.created_at, f.id)
        END AS rn
      FROM flagged f
    ),
    clicks AS (
      SELECT *, (NOT is_bot AND rn = 1) AS is_valid FROM ranked
    )
  `;
}

const METRIC_COLUMNS = sql`
  COUNT(*)::int AS total_clicks,
  COUNT(*) FILTER (WHERE c.is_bot)::int AS bot_clicks,
  COUNT(*) FILTER (WHERE c.is_valid)::int AS valid_clicks,
  COUNT(DISTINCT c.ua_hash) FILTER (WHERE c.is_valid)::int AS unique_visitors,
  COUNT(*) FILTER (WHERE c.is_valid AND c.link_pending)::int AS pending_link_clicks
`;

type MetricRow = {
  total_clicks: number;
  bot_clicks: number;
  valid_clicks: number;
  unique_visitors: number;
  pending_link_clicks: number;
};

function toMetrics(r: MetricRow): ClickMetrics {
  return {
    totalClicks: Number(r.total_clicks),
    botClicks: Number(r.bot_clicks),
    validClicks: Number(r.valid_clicks),
    uniqueVisitorsApprox: Number(r.unique_visitors),
    pendingLinkClicks: Number(r.pending_link_clicks),
  };
}

/** Totais do período. */
export async function getClickTotals(range: ClickRange): Promise<ClickMetrics> {
  const rows = await db.execute<MetricRow>(sql`
    WITH ${validClicksCte(range)}
    SELECT ${METRIC_COLUMNS} FROM clicks c
  `);
  return toMetrics(rows[0] ?? { total_clicks: 0, bot_clicks: 0, valid_clicks: 0, unique_visitors: 0, pending_link_clicks: 0 });
}

export interface ClicksByDay extends ClickMetrics {
  /** YYYY-MM-DD no fuso de Brasília. Dias sem clique NÃO são preenchidos (sem dado sintético). */
  day: string;
}

export async function getClicksByDay(range: ClickRange): Promise<ClicksByDay[]> {
  const rows = await db.execute<MetricRow & { day: string }>(sql`
    WITH ${validClicksCte(range)}
    SELECT to_char(c.day, 'YYYY-MM-DD') AS day, ${METRIC_COLUMNS}
    FROM clicks c GROUP BY c.day ORDER BY c.day
  `);
  return rows.map((r) => ({ day: r.day, ...toMetrics(r) }));
}

export interface ClicksByProduct extends ClickMetrics {
  masterProductId: string | null;
  productName: string | null;
}

/** Por produto (master_product): une todas as ofertas/lojas do mesmo jogo. Oferta apagada/desconhecida -> null. */
export async function getClicksByProduct(range: ClickRange, limit = 50): Promise<ClicksByProduct[]> {
  const rows = await db.execute<MetricRow & { master_product_id: string | null; name: string | null }>(sql`
    WITH ${validClicksCte(range)}
    SELECT mp.id AS master_product_id, mp.name AS name, ${METRIC_COLUMNS}
    FROM clicks c
    LEFT JOIN affiliate_offers o ON o.id::text = c.offer_id
    LEFT JOIN master_products mp ON mp.id = o.master_product_id
    GROUP BY mp.id, mp.name
    ORDER BY COUNT(*) FILTER (WHERE c.is_valid) DESC, COUNT(*) DESC
    LIMIT ${Math.min(Math.max(limit, 1), 500)}
  `);
  return rows.map((r) => ({ masterProductId: r.master_product_id, productName: r.name, ...toMetrics(r) }));
}

export interface ClicksByStore extends ClickMetrics {
  networkId: string | null;
  networkSlug: string | null;
  networkName: string | null;
}

/** Por loja/marketplace (rede de afiliados da oferta no momento do clique). */
export async function getClicksByStore(range: ClickRange): Promise<ClicksByStore[]> {
  const rows = await db.execute<MetricRow & { network_id: string | null; slug: string | null; name: string | null }>(sql`
    WITH ${validClicksCte(range)}
    SELECT n.id AS network_id, n.slug::text AS slug, n.name AS name, ${METRIC_COLUMNS}
    FROM clicks c
    LEFT JOIN affiliate_networks n ON n.id::text = c.network_id
    GROUP BY n.id, n.slug, n.name
    ORDER BY COUNT(*) FILTER (WHERE c.is_valid) DESC
  `);
  return rows.map((r) => ({ networkId: r.network_id, networkSlug: r.slug, networkName: r.name, ...toMetrics(r) }));
}

export type ClickSourceKind =
  | 'direto'
  | 'proprio'
  | 'google'
  | 'redes_sociais'
  | 'mensageiros'
  | 'video'
  | 'outro';

export interface ClicksBySource extends ClickMetrics {
  source: ClickSourceKind;
}

function classifyReferrerHost(host: string, ownHosts: string[]): ClickSourceKind {
  if (!host) return 'direto';
  if (ownHosts.some((h) => host === h || host.endsWith(`.${h}`))) return 'proprio';
  if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia)\./.test(host) || host === 'search.brave.com') return 'google';
  if (/(^|\.)(facebook|instagram|twitter|x|t|threads|reddit|linkedin|pinterest|tiktok)\.(com|co)$/.test(host) || host === 'l.facebook.com' || host === 't.co') return 'redes_sociais';
  if (/(^|\.)(whatsapp|telegram|t)\.(com|me|org)$/.test(host) || host === 'web.whatsapp.com' || host === 't.me') return 'mensageiros';
  if (/(^|\.)(youtube|youtu|twitch)\.(com|be|tv)$/.test(host)) return 'video';
  return 'outro';
}

/**
 * Por fonte, a partir do host do Referer. Limitação: referer ausente = "direto"
 * (inclui apps, https->http, políticas de privacidade); sem UTM no evento.
 * `ownHosts`: hosts do próprio site (referer interno = clique vindo de página nossa).
 */
export async function getClicksBySource(range: ClickRange, ownHosts: string[] = []): Promise<ClicksBySource[]> {
  const rows = await db.execute<MetricRow & { ref_host: string }>(sql`
    WITH ${validClicksCte(range)}
    SELECT c.ref_host, ${METRIC_COLUMNS}
    FROM clicks c GROUP BY c.ref_host
  `);
  // Soma por categoria. Únicos NÃO são somáveis entre hosts (mesmo UA pode aparecer em dois):
  // aqui é o teto da soma, rotulado como aproximação já no tipo.
  const acc = new Map<ClickSourceKind, ClickMetrics>();
  for (const r of rows) {
    const kind = classifyReferrerHost(r.ref_host, ownHosts.map((h) => h.toLowerCase()));
    const m = toMetrics(r);
    const cur = acc.get(kind);
    if (!cur) acc.set(kind, m);
    else {
      cur.totalClicks += m.totalClicks;
      cur.botClicks += m.botClicks;
      cur.validClicks += m.validClicks;
      cur.uniqueVisitorsApprox += m.uniqueVisitorsApprox;
      cur.pendingLinkClicks += m.pendingLinkClicks;
    }
  }
  return [...acc.entries()]
    .map(([source, m]) => ({ source, ...m }))
    .sort((a, b) => b.validClicks - a.validClicks);
}
