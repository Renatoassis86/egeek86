/**
 * Teste da preparação dos dados do gráfico V2 (src/lib/pricing/chart-model.ts). Sem banco, sem rede.
 * Uso: npx tsx scripts/test-chart-model.ts   (sai com código 1 se algo falhar)
 */
import { MIN_DROP_MARKER_PERCENT, isRelevantDrop, buildChartModel, compressSteps, computePeriodRef, pickLabelSlot, polylineHits, readAt, type ChartDay, type ChartEvent, type ChartInput, type PeriodRef } from '../src/lib/pricing/chart-model';
import { spDayBounds } from '../src/lib/pricing/daily-state';

let fails = 0;
let total = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  }
}

const NOW = new Date('2026-11-05T15:00:00Z').getTime(); // 12:00 em Brasília
const at = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00-03:00`).toISOString();
const noRef: PeriodRef = { avgCents: null, medianCents: null, offerDays: 0, distinctOffers: 0, coveredDays: 0, windowDays: null, showable: false };
const refs = { '1D': noRef, '1S': noRef, '1M': noRef, '3M': noRef, Tudo: noRef };
const day = (d: string, min: number | null, o: Partial<ChartDay> = {}): ChartDay => ({
  day: d, minCents: min, avgCents: min != null ? min + 1000 : null, medianCents: min, nOffers: 4, quality: min != null ? 'complete' : 'gap', anchorAt: null, ...o,
});
const ev = (iso: string, min: number, prev: number | null, store = 'Loja A', weak = false): ChartEvent => ({ at: iso, minCents: min, prevMinCents: prev, store, weak });
const mk = (days: ChartDay[], events: ChartEvent[], lastQuoteAt: string | null = new Date(NOW - 3_600_000).toISOString(), legacyDays = 0): ChartInput => ({ days, events, lastQuoteAt, refs, legacyDays });

// --- média HISTÓRICA = soma dos oferta-dias / nº de oferta-dias (não a média das médias diárias) ---
{
  const r = computePeriodRef(
    [
      { day: '2026-11-01', members: { a: 10_000, b: 10_000, c: 10_000 }, minCents: 10_000 },
      { day: '2026-11-02', members: { a: 20_000 }, minCents: 20_000 },
    ],
    30
  );
  check('média histórica = soma/oferta-dias (125,00, não 150,00)', r.avgCents === 12_500, r.avgCents);
  check('mediana dos oferta-dias', r.medianCents === 10_000, r.medianCents);
  check('contagens', r.offerDays === 4 && r.distinctOffers === 3 && r.coveredDays === 2 && r.windowDays === 30);
  check('3 ofertas distintas => mostrável', r.showable === true);
  const r2 = computePeriodRef([{ day: '2026-11-01', members: { a: 10_000, b: 12_000 }, minCents: 10_000 }], 7);
  check('2 ofertas distintas => não mostrável', r2.showable === false);
  const r0 = computePeriodRef([], 7);
  check('sem dado => null, sem inventar', r0.avgCents === null && r0.medianCents === null && r0.showable === false);
}

// --- lacuna quebra a linha: dias 01-03 medidos, 04 gap, 05 medido ---
{
  const days = [day('2026-11-01', 10_000), day('2026-11-02', 10_000), day('2026-11-03', 9_000), day('2026-11-04', null), day('2026-11-05', 9_500)];
  const events = [ev(at('2026-11-01', '09:00'), 10_000, null), ev(at('2026-11-03', '14:00'), 9_000, 10_000), ev(at('2026-11-05', '08:00'), 9_500, 9_000)];
  const m = buildChartModel(mk(days, events), 'Tudo', NOW);
  check('2 segmentos (lacuna do dia 04)', m.segments.length === 2, m.segments.length);
  const gapStart = spDayBounds('2026-11-04').start.getTime();
  const gapEnd = spDayBounds('2026-11-04').end.getTime();
  const crosses = m.segments.some((s) => s.some((p, i) => i > 0 && s[i - 1].t < gapStart && p.t >= gapEnd));
  check('nenhum segmento atravessa a lacuna', !crosses);
  check('nenhum ponto dentro do dia da lacuna', m.segments.every((s) => s.every((p) => p.t <= gapStart || p.t >= gapEnd)));
  const real = new Set(events.map((e) => e.minCents));
  check('só valores reais nos degraus', m.segments.every((s) => s.every((p) => real.has(p.v))));
  check('queda marcada só onde min < anterior', m.drops.length === 1 && m.drops[0].v === 9_000 && m.drops[0].prev === 10_000, m.drops);
  check('alta (9.000 -> 9.500) não vira marcador de queda', !m.drops.some((d) => d.v === 9_500));
  const rd = readAt(m, gapStart + 3_600_000);
  check('leitura na lacuna: sem medição, sem valor', rd.minCents === null && rd.avgState === 'none' && rd.nOffers === null, rd);
  const r3 = readAt(m, new Date(at('2026-11-02', '12:00')).getTime());
  check('leitura no degrau: valor e loja do evento', r3.minCents === 10_000 && r3.store === 'Loja A', r3);
  check('degrau no instante real do evento', m.segments[0].some((p) => p.t === new Date(at('2026-11-03', '14:00')).getTime() && p.v === 9_000));
  check('eventos listados (todas as mudanças), mais recente primeiro', m.events.length === 3 && m.events[0].minCents === 9_500);
}

// --- sem cotação recente (> 48 h): tracejado, não vira medição ---
{
  const days = [day('2026-11-01', 10_000), day('2026-11-02', 10_000)];
  const events = [ev(at('2026-11-01', '09:00'), 10_000, null)];
  const lastQ = new Date(at('2026-11-02', '10:00')).getTime(); // há 74 h
  const m = buildChartModel(mk(days, events, new Date(lastQ).toISOString()), 'Tudo', NOW);
  check('há trecho sem dado recente', m.stale != null && m.stale.v === 10_000);
  const lastSeg = m.segments[m.segments.length - 1];
  const lastEnd = lastSeg[lastSeg.length - 1].t;
  check('linha medida termina no teto de 48 h', lastEnd <= lastQ + 48 * 3_600_000, lastEnd);
  check('tracejado vai até agora', m.stale != null && m.stale.t1 === NOW && m.stale.t0 === lastEnd);
  const rd = readAt(m, NOW - 3_600_000);
  check('leitura no tracejado marcada como sem cotação recente', rd.stale === true && rd.minCents === 10_000, rd);
  const fresh = buildChartModel(mk([day('2026-11-05', 10_000)], [ev(at('2026-11-05', '09:00'), 10_000, null)]), 'Tudo', NOW);
  const fs = fresh.segments[0];
  check('dado fresco: sem tracejado e linha até agora', fresh.stale === null && fs[fs.length - 1].t === NOW);
  const none = buildChartModel(mk([], [], null), 'Tudo', NOW);
  check('sem dado: sem segmento, sem eixo', none.segments.length === 0 && none.y === null && none.level === 'none');
}

// --- média do dia só com 3+ ofertas e quebra em dia faltante ---
{
  const days = [
    day('2026-11-01', 10_000, { nOffers: 5 }),
    day('2026-11-02', 10_000, { nOffers: 2, quality: 'partial', avgCents: null }),
    day('2026-11-03', 10_000, { nOffers: 3 }),
    day('2026-11-04', 10_000, { nOffers: 3 }),
  ];
  const m = buildChartModel(mk(days, [ev(at('2026-11-01', '09:00'), 10_000, null)]), 'Tudo', NOW);
  const pts = m.avgSegments.flat();
  check('nenhum ponto de média com n < 3', pts.every((p) => p.n >= 3) && pts.length === 3, pts);
  check('média do dia quebra no dia com 2 ofertas (2 segmentos)', m.avgSegments.length === 2, m.avgSegments.length);
  const r2 = readAt(m, new Date(at('2026-11-02', '12:00')).getTime());
  check('leitura do dia parcial: menos de 3 ofertas, mostra contagem real', r2.avgState === 'few' && r2.avgCents === null && r2.nOffers === 2, r2);
  check('leitura do dia completo: n real', readAt(m, new Date(at('2026-11-01', '12:00')).getTime()).nOffers === 5);
}

// --- legado fora, janela, fuso, âncora ---
{
  const days: ChartDay[] = [
    { day: '2026-10-29', minCents: null, avgCents: null, medianCents: null, nOffers: 3, quality: 'legacy', anchorAt: null },
    day('2026-11-01', 10_000),
    day('2026-11-05', 8_000, { anchorAt: at('2026-11-05', '07:30') }),
  ];
  const m = buildChartModel(mk(days, [ev(at('2026-11-01', '09:00'), 10_000, null)], undefined, 1), 'Tudo', NOW);
  check('legado não desenha nada', m.segments.every((s) => s.every((p) => p.t >= spDayBounds('2026-11-01').start.getTime())));
  check('dia 05 sem evento usa âncora medida (valor do estado do dia)', m.segments.some((s) => s[0].v === 8_000 && s[0].t === new Date(at('2026-11-05', '07:30')).getTime()), m.segments);
  const d1 = buildChartModel(mk(days, [ev(at('2026-11-01', '09:00'), 10_000, null)]), '1D', NOW);
  check('1D: janela de 24 h e todos os pontos dentro', d1.t1 - d1.t0 <= 24 * 3_600_000 && d1.segments.every((s) => s.every((p) => p.t >= d1.t0 && p.t <= d1.t1)));
  const lateEv = buildChartModel(mk([day('2026-11-01', 10_000), day('2026-11-02', 9_000)], [ev('2026-11-02T02:30:00Z', 10_000, null), ev(at('2026-11-02', '10:00'), 9_000, 10_000)]), 'Tudo', NOW);
  check('evento 23:30 BRT (02:30Z) cai no dia 01 de Brasília', readAt(lateEv, new Date('2026-11-02T02:40:00Z').getTime()).day === '2026-11-01');
}

// --- eixo Y proporcional, sem piso de R$ 5 ---
{
  const m = buildChartModel(mk([day('2026-11-05', 10_000, { avgCents: null })], [ev(at('2026-11-05', '08:00'), 10_000, null), ev(at('2026-11-05', '10:00'), 10_100, 10_000)]), 'Tudo', NOW);
  const span = 100;
  check('padding = 12% da amplitude (R$ 0,12), não R$ 5', m.y != null && Math.abs(m.y.lo - (10_000 - span * 0.12)) < 1e-6 && Math.abs(m.y.hi - (10_100 + span * 0.12)) < 1e-6, m.y);
  const flat = buildChartModel(mk([day('2026-11-05', 50_000, { avgCents: null })], [ev(at('2026-11-05', '08:00'), 50_000, null)]), 'Tudo', NOW);
  check('série plana: folga de 2% do valor', flat.y != null && Math.abs(flat.y.hi - 51_000) < 1e-6 && Math.abs(flat.y.lo - 49_000) < 1e-6, flat.y);
}

// --- referências históricas entram no eixo e aparecem só se mostráveis ---
{
  const r: PeriodRef = { avgCents: 20_000, medianCents: 18_000, offerDays: 30, distinctOffers: 5, coveredDays: 6, windowDays: 30, showable: true };
  const i = mk([day('2026-11-05', 10_000)], [ev(at('2026-11-05', '08:00'), 10_000, null)]);
  const m = buildChartModel({ ...i, refs: { ...refs, '1M': r } }, '1M', NOW);
  check('linha de média e mediana históricas do período', m.ref?.avgCents === 20_000 && m.ref?.medianCents === 18_000);
  check('eixo cobre as referências', m.y != null && m.y.hi >= 20_000);
  const m2 = buildChartModel({ ...i, refs: { ...refs, '1M': { ...r, showable: false } } }, '1M', NOW);
  check('referência não mostrável fica de fora', m2.ref === null);
  const m3 = buildChartModel({ ...i, refs: { ...refs, '1M': r, '1S': { ...r, avgCents: 15_000 } } }, '1S', NOW);
  check('referência segue o período selecionado', m3.ref?.avgCents === 15_000);
}

// --- níveis de amostra ---
{
  const build = (n: number) => {
    const ds: ChartDay[] = [];
    for (let k = 0; k < n; k++) ds.push(day(`2026-11-${String(5 - (n - 1) + k).padStart(2, '0')}`, 10_000));
    const first = ds[0]?.day ?? '2026-11-05';
    return buildChartModel(mk(ds, [ev(new Date(spDayBounds(first).start.getTime() + 3_600_000).toISOString(), 10_000, null)]), 'Tudo', NOW);
  };
  check('0 dias: none', build(0).level === 'none');
  check('1 dia: single (cartão sem gráfico)', build(1).level === 'single');
  check('2 dias: points (pontos sem linha)', build(2).level === 'points');
  check('5 dias: short (histórico curto)', build(5).level === 'short');
  const ds: ChartDay[] = [];
  for (let k = 1; k <= 8; k++) ds.push(day(`2026-10-${String(22 + k).padStart(2, '0')}`, 10_000));
  const m = buildChartModel(mk(ds, [ev(new Date(spDayBounds('2026-10-23').start.getTime() + 3_600_000).toISOString(), 10_000, null)]), 'Tudo', NOW);
  check('8 dias medidos em 8 dias corridos: full', m.level === 'full', m.level);
}

// --- início da linha: varredura de coleta de 31/10 não vira queda vertical do topo do eixo (Halo Wars 2) ---
{
  const days = [day('2026-10-31', 12_000), day('2026-11-01', 12_000), day('2026-11-02', 12_000)];
  const t300 = '2026-10-31T23:20:15.599Z';
  const t120 = '2026-10-31T23:20:15.817Z';
  const m = buildChartModel(mk(days, [ev(t300, 30_000, null, 'Loja A'), ev(t120, 12_000, 30_000, 'Loja B')]), 'Tudo', NOW);
  const first = m.segments[0][0];
  check('linha começa no primeiro ponto estável (R$ 120), não no R$ 300 do topo', first.v === 12_000, m.segments[0]);
  check('nenhum ponto do segmento em R$ 300', !m.segments.some((s) => s.some((p) => p.v === 30_000)));
  check('eixo não é esticado até R$ 300', m.y != null && m.y.hi < 20_000, m.y);
  check('a queda que abre o segmento não vira marcador', m.drops.length === 0, m.drops);
  const sep = buildChartModel(mk(days, [ev(t300, 30_000, null), ev('2026-10-31T23:50:00.000Z', 12_000, 30_000)]), 'Tudo', NOW);
  check('eventos separados por mais de 10 min continuam: a queda é real', sep.segments[0][0].v === 30_000 && sep.drops.length === 1, sep.segments[0]);
}

// --- leitura: loja pelo ÚLTIMO evento, não por evento antigo de mesmo valor ---
{
  const days = [day('2026-11-01', 10_000), day('2026-11-02', 10_000), day('2026-11-03', 10_000)];
  const evs = [ev(at('2026-11-01', '09:00'), 10_000, null, 'Loja A'), ev(at('2026-11-02', '09:00'), 9_000, 10_000, 'Loja B'), ev(at('2026-11-03', '09:00'), 10_000, 9_000, 'Loja C')];
  const m = buildChartModel(mk(days, evs), 'Tudo', NOW);
  const r = readAt(m, new Date(at('2026-11-04', '09:00')).getTime());
  check('leitura atribui o preço de 100 à Loja C (último evento), não à A', r.minCents === 10_000 && r.store === 'Loja C', r);
}

// --- marcadores só de quedas relevantes (>= 3%) e camadas opcionais ---
{
  check('limiar de marcador = 3%', MIN_DROP_MARKER_PERCENT === 3);
  check('queda de 3,0% é relevante', isRelevantDrop(10_000, 9_700));
  check('queda de 2,9% não é relevante', !isRelevantDrop(10_000, 9_710));
  check('alta não é queda', !isRelevantDrop(10_000, 10_500));
  const days = [day('2026-11-01', 10_000), day('2026-11-02', 10_000), day('2026-11-03', 10_000)];
  const evs = [ev(at('2026-11-01', '09:00'), 10_000, null), ev(at('2026-11-02', '09:00'), 9_800, 10_000), ev(at('2026-11-03', '09:00'), 9_000, 9_800)];
  const m = buildChartModel(mk(days, evs), 'Tudo', NOW);
  check('queda de 2% fica fora dos marcadores, de 8% entra', m.drops.length === 1 && m.drops[0].v === 9_000, m.drops);
  check('a lista de mudanças mantém todas', m.events.length === 3, m.events.length);
  const withAvg = mk([day('2026-11-01', 10_000, { avgCents: 30_000 }), day('2026-11-02', 10_000, { avgCents: 30_000 }), day('2026-11-03', 10_000, { avgCents: 30_000 })], evs);
  const on = buildChartModel(withAvg, 'Tudo', NOW, { avgDay: true, avgHistorical: true });
  const off = buildChartModel(withAvg, 'Tudo', NOW, { avgDay: false, avgHistorical: false });
  check('camada da média do dia desligada não estica o eixo Y', on.y != null && off.y != null && off.y.hi < on.y.hi, { on: on.y, off: off.y });
}

// --- vendedor de baixa reputação: degraus marcados (Halo Wars 2: menor preço de vendedor fraco) ---
{
  const days = [day('2026-11-01', 12_000), day('2026-11-02', 12_000), day('2026-11-03', 30_000)];
  const evs = [ev(at('2026-11-01', '09:00'), 12_000, null, 'Fraco (Mercado Livre)', true), ev(at('2026-11-03', '09:00'), 30_000, 12_000, 'Forte (Amazon)', false)];
  const m = buildChartModel(mk(days, evs), 'Tudo', NOW);
  check('degrau do vendedor fraco marcado, o do forte não', m.weakSteps.length === 1 && m.weakSteps[0].v === 12_000, m.weakSteps);
  check('intervalo do degrau fraco termina na troca', m.weakSteps[0].t1 === new Date(at('2026-11-03', '09:00')).getTime(), m.weakSteps);
  const strong = buildChartModel(mk(days, [ev(at('2026-11-01', '09:00'), 12_000, null)]), 'Tudo', NOW);
  check('sem vendedor fraco: nenhum degrau marcado', strong.weakSteps.length === 0);
}

// --- agregação visual de oscilações rápidas: faixa de valores REAIS, nada inventado ---
{
  const T = 1_000_000_000_000;
  const comb: { t: number; v: number }[] = [];
  for (let i = 0; i < 20; i++) comb.push({ t: T + i * 1_000, v: i % 2 ? 11_000 : 10_000 });
  comb.push({ t: T + 3_600_000, v: 10_500 });
  const xOf = (t: number) => (t - T) / 100_000; // 1 px a cada 100 s: os 20 pontos cabem em < 1 px
  const { line, bands } = compressSteps(comb, xOf, 3);
  check('pente de 20 mudanças vira 1 faixa', bands.length === 1 && bands[0].count === 20 && bands[0].lo === 10_000 && bands[0].hi === 11_000, bands);
  check('a linha tem no máximo 2 pontos do pente + o ponto seguinte', line.length <= 3, line.length);
  check('todo valor da linha existe nos dados (nada inventado)', line.every((p) => comb.some((c) => c.v === p.v && c.t === p.t)), line);
  const sparse = compressSteps([{ t: T, v: 1 }, { t: T + 3_600_000, v: 2 }, { t: T + 7_200_000, v: 3 }], xOf, 3);
  check('pontos espaçados não são agregados', sparse.bands.length === 0 && sparse.line.length === 3);
}

// --- rótulos: escolhe o canto sem cruzar a série ---
{
  const rect = { x0: 10, y0: 10, x1: 80, y1: 22 };
  const crossing = [{ x: 0, y: 16 }, { x: 100, y: 16 }];
  check('polilinha que cruza o retângulo conta amostras', polylineHits(rect, crossing) > 10);
  check('polilinha longe do retângulo: zero', polylineHits(rect, [{ x: 0, y: 100 }, { x: 100, y: 100 }]) === 0);
  const idx = pickLabelSlot([rect, { x0: 10, y0: 40, x1: 80, y1: 52 }], [crossing]);
  check('escolhe o canto livre', idx === 1, idx);
  const idx2 = pickLabelSlot([rect, { x0: 200, y0: 10, x1: 270, y1: 22 }], [], [{ x0: 5, y0: 5, x1: 90, y1: 30 }]);
  check('evita sobrepor outro rótulo', idx2 === 1, idx2);
}

console.log(`${total - fails}/${total} verificações OK`);
if (fails) process.exit(1);
