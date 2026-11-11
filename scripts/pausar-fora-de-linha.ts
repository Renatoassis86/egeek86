/**
 * Só produto NOVO e EM LINHA (dono, 2026-11-11). Pausa (status 'paused') as ofertas ATIVAS de games cujo master é de plataforma
 * fora de linha ou retrô: xbox_one, xbox_360 e legado detectado pelo título (PS3, Wii, 3DS...). Reversível: o backup guarda o status anterior.
 *   npx tsx --env-file=.env.local scripts/pausar-fora-de-linha.ts            # dry-run
 *   npx tsx --env-file=.env.local scripts/pausar-fora-de-linha.ts --apply
 *   npx tsx --env-file=.env.local scripts/pausar-fora-de-linha.ts --rollback docs/backups/fora-de-linha-<ts>.ndjson [--apply]
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';
import { legacyPlatformLabel } from '../src/lib/catalog/platform';

const APPLY = process.argv.includes('--apply');
const rb = process.argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

async function main() {
  const sql = connect();
  try {
    if (rb >= 0) {
      const lines = fs.readFileSync(process.argv[rb + 1], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      console.log('ofertas a restaurar:', lines.length);
      if (APPLY) for (const l of lines) await sql`UPDATE affiliate_offers SET status = ${l.status}::affiliate_offer_status, updated_at = now() WHERE id = ${l.id}::uuid AND status = 'paused'`;
      return void console.log(APPLY ? 'restauradas' : 'DRY-RUN');
    }
    const rows = await sql<{ id: string; status: string; name: string; plat: string; net: string }[]>`
      SELECT o.id::text AS id, o.status::text AS status, m.name, m.game_platform_gen::text AS plat, n.slug AS net
      FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id JOIN affiliate_networks n ON n.id = o.network_id
      WHERE o.status = 'active' AND m.vertical = 'games'
        AND (m.game_platform_gen::text IN ('xbox_one','xbox_360') OR (m.game_platform_gen::text = 'unknown'))`;
    const pick = rows.filter((r) => r.plat === 'xbox_one' || r.plat === 'xbox_360' || legacyPlatformLabel(r.name) != null);
    const by: Record<string, number> = {};
    for (const r of pick) by[`${r.plat}/${r.net}`] = (by[`${r.plat}/${r.net}`] ?? 0) + 1;
    console.log('ofertas ativas fora de linha/retro:', pick.length, JSON.stringify(by));
    console.log('amostra:', pick.slice(0, 8).map((r) => `${r.plat} | ${r.name.slice(0, 60)}`));
    if (!APPLY) return void console.log('DRY-RUN: use --apply');
    const file = `docs/backups/fora-de-linha-${stamp}.ndjson`;
    fs.writeFileSync(file, pick.map((r) => JSON.stringify({ id: r.id, status: r.status, plat: r.plat, name: r.name })).join('\n') + '\n');
    const ids = pick.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 500) await sql`UPDATE affiliate_offers SET status = 'paused', updated_at = now() WHERE id = ANY(${ids.slice(i, i + 500)}::uuid[]) AND status = 'active'`;
    console.log('pausadas:', ids.length, '| backup:', file, '| reverter: --rollback', file, '--apply');
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
