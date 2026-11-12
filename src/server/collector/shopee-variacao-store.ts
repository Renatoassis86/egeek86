import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { marcaVariacao, variacaoColunasLigada, type NoComVariacao } from '@/lib/affiliate/shopee-variacao';

/**
 * Grava a MARCA DE VARIAÇÃO de preço da oferta Shopee (migration 0047, proposta). Só com SHOPEE_VARIANTE_COLUNAS=1. Preço único limpa a marca
 * (a oferta deixou de ter faixa). Falha nunca derruba a coleta: devolve false e a marca continua em collector_runs.meta.
 */
export async function gravarVariacaoOferta(offerId: string, no: NoComVariacao): Promise<boolean> {
  if (!variacaoColunasLigada(process.env.SHOPEE_VARIANTE_COLUNAS)) return false;
  const m = marcaVariacao(no);
  try {
    await db.execute(sql`update affiliate_offers set variant_min_cents = ${m?.variantMinCents ?? null}, variant_max_cents = ${m?.variantMaxCents ?? null},
      variant_spread = ${m?.variantSpread ?? null} where id = ${offerId}::uuid`);
    return true;
  } catch (e) {
    console.error('[shopee-variacao] marca nao gravada (migration 0047 aplicada?):', (e as Error).message.slice(0, 120));
    return false;
  }
}
