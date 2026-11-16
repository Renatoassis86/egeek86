/**
 * AUD-14 / R-75: quarentena reversivel das ofertas ativas cujo TITULO declara Open Box, vitrine ou mostruario (R-10/R-12). "Outlet" NAO entra
 * (decisao do dono pendente). Mesma regra pura do gatilho permanente (`src/lib/pricing/condicao-nao-nova.ts`).
 *   npx tsx --env-file=.env.local scripts/quarentena-condicao-nao-nova.ts                       # dry-run (padrao)
 *   npx tsx --env-file=.env.local scripts/quarentena-condicao-nao-nova.ts --apply               # backup NDJSON em backup/dados + grava
 *   npx tsx --env-file=.env.local scripts/quarentena-condicao-nao-nova.ts --rollback <arquivo.ndjson>
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { CONDICAO_NAO_NOVA_PG, MOTIVO_CONDICAO_NAO_NOVA, condicaoNaoNova } from '../src/lib/pricing/condicao-nao-nova';

async function main() {
  const a = process.argv.slice(2);
  const sql = connect();
  try {
    if (a[0] === '--rollback') {
      const rows = fs.readFileSync(a[1]!, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      await sql.begin(async (tx) => {
        for (const r of rows) await tx`update affiliate_offers set quarantined_at=${r.quarantined_at}, quarantine_reason=${r.quarantine_reason}, updated_at=now() where id=${r.id} and quarantine_reason=${MOTIVO_CONDICAO_NAO_NOVA}`;
      });
      console.log('restaurado', rows.length);
      return;
    }
    const todas = await sql`select o.id, o.title, o.quarantined_at, o.quarantine_reason, n.slug net, o.current_price_cents p from affiliate_offers o join affiliate_networks n on n.id=o.network_id where o.status='active' and o.quarantined_at is null and o.title ~* ${CONDICAO_NAO_NOVA_PG}`;
    const rows = todas.filter((r) => condicaoNaoNova(String(r.title)));
    console.log(a.includes('--apply') ? 'APPLY' : 'DRY-RUN', rows.length, 'ofertas (de', todas.length, 'que casam o texto)');
    for (const r of rows) console.log(' ', r.id, r.net, r.p, String(r.title).slice(0, 70));
    if (!a.includes('--apply') || !rows.length) return;
    const dir = path.resolve('backup/dados');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `aud-14-quarentena-condicao-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`);
    fs.writeFileSync(f, rows.map((r) => JSON.stringify({ id: r.id, quarantined_at: r.quarantined_at, quarantine_reason: r.quarantine_reason })).join('\n') + '\n');
    await sql.begin(async (tx) => {
      await tx`update affiliate_offers set quarantined_at=now(), quarantine_reason=${MOTIVO_CONDICAO_NAO_NOVA}, updated_at=now() where id = any(${rows.map((r) => r.id)}::uuid[]) and quarantined_at is null`;
    });
    console.log('aplicado; backup', f);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(String(e.message).slice(0, 300)); process.exit(1); });
