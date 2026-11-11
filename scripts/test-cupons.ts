/**
 * Teste do SISTEMA DE CUPONS (ata 2026-11-10, secao 3). Sem banco, sem rede, sem token: so as funcoes puras.
 * Uso: npx tsx scripts/test-cupons.ts   (sai com codigo 1 se algo falhar)
 * ATENCAO: os "cupons" abaixo sao FIXTURES DE FORMATO (codigos TESTE*), existem so neste arquivo e jamais sao gravados em banco
 * ou usados em mensagem. Nenhum cupom real foi lido ainda.
 */
import { validateBatch, validateCoupon, hostAllowedForNetwork, parseIsoStrict, type BatchContext } from '../src/server/coupons/normalize';
import { decideState, isUsableForMessage, matchesScope, meetsMinimum } from '../src/server/coupons/vigencia';
import { formatCouponLine, summarizeCondition } from '../src/server/coupons/format';
import type { NormalizedCoupon, StoredCoupon } from '../src/server/coupons/types';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) { fails++; console.error(`FALHOU: ${name}`, extra ?? ''); }
}
function eq<T>(a: T, b: T, name: string) { ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b }); }

const NOW = new Date('2026-11-11T15:00:00Z');
const ctx: BatchContext = { network: 'mercado-livre', batchSourceUrl: 'https://www.mercadolivre.com.br/cupons', readAt: '2026-11-11T14:50:00.000Z', readAccount: 'secundaria' };
const base = {
  codigo: 'TESTE10', tipo: 'percentual', valor: 10, minimo_compra_centavos: 10000, teto_desconto_centavos: 3000,
  condicoes_texto: 'Texto de condicao de fixture, minimo R$ 100.', texto_bruto: 'Texto bruto de fixture da pagina.',
  escopo: 'loja_inteira', validade_fim: '2026-11-12T23:59:00-03:00', validade_origem: 'texto_da_pagina', validade_texto: 'ate 12/11',
};
const val = (o: Record<string, unknown>, c: BatchContext = ctx) => validateCoupon({ ...base, ...o }, c);
function reason(o: Record<string, unknown>): string { const r = val(o); return r.ok ? 'OK' : r.reason; }

// ---------------------------------------------------------------------------
// 1) Normalizacao e validacao
// ---------------------------------------------------------------------------
const good = val({});
ok(good.ok, 'cupom valido passa', good);
if (good.ok) {
  eq(good.coupon.validUntil, '2026-11-13T02:59:00.000Z', 'validade convertida para UTC');
  eq(good.coupon.valueUnit, 'percentual', 'percentual fixa unidade');
  eq(good.coupon.audience, 'todos', 'publico padrao = todos (nao supoe restricao)');
  eq(good.coupon.sourceUrl, ctx.batchSourceUrl, 'fonte do lote herdada');
}
eq(parseIsoStrict('2026-11-12T10:00:00'), null, 'ISO sem fuso e rejeitado (nao assumimos fuso)');
eq(parseIsoStrict('12/11/2026'), null, 'data nao ISO rejeitada');
eq(parseIsoStrict('2026-11-12T10:00:00Z'), '2026-11-12T10:00:00.000Z', 'ISO com Z');

// dado sem fonte / sem texto / sem condicao e rejeitado
eq(validateCoupon({ ...base }, { ...ctx, batchSourceUrl: '' }).ok, false, 'sem fonte_url rejeitado');
eq(reason({ fonte_url: 'https://www.shopee.com.br/x' }), 'fonte_url_fora_da_rede', 'fonte de outra rede rejeitada');
eq(reason({ fonte_url: 'http://www.mercadolivre.com.br/x' }), 'fonte_url_fora_da_rede', 'http rejeitado');
eq(reason({ fonte_url: 'https://mercadolivre.com.br.evil.com/x' }), 'fonte_url_fora_da_rede', 'dominio parecido rejeitado');
eq(reason({ texto_bruto: undefined }), 'sem_texto_bruto', 'sem texto bruto rejeitado');
eq(reason({ texto_bruto: '   ' }), 'sem_texto_bruto', 'texto bruto vazio rejeitado');
eq(reason({ condicoes_texto: undefined }), 'sem_condicoes_texto', 'sem condicao rejeitado');
eq(reason({ texto_bruto: 'x'.repeat(4001) }), 'texto_bruto_invalido_ou_grande', 'texto bruto grande demais rejeitado');
eq(reason({ tipo: 'brinde' }), 'tipo_invalido', 'tipo fora da lista');
eq(reason({ valor: undefined }), 'percentual_sem_valor', 'percentual sem valor nao e completado');
eq(reason({ valor: 150 }), 'percentual_acima_de_100', 'percentual > 100');
eq(reason({ valor: -5 }), 'valor_invalido', 'valor negativo');
eq(reason({ tipo: 'cashback', valor: 5, valor_unidade: undefined }), 'cashback_sem_unidade', 'cashback sem unidade nao e deduzida');
eq(reason({ tipo: 'cashback', valor: 5, valor_unidade: 'percentual' }), 'OK', 'cashback com unidade lida');
eq(reason({ tipo: 'frete', valor: undefined }), 'OK', 'frete sem valor e aceito (valor fica nulo)');
eq(reason({ tipo: 'frete', valor: 20 }), 'valor_sem_unidade', 'frete com valor exige unidade');
eq(reason({ tipo: 'percentual', valor_unidade: 'reais' }), 'unidade_incoerente_com_tipo', 'unidade incoerente');
eq(reason({ codigo: 'a b' }), 'codigo_invalido', 'codigo com espaco rejeitado');
eq(reason({ codigo: undefined }), 'OK', 'sem codigo e aceito');
eq(reason({ minimo_compra_centavos: 10.5 }), 'minimo_compra_invalido', 'minimo nao inteiro');
eq(reason({ publico: 'assinantes' }), 'publico_restrito_sem_texto_lido', 'publico restrito exige o texto lido');
eq(reason({ publico: 'assinantes', publico_texto: 'assinantes de fixture' }), 'OK', 'publico restrito com texto');
eq(reason({ publico: 'vip' }), 'publico_invalido', 'publico fora da lista');
eq(reason({ escopo: 'produto' }), 'escopo_itens_sem_referencia', 'produto sem referencia');
eq(reason({ escopo: 'produto', escopo_ref: { item_ids: ['MLB1'] } }), 'OK', 'produto com item_id');
eq(reason({ escopo: 'produto', escopo_ref: { item_ids: ['MLB1', 'MLB2'] } }), 'escopo_produto_com_varios_itens_use_lista_itens', 'produto com varios itens');
eq(reason({ escopo: 'categoria' }), 'escopo_categoria_sem_categorias', 'categoria sem categoria');
eq(reason({ escopo: 'loja_inteira', escopo_ref: { item_ids: ['MLB1'] } }), 'escopo_loja_inteira_nao_aceita_referencia', 'loja inteira com referencia');
eq(reason({ escopo: 'lista_itens', escopo_ref: { vendedores: ['123'] } }), 'OK', 'lista de itens por vendedor');
eq(reason({ escopo: 'lista_itens', escopo_ref: { offer_ids: ['nao-e-uuid'] } }), 'escopo_ref_invalido:offer_ids', 'offer_id nao uuid');
eq(reason({ escopo: 'lista_itens', escopo_ref: { foo: ['x'] } }), 'escopo_ref_chave_desconhecida:foo', 'chave desconhecida');
// validade: fim exige origem e texto lidos; ausente e declarado
eq(reason({ validade_fim: '2026-11-12T23:59:00' }), 'validade_fim_invalida', 'validade sem fuso');
eq(reason({ validade_origem: undefined }), 'validade_fim_sem_origem', 'fim sem origem');
eq(reason({ validade_origem: 'ausente' }), 'validade_fim_com_origem_ausente', 'fim com origem ausente');
eq(reason({ validade_texto: undefined }), 'validade_fim_sem_texto_lido', 'fim sem texto lido');
eq(reason({ validade_fim: undefined, validade_origem: undefined, validade_texto: undefined }), 'OK', 'sem prazo declarado = ausente');
eq(reason({ validade_fim: undefined, validade_origem: 'texto_da_pagina' }), 'validade_origem_sem_fim', 'origem sem fim');
eq(reason({ validade_inicio: '2026-11-13T00:00:00Z', validade_fim: '2026-11-12T00:00:00Z' }), 'validade_fim_antes_do_inicio', 'fim antes do inicio');
const noExpiry = val({ validade_fim: undefined, validade_origem: undefined, validade_texto: undefined });
ok(noExpiry.ok && noExpiry.coupon.validUntil === null && noExpiry.coupon.validitySource === 'ausente', 'sem prazo fica null/ausente');

// hash: mesmo conteudo = mesmo hash; prazo prorrogado = mesmo cupom; codigo/valor mudam
const h1 = val({}), h2 = val({ validade_fim: '2026-11-20T23:59:00-03:00' }), h3 = val({ valor: 15 }), h4 = val({ codigo: 'teste10' }), h5 = val({ condicoes_texto: '  TEXTO de condicao de fixture,   minimo R$ 100. ' });
ok(h1.ok && h2.ok && h3.ok && h4.ok && h5.ok, 'hashes validos');
if (h1.ok && h2.ok && h3.ok && h4.ok && h5.ok) {
  eq(h1.coupon.dedupHash, h2.coupon.dedupHash, 'prazo prorrogado nao muda o hash');
  ok(h1.coupon.dedupHash !== h3.coupon.dedupHash, 'valor diferente muda o hash');
  eq(h1.coupon.dedupHash, h4.coupon.dedupHash, 'codigo e comparado sem caixa');
  eq(h1.coupon.dedupHash, h5.coupon.dedupHash, 'condicao com espacos/caixa diferentes = mesmo hash');
  ok(h5.coupon.conditionsRaw.includes('TEXTO'), 'texto bruto da condicao preservado como lido');
}

// lote
const batch = (o: Record<string, unknown>) => validateBatch({ rede: 'mercado-livre', fonte_url: 'https://www.mercadolivre.com.br/cupons', lidos_em: '2026-11-11T14:50:00Z', cupons: [base], ...o }, NOW);
const b1 = batch({});
ok(b1.ok && b1.coupons.length === 1, 'lote valido');
eq(batch({ rede: 'amazon-x' }).ok, false, 'rede invalida');
ok(!batch({ lidos_em: '2026-11-11T14:50:00' }).ok, 'lidos_em sem fuso');
const fut = batch({ lidos_em: '2026-11-11T16:00:00Z' }); ok(!fut.ok && fut.error === 'lidos_em_no_futuro', 'lidos_em no futuro');
const old = batch({ lidos_em: '2026-11-11T05:00:00Z' }); ok(!old.ok && old.error === 'lidos_em_antigo_demais', 'lidos_em muito antigo', old);
ok(!batch({ fonte_url: 'https://www.amazon.com.br/x' }).ok, 'fonte fora da rede');
ok(!batch({ conta_lida: 'Fulano da Silva <x>' }).ok, 'conta_lida so rotulo curto');
const dup = batch({ cupons: [base, { ...base }, { ...base, texto_bruto: undefined }] });
ok(dup.ok && dup.coupons.length === 1 && dup.rejected.length === 2, 'duplicado e invalido rejeitados no lote', dup);
const many = validateBatch({ rede: 'shopee', fonte_url: 'https://shopee.com.br/m/vouchers', lidos_em: '2026-11-11T14:59:00Z', cupons: new Array(151).fill(base) }, NOW);
ok(!many.ok && many.error === 'cupons_demais', 'limite de cupons por lote');
ok(hostAllowedForNetwork('https://cupons.mercadolivre.com.br/x', 'mercado-livre'), 'subdominio ML aceito');
ok(!hostAllowedForNetwork('https://shopee.com.br/x', 'mercado-livre'), 'host de outra rede');

// ---------------------------------------------------------------------------
// 2) Vigencia e estado
// ---------------------------------------------------------------------------
function norm(o: Record<string, unknown>, readAt: string): NormalizedCoupon {
  const r = validateCoupon({ ...base, ...o }, { ...ctx, readAt });
  if (!r.ok) throw new Error(`fixture invalida: ${r.reason}`);
  return r.coupon;
}
const t0 = '2026-11-11T12:00:00.000Z', t20 = '2026-11-11T12:20:00.000Z', t31 = '2026-11-11T12:31:00.000Z';
const d0 = decideState(null, norm({}, t0));
eq([d0.state, d0.verifiedAt], ['nao_verificado', null], 'primeira leitura = nao_verificado');
const d20 = decideState({ state: 'nao_verificado', streakStartedAt: t0, lastSeenAt: t0 }, norm({}, t20));
eq(d20.state, 'nao_verificado', 'segunda leitura com 20 min ainda nao verifica');
const d31 = decideState({ state: 'nao_verificado', streakStartedAt: t0, lastSeenAt: t20 }, norm({}, t31));
eq([d31.state, d31.verifiedAt, d31.reason], ['verificado', t31, 'duas_leituras_separadas_por_30min'], 'duas leituras >= 30 min verificam');
const dPage = decideState(null, norm({ fonte_tipo: 'pagina_do_item', preco_com_cupom_centavos: 9000 }, t0));
eq(dPage.state, 'verificado', 'preco com cupom exibido na pagina do item verifica de imediato');
const dListPrice = decideState(null, norm({ preco_com_cupom_centavos: 9000 }, t0));
eq(dListPrice.state, 'nao_verificado', 'preco com cupom em listagem nao basta');
const dExpired = decideState({ state: 'verificado', streakStartedAt: t0, lastSeenAt: t20 }, norm({ validade_fim: '2026-11-11T12:25:00Z' }, t31));
eq([dExpired.state, dExpired.reason], ['vencido', 'prazo_lido_vencido'], 'vencido por data lida');
const dBack = decideState({ state: 'vencido', streakStartedAt: t0, lastSeenAt: t20 }, norm({}, t31));
eq([dBack.state, dBack.streakStartedAt], ['nao_verificado', t31], 'cupom que sumiu e voltou recomeca a sequencia');
const dGap = decideState({ state: 'verificado', streakStartedAt: '2026-11-10T00:00:00.000Z', lastSeenAt: '2026-11-10T00:10:00.000Z' }, norm({}, t31));
eq(dGap.state, 'nao_verificado', 'lacuna > 6 h entre leituras nao conta como sequencia');
const dOld = decideState({ state: 'verificado', streakStartedAt: t0, lastSeenAt: t31 }, norm({}, t20));
eq(dOld.applies, false, 'leitura fora de ordem nao altera');
const dInv = decideState({ state: 'invalido', streakStartedAt: t0, lastSeenAt: t0 }, norm({}, t31));
eq(dInv.state, 'invalido', 'invalido so sai por decisao humana');
const dFuture = decideState(null, norm({ validade_inicio: '2026-11-12T00:00:00Z' }, t0));
eq(dFuture.state, 'nao_verificado', 'ainda nao comecou = nao verificado');

// ---------------------------------------------------------------------------
// 3) Regra das 2 horas, prazo e escopo
// ---------------------------------------------------------------------------
const stored = (o: Partial<StoredCoupon> = {}): StoredCoupon => ({
  id: 'c1', network: 'mercado-livre', code: 'TESTE10', kind: 'percentual', valueNum: 10, valueUnit: 'percentual', minOrderCents: 10000, maxDiscountCents: 3000,
  conditionsRaw: 'Texto de condicao de fixture.', audience: 'todos', audienceText: null, eligibleOnReadAccount: null, scopeKind: 'loja_inteira', scope: {},
  sourceUrl: 'https://www.mercadolivre.com.br/cupons', validFrom: null, validUntil: '2026-11-12T23:59:00.000Z', validitySource: 'texto_da_pagina',
  state: 'verificado', firstSeenAt: t0, streakStartedAt: t0, lastSeenAt: t31, verifiedAt: '2026-11-11T14:00:00.000Z', lastPagePriceCents: null, ...o,
});
const opt = { now: NOW, maxAgeMinutes: 120 };
ok(isUsableForMessage(stored(), opt), 'verificado ha 60 min entra');
ok(isUsableForMessage(stored({ verifiedAt: '2026-11-11T13:00:00.000Z' }), opt), 'verificado ha exatamente 120 min entra');
ok(!isUsableForMessage(stored({ verifiedAt: '2026-11-11T12:59:00.000Z' }), opt), 'verificado ha 121 min NAO entra (regra das 2 h)');
ok(!isUsableForMessage(stored({ state: 'nao_verificado', verifiedAt: null }), opt), 'nao verificado nao entra');
ok(!isUsableForMessage(stored({ state: 'vencido' }), opt), 'vencido nao entra');
ok(!isUsableForMessage(stored({ state: 'invalido' }), opt), 'invalido nao entra');
ok(!isUsableForMessage(stored({ validUntil: '2026-11-11T14:59:00.000Z' }), opt), 'prazo lido ja passou nao entra');
ok(!isUsableForMessage(stored({ validUntil: null, validitySource: 'ausente' }), opt), 'sem prazo lido nao entra (padrao)');
ok(isUsableForMessage(stored({ validUntil: null, validitySource: 'ausente' }), { ...opt, allowNoExpiry: true }), 'sem prazo entra so com opcao explicita');
ok(!isUsableForMessage(stored({ verifiedAt: '2026-11-11T16:00:00.000Z' }), opt), 'verified_at no futuro nao entra');
ok(!isUsableForMessage(stored({ eligibleOnReadAccount: false, audience: 'assinantes', audienceText: 'x' }), opt), 'inelegivel na conta lida nao entra');
ok(!isUsableForMessage(stored({ validFrom: '2026-11-12T00:00:00.000Z' }), opt), 'ainda nao comecou nao entra');

ok(matchesScope(stored(), {}), 'loja inteira vale para qualquer oferta da rede');
ok(!matchesScope(stored({ scopeKind: 'produto', scope: { master_product_ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] } }), { masterProductId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }), 'cupom de produto nao vale para outro produto');
ok(matchesScope(stored({ scopeKind: 'produto', scope: { master_product_ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] } }), { masterProductId: 'AAAAAAAA-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }), 'cupom de produto vale para o produto');
ok(!matchesScope(stored({ scopeKind: 'produto', scope: { item_ids: ['MLB1'] } }), {}), 'sem alvo informado nao casa (nunca presume)');
ok(matchesScope(stored({ scopeKind: 'produto', scope: { item_ids: ['MLB1'] } }), { externalItemId: 'mlb1' }), 'anuncio por item_id (sem caixa)');
ok(matchesScope(stored({ scopeKind: 'lista_itens', scope: { offer_ids: ['x'], vendedores: ['77'] } }), { sellerId: '77' }), 'lista por vendedor');
ok(!matchesScope(stored({ scopeKind: 'categoria', scope: { categorias: ['Games'] } }), {}), 'categoria sem categoria da oferta nao casa');
ok(matchesScope(stored({ scopeKind: 'categoria', scope: { categorias: ['Games'] } }), { category: 'games' }), 'categoria casa');
ok(matchesScope(stored({ scopeKind: 'produto', scope: { urls: ['https://produto.mercadolivre.com.br/MLB-1-x/'] } }), { url: 'https://produto.mercadolivre.com.br/MLB-1-x?foo=1' }), 'url sem query/barra final');
ok(meetsMinimum(stored(), 10000), 'minimo alcancado');
ok(!meetsMinimum(stored(), 9999), 'minimo nao alcancado');
ok(!meetsMinimum(stored(), undefined), 'minimo sem preco informado nao presume');
ok(meetsMinimum(stored({ minOrderCents: null }), undefined), 'sem minimo sempre vale');

// ---------------------------------------------------------------------------
// 4) Linha de mensagem e escape
// ---------------------------------------------------------------------------
const line = formatCouponLine(stored(), 'telegram');
eq(line, 'Cupom <code>TESTE10</code>: 10% de desconto (mínimo R$ 100,00, teto R$ 30,00, Texto de condicao de fixture.). Válido até 12/11 às 20h59 segundo a loja. Visto em 11/11 às 11h00; pode variar por conta.', 'linha Telegram');
const wa = formatCouponLine(stored({ code: 'A*B_C' , audience: 'assinantes', audienceText: 'só para *assinantes*' }), 'whatsapp');
ok(!/[*_~`]/.test(wa.replace(/R\$ [\d.,]+/g, '')) || !/\*|_|~|`/.test(wa), 'WhatsApp sem caracteres de formatacao do cupom', wa);
ok(wa.includes('Cupom ABC:'), 'WhatsApp remove * e _ do codigo', wa);
const tgEsc = formatCouponLine(stored({ conditionsRaw: 'valido <b>so</b> p/ A&B', audience: 'cartao', audienceText: 'cartao <x>' }), 'telegram');
ok(!/<b>|<x>/.test(tgEsc) && tgEsc.includes('&lt;b&gt;so&lt;/b&gt; p/ A&amp;B') && tgEsc.includes('<code>TESTE10</code>'), 'Telegram escapa HTML da condicao e do publico, mantem so a tag propria', tgEsc);
eq(formatCouponLine(stored({ validUntil: null, validitySource: 'ausente' })), '', 'sem prazo lido a linha nao existe');
eq(formatCouponLine(stored({ verifiedAt: null })), '', 'sem carimbo de verificacao a linha nao existe');
eq(formatCouponLine(stored({ valueNum: null, valueUnit: null })), '', 'percentual sem valor nao gera linha');
ok(formatCouponLine(stored({ code: null, kind: 'frete', valueNum: null, valueUnit: null, minOrderCents: null, maxDiscountCents: null })).startsWith('Cupom (ativar na página da loja): benefício no frete'), 'cupom sem codigo e de frete');
ok(formatCouponLine(stored({ kind: 'cashback', valueNum: 5, valueUnit: 'percentual' })).includes('cashback de 5%'), 'cashback so com valor lido');
ok(formatCouponLine(stored({ kind: 'valor_fixo', valueNum: 20, valueUnit: 'reais' })).includes('R$ 20,00 de desconto'), 'valor fixo em reais');
ok(!/afiliad/i.test(line), 'a palavra afiliado nunca aparece');
ok(!/garant|imperd|corra|vai cair/i.test(line), 'sem promessa nem urgencia');
const long = summarizeCondition('palavra '.repeat(60));
ok(long.length <= 142 && long.endsWith('…'), 'condicao resumida em fronteira de palavra', long);

console.log(`${total - fails}/${total} verificacoes OK`);
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
