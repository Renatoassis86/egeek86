// R-103: detecção e envio em invocações próprias (dono, 2026-11-18: aumentar o fluxo de envio; envios falhavam aos 30 s com o pool ocupado pela detecção).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
const g = cfg.crons.filter((c) => c.path.startsWith('/api/cron/group-messages'));
assert.ok(g.some((c) => c.path === '/api/cron/group-messages' && c.schedule === '* * * * *'), 'detecção a cada minuto');
assert.ok(g.some((c) => c.path === '/api/cron/group-messages?fase=envio' && c.schedule === '* * * * *'), 'envio a cada minuto, em invocação própria');
const auto = fs.readFileSync('src/server/messaging/group-auto.ts', 'utf8');
assert.ok(auto.includes("deps.fase === 'envio'") && auto.includes("deps.fase === 'deteccao'"), 'o ciclo conhece as duas fases');
assert.ok(auto.includes("state !== 'shadow' && !semEnvio"), 'a fase de detecção NÃO envia');
assert.ok(auto.includes('degraded || soEnvio ? { inserted: 0'), 'a fase de envio NÃO grava propostas novas');
assert.ok(auto.includes('SEND_BUDGET_ENVIO_MS') && /SEND_BUDGET_ENVIO_MS = 5\d_000/.test(auto), 'o envio tem orçamento próprio e maior');
const route = fs.readFileSync('src/app/api/cron/group-messages/route.ts', 'utf8');
assert.ok(route.includes("GROUP_FASES") && route.includes("'junto'"), 'GROUP_FASES=junto volta ao ciclo único sem deploy de código');
assert.ok(route.includes("acquireCycleLock(fase === 'envio' ? 'group-messages:envio' : undefined)") || route.includes("group-messages:envio"), 'trava própria do envio');
console.log('test-envio-fases: OK');
