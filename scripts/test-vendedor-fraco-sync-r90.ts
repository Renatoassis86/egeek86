// E6 (#147): a sincronização do vendedor fraco roda a cada 10 min no part=vitrines (além do part=stats).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const r = fs.readFileSync('src/app/api/cron/refresh-snapshots/route.ts', 'utf8');
assert.ok(/part === 'vitrines'\) await sincronizarVendedorFracoForaDaMedia\(\{ apply: true \}\)/.test(r), 'sync no part=vitrines');
const j = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
const v = j.crons.find((c) => c.path.includes('part=vitrines'));
assert.ok(v && /\/(10|5)\b/.test(v.schedule), 'vitrines roda a cada 10 min ou menos');
console.log('test-vendedor-fraco-sync-r90: OK');
