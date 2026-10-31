import 'server-only';
import { and, eq, gt, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateOffers } from '@/db/schema';

/** Preço abaixo de 35% da mediana das cotações ativas do mesmo produto = isca/erro, não entra. */
export const PLAUSIBLE_MIN_RATIO = 0.35;
/** Sem pelo menos 2 referências não há mediana confiável: não dá para julgar, aceita. */
export const MIN_REFERENCES = 2;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Pura: true quando o preço é implausivelmente baixo frente às referências. */
export function isImplausiblyLow(priceCents: number, referenceCents: number[]): boolean {
  if (referenceCents.length < MIN_REFERENCES) return false;
  const m = median(referenceCents);
  return m != null && priceCents < m * PLAUSIBLE_MIN_RATIO;
}

/** Cotações ativas reais do mesmo master_product (todas as lojas), exceto a própria oferta. */
export async function getMasterReferencePrices(masterProductId: string, excludeOfferId?: string): Promise<number[]> {
  const rows = await db
    .select({ price: affiliateOffers.currentPriceCents })
    .from(affiliateOffers)
    .where(
      and(
        eq(affiliateOffers.masterProductId, masterProductId),
        eq(affiliateOffers.status, 'active'),
        gt(affiliateOffers.currentPriceCents, 0),
        ...(excludeOfferId ? [ne(affiliateOffers.id, excludeOfferId)] : [])
      )
    );
  return rows.map((r) => Number(r.price));
}
