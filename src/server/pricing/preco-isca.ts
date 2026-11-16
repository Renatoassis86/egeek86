import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ISCA_JANELA_REF_DIAS, ISCA_MOTIVO, ISCA_RAZAO_MAX, avaliarIsca, gatilhoIscaLigado, type ReferenciaIsca, type VereditoIsca } from '@/lib/pricing/preco-isca';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { upsertOfferDays } from '@/server/pricing/price-daily';
import { identidadeVendedorSql } from '@/server/pricing/preco-isca-sql';

/**
 * GATILHO PERMANENTE DE PRECO-ISCA (Fluxo Mestre R-61), parte de banco. Regra pura em `src/lib/pricing/preco-isca.ts`; filtro SQL em
 * `preco-isca-sql.ts`. Dois caminhos, o mesmo criterio:
 *   1. `avaliarEMarcarIsca` — gancho de `recordPriceSnapshot` (TODA cotacao de TODA rede e TODO item passa por la): cotacao nova julgada contra os
 *      outros anuncios do mesmo master; se isca, a cotacao e marcada em `preco_isca_marcas` (motivo e numeros) e a oferta vai para quarentena com
 *      motivo `preco_isca_...` (some da vitrine, da media, do selo, das mensagens). Preco que volta ao normal solta a quarentena da oferta (as
 *      cotacoes marcadas continuam marcadas: foram isca).
 *   2. `varrerIsca` — rede de seguranca (cron refresh-snapshots?part=daily e script): rejulga as ofertas vigentes, marca as que o gancho nao viu e
 *      solta as quarentenas que nao se sustentam. Com a flag desligada, solta tudo (reversao).
 * NUNCA apaga cotacao. Melhor esforco: nunca derruba a coleta.
 */

const MOTIVO_QUARENTENA = ISCA_MOTIVO;
type Row = Record<string, unknown>;

/** Referencias (outros anuncios com vendedor, ativos, elegiveis, vistos nos ultimos dias) de um master, exceto a oferta julgada. */
async function carregarReferencias(masterId: string, offerId: string): Promise<ReferenciaIsca[]> {
  const rows = await db.execute<Row>(sql`
    SELECT ${identidadeVendedorSql('o', 'n')} AS sid, o.current_price_cents::bigint AS p
    FROM affiliate_offers o INNER JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.master_product_id = ${masterId}::uuid AND o.id <> ${offerId}::uuid AND ${identidadeVendedorSql('o', 'n')} IS NOT NULL AND o.status = 'active'
      AND o.current_price_cents > 0 AND o.last_checked_at > now() - (${ISCA_JANELA_REF_DIAS}::int * interval '1 day') AND ${eligibleOfferSql('o')}`);
  return rows.map((r) => ({ sellerId: String(r.sid), priceCents: Number(r.p) }));
}

/**
 * Marca a cotacao-isca e TODAS as cotacoes do mesmo anuncio dos ultimos 15 dias abaixo do mesmo limite (RAZAO_MAX x mediana de referencia): a oferta ficou
 * nesse patamar (o batimento de 24 h grava uma linha por dia e o preco pode derivar centavos). Devolve os dias (America/Sao_Paulo) das marcas NOVAS
 * (null = nenhuma marca nova).
 */
async function marcarCotacao(p: { offerId: string; masterId: string; priceCents: number; v: VereditoIsca; origem: string }): Promise<string[] | null> {
  const mediana = p.v.medianaCents ?? 0;
  const limite = Math.max(p.priceCents + 1, Math.ceil(mediana * ISCA_RAZAO_MAX));
  const rows = await db.execute<Row>(sql`
    INSERT INTO preco_isca_marcas (snapshot_id, offer_id, master_product_id, price_cents, mediana_ref_cents, razao, vendedores_ref, motivo, origem)
    SELECT s.id, s.offer_id, ${p.masterId}::uuid, s.price_cents, ${Math.round(mediana)}::bigint, round(s.price_cents::numeric / NULLIF(${Math.round(mediana)}::numeric, 0), 4), ${p.v.vendedores}::int, ${ISCA_MOTIVO}, ${p.origem}
    FROM affiliate_price_snapshots s
    WHERE s.offer_id = ${p.offerId}::uuid AND s.price_cents > 0 AND s.price_cents < ${limite}::bigint AND s.collected_at > now() - interval '15 days'
    ON CONFLICT (snapshot_id) DO UPDATE SET liberado_em = NULL, liberado_motivo = NULL WHERE preco_isca_marcas.liberado_em IS NOT NULL
    RETURNING (SELECT (x.collected_at AT TIME ZONE 'America/Sao_Paulo')::date::text FROM affiliate_price_snapshots x WHERE x.id = preco_isca_marcas.snapshot_id) AS dia`);
  return rows.length ? rows.map((r) => String(r.dia)) : null;
}

/** Refaz a(s) linha(s) oferta-dia (derivada) sem as cotacoes marcadas; dia que ficou sem nenhuma cotacao limpa perde a linha derivada (recalculavel). */
export async function refazerOfertaDias(offerId: string, dias: string[]): Promise<void> {
  for (const dia of [...new Set(dias)]) {
    await db.execute(sql`
      DELETE FROM price_daily_offer d WHERE d.offer_id = ${offerId}::uuid AND d.day = ${dia}::date AND NOT EXISTS (
        SELECT 1 FROM affiliate_price_snapshots s WHERE s.offer_id = d.offer_id AND s.price_cents > 0
          AND (s.collected_at AT TIME ZONE 'America/Sao_Paulo')::date = d.day
          AND NOT EXISTS (SELECT 1 FROM preco_isca_marcas k WHERE k.snapshot_id = s.id AND k.liberado_em IS NULL))`);
    await upsertOfferDays(db, dia, dia, offerId);
  }
}

/**
 * Gancho da coleta: julga o preco recem-gravado da oferta. Devolve o veredito (null = gatilho desligado ou sem dados). Chamar DEPOIS de gravar o
 * snapshot e ANTES do gancho da oferta-dia (para a linha do dia ja nascer sem a isca).
 */
export async function avaliarEMarcarIsca(offerId: string, priceCents: number): Promise<(VereditoIsca & { marcada: boolean }) | null> {
  if (!gatilhoIscaLigado()) return null;
  try {
    const rows = await db.execute<Row>(sql`SELECT master_product_id::text AS mid, quarantined_at, quarantine_reason FROM affiliate_offers WHERE id = ${offerId}::uuid`);
    const o = rows[0];
    if (!o) return null;
    const mid = String(o.mid);
    const v = avaliarIsca(priceCents, await carregarReferencias(mid, offerId));
    if (v.isca) {
      const diasMarcados = await marcarCotacao({ offerId, masterId: mid, priceCents, v, origem: 'coleta' });
      if (o.quarantined_at == null) await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = now(), quarantine_reason = ${MOTIVO_QUARENTENA}, updated_at = now() WHERE id = ${offerId}::uuid AND quarantined_at IS NULL`);
      if (diasMarcados) await refazerOfertaDias(offerId, diasMarcados);
      return { ...v, marcada: diasMarcados != null };
    }
    // Preco voltou ao normal: solta so a quarentena que ESTE gatilho gravou (as cotacoes ja marcadas continuam marcadas).
    if (o.quarantined_at != null && o.quarantine_reason === MOTIVO_QUARENTENA && v.razao != null) {
      await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = NULL, quarantine_reason = NULL, updated_at = now() WHERE id = ${offerId}::uuid AND quarantine_reason = ${MOTIVO_QUARENTENA}`);
    }
    return { ...v, marcada: false };
  } catch (err) {
    console.error('[preco-isca] gancho falhou (ignorado):', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface ResumoVarredura {
  ligado: boolean;
  avaliadas: number;
  novasIscas: number;
  quarentenasSoltas: number;
  /** offer_id das novas iscas (amostra) */
  exemplos: string[];
  /** offer_id de TODAS as novas iscas (ofertas vigentes que o criterio marcaria e que ainda nao estao em quarentena): o invariante do medidor exige que seja vazio. */
  idsNovasIscas: string[];
}

/**
 * Varredura: rejulga todas as ofertas ativas e elegiveis (e as ja em quarentena por isca) vistas nos ultimos dias, de todos os masters com referencia
 * suficiente. `apply=false` so conta. Flag desligada: solta todas as quarentenas por isca (reversao).
 */
export async function varrerIsca(apply: boolean, opts: { budgetMs?: number } = {}): Promise<ResumoVarredura> {
  const fim = opts.budgetMs ? Date.now() + opts.budgetMs : Infinity;
  const res: ResumoVarredura = { ligado: gatilhoIscaLigado(), avaliadas: 0, novasIscas: 0, quarentenasSoltas: 0, exemplos: [], idsNovasIscas: [] };
  if (!res.ligado) {
    const r = await db.execute<Row>(sql`SELECT id::text AS id FROM affiliate_offers WHERE quarantine_reason = ${MOTIVO_QUARENTENA} AND quarantined_at IS NOT NULL`);
    res.quarentenasSoltas = r.length;
    if (apply && r.length) {
      await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = NULL, quarantine_reason = NULL, updated_at = now() WHERE quarantine_reason = ${MOTIVO_QUARENTENA}`);
      await db.execute(sql`UPDATE preco_isca_marcas SET liberado_em = now(), liberado_motivo = 'flag_desligada' WHERE liberado_em IS NULL`);
    }
    return res;
  }
  const rows = await db.execute<Row>(sql`
    SELECT o.id::text AS id, o.master_product_id::text AS mid, ${identidadeVendedorSql('o', 'n')} AS sid, o.current_price_cents::bigint AS p, o.quarantined_at, o.quarantine_reason
    FROM affiliate_offers o INNER JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.status = 'active' AND o.current_price_cents > 0 AND o.last_checked_at > now() - (${ISCA_JANELA_REF_DIAS}::int * interval '1 day')
      AND (${eligibleOfferSql('o')} OR o.quarantine_reason = ${MOTIVO_QUARENTENA})`);
  const porMaster = new Map<string, Row[]>();
  for (const r of rows) (porMaster.get(String(r.mid)) ?? porMaster.set(String(r.mid), []).get(String(r.mid))!).push(r);
  for (const [mid, L] of porMaster) {
    if (Date.now() > fim) break; // orcamento esgotado: o resto fica para o proximo ciclo
    const pool = L.filter((r) => r.sid && r.quarantined_at == null);
    if (new Set(pool.map((r) => r.sid)).size < 3) {
      // sem referencia suficiente: nao julga; quarentena por isca que nao se sustenta e solta
      for (const r of L) if (r.quarantine_reason === MOTIVO_QUARENTENA) { res.quarentenasSoltas++; if (apply) await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = NULL, quarantine_reason = NULL, updated_at = now() WHERE id = ${String(r.id)}::uuid AND quarantine_reason = ${MOTIVO_QUARENTENA}`); }
      continue;
    }
    for (const r of L) {
      res.avaliadas++;
      const refs = pool.filter((x) => x.id !== r.id).map((x) => ({ sellerId: String(x.sid), priceCents: Number(x.p) }));
      const v = avaliarIsca(Number(r.p), refs);
      const emIsca = r.quarantine_reason === MOTIVO_QUARENTENA && r.quarantined_at != null;
      if (v.isca && r.quarantined_at == null) {
        res.novasIscas++;
        res.idsNovasIscas.push(String(r.id));
        if (res.exemplos.length < 10) res.exemplos.push(String(r.id));
        if (apply) {
          const diasMarcados = await marcarCotacao({ offerId: String(r.id), masterId: mid, priceCents: Number(r.p), v, origem: 'varredura' });
          await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = now(), quarantine_reason = ${MOTIVO_QUARENTENA}, updated_at = now() WHERE id = ${String(r.id)}::uuid AND quarantined_at IS NULL`);
          if (diasMarcados) await refazerOfertaDias(String(r.id), diasMarcados);
        }
      } else if (v.isca && emIsca) {
        // ja em quarentena: garante a marca das cotacoes do periodo (idempotente; so refaz a oferta-dia se entrou marca nova)
        if (apply) {
          const novos = await marcarCotacao({ offerId: String(r.id), masterId: mid, priceCents: Number(r.p), v, origem: 'varredura' });
          if (novos) await refazerOfertaDias(String(r.id), novos);
        }
      } else if (!v.isca && emIsca && v.razao != null) {
        res.quarentenasSoltas++;
        if (apply) await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = NULL, quarantine_reason = NULL, updated_at = now() WHERE id = ${String(r.id)}::uuid AND quarantine_reason = ${MOTIVO_QUARENTENA}`);
      }
    }
  }
  return res;
}
