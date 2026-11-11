/**
 * Testes do CUPOM NA AGULHA (2026-11-11). SEM rede e SEM banco.
 * Uso: npx tsx --conditions=react-server scripts/test-cupom-agulha.ts  (código 1 se algo falhar)
 * Cobre: as 4 conferências (a fonte/validade, b frescor, c condição, d preço final), cada motivo de descarte, casamento categoria->departamento,
 * o contrato da consulta única (motivo registrado, ordem, "nunca bloqueia"), os pontos de encaixe por rede, o semáforo de leitura,
 * a proteção da rota de revalidação (token dedicado com precedência) e a ausência da palavra proibida nos textos do cliente.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  AGULHA,
  evaluateAgulha,
  expectedDiscountCents,
  finalPriceByRule,
  freshWindowMin,
  type AgulhaInput,
  type AgulhaRule,
} from '../src/lib/coupons/agulha';
import { categoriaCasaComVertical, declaraTodosOsProdutos, verticaisDaCategoria } from '../src/lib/coupons/categoria-vertical';
import { COUPON_ADAPTERS, adapterFor } from '../src/lib/coupons/network-adapters';
import { agulhaRuleFromLabel, brlToCents, expectedPageRef, leituraUrlFor, normalizePageRow, originAllowedForNetwork, ruleFromLabel } from '../src/lib/coupons/page-read';
import { idadeLabel, pct, semaforoLeitura } from '../src/lib/coupons/agulha-health-model';

let fails = 0;
let total = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  total++;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
}

const NOW = new Date('2026-11-11T15:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const fut = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();

const item = (over: Partial<AgulhaInput> = {}): AgulhaInput => ({
  source: 'item', now: NOW, offer: { network: 'mercado-livre', vertical: 'games', priceCents: 10000 }, verifiedAt: ago(10),
  priceWithCents: 9000, priceSeenCents: 10000, label: 'R$ 90 com Cupom', ...over,
});
const rule = (over: Partial<AgulhaRule> = {}): AgulhaRule => ({
  kind: 'percentual', valueNum: 10, minOrderCents: null, maxDiscountCents: null, validUntil: fut(24 * 60), state: 'verificado', audience: 'todos', eligibleOnReadAccount: true,
  scopeKind: 'lista_itens', conditionsRaw: 'Em produtos de Loja X', ...over,
});
const reason = (r: ReturnType<typeof evaluateAgulha>) => (r.ok ? 'ok' : r.reason);

async function main() {
  // ---------------- (b) frescor ----------------
  check('janelas: anúncio 120, lista 120, código do dono 1440', freshWindowMin('item') === 120 && freshWindowMin('loja_categoria') === 120 && freshWindowMin('campanha') === 1440);
  check('meta de releitura (45) deixa folga na janela (120)', AGULHA.REREAD_TARGET_MIN * 2 < AGULHA.ITEM_FRESH_MIN);
  check('anúncio lido há 10 min passa', evaluateAgulha(item()).ok);
  check('anúncio lido há 119 min passa', evaluateAgulha(item({ verifiedAt: ago(119) })).ok);
  check('anúncio lido há 121 min cai (leitura_antiga)', reason(evaluateAgulha(item({ verifiedAt: ago(121) }))) === 'leitura_antiga');
  check('sem leitura cai (sem_leitura)', reason(evaluateAgulha(item({ verifiedAt: null }))) === 'sem_leitura');
  check('leitura no futuro cai', reason(evaluateAgulha(item({ verifiedAt: ago(-30) }))) === 'leitura_no_futuro');
  check('relógio levemente adiantado (3 min) é tolerado', evaluateAgulha(item({ verifiedAt: ago(-3) })).ok);

  // ---------------- (a) fonte e validade ----------------
  check('anúncio sem validade lida passa (a página não informa) e marca validityKnown=false', (() => { const r = evaluateAgulha(item()); return r.ok && !r.validityKnown; })());
  check('lista com rule.validUntil nulo cai (validade_nao_lida)', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ validUntil: null }), priceWithCents: undefined, priceSeenCents: undefined }))) === 'validade_nao_lida');
  check('validade vencida cai', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ validUntil: ago(1) }) }))) === 'validade_vencida');
  check('validade em 10 min cai (margem de 15)', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ validUntil: fut(10) }) }))) === 'validade_proxima_do_fim');
  check('validade em 60 min passa', evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ validUntil: fut(60) }) })).ok);
  check('validade ilegível cai', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ validUntil: 'amanhã' }) }))) === 'validade_nao_lida');

  // ---------------- rede ----------------
  check('Amazon: leitura por anúncio autorizada (dono, 2026-11-11)', evaluateAgulha(item({ offer: { network: 'amazon', vertical: 'games', priceCents: 10000 } })).ok);
  check('Shopee: leitura por anúncio autorizada (dono, 2026-11-11)', evaluateAgulha(item({ offer: { network: 'shopee', vertical: 'games', priceCents: 10000 } })).ok);
  check('Amazon: código do dono passa; rede fora da lista segue barrada', evaluateAgulha(item({ source: 'campanha', rule: rule({ scopeKind: 'loja_inteira' }), offer: { network: 'amazon', vertical: 'games', priceCents: 10000 }, priceWithCents: undefined, priceSeenCents: undefined })).ok && reason(evaluateAgulha(item({ offer: { network: 'magalu', vertical: 'games', priceCents: 10000 } }))) === 'rede_sem_leitura_autorizada');
  check('Shopee: código do dono passa', evaluateAgulha(item({ source: 'campanha', rule: rule({ scopeKind: 'loja_inteira' }), offer: { network: 'shopee', vertical: 'games', priceCents: 10000 }, priceWithCents: undefined, priceSeenCents: undefined })).ok);
  check('preço da oferta zero cai', reason(evaluateAgulha(item({ offer: { network: 'mercado-livre', vertical: 'games', priceCents: 0 } }))) === 'preco_da_oferta_invalido');

  // ---------------- (c) condição ----------------
  check('cupom que exige seguir a loja cai', reason(evaluateAgulha(item({ label: 'R$ 91,8 com Cupom por seguir a loja' }))) === 'cupom_exige_seguir_loja');
  check('público restrito (assinantes) cai', reason(evaluateAgulha(item({ rule: rule({ audience: 'assinantes' }) }))) === 'publico_restrito');
  check('conta lida não elegível cai', reason(evaluateAgulha(item({ rule: rule({ eligibleOnReadAccount: false }) }))) === 'conta_lida_nao_elegivel');
  check('anúncio: regra da lista vencida cai', reason(evaluateAgulha(item({ rule: rule({ state: 'vencido' }) }))) === 'estado_nao_verificado');
  check('anúncio: regra da lista nao_verificado passa (a página é a verificação)', evaluateAgulha(item({ rule: rule({ state: 'nao_verificado' }) })).ok);
  check('lista: nao_verificado cai', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ state: 'nao_verificado' }), priceWithCents: undefined })) ) === 'estado_nao_verificado');
  check('compra mínima acima do preço cai', reason(evaluateAgulha(item({ rule: rule({ minOrderCents: 20000 }) }))) === 'compra_minima_nao_atingida');
  check('compra mínima atingida passa', evaluateAgulha(item({ rule: rule({ minOrderCents: 10000 }) })).ok);
  const catSel = rule({ scopeKind: 'categoria', categorias: ['Casa'], conditionsRaw: 'Em produtos selecionados. Compra mínima R$ 69,9.' });
  check('categoria "produtos selecionados" sem o anúncio: cai', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: catSel, categoriaVerticais: ['eletrodomesticos'], offer: { network: 'mercado-livre', vertical: 'eletrodomesticos', priceCents: 10000 } }))) === 'categoria_produtos_selecionados');
  check('categoria "produtos selecionados" CONFIRMADA no anúncio: passa', evaluateAgulha(item({ rule: catSel, priceWithCents: 9000 })).ok);
  const catTodos = rule({ scopeKind: 'categoria', categorias: ['Casa'], conditionsRaw: 'Em todos os produtos da categoria.' });
  check('categoria que declara todos os produtos + departamento casa: passa', evaluateAgulha(item({ source: 'loja_categoria', rule: catTodos, categoriaVerticais: ['eletrodomesticos'], offer: { network: 'mercado-livre', vertical: 'eletrodomesticos', priceCents: 10000 }, priceWithCents: undefined })).ok);
  check('categoria que declara todos mas departamento não casa: cai', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: catTodos, categoriaVerticais: ['eletrodomesticos'], offer: { network: 'mercado-livre', vertical: 'games', priceCents: 10000 }, priceWithCents: undefined }))) === 'vertical_nao_casa');
  check('código do dono de categoria não sofre a regra de "selecionados"', evaluateAgulha(item({ source: 'campanha', rule: rule({ scopeKind: 'categoria', categorias: ['games'], conditionsRaw: 'cadastro do dono' }), priceWithCents: undefined, priceSeenCents: undefined })).ok);

  // ---------------- (d) preço final ----------------
  check('preço com cupom >= preço atual cai', reason(evaluateAgulha(item({ priceWithCents: 10000 }))) === 'preco_com_cupom_invalido');
  check('sem preço com cupom cai', reason(evaluateAgulha(item({ priceWithCents: null }))) === 'preco_com_cupom_invalido');
  check('preço do anúncio mudou depois da leitura cai', reason(evaluateAgulha(item({ priceSeenCents: 10500 }))) === 'preco_mudou_apos_leitura');
  check('diferença de 2 centavos no preço visto é tolerada', evaluateAgulha(item({ priceSeenCents: 10002 })).ok);
  check('desconto de 80% é implausível', reason(evaluateAgulha(item({ priceWithCents: 2000 }))) === 'desconto_implausivel');
  check('regra 10% teto R$ 5: 9500 coerente', evaluateAgulha(item({ rule: rule({ maxDiscountCents: 500 }), priceWithCents: 9500 })).ok);
  check('regra 10% teto R$ 5: 9000 incoerente (acima do teto)', reason(evaluateAgulha(item({ rule: rule({ maxDiscountCents: 500 }), priceWithCents: 9000 }))) === 'preco_incoerente_com_regra');
  check('regra 10% sem teto: 9000 coerente e ruleKnown', (() => { const r = evaluateAgulha(item({ rule: rule(), priceWithCents: 9000 })); return r.ok && r.ruleKnown; })());
  check('regra 10%: 9500 incoerente (desconto menor que o declarado)', reason(evaluateAgulha(item({ rule: rule(), priceWithCents: 9500 }))) === 'preco_incoerente_com_regra');
  check('cálculo: 10% de 10000 com teto 500 = 500', expectedDiscountCents({ kind: 'percentual', valueNum: 10, maxDiscountCents: 500 }, 10000) === 500);
  check('cálculo: R$ 30 fixo em 30000 = 27000', finalPriceByRule({ kind: 'valor_fixo', valueNum: 30, maxDiscountCents: null }, 30000) === 27000);
  check('cálculo: frete não tem preço final', finalPriceByRule({ kind: 'frete', valueNum: null, maxDiscountCents: null }, 10000) === null);
  check('lista: valor fixo calcula preço final (30000 -> 27000)', (() => { const r = evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ kind: 'valor_fixo', valueNum: 30 }), offer: { network: 'mercado-livre', vertical: 'games', priceCents: 30000 }, priceWithCents: undefined, priceSeenCents: undefined })); return r.ok && r.finalPriceCents === 27000; })());
  check('lista: desconto fixo maior que o preço é limitado e cai por implausível', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ kind: 'valor_fixo', valueNum: 90 }), priceWithCents: undefined }))) === 'desconto_implausivel');
  check('lista: frete grátis passa sem cálculo de preço', evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ kind: 'frete', valueNum: null }), priceWithCents: undefined })).ok);
  check('cashback/vale não viram cupom de preço', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ kind: 'cashback' }), priceWithCents: undefined }))) === 'tipo_sem_preco_final');
  check('lista sem regra calculável cai', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: rule({ valueNum: null }), priceWithCents: undefined }))) === 'tipo_sem_preco_final');
  check('código do dono: confirmado há 23 h passa', evaluateAgulha(item({ source: 'campanha', verifiedAt: ago(23 * 60), rule: rule({ scopeKind: 'loja_inteira' }), priceWithCents: undefined })).ok);
  check('código do dono: confirmado há 25 h cai', reason(evaluateAgulha(item({ source: 'campanha', verifiedAt: ago(25 * 60), rule: rule({ scopeKind: 'loja_inteira' }), priceWithCents: undefined }))) === 'leitura_antiga');

  // ---------------- categoria -> departamento ----------------
  check('"Casa" -> eletrodomesticos', verticaisDaCategoria('Casa').join() === 'eletrodomesticos');
  check('"Livros e Jogos" -> games + livros', verticaisDaCategoria('Livros e Jogos').sort().join() === 'games,livros');
  check('"Microondas 11.11" -> eletrodomesticos', verticaisDaCategoria('Microondas 11.11').join() === 'eletrodomesticos');
  check('"Casacos" NÃO casa com "casa" (rótulo inteiro)', verticaisDaCategoria('Casacos').length === 0);
  check('marca (Samsung, Panasonic, 3C) e campanha (LIQUIDA) não casam', ['Samsung', 'Panasonic', '3C', 'LIQUIDA', 'Volta às Aulas', 'Smartphones'].every((l) => verticaisDaCategoria(l).length === 0));
  check('rótulo vazio/nulo não casa', verticaisDaCategoria(null).length === 0 && verticaisDaCategoria('').length === 0);
  check('categoriaCasaComVertical', categoriaCasaComVertical('Casa', 'eletrodomesticos') && !categoriaCasaComVertical('Casa', 'games') && !categoriaCasaComVertical('Casa', null));
  check('acentos/caixa: "ESPORTES E FITNESS" -> esporte', verticaisDaCategoria('ESPORTES E FITNESS').join() === 'esporte');
  check('declaraTodosOsProdutos: "selecionados" não; ausência não; "todos os produtos" sim', !declaraTodosOsProdutos('Em produtos selecionados.') && !declaraTodosOsProdutos(null) && declaraTodosOsProdutos('Em todos os produtos da categoria'));

  // ---------------- consulta única: motivo registrado e ordem ----------------
  const { consultarCupom } = await import('../src/server/messaging/agente-cupons');
  const audits: { found: boolean; source: string | null; missReason?: string | null }[] = [];
  const okInfo = { code: 'R$ 90,00 com cupom', conditions: 'x', expiresAt: null, verifiedAt: NOW.toISOString(), couponRef: 'ref', annKind: 'anuncio' as const };
  const miss = await consultarCupom('00000000-0000-4000-8000-000000000001', {
    item: async (_id, trace) => { trace?.('sem_leitura'); return null; },
    campanha: async (_id, trace) => { trace?.('sem_codigo_do_dono_ativo'); return null; },
    lojaCategoria: async (_id, trace) => { trace?.('categoria_produtos_selecionados'); return null; },
    audit: async (r) => { audits.push(r); },
  });
  check('sem cupom: null e motivo de cada etapa na auditoria', miss === null && audits[0]?.missReason === 'item:sem_leitura | campanha:sem_codigo_do_dono_ativo | loja_categoria:categoria_produtos_selecionados', audits[0]);
  const hit = await consultarCupom('00000000-0000-4000-8000-000000000002', {
    item: async (_id, trace) => { trace?.('lida_sem_cupom'); return null; },
    campanha: async () => ({ ...okInfo, code: 'TODOSITE', annKind: 'campanha' as const }),
    lojaCategoria: async () => { throw new Error('não deve ser chamada'); },
    audit: async (r) => { audits.push(r); },
  });
  check('achou na 2a etapa: fonte campanha e motivo vazio na auditoria', hit?.source === 'campanha' && audits[1]?.found === true && audits[1]?.missReason == null, audits[1]);
  const boom = await consultarCupom('00000000-0000-4000-8000-000000000003', {
    item: async () => { throw new Error('banco fora'); },
    campanha: async () => null,
    lojaCategoria: async () => null,
    audit: async (r) => { audits.push(r); },
  });
  check('erro numa etapa nunca bloqueia: segue, sem cupom, motivo erro_na_consulta', boom === null && /item:erro_na_consulta/.test(audits[2]?.missReason ?? ''), audits[2]);
  const badAudit = await consultarCupom('00000000-0000-4000-8000-000000000004', { item: async () => okInfo, audit: async () => { throw new Error('auditoria fora'); } });
  check('auditoria que falha não derruba a consulta', badAudit?.source === 'item');

  // ---------------- pontos de encaixe por rede ----------------
  check('ML ativo em tudo', COUPON_ADAPTERS['mercado-livre'].status === 'ativo' && COUPON_ADAPTERS['mercado-livre'].itemRead === 'ativo');
  check('Shopee e Amazon: leitura por página ativa; shopee_campaigns nunca cupom; Amazon sem lista pública', COUPON_ADAPTERS.shopee.itemRead === 'ativo' && COUPON_ADAPTERS.amazon.itemRead === 'ativo' && COUPON_ADAPTERS.amazon.listRead === 'sem_fonte_de_comprador' && COUPON_ADAPTERS.amazon.ownerCode === 'ativo' && COUPON_ADAPTERS.shopee.falta.some((f) => /shopee_campaigns/.test(f)));
  check('cada rede documenta o que falta (seletores não validados em produção)', COUPON_ADAPTERS.shopee.falta.length > 0 && COUPON_ADAPTERS.amazon.falta.length > 0);
  check('rede desconhecida: adaptador nulo', adapterFor('magalu') === null);

  // ---------------- leitura de cupom pela página: Amazon e Shopee (2026-11-11) ----------------
  const amz = (over: Partial<AgulhaInput> = {}) => item({ offer: { network: 'amazon', vertical: 'games', priceCents: 20000 }, priceWithCents: 18000, priceSeenCents: 20000, label: 'Economize 10% ao aplicar o cupom', ...over });
  const shp = (over: Partial<AgulhaInput> = {}) => item({ offer: { network: 'shopee', vertical: 'games', priceCents: 20000 }, priceWithCents: 19000, priceSeenCents: 20000, label: 'Voucher R$10 OFF Mín. gasto R$99', ...over });
  const shRule = agulhaRuleFromLabel('Voucher R$10 OFF Mín. gasto R$99');
  check('Amazon: leitura de página recente passa nas 4 conferências', evaluateAgulha(amz()).ok);
  check('Amazon: leitura de 121 min cai (frescor)', reason(evaluateAgulha(amz({ verifiedAt: ago(121) }))) === 'leitura_antiga');
  check('Amazon: preço mudou depois da leitura cai', reason(evaluateAgulha(amz({ priceSeenCents: 21000, priceWithCents: 18900 }))) === 'preco_mudou_apos_leitura');
  check('Amazon: preço com cupom não menor cai', reason(evaluateAgulha(amz({ priceWithCents: 20000 }))) === 'preco_com_cupom_invalido');
  check('Amazon: selo Prime barrado (público restrito)', reason(evaluateAgulha(amz({ label: 'Cupom exclusivo Prime de 10%' }))) === 'publico_restrito');
  check('Shopee: selo de novos usuários barrado', reason(evaluateAgulha(shp({ label: 'Voucher novos usuários R$10 OFF' }))) === 'publico_restrito');
  check('Shopee: "seguir a loja" barrado', reason(evaluateAgulha(shp({ label: 'Voucher seguir a loja R$10 OFF' }))) === 'cupom_exige_seguir_loja');
  check('Shopee: compra mínima não atingida (regra lida do selo) cai', reason(evaluateAgulha(shp({ offer: { network: 'shopee', vertical: 'games', priceCents: 5000 }, priceSeenCents: 5000, priceWithCents: 4000, rule: shRule }))) === 'compra_minima_nao_atingida');
  check('Shopee: regra do selo coerente com o preço lido passa', evaluateAgulha(shp({ rule: shRule })).ok);
  check('Shopee: desconto lido incoerente com a regra do selo cai', reason(evaluateAgulha(shp({ priceWithCents: 17000, rule: shRule }))) === 'preco_incoerente_com_regra');
  check('ML: rótulo com a palavra Prime não é barrado (regra só fora do ML)', evaluateAgulha(item({ label: 'R$ 90 com Cupom Prime' })).ok);

  const pr = ruleFromLabel('Economize 10% ao aplicar o cupom');
  check('selo "10%": percentual 10', pr.kind === 'percentual' && pr.valueNum === 10 && pr.minOrderCents == null, pr);
  const fr = ruleFromLabel('Voucher R$10 OFF Mín. gasto R$99 Máx. R$ 20');
  check('selo "R$10 mín R$99": valor fixo 10, mínimo 9900 (o mínimo não vira desconto)', fr.kind === 'valor_fixo' && fr.valueNum === 10 && fr.minOrderCents === 9900, fr);
  const pt = ruleFromLabel('Cupom 15% OFF Mín. gasto R$ 1.000,00 Máx. R$ 50,00');
  check('selo percentual com mínimo e teto', pt.valueNum === 15 && pt.minOrderCents === 100000 && pt.maxDiscountCents === 5000, pt);
  check('selo ambíguo (% e R$) não tem valor', ruleFromLabel('Cupom 10% ou R$ 20').valueNum == null);
  check('selo sem regra ("Cupom disponível") não vira regra', agulhaRuleFromLabel('Cupom disponível') === null);
  check('brlToCents', brlToCents('R$ 1.234,56') === 123456 && brlToCents('20') === 2000 && brlToCents('abc') === null);

  const offA = { externalRef: 'amazon-B0CHX1W1XY', priceCents: 20000 };
  const offS = { externalRef: 'shopee-123456789', priceCents: 20000 };
  const okA = normalizePageRow('amazon', { ref: 'B0CHX1W1XY', price_seen_cents: 20000, coupons: [{ label: 'Economize 10% ao aplicar o cupom' }] }, offA);
  check('Amazon: sem preço final na página, deriva da regra do selo (derivado_do_rotulo)', okA.ok && okA.coupons[0]?.priceWithCents === 18000 && okA.coupons[0]?.status === 'derivado_do_rotulo', okA);
  const okS = normalizePageRow('shopee', { ref: '123456789', price_seen_cents: 20000, coupons: [{ label: 'Voucher R$10 OFF', price_with_cents: 19000 }] }, offS);
  check('Shopee: preço com cupom mostrado pela página é gravado como lido (lido_na_pagina)', okS.ok && okS.coupons[0]?.priceWithCents === 19000 && okS.coupons[0]?.status === 'lido_na_pagina', okS);
  const none = normalizePageRow('amazon', { ref: 'B0CHX1W1XY', price_seen_cents: 20000, coupons: [] }, offA);
  check('lido e sem cupom: ok com lista vazia', none.ok && none.coupons.length === 0);
  const vago = normalizePageRow('amazon', { ref: 'B0CHX1W1XY', price_seen_cents: 20000, coupons: [{ label: 'Cupom disponível' }] }, offA);
  check('selo sem regra legível e sem preço: descartado (nada inventado)', vago.ok && vago.coupons.length === 0);
  check('página de outro item recusada (ref diferente)', (() => { const r = normalizePageRow('amazon', { ref: 'B000000000', price_seen_cents: 20000, coupons: [] }, offA); return !r.ok && r.reason === 'pagina_de_outro_item'; })());
  check('sem preço lido recusada', (() => { const r = normalizePageRow('amazon', { ref: 'B0CHX1W1XY', coupons: [] }, offA); return !r.ok && r.reason === 'sem_preco_lido'; })());
  check('preço lido absurdo (leu outro elemento) recusado', (() => { const r = normalizePageRow('amazon', { ref: 'B0CHX1W1XY', price_seen_cents: 2000, coupons: [] }, offA); return !r.ok && r.reason === 'preco_lido_incoerente'; })());
  check('preço com cupom lido >= preço do item é descartado', (() => { const r = normalizePageRow('shopee', { ref: '123456789', price_seen_cents: 20000, coupons: [{ label: 'Voucher R$10 OFF', price_with_cents: 20000 }] }, offS); return r.ok && r.coupons.length === 0; })());
  check('rótulo sem cupom/voucher é ignorado (campanha de comissão nunca entra)', (() => { const r = normalizePageRow('shopee', { ref: '123456789', price_seen_cents: 20000, coupons: [{ label: 'Comissão 10% campanha', price_with_cents: 18000 }] }, offS); return r.ok && r.coupons.length === 0; })());
  check('ref esperado: ASIN e itemId; fora do padrão = null', expectedPageRef('amazon', 'amazon-B0CHX1W1XY') === 'B0CHX1W1XY' && expectedPageRef('shopee', 'shopee-123') === '123' && expectedPageRef('amazon', 'MLB123') === null);
  check('URL de leitura: Amazon /dp/ASIN sem tag; Shopee só link oficial https shopee.com.br', leituraUrlFor('amazon', 'amazon-B0CHX1W1XY', 'x') === 'https://www.amazon.com.br/dp/B0CHX1W1XY' && leituraUrlFor('shopee', 'shopee-123', 'https://s.shopee.com.br/abc') === 'https://s.shopee.com.br/abc' && leituraUrlFor('shopee', 'shopee-123', 'https://evil.com/x') === null && leituraUrlFor('shopee', 'shopee-123', null) === null);

  // guarda HTTP por rede (origem da rede + token; sem token = 503)
  {
    const { couponGuard } = await import('../src/server/coupons/ingest-guard');
    const mk = (origin: string) => ({ headers: new Headers({ origin, authorization: `Bearer ${'t'.repeat(40)}` }), url: 'https://x/y' }) as unknown as import('next/server').NextRequest;
    const prev = process.env.COUPON_INGEST_TOKEN;
    delete process.env.COUPON_INGEST_TOKEN; delete process.env.ASSISTED_INGEST_TOKEN; delete process.env.AMAZON_INGEST_TOKEN;
    check('guarda: sem token, origem certa da Amazon = 503 (kill-switch)', couponGuard(mk('https://www.amazon.com.br'), 'amazon')?.status === 503);
    check('guarda: origem da Amazon pedindo rede Shopee = 403', couponGuard(mk('https://www.amazon.com.br'), 'shopee')?.status === 403);
    process.env.COUPON_INGEST_TOKEN = 't'.repeat(40);
    check('guarda: token certo + origem da rede = liberado; origem cruzada = 403', couponGuard(mk('https://shopee.com.br'), 'shopee') === null && couponGuard(mk('https://shopee.com.br'), 'amazon')?.status === 403);
    check('guarda: rota antiga (sem rede) continua só ML', couponGuard(mk('https://www.mercadolivre.com.br')) === null && couponGuard(mk('https://www.amazon.com.br'))?.status === 403);
    if (prev === undefined) delete process.env.COUPON_INGEST_TOKEN; else process.env.COUPON_INGEST_TOKEN = prev;
  }

  // ---------------- saúde ----------------
  check('pct: divisão por zero é null (não 0%)', pct(0, 0) === null && pct(1, 4) === 25 && pct(15, 461) === 3.3);
  check('semáforo: cinza sem alvo, vermelho < 25%, amarelo, verde >= 60%', semaforoLeitura({ ofertasAlvo: 0, lidas2h: 0 }) === 'cinza' && semaforoLeitura({ ofertasAlvo: 100, lidas2h: 6 }) === 'vermelho' && semaforoLeitura({ ofertasAlvo: 100, lidas2h: 40 }) === 'amarelo' && semaforoLeitura({ ofertasAlvo: 100, lidas2h: 60 }) === 'verde');
  check('idadeLabel', idadeLabel(null) === 'nunca' && idadeLabel(45) === '45 min' && idadeLabel(180) === '3 h' && idadeLabel(4320) === '3 d');

  // ---------------- proteção da rota de revalidação ----------------
  const { couponAuthorized, COUPON_ALLOWED_ORIGINS } = await import('../src/server/coupons/ingest-guard');
  const T1 = 'a'.repeat(40), T2 = 'b'.repeat(40);
  const req = (tok: string) => ({ headers: new Headers({ authorization: `Bearer ${tok}` }) }) as unknown as import('next/server').NextRequest;
  check('sem token configurado: desligado (503)', couponAuthorized(req(T1), {}) === 'desligado');
  check('token curto (< 32): desligado', couponAuthorized(req('x'), { COUPON_INGEST_TOKEN: 'x' }) === 'desligado');
  check('token dedicado correto: ok', couponAuthorized(req(T1), { COUPON_INGEST_TOKEN: T1 }) === 'ok');
  check('token dedicado tem precedência sobre o das outras rotas', couponAuthorized(req(T2), { COUPON_INGEST_TOKEN: T1, ASSISTED_INGEST_TOKEN: T2 }) === 'negado');
  check('sem token dedicado, o das rotas assistidas continua valendo', couponAuthorized(req(T2), { ASSISTED_INGEST_TOKEN: T2 }) === 'ok' && couponAuthorized(req(T2), { AMAZON_INGEST_TOKEN: T2 }) === 'ok');
  check('token errado: negado', couponAuthorized(req('c'.repeat(40)), { COUPON_INGEST_TOKEN: T1 }) === 'negado');
  check('origem fixa por rede: cada aba só fala da sua rede; cruzado e desconhecido recusados', COUPON_ALLOWED_ORIGINS.size === 7 && originAllowedForNetwork('https://www.mercadolivre.com.br', 'mercado-livre') && originAllowedForNetwork('https://www.amazon.com.br', 'amazon') && originAllowedForNetwork('https://shopee.com.br', 'shopee') && !originAllowedForNetwork('https://www.amazon.com.br', 'shopee') && !originAllowedForNetwork('https://shopee.com.br', 'amazon') && !originAllowedForNetwork('https://www.amazon.com.br', 'mercado-livre') && !originAllowedForNetwork('https://evil.com', 'amazon'));

  // ---------------- texto do cliente: sem a palavra proibida ----------------
  const root = path.resolve(__dirname, '..');
  const files = ['src/server/messaging/coupon-item-lookup.ts', 'src/server/messaging/coupon-lookup.ts', 'src/server/messaging/campaign-coupon-lookup.ts', 'src/lib/coupons/categoria-vertical.ts'];
  const bad = files.filter((f) => /afiliad/i.test(fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
  check('nenhum texto de cupom com a palavra "afiliado"', bad.length === 0, bad);

  console.log(`\n${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
