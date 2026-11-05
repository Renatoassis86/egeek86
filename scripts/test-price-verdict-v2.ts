/**
 * Teste de tabela da leitura V2 (src/lib/pricing/price-verdict-v2.ts): fato vs mediana das lojas, juízo (desligado por config),
 * MAD, histerese, corroboração, dias medidos, lojas distintas, base de dados e previsão de liberação. Sem banco, sem rede.
 * Uso: npx tsx scripts/test-price-verdict-v2.ts   (sai com código 1 se algo falhar)
 */
import {
  compareToStoresMedian,
  computeDataBase,
  computeJudgement,
  countMeasuredDays,
  decisionSentence,
  formatSignedPercent1,
  periodsCoincide,
  estimateUnlockDay,
  isLowestCorroborated,
  judgementThresholdPercent,
  observedRange,
  periodShortReasons,
  robustDispersion,
  storesToday,
  thresholdExplanation,
  weakSellerNotice,
  JUDGEMENT_LABEL,
  type JudgementInput,
  lastEventSentence,
} from '../src/lib/pricing/price-verdict-v2';
import { computePeriodMetrics } from '../src/lib/pricing/daily-state';
import { LOWS_INCLUDE_WEAK_SELLER, VERDICT_JUDGEMENT_ENABLED } from '../src/lib/pricing/price-metrics-config';

let fails = 0;
let total = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  }
}

// --- padrões de config ---
check('config padrão: vendedor fraco fora', LOWS_INCLUDE_WEAK_SELLER === false);
check('config padrão: juízo DESLIGADO até o backtest', VERDICT_JUDGEMENT_ENABLED === false);

// --- suficiência do período ---
check('elegível no limite (3/5/14)', periodShortReasons({ distinctOffers: 3, offerDays: 5, spanDays: 14 }).length === 0);
check('2 ofertas => ofertas_distintas', periodShortReasons({ distinctOffers: 2, offerDays: 20, spanDays: 20 }).join() === 'ofertas_distintas');
check('4 oferta-dias => oferta_dias', periodShortReasons({ distinctOffers: 4, offerDays: 4, spanDays: 20 }).join() === 'oferta_dias');
check('13 dias => historico_dias', periodShortReasons({ distinctOffers: 4, offerDays: 20, spanDays: 13 }).join() === 'historico_dias');
check('3 motivos juntos', periodShortReasons({ distinctOffers: 1, offerDays: 1, spanDays: 1 }).join() === 'ofertas_distintas,oferta_dias,historico_dias');
check('motivos = computePeriodMetrics.reasons', (() => {
  const pm = computePeriodMetrics([{ day: '2026-11-01', members: { a: 100, b: 100 }, minCents: 100 }], 100);
  return periodShortReasons({ distinctOffers: pm.distinctOffers, offerDays: pm.offerDays, spanDays: pm.spanDays }).length === pm.reasons.length;
})());

// --- lojas distintas (storeKey), não anúncios; mediana das lojas hoje ---
{
  const s = storesToday([
    { storeKey: 'A', priceCents: 10_000 },
    { storeKey: 'A', priceCents: 9_000 }, // mesma loja, 2 anúncios: conta 1 loja, vale o menor
    { storeKey: 'B', priceCents: 12_000 },
    { storeKey: 'C', priceCents: 14_000 },
  ]);
  check('lojas distintas: 3 lojas (não 4 anúncios)', s.storeCount === 3, s);
  check('menor preço por loja', s.storePrices.join() === '9000,12000,14000', s.storePrices);
  check('mediana das lojas (por loja)', s.medianCents === 12_000, s.medianCents);
  const one = storesToday([{ storeKey: 'A', priceCents: 10_000 }, { storeKey: 'A', priceCents: 11_000 }]);
  check('1 loja com 2 anúncios: 1 loja, sem mediana', one.storeCount === 1 && one.medianCents === null, one);
  const two = storesToday([{ storeKey: 'A', priceCents: 10_000 }, { storeKey: 'B', priceCents: 12_000 }]);
  check('2 lojas: sem mediana (exige 3 lojas distintas)', two.storeCount === 2 && two.medianCents === null, two);
  check('preço 0 ignorado', storesToday([{ storeKey: 'A', priceCents: 0 }]).storeCount === 0);
}

// --- fato: preço agora vs mediana das lojas (percentual inteiro) ---
check('comparação: 12% abaixo', compareToStoresMedian(8_800, 10_000)?.percent === -12);
check('comparação: arredonda para inteiro (-9,8 => -10)', compareToStoresMedian(9_020, 10_000)?.percent === -10);
check('comparação: igual', compareToStoresMedian(10_000, 10_000)?.direction === 'equal');
check('comparação: acima', compareToStoresMedian(11_000, 10_000)?.direction === 'above');
check('comparação sem mediana => null', compareToStoresMedian(10_000, null) === null);
const cB = { percent: -12, exactPercent: -12, direction: 'below' as const };
check('frase: abaixo', decisionSentence(cB, 4) === '12% abaixo da mediana das lojas hoje.');
check('frase: acima', decisionSentence({ percent: 7, exactPercent: 7, direction: 'above' }, 4) === '7% acima da mediana das lojas hoje.');
check('frase: igual', decisionSentence({ percent: 0, exactPercent: 0, direction: 'equal' }, 4) === 'Igual à mediana das lojas hoje.');
check('frase: 1 loja explica por quê', /Só uma loja/.test(decisionSentence(null, 1)));
check('frase sem juízo: nunca usa rótulo de juízo', !/usual|normal/i.test(decisionSentence(cB, 4)));
// "igual" só com diferença realmente zero; pequena diferença vira "praticamente igual (-0,5%)"
check('igual: diferença zero', compareToStoresMedian(10_000, 10_000)?.direction === 'equal');
{
  const c = compareToStoresMedian(9_950, 10_000);
  check('quase igual: -0,5% não é "igual"', c?.direction === 'near' && c.exactPercent === -0.5, c);
  check('frase: praticamente igual (-0,5%)', decisionSentence(c, 4) === 'Praticamente igual à mediana das lojas hoje (-0,5%).', decisionSentence(c, 4));
  check('0,4% abaixo também é near', compareToStoresMedian(9_960, 10_000)?.direction === 'near');
  check('1% abaixo já é below', compareToStoresMedian(9_900, 10_000)?.direction === 'below');
  check('formatSignedPercent1', formatSignedPercent1(0.3) === '+0,3%' && formatSignedPercent1(-0.5) === '-0,5%');
}
// Menos de 3 lojas ou vendedor fraco no menor preço: nunca percentual (caso Halo Wars 2: 2 lojas, "43% abaixo")
check('frase: 2 lojas não mostra percentual', /Só 2 lojas/.test(decisionSentence(cB, 2)) && !/12%/.test(decisionSentence(cB, 2)), decisionSentence(cB, 2));
check('frase: vendedor fraco no menor preço não mostra percentual', /baixa reputação/.test(decisionSentence(cB, 4, { weakHolder: true })) && !/12%/.test(decisionSentence(cB, 4, { weakHolder: true })));
{
  const three = storesToday([{ storeKey: 'A', priceCents: 10_000 }, { storeKey: 'B', priceCents: 12_000 }, { storeKey: 'C', priceCents: 14_000 }]);
  check('3 lojas: mediana existe', three.medianCents === 12_000, three);
  const tie = storesToday([{ storeKey: 'A', priceCents: 10_000 }, { storeKey: 'B', priceCents: 10_000 }, { storeKey: 'C', priceCents: 10_000 }]);
  check('empate entre lojas: mediana = preço, comparação igual', compareToStoresMedian(10_000, tie.medianCents)?.direction === 'equal', tie);
}
// períodos: 30d/90d/tudo coincidem quando cobrem os mesmos dias
{
  const r = (covered: number, od: number) => ({ coveredDays: covered, offerDays: od });
  check('períodos coincidem (6 dias em todas as janelas)', periodsCoincide({ d30: r(6, 20), d90: r(6, 20), all: r(6, 20) }));
  check('períodos diferem (40 dias medidos)', !periodsCoincide({ d30: r(30, 90), d90: r(40, 120), all: r(40, 120) }));
  check('sem dado: não colapsa', !periodsCoincide({ d30: null, d90: null, all: null }));
}

// --- MAD e limiar ---
{
  const flat = Array(12).fill(10_000);
  check('MAD de série plana = 0', robustDispersion(flat)?.madCents === 0);
  check('limiar de série plana = piso 5%', judgementThresholdPercent(flat) === 5);
  // mediana 10000; desvios abs ordenados [0,0,0,0,0,500,500,500,500,1000,1000,2000] => mediana dos desvios = (500+500)/2 = 500
  const noisy = [10_000, 10_000, 10_000, 10_000, 10_000, 10_500, 9_500, 10_500, 9_500, 11_000, 9_000, 12_000];
  const d = robustDispersion(noisy);
  check('MAD calculado', d?.medianCents === 10_000 && d.madCents === 500, d);
  check('dispersão relativa = 1,4826 x MAD / mediana', Math.abs((d?.relativePercent ?? 0) - 7.413) < 1e-6, d);
  check('dispersão 7,4% > piso: limiar = 8 (arredonda para cima)', judgementThresholdPercent(noisy) === 8);
  check('dispersão 7,4% com k=0,5 (3,7%) volta ao piso de 5%', judgementThresholdPercent(noisy, 0.5) === 5);
  const wild = [10_000, 14_000, 7_000, 12_500, 8_000, 15_000, 6_500, 11_000, 13_000, 7_500, 9_000, 16_000];
  const wd = robustDispersion(wild);
  check('série volátil: dispersão alta', (wd?.relativePercent ?? 0) > 20, wd);
  check('limiar de série volátil > piso e inteiro', judgementThresholdPercent(wild) > 5 && Number.isInteger(judgementThresholdPercent(wild)));
  check('k maior => limiar maior', judgementThresholdPercent(wild, 2) > judgementThresholdPercent(wild, 1));
  check('k menor mantém o piso', judgementThresholdPercent(wild, 0) === 5);
  check('série vazia => piso', judgementThresholdPercent([]) === 5);
  check('texto do limiar: piso', /Limiar de 5%/.test(thresholdExplanation(5)));
  check('texto do limiar: ampliado', /oscila mais/.test(thresholdExplanation(12)));
}

// --- dias medidos com n >= 3 lojas ---
{
  const days = Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, nStores: i < 10 ? 3 : 2 }));
  check('10 de 14 dias com 3+ lojas', countMeasuredDays(days, '2026-11-14', 14, 3) === 10);
  check('dia com 2 lojas não conta', countMeasuredDays(days, '2026-11-14', 14, 2) === 14);
  check('janela de 14 dias corta o mais antigo', countMeasuredDays([{ day: '2026-10-31', nStores: 5 }, ...days], '2026-11-14', 14, 3) === 10);
  check('dia depois do último não conta', countMeasuredDays([{ day: '2026-11-15', nStores: 5 }], '2026-11-14', 14, 3) === 0);
}

// --- juízo ---
const series = [10_000, 10_200, 9_900, 10_100, 10_000, 9_800, 10_300, 10_000, 10_100, 9_900, 10_000, 10_200]; // 12 dias, mediana 10.000
const jb: JudgementInput = {
  currentCents: 10_000,
  dailyMinsCents: series,
  measuredDays: 12,
  previousKind: null,
  currentHolderIsWeak: false,
  weakIncludedInLows: false,
  corroborated: true,
};
const j = (o: Partial<JudgementInput>) => computeJudgement({ ...jb, ...o });
check('rótulos: exatamente 3 níveis', Object.keys(JUDGEMENT_LABEL).join() === 'below,normal,above');
check('rótulos em português', JUDGEMENT_LABEL.below.label === 'Abaixo do usual' && JUDGEMENT_LABEL.normal.label === 'Preço normal' && JUDGEMENT_LABEL.above.label === 'Acima do usual');
check('sem preço atual => sem juízo', j({ currentCents: null }).reasons.includes('sem_preco_atual') && !j({ currentCents: null }).ready);
check('9 dias medidos => sem juízo', j({ measuredDays: 9 }).reasons.includes('dias_medidos'));
check('10 dias medidos => juízo', j({ measuredDays: 10 }).ready);
check('série curta (9 dias) => sem juízo', j({ dailyMinsCents: series.slice(0, 9) }).reasons.includes('serie_curta'));
check('sem juízo: nada preenchido', (() => { const r = j({ measuredDays: 3 }); return r.kind === null && r.deltaPercent === null && r.label === null && !r.lowestPeriod; })());
check('mediana exata => Preço normal', j({ currentCents: 10_000 }).kind === 'normal');
check('-5% exato (limiar 5) => Abaixo do usual', j({ currentCents: 9_500 }).kind === 'below');
check('-4% => Preço normal', j({ currentCents: 9_600 }).kind === 'normal');
check('+5% => Acima do usual', j({ currentCents: 10_500 }).kind === 'above');
check('+4% => Preço normal', j({ currentCents: 10_400 }).kind === 'normal');
check('percentual inteiro', Number.isInteger(j({ currentCents: 9_333 }).deltaPercent as number) && j({ currentCents: 9_333 }).deltaPercent === -7);
check('limiar inteiro exposto', j({}).thresholdPercent === 5);
{
  // série volátil: -8% já é normal porque o limiar é maior que 8
  const wild = [10_000, 14_000, 7_000, 12_500, 8_000, 15_000, 6_500, 11_000, 13_000, 7_500, 9_000, 16_000];
  const r = computeJudgement({ ...jb, dailyMinsCents: wild, currentCents: 9_000 });
  check('série volátil: limiar maior que o piso e -8% é normal', (r.thresholdPercent ?? 0) > 8 && r.kind === 'normal', r);
}
// histerese
check('histerese: sem estado anterior, -4% é normal', j({ currentCents: 9_600, previousKind: null }).kind === 'normal');
check('histerese: já estava abaixo, -4% permanece abaixo', j({ currentCents: 9_600, previousKind: 'below' }).kind === 'below');
check('histerese: já estava abaixo, -3% volta ao normal', j({ currentCents: 9_700, previousKind: 'below' }).kind === 'normal');
check('histerese: já estava acima, +4% permanece acima', j({ currentCents: 10_400, previousKind: 'above' }).kind === 'above');
check('histerese: já estava acima, +3% volta ao normal', j({ currentCents: 10_300, previousKind: 'above' }).kind === 'normal');
check('histerese: estava normal, -4% continua normal (precisa cruzar o limiar cheio)', j({ currentCents: 9_600, previousKind: 'normal' }).kind === 'normal');
check('histerese não impede ir de acima para abaixo', j({ currentCents: 9_000, previousKind: 'above' }).kind === 'below');
// percentil e ranking
{
  const r12 = j({ currentCents: 9_900 });
  check('percentil com 12 dias (>=10): mais barato que % dos dias', r12.cheaperThanPercent != null && r12.lowestOfDays === null, r12);
  const r12b = j({ currentCents: 9_500 });
  check('abaixo de toda a série: mais barato que 100% dos dias', r12b.cheaperThanPercent === 100, r12b);
  const s9 = series.slice(0, 9);
  const r9 = computeJudgement({ ...jb, dailyMinsCents: s9, measuredDays: 10, currentCents: 9_000, minMeasuredDays: 9 });
  check('com < 10 dias de mínimos: sem percentil, "o menor de N dias"', r9.cheaperThanPercent === null && r9.lowestOfDays === 9, r9);
  const r9n = computeJudgement({ ...jb, dailyMinsCents: s9, measuredDays: 10, currentCents: 10_100, minMeasuredDays: 9 });
  check('com < 10 dias e preço não é o menor: sem ranking', r9n.cheaperThanPercent === null && r9n.lowestOfDays === null, r9n);
}
// Menor preço do período e corroboração
check('menor do período: abaixo do usual, <= menor da série, corroborado', j({ currentCents: 9_000 }).lowestPeriod === true);
check('menor do período: SEM corroboração não existe', j({ currentCents: 9_000, corroborated: false }).lowestPeriod === false);
check('menor do período: acima do menor da série não é', j({ currentCents: 9_700 }).lowestPeriod === false);
check('menor do período: vendedor fraco detendo bloqueia', j({ currentCents: 9_000, currentHolderIsWeak: true }).lowestPeriod === false);
check('menor do período: vendedor fraco com config incluindo', j({ currentCents: 9_000, currentHolderIsWeak: true, weakIncludedInLows: true }).lowestPeriod === true);
check('série plana nunca dá menor do período', computeJudgement({ ...jb, dailyMinsCents: Array(12).fill(10_000), currentCents: 10_000 }).lowestPeriod === false);

// corroboração
const cb = { currentCents: 10_000, holderRecheckGapMs: 0, holderLastPrices: [10_000], otherStorePricesCents: [] as number[] };
check('corroboração: sozinho e sem reconfirmação => não', isLowestCorroborated(cb) === false);
check('corroboração: 2 coletas seguidas no mesmo preço', isLowestCorroborated({ ...cb, holderLastPrices: [10_000, 10_000] }) === true);
check('corroboração: 2 coletas, preços diferentes => não', isLowestCorroborated({ ...cb, holderLastPrices: [10_000, 12_000] }) === false);
check('corroboração: checagem posterior >= 30 min', isLowestCorroborated({ ...cb, holderRecheckGapMs: 31 * 60_000 }) === true);
check('corroboração: checagem posterior < 30 min => não', isLowestCorroborated({ ...cb, holderRecheckGapMs: 10 * 60_000 }) === false);
check('corroboração: 2ª loja a +10% exato', isLowestCorroborated({ ...cb, otherStorePricesCents: [11_000] }) === true);
check('corroboração: 2ª loja a +10,1% => não', isLowestCorroborated({ ...cb, otherStorePricesCents: [11_010] }) === false);
check('corroboração: 2ª loja abaixo do preço agora não corrobora (nem existe)', isLowestCorroborated({ ...cb, otherStorePricesCents: [9_000] }) === false);
check('corroboração: sem dado de checagem => não', isLowestCorroborated({ ...cb, holderRecheckGapMs: null }) === false);

// --- base de dados (substitui confiança) ---
check('base: sem preço => none', computeDataBase({ hasCurrent: false, measuredDays30: 30, storesToday: 5, freshOffers: 8 }) === 'none');
check('base: 2 lojas => pequena', computeDataBase({ hasCurrent: true, measuredDays30: 30, storesToday: 2, freshOffers: 8 }) === 'small');
check('base: 6 dias medidos => pequena', computeDataBase({ hasCurrent: true, measuredDays30: 6, storesToday: 4, freshOffers: 8 }) === 'small');
check('base: 7 dias, 3 lojas => média', computeDataBase({ hasCurrent: true, measuredDays30: 7, storesToday: 3, freshOffers: 3 }) === 'medium');
check('base: 20 dias, 3 lojas, 5 ofertas => ampla', computeDataBase({ hasCurrent: true, measuredDays30: 20, storesToday: 3, freshOffers: 5 }) === 'large');
check('base: 20 dias mas 4 ofertas => média', computeDataBase({ hasCurrent: true, measuredDays30: 20, storesToday: 3, freshOffers: 4 }) === 'medium');
{
  const r = observedRange([10_000, 9_000, 12_000]);
  check('faixa observada', r?.minCents === 9_000 && r.maxCents === 12_000 && r.days === 3, r);
  check('faixa sem dado => null', observedRange([]) === null);
}

// --- liberação estimada do veredito ---
check('liberação: 6 de 10, hoje qualifica => hoje + 3 dias', estimateUnlockDay({ measuredDays: 6, today: '2026-11-10', qualifiesToday: true }) === '2026-11-13');
check('liberação: falta 1 => hoje', estimateUnlockDay({ measuredDays: 9, today: '2026-11-10', qualifiesToday: true }) === '2026-11-10');
check('liberação: hoje não qualifica (poucas lojas) => sem data', estimateUnlockDay({ measuredDays: 6, today: '2026-11-10', qualifiesToday: false }) === null);
check('liberação: já liberado => sem data', estimateUnlockDay({ measuredDays: 10, today: '2026-11-10', qualifiesToday: true }) === null);

// --- aviso de vendedor fraco: só com dado e quando a regra de fato mudou um mínimo ---
const wn = { nowCents: 12_000, low30Cents: 30_000, weakExcluded: true, weakChangedLows: true };
check('aviso: agora < menor30d e regra mudou o mínimo => destacado', weakSellerNotice(wn) === 'prominent');
check('aviso: regra não mudou nenhum mínimo => sem aviso', weakSellerNotice({ ...wn, weakChangedLows: false }) === 'none');
check('aviso: regra desligada => sem aviso', weakSellerNotice({ ...wn, weakExcluded: false }) === 'none');
check('aviso: agora >= menor30d => rodapé', weakSellerNotice({ ...wn, nowCents: 30_000 }) === 'footer');
check('aviso: sem preço agora => rodapé', weakSellerNotice({ ...wn, nowCents: null }) === 'footer');
check('aviso: sem menor30d => rodapé', weakSellerNotice({ ...wn, low30Cents: null }) === 'footer');

console.log(fails === 0 ? `OK: ${total} verificações` : `${fails} de ${total} falharam`);
// --- frase do último evento (topo do bloco V2) ---
{
  const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
  check('último evento: com anterior e loja', lastEventSentence({ cents: 27990, prevCents: 29990, store: 'Mercado Livre' }, '04/11 10:30', brl) === 'Último evento do menor preço: R$ 279,90 em 04/11 10:30 (Mercado Livre), antes R$ 299,90.');
  check('último evento: primeiro registro sem loja', lastEventSentence({ cents: 27990, prevCents: null, store: null }, '04/11 10:30', brl) === 'Último evento do menor preço: R$ 279,90 em 04/11 10:30 (primeiro registro).');
}

process.exit(fails === 0 ? 0 : 1);
