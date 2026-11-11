/**
 * Teste (2026-11-11) de: A) codigo de campanha cadastrado pelo dono, B) selos Frete/Loja oficial, C) campanhas Shopee.
 * Sem banco, sem rede, sem token: so funcoes puras. Codigos como TESTE1111 sao FIXTURES DE FORMATO, vivem so neste arquivo.
 * Uso: npx tsx scripts/test-campanhas-selos.ts   (codigo 1 se algo falhar)
 */
import { validateCampaignInput, isCampaignUsable, parseBRLToCents, parseCampaignEnd, describeRule, type CampaignCouponInput } from '../src/server/coupons/campaign';
import { pickCampaignCoupon, campaignToCouponInfo } from '../src/server/coupons/campaign-pick';
import { normalizeShopeeCampaign, parseShopeeTime, pickShopeeCampaignUrl, campaignActive, type ShopeeCampaign } from '../src/server/collector/shopee-campaigns-core';
import { couponUsable, formatOfferMessage, textProblems, withCouponBlock, type MsgOffer } from '../src/lib/messaging/group-messages';
import type { StoredCoupon } from '../src/server/coupons/types';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) { fails++; console.error(`FALHOU: ${name}`, extra ?? ''); }
}
function eq<T>(a: T, b: T, name: string) { ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b }); }

const NOW = new Date('2026-11-11T14:00:00Z'); // 11:00 em Brasilia
const H = 3600_000;

// ---------------------------------------------------------------------------
// A) Codigo de campanha do dono
// ---------------------------------------------------------------------------
const base: CampaignCouponInput = {
  network: 'mercado-livre', code: 'todosite1111', kind: 'percentual', value: '11', minOrder: '100,00', cap: '50', scope: 'site',
  validUntil: '2026-11-12T23:59', sourceUrl: 'https://www.mercadolivre.com.br/cupons', note: 'visto no grupo',
};
const v = (o: Partial<CampaignCouponInput>) => validateCampaignInput({ ...base, ...o }, NOW);
const why = (o: Partial<CampaignCouponInput>) => { const r = v(o); return r.ok ? 'OK' : r.reason; };

const good = v({});
ok(good.ok, 'cadastro valido passa', good);
if (good.ok) {
  eq(good.campaign.code, 'TODOSITE1111', 'codigo em maiusculas');
  eq(good.campaign.validUntil, '2026-11-13T02:59:00.000Z', 'datetime-local interpretado em Brasilia (-03:00) e salvo em UTC');
  eq(good.campaign.minOrderCents, 10000, 'compra minima em centavos');
  eq(good.campaign.maxDiscountCents, 5000, 'teto em centavos');
  eq(good.campaign.scopeKind, 'loja_inteira', 'site todo = loja_inteira');
  ok(good.campaign.dedupHash.length === 64, 'hash de dedup sha256');
  ok(good.campaign.conditionsRaw.includes('11% de desconto') && good.campaign.conditionsRaw.includes('a partir de R$ 100') && good.campaign.conditionsRaw.includes('teto de R$ 50') && good.campaign.conditionsRaw.includes('site todo do Mercado Livre'), 'regra em texto so com o que foi informado', good.campaign.conditionsRaw);
  ok(good.campaign.rawText.includes('https://www.mercadolivre.com.br/cupons') && good.campaign.rawText.includes('Cadastrado pelo dono'), 'evidencia guarda a fonte e a origem');
}
eq(why({ validUntil: '' }), 'validade_fim_obrigatoria_ou_invalida', 'sem validade e recusado');
eq(why({ validUntil: 'amanha' }), 'validade_fim_obrigatoria_ou_invalida', 'validade ilegivel e recusada');
eq(why({ validUntil: '2026-11-11T10:00' }), 'validade_ja_vencida', 'validade no passado (07:00 UTC... 10:00 Brasilia < agora) recusada');
eq(why({ validUntil: '2026-11-11T11:00' }), 'validade_ja_vencida', 'validade igual a agora recusada');
eq(why({ sourceUrl: '' }), 'fonte_url_obrigatoria', 'sem fonte e recusado');
eq(why({ sourceUrl: 'grupo do telegram' }), 'fonte_url_obrigatoria', 'fonte sem URL recusada');
eq(why({ sourceUrl: 'http://x.com/a' }), 'fonte_url_deve_ser_https', 'fonte http recusada');
eq(why({ code: 'AB' }), 'codigo_invalido', 'codigo curto');
eq(why({ code: 'TODO SITE' }), 'codigo_invalido', 'codigo com espaco');
eq(why({ code: '<script>' }), 'codigo_invalido', 'codigo com marcacao');
eq(why({ value: '' }), 'valor_obrigatorio', 'percentual sem valor');
eq(why({ value: '150' }), 'percentual_acima_de_100', 'percentual acima de 100');
eq(why({ value: 'abc' }), 'valor_invalido', 'valor nao numerico');
eq(why({ kind: 'frete', value: '' }), 'OK', 'frete dispensa valor');
eq(why({ kind: 'valor_fixo', value: '30' }), 'OK', 'valor fixo ok');
eq(why({ minOrder: 'cem' }), 'compra_minima_invalida', 'minimo invalido');
eq(why({ cap: '-3' }), 'teto_invalido', 'teto invalido');
eq(why({ scope: 'loja', scopeValue: '' }), 'escopo_sem_valor', 'escopo loja exige nome');
eq(why({ scope: 'categoria', scopeValue: 'jogos' }), 'categoria_desconhecida', 'categoria fora da lista');
eq(why({ network: 'magalu' }), 'campo_invalido:network', 'rede fora da lista');
const cat = v({ scope: 'categoria', scopeValue: 'games' });
ok(cat.ok && cat.campaign.scopeKind === 'categoria' && cat.campaign.scope.categorias?.[0] === 'games', 'escopo categoria');
const loja = v({ scope: 'loja', scopeValue: 'Loja Teste' });
ok(loja.ok && loja.campaign.scopeKind === 'lista_itens' && loja.campaign.scope.vendedores?.[0] === 'Loja Teste', 'escopo loja = vendedores');
// dedup: o mesmo codigo e regra gera o mesmo hash; outra regra, outro hash
const h = (o: Partial<CampaignCouponInput>) => { const r = v(o); return r.ok ? r.campaign.dedupHash : ''; };
ok(h({}) === h({ code: 'TODOSITE1111', validUntil: '2026-11-15T10:00' }), 'mesma regra com nova validade = mesmo registro (confirma de novo)');
ok(h({}) !== h({ value: '12' }) && h({}) !== h({ network: 'shopee' }), 'regra ou rede diferente = outro registro');

eq(parseBRLToCents('1.234,56'), 123456, 'BRL com milhar e virgula');
eq(parseBRLToCents('R$ 30'), 3000, 'BRL com prefixo');
eq(parseBRLToCents(''), null, 'BRL vazio = null');
eq(parseBRLToCents('1,234'), 'invalid', 'BRL com 3 casas invalido');
eq(parseCampaignEnd('2026-11-12T23:59:30+00:00'), '2026-11-12T23:59:30.000Z', 'fim com fuso explicito respeitado');

// uso em mensagem: vencido nunca aparece
const stored = (o: Partial<StoredCoupon> = {}): StoredCoupon => ({
  id: 'c1', network: 'mercado-livre', code: 'TODOSITE1111', kind: 'percentual', valueNum: 11, valueUnit: 'percentual', minOrderCents: 10000, maxDiscountCents: 5000,
  conditionsRaw: 'x', audience: 'todos', audienceText: null, eligibleOnReadAccount: null, scopeKind: 'loja_inteira', scope: {}, sourceUrl: 'https://www.mercadolivre.com.br/cupons',
  validFrom: null, validUntil: new Date(NOW.getTime() + 20 * H).toISOString(), validitySource: 'texto_da_pagina', state: 'verificado',
  firstSeenAt: new Date(NOW.getTime() - 3 * H).toISOString(), streakStartedAt: new Date(NOW.getTime() - 3 * H).toISOString(), lastSeenAt: new Date(NOW.getTime() - 3 * H).toISOString(),
  verifiedAt: new Date(NOW.getTime() - 3 * H).toISOString(), lastPagePriceCents: null, ...o,
});
ok(isCampaignUsable(stored(), NOW), 'verificado, prazo futuro, confirmado ha 3 h: usavel');
ok(!isCampaignUsable(stored({ validUntil: new Date(NOW.getTime() - 1000).toISOString() }), NOW), 'VENCIDO nunca aparece');
ok(!isCampaignUsable(stored({ validUntil: new Date(NOW.getTime()).toISOString() }), NOW), 'vence agora = fora');
ok(!isCampaignUsable(stored({ validUntil: null }), NOW), 'sem validade = fora');
ok(!isCampaignUsable(stored({ state: 'vencido' }), NOW), 'encerrado (vencido) = fora');
ok(!isCampaignUsable(stored({ state: 'nao_verificado' }), NOW), 'nao verificado = fora');
ok(!isCampaignUsable(stored({ verifiedAt: new Date(NOW.getTime() - 25 * H).toISOString() }), NOW), 'confirmacao com mais de 24 h = fora ate confirmar de novo');
ok(!isCampaignUsable(stored({ code: null }), NOW), 'sem codigo = fora');

// escolha por escopo / minimo / especificidade
const t = { category: 'games', sellerCandidates: ['Loja Teste', '123'], priceCents: 25000 };
ok(pickCampaignCoupon([stored()], t)?.id === 'c1', 'site todo casa com qualquer oferta');
ok(pickCampaignCoupon([stored()], { ...t, priceCents: 5000 }) === null, 'compra minima nao alcancada = sem cupom');
ok(pickCampaignCoupon([stored({ scopeKind: 'categoria', scope: { categorias: ['games'] } })], t) !== null, 'categoria igual casa');
ok(pickCampaignCoupon([stored({ scopeKind: 'categoria', scope: { categorias: ['livros'] } })], t) === null, 'outra categoria nao casa');
ok(pickCampaignCoupon([stored({ scopeKind: 'categoria', scope: { categorias: ['games'] } })], { ...t, category: undefined }) === null, 'categoria desconhecida da oferta = nao presume');
ok(pickCampaignCoupon([stored({ scopeKind: 'lista_itens', scope: { vendedores: ['loja teste'] } })], t) !== null, 'loja casa ignorando caixa');
ok(pickCampaignCoupon([stored({ scopeKind: 'lista_itens', scope: { vendedores: ['Outra'] } })], t) === null, 'outra loja nao casa');
eq(pickCampaignCoupon([stored({ id: 'site', valueNum: 20 }), stored({ id: 'loja', valueNum: 5, scopeKind: 'lista_itens', scope: { vendedores: ['Loja Teste'] } })], t)?.id, 'loja', 'mais especifico primeiro');
eq(pickCampaignCoupon([stored({ id: 'a', valueNum: 5 }), stored({ id: 'b', valueNum: 15 })], t)?.id, 'b', 'maior desconto entre iguais');

// formato CouponInfo e uso no texto
const info = campaignToCouponInfo(stored(), 'Mercado Livre');
eq(info.code, 'TODOSITE1111', 'CouponInfo.code = o codigo digitavel');
ok(info.conditions.includes('11% de desconto') && info.conditions.includes('site todo do Mercado Livre'), 'conditions = regra + onde usar', info.conditions);
eq(info.expiresAt, stored().validUntil, 'expiresAt = fim da validade');
eq(info.verifiedAt, stored().verifiedAt, 'verifiedAt = quando o dono cadastrou/confirmou');
ok(couponUsable(info, NOW), 'codigo de campanha confirmado ha 3 h entra (janela de 24 h)');
ok(!couponUsable({ ...info, maxAgeMinutes: undefined }, NOW), 'sem maxAgeMinutes continua a regra de 2 h (leitura da aba nao mudou)');
ok(!couponUsable({ ...info, verifiedAt: new Date(NOW.getTime() - 25 * H).toISOString() }, NOW), 'campanha confirmada ha 25 h nao entra');
ok(!couponUsable({ ...info, expiresAt: new Date(NOW.getTime() - 1000).toISOString() }, NOW), 'campanha vencida nao entra');

const ML: MsgOffer = { slug: 'oferta-teste', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 25000, confirmedAt: new Date(NOW.getTime() - 5 * 60_000), seller: { reputation: '5_green', totalSales: 5000 }, affiliateUrl: 'https://meli.la/abc' };
const mk = (offer: MsgOffer, channel: 'tg' | 'wa') =>
  formatOfferMessage({ model: 'media', vertical: 'games', messageKey: 'g2-261111-abc123', adTag: '#publicidade', name: 'Jogo Teste', offer, avg: { cents: 27000, offers: 4 }, seriesDays: 9, refCents: 24000, sinceDay: '2026-11-03' }, channel);
const plain = mk(ML, 'tg');
const withCode = withCouponBlock(plain, info, 'tg', NOW);
ok(withCode.includes('<code>TODOSITE1111</code>') && withCode.includes('11% de desconto'), 'mensagem Telegram com codigo digitavel e regra', withCode);
ok(withCode.includes('Válido até'), 'mensagem traz a validade');
ok(withCouponBlock(plain, { ...info, expiresAt: new Date(NOW.getTime() - 1000).toISOString() }, 'tg', NOW) === plain, 'cupom vencido: mensagem sai igual, sem cupom');
const withCodeWa = withCouponBlock(mk(ML, 'wa'), info, 'wa', NOW);
ok(withCodeWa.includes('*CUPOM:* TODOSITE1111') && !/<[a-z/]/i.test(withCodeWa), 'WhatsApp com codigo, sem HTML');
ok(!/afiliad/i.test(withCode + withCodeWa), 'nenhuma mencao a "afiliado" nas mensagens com cupom');
ok(textProblems(withCode, 'tg').length === 0 && textProblems(withCodeWa, 'wa').length === 0, 'barreira de texto limpa com cupom de campanha');

// ---------------------------------------------------------------------------
// B) Selos
// ---------------------------------------------------------------------------
ok(!/Frete:|Loja oficial:/.test(plain), 'sem dado: nenhum selo aparece');
const sel = mk({ ...ML, freeShipping: true, officialStore: 'Loja Teste Oficial' }, 'tg');
ok(sel.includes('• <b>Frete:</b> grátis') && sel.includes('• <b>Loja oficial:</b> Loja Teste Oficial'), 'selos aparecem no Telegram', sel);
const iFrete = sel.indexOf('Frete:');
ok(iFrete > 0 && iFrete < sel.indexOf('<b>Monitoramento</b>') && iFrete > sel.indexOf('Vs. média'), 'selos ficam nos topicos principais, acima do Monitoramento');
const selWa = mk({ ...ML, freeShipping: true, officialStore: 'Loja Teste Oficial' }, 'wa');
ok(selWa.includes('• *Frete:* grátis') && selWa.includes('• *Loja oficial:* Loja Teste Oficial') && selWa.indexOf('Frete:') < selWa.indexOf('*Monitoramento*'), 'selos no WhatsApp');
ok(!mk({ ...ML, freeShipping: false }, 'tg').includes('Frete:'), 'freeShipping false nao mostra nada (nunca "frete pago")');
ok(!mk({ ...ML, officialStore: '   ' }, 'tg').includes('Loja oficial'), 'loja oficial vazia nao aparece');
ok(!mk({ ...ML, officialStore: 'https://golpe.com' }, 'tg').includes('Loja oficial'), 'nome com URL e descartado');
ok(mk({ ...ML, officialStore: 'Loja <b>&' }, 'tg').includes('Loja &lt;b&gt;&amp;'), 'nome da loja escapado');
ok(textProblems(sel, 'tg').length === 0 && !/afiliad/i.test(sel + selWa), 'selos: barreira limpa e sem "afiliado"');
// Amazon continua so com o carimbo
const AMZ: MsgOffer = { slug: 'amz-teste', networkSlug: 'amazon', networkName: 'Amazon', priceCents: 25000, confirmedAt: new Date(NOW.getTime() - 5 * 60_000), affiliateUrl: 'https://amzn.to/x', freeShipping: true, officialStore: 'Amazon Teste', shopeeCampaignUrl: 'https://s.shopee.com.br/x' };
const amzMsg = mk(AMZ, 'tg');
ok(!amzMsg.includes('Frete:') && !amzMsg.includes('Loja oficial') && !amzMsg.includes('Shopee'), 'Amazon: nenhum selo, so o carimbo', amzMsg);
ok(/Preço na Amazon em \d{2}\/\d{2} às \d{2}:\d{2}/.test(amzMsg), 'Amazon: carimbo presente');

// ---------------------------------------------------------------------------
// C) Shopee
// ---------------------------------------------------------------------------
eq(parseShopeeTime(1798675199), '2026-12-30T23:59:59.000Z', 'epoch em segundos');
eq(parseShopeeTime(1798675199000), '2026-12-30T23:59:59.000Z', 'epoch em ms');
eq(parseShopeeTime('1798675199'), '2026-12-30T23:59:59.000Z', 'epoch como texto');
eq(parseShopeeTime(null), null, 'sem data = null');
eq(parseShopeeTime('xx'), null, 'data invalida = null');
const raw = { offerName: 'Gaming & Consoles', offerType: 1, offerLink: 'https://s.shopee.com.br/FIXTURE01', commissionRate: '0.03', periodStartTime: 1793000000, periodEndTime: 1798675199, categoryId: 123 };
const n1 = normalizeShopeeCampaign(raw);
ok(n1 !== null && n1.offerName === 'Gaming & Consoles' && n1.categoryId === '123' && n1.collectionId === null && n1.commissionRateRaw === '0.03', 'normaliza campanha', n1);
ok(normalizeShopeeCampaign({ ...raw, offerLink: 'http://s.shopee.com.br/x' }) === null, 'link http descartado');
ok(normalizeShopeeCampaign({ ...raw, offerLink: 'https://evil.com/shopee.com.br/x' }) === null, 'link fora da Shopee descartado');
ok(normalizeShopeeCampaign({ ...raw, offerLink: undefined }) === null && normalizeShopeeCampaign({ ...raw, offerName: '' }) === null, 'sem link ou sem nome: descartado (nunca monta link)');
const camp = (name: string, link: string, endMs: number | null, startMs: number | null = null): ShopeeCampaign => ({ offerName: name, offerType: 1, categoryId: null, collectionId: null, offerLink: link, commissionRateRaw: null, periodStart: startMs === null ? null : new Date(startMs).toISOString(), periodEnd: endMs === null ? null : new Date(endMs).toISOString() });
const future = NOW.getTime() + 30 * 24 * H;
const list = [camp('Moda Feminina', 'https://s.shopee.com.br/MODA', future), camp('Gaming & Consoles', 'https://s.shopee.com.br/GAME', future), camp('Games', 'https://s.shopee.com.br/GAMES', future + H)];
eq(pickShopeeCampaignUrl(list, 'games', NOW), 'https://s.shopee.com.br/GAME', 'games: escolhe a campanha Gaming & Consoles');
eq(pickShopeeCampaignUrl([camp('Gaming & Consoles', 'https://s.shopee.com.br/GAME', NOW.getTime() - 1000)], 'games', NOW), null, 'campanha vencida nunca e escolhida');
eq(pickShopeeCampaignUrl([camp('Gaming & Consoles', 'https://s.shopee.com.br/GAME', null)], 'games', NOW), null, 'sem fim lido: fora');
eq(pickShopeeCampaignUrl([camp('Gaming & Consoles', 'https://s.shopee.com.br/GAME', future, NOW.getTime() + H)], 'games', NOW), null, 'ainda nao comecou: fora');
eq(pickShopeeCampaignUrl([camp('Moda Feminina', 'https://s.shopee.com.br/MODA', future)], 'games', NOW), null, 'sem campanha do assunto: nada (nao usa campanha fora de assunto)');
eq(pickShopeeCampaignUrl(list, 'impressao3d', NOW), null, 'departamento sem regra: nada');
ok(campaignActive({ periodStart: null, periodEnd: new Date(future).toISOString() }, NOW), 'campaignActive');

const SHP: MsgOffer = { slug: 'shopee-teste', networkSlug: 'shopee', networkName: 'Shopee', priceCents: 25000, confirmedAt: new Date(NOW.getTime() - 5 * 60_000), affiliateUrl: 'https://s.shopee.com.br/OFERTA' };
ok(!mk(SHP, 'tg').includes('Cupons e ofertas Shopee'), 'Shopee sem dado de campanha: linha nao aparece');
const shp = mk({ ...SHP, shopeeCampaignUrl: 'https://s.shopee.com.br/9zzDzQFTBO' }, 'tg');
ok(shp.includes('• <b>Cupons e ofertas Shopee:</b> <a href="https://s.shopee.com.br/9zzDzQFTBO">https://s.shopee.com.br/9zzDzQFTBO</a>'), 'Shopee Telegram: linha com o link da campanha', shp);
ok(shp.indexOf('Cupons e ofertas Shopee') < shp.indexOf('<b>Monitoramento</b>'), 'linha Shopee acima do Monitoramento');
const shpWa = mk({ ...SHP, shopeeCampaignUrl: 'https://s.shopee.com.br/9zzDzQFTBO' }, 'wa');
ok(shpWa.includes('• *Cupons e ofertas Shopee:* https://s.shopee.com.br/9zzDzQFTBO'), 'Shopee WhatsApp: linha com o link');
ok(!/%|desconto|r\$ ?\d+ off|cupom de/i.test(shp.split('\n').filter((l) => l.includes('Cupons e ofertas')).join('')), 'a linha nao promete valor de cupom');
ok(!mk({ ...ML, shopeeCampaignUrl: 'https://s.shopee.com.br/x' }, 'tg').includes('Cupons e ofertas Shopee'), 'link de campanha so aparece em oferta da Shopee');
ok(!mk({ ...SHP, shopeeCampaignUrl: 'javascript:alert(1)' }, 'tg').includes('Cupons e ofertas Shopee') && !mk({ ...SHP, shopeeCampaignUrl: 'http://s.shopee.com.br/x' }, 'tg').includes('Cupons e ofertas Shopee'), 'so link https');
ok(textProblems(shp, 'tg').length === 0 && !/afiliad/i.test(shp + shpWa), 'Shopee: barreira limpa e sem "afiliado"');

// descricao da regra
ok(describeRule({ kind: 'frete', valueNum: null, valueUnit: null, minOrderCents: null, maxDiscountCents: null, scopeKind: 'categoria', scopeValue: 'games' }, 'Shopee').startsWith('Frete grátis.'), 'regra de frete');

if (fails) { console.error(`\n${fails} de ${total} verificacoes falharam`); process.exit(1); }
console.log(`${total}/${total} verificacoes ok (campanhas, selos, Shopee)`);
