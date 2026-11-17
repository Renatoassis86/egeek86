// #133 (R-86/R-90): invariantes do veredito de compra. "abaixo/em linha/acima do normal" EXIGE média > 0 e preço > 0 e base elegível;
// sem isso é sempre `insufficient` (nunca "compra boa" sem média). Varredura determinística de entradas.
import assert from 'node:assert/strict';
import { computeVerdict, computeLowBadge, INLINE_BAND_PERCENT, MIN_HISTORY_DAYS_FOR_VERDICT, MIN_QUOTES_FOR_VERDICT } from '../src/lib/affiliate/price-verdict';

const precos = [null, undefined, 0, -5, 1, 9900, 10000, 19999, 50000];
const medias = [null, undefined, 0, -1, 1, 10000, 20000, 100000];
const quotes = [0, MIN_QUOTES_FOR_VERDICT - 1, MIN_QUOTES_FOR_VERDICT, 50];
const dias = [0, MIN_HISTORY_DAYS_FOR_VERDICT - 1, MIN_HISTORY_DAYS_FOR_VERDICT, 90];
let n = 0;
for (const currentCents of precos) for (const avgCents of medias) for (const quoteCount of quotes) for (const historyDays of dias) for (const lowConfidence of [false, true]) {
  const v = computeVerdict({ currentCents, avgCents, quoteCount, historyDays, lowConfidence });
  n++;
  const base = !!currentCents && currentCents > 0 && !!avgCents && avgCents > 0 && quoteCount >= MIN_QUOTES_FOR_VERDICT && historyDays >= MIN_HISTORY_DAYS_FOR_VERDICT;
  if (!base) {
    assert.equal(v.kind, 'insufficient', `sem base => insufficient (${currentCents},${avgCents},${quoteCount},${historyDays})`);
    assert.equal(v.deltaPercent, null);
    assert.equal(v.deltaCents, null);
  } else {
    assert.notEqual(v.kind, 'insufficient');
    assert.ok(v.deltaPercent !== null && v.deltaCents !== null, 'veredito com base traz o desvio');
    const pct = ((currentCents! - avgCents!) / avgCents!) * 100;
    if (Math.abs(pct) <= INLINE_BAND_PERCENT) assert.equal(v.kind, 'inline');
    else if (pct < 0) assert.equal(v.kind, lowConfidence ? 'inline' : 'below', 'disperso nunca vira "abaixo"');
    else assert.equal(v.kind, 'above');
  }
}
// Selo de menor preço: nunca sem histórico elegível, nunca bloqueado.
assert.equal(computeLowBadge({ currentCents: 100, lowestCents: 100, quoteCount: 1, historyDays: 1 }), false);
assert.equal(computeLowBadge({ currentCents: 100, lowestCents: 100, quoteCount: 50, historyDays: 90, blocked: true }), false);
assert.equal(computeLowBadge({ currentCents: 100, lowestCents: 100, quoteCount: 50, historyDays: 90 }), true);
assert.equal(computeLowBadge({ currentCents: 120, lowestCents: 100, quoteCount: 50, historyDays: 90 }), false);
console.log(`test-veredito-invariantes-r86: OK (${n} combinações)`);
