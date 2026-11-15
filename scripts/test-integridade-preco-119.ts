/** #119: invariantes do módulo integridade-preco (puro). */
import { anuncioConcreto, escolherAnuncio, textoPrecoComVariacao, violacoes } from '../src/lib/pricing/integridade-preco';
import { avaliarConfirmacao, deveIgnorarAnuncioIrmao, deveIgnorarPrecoRejeitado, ehIdDeCatalogo, precoRejeitadoDaNota } from '../src/lib/messaging/confirmacao-preco';
process.env.AMAZON_FORA_DAS_MENSAGENS = '0'; // contencao #120 (Amazon fora das mensagens) e de outra frente: estes testes cobrem as regras de confirmacao em si
let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
ok(anuncioConcreto('MLB5563781513', 'MLB53254557') && !anuncioConcreto('MLB53254557', 'MLB53254557') && !anuncioConcreto(null, 'MLB1') && !anuncioConcreto('B0ABC', null), 'I1: anúncio concreto x catálogo');
const lista = [{ item_id: 'MLB2', price: 4000, original_price: null, condition: 'new' }, { item_id: 'MLB1', price: 3900, original_price: 5000, condition: 'new' }, { item_id: 'MLB3', price: 100, original_price: null, condition: 'used' }];
ok(escolherAnuncio(lista, null)?.item_id === 'MLB1', 'escolhe o mais barato novo (ignora usado)');
ok(escolherAnuncio(lista, 'MLB-2')?.item_id === 'MLB2', 'prefere o anúncio do link');
ok(escolherAnuncio([], null) === null, 'sem anúncios do vendedor: null');
const base = { rede: 'mercado-livre', status: 'active', externalItemId: 'MLB5563781513', externalRef: 'MLB53254557', linkItemId: 'MLB5563781513', missCount: 0 };
ok(violacoes(base).length === 0, 'oferta íntegra');
ok(violacoes({ ...base, externalItemId: null }).includes('I1_sem_anuncio_concreto'), 'I1 sem anúncio');
ok(violacoes({ ...base, linkItemId: 'MLB9999999999' }).includes('I3_link_de_outro_anuncio'), 'I3 link de outro anúncio');
ok(violacoes({ ...base, missCount: 2 }).includes('I4_sumiu_da_coleta') && violacoes({ ...base, status: 'expired' }).includes('I5_inativa'), 'I4 e I5');
ok(violacoes({ ...base, rede: 'amazon', externalItemId: null }).length === 0, 'Amazon não tem anúncio ML');
ok(violacoes({ ...base, variantMinCents: 380000, variantMaxCents: 400000 }).includes('I6_variacao_sem_contexto'), 'I6 variação');
ok(textoPrecoComVariacao(400000, 380000, 400000, '127V/220V') === 'a partir de R$ 3.800,00 (127V/220V)' && textoPrecoComVariacao(400000) === 'R$ 4.000,00', 'I6 texto com contexto');
// Rígido: sem anúncio concreto não sai
const now = new Date('2026-11-15T22:00:00Z');
const f = { uso: 'queda' as const, rede: 'mercado-livre', status: 'active', confirmedAt: now, now, estrito: true, auditoria: { verdict: 'ok', checkedAt: now } };
ok(avaliarConfirmacao({ ...f, priceItemId: null }).motivo === 'sem_anuncio_concreto', 'rígido: sem anúncio concreto não sai');
ok(avaliarConfirmacao({ ...f, priceItemId: 'MLB53254557', catalogoRef: 'MLB53254557' }).motivo === 'sem_anuncio_concreto', 'rígido: anúncio = catálogo não vale');
ok(avaliarConfirmacao({ ...f, priceItemId: 'MLB5563781513', catalogoRef: 'MLB53254557' }).ok, 'rígido: anúncio concreto sai');
ok(avaliarConfirmacao({ ...f, rede: 'amazon', priceItemId: null }).ok, 'rígido: Amazon não exige anúncio ML');
// Escrita: irmão não derruba o anúncio do link; catálogo nunca é anúncio
const now2 = new Date('2026-11-15T23:00:00Z');
const ha = (m: number) => new Date(now2.getTime() - m * 60_000);
ok(deveIgnorarAnuncioIrmao({ linkItemId: 'MLB5245600573', itemNovo: 'MLB4000000001', confirmadoEm: ha(20), now: now2 }), 'irmão com o do link confirmado há 20 min: ignora');
ok(!deveIgnorarAnuncioIrmao({ linkItemId: 'MLB5245600573', itemNovo: 'MLB4000000001', confirmadoEm: ha(240), now: now2 }), 'link sem leitura há 4 h: irmão assume');
ok(!deveIgnorarAnuncioIrmao({ linkItemId: 'MLB5245600573', itemNovo: 'MLB-5245600573', confirmadoEm: ha(5), now: now2 }), 'mesmo anúncio: grava');
ok(!deveIgnorarAnuncioIrmao({ linkItemId: null, itemNovo: 'MLB4000000001', confirmadoEm: ha(5), now: now2 }), 'sem link conhecido: grava');
ok(ehIdDeCatalogo('MLB53254557', 'MLB53254557') && !ehIdDeCatalogo('MLB5563781513', 'MLB53254557') && !ehIdDeCatalogo(null, 'MLB1'), 'guarda de id de catálogo');
// Precedência da página sobre o coletor (achado 30)
ok(precoRejeitadoDaNota('corrigido de preco_divergente; antes 923000') === 923000 && precoRejeitadoDaNota('confere') === null && precoRejeitadoDaNota(null) === null, 'nota de correção: preço rejeitado');
ok(deveIgnorarPrecoRejeitado({ nota: 'corrigido de preco_divergente; antes 923000', priceCents: 923000 }), 'coletor regravando o valor rejeitado: ignora');
ok(!deveIgnorarPrecoRejeitado({ nota: 'corrigido de preco_divergente; antes 923000', priceCents: 939900 }) && !deveIgnorarPrecoRejeitado({ nota: 'corrigido de preco_divergente; antes 923000', priceCents: 910000 }), 'outro valor (inclusive queda real) passa');
console.log(fails ? `${fails} falha(s)` : 'OK: integridade-preco #119');
process.exit(fails ? 1 : 0);
