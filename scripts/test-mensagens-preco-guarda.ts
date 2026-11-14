/**
 * Teste da PORTA DE SEGURANÇA DE PREÇO da mensagem (2026-11-14): `preco_oscilando` e `link_sem_conferencia`.
 * Caso real: Bambu Lab P2S Combo, oferta do vendedor NIC.3D sem external_item_id, alternando R$ 9.399,00 e R$ 8.513,22 a cada ~16 s.
 * Sem banco, sem rede, sem token (fetch injetado). Uso: npx tsx scripts/test-mensagens-preco-guarda.ts (código 1 se algo falhar).
 */
import { GUARD, anuncioIdentificado, avaliarOscilacao, motivoOscilacao, type PricePoint } from '../src/lib/messaging/price-guard';
import { needsLive, runLivePhase, type LiveDeps, type LiveTarget } from '../src/lib/messaging/live-recheck';
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

const SEG = 1000;
const MIN = 60 * SEG;
const H = 60 * MIN;
const NOW = new Date('2026-11-14T02:07:00Z');
const at = (msAtras: number) => new Date(NOW.getTime() - msAtras);
const pt = (msAtras: number, priceCents: number): PricePoint => ({ at: at(msAtras), priceCents });

const ALTO = 939_900; // R$ 9.399,00 (anúncio do EGGHOME)
const BAIXO = 851_322; // R$ 8.513,22 (anúncio irmão do NIC.3D)

// ---------------------------------------------------------------------------
// 1) preco_oscilando (função pura)
// ---------------------------------------------------------------------------
{
  // Caso P2S: pares separados por ~16 s, vários ciclos nas últimas horas.
  const p2s: PricePoint[] = [
    pt(30 * H, ALTO), // base antes da janela
    pt(5 * H + 17 * SEG, ALTO), pt(5 * H, BAIXO),
    pt(4 * H + 17 * SEG, ALTO), pt(4 * H, BAIXO),
    pt(3 * H + 17 * SEG, ALTO), pt(3 * H, BAIXO),
  ];
  const o = avaliarOscilacao(p2s, NOW);
  ok(o.oscilando && o.trocas >= 5 && o.distintos === 2, 'P2S: alternar 9.399 e 8.513,22 é oscilação', o);
  ok(o.amplitudePct >= 10 && o.amplitudePct < 11, 'P2S: amplitude ~10,4%', o);
  ok(motivoOscilacao(o).startsWith('preco_oscilando:'), 'motivo fechado preco_oscilando', motivoOscilacao(o));

  // Mínimo: A→B→A→B = 3 trocas em 24 h
  ok(avaliarOscilacao([pt(3 * H, ALTO), pt(2 * H, BAIXO), pt(1 * H, ALTO), pt(30 * MIN, BAIXO)], NOW).oscilando, '3 trocas com retorno: oscila');
  // 2 trocas só (A→B→A) não basta
  ok(!avaliarOscilacao([pt(3 * H, ALTO), pt(2 * H, BAIXO), pt(1 * H, ALTO)], NOW).oscilando, '2 trocas: não oscila');
  // queda em degraus (sem retorno) é mercado, não oscilação
  ok(!avaliarOscilacao([pt(5 * H, 100_000), pt(4 * H, 94_000), pt(3 * H, 88_000), pt(2 * H, 82_000)], NOW).oscilando, 'queda em degraus sem retorno: não oscila');
  // amplitude pequena (<5%) é ruído
  ok(!avaliarOscilacao([pt(4 * H, 100_000), pt(3 * H, 101_000), pt(2 * H, 100_000), pt(1 * H, 101_000)], NOW).oscilando, 'amplitude de 1%: ruído, não oscila');
  // batimento (mesmo preço repetido) não conta como troca
  ok(!avaliarOscilacao([pt(20 * H, ALTO), pt(10 * H, ALTO), pt(1 * H, ALTO)], NOW).oscilando, 'batimento do mesmo preço: não oscila');
  // muitos preços distintos (> 4) não é "poucos valores"
  ok(!avaliarOscilacao([pt(6 * H, 100_000), pt(5 * H, 110_000), pt(4 * H, 120_000), pt(3 * H, 130_000), pt(2 * H, 140_000), pt(1 * H, 100_000)], NOW).oscilando, 'mais de 4 preços distintos: não oscila');
  // estabilizou: as trocas saíram da janela de 24 h, sobra só o último preço
  const estavel: PricePoint[] = [pt(60 * H, ALTO), pt(59 * H, BAIXO), pt(58 * H, ALTO), pt(57 * H, BAIXO), pt(30 * H, BAIXO)];
  const e = avaliarOscilacao(estavel, NOW);
  ok(!e.oscilando && e.trocas === 0, 'estabilizou (trocas fora da janela de 24 h): volta a poder sair', e);
  // sem histórico
  ok(!avaliarOscilacao([], NOW).oscilando, 'sem histórico: não oscila');
  ok(GUARD.OSC_MIN_CHANGES === 3 && GUARD.OSC_WINDOW_HOURS === 24 && GUARD.OSC_MIN_AMPLITUDE_PCT === 5, 'constantes da regra (3 trocas, 24 h, 5%)');
}

// ---------------------------------------------------------------------------
// 2) integração na fase ao vivo
// ---------------------------------------------------------------------------
const TOKEN = 'TOKEN-DE-TESTE';
function meliFetch(rows: Array<{ status?: number; body?: unknown }>) {
  const calls: string[] = [];
  let i = 0;
  const f: FetchLike = async (url) => {
    calls.push(url);
    const r = rows[Math.min(i++, rows.length - 1)]!;
    return { status: r.status ?? 200, json: async () => r.body };
  };
  return { f, calls };
}
const deps = (f: FetchLike): LiveDeps => ({ fetchImpl: f, meliToken: async () => TOKEN, record: async () => undefined, timeoutMs: 80 });
// Oferta do P2S: sem external_item_id, link curto meli.la (não identifica o anúncio), preço gravado FRESCO (vindo do anúncio irmão).
const p2sTarget = (over: Partial<LiveTarget> = {}): LiveTarget => ({
  offerId: 'o-nic3d', role: 'original', masterProductId: 'p2s', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
  externalRef: 'MLB72865438', affiliateUrl: 'https://meli.la/1abcd', externalItemId: null, sellerExternalId: '549613405',
  storedPriceCents: BAIXO, confirmedAt: at(20 * SEG), detectedPriceCents: BAIXO, listingIdTrusted: false, ...over,
});
// Catálogo MLB72865438 (P2S Combo): só existe o anúncio do EGGHOME a R$ 9.399; NIC.3D não tem anúncio aqui (o 8.513,22 é do outro catálogo).
const catalogoP2S = { results: [{ item_id: 'MLB5000000001', price: 9399, condition: 'new', seller_id: 111222 }] };

async function integracao() {
  ok(anuncioIdentificado({ externalItemId: 'MLB123' }) && anuncioIdentificado({ itemIdFromUrl: 'MLB123' }), 'id do anúncio confiável: external_item_id ou id MLB na URL');
  ok(!anuncioIdentificado({ externalItemId: null, itemIdFromUrl: null }) && !anuncioIdentificado({ externalItemId: '  ' }), 'sem id: não identificado');

  // needsLive: sem id confiável NUNCA pula, mesmo com preço fresco (a falha que enviou 8.513,22)
  const NOWD = NOW;
  ok(needsLive(p2sTarget(), NOWD, false) === true, 'link_sem_conferencia: preço fresco sem id do anúncio ainda exige consulta ao vivo');
  ok(needsLive(p2sTarget({ listingIdTrusted: true, confirmedAt: at(20 * SEG) }), NOWD, false) === false, 'com id confiável e preço fresco: segue sem consulta (comportamento antigo)');
  ok(needsLive(p2sTarget({ listingIdTrusted: undefined, confirmedAt: at(20 * SEG) }), NOWD, false) === false, 'sem a marca (legado): comportamento antigo preservado');
  ok(needsLive(p2sTarget({ role: 'competitor' }), NOWD, false) === false, 'concorrente não é afetada');

  // A) P2S sem oscilação nos dados, mas sem id: consulta ao vivo NÃO acha o anúncio do vendedor no catálogo → barra (link_sem_conferencia)
  let m = meliFetch([{ body: catalogoP2S }]);
  let r = await runLivePhase({ now: NOW, targets: [p2sTarget()], mode: 'single', humanApproved: false, deps: deps(m.f) });
  ok(!r.ok && m.calls.length === 1 && r.logs[0]!.verdict === 'fail' && (r.logs[0]!.reason ?? '').startsWith('link_sem_conferencia:'), 'P2S: não foi pulada e o anúncio do vendedor não está no catálogo: barrada', r);
  ok(!!r.reason && r.reason.includes('link_sem_conferencia'), 'motivo link_sem_conferencia chega ao resultado da fase', r.reason);

  // B) P2S oscilando (histórico alternando a cada ~16 s): barrada SEM chamar a API, mesmo com preço fresco
  const hist: PricePoint[] = [pt(30 * H, ALTO), pt(5 * H + 17 * SEG, ALTO), pt(5 * H, BAIXO), pt(4 * H + 17 * SEG, ALTO), pt(4 * H, BAIXO), pt(3 * H + 17 * SEG, ALTO), pt(3 * H, BAIXO)];
  m = meliFetch([{ body: catalogoP2S }]);
  r = await runLivePhase({ now: NOW, targets: [p2sTarget({ priceHistory: hist })], mode: 'single', humanApproved: false, deps: deps(m.f) });
  ok(!r.ok && m.calls.length === 0 && (r.logs[0]!.reason ?? '').startsWith('preco_oscilando'), 'P2S oscilando: barrada antes de qualquer consulta', r);
  r = await runLivePhase({ now: NOW, targets: [p2sTarget({ priceHistory: hist })], mode: 'single', humanApproved: true, deps: deps(m.f) });
  ok(!r.ok && (r.logs[0]!.reason ?? '').startsWith('preco_oscilando'), 'aprovação humana não libera oferta oscilando', r);

  // C) radar: oscilando só tira o item (não derruba o radar inteiro)
  const normal = p2sTarget({ offerId: 'o-ok', listingIdTrusted: true, externalItemId: 'MLB5000000001', sellerExternalId: '111222', storedPriceCents: 939_900, detectedPriceCents: 939_900, confirmedAt: at(5 * MIN) });
  m = meliFetch([{ body: catalogoP2S }]);
  r = await runLivePhase({ now: NOW, targets: [p2sTarget({ priceHistory: hist }), normal], mode: 'radar', humanApproved: false, deps: deps(m.f) });
  ok(r.ok && r.droppedOfferIds.includes('o-nic3d') && !r.droppedOfferIds.includes('o-ok'), 'radar: só o item oscilando sai', r);

  // D) oferta com id confiável, preço fresco e histórico estável: sai normalmente (sem consulta, como antes)
  m = meliFetch([{ body: catalogoP2S }]);
  r = await runLivePhase({ now: NOW, targets: [normal], mode: 'single', humanApproved: false, deps: deps(m.f) });
  ok(r.ok && r.logs[0]!.verdict === 'skipped' && m.calls.length === 0, 'id confiável + fresco + estável: sai sem custo extra', r);

  // E) sem id, mas a consulta ao vivo ACHA o anúncio do vendedor e bate com o detectado: sai (conferido agora)
  m = meliFetch([{ body: { results: [{ item_id: 'MLB7064408358', price: 8513.22, condition: 'new', seller_id: 549613405 }] } }]);
  r = await runLivePhase({ now: NOW, targets: [p2sTarget()], mode: 'single', humanApproved: false, deps: deps(m.f) });
  ok(r.ok && r.logs[0]!.verdict === 'ok' && r.logs[0]!.checked, 'sem id, mas conferida ao vivo agora e batendo: sai', r);

  // F) sem id e o vendedor tem DOIS anúncios com preços diferentes no catálogo: ambíguo, barra
  m = meliFetch([{ body: { results: [
    { item_id: 'MLB1', price: 9399, condition: 'new', seller_id: 549613405 },
    { item_id: 'MLB2', price: 8513.22, condition: 'new', seller_id: 549613405 },
  ] } }]);
  r = await runLivePhase({ now: NOW, targets: [p2sTarget()], mode: 'single', humanApproved: false, deps: deps(m.f) });
  ok(!r.ok && (r.logs[0]!.reason ?? '').includes('ml_vendedor_com_varios_anuncios') && (r.logs[0]!.reason ?? '').startsWith('link_sem_conferencia:'), 'sem id e vendedor com vários anúncios: ambíguo, barra', r);

  // G) sem id e a API falha (rede): não sai
  m = meliFetch([{ status: 500, body: {} }]);
  r = await runLivePhase({ now: NOW, targets: [p2sTarget()], mode: 'single', humanApproved: false, deps: deps(m.f) });
  ok(!r.ok && (r.logs[0]!.reason ?? '').startsWith('link_sem_conferencia:'), 'sem id e API fora: não sai', r);

  // H) sem id, achou o anúncio, mas o preço vivo diverge do detectado: barra pela regra de 2%
  m = meliFetch([{ body: { results: [{ item_id: 'MLB7064408358', price: 9399, condition: 'new', seller_id: 549613405 }] } }]);
  r = await runLivePhase({ now: NOW, targets: [p2sTarget()], mode: 'single', humanApproved: false, deps: deps(m.f) });
  ok(!r.ok && r.logs[0]!.verdict === 'fail', 'sem id, preço vivo 9.399 contra detectado 8.513,22: diverge, barra', r);
}

integracao()
  .then(() => {
    console.log(`test-mensagens-preco-guarda: ${total - fails}/${total} ok`);
    process.exit(fails ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
