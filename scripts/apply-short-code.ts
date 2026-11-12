/**
 * Aplica a migration 0050 (group_messages.short_code + indice unico parcial), link curto do WhatsApp.
 *   npx tsx --env-file=.env.local scripts/apply-short-code.ts            # dry-run (so confere o estado)
 *   npx tsx --env-file=.env.local scripts/apply-short-code.ts --apply    # backup do estado, coluna (transacao) e indice (CONCURRENTLY, fora de transacao)
 *   npx tsx --env-file=.env.local scripts/apply-short-code.ts --rollback # desfaz
 * Aditiva e reversivel. R-05: grava o estado anterior em docs/backups/ antes de aplicar. Nunca imprime a connection string.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const dir = path.resolve(process.cwd(), 'drizzle/migrations');

async function estado(sql: ReturnType<typeof connect>) {
  const col = await sql<{ c: string }[]>`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'group_messages' AND column_name = 'short_code'`;
  const idx = await sql<{ i: string }[]>`SELECT indexname AS i FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'group_messages' AND indexname = 'group_messages_short_code_uq'`;
  const n = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM group_messages`;
  return { linhas_group_messages: n[0]?.n ?? 0, coluna_short_code: col.length > 0, indice_unico: idx.length > 0 };
}

async function main() {
  const sql = connect();
  try {
    const antes = await estado(sql);
    console.log('Estado atual:', JSON.stringify(antes));
    if (!APPLY && !ROLLBACK) {
      console.log('DRY-RUN: executaria 0050_group_messages_short_code.sql e a parte 2 (indice). Use --apply (ou --rollback).');
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bkp = path.resolve(process.cwd(), 'docs/backups', `short-code-${ROLLBACK ? 'rollback' : 'apply'}-${stamp}.json`);
    fs.mkdirSync(path.dirname(bkp), { recursive: true });
    fs.writeFileSync(bkp, JSON.stringify({ quando: new Date().toISOString(), acao: ROLLBACK ? 'rollback' : 'apply', estado_antes: antes, nota: 'Migration aditiva (coluna anulavel). Nenhum dado existente e reescrito; o estado antes basta para reverter (rollback SQL).' }, null, 2));
    console.log('Backup do estado gravado em', path.relative(process.cwd(), bkp));
    if (ROLLBACK) {
      const text = fs.readFileSync(path.join(dir, '0050_group_messages_short_code.rollback.sql'), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
      });
    } else {
      const text = fs.readFileSync(path.join(dir, '0050_group_messages_short_code.sql'), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
      });
      await sql.unsafe("SET statement_timeout = '60s'");
      const idx = fs.readFileSync(path.join(dir, '0050_group_messages_short_code_idx.sql'), 'utf8');
      await sql.unsafe(idx);
    }
    console.log('Estado agora:', JSON.stringify(await estado(sql)));
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
