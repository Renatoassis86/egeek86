import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { avaliarPrecoAbsoluto, avaliarPrecoRelativo, type MotivoPreco } from '@/lib/pricing/plausibilidade-tipo';
import { getMasterReferencePrices } from './price-plausibility';

/**
 * QUARENTENA DE PREÇO IMPLAUSÍVEL POR TIPO NA COLETA (dono, 2026-11-15, decisão 3). A leitura NUNCA é descartada: o preço já foi gravado em
 * price_snapshots por recordPriceSnapshot; aqui só se marca affiliate_offers.quarantined_at + quarantine_reason (migration 0052), o que tira a oferta da
 * vitrine, das médias, das mensagens e da comissão. Flag de desligar: QUARENTENA_PRECO_TIPO=0 (padrão: ligada). Melhor esforço: nunca derruba a coleta.
 *
 * Marca nova: preço absoluto fora do tipo (piso/teto) OU > 3x a mediana das outras ofertas ativas do master (>= 2 referências).
 * (Preço baixo demais frente ao master é tratado pelos coletores que já aplicam a regra 35%; aqui não esconde promoção real.)
 * Libera sozinha só a quarentena que ESTE mecanismo gravou (quarantine_reason começando com "preco_") quando o preço novo volta à faixa
 * (absoluta e relativa, alta e baixa). Quarentena antiga/manual (sem motivo) nunca é liberada aqui.
 */
export const quarentenaPrecoTipoLigada = (): boolean => process.env.QUARENTENA_PRECO_TIPO !== '0';

/** Grava a quarentena de uma oferta com motivo (idempotente: não sobrescreve quarentena existente). */
export async function marcarQuarentenaPreco(offerId: string, motivo: MotivoPreco | string): Promise<void> {
  await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = now(), quarantine_reason = ${motivo}, updated_at = now() WHERE id = ${offerId}::uuid AND quarantined_at IS NULL`);
}

export async function avaliarEQuarentenarPreco(offerId: string, priceCents: number): Promise<MotivoPreco | null> {
  if (!quarentenaPrecoTipoLigada()) return null;
  try {
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT o.vertical, o.title, o.master_product_id::text AS mid, o.quarantined_at, o.quarantine_reason, m.product_type::text AS tipo
      FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id WHERE o.id = ${offerId}::uuid`);
    const r = rows[0];
    if (!r) return null;
    const refs = await getMasterReferencePrices(String(r.mid), offerId);
    const absoluto = avaliarPrecoAbsoluto({ priceCents, vertical: String(r.vertical), productType: String(r.tipo), titulo: String(r.title) });
    const relativo = avaliarPrecoRelativo(priceCents, refs);
    const motivoNovo = absoluto ?? (relativo === 'preco_acima_de_300pct_da_mediana' ? relativo : null);
    const emQuarentena = r.quarantined_at != null;
    if (motivoNovo) {
      if (!emQuarentena) await marcarQuarentenaPreco(offerId, motivoNovo);
      return motivoNovo;
    }
    const razao = r.quarantine_reason == null ? '' : String(r.quarantine_reason);
    if (emQuarentena && razao.startsWith('preco_') && !relativo) {
      await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = NULL, quarantine_reason = NULL, updated_at = now() WHERE id = ${offerId}::uuid AND quarantine_reason = ${razao}`);
    }
    return null;
  } catch (err) {
    console.error('[quarentena-preco-tipo] falhou (ignorado):', err instanceof Error ? err.message : err);
    return null;
  }
}
