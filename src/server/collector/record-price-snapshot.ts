import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { deveIgnorarAnuncioIrmao, deveIgnorarPrecoRejeitado, ehIdDeCatalogo } from '@/lib/messaging/confirmacao-preco';
import { anuncioDoLinkVivo } from './link-do-anuncio';
import { affiliateOffers, affiliatePriceSnapshots } from '@/db/schema';

export interface RecordSnapshotInput {
  offerId: string;
  priceCents: number;
  listPriceCents?: number | null;
  couponCode?: string | null;
  source: 'manual' | 'api' | 'scrape';
  /** Anúncio (ML: MLB...) cujo preço está sendo gravado. Troca de anúncio na mesma oferta zera previous_price (troca não é queda) e relê o link (#119). */
  itemId?: string | null;
  /**
   * R-69 (Amazon): `priceCents` e SEMPRE o preco cheio. `pixCents` = preco "a vista no Pix" lido junto (atributo): numero grava, null limpa
   * (a leitura de agora nao mostra Pix), indefinido nao mexe (redes que nao tem esse conceito).
   */
  pixCents?: number | null;
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
export async function recordPriceSnapshot(inputOriginal: RecordSnapshotInput): Promise<boolean> {
  return (await recordPriceSnapshotDetalhado(inputOriginal)).inserted;
}

/** Igual a recordPriceSnapshot, mas diz se a leitura foi IGNORADA por ser de anúncio irmão (#119): quem chama não deve confirmar nem realinhar o link. */
export async function recordPriceSnapshotDetalhado(inputOriginal: RecordSnapshotInput): Promise<{ inserted: boolean; ignorado: boolean }> {
  let input = inputOriginal;
  let inserted = false;
  let trocouDeAnuncio = false;
  let ignoradoIrmao = false;
  // Antes de um anúncio irmão ASSUMIR (do link sem leitura há > 3 h), confere pela API se o do link ainda está vivo (fora da transação: chamada de rede).
  let linkVivo: boolean | null = null;
  if (input.itemId) {
    const pre = (await db.execute(sql`SELECT link_item_id AS link, external_ref AS ref, last_price_confirmed_at AS conf FROM affiliate_offers WHERE id = ${input.offerId}::uuid`).catch(() => [])) as unknown as { link: string | null; ref: string | null; conf: Date | string | null }[];
    const p0 = pre[0];
    if (p0?.link && !ehIdDeCatalogo(input.itemId, p0.ref) && !deveIgnorarAnuncioIrmao({ linkItemId: p0.link, itemNovo: input.itemId, confirmadoEm: p0.conf ? new Date(p0.conf) : null, now: new Date() })
        && p0.link.replace(/\D/g, '') !== input.itemId.replace(/\D/g, '')) {
      linkVivo = await anuncioDoLinkVivo(p0.ref, p0.link);
    }
  }
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
      const prev = (await tx.execute(sql`SELECT external_item_id AS item, link_item_id AS link, external_ref AS ref, last_price_confirmed_at AS conf, (SELECT a.note FROM offer_link_audit a WHERE a.offer_id = affiliate_offers.id AND a.verdict = 'ok' AND a.note LIKE 'corrigido de%' AND a.checked_at > now() - interval '120 minutes' ORDER BY a.checked_at DESC LIMIT 1) AS corr FROM affiliate_offers WHERE id = ${input.offerId}::uuid`)) as unknown as { item: string | null; link: string | null; ref: string | null; conf: Date | string | null; corr: string | null }[];
      const antes = prev[0]?.item ?? null;
      // Guarda (#119): id de catálogo nunca é anúncio; ignora o informado.
      if (ehIdDeCatalogo(input.itemId, prev[0]?.ref)) input = { ...input, itemId: null };
      // Precedência da página: o valor que a página acabou de corrigir (últimas 2 h) não volta pelo coletor (a API do catálogo pode estar atrasada).
      else if (deveIgnorarPrecoRejeitado({ nota: prev[0]?.corr, priceCents: input.priceCents })) { ignoradoIrmao = true; return; }
      // Anúncio irmão com o do link lido há pouco: não troca preço nem anúncio (preço = o do anúncio do link).
      // Anúncio irmão: ignora se o do link foi lido há < 3 h OU se a API diz que o do link ainda está vivo; só assume com o do link morto (false) ou indeterminado após 3 h sem leitura.
      else if (prev[0]?.link && prev[0].link.replace(/\D/g, '') !== input.itemId.replace(/\D/g, '') && (deveIgnorarAnuncioIrmao({ linkItemId: prev[0].link, itemNovo: input.itemId, confirmadoEm: prev[0]?.conf ? new Date(prev[0].conf) : null, now: new Date() }) || linkVivo !== false)) { ignoradoIrmao = true; return; } // irmão só assume com o anúncio do link comprovadamente fora do catálogo (false); indeterminado (null) não deixa assumir
      trocouDeAnuncio = !!antes && !!input.itemId && antes.replace(/\D/g, '') !== input.itemId.replace(/\D/g, '');
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
        ...(input.pixCents !== undefined ? { priceType: 'cheio', pixCents: input.pixCents } : {}),
      });
    }
    // R-69: o Pix de agora e atributo da oferta (cache de leitura); nunca entra no preco da serie.
    if (input.pixCents !== undefined) {
      await tx.execute(input.pixCents != null
        ? sql`UPDATE affiliate_offers SET pix_cents = ${input.pixCents}, pix_visto_em = now() WHERE id = ${input.offerId}::uuid`
        : sql`UPDATE affiliate_offers SET pix_cents = NULL WHERE id = ${input.offerId}::uuid AND pix_cents IS NOT NULL`);
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
  if (ignoradoIrmao) return { inserted: false, ignorado: true };
  // GATILHO DE PRECO-ISCA (Fluxo Mestre R-61, dono 2026-11-16): TODA cotacao de TODA rede e item e julgada contra os outros anuncios do mesmo produto
  // ANTES do gancho da oferta-dia. Isca = marcada em preco_isca_marcas (nunca apagada) e oferta em quarentena. Flag GATILHO_PRECO_ISCA=0 desliga. Melhor esforco.
  if (inserted) {
    const { avaliarEMarcarIsca } = await import('@/server/pricing/preco-isca');
    await avaliarEMarcarIsca(input.offerId, input.priceCents);
  }
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
  return { inserted, ignorado: false };
}
