/**
 * #119: parser do cartão (polycard) da página do link meli.la, com HTML REAL gravado, e veredito da auditoria.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-auditoria-links-119.ts
 */
import fs from 'node:fs';
import { auditarCartoes, extrairPolycardsJson, lerCartoes, toleranciaCents } from '../src/lib/links/polycard';
import { avaliarAuditoria, avaliarConfirmacao, estritaCanalLigada, estritoCanalPara, VEREDITOS_BLOQUEANTES } from '../src/lib/messaging/confirmacao-preco';
import { runLivePhase, type LiveTarget } from '../src/lib/messaging/live-recheck';

process.env.AMAZON_FORA_DAS_MENSAGENS = '0'; // contencao #120 (Amazon fora das mensagens) e de outra frente: estes testes cobrem as regras de confirmacao em si
let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const ativo = fs.readFileSync('scripts/fixtures/polycards-p2s-egghome-ativo.html', 'utf8');
const pausado = fs.readFileSync('scripts/fixtures/polycards-a1-pausado.html', 'utf8');

const a = lerCartoes(ativo);
ok(a.length === 1 && a[0]!.itemId === 'MLB5487109677' && a[0]!.productId === 'MLB63260374', 'P2S EGGHOME: item e catálogo', a[0]);
ok(a[0]!.precoCents === 939900 && a[0]!.precoAnteriorCents === 1099900 && !a[0]!.pausado, 'P2S EGGHOME: R$ 9.399 (de 10.999), ativo', a[0]);
const p = lerCartoes(pausado);
ok(p.length === 1 && p[0]!.itemId === 'MLB5563781513' && p[0]!.productId === 'MLB53254557' && p[0]!.precoCents === 382600 && p[0]!.pausado, 'A1 Combo: MLB5563781513, R$ 3.826, anúncio pausado', p[0]);

// Vereditos (casos reais do dono)
ok(auditarCartoes(p, { itemId: 'MLB5563781513', productId: 'MLB53254557', precoCents: 351992 }).verdict === 'pausado', 'A1 Combo: pausado');
ok(auditarCartoes(a, { itemId: null, productId: 'MLB63260374', precoCents: 1989910 }).verdict === 'preco_divergente', 'EGGHOME a R$ 19.899,10 (era o preço da oferta): divergente');
ok(auditarCartoes(a, { itemId: null, productId: 'MLB63260374', precoCents: 939900 }).verdict === 'ok', 'EGGHOME a R$ 9.399: ok');
ok(auditarCartoes(a, { itemId: null, productId: 'MLB63260374', precoCents: 940500 }).verdict === 'ok', 'diferença de R$ 6 em R$ 9.399 (0,06%): dentro da tolerância (maior entre R$ 1 e 0,1%)');
ok(auditarCartoes(a, { itemId: null, productId: 'MLB63260374', precoCents: 942900 }).verdict === 'preco_divergente', 'diferença de R$ 30 em R$ 9.399: divergente (0,5% deixava passar)');
ok(auditarCartoes(a, { itemId: null, productId: 'MLB63260374', precoCents: 950000 }).verdict === 'preco_divergente', 'diferença de 1,1%: divergente');
ok(toleranciaCents(10000) === 100 && toleranciaCents(1000000) === 1000, 'tolerância: R$ 1 mínimo, 0,1% acima');
ok(auditarCartoes(a, { itemId: 'MLB1111111111', productId: 'MLB63260374', precoCents: 939900 }).verdict === 'item_diferente', 'anúncio diferente do esperado');
ok(auditarCartoes(a, { itemId: null, productId: 'MLB99999999', precoCents: 939900 }).verdict === 'item_diferente', 'catálogo diferente (sem anúncio esperado)');
ok(auditarCartoes([], { itemId: null, productId: null, precoCents: 100 }).verdict === 'erro_leitura', 'sem polycards: erro de leitura');
ok(extrairPolycardsJson('<html>captcha</html>') === null && lerCartoes('"polycards":[{"a":"]"') .length === 0, 'HTML sem polycards ou truncado não lança');

// Porteiro: a auditoria barra e a oferta corrigida volta
const now = new Date('2026-11-15T21:30:00Z');
const base = { uso: 'queda' as const, rede: 'mercado-livre', status: 'active', confirmedAt: new Date(now.getTime() - 60_000), now };
ok(avaliarConfirmacao({ ...base, auditoria: { verdict: 'pausado', checkedAt: new Date(now.getTime() - 3600_000) } }).motivo === 'link_divergente', 'pausado barra');
ok(avaliarConfirmacao({ ...base, auditoria: { verdict: 'preco_divergente', checkedAt: new Date(now.getTime() - 3600_000) } }).motivo === 'link_divergente', 'preço divergente barra');
ok(avaliarConfirmacao({ ...base, auditoria: { verdict: 'ok', checkedAt: new Date(now.getTime() - 3600_000) } }).ok, 'ok passa');
ok(avaliarConfirmacao({ ...base, auditoria: { verdict: 'erro_leitura', checkedAt: new Date(now.getTime() - 3600_000) } }).ok, 'erro de leitura não silencia (fail-open)');
ok(avaliarConfirmacao({ ...base, auditoria: { verdict: 'pausado', checkedAt: new Date(now.getTime() - 7 * 3600_000) } }).ok, 'auditoria velha (> 6 h) não vale');
ok(avaliarConfirmacao({ ...base, auditoria: null }).ok, 'nunca auditada passa');

// Regra rígida do privado
const rig = { ...base, estrito: true, priceItemId: 'MLB5563781513', catalogoRef: 'MLB53254557' };
ok(avaliarConfirmacao({ ...rig, auditoria: null }).motivo === 'sem_veredito_ok', 'rígido: sem veredito não sai');
ok(avaliarConfirmacao({ ...rig, auditoria: { verdict: 'erro_leitura', checkedAt: new Date(now.getTime() - 600_000), okEm: null } }).motivo === 'sem_veredito_ok', 'rígido: só erro_leitura não sai');
ok(avaliarConfirmacao({ ...rig, auditoria: { verdict: 'ok', checkedAt: new Date(now.getTime() - 3600_000) } }).ok, 'rígido: ok recente sai');
ok(avaliarConfirmacao({ ...rig, auditoria: { verdict: 'ok', checkedAt: new Date(now.getTime() - 7 * 3600_000) } }).motivo === 'sem_veredito_ok', 'rígido: ok de 7 h não sai');
ok(avaliarConfirmacao({ ...rig, auditoria: { verdict: 'erro_leitura', checkedAt: new Date(now.getTime() - 600_000), okEm: new Date(now.getTime() - 3 * 3600_000) } }).ok, 'rígido: erro transitório com ok de 3 h passa');
ok(avaliarConfirmacao({ ...rig, uso: 'queda', confirmedAt: new Date(now.getTime() - 61 * 60_000), auditoria: { verdict: 'ok', checkedAt: now } }).motivo === 'confirmacao_velha', 'rígido: queda exige preço confirmado <= 60 min também');
ok(avaliarConfirmacao({ ...rig, auditoria: { verdict: 'pausado', checkedAt: now, okEm: new Date(now.getTime() - 3600_000) } }).motivo === 'link_divergente', 'rígido: pausado depois de ok barra');

// Ok OBSOLETO: preço ou anúncio mudou depois do veredito
const h = (min: number) => new Date(now.getTime() - min * 60_000);
const E = { ...base, estrito: true, priceItemId: 'MLB5563781513', catalogoRef: 'MLB53254557' };
ok(avaliarConfirmacao({ ...E, auditoria: { verdict: 'ok', checkedAt: h(30) }, precoMudouEm: h(10) }).motivo === 'veredito_obsoleto', 'ok anterior à mudança de preço: obsoleto');
ok(avaliarConfirmacao({ ...E, auditoria: { verdict: 'ok', checkedAt: h(30) }, itemTrocadoEm: h(10) }).motivo === 'veredito_obsoleto', 'ok anterior à troca de anúncio: obsoleto');
ok(avaliarConfirmacao({ ...E, auditoria: { verdict: 'ok', checkedAt: h(5) }, precoMudouEm: h(10) }).ok, 'ok posterior à mudança: vale');
// Amazon/Shopee no estrito: sem veredito de página, valem pela janela de confirmação
ok(avaliarConfirmacao({ ...E, rede: 'amazon', priceItemId: null, auditoria: null, confirmedAt: h(100) }).ok, 'estrito Amazon: sem veredito, confirmação de 100 min passa');
ok(avaliarConfirmacao({ ...E, rede: 'amazon', priceItemId: null, auditoria: null, confirmedAt: h(140) }).motivo === 'confirmacao_velha', 'estrito Amazon: confirmação de 140 min barra');

// Caminho de envio de grupos/canal (live-recheck): fail-open por padrão; estrito com CONFIRMACAO_ESTRITA_CANAL=1
const alvo = (over: Partial<LiveTarget> = {}): LiveTarget => ({ offerId: 'o1', role: 'original', networkSlug: 'mercado-livre', externalRef: 'MLB53254557', externalItemId: 'MLB5563781513', linkItemId: 'MLB5563781513', affiliateUrl: 'https://meli.la/x', sellerExternalId: '1', storedPriceCents: 100000, confirmedAt: h(1), detectedPriceCents: 100000, listingIdTrusted: true, ...over });
const fase = (t: LiveTarget) => runLivePhase({ now, targets: [t], mode: 'single', humanApproved: false, deps: {} });
(async () => {
  delete process.env.CONFIRMACAO_ESTRITA_CANAL;
  ok(!estritaCanalLigada(), 'flag estrita do canal: desligada por padrão');
  ok((await fase(alvo({ auditoria: null }))).ok, 'canal (padrão): sem veredito sai (fail-open)');
  ok(!(await fase(alvo({ auditoria: { verdict: 'pausado', checkedAt: h(30) } }))).ok, 'canal (padrão): pausado barra');
  process.env.CONFIRMACAO_ESTRITA_CANAL = '1';
  ok(estritaCanalLigada(), 'flag estrita do canal ligada');
  const r1 = await fase(alvo({ auditoria: null }));
  ok(!r1.ok && /sem_veredito_ok/.test(r1.reason ?? ''), 'canal estrito: sem veredito não sai', r1.reason);
  const r2 = await fase(alvo({ auditoria: { verdict: 'erro_leitura', checkedAt: h(5), okEm: null } }));
  ok(!r2.ok, 'canal estrito: erro_leitura não sai');
  ok((await fase(alvo({ auditoria: { verdict: 'ok', checkedAt: h(5) } }))).ok, 'canal estrito: ok recente sai');
  const r3 = await fase(alvo({ auditoria: { verdict: 'ok', checkedAt: h(30) }, precoMudouEm: h(10) }));
  ok(!r3.ok && /veredito_obsoleto/.test(r3.reason ?? ''), 'canal estrito: ok obsoleto não sai', r3.reason);
  const r4 = await fase(alvo({ externalItemId: null, auditoria: { verdict: 'ok', checkedAt: h(5) } }));
  ok(!r4.ok, 'canal estrito: sem anúncio concreto não sai');
  // Escopo Bambu: estrito só para Bambu Lab, fail-open (com bloqueio de veredito ruim) para o resto
  ok(!estritoCanalPara(true, {}) && estritoCanalPara(true, { CONFIRMACAO_ESTRITA_CANAL_ESCOPO: 'bambu' }) && !estritoCanalPara(false, { CONFIRMACAO_ESTRITA_CANAL_ESCOPO: 'bambu' }), 'escopo bambu: só Bambu é estrito');
  ok(estritoCanalPara(false, { CONFIRMACAO_ESTRITA_CANAL: '1' }), 'flag geral: tudo estrito');
  delete process.env.CONFIRMACAO_ESTRITA_CANAL;
  process.env.CONFIRMACAO_ESTRITA_CANAL_ESCOPO = 'bambu';
  const rb = await fase(alvo({ ehBambu: true, auditoria: null }));
  ok(!rb.ok && /sem_veredito_ok/.test(rb.reason ?? ''), 'canal escopo bambu: Bambu sem veredito não sai', rb.reason);
  ok((await fase(alvo({ ehBambu: false, auditoria: null }))).ok, 'canal escopo bambu: fora de Bambu segue fail-open');
  ok(!(await fase(alvo({ ehBambu: false, auditoria: { verdict: 'preco_divergente', checkedAt: h(10) } }))).ok, 'canal escopo bambu: veredito ruim fora de Bambu bloqueia');
  ok(!(await fase(alvo({ ehBambu: false, auditoria: { verdict: 'pendente_de_anuncio', checkedAt: h(10) } }))).ok && (VEREDITOS_BLOQUEANTES as readonly string[]).includes('pendente_de_anuncio'), 'pendente_de_anuncio bloqueia');
  const ra = await fase(alvo({ networkSlug: 'amazon', ehBambu: true, externalItemId: null, confirmedAt: h(200), auditoria: null }));
  ok(!ra.ok && /confirmacao_velha/.test(ra.reason ?? ''), 'canal escopo bambu: Amazon Bambu com leitura de 200 min não sai', ra.reason);
  ok((await fase(alvo({ networkSlug: 'amazon', ehBambu: true, externalItemId: null, confirmedAt: h(60), auditoria: null }))).ok, 'canal escopo bambu: Amazon Bambu com leitura de 60 min sai');
  delete process.env.CONFIRMACAO_ESTRITA_CANAL_ESCOPO;
  console.log(fails ? `${fails} falha(s)` : 'OK: auditoria de links #119');
  process.exit(fails ? 1 : 0);
})();
