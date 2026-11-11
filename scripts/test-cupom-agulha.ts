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
  check('Amazon: leitura por anúncio não autorizada', reason(evaluateAgulha(item({ offer: { network: 'amazon', vertical: 'games', priceCents: 10000 } }))) === 'rede_sem_leitura_autorizada');
  check('Shopee: leitura por anúncio não autorizada', reason(evaluateAgulha(item({ offer: { network: 'shopee', vertical: 'games', priceCents: 10000 } }))) === 'rede_sem_leitura_autorizada');
  check('Amazon: lista também não', reason(evaluateAgulha(item({ source: 'loja_categoria', rule: rule(), offer: { network: 'amazon', vertical: 'games', priceCents: 10000 } }))) === 'rede_sem_leitura_autorizada');
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
  check('Shopee e Amazon: leitura por página pendente de decisão do dono (não implementada)', COUPON_ADAPTERS.shopee.itemRead === 'pendente_decisao_do_dono' && COUPON_ADAPTERS.amazon.itemRead === 'pendente_decisao_do_dono');
  check('cada rede pendente documenta o que falta', COUPON_ADAPTERS.shopee.falta.length > 0 && COUPON_ADAPTERS.amazon.falta.length > 0);
  check('rede desconhecida: adaptador nulo', adapterFor('magalu') === null);

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
  check('origem fixa: só Mercado Livre', COUPON_ALLOWED_ORIGINS.size === 3 && [...COUPON_ALLOWED_ORIGINS].every((o) => /mercadolivre\.com\.br$/.test(o)));

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
