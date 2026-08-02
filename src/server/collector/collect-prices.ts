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

/**
 * Depois de N checagens SEGUIDAS sem achar nenhum vendedor ativo pro
 * catalog_product_id, marca a(s) oferta(s) como 'expired' — achado real
 * (2026-07-30): antes disso, uma oferta sem vendedor nenhum ficava 'active'
 * pra sempre, preço congelado na tela, disputando espaço na fila de coleta
 * com ofertas que ainda estão vivas de verdade. 3 tentativas (~45min-3h
 * dependendo do intervalo de refresh) dá margem pra não expirar por causa
 * de uma falha passageira da API.
 */
const MAX_CONSECUTIVE_MISSES = 3;

/** Intervalo mínimo entre coletas — catálogo geral. */
const REFRESH_INTERVAL = sql`interval '15 minutes'`;
/** Intervalo mínimo entre coletas — jogos com pelo menos um cliente acompanhando (dado "quente"). */
const WATCHED_REFRESH_INTERVAL = sql`interval '5 minutes'`;
/**
 * Protege contra timeout se o backlog crescer — o que sobrar pega no próximo
 * tick do cron (a cada 5min). Achado real (2026-07-29): com 40/execução e
 * ~11.700 ofertas ativas vencidas pro refresh, mais de 88% delas nunca
 * recebiam um segundo preço — o teto era tão menor que o catálogo que a
 * maioria das ofertas nunca era alcançada de fato (gráfico de preço vazio
 * pro cliente, "menor preço"/"média" praticamente congelados). Subido pra
 * 150 (mesma concorrência de 4 grupos por vez, ver GROUP_CONCURRENCY) —
 * ainda cabe com folga dentro do maxDuration=250s do plano Pro da Vercel.
 */
const MAX_OFFERS_PER_RUN = 150;

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
        // Incrementa a sequência de falhas e expira quem já bateu o teto —
        // numa query só (evita ler o valor antes pra decidir o que fazer).
        await db.execute(sql`
          UPDATE affiliate_offers
          SET consecutive_miss_count = consecutive_miss_count + 1,
              status = CASE
                WHEN status = 'active' AND consecutive_miss_count + 1 >= ${MAX_CONSECUTIVE_MISSES}
                THEN 'expired'::affiliate_offer_status
                ELSE status
              END,
              updated_at = now()
          WHERE id IN (${sql.join(group.offerIds.map((id) => sql`${id}`), sql`, `)})
        `);
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

  // O placeholder de catálogo criado por discover-products.ts (sellerId
  // nulo) nunca bate no filtro `eq(sellerId, ...)` abaixo — cada resultado
  // por vendedor sempre criava uma oferta IRMÃ nova em vez de atualizar esse
  // placeholder, que ficava com current_price_cents preso em 0 para sempre
  // (e por isso nunca aparecia nas listagens, que filtram price > 0).
  // Corrige aqui: mantém esse placeholder com o melhor preço encontrado
  // entre os vendedores, sem mexer no link nem no status dele. `sellerId
  // IS NULL` já identifica exclusivamente essa linha (não filtra por
  // affiliateLinkPending — isso é ortogonal a ter preço atualizado: um
  // placeholder pendente de link real ainda deve mostrar o preço correto,
  // só o botão de compra fica desabilitado até o link real ser colado).
  //
  // IMPORTANTE: passa por recordPriceSnapshot (não um .update() direto) —
  // achado real (2026-07-24): esse placeholder é escolhido como "melhor
  // oferta" do produto (getBestActiveOfferIdsForMasterProducts empata nele
  // sempre que seu preço bate com o do vendedor mais barato, que é o caso
  // aqui por construção) em boa parte das checagens, mas nunca tinha uma
  // linha própria em affiliate_price_snapshots — o preço "atual" exibido
  // pro cliente vinha desse placeholder, enquanto o gráfico (que só lê
  // affiliate_price_snapshots) nunca sabia que esse preço existiu.
  const [placeholderOffer] = await db
    .select({ id: affiliateOffers.id })
    .from(affiliateOffers)
    .where(
      and(
        eq(affiliateOffers.masterProductId, group.masterProductId),
        eq(affiliateOffers.networkId, group.networkId),
        isNull(affiliateOffers.sellerId)
      )
    )
    .limit(1);

  if (placeholderOffer) {
    const bestResult = results.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
    await recordPriceSnapshot({
      offerId: placeholderOffer.id,
      priceCents: bestResult.priceCents,
      listPriceCents: bestResult.listPriceCents,
      source: 'api',
    });
    await db
      .update(affiliateOffers)
      .set({ lastCheckedAt: new Date(), consecutiveMissCount: 0 })
      .where(eq(affiliateOffers.id, placeholderOffer.id));
  }

  const updatedOfferIds = new Set<string>();

  for (const result of results) {
    let sellerId: string;
    try {
      sellerId = await upsertSellerFromOffer(group.networkId, result.externalSellerId);
    } catch (err) {
      console.error(`Falha ao atualizar vendedor ${result.externalSellerId} (${group.externalRef}):`, (err as Error).message);
      continue;
    }

    const [existingOffer] = await db
      .select({
        id: affiliateOffers.id,
        affiliateLinkPending: affiliateOffers.affiliateLinkPending,
        status: affiliateOffers.status,
      })
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

      function formatMeliItemId(itemId: string): string {
        return itemId.replace(/^([A-Z]{3})(\d+)$/i, '$1-$2');
      }

      const realToolId = process.env.MELI_TOOL_ID;
      const formattedMeliId = result.externalItemId ? formatMeliItemId(result.externalItemId) : '';
      // Se for Mercado Livre, gera link direto pro anúncio específico do vendedor.
      // Achado real (2026-08-02): o parâmetro certo de rastreamento é
      // `matt_tool` (confirmado contra um link gerado de verdade no Gerador
      // de Links do Mercado Livre) — `matt_tool_id` nunca existiu de verdade.
      // Só não deu problema até aqui porque MELI_TOOL_ID nunca esteve
      // configurado (realToolId sempre undefined, todo link ficava pendente).
      const initialUrl = (group.networkSlug === 'mercado-livre' && result.externalItemId)
        ? (realToolId ? `https://produto.mercadolivre.com.br/${formattedMeliId}?matt_tool=${realToolId}` : `https://produto.mercadolivre.com.br/${formattedMeliId}`)
        : `https://www.mercadolivre.com.br/p/${group.externalRef}`;

      const [createdRow] = await db
        .insert(affiliateOffers)
        .values({
          masterProductId: group.masterProductId,
          networkId: group.networkId,
          title: masterProduct.name,
          slug,
          affiliateUrl: initialUrl,
          // Se tivermos o ID de afiliado configurado, a oferta já entra ativa e clicável pro público
          affiliateLinkPending: !realToolId,
          imageUrl: masterProduct.defaultImages[0] ?? null,
          externalRef: group.externalRef,
          sellerId,
          // Nunca o preço real aqui — 0 é o mesmo sentinel de "ainda não
          // coletado" usado em discover-products.ts. O recordPriceSnapshot()
          // logo abaixo é o único lugar que grava preço real: se essa oferta
          // já nascesse com currentPriceCents = result.priceCents, o check de
          // "priceChanged" do recordPriceSnapshot (cache já bate com o
          // input) ficava falso e pulava o INSERT do primeiro snapshot —
          // oferta nascia com preço na tela mas zero linha de histórico
          // (achado real: 132 ofertas exatamente nesse estado).
          currentPriceCents: 0,
          status: 'active',
          publishedAt: new Date(),
          lastCheckedAt: new Date(),
        })
        .returning();
      offerId = createdRow.id;
      created++;
    }

    updatedOfferIds.add(offerId);

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
      // Achou vendedor de novo pra essa oferta — zera a sequência de falhas
      // (ver MAX_CONSECUTIVE_MISSES). Também reativa quem tinha sido
      // marcada 'expired' por engano numa falha passageira e voltou a
      // aparecer, em vez de ficar presa fora do catálogo pra sempre.
      const updateData: Partial<typeof affiliateOffers.$inferInsert> = {
        sellerId,
        consecutiveMissCount: 0,
        status: existingOffer.status === 'expired' ? 'active' : existingOffer.status,
      };
      // Se o link de afiliado ainda está pendente, atualiza o placeholder com a URL do anúncio específico
      if (existingOffer.affiliateLinkPending && result.externalItemId && group.networkSlug === 'mercado-livre') {
        const realToolId = process.env.MELI_TOOL_ID;
        const formattedItemId = result.externalItemId.replace(/^([A-Z]{3})(\d+)$/i, '$1-$2');
        updateData.affiliateUrl = realToolId
          ? `https://produto.mercadolivre.com.br/${formattedItemId}?matt_tool=${realToolId}`
          : `https://produto.mercadolivre.com.br/${formattedItemId}`;
        if (realToolId) {
          updateData.affiliateLinkPending = false; // Ativa automaticamente o link!
        }
      }
      await db.update(affiliateOffers).set(updateData).where(eq(affiliateOffers.id, offerId));
    }
    updated++;
  }

  // Identifica ofertas do grupo que não foram retornadas nesta coleta
  // (vendedores que ficaram sem estoque ou removeram o anúncio).
  // Desconsideramos o placeholderOffer (que tem sellerId nulo) dessa desativação.
  const expiredOfferIds = group.offerIds.filter(
    (id) => !updatedOfferIds.has(id) && id !== placeholderOffer?.id
  );
  if (expiredOfferIds.length > 0) {
    await db
      .update(affiliateOffers)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(inArray(affiliateOffers.id, expiredOfferIds));
  }

  return { updated, created };
}
