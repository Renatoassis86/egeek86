import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, isNull, or, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts } from '@/db/schema';
import { getPriceSource } from './price-sources';
import type { PriceSnapshotResult } from './price-sources';
import { recordPriceSnapshot } from './record-price-snapshot';
import { upsertSellerFromOffer } from './sources/mercado-livre-seller';
import { slugify } from '@/lib/slugify';
import './sources'; // registra os adapters disponíveis (efeito colateral do import)

/** Intervalo mínimo entre coletas — catálogo geral. */
const REFRESH_INTERVAL = sql`interval '15 minutes'`;
/** Intervalo mínimo entre coletas — jogos com pelo menos um cliente acompanhando (dado "quente"). */
const WATCHED_REFRESH_INTERVAL = sql`interval '5 minutes'`;
/**
 * Protege contra timeout se o backlog crescer — o que sobrar pega no próximo
 * tick do cron (a cada 5min). Calibrado com dado real: um teste ao vivo com
 * 200 ofertas "due" (agrupadas por vendedor, cada uma podendo gerar várias
 * chamadas de banco — o pool roda com max:1, sem ganho de paralelismo)
 * levou ~4.7min, muito acima do limite de 60s do Vercel (maxDuration da
 * rota). 30 é conservador o bastante pra caber com folga mesmo no pior caso
 * (vendedor novo, que ainda dispara a chamada extra de reputação).
 */
const MAX_OFFERS_PER_RUN = 30;

const isWatchedExpr = sql`EXISTS (
  SELECT 1 FROM affiliate_price_watches w
  WHERE w.master_product_id = ${affiliateOffers.masterProductId} AND w.is_active = true
)`;

export interface CollectPricesSummary {
  checked: number;
  /** Preços gravados (soma de todos os vendedores retornados, não só 1 por oferta). */
  updated: number;
  /** Ofertas novas criadas pra vendedor até então não rastreado no mesmo produto/rede. */
  offersCreated: number;
  skippedNoSource: number;
  skippedNoOffer: number;
  errors: { externalRef: string; message: string }[];
}

interface OfferGroup {
  networkId: string;
  networkSlug: string;
  externalRef: string;
  masterProductId: string;
  offerIds: string[];
}

/**
 * Roda uma passada de coleta: pega ofertas ativas com external_ref cadastrado
 * e vencidas pro refresh, busca preço atual via o PriceSource da rede, grava
 * o snapshot (source: 'api') e marca last_checked_at — mesmo se falhar, pra
 * não martelar uma oferta com adapter quebrado a cada execução do cron.
 *
 * Agrupa por (network_id, external_ref) antes de consultar a fonte: no
 * Mercado Livre, o mesmo catalog_product_id pode ter várias affiliate_offers
 * (uma por vendedor concorrente) — sem agrupar, a mesma chamada de API
 * seria feita várias vezes por execução, uma pra cada oferta irmã. Cada
 * resultado devolvido pela fonte vira uma oferta própria: se já existe uma
 * affiliate_offer pra aquele (produto, rede, vendedor), atualiza; senão,
 * cria como 'draft' (mesma regra de discover-products.ts — vendedor novo
 * nunca é publicado sozinho, precisa de link de afiliado real).
 */
export async function collectPrices(): Promise<CollectPricesSummary> {
  const dueOffers = await db
    .select({
      id: affiliateOffers.id,
      externalRef: affiliateOffers.externalRef,
      networkId: affiliateOffers.networkId,
      networkSlug: affiliateNetworks.slug,
      masterProductId: affiliateOffers.masterProductId,
    })
    .from(affiliateOffers)
    .innerJoin(affiliateNetworks, eq(affiliateOffers.networkId, affiliateNetworks.id))
    .where(
      and(
        // 'draft' entra aqui de propósito: produto descoberto automaticamente
        // (src/server/collector/discover-products.ts) começa sem link de afiliado
        // (não publicado), mas o histórico de preço deve começar a ser construído
        // mesmo assim — publicação e rastreamento de preço são decisões independentes.
        inArray(affiliateOffers.status, ['active', 'draft']),
        isNotNull(affiliateOffers.externalRef),
        or(
          isNull(affiliateOffers.lastCheckedAt),
          lt(
            affiliateOffers.lastCheckedAt,
            sql`now() - CASE WHEN ${isWatchedExpr} THEN ${WATCHED_REFRESH_INTERVAL} ELSE ${REFRESH_INTERVAL} END`
          )
        )
      )
    )
    .orderBy(sql`${isWatchedExpr} DESC`, sql`${affiliateOffers.lastCheckedAt} ASC NULLS FIRST`)
    .limit(MAX_OFFERS_PER_RUN);

  const summary: CollectPricesSummary = {
    checked: dueOffers.length,
    updated: 0,
    offersCreated: 0,
    skippedNoSource: 0,
    skippedNoOffer: 0,
    errors: [],
  };

  const groups = new Map<string, OfferGroup>();
  for (const offer of dueOffers) {
    const key = `${offer.networkId}:${offer.externalRef}`;
    const existing = groups.get(key);
    if (existing) {
      existing.offerIds.push(offer.id);
    } else {
      groups.set(key, {
        networkId: offer.networkId,
        networkSlug: offer.networkSlug,
        externalRef: offer.externalRef!,
        masterProductId: offer.masterProductId,
        offerIds: [offer.id],
      });
    }
  }

  for (const group of groups.values()) {
    const source = getPriceSource(group.networkSlug);
    if (!source) {
      summary.skippedNoSource += group.offerIds.length;
      continue;
    }

    try {
      const results = await source.fetchSnapshots(group.externalRef);
      if (results.length === 0) {
        summary.skippedNoOffer += group.offerIds.length;
        continue;
      }

      const { updated, created } = await applySnapshotsToGroup(group, results);
      summary.updated += updated;
      summary.offersCreated += created;
    } catch (err) {
      summary.errors.push({ externalRef: group.externalRef, message: (err as Error).message });
    } finally {
      await db
        .update(affiliateOffers)
        .set({ lastCheckedAt: new Date() })
        .where(inArray(affiliateOffers.id, group.offerIds));
    }
  }

  return summary;
}

/**
 * Aplica os resultados (um por vendedor) de um grupo — atualiza a oferta
 * existente do vendedor se já rastreada, ou cria uma nova (sempre 'draft').
 */
async function applySnapshotsToGroup(
  group: OfferGroup,
  results: PriceSnapshotResult[]
): Promise<{ updated: number; created: number }> {
  let updated = 0;
  let created = 0;
  let masterProduct: { name: string; defaultImages: string[] } | null = null;

  for (const result of results) {
    let sellerId: string;
    try {
      sellerId = await upsertSellerFromOffer(group.networkId, result.externalSellerId);
    } catch (err) {
      console.error(`Falha ao atualizar vendedor ${result.externalSellerId} (${group.externalRef}):`, (err as Error).message);
      continue;
    }

    const [existingOffer] = await db
      .select({ id: affiliateOffers.id })
      .from(affiliateOffers)
      .where(
        and(
          eq(affiliateOffers.masterProductId, group.masterProductId),
          eq(affiliateOffers.networkId, group.networkId),
          eq(affiliateOffers.sellerId, sellerId)
        )
      )
      .limit(1);

    let offerId: string;
    let isNewOffer = false;
    if (existingOffer) {
      offerId = existingOffer.id;
    } else {
      isNewOffer = true;
      if (!masterProduct) {
        const [row] = await db
          .select({ name: masterProducts.name, defaultImages: masterProducts.defaultImages })
          .from(masterProducts)
          .where(eq(masterProducts.id, group.masterProductId))
          .limit(1);
        masterProduct = row
          ? { name: row.name, defaultImages: (row.defaultImages as unknown as string[]) ?? [] }
          : { name: 'Produto', defaultImages: [] };
      }

      const baseSlug = slugify(`${masterProduct.name}-${result.externalSellerId}`);
      const [collision] = await db
        .select({ id: affiliateOffers.id })
        .from(affiliateOffers)
        .where(eq(affiliateOffers.slug, baseSlug))
        .limit(1);
      const slug = collision ? slugify(`${baseSlug}-${randomUUID().slice(0, 6)}`) : baseSlug;

      const [createdRow] = await db
        .insert(affiliateOffers)
        .values({
          masterProductId: group.masterProductId,
          networkId: group.networkId,
          title: masterProduct.name,
          slug,
          // Placeholder honesto (página de catálogo pública, deixa o
          // visitante escolher o vendedor) — nunca exposto publicamente
          // enquanto status='draft'. Admin troca pelo link de afiliado real
          // do vendedor específico antes de publicar.
          affiliateUrl: `https://www.mercadolivre.com.br/p/${group.externalRef}`,
          imageUrl: masterProduct.defaultImages[0] ?? null,
          externalRef: group.externalRef,
          sellerId,
          currentPriceCents: result.priceCents,
          status: 'draft',
          highlightNote: 'Vendedor adicional descoberto na coleta de preço, aguardando link de afiliado',
          lastCheckedAt: new Date(),
        })
        .returning();
      offerId = createdRow.id;
      created++;
    }

    await recordPriceSnapshot({
      offerId,
      priceCents: result.priceCents,
      listPriceCents: result.listPriceCents,
      source: 'api',
    });
    // sellerId só pode ter mudado na oferta EXISTENTE (buy box trocou de
    // vendedor) — numa recém-criada já foi setado no insert acima, round-trip
    // a mais aqui seria puro desperdício (o pool de conexão roda com max:1,
    // cada round-trip a menos importa de verdade pro tempo total da execução).
    if (!isNewOffer) {
      await db.update(affiliateOffers).set({ sellerId }).where(eq(affiliateOffers.id, offerId));
    }
    updated++;
  }

  return { updated, created };
}
