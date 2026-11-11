/**
 * Testes do CARTÃO DE HISTÓRICO DE PREÇO (src/lib/pricing/price-card-model.ts + src/server/messaging/price-card.tsx).
 * Parte 1: lógica pura (escala, ticks, truncagem, formatação, elegibilidade, geometria, legenda). Sem banco.
 * Parte 2: contra o banco (SOMENTE LEITURA): gera 3 cartões REAIS, confere assinatura/dimensões do PNG, que a Amazon não entra na série
 *          e que a série recalculada bate com price_daily_state nos produtos sem Amazon. Salva os PNG para inspeção.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-cartao-historico.ts [pasta-de-saida]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import {
  CALLOUT_H,
  CARD_H,
  CARD_MAX_DAYS,
  CARD_MIN_DAYS,
  CARD_W,
  PLOT,
  buildAlt,
  buildCaption,
  buildCardModel,
  cardEligibility,
  formatAxisMoney,
  formatDayShort,
  formatMoney,
  formatPct,
  formatStamp,
  layoutCard,
  niceTicks,
  spreadLabels,
  truncateTitle,
  xTickDays,
  yDomain,
  type CardDay,
  type CardInput,
} from '../src/lib/pricing/price-card-model';

let fails = 0;
let total = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  }
}

const NOW = new Date('2026-11-10T21:00:00-03:00'); // 10/11 21:00 em Brasília
const mkDays = (list: Array<[string, number, boolean?]>): CardDay[] => list.map(([day, minCents, partial]) => ({ day, minCents, partial: partial ?? false }));
const SERIES = mkDays([
  ['2026-10-31', 34900], ['2026-11-01', 34900], ['2026-11-02', 34900], ['2026-11-03', 33697],
  ['2026-11-04', 33490, true], ['2026-11-07', 33490], ['2026-11-08', 31616], ['2026-11-09', 31151], ['2026-11-10', 31151],
]);
const CURRENT = { cents: 31151, confirmedAt: new Date('2026-11-10T20:40:00-03:00'), store: 'Mercado Livre' };
const input = (over: Partial<CardInput> = {}): CardInput => ({ title: 'Ghost of Yotei Complete Edition', platformLabel: 'PlayStation 5', days: SERIES, avgCents: 33000, distinctOffers: 8, current: CURRENT, now: NOW, ...over });

function pure() {
  // Formatação
  check('formatMoney milhar', formatMoney(123456) === 'R$ 1.234,56', formatMoney(123456));
  check('formatMoney centavos', formatMoney(5) === 'R$ 0,05');
  check('formatMoney milhão', formatMoney(123456789) === 'R$ 1.234.567,89');
  check('formatAxisMoney inteiro', formatAxisMoney(30000) === 'R$ 300', formatAxisMoney(30000));
  check('formatAxisMoney quebrado', formatAxisMoney(30050) === 'R$ 300,50');
  check('formatDayShort', formatDayShort('2026-11-03') === '03/11');
  check('formatPct', formatPct(12.34) === '12,3%' && formatPct(0.04) === '0,0%' && formatPct(5) === '5,0%', [formatPct(12.34), formatPct(5)]);
  check('formatStamp Brasília', formatStamp(new Date('2026-11-10T23:41:00Z')) === '10/11 às 20:41', formatStamp(new Date('2026-11-10T23:41:00Z')));
  check('formatStamp meia-noite', formatStamp(new Date('2026-11-11T03:05:00Z')) === '11/11 às 00:05', formatStamp(new Date('2026-11-11T03:05:00Z')));

  // Truncagem
  check('truncate curto intacto', truncateTitle('Zelda', 60) === 'Zelda');
  const long = 'Jogo The Legend Of Zelda Echoes Of Wisdom Nintendo Switch Mídia Física Lacrado Edição Padrão Brasil';
  const t = truncateTitle(long, 60);
  check('truncate respeita limite e reticências', Array.from(t).length <= 60 && t.endsWith('…'), t);
  const body = t.slice(0, -1);
  check('truncate corta em fronteira de palavra', long.startsWith(body) && (long[body.length] === ' '), [t, long[body.length]]);
  check('truncate colapsa espaços', truncateTitle('A   B \n C', 60) === 'A B C');
  const p = truncateTitle('Aaaa bbbb cccc, dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn', 40);
  check('truncate sem pontuação pendurada', !/[\s,.;:\-]…$/.test(p), p);
  check('truncate por ponto de código (sem espaço)', Array.from(truncateTitle('é'.repeat(80), 10)).length === 10);

  // Ticks e escala
  for (const [lo, hi] of [[30000, 35000], [0, 100000], [4990, 5290], [150000, 170000], [1234, 1300]] as Array<[number, number]>) {
    const tk = niceTicks(lo, hi);
    const gaps = tk.slice(1).map((v, i) => v - tk[i]);
    check(`niceTicks ${lo}-${hi} dentro do intervalo`, tk.length >= 2 && tk.every((v) => v >= lo - 1 && v <= hi + 1), tk);
    check(`niceTicks ${lo}-${hi} passo uniforme`, gaps.every((g) => Math.abs(g - gaps[0]) <= 1), tk);
  }
  check('niceTicks sem amplitude', niceTicks(5000, 5000).length === 1);
  const yd = yDomain([34900, 31151, 33000, 31151]);
  check('yDomain cobre todos os valores com folga', !!yd && yd.lo < 31151 && yd.hi > 34900 && yd.lo >= 0, yd);
  check('yDomain não parte do zero e tem rótulos', !!yd && yd.lo > 0 && yd.ticks.length >= 2 && yd.ticks[0] >= yd.lo && yd.ticks[yd.ticks.length - 1] <= yd.hi, yd);
  const yflat = yDomain([10000, 10000]);
  check('yDomain série plana tem amplitude', !!yflat && yflat.hi > yflat.lo, yflat);
  check('yDomain vazio/zero/NaN => null', yDomain([]) === null && yDomain([0, NaN]) === null);
  const xt = xTickDays('2026-10-31', '2026-11-10');
  check('xTickDays máximo 7, começa no 1º dia, crescente', xt.length <= 7 && xt[0] === '2026-10-31' && xt.every((d, i) => i === 0 || d > xt[i - 1]), xt);
  check('xTickDays poucos dias mostra todos', xTickDays('2026-11-01', '2026-11-04').length === 4);
  const sp = spreadLabels([100, 105, 110], 80, 50, 400);
  check('spreadLabels separa', sp[1] - sp[0] >= 80 && sp[2] - sp[1] >= 80, sp);
  const sp2 = spreadLabels([390, 395, 398], 80, 50, 400);
  check('spreadLabels respeita fundo', sp2.every((v) => v <= 400 && v >= 50) && sp2[1] - sp2[0] >= 80 && sp2[2] - sp2[1] >= 80, sp2);
  const sp3 = spreadLabels([300, 100, 200], 40, 0, 500);
  check('spreadLabels devolve na ordem da entrada', sp3[0] === 300 && sp3[1] === 100 && sp3[2] === 200, sp3);

  // Elegibilidade
  check('elegível com 3 dias', cardEligibility(SERIES.slice(0, 3), CURRENT, NOW).ok === true);
  const e2 = cardEligibility(SERIES.slice(0, 2), CURRENT, NOW);
  check('2 dias => dias_insuficientes', !e2.ok && e2.reason === 'dias_insuficientes');
  check('dia repetido conta uma vez', !cardEligibility([SERIES[0], SERIES[0], SERIES[0]], CURRENT, NOW).ok);
  const e3 = cardEligibility(SERIES, null, NOW);
  check('sem preço atual => sem_preco_atual', !e3.ok && e3.reason === 'sem_preco_atual');
  const e4 = cardEligibility(SERIES, { ...CURRENT, confirmedAt: new Date(NOW.getTime() - 7 * 3600_000) }, NOW);
  check('preço atual velho (7 h) => sem_preco_atual', !e4.ok && e4.reason === 'sem_preco_atual');
  check('constante de mínimo de dias é 3', CARD_MIN_DAYS === 3);

  // Modelo
  check('modelo null se inelegível', buildCardModel(input({ days: SERIES.slice(0, 2) })) === null && buildCardModel(input({ current: null })) === null);
  const m = buildCardModel(input());
  check('modelo: menor registrado = menor dia (primeiro a atingir)', !!m && m.record.cents === 31151 && m.record.day === '2026-11-09' && !m.record.fromCurrent, m?.record);
  check('modelo: média e atual', !!m && m.avg?.cents === 33000 && m.current.cents === 31151);
  const mLow = buildCardModel(input({ current: { ...CURRENT, cents: 29990 } }));
  check('atual abaixo do histórico vira o menor (hoje)', !!mLow && mLow.record.cents === 29990 && mLow.record.fromCurrent && mLow.record.day === '2026-11-10');
  check('média some com < 3 ofertas', buildCardModel(input({ distinctOffers: 2 }))?.avg === null);
  check('média some sem valor', buildCardModel(input({ avgCents: null }))?.avg === null);
  const old = mkDays([['2026-06-01', 99900], ...SERIES.map((d): [string, number] => [d.day, d.minCents])]);
  const mOld = buildCardModel(input({ days: old }));
  check('janela máxima descarta dia fora de 90 dias', !!mOld && mOld.firstDay === '2026-10-31' && mOld.nDays === SERIES.length && CARD_MAX_DAYS === 90, mOld?.firstDay);
  check('dia futuro ignorado', buildCardModel(input({ days: [...SERIES, ...mkDays([['2026-11-12', 1000]])] }))?.nDays === SERIES.length);

  // Geometria
  const L = layoutCard(m!);
  check('degraus dentro do gráfico', L.hSegs.every((s) => s.x0 >= PLOT.l - 0.5 && s.x1 <= PLOT.r + 0.5 && s.y >= PLOT.t && s.y <= PLOT.b && s.x1 > s.x0), L.hSegs);
  const hs = (day: string) => L.hSegs[m!.days.findIndex((d) => d.day === day)];
  check('preço maior fica mais alto (y menor)', hs('2026-10-31').y < hs('2026-11-09').y);
  check('mesmo preço, mesmo y', hs('2026-11-09').y === hs('2026-11-10').y);
  check('lacuna 05-06/11 não tem ligação vertical', !L.vSegs.some((v) => v.x > hs('2026-11-04').x1 + 0.5 && v.x < hs('2026-11-07').x0 - 0.5) && !L.vSegs.some((v) => Math.abs(v.x - hs('2026-11-07').x0) < 0.5), L.vSegs);
  check('há ligações verticais entre dias consecutivos que mudam', L.vSegs.some((v) => Math.abs(v.x - hs('2026-11-03').x0) < 0.5));
  check('dia parcial marcado', hs('2026-11-04').partial === true && hs('2026-11-03').partial === false);
  check('atual no fim do eixo X e y coerente', Math.abs(L.current.x - PLOT.r) < 0.5 && Math.abs(L.current.y - hs('2026-11-10').y) < 0.5);
  check('marcador do menor no centro do dia do menor', Math.abs(L.record.x - (hs('2026-11-09').x0 + hs('2026-11-09').x1) / 2) < 0.5);
  check('3 chamadas sem sobreposição', L.callouts.length === 3 && L.callouts.slice().sort((a, b) => a.boxCy - b.boxCy).every((c, i, a) => i === 0 || c.boxCy - a[i - 1].boxCy >= CALLOUT_H), L.callouts.map((c) => c.boxCy));
  check('chamadas dentro da área vertical', L.callouts.every((c) => c.boxCy - CALLOUT_H / 2 >= PLOT.t - 12 && c.boxCy + CALLOUT_H / 2 <= PLOT.b + 12));
  check('2 chamadas sem média', layoutCard(buildCardModel(input({ distinctOffers: 1 }))!).callouts.length === 2);
  check('rótulos Y dentro do gráfico', L.yTicks.every((t) => t.y >= PLOT.t - 0.5 && t.y <= PLOT.b + 0.5));
  check('escala Y linear (marcas igualmente espaçadas em y)', (() => { const ys = L.yTicks.map((t) => t.y); const g = ys.slice(1).map((y, i) => ys[i] - y); return g.every((x) => Math.abs(x - g[0]) < 0.6); })());

  // Legenda e alt
  const cap = buildCaption(m!);
  const lines = cap.split('\n');
  check('legenda tem 3 linhas', lines.length === 3, lines);
  check('legenda: menor registrado com data', lines[0].includes('R$ 311,51') && lines[0].includes('09/11') && lines[0].includes('31/10 a 10/11') && lines[0].includes('9 dias'), lines[0]);
  check('legenda: média', lines[1].includes('R$ 330,00'), lines[1]);
  check('legenda: hoje vs menor e média', lines[2].includes('igual ao menor registrado') && lines[2].includes('5,6% abaixo da média') && lines[2].includes('10/11 às 20:40'), lines[2]);
  check('legenda < 1024', cap.length < 1024);
  const capUp = buildCaption(buildCardModel(input({ current: { ...CURRENT, cents: 32000 } }))!);
  check('legenda: acima do menor', capUp.includes('2,7% acima do menor registrado'), capUp.split('\n')[2]);
  const capNoAvg = buildCaption(buildCardModel(input({ distinctOffers: 1 }))!);
  check('legenda sem média diz que falta base', capNoAvg.split('\n').length === 3 && capNoAvg.includes('ainda sem base'), capNoAvg);
  const capEsc = buildCaption(buildCardModel(input({ current: { ...CURRENT, store: 'A<b>&B' } }))!);
  check('legenda escapa HTML', capEsc.includes('A&lt;b&gt;&amp;B'));
  const banned = /afiliad|de\/por|vai cair|deve cair|tend[eê]ncia|garantid|imperd|corra|previs/i;
  check('legenda e alt sem termos proibidos', !banned.test(cap) && !banned.test(capUp) && !banned.test(capNoAvg) && !banned.test(buildAlt(m!)), cap);
  check('alt informativo', buildAlt(m!).includes('Ghost of Yotei') && buildAlt(m!).includes('R$ 311,51') && buildAlt(m!).includes('PlayStation 5'));
}

function pngDims(buf: Buffer): { w: number; h: number; sig: boolean } {
  const sig = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { sig, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function withDb(outDir: string) {
  const { db } = await import('../src/lib/db');
  const { renderHistoryCard, loadCardInput, loadNonAmazonOffers } = await import('../src/server/messaging/price-card');
  const { computeDayState, spDay, addDays } = await import('../src/lib/pricing/daily-state');
  const now = new Date();
  mkdirSync(outDir, { recursive: true });

  // Candidatos: games com 9+ dias medidos; priorizo (a) com Amazon e Shopee, (b) sem Amazon, (c) variados.
  const cands = await db.execute<Record<string, unknown>>(sql`
    WITH d AS (
      SELECT s.master_product_id mid, count(*) dias, count(DISTINCT s.min_cents) var FROM price_daily_state s
      WHERE s.day >= '2026-10-31' AND s.quality IN ('complete','partial') GROUP BY 1 HAVING count(*) >= 9),
    am AS (SELECT o.master_product_id mid FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE n.slug = 'amazon' AND o.status = 'active' GROUP BY 1),
    sh AS (SELECT o.master_product_id mid FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE n.slug = 'shopee' AND o.status = 'active' GROUP BY 1)
    SELECT m.id, m.name, (am.mid IS NOT NULL) AS amazon, (sh.mid IS NOT NULL) AS shopee
    FROM d JOIN master_products m ON m.id = d.mid LEFT JOIN am ON am.mid = m.id LEFT JOIN sh ON sh.mid = m.id
    WHERE m.vertical = 'games' ORDER BY d.var DESC, d.dias DESC, m.name LIMIT 400`);
  const wantAmazon = cands.filter((c) => c.amazon === true && c.shopee === true);
  const wantPlain = cands.filter((c) => c.amazon === false);
  const rest = cands.filter((c) => c.amazon === true);
  const order = [wantAmazon[0], wantPlain[0], wantAmazon[1] ?? rest[1], ...wantPlain.slice(1, 8), ...rest.slice(0, 12)].filter(Boolean);
  const pick: Array<{ id: string; name: string; amazon: boolean }> = [];
  const rendered: string[] = [];
  for (const c of order) {
    if (rendered.length >= 3) break;
    const id = String(c.id);
    if (pick.some((x) => x.id === id)) continue;
    const t0 = Date.now();
    const card = await renderHistoryCard(id, { now });
    const ms = Date.now() - t0;
    if (!card) continue;
    pick.push({ id, name: String(c.name), amazon: c.amazon === true });
    const dims = pngDims(card.png);
    check(`PNG assinatura (${id})`, dims.sig);
    check(`PNG ${CARD_W}x${CARD_H} (${id})`, dims.w === CARD_W && dims.h === CARD_H, dims);
    check(`PNG entre 5 KB e 10 MB (${id})`, card.png.length < 10 * 1024 * 1024 && card.png.length > 5000, card.png.length);
    check(`legenda 3 linhas (${id})`, card.caption.split('\n').length === 3 && card.caption.length < 1024, card.caption);
    check(`alt preenchido (${id})`, card.alt.length > 20);
    const base = join(outDir, `cartao-${rendered.length + 1}-${id.slice(0, 8)}`);
    writeFileSync(`${base}.png`, card.png);
    writeFileSync(`${base}.legenda.txt`, `${card.caption}\n\nALT: ${card.alt}\n`);
    rendered.push(`${base}.png`);
    console.log(`cartao ${rendered.length}: ${base}.png  (${(card.png.length / 1024).toFixed(0)} KB, ${ms} ms, amazon=${c.amazon}, shopee=${c.shopee}) ${String(c.name).slice(0, 60)}`);
    console.log(card.caption.replace(/<\/?b>/g, ''));
  }
  check('3 cartões reais gerados', rendered.length === 3, rendered.length);

  for (const p of pick) {
    const inp = await loadCardInput(p.id, now);
    check(`entrada carregada (${p.id})`, !!inp && inp.days.length >= CARD_MIN_DAYS);
    if (!inp) continue;
    // Amazon fora: nenhuma oferta usada na série é da Amazon.
    const offers = await loadNonAmazonOffers(p.id, '2026-10-24');
    const amz = await db.execute<Record<string, unknown>>(sql`SELECT o.id FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.master_product_id = ${p.id}::uuid AND n.slug = 'amazon'`);
    const amzIds = new Set(amz.map((r) => String(r.id)));
    check(`nenhuma oferta Amazon nas ofertas da série (${p.id}, ofertas Amazon no produto=${amzIds.size})`, offers.every((o) => !amzIds.has(o.offerId)));
    let leaked = 0;
    for (let d = '2026-10-31'; d <= spDay(now); d = addDays(d, 1)) {
      const st = computeDayState(d, now, offers);
      for (const k of Object.keys(st.members)) if (amzIds.has(k)) leaked++;
    }
    check(`nenhum membro Amazon na média/mínimo (${p.id})`, leaked === 0, leaked);
    // Sem Amazon no produto: a série recalculada tem de bater com price_daily_state nos dias fechados.
    if (!p.amazon) {
      const st = await db.execute<Record<string, unknown>>(sql`SELECT day::text AS day, min_cents FROM price_daily_state WHERE master_product_id = ${p.id}::uuid AND closed = true AND quality IN ('complete','partial') AND day >= '2026-10-31'`);
      const mine = new Map(inp.days.map((d) => [d.day, d.minCents]));
      const diff = st.filter((r) => mine.get(String(r.day)) !== Number(r.min_cents));
      check(`série bate com price_daily_state (${p.id}, ${st.length} dias fechados)`, st.length > 0 && diff.length === 0, diff.slice(0, 3));
    }
    check(`dias desenhados são dias do banco (${p.id})`, inp.days.every((d) => d.minCents > 0 && d.day >= '2026-10-31'));
  }

  // Casos de null
  check('id inexistente => null', (await renderHistoryCard('00000000-0000-4000-8000-000000000000')) === null);
  check('id malformado => null', (await renderHistoryCard('abc; drop table x')) === null);
  if (pick[0]) {
    const two = new Date('2026-11-01T12:00:00-03:00');
    const inp2 = await loadCardInput(pick[0].id, two);
    check('com 2 dias de série (até 01/11) => cartão null', !!inp2 && inp2.days.every((d) => d.day <= '2026-11-01') && buildCardModel({ ...inp2, current: { cents: 1000, confirmedAt: two, store: 'x' } }) === null);
  }
}

async function main() {
  pure();
  const outDir = process.argv[2] ?? 'C:\\Users\\Usuario\\AppData\\Local\\Temp\\claude\\ca796e41c2dd1ba9\\2d5f1fda-9c18-4791-bdfb-30851cbacab9\\scratchpad\\cartoes';
  if (process.env.DATABASE_URL) await withDb(outDir);
  else console.log('sem DATABASE_URL: só a parte pura');
}
main().then(
  () => {
    console.log(fails ? `${fails} FALHA(S) em ${total}` : `OK: ${total} verificações`);
    process.exit(fails ? 1 : 0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
