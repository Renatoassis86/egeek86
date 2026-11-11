import { createShopeePacer } from '@/server/collector/shopee-pacing';
let f = 0;
const t = (n: string, ok: boolean, d?: unknown) => { console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(d)); if (!ok) f++; };
(async () => {
  let clock = 1000;
  const waits: number[] = [];
  const p = createShopeePacer(480, () => clock, async (ms) => { waits.push(ms); clock += ms; });
  await p.wait(); await p.wait(); await p.wait();
  t('1ª chamada sem espera; seguintes espaçadas em 480 ms', waits.length === 2 && waits[0] === 480 && waits[1] === 480, waits);
  p.onRateLimit();
  t('após 10030 o espaçamento dobra (960)', p.spacingMs() === 960, p.spacingMs());
  p.onRateLimit(); p.onRateLimit();
  t('espaçamento tem teto de 2000 ms', p.spacingMs() === 2000, p.spacingMs());
  // concorrentes não furam a fila: 4 wait() simultâneos reservam instantes distintos
  clock = 10000; const w2: number[] = [];
  const q = createShopeePacer(500, () => clock, async (ms) => { w2.push(ms); });
  await Promise.all([q.wait(), q.wait(), q.wait(), q.wait()]);
  t('concorrentes recebem instantes crescentes (0,500,1000,1500)', JSON.stringify(w2) === JSON.stringify([500, 1000, 1500]), w2);
  process.exit(f ? 1 : 0);
})();
