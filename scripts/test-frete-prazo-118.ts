/**
 * #118: frete e prazo das impressoras ate o CEP do dono. Puro: parser Amazon, parser ML, escolha do anuncio, linha da mensagem (idade 12 h), cadencia, flag.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-frete-prazo-118.ts
 */
import { cotacaoValida, detalhesEntrega, devida, escolherItemMl, fretePrazoLigado, linhaFretePrazo, melhorCotacao, parseEntregaAmazon, parseShippingOptionsMl, type Cotacao } from '../src/lib/shipping/frete-prazo';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const now = new Date('2026-11-15T15:00:00Z');

// Amazon: texto real lido em 2026-11-15
const a1 = parseEntregaAmazon('Entrega R$201 24 - 26 de Novembro. Ver detalhes', now, { cepTexto: 'A entrega será feita em João Pessoa 58035000 Atualizar CEP', vendidoPor: 'Enviado / Vendido ProcesstecES' });
ok(!!a1 && a1.costCents === 20100 && !a1.free && a1.etaFrom === '2026-11-24' && a1.etaTo === '2026-11-26' && a1.zip === '58035000' && a1.soldBy === 'ProcesstecES', 'amazon faixa com custo', a1);
const a2 = parseEntregaAmazon('Entrega GRÁTIS Sábado, 21 de Novembro', now);
ok(!!a2 && a2.free && a2.costCents === 0 && a2.etaTo === '2026-11-21' && a2.zip === null, 'amazon gratis data unica', a2);
const a3 = parseEntregaAmazon('Entrega GRÁTIS Amanhã, 16 de Novembro', now);
ok(a3?.etaTo === '2026-11-16', 'amazon amanha', a3);
const a4 = parseEntregaAmazon('Entrega GRÁTIS 28 de Dez. - 3 de Jan.', now);
ok(a4?.etaFrom === '2026-12-28' && a4?.etaTo === '2027-01-03', 'amazon virada de ano', a4);
ok(parseEntregaAmazon('Ver detalhes', now) === null && parseEntregaAmazon('', now) === null && parseEntregaAmazon('Entrega GRÁTIS', now) === null, 'amazon sem data nao vira leitura');

// ML: resposta real (P2S Combo, 2026-11-15)
const ml = { destination: { zip_code: '58035090' }, options: [{ display: 'recommended', cost: 0, base_cost: 452.1, estimated_delivery_time: { date: '2026-12-17T00:00:00-03:00', offset: { date: '2026-12-22T00:00:00-03:00' } } }] };
const m1 = parseShippingOptionsMl(ml, 'xd_drop_off');
ok(!!m1 && m1.free && m1.costCents === 0 && m1.etaFrom === '2026-12-17' && m1.etaTo === '2026-12-22' && m1.zip === '58035090' && m1.logistic === 'xd_drop_off', 'ml opcao recomendada', m1);
const m2 = parseShippingOptionsMl({ options: [{ cost: 49.9, estimated_delivery_time: { date: '2026-11-20T00:00:00-03:00' } }, { cost: 20, estimated_delivery_time: { date: '2026-11-25T00:00:00-03:00' } }] });
ok(m2?.costCents === 2000 && m2?.etaTo === '2026-11-25', 'ml sem recomendada: menor custo', m2);
ok(parseShippingOptionsMl({ options: [] }) === null && parseShippingOptionsMl(null) === null && parseShippingOptionsMl({ options: [{ cost: 0 }] }) === null, 'ml sem opcao/data = null');

// escolha do anuncio
const rows = [
  { item_id: 'MLB1', price: 8330, condition: 'new', seller_id: 10 }, { item_id: 'MLB2', price: 8459.1, condition: 'new', seller_id: 20 },
  { item_id: 'MLB3', price: 9000, condition: 'new', seller_id: 20 }, { item_id: 'MLB4', price: 7000, condition: 'used', seller_id: 30 },
];
ok(escolherItemMl(rows, { itemId: 'MLB2' })?.item_id === 'MLB2', 'por id');
ok(escolherItemMl(rows, { sellerExternalId: '10' })?.item_id === 'MLB1', 'por vendedor unico');
ok(escolherItemMl(rows, { sellerExternalId: '20' }) === null, 'vendedor com 2 precos sem preco: ambiguo');
ok(escolherItemMl(rows, { sellerExternalId: '20', priceCents: 900000 })?.item_id === 'MLB3', 'desempate por preco');
ok(escolherItemMl(rows, { sellerExternalId: '30' }) === null && escolherItemMl(rows, {}) === null, 'usado e sem chave = null');

// linha da mensagem
const q = (p: Partial<Cotacao> = {}): Cotacao => ({ zip: '58035090', costCents: 0, free: true, etaFrom: '2026-11-20', etaTo: '2026-11-20', carrier: null, logistic: 'fulfillment', soldBy: null, source: 'ml_api', readAt: new Date(now.getTime() - 3600_000), ...p });
ok(linhaFretePrazo(q(), now) === 'Frete grátis · chega até sex, 20/11 (CEP 58035090)', 'linha gratis', linhaFretePrazo(q(), now));
ok(linhaFretePrazo(q({ free: false, costCents: 20100, etaFrom: '2026-11-24', etaTo: '2026-11-26', zip: '58035000', source: 'amazon_pagina', readAt: new Date(now.getTime() - 10 * 60_000) }), now) === 'Frete R$ 201,00 · chega de 24/11 a 26/11 (CEP lido 58035000)', 'linha cobrada, CEP diferente');
ok(linhaFretePrazo(null, now) === 'Prazo ainda não lido' && linhaFretePrazo(undefined, now) === 'Prazo ainda não lido', 'sem leitura');
ok(linhaFretePrazo(q({ readAt: new Date(now.getTime() - 12.1 * 3600_000) }), now) === 'Prazo ainda não lido', 'mais de 12 h = ausente');
ok(cotacaoValida(q({ readAt: new Date(now.getTime() - 11.9 * 3600_000) }), now), '11,9 h vale');
ok(linhaFretePrazo(q({ readAt: new Date(now.getTime() + 3600_000) }), now) === 'Prazo ainda não lido', 'leitura do futuro = ausente');
// R-88 (2026-11-16, caso P2S Combo): a estimativa de entrega da Amazon muda ao longo do dia (15:37 dizia 25/11, a pagina hoje diz 20/11). Entrega da Amazon vale o mesmo que o preco (R-81, 45 min); ML segue 12 h (API, data do anuncio).
const am = (min: number) => q({ source: 'amazon_pagina', logistic: null, readAt: new Date(now.getTime() - min * 60_000) });
ok(cotacaoValida(am(40), now), 'R-88: Amazon lida ha 40 min vale');
ok(!cotacaoValida(am(61), now) && linhaFretePrazo(am(61), now) === 'Prazo ainda não lido', 'R-88/R-101: Amazon lida ha 61 min NAO vale (linha diz Prazo ainda não lido)');
ok(linhaFretePrazo(am(190), now) === 'Prazo ainda não lido', 'R-88: Amazon lida ha 3 h (caso real, 25/11 x 20/11) NAO vale');
ok(cotacaoValida(q({ source: 'ml_api', readAt: new Date(now.getTime() - 3 * 3600_000) }), now), 'R-88: ML lido ha 3 h segue valendo (12 h)');
ok(detalhesEntrega(am(190), now) === null, 'R-88: detalhes da Amazon velha tambem somem');
ok(cotacaoValida(am(100), now, { AMAZON_FRESCOR_MIN: '120' } as never), 'R-88: usa o mesmo AMAZON_FRESCOR_MIN do R-81');
ok(detalhesEntrega(q(), now) === 'Full' && detalhesEntrega(q({ source: 'amazon_pagina', soldBy: 'Loja', logistic: null, readAt: new Date(now.getTime() - 10 * 60_000) }), now) === 'vendido e enviado por Loja' && detalhesEntrega(q({ logistic: null }), now) === null, 'detalhes');
ok(melhorCotacao([q({ zip: '58035000', readAt: new Date(now.getTime() - 100) }), q()])?.zip === '58035090', 'prefere CEP-alvo');
ok(melhorCotacao([q({ zip: '58035000' })])?.zip === '58035000' && melhorCotacao([q({ zip: '01001000' })]) === null, 'prefixo aceito, outra regiao nao');

// cadencia e flag
const t = (min: number) => new Date(now.getTime() - min * 60_000);
ok(devida(null, false, now) && !devida(t(29), true, now) && devida(t(30), true, now) && !devida(t(179), false, now) && devida(t(180), false, now), 'cadencia 30 min / 3 h');
ok(!fretePrazoLigado({}) && fretePrazoLigado({ FRETE_PRAZO_IMPRESSORAS: '1' }) && !fretePrazoLigado({ FRETE_PRAZO_IMPRESSORAS: '0' }), 'flag');

console.log(fails ? `${fails} FALHA(S)` : 'OK: todos os testes do #118 passaram');
process.exit(fails ? 1 : 0);
