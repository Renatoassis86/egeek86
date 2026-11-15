/**
 * #119: parser do cartão (polycard) da página do link meli.la, com HTML REAL gravado, e veredito da auditoria.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-auditoria-links-119.ts
 */
import fs from 'node:fs';
import { auditarCartoes, extrairPolycardsJson, lerCartoes } from '../src/lib/links/polycard';
import { avaliarConfirmacao } from '../src/lib/messaging/confirmacao-preco';

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
ok(auditarCartoes(a, { itemId: null, productId: 'MLB63260374', precoCents: 941000 }).verdict === 'ok', 'diferença de 0,12%: dentro da tolerância');
ok(auditarCartoes(a, { itemId: null, productId: 'MLB63260374', precoCents: 950000 }).verdict === 'preco_divergente', 'diferença de 1,1%: divergente');
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

console.log(fails ? `${fails} falha(s)` : 'OK: auditoria de links #119');
process.exit(fails ? 1 : 0);
