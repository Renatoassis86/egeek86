/** R-111: equivalencia do memo por hora (collector-health) com a contagem completa. Sem banco. Rodar: npm run test:r111 */
import assert from 'node:assert/strict';
import { floorHour, memoCutoff, memoUsable, mergeHourly, nextMemo, type HourCount } from '../src/lib/collector-runs/hourly-memo';

let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log('ok -', nome); };
const H = 3_600_000;
// "banco": contagem por hora a partir de uma semente fixa (append-only para horas fechadas).
const base = Date.UTC(2026, 10, 1, 0, 0, 0);
const bucket = (t: number) => Math.floor((t - base) / H);
const contagem = (i: number) => 200 + ((i * 7919) % 131);
/** consulta completa de referencia: todas as horas inteiras da janela ate a hora corrente (parcial, so a corrente). */
const completo = (now: Date, dias: number, parcialAgora = 90): HourCount[] => {
  const out: HourCount[] = [];
  for (let t = floorHour(new Date(now.getTime() - dias * 24 * H)).getTime(); t <= floorHour(now).getTime(); t += H) {
    out.push({ h: new Date(t).toISOString(), n: t === floorHour(now).getTime() ? parcialAgora : contagem(bucket(t)) });
  }
  return out;
};
const cauda = (de: string, now: Date, parcialAgora: number): HourCount[] => completo(now, 8, parcialAgora).filter((p) => Date.parse(p.h) >= Date.parse(de));

ok('memo + cauda == consulta completa (varias horas de defasagem)', () => {
  for (const defasHoras of [0, 1, 2, 5, 23]) {
    const t0 = new Date(base + 300 * H + 17 * 60_000);
    const memo = nextMemo(completo(t0, 8), t0, 8);
    const now = new Date(t0.getTime() + defasHoras * H + 11 * 60_000);
    assert.ok(memoUsable(memo, now, 8), `usavel com defasagem ${defasHoras}`);
    const merged = mergeHourly(memo, cauda(memo.through, now, 77), now, 8);
    assert.deepEqual(merged, completo(now, 8, 77), `igual na defasagem ${defasHoras}`);
  }
});
ok('a hora corrente e a anterior (margem) nunca entram no memo', () => {
  const now = new Date(base + 100 * H + 30 * 60_000);
  const memo = nextMemo(completo(now, 8), now, 8);
  assert.equal(memo.through, memoCutoff(now).toISOString());
  assert.ok(memo.points.every((p) => Date.parse(p.h) < Date.parse(memo.through)));
  assert.equal(Date.parse(memo.through), floorHour(now).getTime() - H);
});
ok('cotacao gravada com atraso na hora anterior e capturada (hora dentro da margem vem da cauda)', () => {
  const t0 = new Date(base + 200 * H + 5 * 60_000);
  const memo = nextMemo(completo(t0, 8), t0, 8);
  const now = new Date(t0.getTime() + 2 * H);
  const tail = cauda(memo.through, now, 40).map((p) => (Date.parse(p.h) === floorHour(t0).getTime() ? { ...p, n: p.n + 3 } : p));
  const merged = mergeHourly(memo, tail, now, 8);
  const alvo = merged.find((p) => Date.parse(p.h) === floorHour(t0).getTime())!;
  assert.equal(alvo.n, contagem(bucket(floorHour(t0).getTime())) + 3);
});
ok('memo invalido, no futuro ou velho demais nao e usado', () => {
  const now = new Date(base + 500 * H);
  assert.equal(memoUsable(null, now, 8), false);
  assert.equal(memoUsable({ through: 'lixo', points: [] }, now, 8), false);
  assert.equal(memoUsable({ through: new Date(now.getTime() + H).toISOString(), points: [] }, now, 8), false);
  assert.equal(memoUsable({ through: new Date(now.getTime() - 9 * 24 * H).toISOString(), points: [] }, now, 8), false);
});
ok('janela anda: horas mais velhas que 8 dias saem; o resultado segue igual a completa', () => {
  const t0 = new Date(base + 400 * H + 1000);
  const memo = nextMemo(completo(t0, 8), t0, 8);
  const now = new Date(t0.getTime() + 6 * H);
  assert.deepEqual(mergeHourly(memo, cauda(memo.through, now, 12), now, 8), completo(now, 8, 12));
});
console.log(`\n${n} testes ok`);
