/**
 * #120: preco da OFERTA EM DESTAQUE e prazo do bloco principal (Amazon). Fixtures: scripts/fixtures-amazon-120 (esqueletos reduzidos de paginas reais lidas em 2026-11-15).
 * Cobre: parser de string do loop amazon-assistida (parsePagina), escolha de linha do loop cupons-24h (escolherBuybox/cepDoTexto/vendedorDoTexto),
 * rotulo no servidor (julgamento), entrega (parseEntregaAmazon) e a flag AMAZON_FORA_DAS_MENSAGENS.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-amazon-preco-destaque-120.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { amazonForaDasMensagens, avaliarConfirmacao, redeForaDasMensagens } from '../src/lib/messaging/confirmacao-preco';
import { parseEntregaAmazon } from '../src/lib/shipping/frete-prazo';

export {};
const req = createRequire(import.meta.url);
const A = req('../public/loops/amazon-assistida.js');
const C = req('../public/loops/cupons-24h.js');
const dir = path.join(process.cwd(), 'scripts', 'fixtures-amazon-120');
const fx = (n: string) => fs.readFileSync(path.join(dir, n), 'utf8');

let fails = 0;
let n = 0;
function ok(c: boolean, nome: string, x?: unknown) { n++; if (!c) { fails++; console.error('FALHOU:', nome, x ?? ''); } }

// 1) amazon-assistida.parsePagina
const s1 = A.parsePagina(fx('b0g87m7v8z-sanfona.html'), 'B0G87M7V8Z');
ok(s1.ok && s1.p === 'R$ 8.499,90' && s1.pl === 'oferta_em_destaque', 'sanfona: vale a Oferta em destaque (8.499,90), nunca Parcelas sem juros (8.074,99)', s1);
const s2 = A.parsePagina(fx('b0g87m7v8z-sanfona-invertida.html'), 'B0G87M7V8Z');
ok(!s2.ok && s2.motivo === 'ambiguo', 'sanfona sem destaque ativo: ambiguo, nao grava', s2);
const s3 = A.parsePagina(fx('b0gpfc29f2-unico.html'), 'B0GPFC29F2');
ok(s3.ok && s3.p === 'R$ 7.901,18' && s3.pl === 'preco_a_pagar', 'oferta unica: preco a pagar do bloco, nao o de recomendado (699,00)', s3);
const s4 = A.parsePagina(fx('b0gp9lbgy7-prime.html'), 'B0GP9LBGY7');
ok(s4.ok && s4.p === 'R$ 8.459,10' && s4.l === null, 'preco riscado (de 9.999,00) nao vira o preco', s4);
const s5 = A.parsePagina(fx('b0hcy1rs4m-prime.html'), 'B0HCY1RS4M');
ok(s5.ok && s5.p === 'R$ 10.998,00', 'outra oferta (olp 10.997,00) nao vence a do bloco', s5);
const s6 = A.parsePagina(fx('legado-apex.html'), 'B0AAAAAAAA');
ok(s6.ok && s6.p === 'R$ 1.499,00' && s6.l === 'R$ 1.999,00', 'layout antigo segue igual (atual 1.499, lista 1.999)', s6);
ok(!A.parsePagina(fx('b0gpfc29f2-unico.html'), 'B0ZZZZZZZZ').ok, 'ASIN diferente continua recusado');
const cp = A.candidatoDePagina({ a: 'B0G87M7V8Z', t: 'x' }, s1);
ok(cp.pl === 'oferta_em_destaque' && cp.pg === 1, 'candidato leva o rotulo', cp);
const val = A.validarPayload([{ id: '11111111-1111-4111-8111-111111111111', r: [{ ...cp, pl: 'parcelas_sem_juros' }, cp] }]);
ok(val.rows[0].r.length === 2 && val.rows[0].r[0].pl === undefined && val.rows[0].r[1].pl === 'oferta_em_destaque', 'payload so carrega rotulo da lista aceita', val.rows[0].r);

// 3) cupons-24h: escolha entre linhas da sanfona
const dest = { rotulo: 'Oferta em destaque', ativa: true, centavos: 849990, entrega: 'Entrega R$ 83,83 26 - 30 de Novembro. Se pedir dentro de 14 hrs', vendedor: 'WEMAK' };
const parc = { rotulo: 'Parcelas sem juros', ativa: false, centavos: 807499, entrega: 'Frete grátis', vendedor: 'TNTinfoLoja' };
const e1 = C.escolherBuybox([dest, parc], 849990);
ok(e1.ok && e1.centavos === 849990 && e1.fonte === 'oferta_em_destaque' && e1.vendedor === 'WEMAK' && /83,83/.test(e1.entrega), 'cupons: destaque + entrega da MESMA linha', e1);
ok(C.escolherBuybox([{ ...dest, ativa: false }, { ...parc, ativa: true }], null).motivo === 'ambiguo', 'cupons: parcelas ativa sem destaque = ambiguo');
ok(C.escolherBuybox([dest, parc], 807499).motivo === 'ambiguo', 'cupons: centro diverge >1% do escolhido = ambiguo');
ok(C.escolherBuybox([dest, parc], 850500).ok === true, 'cupons: centro dentro de 1% passa');
ok(C.escolherBuybox([{ rotulo: '', ativa: true, centavos: 790118, entrega: 'Entrega R$201 24 - 26 de Novembro' }], null).fonte === 'preco_a_pagar', 'cupons: oferta unica = preco a pagar');
ok(C.escolherBuybox([], null).motivo === 'sem_preco', 'cupons: sem preco');
ok(C.cepDoTexto('Enviar para Renato João Pessoa 58035090‌') === '58035090' && C.cepDoTexto('João Pessoa 58035-090') === '58035090' && C.cepDoTexto('sem cep') === null, 'CEP lido do texto do seletor (nunca fixo)');
ok(C.vendedorDoTexto('Enviado / Vendido WEMAK') === 'WEMAK' && C.vendedorDoTexto('Enviado por: Amazon Vendido por: TNTinfoLoja') === 'TNTinfoLoja', 'vendedor curto');
ok(C.vendedorDoTexto('{"marketplaceId":"A2Q3Y263D00KWC","isInternal":false}') === null, 'vendedor: blob JSON descartado');

// 4) entrega do bloco principal
const now = new Date('2026-11-15T22:00:00Z');
const d1 = parseEntregaAmazon(e1.entrega, now, { cepTexto: '58035090', vendidoPor: e1.vendedor });
ok(!!d1 && d1.costCents === 8383 && !d1.free && d1.etaFrom === '2026-11-26' && d1.etaTo === '2026-11-30' && d1.zip === '58035090' && d1.soldBy === 'WEMAK', 'entrega do destaque: R$ 83,83, 26 a 30/11, CEP 58035090', d1);
ok(parseEntregaAmazon('Entrega GRÁTIS Segunda-feira, 7 de Dezembro para membros Prime', now) === null, 'frete gratis so para Prime nao vira "Frete gratis"');
ok(parseEntregaAmazon('Entrega GRÁTIS Quinta-feira, 19 de Novembro no seu primeiro pedido', now) === null, 'frete gratis no primeiro pedido nao vira "Frete gratis"');
ok(parseEntregaAmazon('Entrega R$201 24 - 26 de Novembro. Ver detalhes', now, { vendidoPor: '{"marketplaceId":"A2Q"}' })?.soldBy === null, 'vendedor com JSON nao e gravado');

// 5) contencao: Amazon fora das mensagens (flag)
ok(amazonForaDasMensagens({}) === true && amazonForaDasMensagens({ AMAZON_FORA_DAS_MENSAGENS: '1' }) === true, 'flag: padrao ligada (Amazon fora)');
ok(amazonForaDasMensagens({ AMAZON_FORA_DAS_MENSAGENS: '0' }) === false && amazonForaDasMensagens({ AMAZON_FORA_DAS_MENSAGENS: 'off' }) === false, 'flag: 0/off desliga');
ok(redeForaDasMensagens('amazon', {}) && !redeForaDasMensagens('mercado-livre', {}) && !redeForaDasMensagens('amazon', { AMAZON_FORA_DAS_MENSAGENS: '0' }), 'redeForaDasMensagens so pega a Amazon');
const fatos = { uso: 'lista' as const, rede: 'amazon', status: 'active', confirmedAt: new Date(), missCount: 0, now: new Date() };
const vf = avaliarConfirmacao(fatos, true);
ok(!vf.ok && (vf as { motivo?: string }).motivo === 'amazon_fora_das_mensagens', 'porteiro: Amazon barrada (lista)', vf);
ok(!avaliarConfirmacao({ ...fatos, uso: 'queda' }, false).ok, 'porteiro: Amazon barrada mesmo com a confirmacao desligada');
ok(avaliarConfirmacao({ ...fatos, rede: 'mercado-livre' }, true).ok, 'porteiro: ML nao muda');

console.log(fails ? `${fails} falha(s) de ${n}` : `${n}/${n} ok`);
process.exit(fails ? 1 : 0);
