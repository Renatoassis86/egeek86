export {};
/* Backup somente leitura das tabelas de leilao/drop/vendedor/colecionador.
 * Uso: npx tsx --env-file=.env.local scripts/backup-leilao-usados.ts
 * Saida: docs/backups/leilao-usados-2026-11-11/dados/<tabela>.ndjson */
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const TABELAS = [
  'auctions', 'auction_bids', 'drops', 'drop_waitlist', 'drop_purchases', 'drop_access_log',
  'drop_curations', 'review_curations', 'sellers', 'seller_kyc_documents', 'seller_metrics',
  'seller_payouts', 'points_ledger', 'point_rules', 'levels', 'badges', 'user_badges',
  'missions', 'user_missions',
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');
  const sql = postgres(url, { max: 1, prepare: false });
  const dir = path.join(process.cwd(), 'docs', 'backups', 'leilao-usados-2026-11-11', 'dados');
  fs.mkdirSync(dir, { recursive: true });
  const resumo: Record<string, number | string> = {};
  for (const t of TABELAS) {
    try {
      const rows = await sql.unsafe(`select * from "${t}"`);
      fs.writeFileSync(path.join(dir, `${t}.ndjson`), rows.map((r: unknown) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
      resumo[t] = rows.length;
    } catch (e: any) {
      resumo[t] = `ERRO: ${e.message}`;
    }
  }
  // perfis com papel de colecionador (so leitura, sem colunas sensiveis alem do necessario)
  try {
    const rows = await sql.unsafe(`select * from profiles where role::text in ('collector','seller')`);
    fs.writeFileSync(path.join(dir, 'profiles_colecionadores.ndjson'), rows.map((r: unknown) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    resumo['profiles_colecionadores'] = rows.length;
  } catch (e: any) {
    resumo['profiles_colecionadores'] = `ERRO: ${e.message}`;
  }
  fs.writeFileSync(path.join(dir, '_resumo.json'), JSON.stringify(resumo, null, 2));
  console.table(resumo);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
