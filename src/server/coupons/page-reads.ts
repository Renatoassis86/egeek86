import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { nomeColunasLigadas } from '@/server/coupons/nome-colunas';
import { normalizePageRow, PAGE_SOURCE, type PageNetwork, type PageRowIn } from '@/lib/coupons/page-read';

export interface PageIngestStats {
  recebidos: number;
  lidas: number;
  com_cupom: number;
  recusadas: Record<string, number>;
}

/**
 * Grava as leituras de cupom da página do item (Amazon/Shopee) em offer_coupon_reads. O servidor só valida e guarda: a oferta precisa
 * existir, estar ativa e ser da rede; o ref lido na página precisa bater com o da oferta; o preço lido precisa ser coerente.
 * Preço com cupom: o que a página mostrou, ou derivado da regra escrita no selo (status 'derivado_do_rotulo'). Sem regra legível: descartado.
 * Lido e sem cupom grava uma linha 'sem_cupom' (fecha leituras positivas anteriores, como no Mercado Livre).
 */
export async function ingestPageReads(network: PageNetwork, rows: PageRowIn[]): Promise<PageIngestStats> {
  const stats: PageIngestStats = { recebidos: rows.length, lidas: 0, com_cupom: 0, recusadas: {} };
  const source = PAGE_SOURCE[network];
  const refuse = (k: string) => { stats.recusadas[k] = (stats.recusadas[k] ?? 0) + 1; };
  for (const r of rows) {
    const offer = (await db.execute<{ price: string; ref: string | null }>(sql`
      SELECT o.current_price_cents::text AS price, o.external_ref AS ref
      FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id
      WHERE o.id = ${String(r.id)}::uuid AND nn.slug = ${network} AND o.status = 'active' LIMIT 1`)) as unknown as { price: string; ref: string | null }[];
    if (!offer[0]) { refuse('oferta_inativa_ou_de_outra_rede'); continue; }
    const res = normalizePageRow(network, r, { externalRef: offer[0].ref, priceCents: Number(offer[0].price) });
    if (!res.ok) { refuse(res.reason); continue; }
    if (!res.coupons.length) {
      await db.execute(sql`INSERT INTO offer_coupon_reads (offer_id, status, price_seen_cents, source) VALUES (${String(r.id)}::uuid, 'sem_cupom', ${res.seen}::int, ${source})`);
    } else {
      for (const c of res.coupons) {
        if (nomeColunasLigadas()) {
          await db.execute(sql`
            INSERT INTO offer_coupon_reads (offer_id, status, label, price_with_coupon_cents, price_seen_cents, source, coupon_name, coupon_code)
            VALUES (${String(r.id)}::uuid, ${c.status}, ${c.label}, ${c.priceWithCents}::int, ${res.seen}::int, ${source}, ${c.name}, ${c.code})`);
        } else {
          await db.execute(sql`
            INSERT INTO offer_coupon_reads (offer_id, status, label, price_with_coupon_cents, price_seen_cents, source)
            VALUES (${String(r.id)}::uuid, ${c.status}, ${c.label}, ${c.priceWithCents}::int, ${res.seen}::int, ${source})`);
        }
        stats.com_cupom++;
      }
    }
    stats.lidas++;
  }
  return stats;
}
