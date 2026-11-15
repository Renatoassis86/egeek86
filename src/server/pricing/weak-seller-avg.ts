import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { weakSellerSql } from '@/server/queries/public-offers';

/**
 * R2-4 (dono, 2026-11-14): vendedor fraco é REGISTRADO e MOSTRADO; fica fora só da MÉDIA (e do preço de destaque, que já respeita `weakSellerSql`).
 * Mecanismo: `affiliate_offers.avg_excluded_at` / `avg_excluded_reason` (migração 0044). Esta rotina marca com o motivo `vendedor-fraco` as ofertas ativas
 * de vendedor fraco e DESMARCA só as que ela mesma marcou (motivo `vendedor-fraco`) quando o vendedor deixa de ser fraco. Marcas de outro motivo
 * (piloto de identidade etc.) nunca são tocadas. Nunca apaga linha, nunca põe em quarentena.
 */
export const MOTIVO_VENDEDOR_FRACO = 'vendedor-fraco';

export async function temColunasForaDaMedia(): Promise<boolean> {
  const r = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='affiliate_offers' AND column_name IN ('avg_excluded_at','avg_excluded_reason')`);
  return Number(r[0]?.n ?? 0) === 2;
}

export interface SyncVendedorFraco { aMarcar: number; aDesmarcar: number; marcadas: number; desmarcadas: number; semColuna: boolean }

export async function sincronizarVendedorFracoForaDaMedia(opts: { apply: boolean }): Promise<SyncVendedorFraco> {
  if (!(await temColunasForaDaMedia())) return { aMarcar: 0, aDesmarcar: 0, marcadas: 0, desmarcadas: 0, semColuna: true };
  const weak = weakSellerSql('sel');
  const contar = await db.execute<{ marcar: number; desmarcar: number }>(sql`
    SELECT count(*) FILTER (WHERE ${weak} AND o.status = 'active' AND o.avg_excluded_at IS NULL)::int AS marcar,
           count(*) FILTER (WHERE o.avg_excluded_reason = ${MOTIVO_VENDEDOR_FRACO} AND o.avg_excluded_at IS NOT NULL AND NOT (${weak} AND o.status = 'active'))::int AS desmarcar
    FROM affiliate_offers o LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id`);
  const aMarcar = Number(contar[0]?.marcar ?? 0), aDesmarcar = Number(contar[0]?.desmarcar ?? 0);
  if (!opts.apply) return { aMarcar, aDesmarcar, marcadas: 0, desmarcadas: 0, semColuna: false };
  const m = await db.execute<{ id: string }>(sql`
    UPDATE affiliate_offers o SET avg_excluded_at = now(), avg_excluded_reason = ${MOTIVO_VENDEDOR_FRACO}, updated_at = now()
    FROM affiliate_sellers sel
    WHERE sel.id = o.seller_id AND ${weak} AND o.status = 'active' AND o.avg_excluded_at IS NULL
    RETURNING o.id`);
  const d = await db.execute<{ id: string }>(sql`
    UPDATE affiliate_offers o SET avg_excluded_at = NULL, avg_excluded_reason = NULL, updated_at = now()
    FROM (SELECT o2.id FROM affiliate_offers o2 LEFT JOIN affiliate_sellers sel ON sel.id = o2.seller_id
          WHERE o2.avg_excluded_reason = ${MOTIVO_VENDEDOR_FRACO} AND o2.avg_excluded_at IS NOT NULL AND NOT (${weak} AND o2.status = 'active')) x
    WHERE o.id = x.id RETURNING o.id`);
  return { aMarcar, aDesmarcar, marcadas: m.length, desmarcadas: d.length, semColuna: false };
}
