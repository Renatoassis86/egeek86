// 2026-11-18: um 400 transitorio do Telegram (upload da foto) pausou a automacao inteira por ~25 min. Agora volta para a fila e so falha do BOT/CANAL pausa.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const send = fs.readFileSync('src/lib/messaging/telegram-send.ts', 'utf8');
assert.ok(/status === 400 && \/internal server error\|file upload/.test(send), '400 de upload/erro interno do Telegram e retryable');
assert.ok(send.indexOf('internal server error|file upload') < send.indexOf('400 (chat not found'), 'a excecao vem ANTES da regra dos 4xx definitivos');
const q = fs.readFileSync('src/server/messaging/group-queue.ts', 'utf8');
assert.ok(q.includes('const fatalDoBot') && q.includes('if (fatalDoBot) await setAutomationState'), 'so pausa a automacao quando o problema e do bot/canal');
assert.ok(!/retryable === false\) \{[\s\S]{0,400}\n\s*await setAutomationState\('off'/.test(q), 'nao ha pausa incondicional');
console.log('test-envio-falha-transitoria: OK');
