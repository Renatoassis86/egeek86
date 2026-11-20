// E5 (#146, R-90): a coleta da Shopee cobre TODA vertical com oferta Shopee (antes só Games; o esporte chegou a 92 h sem leitura),
// sem crons paralelos (a API da Shopee limita por app): rodízio 1 em 3 ticks dentro do cron único.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERTICAIS_SHOPEE_OUTRAS, fatiaOutras, verticalDoTick } from '../src/lib/catalog/vertical/shopee-rodizio';

const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
const shopee = cfg.crons.filter((c) => c.path.startsWith('/api/cron/collect-shopee'));
assert.equal(shopee.length, 1, 'um único cron collect-shopee (sem disputa pela cota da API)');
assert.equal(shopee[0].schedule, '*/5 * * * *');

assert.equal(fatiaOutras({}), 3);
assert.equal(fatiaOutras({ COLLECT_SHOPEE_FATIA_OUTRAS: '0' }), 0);
assert.equal(fatiaOutras({ COLLECT_SHOPEE_FATIA_OUTRAS: 'x' }), 3);
assert.equal(verticalDoTick(new Date(), { COLLECT_SHOPEE_FATIA_OUTRAS: '0' }), null, 'desligado = só Games');

// Simula 6 horas de ticks de 5 min: 1/3 vai para fora de Games e todas as verticais aparecem em rodízio.
const t0 = Date.UTC(2026, 10, 17, 0, 0, 0);
const cont = new Map<string, number>();
let fora = 0;
const total = 72; // 6 h: com 7 verticais fora de Games cada uma aparece >= 3 vezes
for (let i = 0; i < total; i++) {
  const v = verticalDoTick(new Date(t0 + i * 300_000), {});
  if (v) { fora++; cont.set(v, (cont.get(v) ?? 0) + 1); }
}
assert.equal(fora, total / 3, '1 em cada 3 ticks');
for (const v of VERTICAIS_SHOPEE_OUTRAS) assert.ok((cont.get(v) ?? 0) >= 3, `rodízio visita ${v}`);
// Games nunca fica mais de 2 ticks seguidos sem rodar (>= 2 em cada 3).
let seqFora = 0, maxSeq = 0;
for (let i = 0; i < total; i++) { if (verticalDoTick(new Date(t0 + i * 300_000), {})) { seqFora++; maxSeq = Math.max(maxSeq, seqFora); } else seqFora = 0; }
assert.equal(maxSeq, 1, 'nunca dois ticks seguidos fora de Games');

const route = fs.readFileSync('src/app/api/cron/collect-shopee/route.ts', 'utf8');
assert.ok(route.includes("isVertical(v) && v !== 'games'") && route.includes('verticalDoTick(new Date())'), 'rota usa o rodízio e valida a vertical');
console.log('test-cobertura-shopee-r90: OK');
