// E5 (#146, R-90): a coleta da Shopee cobre TODA vertical que tem oferta Shopee (antes só Games; o esporte chegou a 92 h sem leitura).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
const paths = cfg.crons.map((c) => c.path);
assert.ok(paths.includes('/api/cron/collect-shopee'), 'fila gamer continua');
for (const v of ['esporte', 'eletrodomesticos', 'tecnologia', 'eletroeletronicos', 'impressao3d']) {
  assert.ok(paths.includes(`/api/cron/collect-shopee?v=${v}`), `collect-shopee agendado para ${v}`);
}
// Escalonamento: nenhum minuto de partida se repete entre os ticks da Shopee de verticais diferentes.
const mins = cfg.crons.filter((c) => c.path.startsWith('/api/cron/collect-shopee?v=')).map((c) => c.schedule.split(' ')[0].split('-')[0]);
assert.equal(new Set(mins).size, mins.length, 'minutos de partida distintos');
// A rota aceita a vertical (e recusa games/inexistente).
const route = fs.readFileSync('src/app/api/cron/collect-shopee/route.ts', 'utf8');
assert.ok(route.includes("isVertical(v) && v !== 'games'"), 'rota valida a vertical');
console.log('test-cobertura-shopee-r90: OK');

