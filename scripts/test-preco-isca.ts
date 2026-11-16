/**
 * Testes do GATILHO PERMANENTE DE PRECO-ISCA (Fluxo Mestre R-61). Sem banco. Rodar: npm run test:preco-isca
 * Cobre: caso PS5 (R$ 1.999,99 contra mercado de ~R$ 4.900), promocao real poupada, referencia insuficiente, placeholders, rede nova hipotetica, item novo,
 * flag, e GUARDAS ESTRUTURAIS (o gatilho nao pode sair do codigo: gancho da coleta, filtro das leituras, invariante do medidor).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ISCA_MIN_VENDEDORES, ISCA_RAZAO_MAX, avaliarIsca, gatilhoIscaLigado, medianaPorVendedor, type ReferenciaIsca } from '../src/lib/pricing/preco-isca';

const R = (reais: number) => Math.round(reais * 100);
let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log('ok -', nome); };
const refs = (...v: Array<[string | null, number]>): ReferenciaIsca[] => v.map(([sellerId, p]) => ({ sellerId, priceCents: R(p) }));

// Mercado do PS5 Slim Digital (2026-11-16): vendedores reais entre R$ 3.099 e R$ 5.500, mediana ~R$ 4.900.
const PS5 = refs(['v1', 3099], ['v2', 4599], ['v3', 4900], ['v4', 4950], ['v5', 5200], ['v6', 5500]);

ok('PS5: anuncio isca a R$ 1.999,99 e marcado (razao ~0,41, 6 vendedores)', () => {
  const v = avaliarIsca(R(1999.99), PS5);
  assert.equal(v.isca, true);
  assert.equal(v.degrau, 'forte');
  assert.ok(v.razao! < ISCA_RAZAO_MAX && v.razao! > 0.35);
});
ok('PS5: o menor preco real (R$ 3.099) e promocao em linha, nao isca', () => assert.equal(avaliarIsca(R(3099), PS5).isca, false));
ok('PS5: 30% abaixo da mediana (R$ 3.400) e promocao real, poupada', () => assert.equal(avaliarIsca(R(3400), PS5).isca, false));
ok('placeholders (sem vendedor) herdam o menor preco e SAO julgados (R$ 1.999,99 vira isca)', () => assert.equal(avaliarIsca(R(1999.99), PS5).isca, true));
ok('placeholders NAO servem de referencia (3 placeholders baratos nao baixam a mediana)', () => {
  const comPlaceholders = [...PS5, ...refs([null, 1999.99], [null, 1999.99], [null, 1999.99], [null, 2500])];
  assert.deepEqual(medianaPorVendedor(comPlaceholders), medianaPorVendedor(PS5));
  assert.equal(avaliarIsca(R(1999.99), comPlaceholders).isca, true);
});
ok('referencia insuficiente (< 3 vendedores): nao julga (media provisoria aceita, nada de rebaixar)', () => {
  const v = avaliarIsca(R(100), refs(['a', 500], ['b', 520]));
  assert.equal(v.isca, false);
  assert.equal(v.razao, null);
  assert.equal(ISCA_MIN_VENDEDORES, 3);
});
ok('um vendedor com varios anuncios vale UM voto (nao fabrica referencia)', () => {
  const v = avaliarIsca(R(100), refs(['a', 500], ['a', 510], ['a', 520], ['a', 530], ['b', 540]));
  assert.equal(v.vendedores, 2);
  assert.equal(v.isca, false);
});
ok('um vendedor isca entre os de referencia nao derruba a mediana (robusto)', () => {
  const v = avaliarIsca(R(2000), refs(['a', 1999.99], ['b', 4800], ['c', 4900], ['d', 5000], ['e', 5100]));
  assert.equal(v.isca, true); // mediana 4900 mesmo com a isca de outro vendedor entre as referencias
});
ok('REDE NOVA hipotetica: nada no criterio conhece rede/loja; ids de vendedor de qualquer rede funcionam', () => {
  const redeNova = refs(['rede-nova:loja-1', 200], ['rede-nova:loja-2', 210], ['rede-nova:loja-3', 190], ['rede-nova:loja-4', 205]);
  assert.equal(avaliarIsca(R(40), redeNova).isca, true);
  assert.equal(avaliarIsca(R(180), redeNova).isca, false);
});
ok('ITEM NOVO: primeiros anuncios (1 a 2 vendedores) nao sao julgados; ao chegar o 3o vendedor o gatilho passa a valer', () => {
  assert.equal(avaliarIsca(R(10), refs(['a', 300])).isca, false);
  assert.equal(avaliarIsca(R(10), refs(['a', 300], ['b', 310])).isca, false);
  assert.equal(avaliarIsca(R(10), refs(['a', 300], ['b', 310], ['c', 305])).isca, true);
});
ok('preco invalido (0, NaN) nunca e isca', () => {
  assert.equal(avaliarIsca(0, PS5).isca, false);
  assert.equal(avaliarIsca(NaN, PS5).isca, false);
});
ok('queda do MESMO anuncio nao e assunto deste gatilho: so compara com outros vendedores (preco igual ao mercado nunca e isca)', () => assert.equal(avaliarIsca(R(4900), PS5).isca, false));
ok('flag: GATILHO_PRECO_ISCA=0 desliga; ausente ou outro valor liga', () => {
  assert.equal(gatilhoIscaLigado({ GATILHO_PRECO_ISCA: '0' }), false);
  assert.equal(gatilhoIscaLigado({}), true);
  assert.equal(gatilhoIscaLigado({ GATILHO_PRECO_ISCA: '1' }), true);
});

// ---- guardas estruturais: o gatilho nao pode sair do codigo ----
const le = (p: string) => fs.readFileSync(p, 'utf8');
ok('GUARDA: o coletor chama o gatilho em TODA gravacao (recordPriceSnapshot)', () => assert.match(le('src/server/collector/record-price-snapshot.ts'), /avaliarEMarcarIsca/));
ok('GUARDA: a agregacao oferta-dia (fonte de minimo, media, regua, cards e mensagens) ignora cotacao marcada', () => {
  const s = le('src/server/pricing/price-daily.ts');
  assert.ok((s.match(/snapshotNaoIscaSql\('s'\)/g) ?? []).length >= 2, 'upsertOfferDays e loadReconOffers');
});
ok('GUARDA: leituras diretas de cotacao (historico, estatistica de produto, metricas da oferta) ignoram cotacao marcada', () => {
  for (const f of ['src/server/queries/price-history.ts', 'src/server/queries/product-price-stats.ts', 'src/server/queries/affiliate.ts']) assert.match(le(f), /snapshotNaoIscaSql/, f);
});
ok('GUARDA: a quarentena antiga nao solta a quarentena do gatilho', () => assert.match(le('src/server/collector/quarentena-preco-tipo.ts'), /!razao\.startsWith\('preco_isca'\)/));
ok('GUARDA: o medidor de integridade tem o invariante de cotacao-isca vigente', () => assert.match(le('scripts/medir-integridade-preco.ts'), /preco-isca|isca/i));
ok('GUARDA: o criterio nao menciona rede, loja ou produto (vale para qualquer rede nova)', () => {
  const src = le('src/lib/pricing/preco-isca.ts').split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*')).join('\n');
  assert.doesNotMatch(src, /mercado-livre|amazon|shopee|magalu|slug|network/i);
});
ok('GUARDA: a regra esta no Fluxo Mestre (R-61) e na fila', () => {
  assert.match(le('docs/03-metodologia/FLUXO_MESTRE.md'), /R-61/);
  assert.match(le('docs/03-metodologia/FLUXO_MESTRE.md'), /GATILHO_PRECO_ISCA/);
});
console.log(`\n${n} testes ok`);
