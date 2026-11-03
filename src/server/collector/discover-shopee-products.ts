import 'server-only';
import { entryGateAttributes } from '@/lib/catalog/gate';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliateNetworks, masterProducts } from '@/db/schema';
import { generateShopeeAffiliateLink, isShopeeAffiliateConfigured, ShopeeApiError } from './sources/shopee-auth';
import { parseShopeeNode, queryProductOffers, shopeePublicUrl, type ShopeeOfferNode } from './sources/shopee';
import { classifyFromAttributes } from './sources/mercado-livre-classify';
import { resolveProductTypeFromTitle } from '@/lib/affiliate/product-type-classifier';
import { derivePlatformFromTitle, resolveGameFormat } from '@/lib/affiliate/game-classification';
import { findExistingMasterProduct } from '@/lib/affiliate/dedup';
import { slugify } from '@/lib/slugify';
import { isNonProductAccessory, isUsedCondition } from './discover-products';
import { recordPriceSnapshot } from './record-price-snapshot';
import { getMasterReferencePrices, isImplausiblyLow, median } from './price-plausibility';

/**
 * Descoberta Shopee SOMENTE pela API oficial (productOfferV2 por palavra-chave,
 * paginado). A busca pública (scraping) foi removida. Sem credenciais, não faz
 * nenhuma chamada nem escrita.
 */
const SHOPEE_SEARCH_TERMS = [
  'jogo nintendo switch',
  'jogo ps5',
  'jogo ps4',
  'jogo xbox series',
  'console playstation 5',
  'console nintendo switch',
  'zelda nintendo switch',
  'mario nintendo switch',
  'resident evil ps5',
  'silent hill ps5',
  'final fantasy ps5',
  'elden ring ps5',
  'gta 5 ps5',
  'hollow knight nintendo switch',
  'controle dualsense ps5',
  'controle xbox series',
];

/** Termos por execução, em rotação pelo relógio (sem estado): cobre a lista inteira em poucas horas. */
const TERMS_PER_RUN = 4;
const PAGES_PER_TERM = 2;
const PAGE_LIMIT = 50; // teto real confirmado pela API
const MAX_CREATED_PER_RUN = 60;
const TIME_BUDGET_MS = 80_000; // a rota de descoberta tem maxDuration 120 s e roda em paralelo ao Mercado Livre

function termsForThisRun(): string[] {
  const slot = Math.floor(Date.now() / (5 * 60 * 1000));
  const start = (slot * TERMS_PER_RUN) % SHOPEE_SEARCH_TERMS.length;
  return Array.from({ length: TERMS_PER_RUN }, (_, i) => SHOPEE_SEARCH_TERMS[(start + i) % SHOPEE_SEARCH_TERMS.length]);
}

export async function ensureShopeeNetwork() {
  const [existing] = await db.select().from(affiliateNetworks).where(eq(affiliateNetworks.slug, 'shopee')).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(affiliateNetworks)
    .values({ name: 'Shopee', slug: 'shopee', websiteUrl: 'https://shopee.com.br', colorHex: '#EE4D2D', isActive: true })
    .returning();
  return created;
}

export async function discoverShopeeProducts(): Promise<{
  termsSearched: number;
  found: number;
  created: number;
  alreadyExisted: number;
  discarded: number;
  errors: string[];
}> {
  const summary = { termsSearched: 0, found: 0, created: 0, alreadyExisted: 0, discarded: 0, errors: [] as string[] };
  if (!isShopeeAffiliateConfigured()) return summary;

  const deadline = Date.now() + TIME_BUDGET_MS;

  try {
    const network = await ensureShopeeNetwork();

    termLoop: for (const term of termsForThisRun()) {
      summary.termsSearched++;
      const nodes: ShopeeOfferNode[] = [];

      try {
        for (let page = 1; page <= PAGES_PER_TERM; page++) {
          const res = await queryProductOffers({ keyword: term, page, limit: PAGE_LIMIT, sortType: 2 });
          for (const raw of res.nodes) {
            const parsed = parseShopeeNode(raw);
            if ('node' in parsed) nodes.push(parsed.node);
            else summary.discarded++;
          }
          if (!res.hasNextPage) break;
        }
      } catch (err) {
        summary.errors.push(`Erro ao buscar Shopee (${term}): ${(err as Error).message}`);
        if (err instanceof ShopeeApiError && err.isFatalForBatch) break termLoop;
        continue;
      }

      summary.found += nodes.length;
      // Referência de lote para master NOVO sem nenhuma cotação (anti-isca): mediana da própria busca.
      const batchMedian = median(nodes.map((n) => n.priceCents));

      for (const item of nodes) {
        if (Date.now() > deadline || summary.created >= MAX_CREATED_PER_RUN) break termLoop;
        try {
          if (isNonProductAccessory(item.productName) || isUsedCondition(item.productName)) {
            summary.discarded++;
            continue;
          }

          const shopeeRef = `shopee-${item.itemId}`;
          const [existingOffer] = await db
            .select({ id: affiliateOffers.id })
            .from(affiliateOffers)
            .where(eq(affiliateOffers.externalRef, shopeeRef))
            .limit(1);
          if (existingOffer) {
            // Preço/reativação dessas ofertas é do collect-shopee-prices.ts.
            summary.alreadyExisted++;
            continue;
          }

          // Tipo: só jogo/console/acessório gamer, pelo classificador existente.
          const productType = await resolveProductTypeFromTitle(item.productName, item.priceCents);
          if (!productType) {
            summary.discarded++;
            continue;
          }

          // Plataforma: estruturada pela classificação do título; se falhar, derivada do título.
          const classification = classifyFromAttributes([], item.productName);
          let platform = classification.gamePlatformGen;
          if (platform === 'unknown') platform = derivePlatformFromTitle(item.productName);
          // Jogo/console sem plataforma identificável não pode ser deduplicado com segurança: descarta
          // em vez de criar master 'unknown'. Acessório universal pode legitimamente não ter plataforma.
          if (platform === 'unknown' && productType !== 'accessory') {
            summary.discarded++;
            continue;
          }
          // A Shopee não manda formato estruturado: só o título prova físico x digital (nunca chuta). Auditoria
          // 2026-11-03: 209 dos ~434 jogos Shopee aprovados diziam "mídia física" no título e estavam 'unknown'.
          const gameFormat = productType === 'game' ? resolveGameFormat(item.productName, classification.gameFormat) : classification.gameFormat;
          const classified = { ...classification, gamePlatformGen: platform, gameFormat };

          // Dedup obrigatório (título+plataforma normalizados) antes de qualquer master novo.
          const existingMaster = await findExistingMasterProduct(item.productName, platform, { productType, gameFormat: productType === 'game' ? gameFormat : null });

          // Anti-isca: preço < 35% da mediana. Contra as cotações do master existente; se for master novo
          // (sem referência), contra a mediana do lote da busca.
          const refs = existingMaster ? await getMasterReferencePrices(existingMaster.id) : [];
          const lowVsMaster = existingMaster && refs.length >= 2 && isImplausiblyLow(item.priceCents, refs);
          const lowVsBatch =
            (!existingMaster || refs.length < 2) && batchMedian != null && nodes.length >= 5 && item.priceCents < batchMedian * 0.35;
          if (lowVsMaster || lowVsBatch) {
            summary.discarded++;
            continue;
          }

          let masterId: string;
          if (existingMaster) {
            masterId = existingMaster.id;
          } else {
            const [created] = await db
              .insert(masterProducts)
              .values({
                name: item.productName,
                slug: slugify(`${item.productName}-shopee-${item.itemId.slice(-6)}`),
                productType,
                defaultImages: item.imageUrl ? [item.imageUrl] : [],
                ...classified,
                attributes: entryGateAttributes(item.productName, productType ?? 'game'),
                classifiedAt: new Date(),
              })
              .returning({ id: masterProducts.id });
            masterId = created.id;
          }

          const publicUrl = shopeePublicUrl(item);
          const shortLink = await generateShopeeAffiliateLink(publicUrl);

          const [newOffer] = await db
            .insert(affiliateOffers)
            .values({
              masterProductId: masterId,
              networkId: network.id,
              title: item.productName,
              slug: slugify(`${item.productName}-shopee-${randomUUID().slice(0, 6)}`),
              affiliateUrl: shortLink || publicUrl,
              affiliateLinkPending: !shortLink,
              imageUrl: item.imageUrl,
              storeName: item.shopName,
              externalRef: shopeeRef,
              // 0 = "ainda não coletado"; recordPriceSnapshot grava o preço real e o 1º snapshot.
              currentPriceCents: 0,
              status: 'active',
              publishedAt: new Date(),
              lastCheckedAt: new Date(),
            })
            .returning({ id: affiliateOffers.id });

          await recordPriceSnapshot({ offerId: newOffer.id, priceCents: item.priceCents, listPriceCents: item.listPriceCents, source: 'api' });
          summary.created++;
        } catch (e) {
          summary.errors.push(`Erro item Shopee ${item.itemId}: ${(e as Error).message}`);
        }
      }
    }
  } catch (globalErr) {
    summary.errors.push(`Erro global Shopee: ${(globalErr as Error).message}`);
  }

  return summary;
}
