import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getValidAccessToken } from '@/server/collector/sources/mercado-livre-auth';
import { recordPriceSnapshot } from '@/server/collector/record-price-snapshot';
import { alinharLinkAoAnuncio } from '@/server/collector/link-do-anuncio';
import { escolherAnuncio, type AnuncioCatalogo } from '@/lib/pricing/integridade-preco';

/**
 * INVARIANTE 1 (#119): toda oferta ML ativa tem anúncio concreto (`external_item_id` = MLB do anúncio, nunca o id do catálogo). Preenche pela API
 * oficial do catálogo (`/products/{id}/items`), um catálogo por vez, em lote pequeno, parando no 429. Ordem: ofertas que foram para mensagem nas
 * últimas 24 h, depois impressoras 3D, depois o resto. O anúncio escolhido é o do link (`link_item_id`) se estiver na lista; senão o mais barato
 * do vendedor naquele catálogo. Preço e anúncio entram pelo caminho único (recordPriceSnapshot com itemId): troca de anúncio zera previous_price.
 * Vendedor ausente da lista do catálogo da oferta NÃO expira aqui (o anúncio pode estar em catálogo irmão): fica sem anúncio e fora da regra rígida.
 */
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ResultadoPreenchimento { catalogos: number; ofertas: number; preenchidas: number; ausentes: number; parou: string | null }

export async function preencherAnuncios(opts: { orcamentoMs: number; maxCatalogos?: number; gravar?: boolean }): Promise<ResultadoPreenchimento> {
  const out: ResultadoPreenchimento = { catalogos: 0, ofertas: 0, preenchidas: 0, ausentes: 0, parou: null };
  const fim = Date.now() + opts.orcamentoMs;
  const catalogos = (await db.execute(sql`
    SELECT o.external_ref AS ref,
           min(CASE WHEN o.id IN (SELECT offer_id FROM group_messages WHERE created_at > now() - interval '24 hours' AND offer_id IS NOT NULL) THEN 0
                    WHEN o.vertical = 'impressao3d' THEN 1 ELSE 2 END) AS prio
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
    WHERE o.status = 'active' AND o.external_item_id IS NULL AND o.seller_id IS NOT NULL AND o.external_ref ~ '^MLB[0-9]+$' AND o.current_price_cents > 0
      AND o.external_ref NOT IN (SELECT meta->>'ref' FROM collector_runs WHERE job = 'preencher-anuncios' AND started_at > now() - interval '6 hours' AND meta->>'ref' IS NOT NULL)
    GROUP BY 1 ORDER BY 2, count(*) DESC LIMIT ${opts.maxCatalogos ?? 5}`)) as unknown as { ref: string }[];
  const token = await getValidAccessToken();
  for (const { ref } of catalogos) {
    if (Date.now() > fim - 4000) break;
    const porVendedor = new Map<string, AnuncioCatalogo[]>();
    let completo = true;
    for (let off = 0; off < 1000; off += 100) {
      await dormir(350);
      const res = await fetch(`https://api.mercadolibre.com/products/${ref}/items?limit=100&offset=${off}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429) { out.parou = 'http_429'; completo = false; break; }
      if (res.status === 404 && off === 0) break;
      if (res.status !== 200) { completo = false; break; }
      const d = (await res.json()) as { results?: (AnuncioCatalogo & { seller_id: number })[]; paging?: { total?: number } };
      for (const it of d.results ?? []) if (it.condition === 'new') porVendedor.set(String(it.seller_id), [...(porVendedor.get(String(it.seller_id)) ?? []), it]);
      if (off + 100 >= (d.paging?.total ?? 0)) break;
    }
    out.catalogos++;
    if (out.parou) break;
    if (opts.gravar !== false) await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('preencher-anuncios', 'mercado-livre', now(), now(), 0, 'ok', ${JSON.stringify({ ref, vendedores: porVendedor.size, completo })}::jsonb)`);
    const ofertas = (await db.execute(sql`
      SELECT o.id::text AS id, s.external_seller_id AS seller, o.link_item_id AS link, o.current_price_cents::int AS cents
      FROM affiliate_offers o JOIN affiliate_sellers s ON s.id = o.seller_id
      WHERE o.status = 'active' AND o.external_item_id IS NULL AND o.external_ref = ${ref} AND o.current_price_cents > 0`)) as unknown as { id: string; seller: string; link: string | null; cents: number }[];
    for (const o of ofertas) {
      out.ofertas++;
      const a = escolherAnuncio(porVendedor.get(o.seller) ?? [], o.link);
      if (!a) { if (completo) out.ausentes++; continue; }
      if (opts.gravar === false) { out.preenchidas++; continue; }
      await recordPriceSnapshot({ offerId: o.id, priceCents: Math.round(a.price * 100), listPriceCents: a.original_price != null ? Math.round(a.original_price * 100) : null, source: 'api', itemId: a.item_id });
      await db.execute(sql`UPDATE affiliate_offers SET last_price_confirmed_at = now(), last_checked_at = now(), consecutive_miss_count = 0 WHERE id = ${o.id}::uuid`);
      await alinharLinkAoAnuncio(o.id, a.item_id);
      out.preenchidas++;
    }
  }
  return out;
}

export interface MetricasIntegridade {
  mlAtivas: number;
  semAnuncioConcreto: number;
  auditadasOk6h: number;
  divergentes: number;
  erroLeitura: number;
  nuncaAuditadas: number;
  coberturaPct: number;
  idadeMediaUltimoVeredito: number | null;
  mensagens24hSemVeredito: number;
}

/** Métricas da integridade de preço (painel admin): universo = ofertas ML ativas, com preço, fora da quarentena. */
export async function metricasIntegridade(): Promise<MetricasIntegridade> {
  const [r] = (await db.execute(sql`
    WITH u AS (
      SELECT o.id, o.external_item_id, o.external_ref,
        (SELECT verdict FROM offer_link_audit a WHERE a.offer_id = o.id ORDER BY checked_at DESC LIMIT 1) AS v,
        (SELECT max(checked_at) FROM offer_link_audit a WHERE a.offer_id = o.id) AS ult,
        (SELECT max(checked_at) FROM offer_link_audit a WHERE a.offer_id = o.id AND verdict = 'ok') AS ok_em
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0)
    SELECT count(*)::int AS ml, count(*) FILTER (WHERE external_item_id IS NULL OR external_item_id = external_ref)::int AS sem_anuncio,
      count(*) FILTER (WHERE ok_em > now() - interval '6 hours')::int AS ok6,
      count(*) FILTER (WHERE v IN ('preco_divergente','item_diferente','pausado','sem_link'))::int AS div,
      count(*) FILTER (WHERE v = 'erro_leitura')::int AS err,
      count(*) FILTER (WHERE v IS NULL)::int AS nunca,
      (extract(epoch FROM avg(now() - ult)) / 60)::int AS idade
    FROM u`)) as unknown as { ml: number; sem_anuncio: number; ok6: number; div: number; err: number; nunca: number; idade: number | null }[];
  const [m] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM group_messages g WHERE g.sent_at > now() - interval '24 hours' AND g.offer_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM offer_link_audit a WHERE a.offer_id = g.offer_id AND a.verdict = 'ok' AND a.checked_at > g.sent_at - interval '6 hours' AND a.checked_at < g.sent_at + interval '6 hours')`)) as unknown as { n: number }[];
  const ml = Number(r?.ml ?? 0);
  return {
    mlAtivas: ml, semAnuncioConcreto: Number(r?.sem_anuncio ?? 0), auditadasOk6h: Number(r?.ok6 ?? 0), divergentes: Number(r?.div ?? 0),
    erroLeitura: Number(r?.err ?? 0), nuncaAuditadas: Number(r?.nunca ?? 0), coberturaPct: ml ? Math.round(((ml - Number(r?.nunca ?? 0)) / ml) * 1000) / 10 : 0,
    idadeMediaUltimoVeredito: r?.idade ?? null, mensagens24hSemVeredito: Number(m?.n ?? 0),
  };
}

/**
 * Shopee (#119, achado 21): `last_checked_at` não é confirmação de preço. Renova pela API oficial (lookupShopeeItem) as ofertas Shopee das impressoras
 * Bambu Lab e dos combos P2S/P1S primeiro, sem confirmação há mais de 60 min: grava o preço pelo caminho único e carimba `last_price_confirmed_at`.
 * Item indisponível soma uma falta (3 faltas expiram, mesma regra do coletor). Lote pequeno por minuto; nunca lança.
 */
export async function renovarShopee(opts: { limite?: number } = {}): Promise<{ lidas: number; renovadas: number; indisponiveis: number }> {
  const out = { lidas: 0, renovadas: 0, indisponiveis: 0 };
  try {
    const { lookupShopeeItem } = await import('@/server/collector/sources/shopee');
    const rows = (await db.execute(sql`
      SELECT o.id::text AS id, o.external_ref AS ref
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'shopee' JOIN master_products m ON m.id = o.master_product_id
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0 AND o.vertical = 'impressao3d' AND m.name ~* 'bambu|P2S|P1S'
        AND (o.last_price_confirmed_at IS NULL OR o.last_price_confirmed_at < now() - interval '60 minutes')
      ORDER BY o.last_price_confirmed_at ASC NULLS FIRST LIMIT ${opts.limite ?? 6}`)) as unknown as { id: string; ref: string | null }[];
    for (const r of rows) {
      const itemId = /^shopee-(\d{1,19})$/.exec(r.ref ?? '')?.[1];
      if (!itemId) continue;
      out.lidas++;
      const q = await lookupShopeeItem(itemId);
      if (q.status === 'ok') {
        await recordPriceSnapshot({ offerId: r.id, priceCents: q.node.priceCents, source: 'api' });
        await db.execute(sql`UPDATE affiliate_offers SET last_price_confirmed_at = now(), last_checked_at = now(), consecutive_miss_count = 0 WHERE id = ${r.id}::uuid`);
        out.renovadas++;
      } else {
        await db.execute(sql`UPDATE affiliate_offers SET consecutive_miss_count = consecutive_miss_count + 1, status = CASE WHEN consecutive_miss_count + 1 >= 3 THEN 'expired'::affiliate_offer_status ELSE status END, updated_at = now() WHERE id = ${r.id}::uuid`);
        out.indisponiveis++;
      }
    }
  } catch (e) {
    console.error('[renovarShopee] falhou (ignorado):', e instanceof Error ? e.message : e);
  }
  return out;
}
