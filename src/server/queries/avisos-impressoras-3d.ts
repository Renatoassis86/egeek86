import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formatBRL } from '@/lib/format';
import { lookupItemCouponDetail } from '@/server/messaging/coupon-item-lookup';
import { beneficiosVivosPorOferta } from '@/server/coupons/card-benefits';
import { textoFrontBeneficio } from '@/lib/coupons/card-benefit';
import { avisosCupomLigados, type AvisoOfertaGuia } from '@/lib/catalog/guia-3d';

/**
 * Cupom e desconto de cartao LIDOS na pagina do anuncio, por oferta (dono, 2026-11-15, #112). So le.
 *  - Cupom: so com leitura VALIDA pela agulha (lookupItemCouponDetail: frescor 120 min, preco lido, condicao, publico, validade), e o texto e o que a pagina mostrou.
 *  - Cartao: so benefico lido nas ultimas 3 h (offer_card_benefits); percentual por cartao sai sempre "a confirmar no carrinho".
 * Sem leitura valida: sem aviso (nunca inventa). Falha em qualquer elo = oferta sem aviso; a guia nunca quebra por isto.
 */
export async function avisosDeOfertas(offerIds: string[]): Promise<Map<string, AvisoOfertaGuia>> {
  const out = new Map<string, AvisoOfertaGuia>();
  if (!offerIds.length || !avisosCupomLigados()) return out;
  const ids = [...new Set(offerIds)];
  const [beneficios, comLeitura] = await Promise.all([
    beneficiosVivosPorOferta(ids),
    db
      .execute<{ id: string }>(sql`
        SELECT DISTINCT r.offer_id::text AS id FROM offer_coupon_reads r
        WHERE r.offer_id::text IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - interval '130 minutes'`)
      .then((r) => (r as unknown as { id: string }[]).map((x) => x.id))
      .catch(() => [] as string[]),
  ]);
  const cupons = new Map<string, string>();
  for (let i = 0; i < comLeitura.length; i += 6) {
    await Promise.all(
      comLeitura.slice(i, i + 6).map(async (id) => {
        try {
          const r = await lookupItemCouponDetail(id);
          if (!r) return;
          const d = r.detail;
          cupons.set(id, `Cupom: ${d.name}${d.code ? ` (código ${d.code})` : ''} (preço com cupom ${formatBRL(d.finalCents)})${d.exclusivePrime ? ' · exclusivo Prime' : ''}`);
        } catch {
          // leitura inválida ou erro: sem cupom
        }
      }),
    );
  }
  for (const id of ids) {
    const cartoes = (beneficios.get(id) ?? []).map((b) => textoFrontBeneficio(b)).filter((t): t is string => !!t).slice(0, 3);
    const cupom = cupons.get(id) ?? null;
    if (cupom || cartoes.length) out.set(id, { cupom, cartoes });
  }
  return out;
}
