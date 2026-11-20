import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { podeDivulgar, provaDoBeneficio } from '@/lib/coupons/cofre';
import { cofreLigado } from '@/server/coupons/cofre';
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

/**
 * R-107 (métricas de decisão de compra): do mesmo texto da página do item, espelha o PARCELAMENTO GERAL (sem cartão específico: "em até 10x de R$ 845,91 sem juros")
 * nas colunas da oferta. Parcela com emissor ("18x com cartão Mercado Pago") não vale para todo comprador e fica de fora. Independe da flag CARD_BENEFITS
 * (que governa desconto de cartão): parcelamento é "o que a página imprime junto do preço do próprio item". Nunca lança.
 * Entre vários, vale o de maior número de parcelas. A coerência com o preço atual é conferida na hora de usar (metricas-compra.ts).
 */
export async function gravarParcelamentoDaPagina(offerId: string, textos: unknown, baseCents: number | null): Promise<boolean> {
  if (!Array.isArray(textos) || !textos.length) return false;
  try {
    const gerais = parseCardBenefits(textos, baseCents).filter((b) => b.kind === 'parcelas' && b.installments != null && b.installmentCents != null && !b.issuer);
    if (!gerais.length) return false;
    const b = gerais.sort((x, y) => (y.installments ?? 0) - (x.installments ?? 0))[0];
    await db.execute(sql`UPDATE affiliate_offers SET installments_qty = ${b.installments}, installment_cents = ${b.installmentCents}, installments_no_interest = ${b.noInterest}, installments_seen_at = now() WHERE id = ${offerId}::uuid`);
    return true;
  } catch {
    return false;
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
             base_price_cents, final_price_cents, needs_confirm, raw_text, last_seen_at, (SELECT nn.slug FROM affiliate_offers ao JOIN affiliate_networks nn ON nn.id = ao.network_id WHERE ao.id = offer_card_benefits.offer_id) AS rede
      FROM offer_card_benefits
      WHERE offer_id::text IN (${sql.join(offerIds.map((i) => sql`${i}`), sql`, `)}) AND last_seen_at > now() - make_interval(hours => ${BENEFICIO_VIVO_HORAS})
      ORDER BY pct DESC NULLS LAST, last_seen_at DESC`)) as unknown as Record<string, unknown>[];
    const tipos = tiposLiberados();
    for (const r of rows) {
      if (!beneficioVerificado({ kind: r.kind as CardBenefit['kind'] }, tipos)) continue; // anti-isca: não verificado não sai em tela, mensagem, lista, card nem alerta
      // COFRE (R-64): o benefício também só sai com prova vigente aceita pelo validador da rede (padrão negado); nunca prova de preço final aqui (não há valor derivado).
      if (cofreLigado() && !podeDivulgar({ rede: String(r.rede ?? ''), tipoItem: 'beneficio', uso: 'card', provas: provaDoBeneficio({ kind: String(r.kind), lastSeenAt: new Date(String(r.last_seen_at)) }), now: new Date() }).ok) continue;
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
