/** Auditoria de informacao (2026-11-16): executa SQL SOMENTE LEITURA (transacao READ ONLY). Uso: npx tsx --env-file=.env.local scripts/auditoria-informacao/q.ts "SELECT ..." | -f arquivo.sql */
import fs from 'node:fs';
import { connect } from '../_dup-shared';
async function main() {
  const a = process.argv.slice(2);
  const text = a[0] === '-f' ? fs.readFileSync(a[1]!, 'utf8') : a.join(' ');
  if (/\b(insert|update|delete|drop|alter|truncate|create|grant)\b/i.test(text.replace(/'[^']*'/g, ''))) throw new Error('somente leitura');
  const sql = connect();
  try {
    const rows = await sql.begin('read only', async (tx) => tx.unsafe(text));
    for (const r of rows) console.log(JSON.stringify(r));
    console.error(`(${rows.length} linhas)`);
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(String(e.message).slice(0, 400)); process.exit(1); });
