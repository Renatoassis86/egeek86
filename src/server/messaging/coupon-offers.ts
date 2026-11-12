import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { AGULHA } from '@/lib/coupons/agulha';
import type { CouponOfferFact } from '@/lib/messaging/group-rules';
import { lookupItemCouponDetail } from '@/server/messaging/coupon-item-lookup';

/**
 * Cupom por OFERTA para o gatilho CUPOM (dono, 2026-11-12): a fonte e `offer_coupon_reads` (preco com cupom lido na pagina do anuncio pela
 * aba logada). Cada oferta candidata passa pela MESMA agulha de `lookupItemCoupon` (4 conferencias: fonte+validade, frescor <= 120 min,
 * condicao vs oferta incl. "por seguir a loja" e publico restrito, preco final coerente). SOMENTE LEITURA: nada e gravado aqui
 * (a auditoria de `coupon_consults` continua sendo da consulta dos blocos de cupom em mensagens de preco).
 * Kill-switch: GROUP_CUPOM=off desliga o gatilho inteiro.
 */
export function cupomGatilhoLigado(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GROUP_CUPOM ?? '').toLowerCase() !== 'off';
}

type Row = Record<string, unknown>;
const idList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

export interface CouponValidation {
  facts: Map<string, CouponOfferFact>;
  /** Ofertas com leitura positiva recente que a agulha barrou: motivo. */
  misses: Map<string, string>;
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Aplica a agulha (cupom do anuncio) a cada oferta. Falha de consulta numa oferta = ela cai com motivo `erro_na_consulta`; nunca lanca. */
export async function validateCouponOffers(offerIds: string[], now: Date, concurrency = 8, memo?: CouponValidation): Promise<CouponValidation> {
  // `memo`: resultados ja obtidos NO MESMO ciclo (mesmo `now`); evita reconsultar a mesma oferta no pool e nos fatos. Reconferencia de envio nunca usa memo.
  const facts = memo?.facts ?? new Map<string, CouponOfferFact>();
  const misses = memo?.misses ?? new Map<string, string>();
  const todo = [...new Set(offerIds)].filter((id) => !(memo && (memo.facts.has(id) || memo.misses.has(id))));
  await pool(todo, concurrency, async (offerId) => {
    let last = 'sem_leitura';
    try {
      const r = await lookupItemCouponDetail(offerId, (reason) => (last = reason), now);
      if (!r) {
        misses.set(offerId, last);
        return;
      }
      const d = r.detail;
      facts.set(offerId, {
        offerId,
        couponRef: r.info.couponRef ?? offerId,
        name: d.name,
        offerPriceCents: d.offerPriceCents,
        finalCents: d.finalCents,
        offCents: d.offCents,
        pct: d.pct,
        minOrderCents: d.minOrderCents,
        maxDiscountCents: d.maxDiscountCents,
        ruleKnown: d.ruleKnown,
        conditions: r.info.conditions,
        activation: d.activation,
        code: d.code,
        howTo: d.howTo,
        named: d.named,
        readAt: new Date(d.readAt),
        expiresAt: r.info.expiresAt ? new Date(r.info.expiresAt) : null,
      });
    } catch {
      misses.set(offerId, 'erro_na_consulta');
    }
  });
  return { facts, misses };
}

/** Das ofertas dadas (nao Amazon), as que tem como leitura MAIS RECENTE uma leitura positiva dentro da janela do anuncio (120 min). [] se a tabela nao existe. */
export async function offersWithPositiveRead(offerIds: string[], now: Date): Promise<string[]> {
  if (!offerIds.length) return [];
  const since = new Date(now.getTime() - AGULHA.ITEM_FRESH_MIN * 60_000).toISOString();
  try {
    const rows = await db.execute<Row>(sql`
      SELECT o.id FROM affiliate_offers o
      INNER JOIN affiliate_networks n ON n.id = o.network_id
      INNER JOIN LATERAL (
        -- Duas famílias de leitura (página do item x promoção da Amazon): a mais nova de CADA uma; vale se alguma das duas é positiva (a negativa de uma não apaga a outra).
        SELECT x.pw FROM (
          (SELECT r.price_with_coupon_cents AS pw, r.read_at FROM offer_coupon_reads r
            WHERE r.offer_id = o.id AND r.source <> 'amazon-promocoes' AND r.read_at > ${since}::timestamptz ORDER BY r.read_at DESC LIMIT 1)
          UNION ALL
          (SELECT r.price_with_coupon_cents AS pw, r.read_at FROM offer_coupon_reads r
            WHERE r.offer_id = o.id AND r.source = 'amazon-promocoes' AND r.read_at > ${since}::timestamptz ORDER BY r.read_at DESC LIMIT 1)
        ) x WHERE x.pw IS NOT NULL ORDER BY x.read_at DESC LIMIT 1
      ) lr ON true
      WHERE o.id IN (${idList(offerIds)})
    `);
    return rows.map((r) => String(r.id));
  } catch {
    return [];
  }
}
