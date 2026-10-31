import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Métricas do painel admin. Somente SELECTs sobre dado real; nenhuma
 * constante de negócio (contagem, faixa, percentual) é escrita à mão.
 *
 * Escopo dos indicadores: tudo aqui é "oferta" (um anúncio de um vendedor
 * numa loja), não "produto". "Ativa" = status 'active' e preço coletado > 0,
 * a mesma definição usada nas vitrines públicas.
 */

export interface PriceBand {
  /** Rótulo da faixa, derivado do limite da própria consulta. */
  label: string;
  count: number;
}

export interface NetworkShare {
  networkName: string;
  count: number;
}

export interface AdminCatalogMetrics {
  activeOffers: number;
  masterProducts: number;
  priceSnapshots: number;
  snapshotsLast24h: number;
  /** Instante do snapshot mais recente (ISO) ou null se a tabela está vazia. */
  lastSnapshotAt: string | null;
  priceBands: PriceBand[];
  networkShare: NetworkShare[];
}

// Limites das faixas em centavos. Os rótulos saem destes mesmos números.
const BAND_LIMITS_CENTS = [10_000, 25_000, 45_000, 150_000] as const;

function brl(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString('pt-BR')}`;
}

function bandLabel(index: number): string {
  const limits = BAND_LIMITS_CENTS;
  if (index === 0) return `Até ${brl(limits[0])}`;
  if (index === limits.length) return `Acima de ${brl(limits[limits.length - 1])}`;
  return `${brl(limits[index - 1])} a ${brl(limits[index])}`;
}

export async function getAdminCatalogMetrics(): Promise<AdminCatalogMetrics> {
  const [l0, l1, l2, l3] = BAND_LIMITS_CENTS;

  const [activeRes, masterRes, snapRes, snap24Res, lastSnapRes, bandRes, networkRes] = await Promise.all([
    db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM affiliate_offers WHERE status = 'active' AND current_price_cents > 0`
    ),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM master_products`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM affiliate_price_snapshots`),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM affiliate_price_snapshots WHERE collected_at >= now() - interval '24 hours'`
    ),
    // PK crescente acompanha a ordem de coleta (tabela append-only): evita varrer 3M+ linhas.
    db.execute<{ collected_at: string }>(
      sql`SELECT collected_at FROM affiliate_price_snapshots ORDER BY id DESC LIMIT 1`
    ),
    db.execute<{ band: number; count: number }>(sql`
      SELECT
        CASE
          WHEN current_price_cents < ${l0} THEN 0
          WHEN current_price_cents < ${l1} THEN 1
          WHEN current_price_cents < ${l2} THEN 2
          WHEN current_price_cents < ${l3} THEN 3
          ELSE 4
        END AS band,
        COUNT(*)::int AS count
      FROM affiliate_offers
      WHERE status = 'active' AND current_price_cents > 0
      GROUP BY 1
      ORDER BY 1
    `),
    db.execute<{ network_name: string; count: number }>(sql`
      SELECT n.name AS network_name, COUNT(*)::int AS count
      FROM affiliate_offers o
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      WHERE o.status = 'active' AND o.current_price_cents > 0
      GROUP BY n.name
      ORDER BY count DESC
    `),
  ]);

  const bandCounts = new Map<number, number>(bandRes.map((r) => [Number(r.band), Number(r.count)]));
  const priceBands: PriceBand[] = Array.from({ length: BAND_LIMITS_CENTS.length + 1 }, (_, i) => ({
    label: bandLabel(i),
    count: bandCounts.get(i) ?? 0,
  }));

  const lastRaw = lastSnapRes[0]?.collected_at;

  return {
    activeOffers: Number(activeRes[0]?.count ?? 0),
    masterProducts: Number(masterRes[0]?.count ?? 0),
    priceSnapshots: Number(snapRes[0]?.count ?? 0),
    snapshotsLast24h: Number(snap24Res[0]?.count ?? 0),
    lastSnapshotAt: lastRaw ? new Date(lastRaw).toISOString() : null,
    priceBands,
    networkShare: networkRes.map((r) => ({ networkName: r.network_name, count: Number(r.count) })),
  };
}
