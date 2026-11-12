/** Teste simples (sem banco) da derivacao de acoes do plano do piloto. Rodar: npx tsx scripts/test-aplicar-piloto-identidade.ts */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { deriveActions, type PilotPlan } from './aplicar-piloto-identidade';
import { identPs5 } from './piloto-identidade-itens';

const dir = path.resolve('docs/backups');
const f = fs.readdirSync(dir).filter((x) => /^piloto-identidade-itens-plano-.*\.json$/.test(x)).sort().pop()!;
const plan = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as PilotPlan;
const A = deriveActions(plan);
const pairs = new Set(A.moves.map((m) => `${m.fromMasterId.slice(0, 8)}>${(m.destinoMasterId as string).slice(0, 8)}`));
assert.equal(A.moves.length, 6);
assert.deepEqual([...pairs].sort(), ['599ae76d>2541db02', '71a42333>fea28c9c']);
assert.equal(A.fence.length, 4, 'so cerca SUPERIOR (4); inferior (3 do Pro) ignorado');
assert.equal(A.fenceLowerIgnored, 3);
assert.ok(!A.fence.some((x) => x.offerId.startsWith('23bdd0cf') || x.offerId.startsWith('eb0bff4a') || x.offerId.startsWith('5190c318')));
assert.equal(A.uncertain.length, 16);
assert.equal(A.verdict?.valor, 'em_revisao');
assert.equal(A.verdict?.masterId, '32d3d75a-8edd-4270-9b43-b8cd7c1f4572');
for (const m of A.moves) assert.equal(identPs5(m.title).key, m.key, 'chave do titulo bate com o plano');
for (const u of A.uncertain) assert.equal(identPs5(u.title).conf, 'baixa');
// nenhuma oferta e movida E marcada ao mesmo tempo, nem em dois grupos
assert.equal(new Set([...A.moves.map((m) => m.offerId), ...A.fence.map((x) => x.offerId), ...A.uncertain.map((u) => u.offerId)]).size, 26);
console.log(`OK (${f}): mover=${A.moves.length} cerca_sup=${A.fence.length} incertas=${A.uncertain.length} veredito=${A.verdict?.valor}`);
