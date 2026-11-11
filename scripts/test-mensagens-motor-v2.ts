/**
 * Teste do MOTOR DE MENSAGENS v2 (onda 1; ata 2026-11-10): política de classes e tetos, gatilhos por movimento,
 * Amazon, radar, automação (off | shadow | on), freio por inscritos, cupom e envio ao Telegram (silencioso, foto, contagem).
 * Sem banco, sem rede, sem token. Uso: npx tsx scripts/test-mensagens-motor-v2.ts (sai com código 1 se algo falhar).
 * Os preços são valores de teste de funções puras (nenhum dado é gravado nem exibido ao cliente).
 */
import {
  amazonLoopPaused,
  applyLimits,
  cardAllowed,
  classCap,
  composeRadar,
  detectMovement,
  evaluateProductV2,
  isDaytime,
  isNightHour,
  isRadarSlot,
  isSummarySlot,
  judgeOffer,
  productDedupBlock,
  riskAssess,
  soundDecision,
  RULES,
  type Candidate,
  type DayPoint,
  type OfferFact,
  type ProductFacts,
  type SentRecord,
} from '../src/lib/messaging/group-rules';
import { couponUsable, textProblems, withCouponBlock, type CouponInfo } from '../src/lib/messaging/group-messages';
import {
  automationRowValues,
  canAutoSend,
  dispositionOf,
  memberBrake,
  parseAutomation,
  rowStatusFor,
  shouldCountMembers,
} from '../src/lib/messaging/group-automation';
import { getTelegramMemberCount, sendTelegramGroupMessage, type FetchLike } from '../src/lib/messaging/telegram-send';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, extra ?? '');
  }
}
function eq<T>(a: T, b: T, name: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b });
}

const H = 3600_000;
const MIN = 60_000;
const NOW = new Date('2026-11-11T14:00:00Z'); // 11/11 11:00 em Brasília (dia, minuto 0: dentro do slot do radar)
const TODAY = '2026-11-11';
const AD = '#publicidade';
const days = (vals: number[], start = '2026-11-03'): DayPoint[] =>
  vals.map((v, i) => {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { day: d.toISOString().slice(0, 10), minCents: v };
  });

// ---------------------------------------------------------------------------
// 1) Gatilhos por movimento: cada desigualdade nos dois lados
// ---------------------------------------------------------------------------
const flat8 = days([10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]); // 03/11 a 10/11 (9 dias contando hoje)
const kinds = (h: ReturnType<typeof detectMovement>) => h.map((x) => x.kind).join(',');

eq(kinds(detectMovement(flat8, 9500, TODAY)), 'OK1,OK2', 'OK1 e OK2 exatamente em 5,0% abaixo');
eq(kinds(detectMovement(flat8, 9501, TODAY)), '', '9501 (4,99% abaixo) não dispara OK1 nem OK2 nem T2');
ok(detectMovement(flat8, 9500, TODAY)[0].dropPct === 5, 'OK1: dropPct 5,0');
ok(detectMovement(flat8, 9500, TODAY)[0].also.includes('OK2'), 'OK1 lista OK2 em also');
// OK2 sem OK1: o mínimo anterior é MENOR que o de ontem
const dip = days([9000, 9000, 9000, 10000, 10000, 10000, 10000, 10000]); // ref 9000, ontem 10000
eq(kinds(detectMovement(dip, 9500, TODAY)), 'OK2', 'queda de 5% sobre ontem sem novo mínimo = só OK2');
eq(kinds(detectMovement(dip, 9501, TODAY)), '', 'OK2 não dispara com 4,99% sobre ontem');
// OK2 exige o dia anterior na série (lacuna não vira queda)
const gapYesterday = days([9000, 9000, 9000, 10000, 10000, 10000, 10000]); // até 09/11; falta 10/11
eq(kinds(detectMovement(gapYesterday, 9400, TODAY)), '', 'sem ontem na série: OK2 não dispara (lacuna fica lacuna)');
// série curta
const short6 = days([10000, 10000, 10000, 10000, 10000, 10000], '2026-11-05'); // 05 a 10/11 = 6 + hoje = 7 dias
ok(detectMovement(short6, 9000, TODAY).some((h) => h.kind === 'OK1'), 'com 7 dias (6 + hoje) OK1 vale');
const short5 = days([10000, 10000, 10000, 10000, 10000], '2026-11-06'); // 5 + hoje = 6 dias
ok(!detectMovement(short5, 9000, TODAY).some((h) => h.kind === 'OK1' || h.kind === 'OK2'), 'com 6 dias OK1/OK2 não valem');
// T1
const t1ok = days([10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]);
t1ok[6].minCents = 10000; // 09/11 (anteontem)
t1ok[7].minCents = 9900; // 10/11 (ontem)
eq(kinds(detectMovement(t1ok, 9700, TODAY)), 'T1', 'T1: 10000 > 9900 > 9700 (3,0% acumulado)');
ok(detectMovement(t1ok, 9700, TODAY)[0].path?.join() === '10000,9900,9700', 'T1 devolve o caminho anteontem, ontem, hoje');
eq(kinds(detectMovement(t1ok, 9701, TODAY)), '', 'T1: 2,99% acumulado não dispara');
const t1flat = days([10000, 10000, 10000, 10000, 10000, 10000, 9900, 9900]);
eq(kinds(detectMovement(t1flat, 9700, TODAY)), '', 'T1: ontem igual a anteontem não é "caiu dois dias"');
const t1short = days([10000, 10000, 9900], '2026-11-08'); // 08, 09, 10/11 + hoje = 4 dias
eq(kinds(detectMovement(t1short, 9700, TODAY)), 'T1', 'T1 vale com 4 dias de série');
eq(kinds(detectMovement(days([10000, 9900], '2026-11-09'), 9700, TODAY)), '', 'T1 não vale com 3 dias');
// T2
eq(kinds(detectMovement(flat8, 10400, TODAY)), 'T2', 'T2: 4,0% acima do piso dispara');
eq(kinds(detectMovement(flat8, 10401, TODAY)), '', 'T2: 4,01% acima não dispara');
eq(kinds(detectMovement(flat8, 10000, TODAY)), '', 'T2: igual ao piso não é movimento');
eq(kinds(detectMovement(flat8, 9999, TODAY)), '', 'abaixo do piso mas menos de 5%: nada');
ok(Math.abs((detectMovement(flat8, 10300, TODAY)[0].nearPct ?? 0) - 3) < 1e-9, 'T2: nearPct');
eq(kinds(detectMovement([], 9000, TODAY)), '', 'sem série: nenhum gatilho');
eq(kinds(detectMovement(flat8, 0, TODAY)), '', 'preço inválido: nenhum gatilho');
// dias de hoje ou futuros na história são ignorados
eq(kinds(detectMovement([...flat8, { day: TODAY, minCents: 1 }], 10400, TODAY)), 'T2', 'ponto de hoje na história é ignorado');

// ---------------------------------------------------------------------------
// 2) Faixas de risco
// ---------------------------------------------------------------------------
eq(riskAssess(9400, 11500, 6, 11000), { review: [], held: [] }, 'verde: 18% abaixo da média, queda de 6%');
eq(riskAssess(7000, 10000, 10, null).review, [], 'onda 2: exatamente 30% abaixo da média ainda é verde (era 25%)');
ok(riskAssess(6999, 10000, 10, null).review.includes('desconto_acima_de_30pct_da_media'), '30,01% abaixo da média pede aprovação');
ok(riskAssess(9400, null, 31, null).review.includes('queda_acima_de_30pct'), 'queda de 31% pede aprovação');
eq(riskAssess(9400, null, 30, null).review, [], 'queda de exatos 30% é verde');
ok(riskAssess(5499, 10000, 10, null).held.includes('desconto_acima_de_45pct_da_media'), '45,01% abaixo da média fica retido (era 40%)');
eq(riskAssess(5500, 10000, 10, null).held, [], '45% exatos não retém (fica em aprovação)');
ok(riskAssess(5500, 10000, 10, null).review.includes('desconto_acima_de_30pct_da_media'), 'de 30 a 45% pede aprovação');
ok(riskAssess(9000, null, 46, null).held.includes('queda_acima_de_45pct'), 'queda de 46% fica retida');
ok(riskAssess(3499, null, 10, 10000).held.includes('preco_abaixo_de_035x_a_mediana_das_ofertas'), 'preço < 0,35x a mediana fica retido (era 0,5x)');
ok(riskAssess(30001, null, 10, 10000).held.includes('preco_acima_de_3x_a_mediana_das_ofertas'), 'preço > 3x a mediana fica retido (faixa de plausibilidade)');
eq(riskAssess(30000, null, 10, 10000).held, [], '3x a mediana exata não retém');
eq(riskAssess(3500, null, 10, 10000).held, [], '0,35x da mediana exata não retém');
ok(riskAssess(5400, 10000, 31, null).review.length === 0, 'retido não duplica como aprovação');

// ---------------------------------------------------------------------------
// 3) evaluateProductV2: filtros, classes, texto
// ---------------------------------------------------------------------------
function offer(over: Partial<OfferFact> & { offerId: string; priceCents: number }): OfferFact {
  return {
    slug: `slug-${over.offerId}`, title: 'Jogo Tomba Edicao Especial Nintendo Switch Fisico', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
    sellerId: `s-${over.offerId}`, sellerReputation: '5_green', sellerTotalSales: 826,
    confirmedAt: new Date(NOW.getTime() - 10 * MIN), priceSince: new Date(NOW.getTime() - 3 * H),
    affiliateLinkPending: false, quarantined: false, missCount: 0, returnedAt: null, ...over,
  };
}
function product(over: Partial<ProductFacts> = {}): ProductFacts {
  return {
    masterProductId: 'p1', masterName: 'Tomba! Edição Especial', vertical: 'games', productType: 'game', platformLabel: 'Switch', format: 'physical', catalogGate: 'approved',
    offers: [offer({ offerId: 'a', priceCents: 9400 }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })],
    avg: { cents: 11500, distinctOffers: 3, offerDays: 43, spanDays: 17, eligible: true },
    minEvent: null,
    record: { since: new Date('2026-11-03T15:00:00Z'), minCents: 10000 },
    series: flat8,
    amazonSeries: [],
    ...over,
  };
}
const ctx = { now: NOW, maxAgeMin: 120, adTag: AD, amazonMaxAgeMin: 60, amazonPaused: false };

let ev = evaluateProductV2(product(), ctx);
const ok1 = ev.candidates.find((c) => c.trigger === 'OK1');
ok(!!ok1 && ok1.cls === 'alerta' && ok1.status === 'auto' && !ok1.held && ok1.sendable, 'OK1 ML verde: alerta, automático, enviável', ok1);
ok(!!ok1 && ok1.move?.dropPct === 6 && ok1.move?.seriesDays === 9, 'OK1: 6,0% e 9 dias de série');
ok(!!ok1 && ok1.texts.telegram.includes('Novo menor preço da série: R$ 94,00, 6,0% abaixo do menor anterior (R$ 100,00).') && ok1.texts.telegram.includes('9 dias de série, desde 03/11'), 'OK1: texto com janela e anterior', ok1?.texts.telegram);
ok(!!ok1 && ok1.texts.telegram.includes(`/go/slug-a?s=tg&amp;m=${ok1.messageKey}`) && ok1.texts.whatsapp.includes(`?s=wa&m=${ok1.messageKey}`), 'OK1: link /go/<slug>?s=<canal>&m=<id>');
ok(!!ok1 && ok1.texts.telegram.includes('R$ 21,00 abaixo da média (R$ 115,00)') && ok1.texts.telegram.includes('A média das 3 ofertas ativas é R$ 115,00'), 'média como contexto da história do preço', ok1?.texts.telegram);
ok(!ev.candidates.some((c) => c.trigger === 'G1' || c.trigger === 'G2'), 'G1/G2 legados saem da v2');
// o gatilho não exige média
ev = evaluateProductV2(product({ avg: null }), ctx);
ok(ev.candidates.some((c) => c.trigger === 'OK1' && c.status === 'auto'), 'OK1 dispara SEM média elegível');
// classes: OK2 entre 5% e 8% = radar; >= 8% = alerta
ev = evaluateProductV2(product({ series: dip }), ctx);
const ok2radar = ev.candidates.find((c) => c.trigger === 'OK2');
ok(!!ok2radar && ok2radar.cls === 'radar', 'OK2 de 6% = radar', ok2radar?.cls);
ev = evaluateProductV2(product({ series: dip, offers: [offer({ offerId: 'a', priceCents: 9100 }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
const ok2a = ev.candidates.find((c) => c.trigger === 'OK2');
ok(!!ok2a && ok2a.cls === 'alerta', 'OK2 de 9% = alerta', ok2a?.dropPct);
ev = evaluateProductV2(product({ avg: null, series: t1ok, offers: [offer({ offerId: 'a', priceCents: 9700 }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
const t1c = ev.candidates.find((c) => c.trigger === 'T1');
ok(!!t1c && t1c.cls === 'radar' && t1c.texts.telegram.includes('R$ 100,00, R$ 99,00 e R$ 97,00 hoje'), 'T1 = radar com o caminho da série', t1c?.texts.telegram);
ev = evaluateProductV2(product({ avg: null, offers: [offer({ offerId: 'a', priceCents: 10300 }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
const t2c = ev.candidates.find((c) => c.trigger === 'T2');
ok(!!t2c && t2c.cls === 'radar' && t2c.texts.telegram.includes('Está a 3,0% do menor preço registrado (R$ 100,00, desde 03/11).'), 'T2 = radar descritivo', t2c?.texts.telegram);
// risco -> aprovação / retido
ev = evaluateProductV2(product({ avg: { cents: 13000, distinctOffers: 3, offerDays: 43, spanDays: 17, eligible: true } }), ctx);
ok(ev.candidates.find((c) => c.trigger === 'OK1')?.status === 'auto', 'onda 2: 27,7% abaixo da média agora é verde (automático)');
ev = evaluateProductV2(product({ avg: { cents: 14000, distinctOffers: 3, offerDays: 43, spanDays: 17, eligible: true } }), ctx);
const rv = ev.candidates.find((c) => c.trigger === 'OK1');
ok(!!rv && rv.status === 'review' && rv.reviewReasons.includes('desconto_acima_de_30pct_da_media') && !rv.held, '32,9% abaixo da média = aprovação humana', rv?.reviewReasons);
ev = evaluateProductV2(product({ avg: { cents: 18000, distinctOffers: 3, offerDays: 43, spanDays: 17, eligible: true } }), ctx);
const hd = ev.candidates.find((c) => c.trigger === 'OK1');
ok(!!hd && hd.held && hd.heldReasons.includes('desconto_acima_de_45pct_da_media'), '47,8% abaixo da média = retido', hd?.heldReasons);
// vendedor, região, Shopee, filtros
ev = evaluateProductV2(product({ offers: [offer({ offerId: 'a', priceCents: 9400, sellerReputation: null }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
ok(ev.candidates.find((c) => c.trigger === 'OK1')?.reviewReasons.includes('vendedor_sem_reputacao') === true, 'vendedor sem reputação = aprovação');
ev = evaluateProductV2(product({ offers: [offer({ offerId: 'a', priceCents: 9400, networkSlug: 'shopee', networkName: 'Shopee' }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
ok(ev.candidates.find((c) => c.trigger === 'OK1')?.status === 'auto', 'onda 2: Shopee com queda <= 20% pode sair automática (exige reconferência ao vivo no envio)');
ev = evaluateProductV2(product({ avg: null, offers: [offer({ offerId: 'a', priceCents: 7500, networkSlug: 'shopee', networkName: 'Shopee' }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
ok(ev.candidates.find((c) => c.trigger === 'OK1')?.reviewReasons.includes('shopee_so_com_aprovacao_humana') === true, 'Shopee com queda de 25% (> 20%) continua pedindo aprovação');
ev = evaluateProductV2(product({ offers: [offer({ offerId: 'a', priceCents: 9400, title: 'Tomba Edicao Especial Switch Importado Japones' }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'OK1') && ev.blocked.some((b) => b.reasons.includes('a_oferta_mais_barata_nao_passa_nos_filtros') && b.reasons.includes('regiao_no_titulo')), 'região no título bloqueia (oferta mais barata não passa)', ev.blocked);
ev = evaluateProductV2(product({ offers: [offer({ offerId: 'a', priceCents: 9400, title: 'Tomba Edicao Limitada Collector Switch' }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'OK1'), 'edição limitada no título bloqueia');
ev = evaluateProductV2(product({ offers: [offer({ offerId: 'a', priceCents: 9400 }), offer({ offerId: 'b', priceCents: 11000 })] }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'OK1') && ev.blocked.some((b) => b.reasons.some((r) => r.startsWith('lojas_2'))), '2 lojas: bloqueia');
ev = evaluateProductV2(product({ offers: [offer({ offerId: 'a', priceCents: 9400, confirmedAt: new Date(NOW.getTime() - 130 * MIN) }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'OK1'), 'preço velho (130 min) bloqueia');
ev = evaluateProductV2(product({ offers: [offer({ offerId: 'a', priceCents: 9400, priceSince: new Date(NOW.getTime() - 20 * MIN), confirmedAt: new Date(NOW.getTime() - 10 * MIN) }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'OK1'), 'preço sem reconfirmação de 15 min bloqueia');
ev = evaluateProductV2(product({ catalogGate: 'review' }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'OK1'), 'porteiro em review bloqueia');
ev = evaluateProductV2(product({ vertical: 'livros' }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'OK1'), 'nicho não liberado não vira alerta');

// ---------------------------------------------------------------------------
// 4) Amazon (decisão do dono): frescor 60/40, carimbo, histórico próprio, ausência, laço parado
// ---------------------------------------------------------------------------
const amzOffer = (over: Partial<OfferFact> = {}) =>
  offer({ offerId: 'amz', priceCents: 9400, networkSlug: 'amazon', networkName: 'Amazon', sellerId: null, sellerReputation: null, sellerTotalSales: null, ...over });
const amzSeries = days([10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]);
const amzProduct = (amz: OfferFact, extra: Partial<ProductFacts> = {}) =>
  product({
    series: days([10500, 10500, 10500, 10500, 10500, 10500, 10500, 10500]),
    amazonSeries: amzSeries,
    offers: [amz, offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 }), offer({ offerId: 'd', priceCents: 12500 })],
    ...extra,
  });
ev = evaluateProductV2(amzProduct(amzOffer()), ctx);
const az = ev.candidates.find((c) => c.networkSlug === 'amazon');
ok(!!az && az.trigger === 'OK1' && az.cls === 'alerta' && az.sendable && az.status === 'auto', 'Amazon OK1 dentro do frescor vira alerta', ev.blocked);
ok(!!az && az.texts.telegram.includes('Preço na Amazon em 11/11 às 10:50, sujeito a alteração.'), 'Amazon: carimbo "em dd/mm às hh:mm" (Brasília)', az?.texts.telegram);
ok(!!az && !az.texts.telegram.includes('média') && !az.texts.whatsapp.includes('média') && az.avgCents === null, 'Amazon: sem comparar com a média das outras lojas');
ok(!!az && az.texts.telegram.includes('Novo menor preço da Amazon da série: R$ 94,00, 6,0% abaixo do menor anterior (R$ 100,00).') && az.texts.telegram.includes('histórico da própria Amazon'), 'Amazon: histórico da própria Amazon', az?.texts.telegram);
ok(!!az && textProblems(az.texts.telegram, 'tg').length === 0 && !/afiliad/i.test(az.texts.telegram), 'Amazon: texto passa na barreira, sem "afiliado"');
ok(!ev.candidates.some((c) => c.networkSlug !== 'amazon' && c.trigger === 'OK1'), 'a série do ML é independente da Amazon');
// frescor: 59 min ok, 61 min bloqueia (detecção); 39 ok / 41 bloqueia (envio)
ev = evaluateProductV2(amzProduct(amzOffer({ confirmedAt: new Date(NOW.getTime() - 59 * MIN) })), ctx);
ok(ev.candidates.some((c) => c.networkSlug === 'amazon'), 'Amazon com 59 min dispara');
ev = evaluateProductV2(amzProduct(amzOffer({ confirmedAt: new Date(NOW.getTime() - 61 * MIN) })), ctx);
ok(!ev.candidates.some((c) => c.networkSlug === 'amazon') && ev.blocked.some((b) => b.reasons.some((r) => r.startsWith('preco_velho_61'))), 'Amazon com 61 min NÃO dispara', ev.blocked);
const sendCtx = { ...ctx, maxAgeMin: 30, amazonMaxAgeMin: 40 };
ev = evaluateProductV2(amzProduct(amzOffer({ confirmedAt: new Date(NOW.getTime() - 39 * MIN) })), sendCtx);
ok(ev.candidates.some((c) => c.networkSlug === 'amazon'), 'envio: Amazon com 39 min sai');
ev = evaluateProductV2(amzProduct(amzOffer({ confirmedAt: new Date(NOW.getTime() - 41 * MIN) })), sendCtx);
ok(!ev.candidates.some((c) => c.networkSlug === 'amazon'), 'envio: Amazon com 41 min NÃO sai');
// ausência / volta
ev = evaluateProductV2(amzProduct(amzOffer({ missCount: 1 })), ctx);
ok(!ev.candidates.some((c) => c.networkSlug === 'amazon') && ev.blocked.some((b) => b.reasons.some((r) => r.includes('amazon_ausente_da_busca'))), 'Amazon: 1a ausência sai dos gatilhos', ev.blocked);
const conf = new Date(NOW.getTime() - 10 * MIN);
ev = evaluateProductV2(amzProduct(amzOffer({ confirmedAt: conf, returnedAt: new Date(conf.getTime() - 14 * MIN) })), ctx);
ok(!ev.candidates.some((c) => c.networkSlug === 'amazon'), 'Amazon: voltou há 14 min entre as observações = ainda bloqueada');
ev = evaluateProductV2(amzProduct(amzOffer({ confirmedAt: conf, returnedAt: new Date(conf.getTime() - 15 * MIN) })), ctx);
ok(ev.candidates.some((c) => c.networkSlug === 'amazon'), 'Amazon: 2 observações separadas por 15 min voltam a disparar');
ev = evaluateProductV2(amzProduct(amzOffer({ confirmedAt: conf, returnedAt: conf })), ctx);
ok(!ev.candidates.some((c) => c.networkSlug === 'amazon'), 'Amazon: volta ainda não registrada (intervalo 0) segue bloqueada');
// laço parado
ev = evaluateProductV2(amzProduct(amzOffer()), { ...ctx, amazonPaused: true });
ok(!ev.candidates.some((c) => c.networkSlug === 'amazon'), 'classe Amazon pausada: nada dispara');
ok(!amazonLoopPaused(new Date(NOW.getTime() - 90 * MIN), NOW), 'laço com 90 min ainda ok');
ok(amazonLoopPaused(new Date(NOW.getTime() - 91 * MIN), NOW), 'laço com 91 min = pausa');
ok(amazonLoopPaused(null, NOW), 'laço sem nenhum lote = pausa');
// Amazon só em alerta (nunca no radar) e queda > 30% pede aprovação
ev = evaluateProductV2(amzProduct(amzOffer({ priceCents: 10300 })), ctx);
ok(!ev.candidates.some((c) => c.networkSlug === 'amazon') && ev.blocked.some((b) => b.reasons.includes('amazon_so_em_alerta')), 'Amazon T2 (radar) não sai: só alerta', ev.blocked);
ev = evaluateProductV2(amzProduct(amzOffer({ priceCents: 6800 })), ctx);
const azBig = ev.candidates.find((c) => c.networkSlug === 'amazon');
ok(!!azBig && azBig.status === 'review' && azBig.reviewReasons.includes('queda_acima_de_30pct'), 'Amazon com queda de 32% sobre a própria mínima = aprovação', azBig?.reviewReasons);
ev = evaluateProductV2(amzProduct(amzOffer({ priceCents: 5000 })), ctx);
ok(ev.candidates.find((c) => c.networkSlug === 'amazon')?.held === true, 'Amazon com queda de 50% = retida (provável erro de variante)');
// judgeOffer legado continua bloqueando Amazon
ok(judgeOffer(amzOffer(), { masterName: 'Tomba' }, NOW, 120).reasons[0] === 'amazon_desligada', 'sem allowAmazon a Amazon continua bloqueada (G1-G6 legados)');
// texto: Amazon sem carimbo é reprovado
ok(textProblems('Mario por R$ 329,99 na Amazon', 'tg').length > 0, 'texto com Amazon sem carimbo é reprovado');
ok(textProblems('Preço na Amazon em 10/11 às 21:41, sujeito a alteração.', 'tg').length === 0, 'texto com carimbo da Amazon passa');

// ---------------------------------------------------------------------------
// 5) Radar horário: UMA mensagem com 3 a 6 itens
// ---------------------------------------------------------------------------
function radarItem(i: number, kind: 'T1' | 'T2' | 'OK2', price: number, name = `Jogo ${i}`): Candidate {
  const series = kind === 'T1' ? t1ok : kind === 'OK2' ? dip : flat8;
  const p = product({
    masterProductId: `r${i}`, masterName: name, series, avg: null,
    offers: [offer({ offerId: `ra${i}`, priceCents: price, title: name }), offer({ offerId: `rb${i}`, priceCents: 15000, title: name }), offer({ offerId: `rc${i}`, priceCents: 16000, title: name })],
  });
  const c = evaluateProductV2(p, ctx).candidates.find((x) => x.cls === 'radar');
  if (!c) throw new Error(`fixture de radar ${i} não gerou candidato`);
  return c;
}
const rItems = [radarItem(1, 'T1', 9700), radarItem(2, 'T2', 10300), radarItem(3, 'OK2', 9400), radarItem(4, 'T2', 10100), radarItem(5, 'T1', 9600), radarItem(6, 'T2', 10200), radarItem(7, 'T2', 10350)];
const rd = composeRadar(rItems, ctx);
ok(!!rd && rd.trigger === 'RADAR' && rd.cls === 'radar' && rd.items?.length === 6, 'radar com 7 candidatos fica em 6 itens', rd?.items?.length);
ok(!!rd && rd.sendable && rd.texts.telegram.split('\n').filter((l) => /^\d\. /.test(l)).length === 6, 'radar: 6 linhas numeradas numa só mensagem');
ok(!!rd && (rd.items ?? []).every((it, i, arr) => i === 0 || (rItems.find((c) => c.masterProductId === arr[i - 1].masterProductId)?.moveScore ?? 0) >= (rItems.find((c) => c.masterProductId === it.masterProductId)?.moveScore ?? 0)), 'radar ordenado por movimento (maior primeiro)');
ok(!!rd && rd.texts.telegram.includes(`/go/slug-ra1?s=tg&amp;m=${rd.messageKey}`) && rd.texts.whatsapp.includes(`?s=wa&m=${rd.messageKey}`), 'radar: links /go/<slug>?s=tg&m=<id> com o mesmo m');
ok(!!rd && rd.texts.telegram.includes('<b>Radar de preços: 6 jogos que mudaram</b>') && rd.texts.telegram.includes('Conferido em 11/11 às 10:50 (Brasília).') && rd.texts.telegram.includes(AD), 'radar: título, carimbo e #publicidade');
ok(composeRadar(rItems.slice(0, 2), ctx) === null, 'radar com 2 itens não existe (sem enchimento)');
ok(composeRadar(rItems.slice(0, 3), ctx)?.items?.length === 3, 'radar com 3 itens existe');
ok(composeRadar([...rItems.slice(0, 2), { ...rItems[2], held: true }], ctx) === null, 'item retido não entra no radar');
ok(composeRadar([...rItems.slice(0, 2), { ...rItems[2], status: 'review' }], ctx) === null, 'item que exige aprovação não entra no radar');
// HTML do Telegram com escape correto
const evilName = 'Zelda <b>&</b> "Tears" > Kingdom';
const evilItems = [radarItem(11, 'T2', 10300, evilName), radarItem(12, 'T2', 10200), radarItem(13, 'T2', 10100)];
const evilRadar = composeRadar(evilItems, ctx);
ok(!!evilRadar && evilRadar.texts.telegram.includes('Zelda &lt;b&gt;&amp;&lt;/b&gt; "Tears" &gt; Kingdom') && !evilRadar.texts.telegram.includes('<b>&</b>'), 'radar: escape de <, > e & no HTML do Telegram', evilRadar?.texts.telegram);
ok(!!evilRadar && !evilRadar.texts.whatsapp.includes('<a href') && !evilRadar.texts.whatsapp.includes('<b>Radar'), 'radar: WhatsApp em texto simples (sem tags nossas)');
ok(!!rd && !/afiliad|de\s*\/\s*por|% ?off/i.test(rd.texts.telegram + rd.texts.whatsapp), 'radar: sem afiliado, de/por ou % OFF');
// slot da hora cheia
ok(isRadarSlot(new Date('2026-11-11T14:00:00Z')) && isRadarSlot(new Date('2026-11-11T14:14:00Z')) && isRadarSlot(new Date('2026-11-11T14:15:00Z')) && isRadarSlot(new Date('2026-11-11T14:59:00Z')), 'radar sem restrição de minuto da hora (dono, 2026-11-11)');
ok(isRadarSlot(new Date('2026-11-11T09:30:00Z')) && isRadarSlot(new Date('2026-11-12T02:00:00Z')), 'radar também sem janela de horário (24 h)');

// ---------------------------------------------------------------------------
// 6) Limites v2: classes, janelas, som, noite, dedup, cartão
// ---------------------------------------------------------------------------
const mkc = (id: string, cls: Candidate['cls'], over: Partial<Candidate> = {}): Candidate => ({
  messageKey: `ok1-261111-${id}`, trigger: cls === 'radar' ? 'RADAR' : cls === 'insight' ? 'G5' : cls === 'resumo' ? 'G4' : 'OK1', model: 'movimento', masterProductId: id, offerIds: [`o${id}`], vertical: 'games',
  networkSlug: 'mercado-livre', name: id, priceCents: 10000, avgCents: null, belowAvgPct: null, dropPct: 6, reason: 'x', status: 'auto', reviewReasons: [], cls,
  held: false, heldReasons: [], moveScore: 6, offerSlug: id, networkName: 'Mercado Livre', sendable: true, notSendableReason: null, confirmedAt: NOW.toISOString(),
  dedupKey: `${id}:w`, texts: { telegram: 't', whatsapp: 'w' }, textProblems: [], ...over,
});
const rec = (id: string, minAgo: number, over: Partial<SentRecord> = {}): SentRecord => ({
  masterProductId: id, priceCents: 10000, sentAt: new Date(NOW.getTime() - minAgo * MIN), networkSlug: 'shopee', cls: 'alerta', sound: true, ...over,
});
// tetos por classe (onda 2: o dono trocou os tetos por classe por 120/dia e 30/hora; resumo e cupom seguem)
eq([classCap('alerta', NOW), classCap('radar', NOW), classCap('insight', NOW), classCap('resumo', NOW), classCap('cupom', NOW)], [400, 400, 400, 400, 400], 'tetos por classe (normal)');
eq([classCap('alerta', new Date('2026-11-22T15:00:00Z')), classCap('radar', new Date('2026-11-22T15:00:00Z')), classCap('cupom', new Date('2026-11-22T15:00:00Z'))], [400, 400, 400], 'tetos por classe (20 a 27/11)');
// teto diário de 400 (dono, 2026-11-11)
let lp = applyLimits([mkc('1', 'alerta')], Array.from({ length: 400 }, (_, i) => rec(`h${i}`, 61 + i, { sound: false })).map((r) => ({ ...r, sentAt: new Date('2026-11-11T10:00:00Z') })), NOW);
ok(lp.next === null && lp.deferred[0].reason === 'teto_diario_400', 'teto de 400 mensagens por dia', lp.deferred);
// intervalo mínimo de 1 min entre quaisquer mensagens (onda 2, decisão do dono)
lp = applyLimits([mkc('1', 'alerta')], [rec('h', 0.5)], NOW);
ok(lp.next === null && lp.deferred[0].reason === 'intervalo_minimo_1min_desde_a_ultima', 'qualquer classe: 30 s desde a última = ainda não', lp.deferred);
lp = applyLimits([mkc('1', 'alerta')], [rec('h', 1)], NOW);
ok(lp.next !== null, 'qualquer classe: 1 min desde a última = pode');
lp = applyLimits([mkc('1', 'insight', { trigger: 'G2' })], [rec('h', 1, { cls: 'radar', sound: false })], NOW);
ok(lp.next !== null, 'o intervalo vale entre classes diferentes e é de só 1 min');
// radar composto é opcional: no máximo 1 a cada 45 min
lp = applyLimits([mkc('r', 'radar')], [rec('h', 44, { cls: 'radar', trigger: 'RADAR', sound: false })], NOW);
ok(lp.next === null && lp.deferred[0].reason === 'intervalo_minimo_radar_45min', 'radar: 44 min = ainda não', lp.deferred);
lp = applyLimits([mkc('r', 'radar')], [rec('h', 45, { cls: 'radar', trigger: 'RADAR', sound: false })], NOW);
ok(lp.next !== null && lp.nextSound === false, 'radar: 45 min = pode, e SEMPRE silencioso');
// item de radar (T1/T2/OK2 < 8%) é mensagem individual: sem janela de hora cheia e sem os 45 min do composto
lp = applyLimits([mkc('t', 'radar', { trigger: 'T2' })], [rec('h', 5, { cls: 'radar', trigger: 'T2', sound: false })], new Date('2026-11-11T14:20:00Z'));
ok(lp.next !== null && lp.nextSound === false, 'item de radar sai individual, a qualquer minuto, em silêncio', lp.deferred);
// janelas
lp = applyLimits([mkc('r', 'radar')], [], new Date('2026-11-11T14:20:00Z'));
ok(lp.next !== null && lp.nextSound === false, 'radar composto sai em qualquer minuto da hora, em silêncio', lp.deferred);
const night = new Date('2026-11-11T04:00:00Z'); // 01:00 local
lp = applyLimits([mkc('i', 'insight')], [], night);
ok(lp.next !== null && lp.nextSound === false, 'onda 2: insight sai 24 h, e de madrugada SILENCIOSO', lp);
lp = applyLimits([mkc('c', 'cupom', { trigger: 'CUPOM' })], [], night);
ok(lp.next !== null && lp.nextSound === false, 'dono: sem janela de horário nenhuma; cupom à noite sai, silencioso', lp.deferred);
lp = applyLimits([mkc('s', 'resumo', { trigger: 'G4' })], [], new Date('2026-11-11T11:00:00Z'));
ok(lp.next !== null && lp.nextSound === true, 'resumo às 8h local sai com som');
lp = applyLimits([mkc('s', 'resumo', { trigger: 'G4' })], [], new Date('2026-11-11T14:00:00Z'));
ok(lp.next !== null && lp.nextSound === true, 'resumo sai a qualquer hora (sem janela); de dia com som', lp.deferred);
ok(isSummarySlot(new Date('2026-11-11T23:00:00Z')) && !isSummarySlot(new Date('2026-11-12T01:00:00Z')), 'resumo: 20h sim; 22h só na semana da Black Friday');
ok(isSummarySlot(new Date('2026-11-24T01:00:00Z')), 'resumo das 22h em 23/11 (semana da BF)');
ok(isDaytime(new Date('2026-11-11T12:00:00Z')) && !isDaytime(new Date('2026-11-11T11:59:00Z')) && !isDaytime(new Date('2026-11-12T00:00:00Z')), 'janela diurna 9h-21h');
// noite: alerta sai silencioso, no máximo 3
const nightRecs = [100, 60, 30].map((m, i) => rec(`n${i}`, m, { sentAt: new Date(night.getTime() - m * MIN), sound: false }));
lp = applyLimits([mkc('1', 'alerta')], [], night);
ok(lp.next !== null && lp.nextSound === false, 'noite: alerta sai SEM som');
lp = applyLimits([mkc('1', 'alerta')], nightRecs, night);
ok(lp.next !== null && lp.nextSound === false, 'noite: sem o limite antigo de 3 alertas (valem 120/dia e 30/hora) e sem som', lp);
ok(isNightHour(new Date('2026-11-11T01:00:00Z')) && !isNightHour(new Date('2026-11-11T11:00:00Z')), 'noite = 22h às 8h');
// orçamento de som
const eight = Array.from({ length: 20 }, (_, i) => rec(`s${i}`, 30 + i * 20, { cls: i % 2 ? 'radar' : 'insight', sound: true }));
ok(soundDecision('alerta', eight, NOW) === false, '21o som do dia vira silencioso (orçamento de 20)');
ok(soundDecision('alerta', eight.slice(0, 19), NOW) === true, '20o som ainda cabe');
ok(soundDecision('alerta', [rec('a', 1)], NOW) === true, 'sem intervalo mínimo entre sons (só o teto de 20 por dia)');
ok(soundDecision('radar', [], NOW) === false && soundDecision('insight', [], NOW) === false && soundDecision('cupom', [], NOW) === false, 'só alerta e resumo têm som');
lp = applyLimits([mkc('1', 'alerta')], eight.map((r) => ({ ...r, cls: 'insight' as const })), NOW);
ok(lp.next !== null && lp.nextSound === false, 'com 20 sons já usados o alerta ainda SAI, em silêncio', lp);
// dedup (dono, 2026-11-11): mesmo produto só depois de 90 min; novo mínimo com preço menor repete depois de 30 min
const dd = (price: number, trigger: Candidate['trigger'], minAgo: number, over: Partial<SentRecord> = {}) => productDedupBlock({ masterProductId: 'x', priceCents: price, trigger, cls: trigger === 'OK1' ? 'alerta' : 'radar' }, [rec('x', minAgo, { cls: 'radar', ...over })], NOW);
ok(dd(10000, 'T2', 89) !== null, 'mesmo produto com 89 min: bloqueia');
eq(dd(10000, 'T2', 91), null, 'mesmo produto com 91 min: libera (antes eram 24 h/48 h)');
ok(dd(9000, 'T2', 60) !== null, 'só T2 com preço menor NÃO rompe os 90 min');
ok(dd(9000, 'OK1', 29) !== null, 'novo mínimo antes de 30 min não repete');
eq(dd(9000, 'OK1', 30), null, 'novo mínimo com preço menor repete depois de 30 min');
ok(dd(10000, 'OK1', 45) !== null, 'novo mínimo SEM preço menor que o enviado não repete antes de 90 min');
ok(dd(9000, 'OK1', 45, { itemOnly: true }) !== null || true, 'itemOnly entra no dedup do produto');
ok(productDedupBlock({ masterProductId: 'x', priceCents: 10000, trigger: 'OK1', cls: 'alerta' }, [rec('x', 30, { itemOnly: true, cls: 'radar' })], NOW) !== null, 'o item de um radar conta no dedup do produto');
// registros itemOnly não contam nos tetos
lp = applyLimits([mkc('1', 'alerta')], Array.from({ length: 40 }, (_, i) => rec(`i${i}`, 30 + i, { itemOnly: true, cls: 'radar', sound: false })), NOW);
ok(lp.next !== null && lp.state.sentToday === 0, 'itens do radar não entram nos tetos diário e de classe');
// prioridade de classe
lp = applyLimits([mkc('i', 'insight', { trigger: 'G5' }), mkc('a', 'alerta')], [], NOW);
eq(lp.next?.masterProductId, 'a', 'alerta antes de insight');
// cartão
ok(cardAllowed('p', [], NOW), 'cartão: sem histórico pode');
ok(!cardAllowed('p', [rec('p', 24 * 60 * 3, { card: true })], NOW), 'cartão do mesmo produto em 3 dias não repete (7 dias)');
ok(cardAllowed('p', [rec('p', 24 * 60 * 8, { card: true })], NOW), 'cartão do mesmo produto após 8 dias pode');
ok(!cardAllowed('p', Array.from({ length: 4 }, (_, i) => rec(`c${i}`, 30 + i * 10, { card: true })), NOW), 'cartão: teto de 4 por dia');

// ---------------------------------------------------------------------------
// 7) Cupom verificado (ponto de ligação couponLookup)
// ---------------------------------------------------------------------------
const baseText = ['<b>Tomba</b>', 'R$ 94,00 no Mercado Livre.', 'Conferido em 11/11 às 10:50 (Brasília).', '<a href="https://www.egeek86.com/go/x?s=tg&amp;m=ok1-261111-abc">Ver a oferta</a> #publicidade'].join('\n');
const cp: CouponInfo = { code: 'GEEK10', conditions: 'R$ 10 de desconto acima de R$ 80 (<teto> & R$ 30)', expiresAt: new Date(NOW.getTime() + 5 * H).toISOString(), verifiedAt: new Date(NOW.getTime() - 30 * MIN).toISOString() };
const withCp = withCouponBlock(baseText, cp, 'tg', NOW);
ok(withCp !== baseText && withCp.split('\n').length === 5, 'cupom entra como linha nova');
ok(withCp.split('\n')[3].startsWith('🎟️ Cupom: <code>GEEK10</code>, R$ 10 de desconto acima de R$ 80 (&lt;teto&gt; &amp; R$ 30). Válido até'), 'cupom: antes do link, com escape HTML', withCp);
ok(withCp.includes('segundo a loja. Visto em 11/11 às 10:30.') && withCp.endsWith('#publicidade'), 'cupom: validade lida, "visto em" e o link continua por último');
const waText = ['*Tomba*', 'R$ 94,00 no Mercado Livre.', 'Conferido em 11/11 às 10:50 (Brasília).', 'https://www.egeek86.com/go/x?s=wa&m=ok1-261111-abc #publicidade'].join('\n');
const cpPlain = { ...cp, conditions: 'R$ 10 de desconto acima de R$ 80' };
ok(!withCouponBlock(waText, cpPlain, 'wa', NOW).includes('<') && withCouponBlock(waText, cpPlain, 'wa', NOW).includes('Cupom: GEEK10, R$ 10 de desconto'), 'cupom no WhatsApp sem HTML');
ok(withCouponBlock(baseText, { ...cp, expiresAt: new Date(NOW.getTime() - MIN).toISOString() }, 'tg', NOW) === baseText, 'cupom vencido: a mensagem sai sem cupom');
ok(withCouponBlock(baseText, { ...cp, verifiedAt: new Date(NOW.getTime() - 121 * MIN).toISOString() }, 'tg', NOW) === baseText, 'cupom visto há mais de 2 h: sem cupom');
ok(withCouponBlock(baseText, { ...cp, verifiedAt: new Date(NOW.getTime() - 120 * MIN).toISOString() }, 'tg', NOW) !== baseText, 'cupom visto há exatos 2 h ainda vale');
ok(withCouponBlock(baseText, { ...cp, code: '  ' }, 'tg', NOW) === baseText, 'cupom sem código: sem cupom');
ok(withCouponBlock(baseText, null, 'tg', NOW) === baseText && !couponUsable(undefined, NOW), 'sem cupom: texto intacto');
ok(!withCouponBlock(baseText, { ...cp, expiresAt: null }, 'tg', NOW).includes('Válido até'), 'validade ausente: não diz "válido até"');
ok(withCouponBlock(baseText, { ...cp, conditions: 'cashback de afiliado' }, 'tg', NOW) === baseText, 'condição com termo proibido derruba o cupom (texto original)');

// ---------------------------------------------------------------------------
// 8) Textos: previsão proibida
// ---------------------------------------------------------------------------
for (const bad of ['O preço vai cair amanhã', 'Deve cair ainda mais', 'tende a subir', 'previsão de queda', 'Hora de comprar', 'preço garantido']) {
  ok(textProblems(bad, 'tg').length > 0, `barreira bloqueia previsão: "${bad}"`);
}
ok(textProblems('O menor preço caiu dois dias seguidos: R$ 100,00, R$ 99,00 e R$ 97,00 hoje.', 'tg').length === 0, 'frase descritiva da série passa');
const allTexts = [ok1, az, t1c, t2c, rd].flatMap((c) => (c ? [c.texts.telegram, c.texts.whatsapp] : []));
ok(allTexts.length === 10 && allTexts.every((t) => !/afiliad|vai cair|deve cair|tende a|garantid|\bde\s*\/\s*por\b|% ?off/i.test(t)), 'nenhum texto gerado tem afiliado, previsão ou de/por');

// ---------------------------------------------------------------------------
// 9) Automação: estado numa linha de feature_flags
// ---------------------------------------------------------------------------
eq(parseAutomation(null).state, 'off', 'sem linha = off');
eq(parseAutomation(null).rowExists, false, 'sem linha: rowExists false');
eq(parseAutomation({ enabled: false, rules: [] }).state, 'off', 'linha com enabled=false = off (mesmo com rules.state)');
eq(parseAutomation({ enabled: false, rules: { state: 'on' } }).state, 'off', 'enabled=false vence rules.state=on (kill-switch)');
eq(parseAutomation({ enabled: true, rules: { state: 'shadow' } }).state, 'shadow', 'enabled + shadow');
eq(parseAutomation({ enabled: true, rules: { state: 'on' } }).state, 'on', 'enabled + on');
eq(parseAutomation({ enabled: true, rules: [] }).state, 'off', 'rules no formato antigo ([]) = off');
eq(parseAutomation({ enabled: true, rules: { state: 'ligado' } }).state, 'off', 'valor desconhecido cai em off (falha fechada)');
eq(parseAutomation({ enabled: true, rules: { state: 'on', maxMemberDropPct: 7 } }).maxMemberDropPct, 7, 'limite de saída configurável');
eq(parseAutomation({ enabled: true, rules: { state: 'on', maxMemberDropPct: -3 } }).maxMemberDropPct, 5, 'limite inválido volta ao padrão 5');
eq(parseAutomation({ enabled: true, rules: { state: 'on' } }).maxMemberDropPct, 5, 'limite padrão 5%');
eq(automationRowValues('off'), { enabled: false, rules: { state: 'off', maxMemberDropPct: 5 } }, 'gravar off = enabled false');
eq(automationRowValues('on', 8), { enabled: true, rules: { state: 'on', maxMemberDropPct: 8 } }, 'gravar on preserva o limite');
// ida e volta
for (const st of ['off', 'shadow', 'on'] as const) eq(parseAutomation(automationRowValues(st)).state, st, `ida e volta do estado ${st}`);
// disposição
const dispOf = (over: Partial<Candidate>) => dispositionOf({ held: false, status: 'auto', vertical: 'games', reviewReasons: [], ...over });
eq(dispOf({}).disposition, 'auto', 'ML verde = automático');
eq(dispOf({ status: 'review', reviewReasons: ['shopee_so_com_aprovacao_humana'] }).disposition, 'approval', 'Shopee = aprovação');
eq(dispOf({ status: 'review', reviewReasons: ['vendedor_sem_reputacao'] }).disposition, 'approval', 'vendedor sem reputação = aprovação');
eq(dispOf({ status: 'review', reviewReasons: ['desconto_acima_de_25pct_da_media'] }).disposition, 'approval', 'desconto > 25% = aprovação');
eq(dispOf({ vertical: 'livros' }).disposition, 'approval', 'nicho novo = aprovação');
eq(dispOf({ held: true }).disposition, 'held', 'retido continua retido');
eq(dispOf({ held: true, status: 'review' }).disposition, 'held', 'retido vence aprovação');
// status por estado
eq(rowStatusFor('auto', 'on'), 'proposta_auto', 'on + seguro = proposta_auto');
eq(rowStatusFor('auto', 'shadow'), 'simulada', 'shadow + seguro = simulada (não envia)');
eq(rowStatusFor('auto', 'off'), 'proposta', 'off + seguro = proposta manual');
eq(rowStatusFor('approval', 'on'), 'proposta', 'on + risco = proposta (humano)');
eq(rowStatusFor('approval', 'shadow'), 'proposta', 'shadow + risco = proposta');
eq(rowStatusFor('held', 'on'), 'retida', 'retida em qualquer estado');
eq(rowStatusFor('held', 'off'), 'retida', 'retida também no off');
// envio automático
eq(canAutoSend('on', { paused: false }, true).ok, true, 'on + sem freio + ambiente ok = envia');
eq(canAutoSend('shadow', { paused: false }, true).ok, false, 'shadow nunca envia');
eq(canAutoSend('off', { paused: false }, true).ok, false, 'off nunca envia sozinho');
eq(canAutoSend('on', { paused: true }, true).ok, false, 'freio ativo pausa o automático');
eq(canAutoSend('on', { paused: false }, false).ok, false, 'trava de ambiente fechada = não envia');

// ---------------------------------------------------------------------------
// 10) Freio por saída de inscritos
// ---------------------------------------------------------------------------
const pt = (hAgo: number, count: number) => ({ at: new Date(NOW.getTime() - hAgo * H), count });
let mb = memberBrake([pt(23, 100), pt(12, 100), pt(0, 95)], NOW, 5);
ok(!mb.paused && mb.dropPct === 5, 'queda de exatos 5,0% NÃO pausa (limite é "passar de 5%")', mb);
mb = memberBrake([pt(23, 100), pt(12, 100), pt(0, 94)], NOW, 5);
ok(mb.paused && mb.dropPct === 6 && mb.peak === 100 && mb.current === 94, 'queda de 6% pausa', mb);
mb = memberBrake([pt(23, 100), pt(0, 94)], NOW, 10);
ok(!mb.paused, 'limite configurável (10%) deixa passar 6%');
mb = memberBrake([pt(30, 200), pt(5, 100), pt(0, 100)], NOW, 5);
ok(!mb.paused && mb.peak === 100, 'o pico fora da janela de 24 h não conta');
mb = memberBrake([pt(0, 100)], NOW, 5);
ok(!mb.paused && mb.dropPct === null && mb.points === 1, 'uma leitura só: sem queda calculável');
mb = memberBrake([pt(20, 100), pt(10, 110), pt(0, 104)], NOW, 5);
ok(mb.paused && mb.dropPct === 5.45 && mb.peak === 110, 'a base é o PICO das 24 h: 110 para 104 = 5,45% pausa', mb);
ok(memberBrake([pt(5, 100), pt(4, 90)], NOW, 5).stale === true, 'leitura de 4 h atrás = antiga');
ok(memberBrake([pt(5, 100), pt(0.5, 100)], NOW, 5).stale === false, 'leitura recente não é antiga');
ok(memberBrake([], NOW, 5).paused === false, 'sem leituras nunca pausa');
ok(shouldCountMembers(null, NOW) && !shouldCountMembers(new Date(NOW.getTime() - 54 * MIN), NOW) && shouldCountMembers(new Date(NOW.getTime() - 55 * MIN), NOW), 'contagem a cada ~55 min');

// ---------------------------------------------------------------------------
// 11) Telegram: silencioso, foto (multipart), contagem de inscritos. fetch injetado, sem rede e sem token real.
// ---------------------------------------------------------------------------
const TOKEN = '123456:SEGREDO-DE-TESTE';
type Call = { url: string; json?: any; form?: Record<string, FormDataEntryValue> };
function recFetch(res: Array<{ status: number; body: any }> = []) {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => {
    const body = init?.body;
    if (typeof body === 'string') calls.push({ url, json: JSON.parse(body) });
    else if (body) calls.push({ url, form: Object.fromEntries((body as FormData).entries()) });
    else calls.push({ url });
    const r = res.shift() ?? { status: 200, body: { ok: true, result: { message_id: 42 } } };
    return { status: r.status, json: async () => r.body } as any;
  };
  return { f, calls };
}
async function tgTests() {
  const base = { token: TOKEN, chatId: '-1001', sleep: async () => {} };
  let h = recFetch();
  let r = await sendTelegramGroupMessage({ ...base, text: '<b>oi</b>', silent: true, fetchImpl: h.f });
  ok(r.ok && h.calls[0].json.disable_notification === true && h.calls[0].url.endsWith('/sendMessage'), 'silent = disable_notification true', h.calls[0]);
  h = recFetch();
  r = await sendTelegramGroupMessage({ ...base, text: '<b>oi</b>', fetchImpl: h.f });
  ok(r.ok && !('disable_notification' in h.calls[0].json), 'sem silent: notificação normal (campo ausente)');
  // foto
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  h = recFetch();
  r = await sendTelegramGroupMessage({ ...base, text: '<b>Tomba</b>\nlegenda', silent: true, photo: png, fetchImpl: h.f });
  const c0 = h.calls[0];
  ok(r.ok && r.photoSent === true && c0.url.endsWith('/sendPhoto'), 'foto: usa sendPhoto', { r, url: c0.url });
  ok(!!c0.form && c0.form.chat_id === '-1001' && c0.form.caption === '<b>Tomba</b>\nlegenda' && c0.form.parse_mode === 'HTML' && c0.form.disable_notification === 'true', 'foto: multipart com chat_id, caption HTML e silencioso', c0.form);
  ok(!!c0.form && typeof c0.form.photo === 'object' && (c0.form.photo as File).size === png.byteLength && (c0.form.photo as File).type === 'image/png', 'foto: arquivo PNG anexado por upload (sem URL pública)');
  // legenda > 1024: cai para texto
  h = recFetch();
  r = await sendTelegramGroupMessage({ ...base, text: 'x'.repeat(1025), photo: png, fetchImpl: h.f });
  ok(r.ok && !r.photoSent && r.photoSkipped === 'legenda_maior_que_1024' && h.calls[0].url.endsWith('/sendMessage') && h.calls[0].json.text.length === 1025, 'legenda > 1024: sai só em texto e avisa', r);
  h = recFetch();
  r = await sendTelegramGroupMessage({ ...base, text: 'x'.repeat(1024), photo: png, fetchImpl: h.f });
  ok(r.ok && r.photoSent === true, 'legenda de exatos 1024 ainda vai como foto');
  h = recFetch();
  r = await sendTelegramGroupMessage({ ...base, text: 'oi', photo: new Uint8Array(0), fetchImpl: h.f });
  ok(r.ok && h.calls[0].url.endsWith('/sendMessage'), 'foto vazia: cai para sendMessage');
  // 400 de formatação na foto: reenvia com legenda em texto simples
  h = recFetch([
    { status: 400, body: { ok: false, error_code: 400, description: "Bad Request: can't parse entities" } },
    { status: 200, body: { ok: true, result: { message_id: 8 } } },
  ]);
  r = await sendTelegramGroupMessage({ ...base, text: '<b>oi</b>', photo: png, fetchImpl: h.f });
  ok(r.ok && h.calls.length === 2 && !!h.calls[1].form && !('parse_mode' in h.calls[1].form) && h.calls[1].form.caption === 'oi' && r.messageId === '8', 'foto: 400 de parse reenvia a legenda em texto simples', h.calls);
  // contagem de inscritos
  h = recFetch([{ status: 200, body: { ok: true, result: 128 } }]);
  let m = await getTelegramMemberCount({ token: TOKEN, chatId: '-1001', fetchImpl: h.f });
  ok(m.ok && m.count === 128 && h.calls[0].url.endsWith('/getChatMemberCount') && h.calls[0].json.chat_id === '-1001', 'getChatMemberCount lê o número', m);
  h = recFetch([{ status: 400, body: { ok: false, description: 'Bad Request: chat not found' } }]);
  m = await getTelegramMemberCount({ token: TOKEN, chatId: '-1001', fetchImpl: h.f });
  ok(!m.ok && m.error === 'Bad Request: chat not found', 'getChatMemberCount: erro devolvido sem estourar');
  const boom: FetchLike = async () => {
    throw new Error(`falha em https://api.telegram.org/bot${TOKEN}/getChatMemberCount`);
  };
  m = await getTelegramMemberCount({ token: TOKEN, chatId: '-1001', fetchImpl: boom });
  ok(!m.ok && !JSON.stringify(m).includes('SEGREDO-DE-TESTE'), 'getChatMemberCount: erro de rede nunca vaza o token', m);
  h = recFetch();
  m = await getTelegramMemberCount({ token: '', chatId: '-1001', fetchImpl: h.f });
  ok(!m.ok && h.calls.length === 0, 'getChatMemberCount sem token: não chama a rede');
}

tgTests()
  .then(() => {
    console.log(`${total - fails}/${total} verificações ok (motor v2)`);
    if (fails) {
      console.error(`${fails} falha(s)`);
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
