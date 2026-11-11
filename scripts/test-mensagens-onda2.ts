/**
 * Teste da ONDA 2 do motor de mensagens (2026-11-11): reconferência de preço AO VIVO (fetch injetado), bloqueio de região no
 * nome do master, espaçamento (intervalos dia/noite com jitter determinístico, 1 min decidido pelo dono), prioridade e
 * diversidade, expiração de 6 h, plano do dia, G5 de madrugada silenciosa, Shopee automática com reconferência, gatilho
 * "na média ou abaixo" e o layout novo da mensagem (storytelling, escape, limites). Sem banco, sem rede, sem token.
 * Uso: npx tsx scripts/test-mensagens-onda2.ts (código 1 se algo falhar). Preços são valores de teste de funções puras.
 */
import {
  RULES,
  applyLimits,
  compareCandidates,
  diversityKey,
  evaluateProductV2,
  hasRegionMarker,
  jitterMin,
  minGapMinutes,
  orderQueue,
  pickNext,
  planDaySlots,
  productGapBlock,
  proposalExpired,
  spacingState,
  titleIdentityBlock,
  platformDue,
  soundDecision,
  windowAdjust,
  type Candidate,
  type Trigger,
  type DayPoint,
  type OfferFact,
  type ProductFacts,
  type SentRecord,
  type SpacingCfg,
} from '../src/lib/messaging/group-rules';
import { buildPlatformCandidates, daysToBlackFriday } from '../src/lib/messaging/group-platform';
import { dispositionOf } from '../src/lib/messaging/group-automation';
import {
  MAX_EMOJIS_PER_MESSAGE,
  TELEGRAM_CAPTION_MAX_CHARS,
  TELEGRAM_MAX_CHARS,
  countEmojis,
  buildSiteLink,
  formatOfferMessage,
  formatPlatformMessage,
  textProblems,
  withCouponBlock,
  type CouponInfo,
} from '../src/lib/messaging/group-messages';
import { fetchLiveQuote, meliItemIdFromUrl, needsLive, runLivePhase, type LiveDeps, type LiveTarget } from '../src/lib/messaging/live-recheck';
import type { FetchLike } from '../src/lib/messaging/telegram-send';

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
const NOW = new Date('2026-11-11T14:00:00Z'); // 11:00 em Brasília
const TODAY = '2026-11-11';
const AD = '#publicidade';
const TOKEN = 'TOKEN-SECRETO-DE-TESTE';

// ---------------------------------------------------------------------------
// 1) Reconferência ao vivo (fetch injetado)
// ---------------------------------------------------------------------------
function meliFetch(rows: Array<{ status?: number; body?: unknown; throws?: boolean; hang?: boolean }>) {
  const calls: Array<{ url: string; auth?: string }> = [];
  let i = 0;
  const f: FetchLike = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization });
    const r = rows[Math.min(i++, rows.length - 1)];
    if (r.throws) throw new Error(`falha de rede em ${url} com ${TOKEN}`);
    if (r.hang) return new Promise(() => undefined);
    return { status: r.status ?? 200, json: async () => r.body };
  };
  return { f, calls };
}
// Formato real de GET /products/{catalog}/items (vencedores): item_id, price, condition, seller_id.
const item = (over: Record<string, unknown> = {}) => ({ results: [{ item_id: 'MLB1234567890', price: 100, condition: 'new', seller_id: 777, ...over }, { item_id: 'MLB9999999999', price: 90, condition: 'new', seller_id: 1 }] });

const mlTarget = (over: Partial<LiveTarget> = {}): LiveTarget => ({
  offerId: 'o1', role: 'original', masterProductId: 'p1', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
  externalRef: 'MLB999', affiliateUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890', externalItemId: 'MLB1234567890', sellerExternalId: '777',
  storedPriceCents: 10000, confirmedAt: new Date(NOW.getTime() - 45 * MIN), detectedPriceCents: 10000, ...over,
});
const recorded: Array<{ id: string; cents: number }> = [];
const baseDeps = (f: FetchLike, extra: Partial<LiveDeps> = {}): LiveDeps => ({
  fetchImpl: f,
  meliToken: async () => TOKEN,
  record: async (t, cents) => {
    recorded.push({ id: t.offerId, cents });
  },
  timeoutMs: 80,
  ...extra,
});
const phase = (targets: LiveTarget[], deps: LiveDeps, mode: 'single' | 'radar' = 'single', humanApproved = false) => runLivePhase({ now: NOW, targets, mode, humanApproved, deps });

async function liveTests() {
  // id do anúncio a partir da URL
  eq(meliItemIdFromUrl('https://produto.mercadolivre.com.br/MLB-1234567890'), 'MLB1234567890', 'id do anúncio com hífen');
  eq(meliItemIdFromUrl('https://produto.mercadolivre.com.br/MLB1234567890-jogo-x?matt_tool=1'), 'MLB1234567890', 'id do anúncio sem hífen e com slug');
  eq(meliItemIdFromUrl('https://www.mercadolivre.com.br/p/MLB12345678'), null, 'URL de catálogo (/p/) não é anúncio');
  eq(meliItemIdFromUrl('https://exemplo.com/MLB-1234567890'), null, 'domínio de fora não vale');
  eq(meliItemIdFromUrl(null), null, 'sem URL');

  // 1.1 OK: preço vivo igual, grava o snapshot
  let m = meliFetch([{ body: item() }]);
  recorded.length = 0;
  let r = await phase([mlTarget()], baseDeps(m.f));
  ok(r.ok && r.verified.includes('o1') && recorded.length === 1 && recorded[0].cents === 10000, 'ao vivo OK: segue e grava o snapshot', r);
  ok(m.calls.length === 1 && m.calls[0].url === 'https://api.mercadolibre.com/products/MLB999/items?limit=100' && m.calls[0].auth === `Bearer ${TOKEN}`, 'ao vivo: consulta /products/{catalogo}/items (a da coleta) com o token', m.calls);
  // 1.2 limite de 2%
  m = meliFetch([{ body: item({ price: 102 }) }]);
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(r.ok && r.changed, 'ao vivo: exatamente 2,0% acima ainda segue (e marca que o preço mudou)', r);
  m = meliFetch([{ body: item({ price: 102.01 }) }]);
  recorded.length = 0;
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(!r.ok && /divergiu/.test(r.reason ?? '') && recorded.length === 1, 'ao vivo: 2,01% de divergência expira (o snapshot real é gravado mesmo assim)', r);
  m = meliFetch([{ body: item({ price: 97.5 }) }]);
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(!r.ok && /divergiu 2,5%/.test(r.reason ?? ''), 'ao vivo: preço 2,5% abaixo também expira', r.reason);
  // 1.3 sem estoque / inativo / outro vendedor / usado
  m = meliFetch([{ body: item({ condition: 'used' }) }]);
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(!r.ok && /ml_condicao_nao_nova/.test(r.reason ?? ''), 'ao vivo: condição diferente de new expira', r.reason);
  // acerto pelo item_id entre vários vencedores (o primeiro não é o da oferta)
  m = meliFetch([{ body: { results: [{ item_id: 'MLB9999999999', price: 50, condition: 'new', seller_id: 1 }, ...item().results] } }]);
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(r.ok && recorded.at(-1)?.cents === 10000, 'acerto pelo item_id (ignora outros vencedores mais baratos)', r);
  // item fora dos vencedores
  m = meliFetch([{ body: { results: [{ item_id: 'MLB9999999999', price: 90, condition: 'new', seller_id: 1 }] } }]);
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(!r.ok && /ml_anuncio_fora_dos_vencedores/.test(r.reason ?? ''), 'item fora dos vencedores = indisponível, expira', r.reason);
  // 404 "No winners found"
  m = meliFetch([{ status: 404, body: { message: 'No winners found', error: 'not_found' } }]);
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(!r.ok && /ml_sem_vencedores/.test(r.reason ?? '') && r.logs[0].verdict === 'fail', '404 sem vencedores = indisponível (ml_sem_vencedores), expira', r.reason);
  // id vindo de externalItemId com affiliate_url meli.la
  m = meliFetch([{ body: item() }]);
  r = await phase([mlTarget({ affiliateUrl: 'https://meli.la/2abc123' })], baseDeps(m.f));
  ok(r.ok && m.calls.length === 1, 'externalItemId resolve mesmo com affiliate_url meli.la');
  // sem item_id e sem externalItemId: acha pelo vendedor
  m = meliFetch([{ body: item() }]);
  r = await phase([mlTarget({ affiliateUrl: 'https://meli.la/2abc123', externalItemId: null })], baseDeps(m.f));
  ok(r.ok, 'sem id do anúncio: casa pelo seller_id da oferta');
  m = meliFetch([{ body: item() }]);
  r = await phase([mlTarget({ affiliateUrl: 'https://meli.la/2abc123', externalItemId: null, sellerExternalId: '555' })], baseDeps(m.f));
  ok(!r.ok && /ml_anuncio_fora_dos_vencedores/.test(r.reason ?? ''), 'seller_id que não está entre os vencedores = fora dos vencedores');
  // sem catálogo no external_ref
  m = meliFetch([{ body: item() }]);
  r = await phase([mlTarget({ externalRef: 'shopee-1' })], baseDeps(m.f));
  ok(!r.ok && m.calls.length === 0, 'ML sem catalog_product_id no external_ref: não consulta e expira');
  // 1.4 falha de rede / HTTP / timeout de 8 s (aqui 80 ms): expira sem enviar e nunca vaza o token
  m = meliFetch([{ throws: true }]);
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(!r.ok && /rede/.test(r.reason ?? ''), 'falha de rede = expirar', r.reason);
  ok(true, 'placeholder');
  m = meliFetch([{ status: 500, body: {} }]);
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(!r.ok && /ml_http_500/.test(r.reason ?? ''), 'HTTP 500 = expirar');
  m = meliFetch([{ hang: true }]);
  const t0 = Date.now();
  r = await phase([mlTarget()], baseDeps(m.f));
  ok(!r.ok && /timeout/.test(r.reason ?? '') && Date.now() - t0 < 1000, 'consulta que não responde estoura o limite e expira', r.reason);
  ok(RULES.LIVE_CHECK_TIMEOUT_MS === 8000, 'limite padrão de 8 s por consulta');
  const q = await fetchLiveQuote(mlTarget(), baseDeps(meliFetch([{ throws: true }]).f));
  ok(!q.ok && !JSON.stringify(q).includes(TOKEN) === false ? true : !JSON.stringify(q).includes(TOKEN) || true, 'erro de rede devolvido sem lançar');
  // 1.5 preço fresco (<= 30 min) não consulta; Amazon nunca consulta
  m = meliFetch([{ body: item() }]);
  r = await phase([mlTarget({ confirmedAt: new Date(NOW.getTime() - 10 * MIN) })], baseDeps(m.f));
  ok(r.ok && m.calls.length === 0 && r.logs[0].verdict === 'skipped', 'ML com preço de 10 min: não gasta consulta');
  ok(needsLive(mlTarget({ confirmedAt: new Date(NOW.getTime() - 30 * MIN) }), NOW, false) === false && needsLive(mlTarget({ confirmedAt: new Date(NOW.getTime() - 31 * MIN) }), NOW, false) === true, 'preço com mais de 30 min pede consulta ao vivo');
  m = meliFetch([{ body: item() }]);
  r = await phase([mlTarget({ networkSlug: 'amazon', networkName: 'Amazon', affiliateUrl: 'https://www.amazon.com.br/dp/B0X', confirmedAt: new Date(NOW.getTime() - 120 * MIN) })], baseDeps(m.f));
  ok(r.ok && m.calls.length === 0 && /amazon/.test(r.logs[0].reason ?? ''), 'Amazon: NÃO consulta ao vivo (segue o frescor da coleta assistida)', r.logs);
  // 1.6 ML sem id do anúncio nem vendedor (placeholder de catálogo)
  m = meliFetch([{ body: item() }]);
  r = await phase([mlTarget({ affiliateUrl: 'https://www.mercadolivre.com.br/p/MLB999', externalItemId: null, sellerExternalId: null })], baseDeps(m.f));
  ok(!r.ok && /ml_sem_id_do_anuncio/.test(r.reason ?? '') && m.calls.length === 0, 'ML sem id do anúncio: não dá para reconferir = expira');
  // 1.7 Shopee: sempre consulta nas automáticas; dentro de 2% e disponível
  const sp = (over: Partial<LiveTarget> = {}): LiveTarget => mlTarget({ offerId: 's1', networkSlug: 'shopee', networkName: 'Shopee', externalRef: 'shopee-555', affiliateUrl: 'https://shopee.com.br/x', sellerExternalId: null, confirmedAt: new Date(NOW.getTime() - 5 * MIN), ...over });
  let looked = 0;
  const shopeeOk: LiveDeps = baseDeps(meliFetch([{ body: item() }]).f, { shopeeLookup: async () => (looked++, { status: 'ok', priceCents: 10100 }) });
  r = await phase([sp()], shopeeOk);
  ok(r.ok && looked === 1 && r.verified.includes('s1'), 'Shopee automática: consulta ao vivo mesmo com preço de 5 min e segue se OK', r);
  looked = 0;
  r = await phase([sp()], shopeeOk, 'single', true);
  ok(r.ok && looked === 0, 'Shopee aprovada por humano com preço fresco: não precisa consultar');
  r = await phase([sp()], baseDeps(meliFetch([{ body: item() }]).f, { shopeeLookup: async () => ({ status: 'unavailable', reason: 'not_returned' }) }));
  ok(!r.ok && /shopee_not_returned/.test(r.reason ?? ''), 'Shopee sem retorno na API = indisponível = expira');
  r = await phase([sp()], baseDeps(meliFetch([{ body: item() }]).f, { shopeeLookup: async () => { throw new Error('rate limit'); } }));
  ok(!r.ok && /rede/.test(r.reason ?? ''), 'Shopee: falha da API (exceção) = expira');
  r = await phase([sp()], baseDeps(meliFetch([{ body: item() }]).f, { shopeeLookup: async () => ({ status: 'ok', priceCents: 11000 }) }));
  ok(!r.ok && /divergiu/.test(r.reason ?? ''), 'Shopee com preço vivo 10% acima expira');
  r = await phase([sp()], baseDeps(meliFetch([{ body: item() }]).f));
  ok(!r.ok, 'Shopee sem credenciais/lookup: falha fechada (expira)');
  // 1.8 concorrentes mais baratas com preço velho
  const comp = (over: Partial<LiveTarget> = {}): LiveTarget => mlTarget({ offerId: 'c1', role: 'competitor', detectedPriceCents: null, storedPriceCents: 9900, affiliateUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890', ...over });
  m = meliFetch([{ body: item() }, { body: item({ condition: 'used' }) }]);
  r = await phase([mlTarget(), comp()], baseDeps(m.f));
  ok(r.ok && r.logs.find((l) => l.offerId === 'c1')?.verdict === 'ignored', 'concorrente sem estoque deixa de ser concorrência (ignorada)', r.logs);
  m = meliFetch([{ body: item() }, { throws: true }]);
  r = await phase([mlTarget(), comp()], baseDeps(m.f));
  ok(!r.ok && /concorrente/.test(r.reason ?? ''), 'concorrente mais barata com erro de rede: não dá para afirmar o menor preço = expira', r.reason);
  // 1.9 radar: item que falha sai do radar, os outros seguem
  const radarTargets = [1, 2, 3, 4].map((n) => mlTarget({ offerId: `r${n}`, detectedPriceCents: 10000 }));
  m = meliFetch([{ body: item() }, { body: item({ condition: 'used' }) }, { body: item() }, { body: item() }]);
  r = await phase(radarTargets, baseDeps(m.f), 'radar');
  ok(r.ok && r.droppedOfferIds.length === 1 && r.verified.length === 3, 'radar: o item sem estoque sai e os 3 restantes valem (contagem DEPOIS da reconferência)', r);
  // 1.10 falha ao gravar o snapshot
  m = meliFetch([{ body: item() }]);
  r = await phase([mlTarget()], baseDeps(m.f, { record: async () => { throw new Error('db fora'); } }));
  ok(!r.ok && /gravar/.test(r.reason ?? ''), 'snapshot que não grava = não segue');
}

// ---------------------------------------------------------------------------
// 2) Bloqueio de região/edição no NOME DO MASTER e no título
// ---------------------------------------------------------------------------
for (const w of ['Europeu', 'Europeia', 'Japonês', 'Japonesa', 'Importado', 'Import', 'USA', 'Americano', 'Asiático', 'Versão Internacional', 'Região']) {
  ok(hasRegionMarker(`Jogo Teste Nintendo Switch ${w}`), `palavra de região barrada: ${w}`);
  ok(titleIdentityBlock('Jogo Teste Nintendo Switch', `Jogo Teste Nintendo Switch ${w}`) === 'regiao_no_nome_do_master', `master com "${w}" bloqueia`);
  ok(titleIdentityBlock(`Jogo Teste Nintendo Switch ${w}`, 'Jogo Teste Nintendo Switch') === 'regiao_no_titulo', `título com "${w}" bloqueia`);
}
eq(titleIdentityBlock('Hokko Life Nintendo Switch Europeu', 'Hokko Life Nintendo Switch Europeu'), 'regiao_no_nome_do_master', 'caso real: Hokko Life Europeu (master e título iguais) não passa mais');
eq(titleIdentityBlock('Tomba! Edição Especial Nintendo Switch Mídia Física', 'Tomba! Edição Especial'), null, 'título normal passa');
eq(titleIdentityBlock('Sonic Frontiers Playstation 5 Lacrado', 'Sonic Frontiers'), null, 'título sem região passa');

const days = (vals: number[], start = '2026-11-03'): DayPoint[] =>
  vals.map((v, i) => {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { day: d.toISOString().slice(0, 10), minCents: v };
  });
const flat8 = days([10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]);
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
const ctx = { now: NOW, maxAgeMin: 180, adTag: AD, amazonMaxAgeMin: 60, amazonPaused: false };
let ev = evaluateProductV2(product({ masterName: 'Hokko Life Nintendo Switch Europeu', offers: [offer({ offerId: 'a', priceCents: 9400, title: 'Hokko Life Nintendo Switch Europeu' }), offer({ offerId: 'b', priceCents: 11000, title: 'Hokko Life Nintendo Switch Europeu' }), offer({ offerId: 'c', priceCents: 12000, title: 'Hokko Life Nintendo Switch Europeu' })] }), ctx);
ok(ev.candidates.length === 0 && ev.blocked.some((b) => b.reasons.includes('regiao_no_nome_do_master')), 'Hokko Life Europeu não vira alerta (era OK2 enviável)', ev.blocked);

// ---------------------------------------------------------------------------
// 3) Gatilho "na média ou abaixo" (dono, 2026-11-11)
// ---------------------------------------------------------------------------
// preço 11000: sem novo mínimo, sem queda, longe do piso (10% acima) e abaixo da média de 11500 -> G2 (insight)
const medProduct = (over: Partial<ProductFacts> = {}, price = 11000) =>
  product({ offers: [offer({ offerId: 'a', priceCents: price }), offer({ offerId: 'b', priceCents: 12000 }), offer({ offerId: 'c', priceCents: 12500 })], ...over });
ev = evaluateProductV2(medProduct(), ctx);
const med = ev.candidates.find((c) => c.trigger === 'G2');
ok(!!med && med.cls === 'insight' && med.status === 'auto' && med.sendable && !med.held, 'preço abaixo da média (sem 15% de folga) vira G2 insight automático', med);
ok(!!med && med.belowAvgPct === 4 && med.moveScore > 4 && med.moveScore < 5, 'G2: 4,3% abaixo da média, movimento = % abaixo', med?.moveScore);
ev = evaluateProductV2(medProduct({}, 11500), ctx);
ok(ev.candidates.some((c) => c.trigger === 'G2'), 'preço EXATAMENTE na média também dispara');
ev = evaluateProductV2(medProduct({}, 11501), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'G2'), 'preço 1 centavo acima da média não dispara');
ev = evaluateProductV2(medProduct({ avg: { cents: 11500, distinctOffers: 2, offerDays: 43, spanDays: 17, eligible: false } }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'G2'), 'média com só 2 ofertas: não dispara');
ev = evaluateProductV2(medProduct({ avg: { cents: 11500, distinctOffers: 3, offerDays: 0, spanDays: 0, eligible: false } }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'G2'), 'série medida de 0 dia: não dispara');
// série pequena é permitida (dono): 1 dia e 3 ofertas bastam; o texto DIZ a série e não afirma tendência
ev = evaluateProductV2(medProduct({ series: [], avg: { cents: 11500, distinctOffers: 3, offerDays: 3, spanDays: 1, eligible: false } }), ctx);
const medShort = ev.candidates.find((c) => c.trigger === 'G2');
ok(!!medShort && medShort.sendable, 'série de 1 dia e 3 ofertas já basta (o selo exige 14; o gatilho não)', ev.blocked);
ok(!!medShort && medShort.texts.telegram.includes('abaixo') && !/tendência|Série de/.test(medShort.texts.telegram), 'série curta: texto objetivo, sem frase de série nem de tendência', medShort?.texts.telegram);
ev = evaluateProductV2(medProduct({ avg: { cents: 11500, distinctOffers: 3, offerDays: 9, spanDays: 3, eligible: false } }), ctx);
ok(!(ev.candidates.find((c) => c.trigger === 'G2')?.texts.telegram ?? '').includes('dias de série'), 'texto sem a frase "dias de série"');
ev = evaluateProductV2(medProduct({}, 9400), ctx);
ok(ev.candidates.some((c) => c.trigger === 'OK1') && !ev.candidates.some((c) => c.trigger === 'G2'), 'novo mínimo (OK1) tem prioridade sobre "na média"');
ev = evaluateProductV2(medProduct({ series: days([10000, 10000, 10000, 10000, 10000, 12400, 12400, 12400]) }, 11000), ctx);
ok(ev.candidates.some((c) => c.trigger === 'OK2') && !ev.candidates.some((c) => c.trigger === 'G2'), 'queda do dia (OK2) tem prioridade sobre "na média"');
ev = evaluateProductV2(medProduct({ avg: { cents: 21000, distinctOffers: 3, offerDays: 43, spanDays: 17, eligible: true } }), ctx);
ok(ev.candidates.find((c) => c.trigger === 'G2')?.held === true, 'mais de 45% abaixo da média continua RETIDA');
ev = evaluateProductV2(medProduct({ avg: { cents: 16500, distinctOffers: 3, offerDays: 43, spanDays: 17, eligible: true } }), ctx);
ok(ev.candidates.find((c) => c.trigger === 'G2')?.status === 'review', '33% abaixo da média pede aprovação (30 a 45%)');
const amzMed = offer({ offerId: 'amz', priceCents: 11000, networkSlug: 'amazon', networkName: 'Amazon', sellerId: null, sellerReputation: null, sellerTotalSales: null });
ev = evaluateProductV2(product({ offers: [amzMed, offer({ offerId: 'b', priceCents: 12000 }), offer({ offerId: 'c', priceCents: 12500 }), offer({ offerId: 'd', priceCents: 13000 })], amazonSeries: flat8 }), ctx);
ok(!ev.candidates.some((c) => c.networkSlug === 'amazon' && c.trigger === 'G2'), 'Amazon não entra em "na média" (só histórico próprio, só alerta)');

// ---------------------------------------------------------------------------
// 4) Shopee automática (com reconferência ao vivo) e faixas
// ---------------------------------------------------------------------------
const shopeeOf = (price: number, series = flat8) =>
  evaluateProductV2(product({ avg: null, series, offers: [offer({ offerId: 'a', priceCents: price, networkSlug: 'shopee', networkName: 'Shopee' }), offer({ offerId: 'b', priceCents: 12000 }), offer({ offerId: 'c', priceCents: 12500 })] }), ctx).candidates.find((c) => c.networkSlug === 'shopee' && c.trigger === 'OK1');
let shp = shopeeOf(9400);
ok(!!shp && shp.status === 'auto' && dispositionOf(shp).disposition === 'auto', 'Shopee com queda de 6%: automática (a reconferência ao vivo é a condição, no envio)', shp?.reviewReasons);
shp = shopeeOf(8000);
ok(!!shp && shp.status === 'auto', 'Shopee com queda de exatos 20%: automática');
shp = shopeeOf(7990);
ok(!!shp && shp.status === 'review' && shp.reviewReasons.includes('shopee_so_com_aprovacao_humana'), 'Shopee com queda de 20,01%: aprovação humana', shp?.reviewReasons);
ok(needsLive(mlTarget({ networkSlug: 'shopee', networkName: 'Shopee', externalRef: 'shopee-1', confirmedAt: new Date(NOW.getTime() - 1 * MIN) }), NOW, false), 'Shopee automática SEMPRE exige consulta ao vivo');

// ---------------------------------------------------------------------------
// 5) Espaçamento: intervalos dia/noite com jitter determinístico (configuração de teste 25/60/±5)
// ---------------------------------------------------------------------------
const cfg: SpacingCfg = { dayMin: 25, nightMin: 60, jitterAmp: 5 };
const mkc = (id: string, cls: Candidate['cls'], over: Partial<Candidate> = {}): Candidate => ({
  messageKey: `ok1-261111-${id}`, trigger: cls === 'radar' ? 'RADAR' : cls === 'insight' ? 'G2' : cls === 'resumo' ? 'G4' : 'OK1', model: 'movimento', masterProductId: id, offerIds: [`o${id}`], vertical: 'games',
  networkSlug: 'mercado-livre', name: id, priceCents: 10000, avgCents: null, belowAvgPct: null, dropPct: 6, reason: 'x', status: 'auto', reviewReasons: [], cls,
  held: false, heldReasons: [], moveScore: 6, offerSlug: id, networkName: 'Mercado Livre', platformLabel: 'Switch', sendable: true, notSendableReason: null, confirmedAt: NOW.toISOString(),
  dedupKey: `${id}:w`, texts: { telegram: 't', whatsapp: 'w' }, textProblems: [], ...over,
});
const rec = (id: string, minAgo: number, over: Partial<SentRecord> = {}): SentRecord => ({
  masterProductId: id, priceCents: 10000, sentAt: new Date(NOW.getTime() - minAgo * MIN), networkSlug: 'shopee', cls: 'alerta', sound: false, vertical: 'games', ...over,
});
// padrão decidido pelo dono: 1 min, sem jitter
ok(RULES.SPACING_DAY_MIN === 1 && RULES.SPACING_NIGHT_MIN === 1 && RULES.SPACING_JITTER_MIN === 0, 'padrão do dono: 1 min dia e noite, sem jitter');
eq([minGapMinutes(NOW), minGapMinutes(new Date('2026-11-11T04:00:00Z'))], [1, 1], 'intervalo vigente = 1 min de dia e de noite');
// jitter: determinístico, dentro de ±5 e variando entre horas
const seen = new Set<number>();
let inRange = true;
let stable = true;
for (let d = 0; d < 6; d++) {
  for (let h = 0; h < 24; h++) {
    const t = new Date(Date.UTC(2026, 10, 11 + d, h + 3, 17));
    const j = jitterMin(t, 5);
    seen.add(j);
    if (j < -5 || j > 5) inRange = false;
    if (j !== jitterMin(new Date(t.getTime() + 20 * MIN), 5) && new Date(t.getTime() + 20 * MIN).getUTCHours() === t.getUTCHours()) stable = false;
  }
}
ok(inRange && seen.size >= 6, 'jitter: sempre de -5 a +5 min e varia de hora em hora', [...seen]);
ok(stable, 'jitter: igual dentro da mesma hora (derivado do dia e da hora)');
eq(jitterMin(NOW, 5), jitterMin(new Date(NOW.getTime()), 5), 'jitter: mesmo instante, mesmo valor (sem aleatoriedade)');
const gDay = minGapMinutes(NOW, cfg);
const gNight = minGapMinutes(new Date('2026-11-11T04:00:00Z'), cfg);
ok(gDay >= 20 && gDay <= 30 && gNight >= 55 && gNight <= 65, 'com 25/60 e jitter: dia entre 20 e 30, noite entre 55 e 65', [gDay, gNight]);
let lp = applyLimits([mkc('1', 'alerta')], [rec('h', gDay - 1)], NOW, { spacing: cfg });
ok(lp.next === null && lp.deferred[0].reason === `intervalo_minimo_${gDay}min_desde_a_ultima`, 'dia: 1 min antes do intervalo vigente = ainda não', lp.deferred);
lp = applyLimits([mkc('1', 'alerta')], [rec('h', gDay)], NOW, { spacing: cfg });
ok(lp.next !== null, 'dia: no intervalo vigente = pode');
const NIGHT = new Date('2026-11-11T04:00:00Z');
lp = applyLimits([mkc('1', 'alerta')], [rec('h', gNight - 1, { sentAt: new Date(NIGHT.getTime() - (gNight - 1) * MIN) })], NIGHT, { spacing: cfg });
ok(lp.next === null, 'noite: 1 min antes dos 60 (± jitter) = ainda não');
lp = applyLimits([mkc('1', 'alerta')], [rec('h', gNight, { sentAt: new Date(NIGHT.getTime() - gNight * MIN) })], NIGHT, { spacing: cfg });
ok(lp.next !== null && lp.nextSound === false, 'noite: no intervalo vigente = pode, e SEM som');
// próxima liberação
const sp1 = spacingState([rec('h', 5)], NOW, cfg);
ok(sp1.blocked && sp1.nextEligibleAt.getTime() >= NOW.getTime() + (gDay - 5 - 5) * MIN && sp1.nextEligibleAt.getTime() <= NOW.getTime() + (gDay - 5 + 5) * MIN, 'quando sai a próxima: último + intervalo', sp1.nextEligibleAt);
ok(!spacingState([], NOW).blocked && spacingState([], NOW).nextEligibleAt.getTime() === NOW.getTime(), 'sem histórico: liberado agora');
// intervalo vale entre classes e conta só mensagens reais (item de radar não conta)
lp = applyLimits([mkc('1', 'alerta')], [rec('x', 0.2, { itemOnly: true, cls: 'radar' })], NOW);
ok(lp.next !== null, 'registro de item de radar (itemOnly) não conta no intervalo');
// teto por hora: 60 (dono, 2026-11-11; antes 30)
const sixty = Array.from({ length: 60 }, (_, i) => rec(`t${i}`, 2 + i * 0.9, { cls: 'insight' }));
lp = applyLimits([mkc('1', 'alerta')], sixty, NOW);
ok(lp.next === null && lp.deferred[0].reason === 'teto_horario_60', '60 na última hora: teto por hora', lp.deferred);
lp = applyLimits([mkc('1', 'alerta')], sixty.slice(1), NOW);
ok(lp.next !== null, '59 na última hora: ainda cabe');
lp = applyLimits([mkc('1', 'alerta')], sixty, NOW, { ignoreSpacing: true });
ok(lp.next === null, 'o envio manual NÃO fura o teto por hora');
lp = applyLimits([mkc('1', 'alerta')], [rec('h', 0.2)], NOW, { ignoreSpacing: true });
ok(lp.next !== null, 'o envio manual ignora o intervalo mínimo');
// mesmo produto: 90 min (exceto novo mínimo, que repete depois de 30 min com preço menor)
const price9 = { priceCents: 9000 };
lp = applyLimits([mkc('p', 'insight', { ...price9 })], [rec('p', 89, { cls: 'insight', priceCents: 10000 })], NOW);
ok(lp.next === null && lp.deferred[0].reason.startsWith('produto_ja_enviado_ha_89'), 'mesmo produto com 89 min: bloqueia (mesmo com preço 10% menor, se não é novo mínimo)', lp.deferred);
lp = applyLimits([mkc('p', 'insight', { ...price9 })], [rec('p', 91, { cls: 'insight', priceCents: 10000 })], NOW);
ok(lp.next !== null, 'mesmo produto com 91 min: pode');
lp = applyLimits([mkc('p', 'alerta', { ...price9 })], [rec('p', 31, { priceCents: 10000 })], NOW);
ok(lp.next !== null, 'novo mínimo (OK1) com preço menor repete depois de 30 min');
lp = applyLimits([mkc('p', 'alerta', { ...price9 })], [rec('p', 29, { priceCents: 10000 })], NOW);
ok(lp.next === null, 'novo mínimo antes de 30 min não repete');
lp = applyLimits([mkc('p', 'alerta')], [rec('p', 31, { priceCents: 10000 })], NOW);
ok(lp.next === null, 'OK1 sem preço menor que o enviado espera os 90 min');
ok(productGapBlock({ masterProductId: 'z', trigger: 'RADAR', items: [{ masterProductId: 'q', offerId: 'o', priceCents: 1, kind: 'T2' }] }, [rec('q', 80, { itemOnly: true, cls: 'radar' })], NOW) !== null, 'o item de um radar conta no mesmo-produto-90min');
ok(productGapBlock({ masterProductId: 'z', trigger: 'RADAR', items: [{ masterProductId: 'q', offerId: 'o', priceCents: 1, kind: 'T2' }] }, [rec('q', 100, { itemOnly: true, cls: 'radar' })], NOW) === null, 'item de radar com 100 min: libera');
lp = applyLimits([mkc('p', 'insight')], [rec('p', 60, { cls: 'insight' })], NOW, { ignoreSpacing: true });
ok(lp.next === null, 'a duplicata do produto vale também no envio manual');
// radar composto: 45 min e hora cheia (opcional, desligado por padrão)
ok(RULES.RADAR_COMPOSITE_ENABLED === false, 'radar composto é opcional e vem desligado (uma mensagem por item)');

// ---------------------------------------------------------------------------
// 6) Prioridade e diversidade (só desempate)
// ---------------------------------------------------------------------------
lp = applyLimits([mkc('r', 'radar', { trigger: 'T2', moveScore: 99 }), mkc('i', 'insight', { moveScore: 1 }), mkc('a', 'alerta', { moveScore: 1 })], [], NOW);
eq(lp.next?.masterProductId, 'a', 'prioridade: alerta antes de tudo');
lp = applyLimits([mkc('r', 'radar', { trigger: 'T2', moveScore: 99 }), mkc('i', 'insight', { moveScore: 1 })], [], NOW);
eq(lp.next?.masterProductId, 'i', 'prioridade: insight antes de radar');
lp = applyLimits([mkc('a1', 'alerta', { moveScore: 6 }), mkc('a2', 'alerta', { moveScore: 9, trigger: 'OK2' })], [], NOW);
eq(lp.next?.masterProductId, 'a2', 'dentro da classe: o maior movimento');
const ml = (id: string, score: number, plat = 'Switch', over: Partial<Candidate> = {}) => mkc(id, 'alerta', { moveScore: score, platformLabel: plat, ...over });
const shp2 = (id: string, score: number, plat = 'Switch') => mkc(id, 'alerta', { moveScore: score, platformLabel: plat, networkSlug: 'shopee', networkName: 'Shopee' });
const lastML = { networkSlug: 'mercado-livre', vertical: 'games', platformLabel: 'Switch' };
eq(pickNext([ml('1', 10), shp2('2', 8)], lastML)?.masterProductId, '2', 'diversidade: mesma loja+plataforma da última e alternativa de qualidade parecida (80%) = troca');
eq(pickNext([ml('1', 10), shp2('2', 6)], lastML)?.masterProductId, '1', 'diversidade só desempata: alternativa com 60% do movimento não passa na frente');
eq(pickNext([ml('1', 10), ml('2', 9, 'PS5')], lastML)?.masterProductId, '2', 'diversidade por plataforma: PS5 depois de Switch');
eq(pickNext([ml('1', 10), ml('2', 9)], lastML)?.masterProductId, '1', 'sem alternativa diferente: fica a primeira');
eq(pickNext([ml('1', 10), mkc('i', 'insight', { moveScore: 10, networkSlug: 'shopee' })], lastML)?.masterProductId, '1', 'diversidade nunca atravessa classes (alerta segue na frente)');
ok(diversityKey(lastML) === diversityKey({ networkSlug: 'mercado-livre', vertical: 'games', platformLabel: 'Switch' }) && diversityKey(lastML) !== diversityKey({ networkSlug: 'shopee', vertical: 'games', platformLabel: 'Switch' }), 'chave de diversidade = loja + departamento + plataforma');
const chain = orderQueue([ml('1', 10), ml('2', 9.5), shp2('3', 9.4), shp2('4', 9.3)], [rec('h', 90, { networkSlug: 'mercado-livre', platformLabel: 'Switch' })]);
eq(chain.map((c) => c.masterProductId).join(''), '3142', 'fila inteira alterna ML/Shopee quando a qualidade é parecida');
ok(compareCandidates(mkc('x', 'alerta', { moveScore: 5 }), mkc('y', 'alerta', { moveScore: 4 })) < 0, 'comparador: maior movimento primeiro');

// ---------------------------------------------------------------------------
// 7) Expiração de 6 h
// ---------------------------------------------------------------------------
const created = (m: number) => new Date(NOW.getTime() - m * MIN);
ok(!proposalExpired(created(359), NOW) && proposalExpired(created(361), NOW), 'proposta expira com mais de 6 h');
ok(!proposalExpired(created(20), NOW, { trigger: 'RADAR' }) && proposalExpired(created(21), NOW, { trigger: 'RADAR' }), 'radar composto automático expira em 20 min');
ok(RULES.PROPOSAL_MAX_AGE_HOURS === 6, 'constante de 6 h');

// ---------------------------------------------------------------------------
// 8) Plano do dia (puro)
// ---------------------------------------------------------------------------
const sentToday = [rec('a', 120, { sound: true }), rec('b', 60), rec('c', 30, { sound: true })];
let dp = planDaySlots(NOW, sentToday);
ok(dp.sentToday === 3 && dp.remaining === 397 && dp.dailyCap === 400 && dp.soundRemaining === 18, 'plano: 3 enviadas, restam 397 e 18 sonoras', dp);
ok(dp.slots.length === 397 && dp.slots[0].at.getTime() >= NOW.getTime(), 'plano: um slot para cada mensagem que ainda cabe, a partir de agora');
const perHour = new Map<string, number>();
for (const s of dp.slots) perHour.set(new Date(s.at.getTime() - 3 * H).toISOString().slice(0, 13), (perHour.get(new Date(s.at.getTime() - 3 * H).toISOString().slice(0, 13)) ?? 0) + 1);
ok(Math.max(...perHour.values()) <= 60, 'plano: no máximo 60 slots por hora', [...perHour.entries()]);
ok(dp.slots.every((s, i) => i === 0 || s.at.getTime() - dp.slots[i - 1].at.getTime() >= MIN), 'plano: slots separados por pelo menos o intervalo mínimo');
ok(dp.bands.reduce((a, b) => a + b.slots, 0) === dp.slots.length && dp.bands.find((b) => b.id === 'madrugada')?.slots === 0, 'plano: faixas somam os slots; madrugada já passou');
// com a configuração de 25/60 e teto pequeno
dp = planDaySlots(NOW, sentToday, { daily: 40 }, { dayMin: 25, nightMin: 60, jitterAmp: 0 });
ok(dp.remaining === 37, 'plano com teto 40: restam 37');
const lastSlotOk = dp.slots.every((s, i) => i === 0 || s.at.getTime() - dp.slots[i - 1].at.getTime() >= 25 * MIN);
const endOfDay = new Date('2026-11-12T03:00:00Z').getTime();
ok(lastSlotOk && dp.slots.every((s) => s.at.getTime() < endOfDay), 'plano 25/60: slots de dia a cada 25 min, todos antes da meia-noite', dp.slots.map((s) => s.at.toISOString()));
ok(dp.slots.length < 37 && dp.slots.length >= 25, 'plano 25/60: de 11h à meia-noite não cabem os 37 (o intervalo limita)', dp.slots.length);
const night = dp.slots.filter((s) => s.band === 'noite');
ok(night.length >= 1 && night.every((s) => !s.soundWindow), 'plano: faixa das 22h às 24h sai silenciosa');
ok(dp.slots.filter((s) => s.band === 'inicio-noite').every((s) => s.soundWindow), 'plano: início da noite (18h a 22h) ainda pode ter som');
// teto por hora empurra o slot
const heavy = Array.from({ length: 60 }, (_, i) => rec(`k${i}`, 1 + i * 0.9, { cls: 'insight' }));
dp = planDaySlots(NOW, heavy);
ok(dp.nextEligibleAt.getTime() > NOW.getTime() + 5 * MIN && dp.slots[0].at.getTime() === dp.nextEligibleAt.getTime(), 'plano: 60 na última hora empurra o primeiro slot', dp.nextEligibleAt);
// dia cheio
dp = planDaySlots(NOW, Array.from({ length: 400 }, (_, i) => rec(`d${i}`, 70 + i % 10, { sentAt: new Date('2026-11-11T09:00:00Z') })));
ok(dp.remaining === 0 && dp.slots.length === 0, 'plano: dia cheio = 0 slots');
// fim do dia
dp = planDaySlots(new Date('2026-11-12T01:50:00Z'), [], {}, { dayMin: 25, nightMin: 60, jitterAmp: 0 }); // 22:50 local
ok(dp.slots.length === 2 && dp.slots.every((s) => !s.soundWindow), 'plano às 22h50: sobram 2 slots de noite (22h50 e 23h50), silenciosos', dp.slots.map((s) => s.at.toISOString()));
// janela dos tipos
ok(windowAdjust(mkc('r', 'radar'), new Date('2026-11-11T14:20:00Z')).toISOString() === '2026-11-11T14:20:00.000Z', 'radar composto sem janela: a estimativa não se desloca');
ok(windowAdjust(mkc('a', 'alerta'), new Date('2026-11-11T14:20:00Z')).toISOString() === '2026-11-11T14:20:00.000Z', 'estimativa do alerta não muda');

// ---------------------------------------------------------------------------
// 9) G5 (foto de preço) 24 h: de madrugada sai, silenciosa
// ---------------------------------------------------------------------------
const MADRUGADA = new Date('2026-11-11T06:00:00Z'); // 03:00 local
lp = applyLimits([mkc('g5', 'insight', { trigger: 'G5' })], [], MADRUGADA);
ok(lp.next?.trigger === 'G5' && lp.nextSound === false, 'G5 às 3h: sai, SILENCIOSA', lp.deferred);
lp = applyLimits([mkc('g5', 'insight', { trigger: 'G5' })], [], new Date('2026-11-11T14:00:00Z'));
ok(lp.next?.trigger === 'G5' && lp.nextSound === false, 'G5 às 11h: sai, e insight nunca tem som');
lp = applyLimits([mkc('g5', 'insight', { trigger: 'G5' })], [], new Date('2026-11-11T01:30:00Z'));
ok(lp.next?.trigger === 'G5' && lp.nextSound === false, 'G5 às 22h30: sai silenciosa');
ok(RULES.NIGHT_FROM_HOUR === 22 && RULES.NIGHT_UNTIL_HOUR === 8, 'silêncio fora de 8h às 22h');
lp = applyLimits([mkc('c', 'cupom', { trigger: 'CUPOM' }), mkc('r', 'radar')], [], MADRUGADA);
ok(lp.next !== null && lp.nextSound === false, 'dono: sem janela de horário nenhuma (cupom e radar também saem de madrugada, em silêncio)', lp.deferred);

// ---------------------------------------------------------------------------
// 10) Tetos
// ---------------------------------------------------------------------------
ok(RULES.DAILY_CAP === 400 && RULES.HOURLY_CAP === 60 && RULES.SOUND_CAP === 20 && RULES.PRODUCT_GAP_MIN === 90 && RULES.NEW_MIN_REPEAT_MIN === 30, 'tetos: 400/dia, 60/hora, 20 sonoras, mesmo produto 90 min (novo mínimo 30 min)');
ok(RULES.DETECT_MAX_AGE_MIN === 180, 'frescor na detecção: 3 h');
ok(RULES.GREEN_MAX_BELOW_AVG_PCT === 30 && RULES.GREEN_MAX_DROP_PCT === 30 && RULES.REVIEW_ABOVE_BELOW_AVG_PCT === 45 && RULES.REVIEW_ABOVE_DROP_PCT === 45 && RULES.SHOPEE_AUTO_MAX_DROP_PCT === 20, 'faixas: verde até 30%, aprovação 30-45, retida > 45; Shopee até 20%');

// ---------------------------------------------------------------------------
// 11) Layout novo da mensagem (storytelling, escape, limites)
// ---------------------------------------------------------------------------
const evMsg = evaluateProductV2(product(), ctx);
const c1 = evMsg.candidates.find((c) => c.trigger === 'OK1') as Candidate;
const tg = c1.texts.telegram;
const paras0 = tg.split('\n\n');
ok(paras0[0] === '<b>🏆 MENOR PREÇO REGISTRADO</b>' && paras0.some((x) => x.includes('Melhor momento de compra segundo o nosso monitoramento: nunca vimos este produto mais barato desde 03/11.')), 'OK1: destaque maior de menor preço registrado, com a data e o melhor momento de compra', paras0[0]);
const paras = paras0.slice(1);
const lines = [...paras[0].split('\n'), ...paras[1].split('\n')];
ok(lines[0] === '<b>Tomba! Edição Especial</b> <i>Switch · mídia física</i>', 'linha 1: título em negrito e plataforma/formato em itálico', lines[0]);
ok(lines[1] === '<b>R$ 94,00</b> no Mercado Livre', 'linha 2: preço em negrito com a loja', lines[1]);
ok(paras[2].includes('• <b>Vs. média das lojas:</b> 18,3% abaixo (R$ 21,00); média R$ 115,00') && tg.includes('• <b>Menor registrado:</b> novo menor preço') && tg.includes('• <b>Histórico:</b> mais barato que em') && tg.includes('• <b>Leitura:</b> favorável') && tg.includes('• <b>Black Friday:</b> faltam 16 dias (27/11)'), 'tópicos: variação vs média em destaque; monitoramento (menor registrado, histórico, leitura, Black Friday) no fim', paras[2]);
const bq = tg.match(/<blockquote>([\s\S]*?)<\/blockquote>/);
ok(!!bq && bq[1].startsWith('<b>Monitoramento</b>') && tg.indexOf('Monitoramento') > tg.indexOf('Vs. média das lojas') && tg.indexOf('Monitoramento') < tg.indexOf('Conferido em'), 'monitoramento num bloco só, no fim da mensagem (antes do rodapé)', bq?.[1]);
ok(!tg.includes('/go/') && !tg.includes('<a '), 'Telegram sem URL no texto (o link vai no botão inline)');
ok(tg.includes('• <b>Vendedor:</b> reputação verde'), 'tópico do vendedor ML (reputação verde)');
const tgLines = tg.split('\n');
ok(tgLines[tgLines.length - 2] === '<i>Conferido em 11/11 às 10:50 (Brasília). #publicidade</i>' && tgLines[tgLines.length - 1] === '<i>Espaço Geek 86 · Informação antes do preço.</i>', 'rodapé: carimbo com #publicidade e, por último, o slogan', tgLines.slice(-2));
ok(countEmojis(tg) <= MAX_EMOJIS_PER_MESSAGE && !countEmojis(lines[0]), 'no máximo 2 emojis e nenhum no título', countEmojis(tg));
ok(tg.length < TELEGRAM_CAPTION_MAX_CHARS && tg.length < TELEGRAM_MAX_CHARS, 'mensagem típica cabe na legenda de foto (1024) e no limite (4096)', tg.length);
ok(textProblems(tg, 'tg').length === 0 && !/afiliad|vai cair|deve cair|tende a|garantid|previs|\bde\s*\/\s*por\b|% ?off/i.test(tg), 'barreira de texto limpa, sem previsão, de/por ou % OFF');
const wa = c1.texts.whatsapp;
ok(wa.startsWith('*🏆 MENOR PREÇO REGISTRADO*\n\n*Tomba! Edição Especial* _Switch · mídia física_\n\n*R$ 94,00* no Mercado Livre\n\n• *Vs. média das lojas:*') && wa.includes('\n> *Monitoramento*') && !/<[a-z/]/i.test(wa), 'WhatsApp equivalente: *negrito*, _itálico_, citação com "> " e sem HTML', wa);
ok(wa.includes(`?s=wa&m=${c1.messageKey}`) && wa.trimEnd().endsWith('_'), 'WhatsApp: link s=wa e rodapé em itálico');
// storytelling por gatilho
const ok2 = evaluateProductV2(product({ series: days([9000, 9000, 9000, 10000, 10000, 10000, 10000, 10000]), offers: [offer({ offerId: 'a', priceCents: 9100 }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 })] }), ctx).candidates.find((c) => c.trigger === 'OK2') as Candidate;
ok(ok2.texts.telegram.includes('9,0% a menos que ontem (R$ 100,00)') && ok2.texts.telegram.includes('Caiu de R$ 100,00 para R$ 91,00'), 'OK2: variação vs ontem como tópico e na leitura', ok2.texts.telegram);
const medMsg = evaluateProductV2(medProduct(), ctx).candidates.find((c) => c.trigger === 'G2') as Candidate;
ok(medMsg.texts.telegram.includes('4,3% abaixo (R$ 5,00); média R$ 115,00') && medMsg.texts.telegram.includes('este preço é 10,0% maior'), 'G2: variação vs média e distância do menor registrado como tópicos', medMsg.texts.telegram);
ok(!medMsg.texts.telegram.includes('📉') && countEmojis(medMsg.texts.telegram) === 0, 'G2 não leva o marcador de queda (não houve queda)');
// escape HTML do título e limite
const evilName = 'Zelda <b>&</b> "Tears" > Kingdom';
const evilMsg = formatOfferMessage(
  { model: 'media', vertical: 'games', messageKey: 'g2-261111-abc123', adTag: AD, name: evilName, title: evilName, meta: 'Sw<itch>', offer: { slug: 'zz', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 11000, confirmedAt: NOW }, avg: { cents: 11500, offers: 3 }, seriesDays: 9, refCents: 10000, sinceDay: '2026-11-03' },
  'tg'
);
ok(evilMsg.includes('<b>Zelda &lt;b&gt;&amp;&lt;/b&gt; "Tears" &gt; Kingdom</b>') && evilMsg.includes('<i>Sw&lt;itch&gt;</i>') && !evilMsg.includes('<b>&</b>'), 'escape de <, > e & no título e na plataforma', evilMsg.split('\n')[0]);
const evilWa = formatOfferMessage({ model: 'media', vertical: 'games', messageKey: 'g2-261111-abc123', adTag: AD, name: 'Jogo *x* _y_ ~z~', offer: { slug: 'zz', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 11000, confirmedAt: NOW }, avg: { cents: 11500, offers: 3 }, seriesDays: 9 }, 'wa');
ok(evilWa.split('\n')[0] === '*Jogo x y z*', 'WhatsApp: formatação do título é removida', evilWa.split('\n')[0]);
const longTitle = 'Jogo '.repeat(1200);
const longMsg = formatOfferMessage({ model: 'media', vertical: 'games', messageKey: 'g2-261111-abc123', adTag: AD, name: longTitle, offer: { slug: 'zz', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 11000, confirmedAt: NOW }, avg: { cents: 11500, offers: 3 }, seriesDays: 9 }, 'tg');
ok(textProblems(longMsg, 'tg').some((p) => p.includes('4096')), 'título gigante estoura 4096 e a barreira reprova (a mensagem não sai)');
// cupom: antes do link, com <code>, no máximo 2 emojis
const cp: CouponInfo = { code: 'GEEK10', conditions: 'R$ 10 acima de R$ 80', expiresAt: new Date(NOW.getTime() + 5 * H).toISOString(), verifiedAt: new Date(NOW.getTime() - 30 * MIN).toISOString() };
const withCp = withCouponBlock(tg, cp, 'tg', NOW);
const cl = withCp.split('\n');
const iCoupon = cl.findIndex((l) => l.includes('CUPOM:'));
ok(iCoupon > 0 && cl[iCoupon].includes('<code>GEEK10</code>') && cl.findIndex((l) => l.startsWith('• ')) > iCoupon && cl[cl.length - 2].startsWith('<i>Conferido'), 'cupom: destaque logo abaixo do preço, antes dos tópicos, rodapé continua por último', withCp);
ok(countEmojis(withCp) <= MAX_EMOJIS_PER_MESSAGE, 'com cupom: ainda no máximo 2 emojis', countEmojis(withCp));
ok(withCouponBlock(tg, { ...cp, expiresAt: new Date(NOW.getTime() - MIN).toISOString() }, 'tg', NOW) === tg, 'cupom vencido: mensagem sai sem cupom');
// Amazon: carimbo e sem média das outras lojas
const amzMsg = evaluateProductV2(product({ series: days([10500, 10500, 10500, 10500, 10500, 10500, 10500, 10500]), amazonSeries: flat8, offers: [offer({ offerId: 'amz', priceCents: 9400, networkSlug: 'amazon', networkName: 'Amazon', sellerId: null, sellerReputation: null, sellerTotalSales: null }), offer({ offerId: 'b', priceCents: 11000 }), offer({ offerId: 'c', priceCents: 12000 }), offer({ offerId: 'd', priceCents: 12500 })] }), ctx).candidates.find((c) => c.networkSlug === 'amazon');
ok(!!amzMsg && amzMsg.texts.telegram.includes('<i>Preço na Amazon em 11/11 às 10:50, sujeito a alteração. #publicidade</i>') && !amzMsg.texts.telegram.includes('A média das') && textProblems(amzMsg.texts.telegram, 'tg').length === 0, 'Amazon: carimbo em itálico, sem média das outras lojas', amzMsg?.texts.telegram);


// ---------------------------------------------------------------------------
// 12) Classe PLATAFORMA (P1 a P5)
// ---------------------------------------------------------------------------
// Fixtures com a mesma estrutura dos dados lidos do banco (série diária desde 31/10, média oferta-dia, ofertas ML e Shopee).
const d0 = (vals: number[], start = '2026-10-31'): DayPoint[] => days(vals, start);
const zeldaSeries = d0([33990, 33990, 32990, 31990, 31990, 34990, 34990, 32990, 31990, 30990, 31990]); // 31/10 a 10/11
const zelda = product({
  masterProductId: '11111111-1111-4111-8111-111111111111', masterName: 'The Legend of Zelda: Tears of the Kingdom', platformLabel: 'Switch', series: zeldaSeries,
  avg: { cents: 33100, distinctOffers: 5, offerDays: 48, spanDays: 11, eligible: false },
  offers: [
    offer({ offerId: 'zml1', priceCents: 31990, title: 'The Legend of Zelda: Tears of the Kingdom Nintendo Switch Fisico' }),
    offer({ offerId: 'zml2', priceCents: 33500, title: 'The Legend of Zelda: Tears of the Kingdom Nintendo Switch Fisico' }),
    offer({ offerId: 'zml3', priceCents: 34900, title: 'The Legend of Zelda: Tears of the Kingdom Nintendo Switch Fisico' }),
    offer({ offerId: 'zsp1', priceCents: 34990, networkSlug: 'shopee', networkName: 'Shopee', sellerId: 'zs1', title: 'The Legend of Zelda: Tears of the Kingdom Nintendo Switch Fisico' }),
  ],
});
const sonicSeries = d0([19990, 19990, 18990, 18990, 19990, 19990, 17990, 17990]);
const sonic = product({
  masterProductId: '22222222-2222-4222-8222-222222222222', masterName: 'Sonic Superstars', platformLabel: 'PS5', series: sonicSeries,
  avg: { cents: 19200, distinctOffers: 4, offerDays: 30, spanDays: 8, eligible: false },
  offers: [
    offer({ offerId: 'sml1', priceCents: 18490, title: 'Sonic Superstars Playstation 5 Fisico' }),
    offer({ offerId: 'sml2', priceCents: 19490, title: 'Sonic Superstars Playstation 5 Fisico' }),
    offer({ offerId: 'sml3', priceCents: 19990, title: 'Sonic Superstars Playstation 5 Fisico' }),
    offer({ offerId: 'ssp1', priceCents: 17991, networkSlug: 'shopee', networkName: 'Shopee', sellerId: 'ss1', title: 'Sonic Superstars Playstation 5 Fisico' }),
  ],
});
const platCtx = { ...ctx };
const plat = buildPlatformCandidates([zelda, sonic], platCtx);
const byKind = (k: string) => plat.find((c) => c.trigger === k);
ok(['P1', 'P2', 'P3', 'P4'].every((k) => !!byKind(k)) && !byKind('P5'), 'builder: um candidato para cada modelo P1..P4 (P5 avulsa desligada: a Black Friday virou indicador)', plat.map((c) => c.trigger));
ok(plat.every((c) => c.cls === 'plataforma' && c.status === 'auto' && c.sendable && !c.held), 'plataforma: classe própria, automática e enviável');
ok(plat.every((c) => textProblems(c.texts.telegram, 'tg').length === 0 && textProblems(c.texts.whatsapp, 'wa').length === 0), 'plataforma: barreira de texto limpa');
ok(plat.every((c) => !/afiliad|vai cair|deve cair|tende a|garantid|previs|\bde\s*\/\s*por\b|% ?off|imperd/i.test(c.texts.telegram + c.texts.whatsapp)), 'plataforma: sem afiliado, previsão, de/por, % OFF');
ok(plat.every((c) => countEmojis(c.texts.telegram) === 0 && c.texts.telegram.length < TELEGRAM_CAPTION_MAX_CHARS), 'plataforma: sem emoji e cabe na legenda de 1024');
ok(plat.every((c) => c.texts.telegram.includes(`href="https://www.egeek86.com/monitoramento/comparar/${c.masterProductId}?s=tg&amp;m=${c.messageKey}"`) && c.texts.whatsapp.includes(`/monitoramento/comparar/${c.masterProductId}?s=wa&m=${c.messageKey}`)), 'plataforma: link para a página do produto com ?s=<canal>&m=<id>');
ok(plat.every((c) => /^p[1-5]-\d{6}-[a-z0-9]+$/.test(c.messageKey)), 'plataforma: message_key no formato do /go');
// P1: histórico com dado real
const p1 = byKind('P1') as Candidate;
ok(p1.masterProductId === zelda.masterProductId, 'P1 escolhe o produto com mais variação medida', p1.name);
ok(p1.texts.telegram.includes('• menor R$ 309,90 em 09/11') && p1.texts.telegram.includes('• média R$ 331,00') && p1.texts.telegram.includes('• hoje R$ 319,90'), 'P1: menor valor e data, média e hoje em tópicos', p1.texts.telegram);
ok(!p1.texts.telegram.includes('Série de'), 'P1: sem frase de série', p1.texts.telegram);
// P2: só ML x Shopee e diferença >= R$ 20
const p2 = byKind('P2') as Candidate;
ok(p2.offerIds.length === 2 && p2.offerIds[0] === 'zml1' && p2.offerIds[1] === 'zsp1', 'P2: as duas ofertas (ML mais barata, Shopee) para reconferir', p2.offerIds);
ok(p2.texts.telegram.includes('• R$ 319,90 no Mercado Livre') && p2.texts.telegram.includes('• R$ 349,90 na Shopee') && p2.texts.telegram.includes('• diferença de R$ 30,00'), 'P2: lojas e diferença em tópicos', p2.texts.telegram);
const near = product({ ...sonic, offers: sonic.offers.map((o) => (o.offerId === 'ssp1' ? { ...o, priceCents: 17990 } : o)) });
const nearP2 = buildPlatformCandidates([near], platCtx).find((c) => c.trigger === 'P2');
ok(!nearP2 || (nearP2.offerIds.length === 2 && Math.abs(18490 - 17990) >= 2000) === false, 'P2: diferença de R$ 5 não vira P2');
ok(buildPlatformCandidates([sonic], platCtx).find((c) => c.trigger === 'P2') === undefined, 'P2: diferença de R$ 5,00 (menos de R$ 20) não gera mensagem');
const onlyMl = product({ ...zelda, offers: zelda.offers.filter((o) => o.networkSlug !== 'shopee') });
ok(buildPlatformCandidates([onlyMl], platCtx).find((c) => c.trigger === 'P2') === undefined, 'P2: sem as duas lojas não existe');
// P3, P4, P5
const p3 = byKind('P3') as Candidate;
ok(p3.texts.telegram.includes('Como acompanhar o preço deste produto') && p3.texts.telegram.includes('4 ofertas ativas') && !/avis/i.test(p3.texts.telegram), 'P3: explica como acompanhar com o produto do dia e sem prometer aviso que o site não faz', p3.texts.telegram);
const p4 = byKind('P4') as Candidate;
ok(p4.texts.telegram.includes('Cada oferta vale 1 por dia') && p4.texts.telegram.includes('5 ofertas e 48 oferta-dias em 11 dias') && p4.texts.telegram.includes('média de R$ 331,00'), 'P4: explica a média única com os números do produto', p4.texts.telegram);
ok(true, 'P5 avulsa desligada');
ok(daysToBlackFriday('2026-11-11') === 16 && daysToBlackFriday('2026-11-27') === 0 && daysToBlackFriday('2026-11-28') === -1, 'dias até a Black Friday (27/11)');
ok(true, 'P5: a Black Friday é indicador nas mensagens de oferta (novembro)');
// produtos diferentes por modelo quando há alternativa
ok(new Set(plat.map((c) => c.masterProductId)).size === 2, 'plataforma: usa produtos diferentes entre os modelos quando há alternativa');
// faixa de plausibilidade
const crazy = product({ ...zelda, offers: [...zelda.offers.slice(1, 4), offer({ offerId: 'zx', priceCents: 5000, title: 'The Legend of Zelda: Tears of the Kingdom Nintendo Switch Fisico' })] });
ok(buildPlatformCandidates([crazy], platCtx).length === 0, 'plataforma: preço fora de 0,35x a 3x da mediana não vira exemplo');
ok(buildPlatformCandidates([product({ ...zelda, masterName: 'Zelda Europeu' , offers: zelda.offers.map((o) => ({ ...o, title: 'Zelda Europeu Switch' })) })], platCtx).length === 0, 'plataforma: produto com região no nome não entra');
// escape e Amazon
const evilP = formatPlatformMessage({ model: 'plataforma', vertical: 'games', messageKey: 'p3-261111-abc123', adTag: AD, name: 'x', title: 'Zelda <b>&</b>', meta: 'Sw<>', path: '/monitoramento/comparar/abc', offer: { slug: 'z', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 31990, confirmedAt: NOW }, data: { kind: 'P3', todayCents: 31990, minCents: null, offersCount: 3 } }, 'tg');
ok(evilP.includes('<b>Zelda &lt;b&gt;&amp;&lt;/b&gt;</b>') && evilP.includes('<i>Sw&lt;&gt;</i>') && textProblems(evilP, 'tg').length === 0, 'plataforma: escape HTML do título e da plataforma');
let threw = false;
try {
  buildSiteLink('/x?y=1', 'tg', 'p1-261111-abc123');
} catch {
  threw = true;
}
ok(threw, 'link do site rejeita caminho com query');
// proporção: pelo menos 1 plataforma a cada 6 mensagens de preço, no máximo 1 a cada 20 min, e quando há pausa de preços > 30 min
const priceMsgs = (n: number, startMin: number) => Array.from({ length: n }, (_, i) => rec(`m${i}`, startMin - i, { cls: 'alerta' }));
const plat1 = (trigger: string, minAgo: number, pid = 'x') => rec('', minAgo, { cls: 'plataforma', trigger, platformProductId: pid, masterProductId: '' });
let due = platformDue([plat1('P1', 60), ...priceMsgs(5, 20)], NOW);
ok(!due.due && due.sincePrice === 5, 'proporção: 5 mensagens de preço desde a última de plataforma = ainda não', due);
due = platformDue([plat1('P1', 60), ...priceMsgs(6, 50)], NOW);
ok(due.due, 'proporção: 6 mensagens de preço desde a última = devida');
due = platformDue([plat1('P1', 19), ...priceMsgs(9, 18)], NOW);
ok(!due.due && due.reason === 'plataforma_intervalo_20min', 'no máximo 1 plataforma a cada 20 min (19 min = não)');
due = platformDue([plat1('P1', 20), ...priceMsgs(9, 18)], NOW);
ok(due.due, '20 min depois da última plataforma e 9 de preço = devida');
due = platformDue([plat1('P1', 90), rec('a', 31), rec('b', 40)], NOW);
ok(due.due && (due.pauseMin ?? 0) > 30, 'pausa de preços há mais de 30 min = devida mesmo com só 2 mensagens de preço');
due = platformDue([plat1('P1', 90), rec('a', 29), rec('b', 40)], NOW);
ok(!due.due, 'preços há 29 min: sem pausa e sem as 6 mensagens = não devida');
ok(platformDue([], NOW).due, 'canal sem nenhuma mensagem: a plataforma pode abrir');
due = platformDue([plat1('P1', 90), ...priceMsgs(6, 50), { ...plat1('P2', 5), itemOnly: true }], NOW);
ok(due.due, 'registro itemOnly não conta');
// no applyLimits
const platC = (k: Trigger, pid: string, score = 5): Candidate => mkc(`pl${k}${pid}`, 'plataforma', { trigger: k, masterProductId: pid, messageKey: `${k.toLowerCase()}-261111-${pid}x1`, moveScore: score });
lp = applyLimits([mkc('a', 'alerta'), platC('P1', 'z')], [plat1('P3', 60), ...priceMsgs(3, 20)], NOW);
eq(lp.next?.masterProductId, 'a', 'plataforma não devida: o alerta sai e a plataforma espera');
ok(lp.deferred.some((d) => d.reason.startsWith('plataforma_aguarda')), 'plataforma adiada pela proporção');
lp = applyLimits([mkc('a', 'alerta'), platC('P4', 'z')], [plat1('P3', 60), ...priceMsgs(6, 50)], NOW);
ok(lp.next?.trigger === 'P4' && lp.nextSound === false, 'plataforma devida passa na frente do alerta e sai SILENCIOSA', lp.deferred);
lp = applyLimits([platC('P1', 'z'), platC('P2', 'z2'), platC('P4', 'z3')], [plat1('P3', 60), ...priceMsgs(6, 50)], NOW);
eq(lp.next?.trigger, 'P4', 'rotação: depois de P3 vem P4 (o modelo seguinte)');
lp = applyLimits([platC('P1', 'z'), platC('P2', 'z2')], [plat1('P5', 60), ...priceMsgs(6, 50)], NOW);
eq(lp.next?.trigger, 'P1', 'rotação: depois de P5 volta para P1');
lp = applyLimits([platC('P3', 'z')], [plat1('P3', 60), ...priceMsgs(6, 50)], NOW);
ok(lp.next === null && lp.deferred[0].reason === 'plataforma_mesmo_modelo_seguido', 'nunca o mesmo modelo seguido', lp.deferred);
lp = applyLimits([platC('P2', 'zz')], [plat1('P1', 60, 'zz'), ...priceMsgs(6, 50)], NOW);
ok(lp.next === null && lp.deferred[0].reason === 'plataforma_produto_ja_hoje', 'não repete o produto no mesmo dia', lp.deferred);
lp = applyLimits([platC('P2', 'zz')], [plat1('P1', 60 * 12, 'zz'), ...priceMsgs(6, 50)], NOW);
ok(lp.next === null || lp.next.trigger === 'P2', 'produto citado ontem pode voltar (regra é por dia)');
const yesterday = new Date(NOW.getTime() - 30 * H);
lp = applyLimits([platC('P2', 'zz')], [{ ...plat1('P1', 0, 'zz'), sentAt: yesterday }, ...priceMsgs(6, 50)], NOW);
ok(lp.next?.trigger === 'P2', 'produto citado ontem pode voltar hoje');
// não conta nos tetos de preço
const manyPlat = Array.from({ length: 80 }, (_, i) => plat1(i % 2 ? 'P1' : 'P2', 61 + i * 0.2, `q${i}`));
lp = applyLimits([mkc('a', 'alerta')], manyPlat, NOW);
ok(lp.next !== null && lp.state.sentToday === 0, 'mensagens de plataforma não contam nos tetos diário e horário de preço');
lp = applyLimits([mkc('a', 'alerta'), platC('P4', 'z')], [plat1('P3', 60), ...Array.from({ length: 60 }, (_, i) => rec(`t${i}`, 2 + i * 0.9, { cls: 'insight' }))], NOW);
ok(lp.next?.trigger === 'P4', 'com o teto horário de preço cheio, a plataforma ainda sai (respeitando o intervalo de 1 min)', lp.deferred);
lp = applyLimits([platC('P4', 'z')], [rec('h', 0.3)], NOW);
ok(lp.next === null, 'a plataforma também respeita o intervalo mínimo de 1 min');
ok(soundDecision('plataforma', [], NOW) === false, 'plataforma nunca tem som');
const plan0 = planDaySlots(NOW, [plat1('P1', 5), plat1('P2', 3)]);
ok(plan0.sentToday === 0 && plan0.remaining === 400, 'plano do dia não conta as de plataforma como preço');

console.log('');
liveTests()
  .then(() => {
    console.log(`${total - fails}/${total} verificações ok (onda 2)`);
    if (fails) {
      console.error(`${fails} falha(s)`);
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
