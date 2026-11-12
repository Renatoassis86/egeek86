// Sem 'server-only': regra pura, testavel por tsx. Decide o que gravar em affiliate_offers.sold_quantity a partir das listagens recebidas.
import type { Listing } from '@/lib/affiliate/master-consolidation';

export interface SoldQuantityWrite {
  externalItemId: string;
  soldQuantity: number;
}

/** Apenas listagens em que a API ENTREGOU sold_quantity. Sem o campo => lista vazia => nenhuma consulta ao banco (nem exige a migracao 0045). */
export function soldQuantityWrites(listings: ReadonlyArray<Pick<Listing, 'externalItemId' | 'soldQuantity'>>): SoldQuantityWrite[] {
  const out: SoldQuantityWrite[] = [];
  for (const l of listings) {
    if (typeof l.soldQuantity === 'number' && Number.isInteger(l.soldQuantity) && l.soldQuantity >= 0) {
      out.push({ externalItemId: l.externalItemId, soldQuantity: l.soldQuantity });
    }
  }
  return out;
}
