/** R-111: guardas estruturais do fechamento do registro do cron de estatisticas (vigia da rota + guarda de lote). Sem banco. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log('ok -', nome); };
const rota = fs.readFileSync('src/app/api/cron/refresh-snapshots/route.ts', 'utf8');
const job = fs.readFileSync('src/server/jobs/refresh-snapshots.ts', 'utf8');
ok('a rota tem vigia abaixo do maxDuration, desligavel por CRON_WATCHDOG', () => {
  assert.match(rota, /CRON_WATCHDOG/);
  assert.match(rota, /WATCHDOG_MS = \(maxDuration - 30\) \* 1000/);
  assert.match(rota, /stoppedBecause: 'watchdog'/);
  assert.match(rota, /export const maxDuration = 300/);
});
ok('o vigia fecha o registro e libera a trava das vitrines antes de responder', () => {
  const i = rota.indexOf("outcome === 'watchdog'");
  const trecho = rota.slice(i, i + 500);
  assert.match(trecho, /vitrinesLock\?\.release\(\)/);
  assert.match(trecho, /run\.finish\(/);
});
ok('o lote de estatisticas nao comeca se o tempo previsto estoura o orcamento, e e abandonado apos orcamento + folga', () => {
  assert.match(job, /STATS_CHUNK_GUARD/);
  assert.match(job, /now - started \+ maxChunkMs > opts\.budgetMs/);
  assert.match(job, /STATS_CHUNK_GRACE_MS/);
  assert.match(job, /prepMs/);
});
ok('orcamento do cron de estatisticas (120 s) + folga (45 s) + vigia (270 s) cabem no teto de 300 s', () => {
  assert.match(rota, /part === 'stats' \? 120_000/);
  assert.ok(120_000 + 45_000 < (300 - 30) * 1000);
});
console.log(`\n${n} testes ok`);
