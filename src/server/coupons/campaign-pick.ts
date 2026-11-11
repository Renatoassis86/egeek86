import { matchesScope, meetsMinimum } from './vigencia';
import { describeRule } from './campaign';
import type { StoredCoupon } from './types';

/** Escolha e formato do codigo de campanha para uma oferta. Puro (testavel sem banco). */

export interface CampaignTarget {
  /** Departamento do produto (games, tecnologia...). Cupom de categoria so casa por igualdade. */
  category?: string;
  /** Possiveis identificadores da loja/vendedor da oferta (apelido, id, nome da loja). */
  sellerCandidates: string[];
  priceCents?: number;
}

function score(c: StoredCoupon): number {
  if (c.kind === 'percentual' && c.valueNum) return c.valueNum * 10;
  if (c.kind === 'valor_fixo' && c.valueNum) return c.valueNum;
  return 1; // frete: vale, mas perde para desconto em dinheiro
}

export function pickCampaignCoupon(list: StoredCoupon[], t: CampaignTarget): StoredCoupon | null {
  const ok = list.filter((c) => {
    if (!c.code || !c.validUntil) return false;
    if (!meetsMinimum(c, t.priceCents)) return false;
    if (c.scopeKind === 'lista_itens') return t.sellerCandidates.some((s) => matchesScope(c, { sellerId: s }));
    return matchesScope(c, { category: t.category });
  });
  // Mais especifico primeiro (loja > categoria > site), depois maior desconto.
  const spec = (c: StoredCoupon) => (c.scopeKind === 'lista_itens' ? 2 : c.scopeKind === 'categoria' ? 1 : 0);
  return ok.sort((a, b) => spec(b) - spec(a) || score(b) - score(a))[0] ?? null;
}

export function campaignToCouponInfo(c: StoredCoupon, networkName: string) {
  const scopeValue = c.scope.categorias?.[0] ?? c.scope.vendedores?.[0] ?? null;
  const kind = c.kind === 'percentual' || c.kind === 'valor_fixo' || c.kind === 'frete' ? c.kind : 'valor_fixo';
  const rule = describeRule(
    {
      kind, valueNum: c.valueNum, valueUnit: c.valueUnit, minOrderCents: c.minOrderCents, maxDiscountCents: c.maxDiscountCents,
      scopeKind: c.scopeKind === 'categoria' ? 'categoria' : c.scopeKind === 'lista_itens' ? 'lista_itens' : 'loja_inteira', scopeValue,
    },
    networkName
  );
  return {
    code: c.code as string,
    conditions: rule,
    expiresAt: c.validUntil,
    verifiedAt: c.verifiedAt as string,
    /** Confirmacao do dono vale 24 h (nao 2 h): ver CAMPAIGN_MAX_AGE_MINUTES. */
    maxAgeMinutes: 24 * 60,
    /** Identificação para o Agente de Cupons acompanhar o encerramento. */
    couponRef: c.id,
    annKind: 'campanha' as const,
  };
}
