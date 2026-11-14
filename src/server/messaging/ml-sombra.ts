import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mlSombraAtivo, scoreSombra, type EntradaML, type ScoreSombra } from '@/lib/messaging/ml-preco';
import { meliItemIdFromUrl } from '@/lib/messaging/live-recheck';
import { anuncioIdentificado, type PricePoint } from '@/lib/messaging/price-guard';

type Row = Record<string, unknown>;

const HORAS_HISTORICO = 72;

/**
 * MODO SOMBRA (C3, 2026-11-14): pontua a mensagem recém-enviada e REGISTRA o score em `candidate.mlSombra`.
 * Nunca bloqueia, reordena nem altera a mensagem. Flag GROUP_ML_SOMBRA=on (padrão desligada). Só leitura de snapshots; a única
 * escrita é o jsonb_set do próprio registro da mensagem. Nunca lança: qualquer falha vira null.
 */
export async function registrarSombraML(args: {
  groupMessageId: string;
  offerId: string | null | undefined;
  trigger: string;
  priceCents: number;
  avgCents: number | null;
  networkSlug: string;
  at?: Date;
}): Promise<ScoreSombra | null> {
  try {
    if (!mlSombraAtivo() || !args.offerId || !(args.priceCents > 0)) return null;
    const at = args.at ?? new Date();
    const desde = new Date(at.getTime() - HORAS_HISTORICO * 3_600_000).toISOString();
    const snaps = await db.execute<Row>(sql`
      SELECT price_cents, list_price_cents, collected_at FROM affiliate_price_snapshots
      WHERE offer_id = ${args.offerId}::uuid AND collected_at >= ${desde}::timestamptz
      UNION ALL
      (SELECT price_cents, list_price_cents, collected_at FROM affiliate_price_snapshots
       WHERE offer_id = ${args.offerId}::uuid AND collected_at < ${desde}::timestamptz ORDER BY collected_at DESC LIMIT 1)
      ORDER BY collected_at`);
    const meta = await db.execute<Row>(sql`
      SELECT o.external_item_id, o.affiliate_url, s.total_sales, s.reputation_level
      FROM affiliate_offers o LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
      WHERE o.id = ${args.offerId}::uuid LIMIT 1`);
    const m = meta[0] ?? {};
    const points: PricePoint[] = snaps.map((r) => ({ at: new Date(r.collected_at as string | Date), priceCents: Number(r.price_cents) }));
    const ultimo = snaps.length ? snaps[snaps.length - 1]! : null;
    const entrada: EntradaML = {
      priceCents: args.priceCents,
      avgCents: args.avgCents,
      networkSlug: args.networkSlug,
      trigger: args.trigger,
      at,
      points,
      listPriceCents: ultimo && ultimo.list_price_cents != null ? Number(ultimo.list_price_cents) : null,
      listingIdTrusted: anuncioIdentificado({
        externalItemId: (m.external_item_id as string | null) ?? null,
        itemIdFromUrl: meliItemIdFromUrl((m.affiliate_url as string | null) ?? null),
      }),
      sellerTotalSales: m.total_sales != null ? Number(m.total_sales) : null,
      sellerRepVerde: m.reputation_level ? /green|5/i.test(String(m.reputation_level)) : null,
    };
    const score = scoreSombra(entrada, undefined, at);
    if (!score) return null;
    await db.execute(sql`
      UPDATE group_messages SET candidate = jsonb_set(candidate, '{mlSombra}', ${JSON.stringify(score)}::jsonb, true)
      WHERE id = ${args.groupMessageId}::uuid`);
    return score;
  } catch {
    return null;
  }
}
