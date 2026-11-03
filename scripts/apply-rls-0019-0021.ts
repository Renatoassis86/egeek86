/**
 * Aplica/desfaz as migrations 0019, 0020, 0021 (uma por vez, em transacao).
 *   npx tsx --env-file=.env.local scripts/apply-rls-0019-0021.ts <0019|0020|0021> [--dry|--apply|--rollback]
 * --dry: executa dentro da transacao e da ROLLBACK no fim (valida sem alterar).
 * Antes de --apply grava backup/rls-pre-<id>.json com relacl/relrowsecurity (estado anterior).
 * Nunca imprime credenciais.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const FILES: Record<string, { up: string; down: string }> = {
  '0019': { up: '0019_rls_revoke_anon.sql', down: '0019_rls_revoke_anon.rollback.sql' },
  '0020': { up: '0020_search_products_trgm.sql', down: '0020_search_products_trgm.rollback.sql' },
  '0021': { up: '0021_affiliate_conversions.PENDING.sql', down: '0021_affiliate_conversions.rollback.sql' },
};
const id = process.argv[2];
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--rollback') ? 'rollback' : 'dry';
if (!FILES[id]) throw new Error('uso: <0019|0020|0021> [--dry|--apply|--rollback]');
const dir = path.resolve(process.cwd(), 'drizzle/migrations');
const SENTINEL = 'DRY_RUN_ROLLBACK';

function clean(text: string) {
  // remove BEGIN;/COMMIT; (a transacao e do script) e o bloco de rollback comentado (so comentarios)
  return text.replace(/^\s*(BEGIN|COMMIT);\s*$/gim, '');
}
function stripSupabaseAdmin(text: string) {
  return text.split('\n').filter((l) => !/FOR ROLE supabase_admin/i.test(l) || l.trim().startsWith('--')).join('\n');
}

async function main() {
  const sql = connect();
  try {
    const file = mode === 'rollback' ? FILES[id].down : FILES[id].up;
    let text = clean(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (mode === 'apply') {
      const pre = await sql`
        select c.relname, c.relrowsecurity, c.relacl::text acl from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','S') order by 1`;
      const out = path.resolve(process.cwd(), `backup/rls-pre-${id}.json`);
      fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows: pre }, null, 1));
      console.log(`estado anterior salvo em backup/rls-pre-${id}.json (${pre.length} objetos)`);
    }
    const run = async (t: string) => {
      for (let attempt = 1; ; attempt++) {
      try {
        await sql.begin(async (tx) => {
          await tx`set local lock_timeout = '15s'`;
          await tx.unsafe(t);
          if (mode === 'dry') throw new Error(SENTINEL);
        });
        console.log(`${file}: ${mode === 'apply' ? 'APLICADO (commit)' : mode === 'rollback' ? 'ROLLBACK SQL executado' : 'dry-run ok (nada alterado)'}`);
      } catch (e) {
        if (e instanceof Error && e.message === SENTINEL) {
          console.log(`${file}: dry-run OK (executou e fez rollback; nada alterado)`);
          return;
        }
        if (e instanceof Error && /deadlock detected|lock timeout/i.test(e.message) && attempt < 8) {
          console.log(`tentativa ${attempt}: ${e.message}; repetindo em 5s`);
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        throw e;
      }
      return;
      }
    };
    try {
      await run(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (id === '0019' && /permission denied|must be member|must be owner/i.test(msg) && /supabase_admin/i.test(text)) {
        console.log('aviso: bloco supabase_admin recusado (' + msg + '); repetindo sem as 6 linhas de supabase_admin (previsto no plano)');
        text = stripSupabaseAdmin(text);
        await run(text);
      } else throw e;
    }
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error('FALHOU:', e instanceof Error ? e.message : e);
  process.exit(1);
});
