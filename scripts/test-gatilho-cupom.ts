/**
 * Teste do GATILHO CUPOM ("Cupom ativo" por oferta; dono, 2026-11-12). Funcoes puras: SEM banco, SEM rede, SEM token.
 * Uso: npx tsx --conditions=react-server scripts/test-gatilho-cupom.ts  (codigo 1 se algo falhar)
 * Os numeros sao fixtures de funcao pura, marcadas como tais (nada e gravado nem exibido ao cliente).
 * Cobre: geracao por oferta do cupom (nao a mais barata), as barras (leitura velha, preco mudou, sem desconto, Amazon, link pendente,
 * validade, retido por faixa), texto aprovado (nome, quanto da, preco com cupom, como ativar, 'Preco lido na pagina do anuncio' + horario,
 * sem '% OFF' e sem 'de R$ por R$'), prioridade acima de insight/achado, dedup de 1 h por produto e por cupom, independencia entre cupom e
 * preco, cota por loja e o pool com cota de cupom por loja.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  RULES,
  applyLimits,
  cupomDedupBlock,
  cupomQuotaBlock,
  evaluateCoupon,
  evaluateProductV2,
  productDedupBlock,
  type Candidate,
  type CouponOfferFact,
  type OfferFact,
  type ProductFacts,
  type SentRecord,
} from '../src/lib/messaging/group-rules';
import { textProblems } from '../src/lib/messaging/group-messages';
import { POOL, selecionarPool, type PoolRow } from '../src/lib/messaging/pool-diversidade';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, extra ?? '');
  }
}

const MIN = 60_000;
const H = 3600_000;
const NOW = new Date('2026-11-12T15:00:00Z'); // 12:00 em Brasilia
const ctx = { now: NOW, maxAgeMin: 180, adTag: '#publicidade', amazonMaxAgeMin: 60, amazonPaused: false };

function offer(over: Partial<OfferFact> & { offerId: string; priceCents: number }): OfferFact {
  return {
    slug: `slug-${over.offerId}`, title: 'Smart TV Samsung 50 Crystal UHD 4K', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
    sellerId: `s-${over.offerId}`, sellerReputation: '5_green', sellerTotalSales: 900,
    confirmedAt: new Date(NOW.getTime() - 10 * MIN), priceSince: new Date(NOW.getTime() - 3 * H),
    affiliateLinkPending: false, officialLink: true, affiliateUrl: 'https://meli.la/AbCd123', quarantined: false, missCount: 0, returnedAt: null, ...over,
  };
}
function coupon(over: Partial<CouponOfferFact> & { offerId: string }): CouponOfferFact {
  const offerPriceCents = over.offerPriceCents ?? 300000;
  const finalCents = over.finalCents ?? 270000;
  return {
    couponRef: over.offerId, name: '10% de desconto', offerPriceCents, finalCents, offCents: offerPriceCents - finalCents, pct: Math.round(((offerPriceCents - finalCents) / offerPriceCents) * 1000) / 10,
    minOrderCents: null, maxDiscountCents: null, ruleKnown: false, conditions: 'Desconto de R$ 300,00 (10%): você paga R$ 2.700,00. Ative em Cupons no Mercado Livre antes de pagar. Preço lido na página do anúncio',
    activation: '1. Abra o anúncio; 2. Em Cupons, ative o cupom de R$ 300,00; 3. Finalize a compra.', howTo: ['Abra o anúncio', 'Em Cupons, ative o cupom de R$ 300,00', 'Finalize a compra'], named: false, readAt: new Date(NOW.getTime() - 20 * MIN), expiresAt: null, ...over,
  };
}
function prod(over: Partial<ProductFacts> = {}): ProductFacts {
  return {
    masterProductId: 'tv1', masterName: 'Smart TV Samsung 50 Crystal UHD 4K', vertical: 'eletroeletronicos', productType: 'product', platformLabel: null, format: 'unknown', catalogGate: 'approved',
    offers: [offer({ offerId: 'cheap', priceCents: 280000 }), offer({ offerId: 'cup', priceCents: 300000 }), offer({ offerId: 'mid', priceCents: 310000 })],
    avg: null, minEvent: null, record: null, series: [], amazonSeries: [], tipo: 'smart-tv', tipoMedianCents: 290000, tipoSample: 12,
    coupons: [coupon({ offerId: 'cup' })],
    ...over,
  };
}
const cup = (r: { candidates: Candidate[] }) => r.candidates.find((c) => c.trigger === 'CUPOM');
const blockedCup = (r: { blocked: Array<{ trigger: string; reasons: string[] }> }) => r.blocked.filter((b) => b.trigger === 'CUPOM');

// ---------------------------------------------------------------------------
// 1) Geracao: a mensagem usa a oferta DO CUPOM, nao a mais barata
// ---------------------------------------------------------------------------
{
  const r = evaluateProductV2(prod(), ctx);
  const c = cup(r);
  ok(!!c, 'gera candidato CUPOM');
  ok(c?.cls === 'cupom' && c?.trigger === 'CUPOM', 'classe cupom / gatilho CUPOM');
  ok(c?.offerIds[0] === 'cup', 'usa a oferta do cupom (nao a mais barata)', c?.offerIds);
  ok(c?.priceCents === 300000, 'priceCents do candidato = preco do anuncio sem cupom (referencia da reconferencia)');
  ok(c?.sendable === true && c?.status === 'auto' && c?.held === false, 'enviavel, automatico, nao retido', [c?.notSendableReason, c?.reviewReasons, c?.heldReasons]);
  ok(c?.couponRef === 'cup' && c?.couponInfo?.annKind === 'anuncio' && c?.couponInfo?.couponRef === 'cup', 'registro da divulgacao (couponInfo) para o guardiao');
  ok(!!c?.dedupKey.includes(':CUPOM:'), 'dedupKey do gatilho');
  const tg = c?.texts.telegram ?? '';
  const wa = c?.texts.whatsapp ?? '';
  ok(tg.includes('CUPOM ATIVO') && tg.includes('10% de desconto'), 'Telegram: titulo e nome do cupom');
  ok(tg.includes('R$ 2.700,00') && tg.includes('com o cupom'), 'Telegram: preco COM cupom rotulado', tg);
  ok(tg.includes('R$ 300,00 (10%)') && tg.includes('R$ 3.000,00'), 'Telegram: quanto da (R$ e %) e o preco do anuncio sem cupom');
  ok(tg.includes('Como usar:') && tg.includes('Em Cupons, ative o cupom') && tg.includes('Finalize a compra'), 'Telegram: como usar em passos');
  ok(/Preço lido na página do anúncio em \d{2}\/\d{2} às \d{2}:\d{2}/.test(tg), 'Telegram: "Preço lido na página do anúncio" com horário da leitura', tg);
  ok(tg.includes('11/11 às') === false && tg.includes('12/11 às 11:40'), 'horario = o da leitura (11:40 BRT), nao o de agora');
  ok(tg.includes('regra completa na tela do cupom'), 'regra nao lida: avisa que a regra completa esta na tela do cupom');
  ok(!tg.includes('Outra oferta, sem cupom'), 'sem outra oferta mais barata que o preco final: a linha nao aparece');
  ok(!/% ?OFF/i.test(tg) && !/% ?OFF/i.test(wa), 'sem "% OFF"');
  ok(!/\bde\s+R\$\s*[\d.,]+\s+por\s+R\$/i.test(tg), 'sem "de R$ por R$"');
  ok(!/afiliad/i.test(tg), 'sem a palavra proibida');
  ok(textProblems(tg, 'tg').length === 0 && textProblems(wa, 'wa').length === 0, 'barreira de termos limpa', [textProblems(tg, 'tg'), textProblems(wa, 'wa')]);
  ok(!/<[a-z]/i.test(wa) && wa.includes('*CUPOM ATIVO*'), 'WhatsApp sem HTML');
  ok(!tg.includes('menor preço') && !tg.includes('abaixo da média'), 'nao alega menor preco nem media');
  ok(c?.avgCents === null && c?.belowAvgPct === null, 'sem comparacao com a media');
  // a mensagem de preco normal NAO e afetada: as de preco (se houver) continuam usando a oferta mais barata, nunca a do cupom
  ok(r.candidates.filter((x) => x.trigger !== 'CUPOM').every((x) => x.offerIds[0] !== 'cup'), 'precos continuam com a mais barata', r.candidates.map((x) => [x.trigger, x.offerIds]));
}

// regra lida: mostra minimo e teto; outra oferta mais barata que o preco final e informada
{
  const p = prod({
    offers: [offer({ offerId: 'cheap', priceCents: 250000 }), offer({ offerId: 'cup', priceCents: 300000 }), offer({ offerId: 'mid', priceCents: 310000 })],
    coupons: [coupon({ offerId: 'cup', ruleKnown: true, minOrderCents: 100000, maxDiscountCents: 40000 })],
  });
  const c = cup(evaluateProductV2(p, ctx));
  const tg = c?.texts.telegram ?? '';
  ok(tg.includes('Compra mínima:') && tg.includes('R$ 1.000,00') && tg.includes('Desconto máximo:') && tg.includes('R$ 400,00'), 'minimo e teto so quando lidos');
  ok(!tg.includes('regra completa na tela do cupom'), 'regra lida: sem o aviso');
  ok(tg.includes('Outra oferta, sem cupom') && tg.includes('R$ 2.500,00'), 'transparencia: outra oferta sem cupom abaixo do preco final', tg);
}

// ---------------------------------------------------------------------------
// 2) Barras (a agulha ja barrou na origem; aqui as barras puras e de juiz)
// ---------------------------------------------------------------------------
const noCup = (p: ProductFacts, why: string, label: string) => {
  const r = evaluateProductV2(p, ctx);
  ok(!cup(r), `${label}: nao gera`);
  ok(blockedCup(r).some((b) => b.reasons.some((x) => x.includes(why))), `${label}: motivo ${why}`, blockedCup(r));
};
noCup(prod({ coupons: [coupon({ offerId: 'cup', readAt: new Date(NOW.getTime() - 130 * MIN) })] }), 'cupom_leitura_antiga', 'leitura de 130 min');
noCup(prod({ coupons: [coupon({ offerId: 'cup', offerPriceCents: 305000, finalCents: 275000 })] }), 'preco_do_anuncio_mudou_apos_a_leitura', 'preco do anuncio mudou depois da leitura');
noCup(prod({ coupons: [coupon({ offerId: 'cup', finalCents: 300000, offCents: 0, pct: 0 })] }), 'preco_com_cupom_nao_menor', 'preco com cupom nao menor');
noCup(prod({ coupons: [coupon({ offerId: 'cup', expiresAt: new Date(NOW.getTime() + 5 * MIN) })] }), 'cupom_validade_proxima_do_fim', 'validade acaba em 5 min');
noCup(prod({ coupons: [coupon({ offerId: 'cup', finalCents: 80000, offCents: 220000, pct: 73.3 })] }), 'desconto_implausivel', 'desconto de 73%');
noCup(prod({ coupons: [coupon({ offerId: 'fantasma' })] }), 'oferta_do_cupom_fora_das_ofertas_vivas', 'oferta do cupom nao esta viva');
noCup(prod({ offers: [offer({ offerId: 'cheap', priceCents: 280000 }), offer({ offerId: 'cup', priceCents: 300000, affiliateLinkPending: true })] }), 'link_pendente', 'link de afiliado pendente');
noCup(prod({ offers: [offer({ offerId: 'cheap', priceCents: 280000 }), offer({ offerId: 'cup', priceCents: 300000, quarantined: true })] }), 'quarentena', 'oferta em quarentena');
noCup(prod({ offers: [offer({ offerId: 'cheap', priceCents: 280000 }), offer({ offerId: 'cup', priceCents: 300000, confirmedAt: new Date(NOW.getTime() - 200 * MIN) })] }), 'preco_velho', 'preco da oferta velho (200 min)');
noCup(prod({ offers: [offer({ offerId: 'cheap', priceCents: 280000 }), offer({ offerId: 'cup', priceCents: 300000, title: 'Smart TV Samsung 50 Open Box' })] }), 'condicao_nao_nova', 'Open Box');
noCup(prod({ offers: [offer({ offerId: 'cheap', priceCents: 280000 }), offer({ offerId: 'cup', priceCents: 300000, networkSlug: 'amazon', networkName: 'Amazon' })] }), 'amazon_fora_do_gatilho_cupom', 'Amazon fica fora');
noCup(prod({ catalogGate: 'review' }), 'porteiro_review', 'porteiro em review');
noCup(prod({ vertical: 'moda' as never }), 'departamento_em_review_nao_liberado_no_go', 'departamento nao liberado');
noCup(prod({ couponMisses: [{ offerId: 'cup-x', reason: 'cupom_exige_seguir_loja' }], coupons: [] }), 'agulha:cupom_exige_seguir_loja', 'cupom por seguir a loja (barra da agulha vira auditoria)');
{
  const r = evaluateProductV2(prod({ coupons: [coupon({ offerId: 'cup', finalCents: 90000, offCents: 210000, pct: 70, offerPriceCents: 300000 })] }), ctx);
  const c = cup(r);
  ok(!!c && c.held === true && c.heldReasons.some((x) => x.includes('035x')), 'preco com cupom abaixo de 0,35x a mediana: RETIDO (nunca automatico)', c?.heldReasons);
  const r2 = evaluateProductV2(prod({ coupons: [coupon({ offerId: 'cup', finalCents: 150000, offCents: 150000, pct: 50, offerPriceCents: 300000 })] }), ctx);
  const c2 = cup(r2);
  ok(!!c2 && c2.status === 'review' && c2.reviewReasons.some((x) => x.startsWith('cupom_acima_de_45')), 'cupom de mais de 45%: pede aprovacao', c2?.reviewReasons);
}
{
  // varias ofertas com cupom: vence o maior desconto em reais
  const p = prod({
    offers: [offer({ offerId: 'a', priceCents: 300000 }), offer({ offerId: 'b', priceCents: 320000 }), offer({ offerId: 'c', priceCents: 330000 })],
    coupons: [coupon({ offerId: 'a', offerPriceCents: 300000, finalCents: 285000 }), coupon({ offerId: 'b', offerPriceCents: 320000, finalCents: 280000 })],
  });
  const r = evaluateProductV2(p, ctx);
  ok(r.candidates.filter((x) => x.trigger === 'CUPOM').length === 1 && cup(r)?.offerIds[0] === 'b', 'uma mensagem por produto: a de maior desconto em reais', cup(r)?.offerIds);
}
ok(evaluateCoupon(prod({ coupons: [] }), ctx).candidates.length === 0, 'sem cupom valido: nenhum candidato');
{
  const f = evaluateProductV2(prod({ vertical: 'games', productType: 'game', platformLabel: 'PS5', format: 'physical', masterName: 'Jogo X PS5', offers: [offer({ offerId: 'cup', priceCents: 300000, title: 'Jogo X PS5 Fisico' })], coupons: [coupon({ offerId: 'cup' })] }), ctx);
  ok(!!cup(f), 'games tambem gera cupom');
  const retro = evaluateProductV2(prod({ vertical: 'games', productType: 'game', platformLabel: 'Xbox One', format: 'physical', masterName: 'Jogo X Xbox One', offers: [offer({ offerId: 'cup', priceCents: 300000, title: 'Jogo X Xbox One' })], coupons: [coupon({ offerId: 'cup' })] }), ctx);
  ok(!cup(retro), 'fora de linha (Xbox One) fica fora');
}

// ---------------------------------------------------------------------------
// 3) Prioridade no plano de envio: acima de insight/achado, abaixo de alerta
// ---------------------------------------------------------------------------
function mk(key: string, cls: Candidate['cls'], trigger: Candidate['trigger'], over: Partial<Candidate> = {}): Candidate {
  return {
    messageKey: key, trigger, model: 'abaixo-media', masterProductId: `m-${key}`, offerIds: [`o-${key}`], vertical: 'eletroeletronicos', networkSlug: 'mercado-livre', name: key, priceCents: 100000, avgCents: null, belowAvgPct: null, dropPct: null,
    reason: 'teste', status: 'auto', reviewReasons: [], cls, held: false, heldReasons: [], moveScore: 10, offerSlug: `s-${key}`, networkName: 'Mercado Livre', sendable: true, notSendableReason: null,
    confirmedAt: NOW.toISOString(), dedupKey: `${key}:${trigger}`, texts: { telegram: 'x', whatsapp: 'x' }, textProblems: [], ...over,
  } as Candidate;
}
{
  const plan = applyLimits([mk('ins', 'insight', 'G2', { moveScore: 99 }), mk('ach', 'insight', 'AC', { moveScore: 0 }), mk('cup', 'cupom', 'CUPOM', { moveScore: 1 }), mk('rad', 'radar', 'T1', { moveScore: 99 })], [], NOW);
  ok(plan.next?.messageKey === 'cup', 'cupom sai antes de insight, achado e radar', plan.next?.messageKey);
  const withAlert = applyLimits([mk('ale', 'alerta', 'OK1'), mk('cup', 'cupom', 'CUPOM')], [], NOW);
  ok(withAlert.next?.messageKey === 'ale', 'alerta (queda real) continua acima do cupom');
}

// ---------------------------------------------------------------------------
// 4) Dedup de 1 h: por produto e por cupom; independente da mensagem de preco
// ---------------------------------------------------------------------------
const rec = (over: Partial<SentRecord> & { masterProductId: string; sentAt: Date }): SentRecord => ({ priceCents: 100000, vertical: 'eletroeletronicos', ...over });
{
  const c = mk('cup', 'cupom', 'CUPOM', { couponRef: 'o-cup' });
  const sent30 = [rec({ masterProductId: c.masterProductId, sentAt: new Date(NOW.getTime() - 30 * MIN), trigger: 'CUPOM', cls: 'cupom', couponOfferId: 'o-cup' })];
  ok(productDedupBlock(c, sent30, NOW)?.startsWith('cupom_produto_ja_enviado_ha_30min') === true, 'mesmo produto: cupom repetido em 30 min e barrado');
  ok(applyLimits([c], sent30, NOW).next === null, 'applyLimits adia o cupom repetido em 30 min');
  const sent61 = [rec({ masterProductId: c.masterProductId, sentAt: new Date(NOW.getTime() - 61 * MIN), trigger: 'CUPOM', cls: 'cupom', couponOfferId: 'o-cup' })];
  ok(productDedupBlock(c, sent61, NOW) === null && cupomDedupBlock(c, sent61, NOW) === null, 'depois de 1 h o cupom pode voltar');
  ok(applyLimits([c], sent61, NOW).next?.messageKey === 'cup', 'applyLimits libera depois de 1 h');
  // preco enviado do mesmo produto nao bloqueia o cupom
  const priceSent = [rec({ masterProductId: c.masterProductId, sentAt: new Date(NOW.getTime() - 5 * MIN), trigger: 'OK2', cls: 'alerta' })];
  ok(productDedupBlock(c, priceSent, NOW) === null, 'mensagem de preco do mesmo produto nao bloqueia o cupom');
  // cupom enviado nao bloqueia a mensagem de preco
  const price = mk('p', 'alerta', 'OK2', { masterProductId: c.masterProductId });
  ok(productDedupBlock(price, sent30, NOW) === null, 'mensagem de cupom nao bloqueia a de preco do produto');
  // o mesmo cupom ja divulgado dentro de uma mensagem de PRECO (bloco de cupom) bloqueia a mensagem de cupom
  const inline = [rec({ masterProductId: 'outro-produto', sentAt: new Date(NOW.getTime() - 20 * MIN), trigger: 'G2', cls: 'insight', couponOfferId: 'o-cup' })];
  ok(cupomDedupBlock(c, inline, NOW)?.startsWith('cupom_ja_divulgado_ha_20min') === true, 'mesmo cupom ja divulgado em mensagem de preco: barrado por 1 h');
  ok(cupomDedupBlock(c, [rec({ masterProductId: 'x', sentAt: new Date(NOW.getTime() - 20 * MIN), couponOfferId: 'o-outra' })], NOW) === null, 'outro cupom nao bloqueia');
  ok(cupomDedupBlock(price, inline, NOW) === null, 'dedup de cupom so vale para o gatilho CUPOM');
}

// ---------------------------------------------------------------------------
// 5) Cota por loja e diversidade
// ---------------------------------------------------------------------------
{
  const hist: SentRecord[] = [];
  for (let i = 0; i < RULES.CUPOM_MAX_PER_HOUR_STORE; i++) hist.push(rec({ masterProductId: `h${i}`, sentAt: new Date(NOW.getTime() - (10 + i * 5) * MIN), trigger: 'CUPOM', cls: 'cupom' }));
  ok(cupomQuotaBlock('eletroeletronicos', hist, NOW)?.startsWith('cupom_maximo_6_por_hora_na_loja') === true, 'cota: no maximo 6 cupons por hora na loja');
  ok(cupomQuotaBlock('livros', hist, NOW) === null, 'cota e por loja: outra loja livre');
  const c = mk('novo', 'cupom', 'CUPOM');
  ok(applyLimits([c], hist, NOW).next === null, 'applyLimits adia o 7o cupom da hora na loja');
  ok(applyLimits([{ ...c, vertical: 'livros' }], hist, NOW).next?.messageKey === 'novo', 'cota nao trava outra loja');
}
{
  // cota de parcela (40%) so vale com alternativa nao-cupom na fila
  const hist: SentRecord[] = [];
  for (let i = 0; i < 5; i++) hist.push(rec({ masterProductId: `c${i}`, sentAt: new Date(NOW.getTime() - (70 + i * 30) * MIN), trigger: 'CUPOM', cls: 'cupom' }));
  for (let i = 0; i < 5; i++) hist.push(rec({ masterProductId: `i${i}`, sentAt: new Date(NOW.getTime() - (80 + i * 30) * MIN), trigger: 'G2', cls: 'insight' }));
  const cupomC = mk('cup', 'cupom', 'CUPOM');
  const alt = mk('alt', 'insight', 'G2', { tipo: 'outro', moveScore: 5 });
  const withAlt = applyLimits([cupomC, alt], hist, NOW);
  ok(withAlt.next?.messageKey === 'alt' && withAlt.deferred.some((d) => d.reason.startsWith('cupom_acima_de_40pct')), 'cupom acima de 40% do dia: cede a vez quando ha alternativa', withAlt.deferred);
  ok(applyLimits([cupomC], hist, NOW).next?.messageKey === 'cup', 'cota suave: sem alternativa o canal nao fica parado');
}
{
  // pool: produtos com cupom entram ANTES, com cota por loja e rodizio de tipo
  const mkRow = (i: number, v: string, name: string, r = 0): PoolRow => ({ mid: `${v}-${i}`, v, r, name });
  const cupom: PoolRow[] = [];
  for (let i = 0; i < 60; i++) cupom.push(mkRow(i, 'eletroeletronicos', i % 2 ? `Smart TV Samsung ${i}` : `Fone de ouvido bluetooth ${i}`));
  for (let i = 0; i < 10; i++) cupom.push(mkRow(i, 'livros', `Livro ${i}`));
  const main: PoolRow[] = [];
  for (let i = 100; i < 160; i++) main.push(mkRow(i, 'eletroeletronicos', `Air fryer ${i}`, 2));
  const out = selecionarPool({ main, achado: [], hourKey: '2026-11-12T15', sends: {}, achadoOn: false, cupom });
  const first = out.slice(0, POOL.CUPOM_POR_LOJA + 10);
  const eletro = out.filter((m) => m.startsWith('eletroeletronicos-'));
  const cupomEletroNoPool = out.filter((m) => cupom.some((c) => c.mid === m && c.v === 'eletroeletronicos'));
  ok(cupomEletroNoPool.length === 60 || cupomEletroNoPool.length >= POOL.CUPOM_POR_LOJA, 'cupons da loja entram no pool', cupomEletroNoPool.length);
  ok(out.slice(0, POOL.CUPOM_POR_LOJA).every((m) => cupom.some((c) => c.mid === m)), 'os primeiros do pool sao os de cupom (cota por loja)');
  ok(out.filter((m) => cupom.some((c) => c.mid === m && c.v === 'eletroeletronicos')).slice(0, POOL.CUPOM_POR_LOJA).length === POOL.CUPOM_POR_LOJA, 'cota de cupom por loja = CUPOM_POR_LOJA');
  ok(new Set(out).size === out.length, 'sem duplicata no pool');
  const tiposInFirst20 = new Set(out.slice(0, 20).map((m) => (m.startsWith('livros') ? 'livro' : Number(m.split('-')[1]) % 2 ? 'tv' : 'fone')));
  ok(tiposInFirst20.size >= 2, 'rodizio de tipo vale tambem para o pool de cupom', [...tiposInFirst20]);
  void first;
  void eletro;
  const semCupom = selecionarPool({ main, achado: [], hourKey: '2026-11-12T15', sends: {}, achadoOn: false });
  ok(semCupom.length > 0 && semCupom.every((m) => !cupom.some((c) => c.mid === m && c.v === 'livros')), 'sem entrada de cupom o pool e o de sempre (compat.)');
}

// ---------------------------------------------------------------------------
// 6) Encaixes no codigo (reconferencia ao vivo, pool, painel, log)
// ---------------------------------------------------------------------------
{
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const queue = read('src/server/messaging/group-queue.ts');
  ok(queue.includes("orig.trigger === 'CUPOM'") && queue.includes('revalidação do cupom: já não passa na agulha'), 'revalidateCandidate: cupom que sumiu na releitura nao e enviado');
  ok(queue.includes("(c.offerIds[0] === orig.offerIds[0])") || queue.includes('c.offerIds[0] === orig.offerIds[0]'), 'revalidacao exige a MESMA oferta do cupom');
  ok(queue.includes("(g.trigger = 'CUPOM') = ${isCupom}"), 'fila: proposta aberta de preco nao bloqueia a de cupom (e vice-versa)');
  ok(queue.includes("match.trigger === 'CUPOM' && match.couponInfo"), 'envio registra a divulgacao do cupom (guardiao)');
  const offers = read('src/server/messaging/group-offers.ts');
  ok(offers.includes('validateCouponOffers') && offers.includes('offer_coupon_reads') && offers.includes('cupom: cupomRows'), 'pickProductIds: pool com produtos de cupom valido na agulha');
  ok(offers.includes('couponMisses') && offers.includes('cupom: (() =>'), 'loadFacts/detect: fatos de cupom e contagem de mensagens geradas');
  const auto = read('src/server/messaging/group-auto.ts');
  ok(auto.includes('summary.cupom = detection.cupom') && auto.includes('cupomGeradas'), 'log do ciclo registra cupons gerados/enviados');
  const lookup = read('src/server/messaging/coupon-offers.ts');
  ok(lookup.includes('lookupItemCouponDetail') && !/INSERT|UPDATE|DELETE/.test(lookup), 'validacao de cupom e somente leitura');
  ok(read('src/lib/messaging/group-messages.ts').includes("case 'cupom':"), 'render do modelo cupom');
}

console.log(fails ? `\n${fails} FALHA(S) de ${total}` : `${total}/${total} verificacoes ok (gatilho CUPOM)`);
process.exit(fails ? 1 : 0);
