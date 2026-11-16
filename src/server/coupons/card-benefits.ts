import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { beneficioVerificado, parseCardBenefits, tiposLiberados, type CardBenefit } from '@/lib/coupons/card-benefit';

/** Um benefício de cartão só vale na tela enquanto a última leitura o viu há menos que isto (a fila relê as impressoras a cada 30 min). */
export const BENEFICIO_VIVO_HORAS = 3;

export function beneficiosCartaoLigados(env: Record<string, string | undefined> = process.env): boolean {
  return (env.CARD_BENEFITS ?? '').toLowerCase() !== 'off';
}

/**
 * Grava os benefícios de cartão lidos na página do anúncio. `textos` são os textos da página (validados e interpretados em card-benefit.ts);
 * `baseCents` é o preço lido na própria página. Idempotente: a mesma (oferta, benefício) só atualiza last_seen_at. Nunca lança (o cupom não pode falhar por isto).
 */
export async function gravarBeneficiosCartao(offerId: string, source: string, textos: unknown, baseCents: number | null): Promise<number> {
  if (!beneficiosCartaoLigados() || !Array.isArray(textos) || !textos.length) return 0;
  try {
    const list = parseCardBenefits(textos, baseCents);
    for (const b of list) {
      await db.execute(sql`
        INSERT INTO offer_card_benefits (offer_id, dedup_key, kind, issuer, pct, cap_cents, min_order_cents, installments, installment_cents, no_interest, cashback_cents, base_price_cents, final_price_cents, needs_confirm, raw_text, source)
        VALUES (${offerId}::uuid, ${b.dedupKey}, ${b.kind}, ${b.issuer}, ${b.pct}, ${b.capCents}, ${b.minOrderCents}, ${b.installments}, ${b.installmentCents}, ${b.noInterest}, ${b.cashbackCents}, ${baseCents}, ${b.finalPriceCents}, ${b.needsConfirm}, ${b.rawText}, ${source})
        ON CONFLICT (offer_id, dedup_key) DO UPDATE SET last_seen_at = now(), base_price_cents = EXCLUDED.base_price_cents, final_price_cents = EXCLUDED.final_price_cents, raw_text = EXCLUDED.raw_text, source = EXCLUDED.source`);
    }
    return list.length;
  } catch {
    return 0;
  }
}

export interface BeneficioVivo extends CardBenefit {
  offerId: string;
  lastSeenAt: string;
  baseCents: number | null;
}

/** Benefícios vistos nas últimas BENEFICIO_VIVO_HORAS por oferta. Tabela ausente/erro = vazio (a tela nunca quebra). */
export async function beneficiosVivosPorOferta(offerIds: string[]): Promise<Map<string, BeneficioVivo[]>> {
  const out = new Map<string, BeneficioVivo[]>();
  if (!offerIds.length || !beneficiosCartaoLigados()) return out;
  try {
    const rows = (await db.execute<Record<string, unknown>>(sql`
      SELECT offer_id::text AS offer_id, dedup_key, kind, issuer, pct::float8 AS pct, cap_cents, min_order_cents, installments, installment_cents, no_interest, cashback_cents,
             base_price_cents, final_price_cents, needs_confirm, raw_text, last_seen_at
      FROM offer_card_benefits
      WHERE offer_id::text IN (${sql.join(offerIds.map((i) => sql`${i}`), sql`, `)}) AND last_seen_at > now() - make_interval(hours => ${BENEFICIO_VIVO_HORAS})
      ORDER BY pct DESC NULLS LAST, last_seen_at DESC`)) as unknown as Record<string, unknown>[];
    const tipos = tiposLiberados();
    for (const r of rows) {
      if (!beneficioVerificado({ kind: r.kind as CardBenefit['kind'] }, tipos)) continue; // anti-isca: não verificado não sai em tela, mensagem, lista, card nem alerta
      const b: BeneficioVivo = {
        offerId: String(r.offer_id), dedupKey: String(r.dedup_key), kind: r.kind as CardBenefit['kind'], issuer: (r.issuer as string) ?? null, pct: r.pct == null ? null : Number(r.pct),
        capCents: (r.cap_cents as number) ?? null, minOrderCents: (r.min_order_cents as number) ?? null, installments: (r.installments as number) ?? null,
        installmentCents: (r.installment_cents as number) ?? null, noInterest: Boolean(r.no_interest), cashbackCents: (r.cashback_cents as number) ?? null,
        finalPriceCents: null /* nunca valor derivado (ver derivar() em card-benefit.ts) */, needsConfirm: Boolean(r.needs_confirm), rawText: String(r.raw_text),
        lastSeenAt: new Date(String(r.last_seen_at)).toISOString(), baseCents: (r.base_price_cents as number) ?? null,
      };
      const l = out.get(b.offerId) ?? [];
      l.push(b);
      out.set(b.offerId, l);
    }
  } catch {
    // tabela ainda não aplicada: sem benefício na tela
  }
  return out;
}
