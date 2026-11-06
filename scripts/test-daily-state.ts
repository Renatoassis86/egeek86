/**
 * Teste de tabela das métricas diárias (src/lib/pricing/daily-state.ts). Sem banco.
 * Uso: npx tsx scripts/test-daily-state.ts   (sai com código 1 se algo falhar)
 */
import {
  aggregateOfferDay,
  computeDayState,
  computeLiveMin,
  computeLiveMinFromOffers,
  matchMinEvent,
  computePeriodMetrics,
  collapseMinEventBatches,
  legacyDayState,
  medianCont,
  medianDisc,
  nextMinEvent,
  percentileRank,
  reconstructMinEvents,
  spDay,
  spDayBounds,
  stateWriteAction,
  withTransition,
  type LiveOfferInput,
  type OfferInput,
} from '../src/lib/pricing/daily-state';

let fails = 0;
let total = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  }
}
const close = (a: number | null, b: number, eps = 1e-9) => a != null && Math.abs(a - b) < eps;

const D = '2026-11-02';
const T = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`);
const NOW = T('2026-11-03', '12:00');

function offer(id: string, rows: Array<[string, number, string, number?, number?, number?]>, active = true, store = id): OfferInput {
  return {
    offerId: id,
    storeKey: store,
    active,
    rows: rows.map(([day, median, hhmm, n = 1, min, max]) => ({
      day,
      medianCents: median,
      lastCents: median,
      minCents: min ?? median,
      maxCents: max ?? median,
      nCollected: n,
      lastObservedAt: T(day, hhmm),
    })),
  };
}

// --- 1) oferta coletada 300x pesa igual a coletada 1x ---------------------------------------
{
  const quotes300 = Array.from({ length: 300 }, (_, i) => ({ priceCents: 10_000, at: new Date(T(D, '00:00').getTime() + i * 60_000) }));
  const agg = aggregateOfferDay(quotes300)!;
  check('agg 300x: n=300 mediana=10000', agg.nCollected === 300 && agg.medianCents === 10_000);
  const a: OfferInput = { offerId: 'a', storeKey: 'a', active: true, rows: [{ day: D, ...agg }] };
  const b = offer('b', [[D, 20_000, '10:00']]);
  const c = offer('c', [[D, 15_000, '11:00']]);
  const st = computeDayState(D, NOW, [a, b, c]);
  check('300x vs 1x: média simples = 15000 (cada oferta vale 1)', close(st.avgCents, 15_000), st.avgCents);
  check('300x: n_offers=3, n_quotes=302', st.nOffers === 3 && st.nQuotes === 302, st);
  check('quality complete com 3', st.quality === 'complete');
}

// --- 2) lacuna vira gap; stale não entra ------------------------------------------------------
{
  const gapNone = computeDayState(D, NOW, []);
  check('sem ofertas = gap com nulos', gapNone.quality === 'gap' && gapNone.avgCents == null && gapNone.minCents == null && gapNone.nOffers === 0);
  // última cotação em 2026-11-01 08:00; no fim de 11-02 (23:59) são ~40 h (fresca) => carregada; em 11-03 12:00 são 52 h (stale)
  const o = offer('o', [['2026-11-01', 9_000, '08:00']]);
  const d2 = computeDayState('2026-11-02', NOW, [o]);
  check('carry de 40 h dentro de 48 h: fresca, partial, média nula (n<3)', d2.freshOffers === 1 && d2.quality === 'partial' && d2.avgCents == null && d2.minCents === 9_000, d2);
  const d3 = computeDayState('2026-11-03', NOW, [o]);
  check('52 h: stale, não entra; dia vira gap', d3.freshOffers === 0 && d3.staleOffers === 1 && d3.quality === 'gap' && d3.minCents == null, d3);
  const old = offer('old', [['2026-10-25', 9_000, '08:00']]);
  const d4 = computeDayState('2026-11-03', NOW, [old]);
  check('cotação de 9 dias: nem ativa no dia (stale 0)', d4.freshOffers === 0 && d4.staleOffers === 0 && d4.quality === 'gap', d4);
}

// --- 3) média só com n>=3; min/mediana gravados com n<3 -------------------------------------
{
  const st = computeDayState(D, NOW, [offer('a', [[D, 10_000, '10:00']]), offer('b', [[D, 12_000, '10:00']])]);
  check('n=2: partial, avg null, min e mediana presentes', st.quality === 'partial' && st.avgCents == null && st.minCents === 10_000 && close(st.medianCents, 11_000), st);
}

// --- 4) outlier fora da faixa (35% .. 3x da mediana) ------------------------------------------
{
  const offs = [offer('a', [[D, 10_000, '10:00']]), offer('b', [[D, 10_000, '10:00']]), offer('c', [[D, 10_500, '10:00']]), offer('iscas', [[D, 1_000, '10:00']]), offer('caro', [[D, 40_000, '10:00']])];
  const st = computeDayState(D, NOW, offs);
  check('outlier: 2 fora, 3 dentro', st.outlierOffers === 2 && st.nOffers === 3 && st.freshOffers === 5, st);
  check('outlier: média = 10166,67 e mínimo 10000', close(st.avgCents, 30_500 / 3) && st.minCents === 10_000, st);
  // borda estrita do piso: preço == 35% da mediana não passa
  const edge = computeDayState(D, NOW, [offer('a', [[D, 10_000, '10:00']]), offer('b', [[D, 10_000, '10:00']]), offer('c', [[D, 10_000, '10:00']]), offer('e', [[D, 3_500, '10:00']])]);
  check('piso estrito: 35,00% fora', edge.outlierOffers === 1, edge);
  // mínimo bruto fora da faixa cai para a mediana oferta-dia da própria oferta
  const rawOut = computeDayState(D, NOW, [offer('a', [[D, 10_000, '10:00', 5, 500]]), offer('b', [[D, 10_000, '10:00']]), offer('c', [[D, 10_000, '10:00']])]);
  check('mínimo bruto isca (500) não vira o menor do dia', rawOut.minCents === 10_000, rawOut);
  const rawIn = computeDayState(D, NOW, [offer('a', [[D, 10_000, '10:00', 5, 8_000]]), offer('b', [[D, 10_000, '10:00']]), offer('c', [[D, 10_000, '10:00']])]);
  check('menor do dia = mínimo BRUTO (não a mediana)', rawIn.minCents === 8_000 && rawIn.minOfferId === 'a', rawIn);
}

// --- 5) oferta expirada não reescreve dia fechado nem é carregada ----------------------------
{
  check('dia fechado => skip', stateWriteAction({ closed: true }, '2026-11-02', '2026-11-03').action === 'skip');
  const a = stateWriteAction(null, '2026-11-02', '2026-11-03');
  check('dia anterior sem linha => insert + closed', a.action === 'insert' && a.close);
  const b = stateWriteAction({ closed: false }, '2026-11-03', '2026-11-03');
  check('hoje aberto => update, não fecha', b.action === 'update' && !b.close);
  check('dia futuro => skip', stateWriteAction(null, '2026-11-04', '2026-11-03').action === 'skip');
  // Oferta expirada: tem cotação medida em 11-02 (conta em 11-02), mas em 11-03 (sem cotação) não é carregada.
  const dead = offer('dead', [['2026-11-02', 5_000, '20:00']], false);
  const live = [offer('l1', [['2026-11-02', 10_000, '10:00'], ['2026-11-03', 10_000, '09:00']]), offer('l2', [['2026-11-02', 10_000, '10:00'], ['2026-11-03', 10_000, '09:00']]), offer('l3', [['2026-11-02', 10_000, '10:00'], ['2026-11-03', 10_000, '09:00']])];
  const d2 = computeDayState('2026-11-02', NOW, [dead, ...live]);
  check('expirada conta no PRÓPRIO dia (medição real)', d2.nOffers === 4 && d2.minCents === 5_000, d2);
  const d3 = computeDayState('2026-11-03', NOW, [dead, ...live]);
  check('expirada NÃO é carregada no dia seguinte', d3.nOffers === 3 && d3.minCents === 10_000, d3);
  // dia fechado recalculado depois da expiração: o instante de referência é o fim do dia e a oferta tem medição => mesmo resultado
  const d2again = computeDayState('2026-11-02', new Date(NOW.getTime() + 30 * 86_400_000), [dead, ...live]);
  check('dia fechado recalculado muito depois dá o mesmo resultado', d2again.minCents === d2.minCents && d2again.nOffers === d2.nOffers && d2again.avgCents === d2.avgCents);
}

// --- 6) regime antigo => legacy, sem recalcular --------------------------------------------------
{
  let threw = false;
  try {
    computeDayState('2026-10-30', NOW, []);
  } catch {
    threw = true;
  }
  check('computeDayState recusa dia legacy', threw);
  const l = legacyDayState('2026-10-30', 500, 3);
  check('legacy: só contagem', l.quality === 'legacy' && l.avgCents == null && l.nQuotes === 500 && l.nOffers === 3);
}

// --- 7) dia civil de Brasília -----------------------------------------------------------------
{
  check('02:30Z ainda é o dia anterior em Brasília', spDay(new Date('2026-11-03T02:30:00Z')) === '2026-11-02');
  check('03:00Z já é o dia seguinte', spDay(new Date('2026-11-03T03:00:00Z')) === '2026-11-03');
  const b = spDayBounds('2026-11-03');
  check('limites do dia conferem com Intl', spDay(b.start) === '2026-11-03' && spDay(new Date(b.start.getTime() - 1)) === '2026-11-02' && spDay(new Date(b.end.getTime() - 1)) === '2026-11-03' && spDay(b.end) === '2026-11-04');
}

// --- 8) decomposição: composição x variação das mesmas ofertas ----------------------------------
{
  const d1 = computeDayState('2026-11-01', T('2026-11-02', '12:00'), [offer('A', [['2026-11-01', 10_000, '10:00']]), offer('B', [['2026-11-01', 10_000, '10:00']]), offer('C', [['2026-11-01', 10_000, '10:00']])]);
  // composição: C sai, D (caro) entra; A e B não mudaram
  const d2 = withTransition(computeDayState('2026-11-02', T('2026-11-03', '12:00'), [offer('A', [['2026-11-02', 10_000, '10:00']]), offer('B', [['2026-11-02', 10_000, '10:00']]), offer('D', [['2026-11-02', 28_000, '10:00']])]), d1);
  check('composição: mesmas ofertas 0%, flag verdadeiro', d2.matchedOffers === 2 && close(d2.matchedChangePct, 0) && d2.compositionFlag === true, d2);
  const d2b = withTransition(computeDayState('2026-11-02', T('2026-11-03', '12:00'), [offer('A', [['2026-11-02', 11_000, '10:00']]), offer('B', [['2026-11-02', 11_000, '10:00']]), offer('C', [['2026-11-02', 11_000, '10:00']])]), d1);
  check('variação real: +10% e flag falso', close(d2b.matchedChangePct, 10) && d2b.compositionFlag === false, d2b);
  const d0 = withTransition(computeDayState('2026-11-02', T('2026-11-03', '12:00'), [offer('Z', [['2026-11-02', 10_000, '10:00']])]), d1);
  check('sem ofertas em comum: matched 0, pct nulo', d0.matchedOffers === 0 && d0.matchedChangePct == null);
  check('sem dia anterior: sem transição', withTransition(d1, null).matchedOffers == null);
}

// --- 9) média do período por oferta-dia (não média das médias) ---------------------------------
{
  const m = computePeriodMetrics([
    { day: '2026-11-01', members: { a: 10_000, b: 10_000 }, minCents: 10_000 },
    { day: '2026-11-02', members: { a: 40_000 }, minCents: 40_000 },
  ], 10_000);
  check('pooled = (100+100+400)/3 = 200', close(m.avgOfferDayCents, 20_000), m.avgOfferDayCents);
  check('mediana oferta-dia = 100', close(m.medianOfferDayCents, 10_000));
  check('percentil de 100 nos mínimos {100,400} = 50', close(m.currentPercentileInDailyMins, 50));
  check('inelegível: 2 ofertas, 3 oferta-dias, 2 dias', !m.eligible && m.reasons.length === 3, m.reasons);
  const days = Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(10 + i).padStart(2, '0')}`, members: { a: 100, b: 100, c: 100 }, minCents: 100 }));
  check('elegível: 3 ofertas, 42 oferta-dias, 14 dias', computePeriodMetrics(days, 100).eligible);
}

// --- 10) menor preço do momento e eventos -------------------------------------------------------
{
  const offs = [offer('a', [['2026-11-03', 10_000, '08:00']]), offer('b', [['2026-11-03', 9_000, '09:30']]), offer('c', [['2026-11-03', 11_000, '08:00']]), offer('velha', [['2026-10-30', 100, '08:00']])];
  const live = computeLiveMin(offs, NOW)!;
  check('live min = 9000 da oferta b, ignora velha (stale) e isca', live.minCents === 9_000 && live.offerId === 'b' && live.quality === 'complete', live);
  const e1 = nextMinEvent(null, live, NOW)!;
  check('primeiro evento: prev nulo, instante da cotação', e1.prevMinCents == null && e1.at.getTime() === T('2026-11-03', '09:30').getTime());
  check('sem mudança: nenhum evento', nextMinEvent({ at: e1.at, minCents: 9_000 }, live, NOW) === null);
  const queda = nextMinEvent({ at: T('2026-11-03', '07:00'), minCents: 9_500 }, live, NOW)!;
  check('queda: prev 9500, instante da cotação', queda.prevMinCents === 9_500 && queda.at.getTime() === T('2026-11-03', '09:30').getTime());
  const alta = nextMinEvent({ at: T('2026-11-03', '07:00'), minCents: 8_000 }, live, NOW)!;
  check('alta: instante da detecção', alta.minCents === 9_000 && alta.at.getTime() === NOW.getTime());
  check('sem oferta viva: sem evento (lacuna)', nextMinEvent({ at: T('2026-11-03', '07:00'), minCents: 8_000 }, computeLiveMin([], NOW), NOW) === null);
  check('oferta inativa não define menor preço', computeLiveMin([offer('x', [['2026-11-03', 100, '10:00']], false)], NOW) === null);
}
{
  const ms = (d: string, h: string) => T(d, h);
  const recon = reconstructMinEvents(
    [
      { offerId: 'a', active: true, snaps: [{ at: ms('2026-11-01', '08:00'), priceCents: 10_000 }, { at: ms('2026-11-01', '20:00'), priceCents: 9_000 }] },
      { offerId: 'b', active: true, snaps: [{ at: ms('2026-11-01', '09:00'), priceCents: 9_500 }, { at: ms('2026-11-02', '09:00'), priceCents: 12_000 }] },
      { offerId: 'morta', active: false, snaps: [{ at: ms('2026-11-01', '10:00'), priceCents: 8_000 }] },
    ],
    ms('2026-11-01', '00:00'),
  );
  // 08:00: só a (10000); 09:00: b 9500 -> min 9500; 10:00: morta 8000 (viva no instante da última cotação) -> 8000;
  // 20:00: a=9000, morta (sem cotação posterior, inativa) fora -> min 9000 (alta); 11-02 09:00: a 9000 (13 h) -> segue 9000, sem evento
  const mins = recon.map((e) => e.minCents);
  check('reconstrução: 10000, 9500, 8000, 9000', JSON.stringify(mins) === JSON.stringify([10_000, 9_500, 8_000, 9_000]), mins);
  check('reconstrução: prev encadeado', recon[1].prevMinCents === 10_000 && recon[3].prevMinCents === 8_000);
  check('reconstrução: expirada não ressuscita', !recon.some((e, i) => i > 2 && e.minCents === 8_000));
}

// --- 12) preço vivo lido do cadastro (sem job sombra) e casamento do evento pelo id da oferta -------
{
  const now = new Date('2026-11-05T15:00:00Z');
  const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
  const lo = (id: string, price: number, q: number | null, c: number | null): LiveOfferInput => ({ offerId: id, priceCents: price, quotedAt: q == null ? null : h(q), checkedAt: c == null ? null : h(c) });
  const l = computeLiveMinFromOffers([lo('a', 30_000, 2, 2), lo('b', 12_000, 3, 5), lo('c', 25_000, 1, 1)], now)!;
  check('vivo: menor preço do cadastro (120) e a oferta que o detém', l.minCents === 12_000 && l.offerId === 'b');
  check('vivo: verificado = last_checked_at da oferta que detém (5 h)', l.checkedAt.getTime() === h(5).getTime());
  check('vivo: cotação = instante da última cotação (3 h)', l.observedAt.getTime() === h(3).getTime() && l.freshOffers === 3 && l.tiedAtMin === 1);
  check('vivo: cotação > 48 h fora, mesmo checada agora', computeLiveMinFromOffers([lo('a', 100, 49, 1), lo('b', 500, 1, 1)], now)!.offerId === 'b');
  check('vivo: checagem > 48 h fora, mesmo com cotação recente', computeLiveMinFromOffers([lo('a', 100, 1, 49), lo('b', 500, 1, 1)], now)!.offerId === 'b');
  check('vivo: sem cotação ou sem checagem => fora (nunca inventa)', computeLiveMinFromOffers([lo('a', 100, null, 1), lo('b', 100, 1, null)], now) === null);
  check('vivo: sem oferta fresca => null (sem dado)', computeLiveMinFromOffers([], now) === null && computeLiveMinFromOffers([lo('a', 100, 60, 60)], now) === null);
  check('vivo: preço 0 não vale', computeLiveMinFromOffers([lo('a', 0, 1, 1)], now) === null);
  const tie = computeLiveMinFromOffers([lo('z', 10_000, 1, 1), lo('m', 10_000, 2, 2), lo('x', 20_000, 1, 1)], now)!;
  check('vivo: empate no menor preço é contado e listado', tie.tiedAtMin === 2 && tie.tiedOfferIds.join() === 'm,z' && tie.offerId === 'm', tie);
  const out = computeLiveMinFromOffers([lo('a', 100, 1, 1), lo('b', 10_000, 1, 1), lo('c', 10_500, 1, 1), lo('d', 11_000, 1, 1)], now)!;
  check('vivo: com 3+ ofertas a faixa plausível (35%) tira o outlier de preço baixo', out.minCents === 10_000, out);

  const liveTie = { minCents: 10_000, offerId: 'm', tiedOfferIds: ['m', 'z'] };
  const m1 = matchMinEvent({ minCents: 10_000, offerId: 'z' }, liveTie);
  check('evento: com id, vale a oferta do EVENTO entre as empatadas (loja do evento)', m1.matched && m1.storeOfferId === 'z', m1);
  const m2 = matchMinEvent({ minCents: 10_000, offerId: 'outra' }, liveTie);
  check('evento: id de oferta que não detém o preço agora => não casa (mesmo valor)', !m2.matched && m2.storeOfferId === null, m2);
  const m3 = matchMinEvent({ minCents: 10_000, offerId: null }, liveTie);
  check('evento sem id + empate de preço: casa pelo valor mas NÃO afirma a loja', m3.matched && m3.storeOfferId === null, m3);
  const m4 = matchMinEvent({ minCents: 10_000, offerId: null }, { minCents: 10_000, offerId: 'm', tiedOfferIds: ['m'] });
  check('evento sem id, sem empate: cai no valor e a loja é a do preço agora', m4.matched && m4.storeOfferId === 'm', m4);
  check('evento: valor diferente não casa', !matchMinEvent({ minCents: 9_000, offerId: 'm' }, liveTie).matched);
  check('evento/vivo ausentes não casam', !matchMinEvent(null, liveTie).matched && !matchMinEvent({ minCents: 1, offerId: 'm' }, null).matched);
}

// --- 13) reconstrução: agrupamento de instantes próximos (estado final do lote) -----------------------
{
  const at = (iso: string) => new Date(iso);
  const S = (iso: string, priceCents: number) => ({ at: at(iso), priceCents });
  const base = at('2026-11-05T09:00:00Z');
  const sig = (evs: Array<{ at: Date; minCents: number; prevMinCents: number | null; offerId: string }>) => evs.map((e) => `${e.at.toISOString()}|${e.minCents}|${e.prevMinCents}|${e.offerId}`);
  const chainOk = (evs: Array<{ minCents: number; prevMinCents: number | null }>) => evs.every((e, i) => e.prevMinCents === (i === 0 ? null : evs[i - 1].minCents)) && evs.every((e, i) => i === 0 || e.minCents !== evs[i - 1].minCents);

  // A: 30000 às 10:00; no lote A grava 26558 (.552) e regrava 26899 (.854). B: 27000 fixo.
  const mk = (aSnaps: Array<{ at: Date; priceCents: number }>, bSnaps: Array<{ at: Date; priceCents: number }>) => [
    { offerId: 'A', active: true, snaps: aSnaps },
    { offerId: 'B', active: true, snaps: bSnaps },
  ];
  const A1 = [S('2026-11-05T10:00:00Z', 30_000), S('2026-11-05T17:45:03.552Z', 26_558), S('2026-11-05T17:45:03.854Z', 26_899)];
  const B1 = [S('2026-11-05T10:00:00Z', 27_000), S('2026-11-05T17:45:03.600Z', 27_000)];

  // (a) lote transitório colapsado: antes 2 eventos (26558 e 26899), agora 1 (26899 às .854)
  const old = reconstructMinEvents(mk(A1, B1), base, { windowMs: 0 });
  const novo = reconstructMinEvents(mk(A1, B1), base, { windowMs: 2000 });
  check('janela 0 = comportamento antigo (evento transitório 26558 existe)', old.some((e) => e.minCents === 26_558), sig(old));
  check('lote transitório colapsado: só o estado final 26899 às .854, prev 27000', JSON.stringify(sig(novo.slice(1))) === JSON.stringify(['2026-11-05T17:45:03.854Z|26899|27000|A']), sig(novo));
  check('padrão (RECON_BATCH_WINDOW_MS) = janela 2000', JSON.stringify(sig(reconstructMinEvents(mk(A1, B1), base))) === JSON.stringify(sig(novo)));
  check('cadeia prev_min_cents íntegra (lote colapsado)', chainOk(novo) && chainOk(old), { novo: sig(novo) });

  // (b) transitório que volta ao valor anterior: nenhum evento no lote
  const A2 = [S('2026-11-05T10:00:00Z', 30_000), S('2026-11-05T17:45:03.552Z', 26_558), S('2026-11-05T17:45:03.854Z', 30_000)];
  const dip = reconstructMinEvents(mk(A2, B1), base);
  check('dip que volta ao mínimo anterior (27000 de B) não gera evento', dip.length === 1 && dip[0].minCents === 27_000, sig(dip));

  // (c) troca legítima: A cai para 26558 e FICA; B regrava depois dentro do lote -> evento preservado com horário da queda
  const A3 = [S('2026-11-05T10:00:00Z', 30_000), S('2026-11-05T17:45:03.552Z', 26_558)];
  const legit = reconstructMinEvents(mk(A3, B1), base);
  check('troca legítima preservada no instante em que o valor final foi atingido (.552)', JSON.stringify(sig(legit.slice(1))) === JSON.stringify(['2026-11-05T17:45:03.552Z|26558|27000|A']), sig(legit));
  // troca legítima fora da janela (5 s depois) continua evento próprio
  const A4 = [...A1.slice(0, 2), S('2026-11-05T17:45:08.900Z', 26_899)];
  const sep = reconstructMinEvents(mk(A4, B1), base);
  check('mudanças separadas por mais que a janela seguem separadas (26558 e depois 26899)', sep.map((e) => e.minCents).join() === '27000,26558,26899' && chainOk(sep), sig(sep));
  // janela maior colapsa; menor não
  check('janela 5 s NÃO colapsa o par distante 5,348 s (3 eventos)', reconstructMinEvents(mk(A4, B1), base, { windowMs: 5000 }).length === 3);
  check('janela 6 s colapsa o par', reconstructMinEvents(mk(A4, B1), base, { windowMs: 6000 }).map((e) => e.minCents).join() === '27000,26899');

  // (d) ordem de gravação invertida: ofertas e snaps em ordem diferente (ids/gravação) dão o mesmo resultado
  const rev = reconstructMinEvents(mk(A1, B1).reverse().map((o) => ({ ...o, snaps: [...o.snaps] })), base);
  check('ordem do array de ofertas não muda o resultado', JSON.stringify(sig(rev)) === JSON.stringify(sig(novo)), { rev: sig(rev), novo: sig(novo) });
  // gravação invertida dentro do lote: o preço menor é gravado POR ÚLTIMO e vira o estado final
  const Ainv = [S('2026-11-05T10:00:00Z', 30_000), S('2026-11-05T17:45:03.552Z', 29_000), S('2026-11-05T17:45:03.854Z', 26_000)];
  const inv = reconstructMinEvents(mk(Ainv, B1), base);
  check('gravação invertida: estado final 26000 às .854, sem evento 27000->29000', inv.map((e) => e.minCents).join() === '27000,26000' && inv[1].at.toISOString() === '2026-11-05T17:45:03.854Z', sig(inv));

  // (e) empate de ofertas no estado final: menor offerId vence; sem evento novo se o valor não mudou
  const T1 = [{ offerId: 'z', active: true, snaps: [S('2026-11-05T17:45:03.100Z', 20_000), S('2026-11-05T17:45:03.900Z', 19_000)] }, { offerId: 'm', active: true, snaps: [S('2026-11-05T17:45:03.500Z', 19_000)] }];
  const tie = reconstructMinEvents(T1, base);
  check('empate no estado final: oferta de menor id (m) e um único evento 19000', tie.length === 1 && tie[0].offerId === 'm' && tie[0].minCents === 19_000, sig(tie));
  check('empate: instante = .500 (m já detinha 19000; z empata em .900 mas m segue o detentor)', tie[0].at.toISOString() === '2026-11-05T17:45:03.500Z', sig(tie));

  // (f) lote que cruza a meia-noite local (00:00 -03:00 = 03:00Z): o lote é dividido; o estado final de cada dia é preservado
  const mid = reconstructMinEvents(
    [
      { offerId: 'A', active: true, snaps: [S('2026-11-06T02:59:59.500Z', 10_000), S('2026-11-06T03:00:00.300Z', 12_000)] },
      { offerId: 'B', active: true, snaps: [S('2026-11-06T02:00:00Z', 11_000), S('2026-11-06T03:00:00.300Z', 11_000)] },
    ],
    at('2026-11-06T00:00:00Z'),
  );
  check('meia-noite: dia 05 termina em 10000 (A) e o dia 06 começa com 11000 (B), dois eventos distintos', mid.map((e) => e.minCents).join() === '11000,10000,11000' && mid[1].at.toISOString() === '2026-11-06T02:59:59.500Z' && mid[2].at.toISOString() === '2026-11-06T03:00:00.300Z', sig(mid));
  check('meia-noite: cadeia íntegra', chainOk(mid));

  // (g) sem ofertas/sem estado: nada; lacuna no fim do lote não vira evento; idempotente
  check('sem ofertas: nenhum evento', reconstructMinEvents([], base).length === 0);
  check('idempotente (mesma entrada, mesma saída)', JSON.stringify(sig(reconstructMinEvents(mk(A1, B1), base))) === JSON.stringify(sig(novo)));
}

// --- 14) colapso de eventos JÁ gravados (subtração pura, mesma regra de lote) ----------------------------
{
  const ev = (id: number, iso: string, minCents: number) => ({ id, at: new Date(iso), minCents });
  const ids = (l: Array<{ id: number }>) => l.map((e) => e.id).join();
  // transitório 26558 -> 26899 (300 ms): fica só o final
  const c1 = collapseMinEventBatches([ev(1, '2026-11-05T10:00:00Z', 27_000), ev(2, '2026-11-05T17:45:03.552Z', 26_558), ev(3, '2026-11-05T17:45:03.854Z', 26_899)], 2000);
  check('colapso: mantém 1 e 3, descarta o transitório 2', ids(c1.kept) === '1,3' && ids(c1.dropped) === '2', c1);
  // pisca e volta (27000 -> 26558 -> 27000 em 0,3 s): lote inteiro descartado
  const c2 = collapseMinEventBatches([ev(1, '2026-11-05T10:00:00Z', 27_000), ev(2, '2026-11-05T17:45:03.552Z', 26_558), ev(3, '2026-11-05T17:45:03.854Z', 27_000)], 2000);
  check('colapso: round-trip do lote some inteiro', ids(c2.kept) === '1' && ids(c2.dropped) === '2,3', c2);
  // troca legítima (muda e fica; próximo evento 5 s depois): ambos preservados
  const c3 = collapseMinEventBatches([ev(1, '2026-11-05T10:00:00Z', 27_000), ev(2, '2026-11-05T17:45:03.552Z', 26_558), ev(3, '2026-11-05T17:45:08.900Z', 26_000)], 2000);
  check('colapso: mudanças separadas por > janela ficam', ids(c3.kept) === '1,2,3' && c3.dropped.length === 0, c3);
  // âncora fixa: cadeia de eventos a 1,5 s um do outro NÃO vira um lote só
  const c4 = collapseMinEventBatches([ev(1, '2026-11-05T10:00:00.000Z', 100), ev(2, '2026-11-05T10:00:01.500Z', 90), ev(3, '2026-11-05T10:00:03.000Z', 80), ev(4, '2026-11-05T10:00:04.500Z', 70)], 2000);
  check('colapso: âncora fixa (1,5 s encadeado não funde tudo)', ids(c4.kept) === '2,4' && ids(c4.dropped) === '1,3', c4);
  // meia-noite local: lote não cruza o dia (02:59:59.5Z = 23:59:59.5 de 05; 03:00:00.3Z = 00:00:00.3 de 06)
  const c5 = collapseMinEventBatches([ev(1, '2026-11-06T02:00:00Z', 11_000), ev(2, '2026-11-06T02:59:59.500Z', 10_000), ev(3, '2026-11-06T03:00:00.300Z', 11_000)], 2000);
  check('colapso: meia-noite divide o lote (os três ficam)', ids(c5.kept) === '1,2,3', c5);
  check('colapso: janela 0 não descarta nada (exceto repetição de valor)', collapseMinEventBatches([ev(1, '2026-11-05T10:00:00Z', 1), ev(2, '2026-11-05T10:00:00.1Z', 2)], 0).kept.length === 2);
  check('colapso: idempotente', (() => { const k = collapseMinEventBatches([ev(1, '2026-11-05T10:00:00Z', 27_000), ev(2, '2026-11-05T17:45:03.552Z', 26_558), ev(3, '2026-11-05T17:45:03.854Z', 26_899)]).kept; return collapseMinEventBatches(k).dropped.length === 0; })());
}

// --- 11) estatística básica --------------------------------------------------------------------
check('medianDisc par = inferior', medianDisc([1, 2, 3, 4]) === 2);
check('medianCont par = média dos centrais', medianCont([1, 2, 3, 4]) === 2.5);
check('percentil', percentileRank(3, [1, 2, 3, 4]) === 75 && percentileRank(1, []) === null);

console.log(fails ? `${fails} de ${total} verificações FALHARAM` : `OK: ${total} verificações`);
process.exit(fails ? 1 : 0);
