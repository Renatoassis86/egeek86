/**
 * AUD-14: poe em quarentena (reversivel) ofertas ativas cujo TITULO declara Open Box ou Vitrine (R-10/R-12: usado/open box fora).
 * "Outlet" NAO entra (condicao ambigua: decisao do dono). Padrao --dry-run. --apply grava backup NDJSON em docs/backups antes. --rollback <arquivo> restaura.
 * Uso: npx tsx --env-file=.env.local scripts/auditoria-informacao/quarentena-condicao-nao-nova.ts [--apply | --rollback docs/backups/x.ndjson]
 */
import fs from 'node:fs';
import { connect } from '../_dup-shared';
const MOTIVO = 'condicao_nao_nova_open_box_vitrine [AUD-14 2026-11-16]';
async function main() {
  const a = process.argv.slice(2);
  const sql = connect();
  try {
    if (a[0] === '--rollback') {
      const rows = fs.readFileSync(a[1]!, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      await sql.begin(async (tx) => { await tx`SET LOCAL lock_timeout='5s'`; for (const r of rows) await tx`update affiliate_offers set quarantined_at=${r.quarantined_at}, quarantine_reason=${r.quarantine_reason} where id=${r.id} and quarantine_reason=${MOTIVO}`; });
      console.log('restaurado', rows.length); return;
    }
    const rows = await sql`select id, title, quarantined_at, quarantine_reason from affiliate_offers where status='active' and quarantined_at is null and title ~* '(open ?box|(^|[^a-z])vitrine([^a-z]|$)|mostru[aá]rio)'`;
    console.log(a.includes('--apply') ? 'APPLY' : 'DRY-RUN', rows.length, 'ofertas'); for (const r of rows) console.log(' ', r.id, String(r.title).slice(0, 70));
    if (!a.includes('--apply') || !rows.length) return;
    const f = `docs/backups/aud-14-quarentena-condicao-${new Date().toISOString().slice(0, 10)}.ndjson`;
    fs.writeFileSync(f, rows.map((r) => JSON.stringify({ id: r.id, quarantined_at: r.quarantined_at, quarantine_reason: r.quarantine_reason })).join('\n') + '\n');
    await sql.begin(async (tx) => { await tx`SET LOCAL lock_timeout='5s'`; await tx`update affiliate_offers set quarantined_at=now(), quarantine_reason=${MOTIVO} where id = any(${rows.map((r) => r.id)}::uuid[])`; });
    console.log('aplicado; backup', f);
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(String(e.message).slice(0, 300)); process.exit(1); });
