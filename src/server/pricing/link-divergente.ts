import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { AUDITORIA_VALE_MIN, VEREDITOS_BLOQUEANTES } from '@/lib/messaging/confirmacao-preco';

/**
 * R-76 (AUD-27): oferta cujo link a auditoria (#119) provou divergente (preco_divergente, item_diferente, pausado, sem_link, pendente_de_anuncio) em leitura
 * recente NÃO fica visível no site nem em lista: o porteiro só barrava mensagem. Quarentena reversível, motivo `link_divergente_auditoria`; solta quando a
 * auditoria mais nova deixa de ser bloqueante OU envelhece além da validade (a oferta em quarentena não é reauditada: ao soltar, a próxima rodada a julga de novo). Nunca apaga nada. Flag LINK_DIVERGENTE_QUARENTENA=0 desliga (e solta tudo). Cron `refresh-snapshots?part=daily`.
 */
export const MOTIVO_LINK_DIVERGENTE = 'link_divergente_auditoria';
const lista = sql.raw(VEREDITOS_BLOQUEANTES.map((v) => `'${v}'`).join(','));

export async function varrerLinkDivergente(apply: boolean): Promise<{ ligado: boolean; novas: number; soltas: number }> {
  const ligado = process.env.LINK_DIVERGENTE_QUARENTENA !== '0';
  const res = { ligado, novas: 0, soltas: 0 };
  const novas = await db.execute<{ id: string }>(sql`
    SELECT o.id::text AS id FROM affiliate_offers o
    JOIN LATERAL (SELECT verdict, checked_at FROM offer_link_audit x WHERE x.offer_id = o.id ORDER BY x.checked_at DESC LIMIT 1) a ON TRUE
    WHERE ${ligado} AND o.status = 'active' AND o.quarantined_at IS NULL AND a.verdict IN (${lista}) AND a.checked_at > now() - (${AUDITORIA_VALE_MIN}::int * interval '1 minute')`);
  res.novas = novas.length;
  if (apply && novas.length) {
    await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = now(), quarantine_reason = ${MOTIVO_LINK_DIVERGENTE}, updated_at = now()
      WHERE quarantined_at IS NULL AND id IN (${sql.join(novas.map((r) => sql`${r.id}::uuid`), sql`, `)})`);
  }
  const soltar = await db.execute<{ id: string }>(sql`
    SELECT o.id::text AS id FROM affiliate_offers o
    LEFT JOIN LATERAL (SELECT verdict FROM offer_link_audit x WHERE x.offer_id = o.id ORDER BY x.checked_at DESC LIMIT 1) a ON TRUE
    WHERE o.quarantine_reason = ${MOTIVO_LINK_DIVERGENTE} AND o.quarantined_at IS NOT NULL
      AND (NOT ${ligado} OR a.verdict IS NULL OR a.verdict NOT IN (${lista}) OR a.checked_at <= now() - (${AUDITORIA_VALE_MIN}::int * interval '1 minute'))`);
  res.soltas = soltar.length;
  if (apply && soltar.length) {
    await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = NULL, quarantine_reason = NULL, updated_at = now()
      WHERE quarantine_reason = ${MOTIVO_LINK_DIVERGENTE} AND id IN (${sql.join(soltar.map((r) => sql`${r.id}::uuid`), sql`, `)})`);
  }
  return res;
}
