// Testes do dead-man dos loops do Chrome (#113 passo 7). Rodar: npx tsx --test scripts/test-chrome-loops-deadman.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { evalChromeLoops, formatAlertMessage, planNotifications, type HealthInput } from '../src/lib/collector-runs/health-eval';

const now = new Date('2026-11-15T15:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const input = (cup: number | null, mll: number | null, amza: number | null): HealthInput => ({
  now, runs: [], volumeSeries: [], dayClose: null,
  chromeLoops: [
    { job: 'cupons-batimento', lastAt: cup == null ? null : ago(cup) },
    { job: 'ml-links-assistida', lastAt: mll == null ? null : ago(mll) },
    { job: 'amazon-assistida', lastAt: amza == null ? null : ago(amza) },
  ],
});

test('dentro do limiar: nenhum alerta', () => {
  assert.deepEqual(evalChromeLoops(input(20, 30, 60)), []);
});

test('cadencia de 2 em 2 h da amazon-assistida (pausa de ~58-60 min) nao gera falso alarme', () => {
  for (const m of [1, 30, 58, 59, 60, 70, 75]) assert.deepEqual(evalChromeLoops(input(5, 5, m)), [], `amazon ${m} min`);
});

test('estourou: alerta por loop com tempo, hora da ultima gravacao e acao', () => {
  const a = evalChromeLoops(input(90, 5, 130));
  assert.deepEqual(a.map((x) => x.key), ['chrome_loop:cupons-batimento', 'chrome_loop:amazon-assistida']);
  assert.match(a[0].detail, /1\.5 h|90 min/);
  assert.match(a[0].detail, /10:30/); // 15:00Z - 90 min = 13:30Z = 10:30 em Sao Paulo
  assert.match(a[0].detail, /reinjetar/);
  assert.match(a[0].detail, /Espaco Geek 86 - Loops/);
});

test('sem nenhuma gravacao na janela: alerta; sem leitura (regra desligada): silencio', () => {
  assert.equal(evalChromeLoops(input(null, 5, 5)).length, 1);
  assert.deepEqual(evalChromeLoops({ ...input(5, 5, 5), chromeLoops: undefined }), []);
});

test('dedup: 1 alerta por queda; repete so apos o lembrete; recuperou gera 1 aviso de voltou', () => {
  const alerts = evalChromeLoops(input(90, 5, 5));
  // 1a avaliacao: envia
  assert.equal(planNotifications(alerts, [], now).send.length, 1);
  // cron seguinte (30 min depois), ja enviado: nao reenvia
  const sent = [{ key: alerts[0].key, lastSentAt: ago(0), resolvedAt: null }];
  const later = new Date(now.getTime() + 30 * 60_000);
  assert.equal(planNotifications(alerts, sent, later).send.length, 0);
  // 2 h depois ainda caido: lembrete
  assert.equal(planNotifications(alerts, sent, new Date(now.getTime() + 121 * 60_000)).send.length, 1);
  // recuperou
  const back = planNotifications([], sent, later);
  assert.deepEqual(back.resolve, ['chrome_loop:cupons-batimento']);
  assert.match(formatAlertMessage([], back.resolve), /voltou a gravar/);
  // depois de resolvido, nova queda alerta de novo
  const resolved = [{ key: alerts[0].key, lastSentAt: ago(0), resolvedAt: later }];
  assert.equal(planNotifications(alerts, resolved, later).send.length, 1);
});

test('mensagem agrupa varios loops em um unico envio', () => {
  const msg = formatAlertMessage(evalChromeLoops(input(90, 90, 130)), []);
  assert.equal((msg.match(/Loop parado/g) ?? []).length, 3);
});

export {};
