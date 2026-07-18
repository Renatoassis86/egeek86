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
import { mapWithConcurrency } from '@/lib/concurrency';
import './sources'; // registra os adapters disponíveis (efeito colateral do import)

/** Intervalo mínimo entre coletas — catálogo geral. */
const REFRESH_INTERVAL = sql`interval '15 minutes'`;
/** Intervalo mínimo entre coletas — jogos com pelo menos um cliente acompanhando (dado "quente"). */
const WATCHED_REFRESH_INTERVAL = sql`interval '5 minutes'`;
/**
 * Protege contra timeout se o backlog crescer — o que sobrar pega no próximo
 * tick do cron (a cada 5min). 40 com processamento em paralelo (4 grupos
 * por vez, ver GROUP_CONCURRENCY) — 12 sequencial levava 26s pra completar;
 * em paralelo a mesma carga cabe com folga, então dá pra processar mais
 * por execução sem se aproximar do maxDuration.
 */
const MAX_OFFERS_PER_RUN = 40;

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
 * cria já publicada ('active', mesma regra de discover-products.ts — decisão
 * explícita do usuário de priorizar vitrine sempre cheia sobre garantir link
 * de afiliado real em 100% dos itens desde o primeiro instante).
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
        // 'draft' entra aqui de propósito: publicação e rastreamento de preço
        // são decisões independentes — mesmo uma oferta ainda não publicada
        // (ex: rascunho criado manualmente pelo admin) já acumula histórico.
        // Descoberta automática hoje já entra direto como 'active' (ver
        // discover-products.ts), então 'draft' aqui cobre principalmente o
        // fluxo manual do admin.
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

  // Cada grupo = 1 chamada de API externa (I/O, não CPU) — processar em
  // paralelo é o que faz a rota caber no maxDuration com mais ofertas por
  // execução. Concorrência 4: deixa folga no pool de conexão do banco
  // (max:5) pro trabalho de escrita (snapshot + upsert de vendedor) de cada grupo.
  const GROUP_CONCURRENCY = 4;
  await mapWithConcurrency(Array.from(groups.values()), GROUP_CONCURRENCY, async (group) => {
    const source = getPriceSource(group.networkSlug);
    if (!source) {
      summary.skippedNoSource += group.offerIds.length;
      return;
    }

    try {
      const results = await source.fetchSnapshots(group.externalRef);
      if (results.length === 0) {
        summary.skippedNoOffer += group.offerIds.length;
        return;
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
  });

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
          // visitante escolher o vendedor) — publica direto (decisão
          // explícita do usuário, 2026-07-17: vitrine sempre cheia importa
          // mais que garantir link de afiliado real em 100% dos itens).
          // Admin ainda pode trocar pelo link real do vendedor específico
          // a qualquer momento em /admin/ofertas/[id].
          affiliateUrl: `https://www.mercadolivre.com.br/p/${group.externalRef}`,
          // Aparece publicado, mas o CTA de compra fica desabilitado (ver
          // /go/[slug]/route.ts) até o admin colar o link de afiliado real.
          affiliateLinkPending: true,
          imageUrl: masterProduct.defaultImages[0] ?? null,
          externalRef: group.externalRef,
          sellerId,
          currentPriceCents: result.priceCents,
          status: 'active',
          publishedAt: new Date(),
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
