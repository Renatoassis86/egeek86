import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { CONDICAO_NAO_NOVA_PG, MOTIVO_CONDICAO_NAO_NOVA, condicaoNaoNova, condicaoNaoNovaLigada } from '@/lib/pricing/condicao-nao-nova';

/**
 * Varredura do gatilho de condição não nova (R-75, AUD-14). Ofertas ativas fora de quarentena cujo título declara Open Box/vitrine/mostruário
 * vão para quarentena com motivo `condicao_nao_nova_open_box_vitrine`; reversível (solta quando o título deixa de declarar). Nunca apaga nada.
 * Roda no cron refresh-snapshots?part=daily, depois da varredura de isca. `apply=false` só conta.
 */
export async function varrerCondicaoNaoNova(apply: boolean): Promise<{ ligado: boolean; novas: number; soltas: number; ids: string[] }> {
  const res = { ligado: condicaoNaoNovaLigada(), novas: 0, soltas: 0, ids: [] as string[] };
  if (!res.ligado) return res;
  const rows = await db.execute<{ id: string; title: string }>(sql`
    SELECT id::text AS id, title FROM affiliate_offers WHERE status = 'active' AND quarantined_at IS NULL AND title ~* ${CONDICAO_NAO_NOVA_PG}`);
  const alvo = rows.filter((r) => condicaoNaoNova(r.title)).map((r) => r.id);
  res.novas = alvo.length;
  res.ids = alvo.slice(0, 20);
  if (apply && alvo.length) {
    await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = now(), quarantine_reason = ${MOTIVO_CONDICAO_NAO_NOVA}, updated_at = now()
      WHERE id = ANY(${sql.raw(`ARRAY[${alvo.map((i) => `'${i.replace(/[^0-9a-f-]/gi, '')}'`).join(',')}]::uuid[]`)}) AND quarantined_at IS NULL`);
  }
  const em = await db.execute<{ id: string; title: string }>(sql`SELECT id::text AS id, title FROM affiliate_offers WHERE quarantine_reason = ${MOTIVO_CONDICAO_NAO_NOVA} AND quarantined_at IS NOT NULL`);
  const soltar = em.filter((r) => !condicaoNaoNova(r.title)).map((r) => r.id);
  res.soltas = soltar.length;
  if (apply && soltar.length) {
    await db.execute(sql`UPDATE affiliate_offers SET quarantined_at = NULL, quarantine_reason = NULL, updated_at = now()
      WHERE quarantine_reason = ${MOTIVO_CONDICAO_NAO_NOVA} AND id = ANY(${sql.raw(`ARRAY[${soltar.map((i) => `'${i.replace(/[^0-9a-f-]/gi, '')}'`).join(',')}]::uuid[]`)})`);
  }
  return res;
}
