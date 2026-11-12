/**
 * Teste da DIVERSIDADE e do gatilho ACHADO das lojas Plus (ata 2026-11-12-diversidade-fluxo-plus).
 * Funcoes puras: sem banco, sem rede, sem token. Uso: npx tsx scripts/test-mensagens-diversidade.ts (sai com codigo 1 se algo falhar).
 * Os precos sao valores de teste de funcoes puras (nenhum dado e gravado nem exibido ao cliente).
 * Cobre: texto do Achado (sem %, sem "abaixo", sem "media", sem "desconto", sem "afiliado"), faixa do tipo, historico proprio, link pendente
 * (fallback de ate 3%), frescor, identidade, dedup de 24 h, cota do Achado por loja, cota suave de tipo (30%), rodizio de tipos e pool.
 */
import {
  RULES,
  achadoQuotaBlock,
  applyLimits,
  evaluateProductV2,
  productDedupBlock,
  tipoShare,
  type Candidate,
  type OfferFact,
  type ProductFacts,
  type SentRecord,
} from '../src/lib/messaging/group-rules';
import { medianaPorTipo, POOL, rodizioPorTipo, selecionarPool, type PoolRow } from '../src/lib/messaging/pool-diversidade';
import { textProblems } from '../src/lib/messaging/group-messages';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, extra ?? '');
  }
}

const H = 3600_000;
const MIN = 60_000;
const NOW = new Date('2026-11-12T15:00:00Z'); // 12/11 12:00 em Brasilia (formacao ainda vale ate 30/11)
const AD = '#publicidade';
const ctx = { now: NOW, maxAgeMin: 180, adTag: AD, amazonMaxAgeMin: 60, amazonPaused: false, achado: true };

function offer(over: Partial<OfferFact> & { offerId: string; priceCents: number }): OfferFact {
  return {
    slug: `slug-${over.offerId}`, title: 'Smart TV Samsung 50 Crystal UHD 4K', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
    sellerId: `s-${over.offerId}`, sellerReputation: '5_green', sellerTotalSales: 900,
    confirmedAt: new Date(NOW.getTime() - 10 * MIN), priceSince: new Date(NOW.getTime() - 3 * H),
    affiliateLinkPending: false, officialLink: true, affiliateUrl: 'https://meli.la/AbCd123', quarantined: false, missCount: 0, returnedAt: null, ...over,
  };
}
function plus(over: Partial<ProductFacts> = {}): ProductFacts {
  return {
    masterProductId: 'tv1', masterName: 'Smart TV Samsung 50 Crystal UHD 4K', vertical: 'eletroeletronicos', productType: 'product', platformLabel: null, format: 'unknown', catalogGate: 'approved',
    offers: [offer({ offerId: 'a', priceCents: 280000 })],
    avg: null, minEvent: null, record: null, series: [], amazonSeries: [],
    tipo: 'smart-tv', tipoMedianCents: 280000, tipoSample: 12,
    ...over,
  };
}
const ac = (r: ReturnType<typeof evaluateProductV2>) => r.candidates.find((c) => c.trigger === 'AC');
const acBlocked = (r: ReturnType<typeof evaluateProductV2>) => r.blocked.find((b) => b.trigger === 'AC');

// ---------------------------------------------------------------------------
// 1) Achado: gera, texto sem comparacao, liga/desliga
// ---------------------------------------------------------------------------
let r = evaluateProductV2(plus(), ctx);
const c1 = ac(r);
ok(!!c1 && c1.cls === 'insight' && c1.status === 'auto' && c1.sendable && !c1.held, 'Achado: produto de 1 vendedor gera AC insight, automatico e enviavel', c1);
ok(!!c1 && c1.avgCents == null && c1.belowAvgPct == null && c1.dropPct == null, 'Achado: sem media, sem % e sem queda no candidato');
for (const ch of ['telegram', 'whatsapp'] as const) {
  const t = c1?.texts[ch] ?? '';
  ok(t.includes('R$ 2.800,00') && /conferido/i.test(t), `Achado (${ch}): tem preco e horario de conferencia`, t);
  ok(!/%|abaixo|m[eé]dia|desconto|afiliad|imperd|promo/i.test(t.replace(/https?:\/\/\S+/g, '')), `Achado (${ch}): sem %, abaixo, media, desconto, afiliado, promocao`, t);
  ok(!/[uú]nica oferta|ofertas? ativas?|amostra|acompanhamos|menor pre[cç]o/i.test(t), `Achado (${ch}): 1 oferta NAO cita amostra, "unica oferta" nem alega "menor preco" (metodologia so interna)`, t);
  ok(textProblems(t, ch === 'telegram' ? 'tg' : 'wa').length === 0, `Achado (${ch}): barreira de texto limpa`, textProblems(t, ch === 'telegram' ? 'tg' : 'wa'));
}
ok(!!c1 && c1.tipo === 'smart-tv', 'Achado: candidato leva o tipo (cota de diversidade)');
ok(!!c1 && c1.dedupKey.startsWith('tv1:AC:'), 'Achado: dedupKey proprio (AC)');
r = evaluateProductV2(plus(), { ...ctx, achado: false });
ok(!ac(r) && !acBlocked(r), 'Achado desligado (ctx.achado=false): nada de AC, nem bloqueio');
r = evaluateProductV2(plus(), { now: NOW, maxAgeMin: 180, adTag: AD });
ok(!ac(r), 'Achado ausente no contexto = desligado (comportamento de sempre)');
const gm = (over: Partial<ProductFacts> = {}) => plus({
  vertical: 'games', productType: 'game', platformLabel: 'Switch', masterName: 'Jogo Mario Kart 8 Deluxe Switch', format: 'physical', tipo: null, tipoMedianCents: null, tipoSample: 0,
  offers: [offer({ offerId: 'a', priceCents: 28000, title: 'Jogo Mario Kart 8 Deluxe Switch' })], platMedianCents: 25000, platSample: 40, semMedia: true, ...over,
});
r = evaluateProductV2(gm(), ctx);
const g1 = ac(r);
ok(!!g1 && g1.status === 'auto' && g1.sendable && g1.avgCents == null && g1.belowAvgPct == null, 'Achado vale para games SEM media calculada (2026-11-12): preco, loja, sem comparacao', acBlocked(r)?.reasons);
for (const ch of ['telegram', 'whatsapp'] as const) {
  const t = g1?.texts[ch] ?? '';
  ok(!/%|abaixo|m[eé]dia|desconto|afiliad|menor pre[cç]o/i.test(t.replace(/https?:\/\/\S+/g, '')), `Achado games (${ch}): sem comparacao nem alegacao`, t);
}
r = evaluateProductV2(gm({ semMedia: false }), ctx);
ok(!ac(r) && !acBlocked(r), 'Achado games: com media calculada NAO vale (regra geral de 10% continua)');
r = evaluateProductV2(gm({ semMedia: undefined }), ctx);
ok(!ac(r), 'Achado games: sem o fato semMedia nao vale (conservador)');
r = evaluateProductV2(gm({ offers: [offer({ offerId: 'a', priceCents: 6000, title: 'Jogo Mario Kart 8 Deluxe Switch' })] }), ctx);
ok(!ac(r) && /preco_abaixo_de_025x_a_mediana_da_plataforma/.test((acBlocked(r)?.reasons ?? []).join('+')), 'Achado games: preco < 0,25x a mediana da plataforma bloqueia');
r = evaluateProductV2(gm({ offers: [offer({ offerId: 'a', priceCents: 100001, title: 'Jogo Mario Kart 8 Deluxe Switch' })] }), ctx);
ok(!ac(r), 'Achado games: preco > 4x a mediana da plataforma bloqueia');
r = evaluateProductV2(gm({ platSample: 9 }), ctx);
ok(!ac(r), 'Achado games: amostra da plataforma < 10 bloqueia');
r = evaluateProductV2(gm({ platformLabel: null }), ctx);
ok(!ac(r), 'Achado games: plataforma desconhecida continua barrada pelo escopo');
r = evaluateProductV2(gm(), { ...ctx, achado: false });
ok(!ac(r), 'Achado games: desligado com ctx.achado=false');

// ---------------------------------------------------------------------------
// 2) Achado: portoes
// ---------------------------------------------------------------------------
const reasons = (x: ReturnType<typeof evaluateProductV2>) => (acBlocked(x)?.reasons ?? []).join('+');
r = evaluateProductV2(plus({ tipoSample: 4 }), ctx);
ok(!ac(r) && /amostra_do_tipo_menor_que_5/.test(reasons(r)), 'Achado: amostra do tipo < 5 masters bloqueia', reasons(r));
r = evaluateProductV2(plus({ tipoSample: 5 }), ctx);
ok(!!ac(r), 'Achado: amostra do tipo = 5 passa');
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 700001 })] }), ctx);
ok(!ac(r) && /preco_acima_de_25x_a_mediana_do_tipo/.test(reasons(r)), 'Achado: preco > 2,5x a mediana do tipo bloqueia (anti-agio)', reasons(r));
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 700000 })] }), ctx);
ok(!!ac(r), 'Achado: exatamente 2,5x a mediana do tipo passa');
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 139999 })] }), ctx);
ok(!ac(r) && /preco_abaixo_de_05x_a_mediana_do_tipo/.test(reasons(r)), 'Achado: preco < 0,5x a mediana do tipo bloqueia (erro de coleta/kit)', reasons(r));
r = evaluateProductV2(plus({ tipo: 'outros' }), ctx);
ok(!ac(r) && /tipo_nao_classificado/.test(reasons(r)), 'Achado: tipo "outros" bloqueia');
r = evaluateProductV2(plus({ tipo: null }), ctx);
ok(!ac(r) && /tipo_nao_classificado/.test(reasons(r)), 'Achado: sem tipo bloqueia');
// historico proprio
const day = (i: number, v: number) => ({ day: `2026-11-0${i}`, minCents: v });
const hist5 = [day(5, 270000), day(6, 270000), day(7, 270000), day(8, 270000), day(9, 270000)];
r = evaluateProductV2(plus({ series: hist5, offers: [offer({ offerId: 'a', priceCents: 297001 })] }), ctx);
ok(!ac(r) && /acima_de_110pct_do_historico_proprio/.test(reasons(r)), 'Achado: preco > 1,10x a mediana do historico proprio (>= 3 dias) bloqueia', reasons(r));
r = evaluateProductV2(plus({ series: hist5, offers: [offer({ offerId: 'a', priceCents: 297000 })] }), ctx);
ok(!!ac(r), 'Achado: exatamente 1,10x do historico proprio passa');
r = evaluateProductV2(plus({ series: hist5, offers: [offer({ offerId: 'a', priceCents: 134999 })] }), { ...ctx });
ok(!ac(r), 'Achado: preco < 0,5x do historico proprio bloqueia');
r = evaluateProductV2(plus({ series: hist5.slice(0, 2), offers: [offer({ offerId: 'a', priceCents: 297001 })] }), ctx);
ok(!!ac(r), 'Achado: historico com 2 dias nao e exigido (primeira vez vista)');
// frescor, identidade, link
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000, confirmedAt: new Date(NOW.getTime() - 200 * MIN) })] }), ctx);
ok(!ac(r), 'Achado: preco confirmado ha 200 min (> 180) bloqueia');
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000, title: 'Smart TV Samsung 50 Crystal UHD 4K Open Box' })] }), ctx);
ok(!ac(r), 'Achado: Open Box/usado bloqueia (so produto novo)');
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000, identidade: 'incerta' })] }), ctx);
ok(!ac(r), 'Achado: identidade incerta bloqueia', reasons(r));
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000, affiliateLinkPending: true })] }), ctx);
ok(!ac(r) && /nenhuma_oferta_valida_com_link/.test(reasons(r)), 'Achado: sem link oficial bloqueia', reasons(r));
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000, quarantined: true })] }), ctx);
ok(!ac(r), 'Achado: quarentena bloqueia');
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000, networkSlug: 'amazon', networkName: 'Amazon' })] }), ctx);
ok(!ac(r), 'Achado: Amazon fica fora');
r = evaluateProductV2(plus({ catalogGate: 'review' }), ctx);
ok(!ac(r), 'Achado: porteiro do catalogo em revisao bloqueia');
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000, sellerReputation: '3_yellow' })] }), ctx);
ok(!!ac(r), 'Achado: vendedor amarelo entra (so reputacao baixa barra)');
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000, sellerReputation: '2_orange' })] }), ctx);
ok(!ac(r), 'Achado: reputacao baixa (laranja) bloqueia');
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000, sellerReputation: '5_green', sellerTotalSales: 3 })] }), ctx);
ok(!!ac(r) && ac(r)!.status !== 'review', 'Achado: vendedor com poucas vendas entra (cliente decide)', ac(r)?.status);

// ---------------------------------------------------------------------------
// 3) Achado: link pendente na mais barata (fallback ate 3%) e texto "menor preco"
// ---------------------------------------------------------------------------
const cheapNoLink = offer({ offerId: 'a', priceCents: 280000, affiliateLinkPending: true, officialLink: false, affiliateUrl: null });
r = evaluateProductV2(plus({ offers: [cheapNoLink, offer({ offerId: 'b', priceCents: 288400 })] }), ctx); // 3,0% acima
const fb = ac(r);
ok(!!fb && fb.offerIds[0] === 'b', 'fallback: usa a 2a mais barata COM link quando esta a ate 3% da mais barata', r.blocked);
ok(!!fb && !/menor pre[cç]o|ofertas ativas|amostra/i.test(fb.texts.telegram), 'fallback: o texto NAO diz "menor preco" nem cita quantas ofertas acompanha', fb?.texts.telegram);
r = evaluateProductV2(plus({ offers: [cheapNoLink, offer({ offerId: 'b', priceCents: 288401 })] }), ctx); // acima de 3%
ok(!ac(r) && /mais_barata_sem_link_/.test(reasons(r)), 'fallback: 2a mais barata acima de 3% NAO e anunciada', reasons(r));
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 280000 }), offer({ offerId: 'b', priceCents: 300000 })] }), ctx);
const lowest = ac(r);
ok(!!lowest && lowest.offerIds[0] === 'a' && !/menor pre[cç]o|ofertas ativas|amostra/i.test(lowest.texts.telegram), 'Achado com amostra pequena (2 ofertas) nao alega "menor preco" nem cita a amostra', lowest?.texts.telegram);
ok(!!lowest && !/%|abaixo|m[eé]dia|desconto/i.test(lowest.texts.whatsapp.replace(/https?:\/\/\S+/g, '')), 'Achado com 2 ofertas tambem nao compara nem alega desconto');
// G2 sendavel tem prioridade: nao gera AC para o mesmo produto
r = evaluateProductV2(plus({ offers: [offer({ offerId: 'a', priceCents: 10000 }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })], tipoMedianCents: 11000 }), ctx);
ok(r.candidates.some((c) => c.trigger === 'G2' && c.sendable) && !ac(r), 'produto que ja gera G2 enviavel nao gera Achado em duplicidade');

// ---------------------------------------------------------------------------
// 4) Dedup de 24 h do Achado; cota do Achado por loja
// ---------------------------------------------------------------------------
const rec = (over: Partial<SentRecord> & { sentAt: Date }): SentRecord => ({ masterProductId: 'x', priceCents: 1000, trigger: 'G2', cls: 'insight', vertical: 'eletroeletronicos', tipo: 'soundbar', ...over });
const acC = { masterProductId: 'tv1', priceCents: 280000, trigger: 'AC' as const };
ok(productDedupBlock(acC, [rec({ masterProductId: 'tv1', sentAt: new Date(NOW.getTime() - 23 * H) })], NOW) != null, 'Achado: mesmo produto ha 23 h (qualquer gatilho) bloqueia');
ok(productDedupBlock(acC, [rec({ masterProductId: 'tv1', sentAt: new Date(NOW.getTime() - 25 * H) })], NOW) == null, 'Achado: mesmo produto ha 25 h libera');
ok(productDedupBlock({ ...acC, trigger: 'G2' as const }, [rec({ masterProductId: 'tv1', sentAt: new Date(NOW.getTime() - 61 * MIN) })], NOW) == null, 'G2 continua em 1 h (61 min libera)');
ok(productDedupBlock({ ...acC, trigger: 'G2' as const }, [rec({ masterProductId: 'tv1', sentAt: new Date(NOW.getTime() - 59 * MIN) })], NOW) != null, 'G2 continua em 1 h (59 min bloqueia)');
ok(productDedupBlock({ ...acC, trigger: 'G2' as const }, [rec({ masterProductId: 'tv1', trigger: 'AC', sentAt: new Date(NOW.getTime() - 30 * MIN) })], NOW) != null, 'G2 logo apos Achado do mesmo produto (30 min) bloqueia');

const acRec = (min: number, vert = 'eletroeletronicos') => rec({ masterProductId: `ac${min}${vert}`, trigger: 'AC', vertical: vert, tipo: 'smart-tv', sentAt: new Date(NOW.getTime() - min * MIN) });
const others = (n: number, vert = 'eletroeletronicos') => Array.from({ length: n }, (_, i) => rec({ masterProductId: `o${i}${vert}`, vertical: vert, sentAt: new Date(NOW.getTime() - (90 + i * 20) * MIN) }));
ok(achadoQuotaBlock('eletroeletronicos', [], NOW) == null, 'cota do Achado: loja sem historico libera');
ok(achadoQuotaBlock('eletroeletronicos', [acRec(100), acRec(200), acRec(300)], NOW) == null, 'cota do Achado (2026-11-12): a cota diaria acompanha o teto horario; 3 no dia nao bloqueiam');
ok(achadoQuotaBlock('eletroeletronicos', [acRec(100), acRec(200)], NOW) == null, 'cota do Achado: o 3o do dia libera');
ok(achadoQuotaBlock('eletroeletronicos', [acRec(100), acRec(200), acRec(300), ...others(9)], NOW) == null, 'cota do Achado: 3 achados com 9 outras seguem livres (teto e por hora)');
ok(achadoQuotaBlock('eletroeletronicos', [acRec(100), acRec(200), acRec(300), ...others(12)], NOW) == null, 'cota do Achado: 12 outras => ate 4 achados (25%)');
ok(achadoQuotaBlock('eletroeletronicos', [acRec(10), acRec(15), acRec(20), acRec(25), acRec(30), acRec(35), ...others(30)], NOW)?.startsWith('achado_maximo_6_por_hora') === true, 'cota do Achado: 6 por hora (GROUP_AC_POR_HORA, padrao)');
ok(achadoQuotaBlock('eletroeletronicos', [acRec(10), acRec(40), ...others(30)], NOW) == null, 'cota do Achado: 2 na hora ja nao bloqueiam');
ok(achadoQuotaBlock('livros', [acRec(100), acRec(200), acRec(300)], NOW) == null, 'cota do Achado: uma loja nao consome a cota da outra');

// ---------------------------------------------------------------------------
// 5) Diversidade no plano: cota suave de tipo (30%) e rodizio
// ---------------------------------------------------------------------------
const base = ac(evaluateProductV2(plus(), ctx)) as Candidate;
const mk = (over: Partial<Candidate>): Candidate => ({ ...base, ...over, messageKey: over.messageKey ?? `k-${over.masterProductId}` });
const sb = mk({ masterProductId: 'sb1', trigger: 'G2', tipo: 'soundbar', moveScore: 20, belowAvgPct: 20, avgCents: 100000, priceCents: 80000, dedupKey: 'sb1:G2:w' });
const tv = mk({ masterProductId: 'tv9', trigger: 'AC', tipo: 'smart-tv', moveScore: 0, dedupKey: 'tv9:AC:w' });
// loja com 10 mensagens em 24 h, 4 de soundbar (40%)
const hist10: SentRecord[] = Array.from({ length: 10 }, (_, i) => rec({ masterProductId: `h${i}`, tipo: i < 4 ? 'soundbar' : `t${i}`, sentAt: new Date(NOW.getTime() - (120 + i * 30) * MIN) }));
ok(tipoShare('eletroeletronicos', 'soundbar', hist10, NOW).pct === 40 && tipoShare('eletroeletronicos', 'soundbar', hist10, NOW).total === 10, 'tipoShare: 4 de 10 = 40%');
let plan = applyLimits([sb, tv], hist10, NOW);
ok(plan.next?.masterProductId === 'tv9', 'tipo dominante (40% >= 30%) cede a vez ao Achado de outro tipo', plan.next?.masterProductId);
ok(plan.deferred.some((d) => d.messageKey === sb.messageKey && /^tipo_soundbar_acima_de_30pct/.test(d.reason)), 'o adiado informa o motivo da cota de tipo', plan.deferred);
plan = applyLimits([sb], hist10, NOW);
ok(plan.next?.masterProductId === 'sb1', 'cota SUAVE: sem alternativa de outro tipo, o tipo dominante ainda sai (canal nao para)');
const histCurto: SentRecord[] = hist10.slice(0, 5).map((h, i) => ({ ...h, tipo: i < 3 ? 'soundbar' : 't' }));
plan = applyLimits([sb, tv], histCurto, NOW);
ok(plan.next?.masterProductId !== undefined && !plan.deferred.some((d) => /^tipo_/.test(d.reason)), 'com menos de 6 envios na loja a cota de tipo ainda nao vale');
// alerta (queda real) nao e freado
const alerta = mk({ masterProductId: 'al1', trigger: 'OK1', cls: 'alerta', tipo: 'soundbar', moveScore: 9, dedupKey: 'al1:OK1:w' });
plan = applyLimits([alerta, tv], hist10, NOW);
ok(plan.next?.masterProductId === 'al1', 'alerta de queda real nao e freado pela cota de tipo');
// o Achado (sem comparacao) nunca passa na frente de um insight com comparacao real, mesmo de tipo mais enviado
plan = applyLimits([sb, tv], [], NOW);
ok(plan.next?.masterProductId === 'sb1', 'Achado nao passa na frente de G2 (insight com comparacao real)', plan.next?.masterProductId);
// rodizio: tipo menos enviado vai primeiro dentro do insight, mesmo com moveScore menor
const histR: SentRecord[] = [rec({ masterProductId: 'r1', tipo: 'soundbar', sentAt: new Date(NOW.getTime() - 300 * MIN) }), rec({ masterProductId: 'r2', tipo: 'soundbar', sentAt: new Date(NOW.getTime() - 400 * MIN) }), rec({ masterProductId: 'r3', tipo: 'fones', sentAt: new Date(NOW.getTime() - 500 * MIN) })];
const tvG2 = mk({ masterProductId: 'tv9g', trigger: 'G2', tipo: 'smart-tv', moveScore: 3, dedupKey: 'tv9g:G2:w' });
plan = applyLimits([sb, tvG2], histR, NOW);
ok(plan.next?.masterProductId === 'tv9g', 'rodizio: tipo com 0 envios hoje (smart-tv) vai antes de soundbar (2 envios), mesmo com moveScore menor', plan.next?.masterProductId);
plan = applyLimits([sb, tv], [], NOW);
ok(plan.next?.masterProductId !== undefined, 'plano sem historico continua escolhendo');
// determinismo
const p1 = applyLimits([sb, tvG2], histR, NOW).next?.messageKey;
const p2 = applyLimits([tvG2, sb], histR, NOW).next?.messageKey;
ok(p1 === p2, 'plano deterministico: a ordem de entrada nao muda o vencedor');
// cota de uma loja nao vaza para outra
const tvOther = mk({ masterProductId: 'lv1', trigger: 'G2', tipo: 'soundbar', vertical: 'livros', moveScore: 5, dedupKey: 'lv1:G2:w' });
plan = applyLimits([tvOther], hist10, NOW);
ok(plan.next?.masterProductId === 'lv1', 'a cota de tipo de uma loja nao vaza para outra loja');
// espaçamento por chat e dedup continuam valendo
plan = applyLimits([tv], [rec({ masterProductId: 'zzz', sentAt: new Date(NOW.getTime() - 1000) })], NOW);
ok(plan.next == null && plan.deferred.some((d) => /^intervalo_chat_/.test(d.reason)), 'espacamento de 3 s por chat continua valendo');

// ---------------------------------------------------------------------------
// 6) Pool: rodizio por tipo, Achado, determinismo
// ---------------------------------------------------------------------------
const row = (i: number, v: string, name: string, rr = 2): PoolRow => ({ mid: `m-${v}-${name.slice(0, 4)}-${i}`, v, r: rr, name });
const airfryers = Array.from({ length: 200 }, (_, i) => row(i, 'eletrodomesticos', `Air Fryer Modelo ${i} Digital`));
const geladeiras = Array.from({ length: 6 }, (_, i) => row(i, 'eletrodomesticos', `Geladeira Frost Free ${i} 400 litros`));
const fogoes = Array.from({ length: 4 }, (_, i) => row(i, 'eletrodomesticos', `Fogao 5 bocas ${i}`));
const main = [...airfryers, ...geladeiras, ...fogoes];
const sel = rodizioPorTipo(main, '2026-11-12T15', {}, POOL.PLUS_MAIN);
ok(sel.length === POOL.PLUS_MAIN, `pool: rodizio devolve exatamente ${POOL.PLUS_MAIN}`, sel.length);
ok(sel.filter((x) => /Geladeira/.test(x.name)).length === 6 && sel.filter((x) => /Fogao/.test(x.name)).length === 4, 'pool: tipos pequenos entram inteiros (geladeira 6, fogao 4) e nao sao engolidos pelas 200 air fryers');
ok(sel.filter((x) => /Air Fryer/.test(x.name)).length === POOL.PLUS_MAIN - 10, 'pool: o tipo grande preenche so o resto');
ok(new Set(sel.map((x) => x.mid)).size === sel.length, 'pool: sem duplicata');
const sel2 = rodizioPorTipo([...main].reverse(), '2026-11-12T15', {}, POOL.PLUS_MAIN);
ok(JSON.stringify(sel.map((x) => x.mid)) === JSON.stringify(sel2.map((x) => x.mid)), 'pool: determinista (a ordem de entrada nao importa)');
const sel3 = rodizioPorTipo(main, '2026-11-12T16', {}, POOL.PLUS_MAIN);
ok(JSON.stringify(sel.map((x) => x.mid)) !== JSON.stringify(sel3.map((x) => x.mid)), 'pool: o rodizio muda a cada hora (nao premia sempre os mesmos)');
const first = rodizioPorTipo(main, 'h', { 'eletrodomesticos|air-fryer': 11, 'eletrodomesticos|geladeira-freezer': 1, 'eletrodomesticos|fogao-cooktop': 0 }, 1);
ok(/Fogao/.test(first[0].name), 'pool: com limite 1 abre o tipo MENOS enviado em 24 h (fogao 0 < geladeira 1 < air fryer 11)', first[0]?.name);
const full = selecionarPool({
  main: [...main, ...Array.from({ length: 300 }, (_, i) => row(i, 'games', `Jogo ${i} Switch`, 2)), row(1, 'eletroeletronicos', 'Smart TV 50 4K', 1)],
  achado: [row(1, 'eletroeletronicos', 'Smart TV LG 43 4K'), row(2, 'eletroeletronicos', 'Produto Qualquer Estranho'), ...Array.from({ length: 80 }, (_, i) => row(i, 'eletroeletronicos', `Soundbar Modelo ${i}`))],
  hourKey: '2026-11-12T15', sends: {}, achadoOn: true,
});
ok(full.filter((id) => id.startsWith('m-games')).length === POOL.GAMES, 'pool: games segue com 220');
ok(full.includes('m-eletroeletronicos-Smar-1') && full.includes('m-eletroeletronicos-Smar-1'.replace('Smar-1', 'Smar-1')), 'pool: evento de queda real (r=1) sempre entra');
ok(new Set(full).size === full.length, 'pool final: sem duplicata');
const achadoIds = full.filter((id) => /m-eletroeletronicos/.test(id));
ok(achadoIds.length <= POOL.PLUS_ACHADO + 1, `pool: no maximo ${POOL.PLUS_ACHADO} extras de Achado por loja (+ o evento)`, achadoIds.length);
ok(!achadoIds.some((id) => /Prod/.test(id)), 'pool: tipo "outros" nao entra no grupo Achado (nao classificavel)');
ok(achadoIds.some((id) => /Smar/.test(id)), 'pool: a Smart TV de 1 vendedor entra no grupo Achado (antes nunca entrava)');
const off = selecionarPool({ main, achado: [row(1, 'eletroeletronicos', 'Smart TV LG 43 4K')], hourKey: 'h', sends: {}, achadoOn: false });
ok(!off.some((id) => /m-eletroeletronicos/.test(id)), 'pool: Achado desligado nao acrescenta nada');
const med = medianaPorTipo([
  { v: 'eletroeletronicos', name: 'Smart TV A 50', minCents: 100 }, { v: 'eletroeletronicos', name: 'Smart TV B 55', minCents: 300 }, { v: 'eletroeletronicos', name: 'Smart TV C 43', minCents: 200 },
  { v: 'games', name: 'Jogo', minCents: 5 }, { v: 'eletroeletronicos', name: 'Smart TV zero', minCents: 0 },
]);
ok(med.get('eletroeletronicos|smart-tv')?.median === 200 && med.get('eletroeletronicos|smart-tv')?.n === 3 && ![...med.keys()].some((k) => k.startsWith('games')), 'medianaPorTipo: mediana do menor preco por master, ignora games e preco zero');

console.log(`${total - fails}/${total} verificacoes ok (diversidade e achado)`);
if (fails) {
  console.error(`${fails} falha(s)`);
  process.exit(1);
}
