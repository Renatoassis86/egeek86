/**
 * Testes da RASPAGEM GERAL DE CUPONS (#116): partes puras dos loops ml-cupons-portal.js e shopee-cupons.js, contrato com o servidor
 * (validateBatch), fechamento de varredura e cadastro manual. SEM rede e SEM banco.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-raspagem-cupons.ts  (código 1 se algo falhar)
 * Os cartões da Shopee abaixo são TEXTOS REAIS lidos em 2026-11-15 em /m/cupom-de-desconto; o HTML do ML é FIXTURE escrita à mão no formato do estado
 * embutido (o portal estava sob captcha na hora da medição: a estrutura real do ML deve ser conferida na simulação do loop, enviar:false).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { validateBatch, validateSweepClose } from '../src/server/coupons/normalize';
import { decideSweepClose } from '../src/server/coupons/vigencia';
import { planManualCoupon } from './cadastrar-cupom-manual';

const req = createRequire(import.meta.url);
const ML = req(path.resolve(process.cwd(), 'public/loops/ml-cupons-portal.js'));
const SH = req(path.resolve(process.cwd(), 'public/loops/shopee-cupons.js'));
(globalThis as unknown as { location: { origin: string } }).location = { origin: 'https://www.mercadolivre.com.br' };

let fails = 0, total = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  total++; if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
}

const NOW = Date.parse('2026-11-15T15:00:00Z'); // 12:00 em Brasília

// ---------------- Shopee: cartões reais ----------------
const URL_SH = 'https://shopee.com.br/m/cupom-de-desconto';
const card = (s: string) => s.split('|').map((x) => x.trim());
const c10 = SH.interpretarCartao(card('TODAS AS LOJAS|10% OFF|Nas compras acima de R$0 Limitado a R$10|Condições|Eu quero'), NOW, URL_SH).cupom;
check('Shopee 10% OFF: percentual 10, teto R$10, sem mínimo, loja inteira, ativar', c10 && c10.tipo === 'percentual' && c10.valor === 10 && c10.teto_desconto_centavos === 1000 && c10.minimo_compra_centavos === undefined && c10.escopo === 'loja_inteira' && c10.condicoes.uso === 'ativar', c10);
check('Shopee 10% OFF: nome no formato do concorrente', c10.condicoes.nome === 'Cupom de 10% no carrinho', c10.condicoes.nome);
const c15 = SH.interpretarCartao(card('TODAS AS LOJAS|R$15 OFF|Nas compras acima de R$149|Condições|Eu quero'), NOW, URL_SH).cupom;
check('Shopee R$15 OFF acima de R$149: valor_fixo 15, mínimo 14900', c15 && c15.tipo === 'valor_fixo' && c15.valor === 15 && c15.valor_unidade === 'reais' && c15.minimo_compra_centavos === 14900, c15);
check('Shopee "Esgotado" não vira cupom', SH.interpretarCartao(card('LOJAS OFICIAIS|R$35 OFF|Nas compras acima de R$259|Oficial|Condições|Esgotado'), NOW).descarte === 'esgotado');
const cNat = SH.interpretarCartao(card('CARTINHAS DE NATAL|50% OFF|Nas compras acima de R$10 Limitado a R$50|Produtos selecionados|Condições|Eu quero'), NOW, URL_SH).cupom;
check('Shopee escopo de campanha vira categoria, mínimo 1000 e teto 5000', cNat && cNat.escopo === 'categoria' && cNat.escopo_ref.categorias[0] === 'cartinhas de natal' && cNat.minimo_compra_centavos === 1000 && cNat.teto_desconto_centavos === 5000, cNat);
const cCash = SH.interpretarCartao(card('SHOPEE DOAÇÕES|50% DE CASHBACK|Limitado a R$50|Produtos selecionados|Condições|Eu quero'), NOW, URL_SH).cupom;
check('Shopee cashback 50% teto R$50', cCash && cCash.tipo === 'cashback' && cCash.valor === 50 && cCash.valor_unidade === 'percentual' && cCash.teto_desconto_centavos === 5000, cCash);
const cInd = SH.interpretarCartao(card('Cupons de Desconto|CUPOM|10% DE CASHBACK|Limitado a R$10|Indicado|Condições|Usar'), NOW, URL_SH);
check('Shopee cabeçalho genérico não é escopo: sem rótulo real o cartão é descartado', cInd.descarte === 'sem_escopo');
const cInd2 = SH.interpretarCartao(card('LOJAS OFICIAIS|10% DE CASHBACK|Limitado a R$10|Indicado|Condições|Usar'), NOW, URL_SH).cupom;
check('Shopee "Indicado" restringe o público', cInd2 && cInd2.publico === 'outro' && /Indicado/.test(cInd2.publico_texto), cInd2);
const cFrete = SH.interpretarCartao(card('TODAS AS LOJAS|Cupom de Frete Grátis|Compras acima de R$10|Válido até: 30/11/2026|Condições|Usar'), NOW, URL_SH).cupom;
check('Shopee frete grátis com prazo absoluto (fim do dia em Brasília) e mínimo', cFrete && cFrete.tipo === 'frete' && cFrete.valor === undefined && cFrete.validade_fim === '2026-12-01T02:59:59.000Z' && cFrete.validade_origem === 'texto_da_pagina' && cFrete.minimo_compra_centavos === 1000, cFrete);
const c1mil = SH.interpretarCartao(card('TODAS AS LOJAS|5% OFF|Nas compras acima de R$1mil Limite de R$100|Válido até: 30/11/2026|Condições|Usar'), NOW).cupom;
check('Shopee "R$1mil" = 100000 centavos; "Limite de R$100" = 10000', c1mil && c1mil.minimo_compra_centavos === 100000 && c1mil.teto_desconto_centavos === 10000, c1mil);
const cFrete50 = SH.interpretarCartao(card('TODAS AS LOJAS|50% OFF no Frete|Confira condições|Válido até: 30/11/2026|Condições|Usar'), NOW).cupom;
check('Shopee "50% OFF no Frete" = frete com 50 percentual', cFrete50 && cFrete50.tipo === 'frete' && cFrete50.valor === 50 && cFrete50.valor_unidade === 'percentual', cFrete50);
const cLive = SH.interpretarCartao(card('EXCLUSIVO PARA LIVES|Cupom de Frete Grátis|Sem valor mínimo|Válido em: 8 horas|Condições|Usar Depois'), NOW);
check('Shopee sem rótulo de escopo é descartado (nunca presume loja inteira)', cLive.descarte === 'sem_escopo' || !!cLive.cupom);
const cCont = SH.interpretarCartao(card('LOJAS OFICIAIS|Cupom de Frete Grátis|Sem valor mínimo|Válido em: 8 horas|Condições|Usar Depois'), NOW).cupom;
check('Shopee contagem regressiva "8 horas" vira prazo relativo', cCont && cCont.validade_origem === 'contagem_regressiva' && Date.parse(cCont.validade_fim) === NOW + 8 * 3600000, cCont);
check('Shopee sem botão ou sem título é descartado', SH.interpretarCartao(card('TODAS AS LOJAS|10% OFF'), NOW).descarte === 'sem_botao' && SH.interpretarCartao(card('TODAS AS LOJAS|Frete|Eu quero'), NOW).descarte === 'sem_titulo');

// contrato com o servidor
const lote = validateBatch({ rede: 'shopee', fonte_url: URL_SH, lidos_em: new Date(NOW).toISOString(), leitura_completa: true, cupons: [c10, c15, cNat, cCash, cInd2, cFrete, c1mil, cFrete50, cCont] }, new Date(NOW));
check('servidor aceita os 9 cartões da Shopee (0 rejeitados)', lote.ok && lote.coupons.length === 9 && lote.rejected.length === 0, lote.ok ? lote.rejected : lote);
check('hash de deduplicação estável entre leituras (prazo/botão não entram)', (() => {
  const a = SH.interpretarCartao(card('TODAS AS LOJAS|Cupom de Frete Grátis|Compras acima de R$10|Válido até: 30/11/2026|Condições|Usar'), NOW, URL_SH).cupom;
  const b = SH.interpretarCartao(card('TODAS AS LOJAS|Cupom de Frete Grátis|Compras acima de R$10|Válido até: 05/12/2026|Condições|Eu quero'), NOW + 86400000, URL_SH).cupom;
  const va = validateBatch({ rede: 'shopee', fonte_url: URL_SH, lidos_em: new Date(NOW).toISOString(), cupons: [a] }, new Date(NOW));
  const vb = validateBatch({ rede: 'shopee', fonte_url: URL_SH, lidos_em: new Date(NOW).toISOString(), cupons: [b] }, new Date(NOW));
  return va.ok && vb.ok && va.coupons[0].dedupHash === vb.coupons[0].dedupHash;
})());

// tipo de página, recuo, config
check('Shopee: campanha expirada sem cartões não fecha nada (tipo)', SH.tipoPagina({ pathname: '/m/cupom-de-desconto', texto: 'Essa campanha expirou', temCartoes: false }) === 'campanha_expirou');
check('Shopee: captcha e login pausam', SH.tipoPagina({ pathname: '/verify/traffic/error', texto: '', temCartoes: false }) === 'captcha' && SH.tipoPagina({ pathname: '/buyer/login', texto: '', temCartoes: false }) === 'login');
check('recuo nunca para e tem teto de 60 min', ['captcha', 'login', 'rede', 'campanha_expirou', 'xyz'].every((t) => { const p = SH.politica(t, 99); return p.acao === 'pausar' && p.min <= 60; }));
check('config Shopee exige host, https e token longo', !SH.validarCfg({ api: 'https://x.com', token: 'a'.repeat(40) }, 'www.amazon.com.br').ok && SH.validarCfg({ api: 'https://x.com', token: 'a'.repeat(40) }, 'shopee.com.br').ok && !SH.validarCfg({ api: 'http://x.com', token: 'a'.repeat(40) }, 'shopee.com.br').ok && !SH.validarCfg({ api: 'https://x.com', token: 'curto' }, 'shopee.com.br').ok);
check('config Shopee: ciclo mínimo 15 min e enviar só com true', SH.validarCfg({ api: 'https://x.com', token: 'a'.repeat(40), cicloMin: 1 }, 'shopee.com.br').cfg.cicloMs === 15 * 60000 && SH.validarCfg({ api: 'https://x.com', token: 'a'.repeat(40) }, 'shopee.com.br').cfg.enviar === false);

// ---------------- Mercado Livre ----------------
check('vencimento: "Vence hoje!" = fim do dia em Brasília', ML.vencimento('Vence hoje!', NOW).iso === '2026-11-16T02:59:59.000Z');
check('vencimento: "Vence 21 de novembro"', ML.vencimento('Vence 21 de novembro', NOW).iso === '2026-11-22T02:59:59.000Z');
check('vencimento: "Vence 1 de dezembro"', ML.vencimento('Vence 1 de dezembro', NOW).iso === '2026-12-02T02:59:59.000Z');
check('vencimento: dia que já passou sem ano vira o ano seguinte', ML.vencimento('Vence 2 de novembro', NOW).iso === '2027-11-03T02:59:59.000Z');
check('vencimento: "Encerra em" (contagem sem número) = null, nada deduzido', ML.vencimento('Encerra em', NOW) === null && ML.vencimento('Conferir', NOW) === null);
check('vencimento: "Vence em 3 dias" e amanhã', ML.vencimento('Vence em 3 dias', NOW).iso === '2026-11-19T02:59:59.000Z' && ML.vencimento('Vence amanhã', NOW).iso === '2026-11-17T02:59:59.000Z');
check('"R$ 1.000" = 100000 centavos (o leitor antigo gravava 100)', ML.brlCents('1.000') === 100000 && ML.brlCents('12,5') === 1250 && ML.brlCents('13') === 1300 && ML.brlCents('x') === null);

const HTML = `<html><script>window.__PRELOADED_STATE__={"cards":[
 {"campaignId":"14023169","title":{"text":"5% OFF"},"subtitle":"Em produtos de Jrcosmeticoss","texts":["Compra mínima R$ 120","Limite de R$ 1.000","Vence hoje!"],"activationType":"AUTOMATIC","action":{"type":"search"}},
 {"campaignId":"13907005","title":{"text":"R$ 50 OFF Black Friday"},"subtitle":"Em produtos de Coll Jeans","texts":["Compra mínima R$ 300","Limite de R$ 50","Vence 21 de novembro"],"action":{"type":"apply"}},
 {"campaignId":"14722924","title":{"text":"15% OFF"},"subtitle":"Em Maquininhas","texts":["Compra mínima R$ 13","Limite de R$ 2","Encerra em"],"isNewFollowerCoupon":true},
 {"campaignId":"14033493","title":{"text":"Cupom especial"},"subtitle":"Em produtos de Opcao"},
 {"campaignId":"99999999","title":{"text":"10% OFF"},"texts":["Compra mínima R$ 10"]},
 {"campaignId":"14023169","title":{"text":"5% OFF"}}
]};</script></html>`;
const bl = ML.blocos(HTML);
check('blocos: 5 campanhas distintas (id repetido não duplica)', bl.length === 5, bl.map((b: { id: string }) => b.id));
const m1 = ML.montarCupom(bl[0], 3, NOW);
check('ML cupom automático da loja: 5%, mínimo 12000, limite 100000, vendedor, vence hoje', m1.cupom && m1.cupom.tipo === 'percentual' && m1.cupom.valor === 5 && m1.cupom.minimo_compra_centavos === 12000 && m1.cupom.teto_desconto_centavos === 100000 && m1.cupom.escopo === 'lista_itens' && m1.cupom.escopo_ref.vendedores[0] === 'Jrcosmeticoss' && m1.cupom.validade_fim === '2026-11-16T02:59:59.000Z' && m1.cupom.condicoes.uso === 'automatico' && m1.cupom.condicoes.campanha_id === '14023169', m1);
const m2 = ML.montarCupom(bl[1], 3, NOW);
check('ML título nomeado "R$ 50 OFF Black Friday" é preservado em texto_bruto e vira valor_fixo 50; apply = ativar', m2.cupom && m2.cupom.tipo === 'valor_fixo' && m2.cupom.valor === 50 && m2.cupom.texto_bruto.split(' | ')[0] === 'R$ 50 OFF Black Friday' && m2.cupom.condicoes.uso === 'ativar', m2);
const m3 = ML.montarCupom(bl[2], 3, NOW);
check('ML cupom de seguir a loja: público restrito, escopo categoria, sem validade deduzida', m3.cupom && m3.cupom.publico === 'outro' && m3.cupom.condicoes.uso === 'seguir_loja' && m3.cupom.escopo === 'categoria' && m3.cupom.validade_fim === undefined, m3);
check('ML bloco sem valor lido é descartado', ML.montarCupom(bl[3], 3, NOW).descarte === 'sem_titulo');
check('ML bloco sem escopo lido é descartado (nunca presume loja inteira)', ML.montarCupom(bl[4], 3, NOW).descarte === 'sem_escopo_lido');
const lML = validateBatch({ rede: 'mercado-livre', fonte_url: 'https://www.mercadolivre.com.br/cupons/filter?all=true&page=3', lidos_em: new Date(NOW).toISOString(), cupons: [m1.cupom, m3.cupom] }, new Date(NOW));
check('servidor aceita os cupons do ML (0 rejeitados)', lML.ok && lML.coupons.length === 2 && lML.rejected.length === 0, lML.ok ? lML.rejected : lML);
const lML2 = validateBatch({ rede: 'mercado-livre', fonte_url: 'https://www.mercadolivre.com.br/cupons/filter?all=true&page=3', lidos_em: new Date(NOW).toISOString(), cupons: [m2.cupom] }, new Date(NOW));
check('valor_fixo maior que o mínimo continua rejeitado pelo servidor (R$50 em compra mínima R$300 é coerente)', lML2.ok && lML2.coupons.length === 1, lML2);
check('tipo de página do ML: captcha, login, 429, 5xx, ok', ML.tipoPagina({ status: 200, finalUrl: 'https://www.mercadolivre.com.br/captcha/wall/logged?x=1' }) === 'captcha' && ML.tipoPagina({ status: 200, finalUrl: 'https://www.mercadolivre.com.br/jms/mlb/lgz/login' }) === 'login' && ML.tipoPagina({ status: 429 }) === 'http_429' && ML.tipoPagina({ status: 503 }) === 'http_5xx' && ML.tipoPagina({ status: 200, finalUrl: 'https://www.mercadolivre.com.br/cupons/filter', texto: 'Por segurança, complete esta etapa' }) === 'captcha' && ML.tipoPagina({ status: 200, finalUrl: 'https://www.mercadolivre.com.br/cupons/filter', texto: 'ok' }) === 'ok');
check('ML: recuo de captcha 30 e depois 60 min, nunca para', ML.politica('captcha', 1).min === 30 && ML.politica('captcha', 2).min === 60 && ML.politica('captcha', 50).min === 60 && ML.politica('rede', 99).acao === 'pausar');
check('ML: pausa entre páginas 4 a 8 s com piso de 4 s', ML.pausaEntre([1000, 2000], 0, 4000) === 4000 && ML.pausaEntre([4000, 8000], 1, 4000) === 8000);
check('ML: config padrão gentil (ciclo 90 min, piso 60, até 150 páginas, simulação)', (() => { const v = ML.validarCfg({ api: 'https://x.com', token: 'a'.repeat(40) }, 'www.mercadolivre.com.br'); const w = ML.validarCfg({ api: 'https://x.com', token: 'a'.repeat(40), cicloMin: 5 }, 'www.mercadolivre.com.br'); return v.ok && v.cfg.cicloMs === 90 * 60000 && v.cfg.maxPaginas === 150 && v.cfg.enviar === false && w.cfg.cicloMs === 60 * 60000; })());
check('ML: config recusa host fora do ML', !ML.validarCfg({ api: 'https://x.com', token: 'a'.repeat(40) }, 'shopee.com.br').ok);

// ---------------- fechamento de varredura ----------------
const iso = (ms: number) => new Date(ms).toISOString();
const baseSweep = { rede: 'mercado-livre', lidos_em: iso(NOW), fechar_varredura: { inicio_em: iso(NOW - 20 * 60000), fonte_prefixo: 'https://www.mercadolivre.com.br/cupons/filter', cupons_lidos: 4300, paginas_lidas: 90, fim_da_lista: true, paginas_com_erro: 0 } };
const vs = validateSweepClose(baseSweep, new Date(NOW));
check('fechamento válido é aceito', vs.ok && vs.req.couponsRead === 4300 && vs.req.endReached === true);
check('fechamento: prefixo de outra rede, início no futuro, varredura de 13 h e contagem negativa são recusados',
  !validateSweepClose({ ...baseSweep, fechar_varredura: { ...baseSweep.fechar_varredura, fonte_prefixo: 'https://shopee.com.br/x' } }, new Date(NOW)).ok &&
  !validateSweepClose({ ...baseSweep, fechar_varredura: { ...baseSweep.fechar_varredura, inicio_em: iso(NOW + 3600000) } }, new Date(NOW)).ok &&
  !validateSweepClose({ ...baseSweep, fechar_varredura: { ...baseSweep.fechar_varredura, inicio_em: iso(NOW - 13 * 3600000) } }, new Date(NOW)).ok &&
  !validateSweepClose({ ...baseSweep, fechar_varredura: { ...baseSweep.fechar_varredura, cupons_lidos: -1 } }, new Date(NOW)).ok &&
  !validateSweepClose({ ...baseSweep, lidos_em: iso(NOW - 3 * 3600000) }, new Date(NOW)).ok);
const sw = { couponsRead: 4300, pagesRead: 90, endReached: true, pageErrors: 0, recentGone: 200 };
check('decisão: varredura sadia fecha', decideSweepClose(sw).close);
check('decisão: sem chegar ao fim, com erro de página ou curta demais NÃO fecha', !decideSweepClose({ ...sw, endReached: false }).close && !decideSweepClose({ ...sw, pageErrors: 1 }).close && !decideSweepClose({ ...sw, couponsRead: 10 }).close && !decideSweepClose({ ...sw, pagesRead: 1 }).close);
check('decisão: queda brusca (mais de 60% do visto nas últimas 72 h sumiu) NÃO fecha', !decideSweepClose({ ...sw, couponsRead: 1000, recentGone: 3000 }).close && decideSweepClose({ ...sw, couponsRead: 1000, recentGone: 1400 }).close);

// ---------------- cadastro manual ----------------
const man = planManualCoupon({ rede: 'mercado-livre', codigo: 'TESTECUPOM', percentual: 10, minimoReais: 100, ate: '2026-11-30', por: 'Renato', nome: 'Cupom de teste', fonteUrl: 'https://www.mercadolivre.com.br/cupons', lidoEm: new Date(NOW) });
check('manual: código válido vira linha manual_dono verificada pelo dono, com validade no fim do dia em Brasília', man.ok && man.row.source_kind === 'manual_dono' && man.row.code === 'TESTECUPOM' && man.row.valid_until === '2026-12-01T02:59:59.000Z' && man.row.state === 'verificado' && man.row.verified_by === 'dono:Renato' && man.row.min_order_cents === 10000 && man.row.value_num === 10, man);
check('manual: sem --por, sem valor, código inválido ou rede errada são recusados', !planManualCoupon({ rede: 'mercado-livre', codigo: 'XXXX', percentual: 10, ate: '2026-11-30', por: '', fonteUrl: 'https://www.mercadolivre.com.br/c', lidoEm: new Date(NOW) }).ok
  && !planManualCoupon({ rede: 'mercado-livre', codigo: 'XXXX', ate: '2026-11-30', por: 'R', fonteUrl: 'https://www.mercadolivre.com.br/c', lidoEm: new Date(NOW) }).ok
  && !planManualCoupon({ rede: 'mercado-livre', codigo: 'x y', percentual: 5, ate: '2026-11-30', por: 'R', fonteUrl: 'https://www.mercadolivre.com.br/c', lidoEm: new Date(NOW) }).ok
  && !planManualCoupon({ rede: 'shopee', codigo: 'XXXX', percentual: 5, ate: '2026-11-30', por: 'R', fonteUrl: 'https://www.mercadolivre.com.br/c', lidoEm: new Date(NOW) }).ok);
check('manual: prazo no passado é recusado', !planManualCoupon({ rede: 'mercado-livre', codigo: 'ABCD', percentual: 5, ate: '2026-11-01', por: 'R', fonteUrl: 'https://www.mercadolivre.com.br/c', lidoEm: new Date(NOW) }).ok);

console.log(`\n${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
