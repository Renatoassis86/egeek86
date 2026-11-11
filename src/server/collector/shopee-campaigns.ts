import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fetchShopeeGraphQL, isShopeeAffiliateConfigured, ShopeeApiError } from './sources/shopee-auth';
import { normalizeShopeeCampaign, pickShopeeCampaignUrl, type ShopeeCampaign, type ShopeeCampaignRaw } from './shopee-campaigns-core';

/**
 * Campanhas oficiais da Shopee (shopeeOfferV2, API oficial de afiliados) gravadas em `shopee_campaigns` (migration 0034, PROPOSTA).
 * Leitura paginada, so GraphQL oficial. Sem credencial ou sem a tabela: nao grava e nao quebra (a mensagem sai sem a linha).
 */

const BASE_FIELDS = 'offerName offerType commissionRate offerLink periodStartTime periodEndTime';
// categoryId/collectionId nao foram confirmados em producao: tenta com eles e, se a API recusar o campo, repete so com os campos ja usados.
const queryFor = (fields: string) =>
  `query O($page: Int, $limit: Int) { shopeeOfferV2(page: $page, limit: $limit, sortType: 1) { nodes { ${fields} } pageInfo { hasNextPage } } }`;

type Page = { shopeeOfferV2?: { nodes?: ShopeeCampaignRaw[]; pageInfo?: { hasNextPage?: boolean } } };

async function readAll(fields: string, maxPages: number): Promise<{ nodes: ShopeeCampaignRaw[]; complete: boolean }> {
  const nodes: ShopeeCampaignRaw[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchShopeeGraphQL<Page>(queryFor(fields), { page, limit: 50 });
    nodes.push(...(data?.shopeeOfferV2?.nodes ?? []));
    if (!data?.shopeeOfferV2?.pageInfo?.hasNextPage) return { nodes, complete: true };
  }
  return { nodes, complete: false };
}

export interface RefreshShopeeCampaignsResult {
  ok: boolean;
  lidas: number;
  gravadas: number;
  desativadas: number;
  motivo?: string;
}

function msg(e: unknown): string {
  return String((e as Error)?.message ?? '') + String((e as { cause?: Error })?.cause?.message ?? '');
}

export async function refreshShopeeCampaigns(opts: { maxPages?: number } = {}): Promise<RefreshShopeeCampaignsResult> {
  if (!isShopeeAffiliateConfigured()) return { ok: false, lidas: 0, gravadas: 0, desativadas: 0, motivo: 'credenciais_ausentes' };
  const maxPages = opts.maxPages ?? 10;
  const startedAt = new Date();
  let read: { nodes: ShopeeCampaignRaw[]; complete: boolean };
  try {
    try {
      read = await readAll(`${BASE_FIELDS} categoryId collectionId`, maxPages);
    } catch (e) {
      if (e instanceof ShopeeApiError && !e.isFatalForBatch && e.kind !== 'network') read = await readAll(BASE_FIELDS, maxPages);
      else throw e;
    }
  } catch (e) {
    return { ok: false, lidas: 0, gravadas: 0, desativadas: 0, motivo: msg(e).slice(0, 200) };
  }
  const campaigns = read.nodes.map(normalizeShopeeCampaign).filter((c): c is ShopeeCampaign => c !== null);
  const startIso = startedAt.toISOString();
  let gravadas = 0;
  try {
    for (const c of campaigns) {
      await db.execute(sql`
        INSERT INTO shopee_campaigns (offer_link, offer_name, offer_type, category_id, collection_id, commission_rate_raw, period_start, period_end, active, first_seen_at, last_seen_at)
        VALUES (${c.offerLink}, ${c.offerName}, ${c.offerType}, ${c.categoryId}, ${c.collectionId}, ${c.commissionRateRaw}, ${c.periodStart}::timestamptz, ${c.periodEnd}::timestamptz, true, ${startIso}::timestamptz, ${startIso}::timestamptz)
        ON CONFLICT (offer_link) DO UPDATE SET offer_name = EXCLUDED.offer_name, offer_type = EXCLUDED.offer_type, category_id = EXCLUDED.category_id,
          collection_id = EXCLUDED.collection_id, commission_rate_raw = EXCLUDED.commission_rate_raw, period_start = EXCLUDED.period_start,
          period_end = EXCLUDED.period_end, active = true, last_seen_at = EXCLUDED.last_seen_at, updated_at = now()`);
      gravadas++;
    }
    // Leitura COMPLETA: campanha que nao veio mais deixa de ser ativa (ausencia nao prova validade).
    let desativadas = 0;
    if (read.complete) {
      const gone = (await db.execute<{ id: string }>(sql`
        UPDATE shopee_campaigns SET active = false, updated_at = now() WHERE active AND last_seen_at < ${startIso}::timestamptz RETURNING id::text AS id`)) as unknown as { id: string }[];
      desativadas = gone.length;
    }
    return { ok: true, lidas: read.nodes.length, gravadas, desativadas };
  } catch (e) {
    if (/shopee_campaigns/.test(msg(e)) && /does not exist|relation/.test(msg(e))) {
      return { ok: false, lidas: read.nodes.length, gravadas: 0, desativadas: 0, motivo: 'tabela_shopee_campaigns_ausente (migration 0034)' };
    }
    throw e;
  }
}

type CampaignRow = {
  offer_link: string; offer_name: string; offer_type: number | null; category_id: string | null; collection_id: string | null;
  commission_rate_raw: string | null; ps: string | null; pe: string | null;
};

/** Link da campanha oficial adequada ao departamento, ativa agora. Sem tabela/sem campanha: null. */
export async function loadShopeeCampaignUrl(vertical: string, now: Date = new Date()): Promise<string | null> {
  try {
    const rows = (await db.execute<CampaignRow>(sql`
      SELECT offer_link, offer_name, offer_type, category_id, collection_id, commission_rate_raw,
             to_char(period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ps,
             to_char(period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS pe
      FROM shopee_campaigns WHERE active AND period_end > ${now.toISOString()}::timestamptz`)) as unknown as CampaignRow[];
    return pickShopeeCampaignUrl(
      rows.map((r) => ({
        offerLink: r.offer_link, offerName: r.offer_name, offerType: r.offer_type, categoryId: r.category_id,
        collectionId: r.collection_id, commissionRateRaw: r.commission_rate_raw, periodStart: r.ps, periodEnd: r.pe,
      })),
      vertical,
      now
    );
  } catch {
    return null; // tabela ausente (0034 nao aplicada) ou banco indisponivel: a mensagem sai sem a linha
  }
}
