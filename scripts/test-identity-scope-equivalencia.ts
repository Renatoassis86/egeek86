/**
 * R-111, prova de equivalencia: `offerIdentityVisibleSql('o.id', { masters })` exclui EXATAMENTE as mesmas ofertas que a subconsulta do catalogo inteiro,
 * para todos os produtos. Referencia = UMA varredura completa (~3 s); candidato = lotes de produtos com a subconsulta restrita.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-identity-scope-equivalencia.ts [--lote=300]
 * Leve: uma consulta completa e consultas curtas por lote, pausa entre lotes. Sai com codigo 1 se houver diferenca.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { offerIdentityVisibleSql } from '@/server/queries/public-offers';

const LOTE = Number((process.argv.find((a) => a.startsWith('--lote=')) ?? '').split('=')[1] ?? 300);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Tudo em UMA transacao REPEATABLE READ: coletores quarentenam ofertas ao vivo e a comparacao precisa ver o mesmo instante.
  await db.transaction(async (tx) => {
  await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
  await tx.execute(sql`SET LOCAL statement_timeout = '25s'`);
  const t0 = Date.now();
  const ref = await tx.execute<{ id: string; mid: string }>(sql`
    SELECT o.id::text AS id, o.master_product_id::text AS mid FROM affiliate_offers o
    WHERE o.master_product_id IS NOT NULL AND o.status = 'active' AND NOT (${offerIdentityVisibleSql('o.id')})`);
  console.log(`referencia (catalogo inteiro): ${ref.length} ofertas ativas excluidas em ${Date.now() - t0} ms`);
  const masters = await tx.execute<{ id: string }>(sql`SELECT DISTINCT o.master_product_id::text AS id FROM affiliate_offers o WHERE o.master_product_id IS NOT NULL AND o.status = 'active'`);
  const ids = masters.map((m) => m.id);
  const cand = new Set<string>();
  const t1 = Date.now();
  for (let i = 0; i < ids.length; i += LOTE) {
    const part = ids.slice(i, i + LOTE);
    const list = sql.join(part.map((x) => sql`${x}::uuid`), sql`, `);
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT o.id::text AS id FROM affiliate_offers o
      WHERE o.master_product_id IN (${list}) AND o.status = 'active' AND NOT (${offerIdentityVisibleSql('o.id', { masters: part })})`);
    for (const r of rows) cand.add(r.id);
    await pause(150);
  }
  console.log(`candidato (restrito por produto): ${cand.size} excluidas em ${Date.now() - t1} ms (${Math.ceil(ids.length / LOTE)} lotes, ${ids.length} produtos)`);
  const refSet = new Set(ref.map((r) => r.id));
  const soRef = [...refSet].filter((x) => !cand.has(x));
  const soCand = [...cand].filter((x) => !refSet.has(x));
  console.log(`so na referencia: ${soRef.length}; so no candidato: ${soCand.length}`);
  if (soRef.length || soCand.length) { console.error('DIFERENCA', soRef.slice(0, 5), soCand.slice(0, 5)); process.exitCode = 1; return; }
  console.log('EQUIVALENTE');
  });
  process.exit(process.exitCode ?? 0);
})().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
