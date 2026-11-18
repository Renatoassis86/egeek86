// Envio por loja (2026-11-18): concorrencia limitada ao pool do banco; sem espera depois de um envio; resultados registrados.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const s = fs.readFileSync('src/server/messaging/group-auto.ts', 'utf8');
assert.ok(s.includes('GROUP_SEND_CONC') && /Number\(process\.env\.GROUP_SEND_CONC\) \|\| 3/.test(s), 'concorrencia padrao 3 (pool do banco na Vercel = 3)');
assert.ok(/Math\.min\(7,/.test(s), 'teto 7');
assert.ok(s.includes('wait && !enviou'), 'depois de enviar, o laco da loja nao espera o proximo intervalo');
assert.ok(s.includes('resultados') && s.includes('temposEnvioS') && s.includes('sendRun: summary.sendRun'), 'resumo do ciclo registra resultados e tempos');
assert.ok(!/await Promise\.all\(\[\.\.\.porLoja\.values\(\)\]\.map/.test(s), 'nao dispara todas as lojas de uma vez');
const reaper = fs.readFileSync('src/server/messaging/reaper-backends.ts', 'utf8');
assert.ok(reaper.includes("application_name = 'egeek-web'") && reaper.includes("wait_event_type = 'Client'") && reaper.includes("'idle in transaction'"), 'reaper so mexe em conexoes orfas do app');
const route = fs.readFileSync('src/app/api/cron/group-messages/route.ts', 'utf8');
assert.ok(route.includes('await encerrarBackendsOrfaos()') && route.indexOf('encerrarBackendsOrfaos()') < route.indexOf("fase(fases, 'ciclo_envio'"), 'o ciclo encerra conexoes orfas antes de enviar');
const q = fs.readFileSync('src/server/messaging/group-queue.ts', 'utf8');
assert.ok(q.includes('g.created_at DESC) AS rn_fair') && q.includes('w.created_at DESC LIMIT'), 'janela da loja: proposta mais NOVA primeiro (a velha expira na revalidacao)');
console.log('test-envio-concorrencia: OK');
