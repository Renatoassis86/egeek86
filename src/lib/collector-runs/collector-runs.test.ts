// Testes dos modulos puros da observabilidade do coletor. Rodar: npm run test:collector
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCollectorError, classifyShopeeKind } from './classify-error';
import { evalDayClose, evalDeadMan, evalOldestDue, evalRates, evalVolumeDrop, planNotifications, type RunRow } from './health-eval';

const now = new Date('2026-11-06T12:00:00Z'); // 09:00 em Sao Paulo
const min = (n: number) => new Date(now.getTime() - n * 60_000);

function run(over: Partial<RunRow> & { startedAgoMin: number }): RunRow {
  const { startedAgoMin, ...rest } = over;
  const startedAt = min(startedAgoMin);
  return {
    job: 'collect-prices',
    network: 'mercado-livre',
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 60_000),
    status: 'ok',
    checked: 100,
    errors: 0,
    rateLimited: 0,
    misses: 5,
    oldestDueAgeS: 3600,
    ...rest,
  };
}
const base = { now, volumeSeries: [], dayClose: null };

test('classifica erros do Mercado Livre', () => {
  assert.equal(classifyCollectorError('Mercado Livre API indisponivel: /products/{id}/items HTTP 429'), 'http_429');
  assert.equal(classifyCollectorError('x HTTP 503; y'), 'http_5xx');
  assert.equal(classifyCollectorError('x HTTP 403'), 'auth');
  assert.equal(classifyCollectorError('x HTTP 400'), 'http_4xx');
  assert.equal(classifyCollectorError('/products/{id}/items rede: fetch failed'), 'network');
  assert.equal(classifyCollectorError('HTTP 500; HTTP 429'), 'http_429');
  assert.equal(classifyCollectorError('algo estranho'), 'other');
  assert.equal(classifyShopeeKind('rate_limit'), 'http_429');
  assert.equal(classifyShopeeKind('access'), 'auth');
});

test('dead-man: silencio acima do limite alerta; execucao recente nao', () => {
  const ok = [run({ startedAgoMin: 6 }), run({ job: 'collect-shopee', network: 'shopee', startedAgoMin: 12 })];
  assert.equal(evalDeadMan({ ...base, runs: ok }).length, 0);
  const old = [run({ startedAgoMin: 40 }), run({ job: 'collect-shopee', network: 'shopee', startedAgoMin: 12 })];
  const a = evalDeadMan({ ...base, runs: old });
  assert.equal(a.length, 1);
  assert.equal(a[0].key, 'dead_man:mercado-livre');
});

test('dead-man: execucao abandonada (running) nao conta como viva', () => {
  const runs = [
    run({ startedAgoMin: 8, finishedAt: null, status: 'running' }),
    run({ startedAgoMin: 30 }),
    run({ job: 'collect-shopee', network: 'shopee', startedAgoMin: 5 }),
  ];
  const a = evalDeadMan({ ...base, runs });
  assert.equal(a.length, 1);
  assert.match(a[0].detail, /abandonada/);
});

test('dead-man: sem nenhuma execucao alerta as duas redes', () => {
  assert.equal(evalDeadMan({ ...base, runs: [] }).length, 2);
});

test('idade da oferta devida mais velha > 6 h', () => {
  assert.equal(evalOldestDue({ ...base, runs: [run({ startedAgoMin: 5, oldestDueAgeS: 7 * 3600 })] }).length, 1);
  assert.equal(evalOldestDue({ ...base, runs: [run({ startedAgoMin: 5, oldestDueAgeS: 5 * 3600 })] }).length, 0);
});

test('taxas: sem linha de base usa limiar absoluto; poucas consultas nao alertam', () => {
  const bad = [run({ startedAgoMin: 10, checked: 60, errors: 40 })];
  assert.equal(evalRates({ ...base, runs: bad }).some((a) => a.key.startsWith('error_rate')), true);
  const few = [run({ startedAgoMin: 10, checked: 5, errors: 5 })];
  assert.equal(evalRates({ ...base, runs: few }).length, 0);
});

test('taxas: 429 exige contagem minima e aponta para nao subir cadencia', () => {
  const rl = [run({ startedAgoMin: 10, checked: 90, errors: 10, rateLimited: 10 })];
  const a = evalRates({ ...base, runs: rl }).find((x) => x.key.startsWith('rate_429'));
  assert.ok(a);
  assert.equal(a.severity, 'critical');
  const one = [run({ startedAgoMin: 10, checked: 90, errors: 1, rateLimited: 1 })];
  assert.equal(evalRates({ ...base, runs: one }).some((x) => x.key.startsWith('rate_429')), false);
});

test('taxas: com linha de base saudavel, taxa normal nao alerta e salto alerta', () => {
  const history: RunRow[] = [];
  for (let h = 2; h < 60; h++) history.push(run({ startedAgoMin: h * 60 + 30, checked: 100, errors: 2, misses: 10 }));
  const normal = [...history, run({ startedAgoMin: 10, checked: 100, errors: 2, misses: 10 })];
  assert.equal(evalRates({ ...base, runs: normal }).length, 0);
  const jump = [...history, run({ startedAgoMin: 10, checked: 100, errors: 20, misses: 10 })];
  assert.equal(evalRates({ ...base, runs: jump }).some((x) => x.key.startsWith('error_rate')), true);
});

test('queda de volume > 30% contra a mediana dos 7 dias; baseline curta nao alerta', () => {
  const H = 3_600_000;
  const pts = (cur: number, prior: number) => {
    const out: { hour: Date; n: number }[] = [];
    for (let d = 0; d <= 7; d++) for (let h = 1; h <= 6; h++) out.push({ hour: new Date(now.getTime() - d * 24 * H - h * H + 1), n: d === 0 ? cur : prior });
    return out;
  };
  assert.equal(evalVolumeDrop({ ...base, runs: [], volumeSeries: [{ name: 'cotacoes', points: pts(10, 100) }] }).length, 1);
  assert.equal(evalVolumeDrop({ ...base, runs: [], volumeSeries: [{ name: 'cotacoes', points: pts(80, 100) }] }).length, 0);
  assert.equal(evalVolumeDrop({ ...base, runs: [], volumeSeries: [{ name: 'cotacoes', points: pts(0, 1) }] }).length, 0);
});

test('fechamento do dia: so apos 01:00 SP, e so se aberto ou ausente', () => {
  const dc = { day: '2026-11-05', rowsTotal: 100, rowsOpen: 3 };
  assert.equal(evalDayClose({ ...base, runs: [], dayClose: dc }).length, 1);
  assert.equal(evalDayClose({ ...base, runs: [], dayClose: { ...dc, rowsOpen: 0 } }).length, 0);
  assert.equal(evalDayClose({ ...base, runs: [], dayClose: { ...dc, rowsTotal: 0, rowsOpen: 0 } }).length, 1);
  assert.equal(evalDayClose({ ...base, runs: [], dayClose: null }).length, 0);
  const early = new Date('2026-11-06T03:30:00Z'); // 00:30 SP
  assert.equal(evalDayClose({ ...base, now: early, runs: [], dayClose: dc }).length, 0);
});

test('notificacoes: dedup, repeticao em 6 h e resolucao', () => {
  const al = { key: 'dead_man:shopee', severity: 'critical' as const, title: 't', detail: 'd' };
  assert.equal(planNotifications([al], [], now).send.length, 1);
  const recent = [{ key: al.key, lastSentAt: min(30), resolvedAt: null }];
  assert.equal(planNotifications([al], recent, now).send.length, 0);
  const old = [{ key: al.key, lastSentAt: min(7 * 60), resolvedAt: null }];
  assert.equal(planNotifications([al], old, now).send.length, 1);
  assert.deepEqual(planNotifications([], recent, now).resolve, [al.key]);
});

import { capMeta, deriveRunStatus } from './run-status';

test('status da execucao', () => {
  const b = { queries: 10, checked: 10, errors: 0, stoppedBecause: null, budgetExhausted: false };
  assert.equal(deriveRunStatus(b), 'ok');
  assert.equal(deriveRunStatus({ ...b, errors: 2, checked: 8 }), 'ok');
  assert.equal(deriveRunStatus({ ...b, checked: 0, errors: 10 }), 'error');
  assert.equal(deriveRunStatus({ ...b, budgetExhausted: true }), 'partial');
  assert.equal(deriveRunStatus({ ...b, stoppedBecause: 'falhas_seguidas' }), 'partial');
  assert.equal(deriveRunStatus({ ...b, fatal: true }), 'error');
  assert.equal(deriveRunStatus({ queries: 0, checked: 0, errors: 0, stoppedBecause: null, budgetExhausted: false }), 'ok');
});

test('meta e limitado', () => {
  assert.deepEqual(capMeta({ a: 1 }), { a: 1 });
  assert.equal(capMeta(undefined), null);
  const big = capMeta({ x: 'y'.repeat(5000) });
  assert.equal(big?.truncated, true);
});
