import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers, affiliatePriceSnapshots } from '@/db/schema';

export interface RecordSnapshotInput {
  offerId: string;
  priceCents: number;
  listPriceCents?: number | null;
  couponCode?: string | null;
  source: 'manual' | 'api' | 'scrape';
  /** Anúncio (ML: MLB...) cujo preço está sendo gravado. Troca de anúncio na mesma oferta zera previous_price (troca não é queda) e relê o link (#119). */
  itemId?: string | null;
}

/**
 * Insere o snapshot (histórico, append-only) só quando o preço realmente
 * muda (ou é o primeiro snapshot da oferta) e atualiza o cache
 * affiliate_offers.current_price_cents na mesma transação — caminho único
 * usado tanto pelo cadastro manual (admin) quanto pelo coletor automático,
 * pra não duplicar a lógica de sincronização do cache em dois lugares.
 *
 * Sem o filtro de "preço mudou", toda checagem periódica (a cada 5-15min,
 * pra sempre — ver collect-prices.ts) virava uma linha nova mesmo com preço
 * idêntico ao anterior: um produto observado chegou a 15 mil linhas em 1 mês
 * só de preço repetido, deixando a consulta de histórico lenta e o gráfico
 * de cotações poluído. `last_checked_at` em affiliate_offers já registra
 * "quando foi checado pela última vez" — não precisa de uma linha de
 * histórico pra isso.
 *
 * Também marca a tag "vendedor alterou o preço" (last_price_change_at) quando
 * o preço novo difere do cache atual — não no primeiro snapshot de uma
 * oferta recém-criada (current == input.priceCents nesse caso, não conta
 * como mudança).
 */
/** Batimento: mesmo sem mudança de preço, grava 1 snapshot a cada 24h para provar que a coleta segue viva. */
const HEARTBEAT_MS = 24 * 60 * 60 * 1000;

/** Devolve true quando uma linha nova entrou em affiliate_price_snapshots (preco mudou ou batimento de 24 h). */
export async function recordPriceSnapshot(input: RecordSnapshotInput): Promise<boolean> {
  let inserted = false;
  let trocouDeAnuncio = false;
  await db.transaction(async (tx) => {
    // Serializa escritas concorrentes da mesma oferta (ticks do cron que se
    // sobrepõem): o lock vale até o fim da transação, então a segunda
    // execução lê o último snapshot já gravado pela primeira e não duplica.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.offerId}))`);

    const [current] = await tx
      .select({ currentPriceCents: affiliateOffers.currentPriceCents })
      .from(affiliateOffers)
      .where(eq(affiliateOffers.id, input.offerId))
      .limit(1);
    // Anúncio anterior (coluna fora do schema Drizzle): só lido quando o chamador informa o anúncio atual.
    if (input.itemId) {
      const prev = (await tx.execute(sql`SELECT external_item_id AS item FROM affiliate_offers WHERE id = ${input.offerId}::uuid`)) as unknown as { item: string | null }[];
      const antes = prev[0]?.item ?? null;
      trocouDeAnuncio = !!antes && antes.replace(/\D/g, '') !== input.itemId.replace(/\D/g, '');
    }

    const priceChanged = current == null || current.currentPriceCents !== input.priceCents;

    // Auditoria 2026-10-30: 47 ofertas ativas tinham current_price_cents SEM nenhuma
    // cotação igual a ele no histórico (cache e snapshot divergentes desde julho).
    // Como o preço da API batia com o cache, 'priceChanged' nunca disparava e a
    // cotação real nunca era gravada. Comparar também com o ÚLTIMO snapshot fecha
    // essa brecha: preço coletado agora é cotação real e entra no histórico.
    // A decisão de gravar depende SÓ do último snapshot (não do cache): cache
    // divergente com snapshot igual não deve gerar linha repetida.
    const [lastSnap] = await tx
        .select({
          priceCents: affiliatePriceSnapshots.priceCents,
          collectedAt: affiliatePriceSnapshots.collectedAt,
        })
        .from(affiliatePriceSnapshots)
        .where(eq(affiliatePriceSnapshots.offerId, input.offerId))
        .orderBy(desc(affiliatePriceSnapshots.collectedAt), desc(affiliatePriceSnapshots.id))
        .limit(1);
    const needsSnapshot =
      lastSnap == null ||
      lastSnap.priceCents !== input.priceCents ||
      Date.now() - lastSnap.collectedAt.getTime() >= HEARTBEAT_MS;

    if (needsSnapshot) {
      inserted = true;
      await tx.insert(affiliatePriceSnapshots).values({
        offerId: input.offerId,
        priceCents: input.priceCents,
        listPriceCents: input.listPriceCents ?? null,
        couponCode: input.couponCode ?? null,
        source: input.source,
        // Tipo de registro (migração 0038): primeira cotação, mudança de preço ou batimento de 24 h (mesmo preço).
        recordKind: lastSnap == null ? 'primeira' : lastSnap.priceCents !== input.priceCents ? 'mudanca' : 'batimento',
      });
    }

    await tx
      .update(affiliateOffers)
      .set({
        currentPriceCents: input.priceCents,
        ...(trocouDeAnuncio
          ? { previousPriceCents: null } // troca de anúncio: o preço anterior era de OUTRO anúncio, não há queda a mostrar
          : current != null && priceChanged
            ? { lastPriceChangeAt: new Date(), previousPriceCents: current.currentPriceCents }
            : {}),
      })
      .where(eq(affiliateOffers.id, input.offerId));
    if (input.itemId) {
      // Grava o anúncio precificado (índice único parcial por rede: se outro registro já tem esse anúncio, não grava).
      await tx.execute(sql`
        UPDATE affiliate_offers SET external_item_id = ${input.itemId}, item_trocado_at = CASE WHEN ${trocouDeAnuncio}::boolean THEN now() ELSE item_trocado_at END
        WHERE id = ${input.offerId}::uuid AND (external_item_id IS DISTINCT FROM ${input.itemId})
          AND NOT EXISTS (SELECT 1 FROM affiliate_offers x WHERE x.network_id = affiliate_offers.network_id AND x.external_item_id = ${input.itemId} AND x.id <> affiliate_offers.id)`);
    }
  });
  // SOMBRA (flag PRICE_DAILY_SHADOW=1, desligada por padrão): cotação nova => atualiza a oferta-dia de hoje e
  // detecta mudança do menor preço do produto (price_min_events). Melhor esforço: NUNCA derruba a coleta.
  if (inserted && process.env.PRICE_DAILY_SHADOW === '1') {
    try {
      const { shadowAfterSnapshot } = await import('@/server/pricing/shadow-hook');
      await shadowAfterSnapshot(input.offerId);
    } catch (err) {
      console.error('[price-daily] gancho da coleta falhou (ignorado):', err instanceof Error ? err.message : err);
    }
  }
  // Quarentena de preço implausível por tipo (dono, 2026-11-15, decisão 3): a leitura JÁ foi gravada acima; aqui só se marca/solta a quarentena.
  // Flag QUARENTENA_PRECO_TIPO=0 desliga. Melhor esforço: nunca derruba a coleta.
  if (inserted) {
    const { avaliarEQuarentenarPreco } = await import('./quarentena-preco-tipo');
    await avaliarEQuarentenarPreco(input.offerId, input.priceCents);
  }
  return inserted;
}
