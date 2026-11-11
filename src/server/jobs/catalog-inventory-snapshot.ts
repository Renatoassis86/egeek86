import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { VERTICALS } from '@/lib/catalog/verticais';
import { carregarTotaisLojas } from '@/server/queries/catalogo-inventario';

export interface InventorySnapshotSummary {
  written: string[];
  failed: Array<{ vertical: string; error: string }>;
}

/**
 * Grava a série diária do inventário do catálogo (migração 0040): 1 linha por loja por dia (dia em America/Sao_Paulo),
 * por UPSERT (a última leitura do dia vence). Tolerante a falha: erro em uma loja (ou tabela ainda não criada) é
 * registrado no retorno e nunca derruba o cron nem as demais lojas. Só lê o catálogo; só escreve na tabela de histórico.
 */
export async function gravarSnapshotInventario(): Promise<InventorySnapshotSummary> {
  const out: InventorySnapshotSummary = { written: [], failed: [] };
  let totais;
  try {
    totais = await carregarTotaisLojas();
  } catch (err) {
    out.failed.push({ vertical: '*', error: err instanceof Error ? err.message.slice(0, 200) : 'erro' });
    return out;
  }
  for (const v of VERTICALS) {
    const t = totais[v];
    try {
      await db.execute(sql`
        INSERT INTO catalog_inventory_snapshots
          (day, vertical, masters_approved, masters_review, masters_rejected, masters_with_avg,
           offers_active_ml, offers_active_shopee, offers_active_amazon, offers_active_other, offers_official, pct_official, computed_at)
        VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, ${v}, ${t.mastersAprovados}, ${t.mastersRevisao}, ${t.mastersRejeitados}, ${t.mastersComMedia},
                ${t.ofertasMl}, ${t.ofertasShopee}, ${t.ofertasAmazon}, ${t.ofertasOutras}, ${t.ofertasOficiais}, ${t.pctLinkOficial}, now())
        ON CONFLICT (day, vertical) DO UPDATE SET
          masters_approved = EXCLUDED.masters_approved, masters_review = EXCLUDED.masters_review, masters_rejected = EXCLUDED.masters_rejected,
          masters_with_avg = EXCLUDED.masters_with_avg, offers_active_ml = EXCLUDED.offers_active_ml,
          offers_active_shopee = EXCLUDED.offers_active_shopee, offers_active_amazon = EXCLUDED.offers_active_amazon,
          offers_active_other = EXCLUDED.offers_active_other, offers_official = EXCLUDED.offers_official,
          pct_official = EXCLUDED.pct_official, computed_at = now()`);
      out.written.push(v);
    } catch (err) {
      out.failed.push({ vertical: v, error: err instanceof Error ? err.message.slice(0, 200) : 'erro' });
    }
  }
  return out;
}
