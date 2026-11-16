import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { definirPrecoAmazon, tipoPrecoAmazonLigado, type PrecoAmazonDefinido } from '@/lib/pricing/tipo-preco';
import { parseBrl } from '@/lib/affiliate/amazon-identity';

/**
 * R-69 (dono, 2026-11-16): PONTO UNICO por onde a Amazon define o preco que vira cotacao (coleta assistida e vitrine). O preco da serie e o CHEIO;
 * o "a vista no Pix" vai como atributo (`pixCents`). Com a flag AMAZON_TIPO_PRECO=off volta ao comportamento antigo (preco de destaque, sem tipo).
 * `ref` = `amazon-<ASIN>`; a ultima cotacao da oferta so serve para reconhecer Pix em leitor ANTIGO (sem a marca px) com prova da propria oferta.
 */
export interface CandidatoPrecoAmazon { p: string | null; l?: string | null; px?: number | null }
export type DecisaoPrecoAmazon =
  | { ok: true; priceCents: number; listCents: number | null; pixCents: number | null | undefined; inferido: boolean }
  | { ok: false; motivo: string };

export async function decidirPrecoAmazon(ref: string, c: CandidatoPrecoAmazon): Promise<DecisaoPrecoAmazon> {
  const p = parseBrl(c.p);
  if (!p) return { ok: false, motivo: 'sem_preco' };
  if (!tipoPrecoAmazonLigado()) return { ok: true, priceCents: p, listCents: parseBrl(c.l), pixCents: undefined, inferido: false };
  const ant = (await db.execute<{ p: string | null }>(sql`
    SELECT s.price_cents::text AS p FROM affiliate_offers o JOIN affiliate_price_snapshots s ON s.offer_id = o.id
    WHERE o.external_ref = ${ref} AND o.network_id = (SELECT id FROM affiliate_networks WHERE slug = 'amazon')
    ORDER BY s.collected_at DESC, s.id DESC LIMIT 1`)) as unknown as { p: string | null }[];
  const d: PrecoAmazonDefinido = definirPrecoAmazon({
    pCents: p, lCents: parseBrl(c.l), px: c.px === 1 ? true : c.px === 0 ? false : undefined,
    cheioAnteriorCents: ant[0]?.p ? Number(ant[0].p) : null,
  });
  if (!d.ok) return { ok: false, motivo: d.motivo };
  return { ok: true, priceCents: d.cheioCents, listCents: d.listaCents, pixCents: d.pixCents, inferido: d.inferido };
}
