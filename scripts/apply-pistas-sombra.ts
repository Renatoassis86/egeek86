/**
 * Aplica a migration 0073 (R-112: group_messages.tipo + pista_contador + pista_decisao). ADITIVA e reversivel.
 *   npx tsx --env-file=.env.local scripts/apply-pistas-sombra.ts              # dry-run: estado atual, nada e escrito
 *   npx tsx --env-file=.env.local scripts/apply-pistas-sombra.ts --apply      # backup logico + migration (lock_timeout 3 s, ate 6 tentativas)
 *   npx tsx --env-file=.env.local scripts/apply-pistas-sombra.ts --indice     # CREATE INDEX CONCURRENTLY group_messages_vertical_tipo_idx (fora de transacao; horario calmo)
 *   npx tsx --env-file=.env.local scripts/apply-pistas-sombra.ts --rollback --apply
 * ADD COLUMN nula e so catalogo (nao reescreve group_messages). Backup logico: backup/dados/pistas-<ts>/ (estado das colunas, contagens e a propria migration).
 * Nunca imprime credenciais.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, type Sql } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const INDICE = process.argv.includes('--indice');
const dir = path.resolve(process.cwd(), 'drizzle/migrations');
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function estado(sql: Sql) {
  const col = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='group_messages' AND column_name='tipo'`;
  const tabs = await sql<{ t: string }[]>`SELECT table_name AS t FROM information_schema.tables WHERE table_name IN ('pista_contador','pista_decisao') ORDER BY 1`;
  const idx = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='group_messages_vertical_tipo_idx'`;
  return { colunaTipo: col[0].n === 1, tabelas: tabs.map((x) => x.t), indiceTipo: idx[0].n === 1 };
}

async function main() {
  const sql = connect();
  try {
    const st = await estado(sql);
    console.log('Estado:', JSON.stringify(st));
    if (INDICE) {
      if (!st.colunaTipo) throw new Error('aplique a migration antes (coluna tipo ausente)');
      if (!APPLY) return void console.log('DRY-RUN: use --indice --apply (CONCURRENTLY, fora de transacao).');
      await sql.unsafe(`SET lock_timeout = '3s'`);
      await sql.unsafe(`SET statement_timeout = '15min'`);
      await sql.unsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS group_messages_vertical_tipo_idx ON group_messages (vertical, tipo, created_at DESC) WHERE tipo IS NOT NULL`);
      console.log('indice criado:', JSON.stringify(await estado(sql)));
      return;
    }
    if (!APPLY) return void console.log('DRY-RUN: use --apply ou --rollback --apply.');
    const arq = ROLLBACK ? '0073_pistas_sombra.rollback.sql' : '0073_pistas_sombra.sql';
    const ddl = fs.readFileSync(path.join(dir, arq), 'utf8');
    // backup logico: estado + contagens leves + a migration
    const out = path.resolve(process.cwd(), 'backup/dados', `pistas-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(out, { recursive: true });
    const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='group_messages' ORDER BY ordinal_position`;
    const cont = ROLLBACK && st.tabelas.length
      ? { pista_decisao: (await sql`SELECT count(*)::int AS n FROM pista_decisao`)[0].n, pista_contador: (await sql`SELECT count(*)::int AS n FROM pista_contador`)[0].n }
      : {};
    fs.writeFileSync(path.join(out, 'baseline.json'), JSON.stringify({ quando: new Date().toISOString(), estado: st, colunasGroupMessages: cols, contagens: cont }, null, 2));
    fs.writeFileSync(path.join(out, arq), ddl);
    if (ROLLBACK && st.tabelas.length) {
      for (const t of st.tabelas) fs.writeFileSync(path.join(out, `${t}.ndjson`), (await sql`SELECT * FROM ${sql(t)}`).map((r) => JSON.stringify(r)).join('\n'));
    }
    console.log('backup logico em', out);
    let ultimo: unknown;
    for (let i = 1; i <= 6; i++) {
      try {
        await sql.begin(async (tx) => { await tx.unsafe(ddl); });
        console.log(`${arq} aplicada (tentativa ${i}).`, JSON.stringify(await estado(sql)));
        return;
      } catch (e) {
        ultimo = e;
        const msg = String((e as Error)?.message ?? e);
        if (!/lock timeout|canceling statement|deadlock/i.test(msg)) throw e;
        console.log(`tentativa ${i}: ${msg.slice(0, 80)}; aguardando para repetir`);
        await esperar(1500 * i);
      }
    }
    throw ultimo;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => { console.error(String((e as Error)?.message ?? e).slice(0, 300)); process.exit(1); });
