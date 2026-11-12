import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * VENDAS REAIS DO ANUNCIO POR MASTER (sinal de demanda para o filtro de escopo das lojas Plus).
 *
 * CONTRATO (para src/lib/catalog/escopo-compra.ts; quem chama o filtro carrega isto e passa o Map ja pronto, o filtro puro nao toca o banco):
 *   carregarVendasPorMaster(masterIds) -> Map<masterId, VendasMaster>
 *   - Fonte: affiliate_offers.sold_quantity (migracao 0045), preenchida SO pela API oficial do ML e SO quando o payload traz o campo.
 *   - Conta ofertas status='active' e quarantined_at IS NULL e sold_quantity IS NOT NULL. NULL = sem dado (nunca vira 0).
 *   - soma = soma entre ofertas (anuncios distintos); maximo = maior anuncio; ofertasComDado / ofertasAtivas = cobertura do dado.
 *   - Master ausente do Map = nenhuma oferta com dado: o filtro deve tratar como "demanda desconhecida" (NAO como zero e NAO como corte).
 *   - sold_quantity e ACUMULADO DE VIDA do anuncio (nao e janela de 30 dias); serve para ordenar/desempatar e para piso suave, nao para tendencia.
 *   - Ticket alto nao pode ser barrado por demanda (ata 2026-11-12): usar so como reforco positivo ou desempate.
 * Se a migracao 0045 nao foi aplicada (42703), devolve Map vazio (demanda desconhecida), sem derrubar a pagina.
 */
export interface VendasMaster {
  soma: number;
  maximo: number;
  ofertasComDado: number;
  ofertasAtivas: number;
  atualizadoEm: Date | null;
}

export async function carregarVendasPorMaster(masterIds: readonly string[]): Promise<Map<string, VendasMaster>> {
  const out = new Map<string, VendasMaster>();
  if (masterIds.length === 0) return out;
  try {
    const rows = (await db.execute(sql`
      SELECT master_product_id AS master_id,
             COALESCE(SUM(sold_quantity), 0)::bigint        AS soma,
             COALESCE(MAX(sold_quantity), 0)::bigint        AS maximo,
             COUNT(sold_quantity)::int                      AS com_dado,
             COUNT(*)::int                                  AS ativas,
             MAX(sold_quantity_at)                          AS atualizado_em
      FROM affiliate_offers
      WHERE status = 'active' AND quarantined_at IS NULL
        AND master_product_id IN (${sql.join(masterIds.map((id) => sql`${id}`), sql`, `)})
      GROUP BY master_product_id
      HAVING COUNT(sold_quantity) > 0
    `)) as unknown as Array<{ master_id: string; soma: string | number; maximo: string | number; com_dado: number; ativas: number; atualizado_em: string | Date | null }>;
    for (const r of rows) {
      out.set(r.master_id, {
        soma: Number(r.soma),
        maximo: Number(r.maximo),
        ofertasComDado: r.com_dado,
        ofertasAtivas: r.ativas,
        atualizadoEm: r.atualizado_em ? new Date(r.atualizado_em) : null,
      });
    }
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (code !== '42703') throw err;
  }
  return out;
}
