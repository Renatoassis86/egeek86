import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usadoLidoNaPagina } from '@/lib/catalog/usado-lido-na-pagina';

/**
 * R2-13: a aba da Amazon leu a página do item e o box de compra ativo é de USADO (Usado - Como novo, Amazon Quase Novo, Warehouse, Reembalado).
 * A oferta Amazon desse ASIN é PAUSADA (não apagada; volta a ser ativada pela coleta quando a página mostrar oferta nova) e o motivo fica registrado
 * em collector_runs (job 'usado-lido-na-pagina'). Não mexe em master, preço nem série.
 */
export async function pausarUsadoLidoNaPagina(asin: string, textoBox: unknown, fonte: string): Promise<{ usado: boolean; pausadas: number; termo: string | null }> {
  const lido = usadoLidoNaPagina(textoBox);
  if (!lido.usado) return { usado: false, pausadas: 0, termo: null };
  const ref = `amazon-${asin.toUpperCase()}`;
  const r = await db.execute<{ id: string }>(sql`
    UPDATE affiliate_offers o SET status = 'paused', updated_at = now()
    WHERE o.external_ref = ${ref} AND o.status = 'active'
      AND o.network_id = (SELECT id FROM affiliate_networks WHERE slug = 'amazon' LIMIT 1)
    RETURNING o.id::text AS id`);
  const ids = (r as unknown as { id: string }[]).map((x) => x.id);
  await db.execute(sql`
    INSERT INTO collector_runs (job, status, started_at, finished_at, meta)
    VALUES ('usado-lido-na-pagina', 'ok', now(), now(), ${JSON.stringify({ asin, fonte, termo: lido.termo, ofertas_pausadas: ids, motivo: 'usado_lido_na_pagina' })}::jsonb)`).catch(() => undefined);
  return { usado: true, pausadas: ids.length, termo: lido.termo };
}
