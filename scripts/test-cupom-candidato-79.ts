/**
 * Candidatos de cupom de plataforma (R-79). PURO. Textos de exemplo são os posts REAIS de 2026-11-15 (só fatos; a produção não guarda texto).
 * Uso: npx tsx scripts/test-cupom-candidato-79.ts
 */
import { agregar, aplicaNaOferta, decodeHtml, descontoEstimado, estadoAposConferencia, extrairCandidatos, extrairDaPrevia, lerResultadoCodigo, normalizarCodigo, podeBuscarFonte, podeConferir, pausaAposStatus, pistasLigadas, precoFinalPublico, prioridadeDeConferencia, urlPrevia, vencimentoDoTexto, type CupomLidoNaLoja } from '../src/lib/coupons/candidato';

let fails = 0;
const ok = (c: boolean, n: string, x?: unknown) => { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } };
const t0 = new Date('2026-11-15T22:00:00Z');

// ---- extração
const sd = decodeHtml('🚨🚨 CORREEEE CUPONS APP TODO\n\nUsa LOGOOOOOO:\n\n🎟️ TODOSITE1511 - R&#036;20/119\n🎟️ SITETODO1511 - R&#036;100/999\n🎟️ TODO1511SITE - R&#036;220/1499\n\n👇 RESGATE APENAS AQUI:\nhttps://mercadolivre.com.br/sec/1TTwcDm');
const a = extrairCandidatos(sd, t0, 'sddescontos');
ok(a.length === 3 && a.map((c) => c.codigo).join() === 'TODOSITE1511,SITETODO1511,TODO1511SITE', 'SD: 3 códigos', a.map((c) => c.codigo));
const c220 = a.find((c) => c.codigo === 'TODO1511SITE')!;
ok(!!c220 && c220.rede === 'mercado-livre' && c220.valorTipo === 'reais' && c220.valorNum === 220 && c220.minimoCents === 149900 && c220.escopoDito === 'todo_o_site', 'R$220/1499 ML todo o site', c220);
ok(a[0]!.valorNum === 20 && a[0]!.minimoCents === 11900 && a[1]!.valorNum === 100 && a[1]!.minimoCents === 99900, 'R$20/119 e R$100/999', a);
const fada = extrairCandidatos(decodeHtml('🔥 Cupons Mercado Livre\n\n🎟 R&#036;20 OFF acima de R&#036;119: TODOSITE1511\n🎟 R&#036;100 OFF acima de R&#036;999: SITETODO1511\n🎟 R&#036;220 OFF acima de R&#036;1499: TODO1511SITE\n\n✅ Resgate aqui:\nhttps://meli.la/2XoB7wc'), t0, 'fadapromos');
ok(fada.length === 3 && fada[2]!.minimoCents === 149900 && fada[2]!.valorNum === 220, 'Fada: lista geral com mínimo', fada);
const prod = extrairCandidatos(decodeHtml('🔥 Volante Gamer G29 Driving Force Logitech G Preto\n\n✅ R&#036; 1342 sem juros\n🎟 Cupom: TODO1511SITE\n\nhttps://meli.la/2tcbd1P\n\nanúncio'), t0, 'fadapromos');
ok(prod.length === 1 && prod[0]!.codigo === 'TODO1511SITE' && prod[0]!.escopoDito === 'produto', 'post de produto = escopo produto', prod);
const cat = extrairCandidatos(decodeHtml('SAIU CUPOM MERCADO LIVRE\n\n🎟️ LOJASOFICIAIS1511\n10% OFF máx R&#036;40 em Lojas Oficiais\nNa lista: https://meli.la/2zTYUvU\n🎟️ LIVROSJOGOS1511\n15% OFF máx R&#036;30 em Livros & Jogos'), t0, 'sddescontos');
ok(cat.length === 2 && cat[0]!.valorTipo === 'percentual' && cat[0]!.valorNum === 10 && cat[0]!.limiteCents === 4000 && cat[0]!.escopoDito === 'categoria' && cat[1]!.limiteCents === 3000, 'categoria com % e limite', cat);
const sele = extrairCandidatos(decodeHtml('🚨 R&#036; 220 OFF no Mercado Livre acima de R&#036; 1499 🚨\n\nAproveite este super cupom\n\n🎟️ Cupom: TODO1511SITE\n🔗 https://s.vouu.cc/S9d\n\n#MercadoLivre #Cupom'), t0, 'seleofertas');
ok(sele.length === 1 && sele[0]!.codigo === 'TODO1511SITE' && sele[0]!.rede === 'mercado-livre', 'Seletronic: código em "Cupom:"', sele);
const meli = extrairCandidatos('🔥 Grand Theft Auto VI\n✅ R$ 328\n🎟 Cupom Meli+: MELIMAIS1411\nhttps://meli.la/1jpA1fx\nanúncio', t0, 'fadapromos');
ok(meli.length === 1 && meli[0]!.codigo === 'MELIMAIS1411' && meli[0]!.restrito, 'Meli+ marcado restrito', meli);
const esg = extrairCandidatos('🚨🚨 ESGOTANDOOOOO!!! CUPOM APP TODO MERCADO LIVRE\n🎟️ VIPNOML\n10% acima de R$79, máx. R$100\nhttps://mercadolivre.com.br/sec/x', t0, 'sddescontos');
ok(esg.length === 1 && esg[0]!.esgotado && esg[0]!.minimoCents === 7900 && esg[0]!.limiteCents === 10000, 'esgotando marcado e valores', esg);
ok(extrairCandidatos('Qual cupom vcs acham q vem?', t0, 'x').length === 0, 'post sem código não gera candidato');
ok(extrairCandidatos('🎟 Cupom: CUPOM', t0, 'x').length === 0, 'palavra comum não é código');
ok(normalizarCodigo('todo1511site') === 'TODO1511SITE' && normalizarCodigo('12345') === null && normalizarCodigo('ab') === null && normalizarCodigo('A'.repeat(30)) === null, 'normalizarCodigo');

const NL = String.fromCharCode(10);
ok(extrairCandidatos(['🚨 SAIU!!! CUPONS SHOPEE', '🎟 10% e R$15 OFF no app TODOOO!', 'https://s.shopee.com.br/x'].join(NL), t0, 'x').length === 0, 'grito de post (TODOOO) não é código');
ok(extrairCandidatos(['🚨 CORREEEE', '🎟️ LIBERADOS', 'x'].join(NL), t0, 'x').length === 0, 'palavra de post (LIBERADOS/CORREEEE) não é código');

// ---- HTML da prévia e agregação (dedupe por rede+código; fontes somam)
const html = (dt: string, tx: string) => `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message_text js-message_text" dir="auto">${tx.replace(/\n/g, '<br/>')}</div><span><time datetime="${dt}">x</time></span></div>`;
const prev = html('2026-11-15T22:00:00+00:00', '🎟️ TODO1511SITE - R&#036;220/1499<br/>mercado livre') + html('2026-11-15T22:27:29+00:00', 'AINDA TEM<br/>🎟️ SITETODO1511 - R&#036;100/999 mercado livre');
const dp = extrairDaPrevia(prev, 'sddescontos');
ok(dp.length === 2 && dp[0]!.vistoEm.toISOString() === '2026-11-15T22:00:00.000Z', 'prévia: data do post', dp);
const ag = agregar([...a, ...fada, ...prod, ...sele]);
const g = ag.find((x) => x.codigo === 'TODO1511SITE')!;
ok(ag.length === 3 && g.fontes.length === 3 && g.escopoDito === 'todo_o_site' && g.valorNum === 220, 'agregado: fontes somam, escopo de plataforma vence "produto"', g);
ok(prioridadeDeConferencia(g, new Date('2026-11-15T22:30:00Z')) > prioridadeDeConferencia({ ...g, fontes: ['x'], escopoDito: 'produto' }, new Date('2026-11-15T22:30:00Z')), 'convergência e plataforma priorizam');
ok(prioridadeDeConferencia({ ...g, rede: 'shopee' }, t0) === 0, 'rede sem validador por código: prioridade 0');

// ---- resultado de Inserir código
const agora = new Date('2026-11-16T02:00:00Z');
ok(lerResultadoCodigo('Cupons Tivemos um problema Inserir Error Tivemos um problema', agora).resultado === 'erro_generico', 'erro genérico');
const card = lerResultadoCodigo('R$ 220 OFF TODO O SITE Em produtos selecionados Compra mínima R$ 1.499 Limite de R$ 220 Vence hoje', agora);
ok(card.resultado === 'aceito' && card.valorNum === 220 && card.minimoCents === 149900 && card.limiteCents === 22000 && card.escopo === 'selecionados' && card.validadeIso === '2026-11-16T02:59:59.000Z', 'cartão: TODO O SITE no título + "selecionados" NÃO é plataforma inteira', card);
const card2 = lerResultadoCodigo('Cupom de R$ 15 OFF no carrinho Em todo o Mercado Livre Compra mínima R$ 149 Vence 30 de novembro', agora);
ok(card2.resultado === 'aceito' && card2.escopo === 'todo_o_site' && card2.validadeIso === '2026-12-01T02:59:59.000Z', 'cartão: "Em todo o Mercado Livre" declara plataforma', card2);
ok(lerResultadoCodigo('', agora).resultado === 'ilegivel' && lerResultadoCodigo('Algo sem valor', agora).resultado === 'ilegivel', 'ilegível');
ok(lerResultadoCodigo('Código inválido', agora).resultado === 'recusado', 'recusado explícito');
ok(vencimentoDoTexto('Encerra em 01:55:25', agora) === null, 'contagem regressiva não vira validade');

// ---- estado
const base = { estadoAtual: 'candidato' as const, tentativas: 0, ultimaConferenciaEm: null, primeiraVez: new Date('2026-11-15T22:00:00Z'), esgotadoVistoEm: null, ultimaVez: new Date('2026-11-15T22:10:00Z'), now: new Date('2026-11-15T23:00:00Z') };
ok(estadoAposConferencia(base, card).estado === 'validado', 'aceito valida');
ok(estadoAposConferencia(base, { resultado: 'erro_generico' }).estado === 'em_conferencia', '1º erro genérico: ainda não é inválido');
ok(estadoAposConferencia({ ...base, tentativas: 2 }, { resultado: 'erro_generico' }).estado === 'invalido', '3º erro genérico < 24 h: inválido');
ok(estadoAposConferencia({ ...base, tentativas: 2, now: new Date('2026-11-16T23:00:00Z') }, { resultado: 'erro_generico' }).estado === 'expirado', '3º erro após 24 h: expirado');
ok(estadoAposConferencia({ ...base, esgotadoVistoEm: new Date('2026-11-15T22:30:00Z'), ultimaVez: new Date('2026-11-15T22:27:00Z') }, { resultado: 'erro_generico' }).estado === 'expirado', 'fonte avisou esgotado + loja não aceita: expirado');
ok(!podeConferir({ ...base, tentativas: 1, ultimaConferenciaEm: new Date('2026-11-15T22:45:00Z') }) && podeConferir({ ...base, tentativas: 1, ultimaConferenciaEm: new Date('2026-11-15T22:20:00Z') }), 'intervalo de 30 min entre conferências');
ok(!podeConferir({ ...base, estadoAtual: 'validado' }) && !podeConferir({ ...base, tentativas: 3 }), 'validado e 3 tentativas não reconferem');

// ---- aplicação nos nossos itens
const cup: CupomLidoNaLoja = { valorTipo: 'reais', valorNum: 220, minimoCents: 149900, limiteCents: 22000, escopo: 'selecionados', validoAte: new Date('2026-11-16T02:59:59Z') };
const of = (preco: number, rede = 'mercado-livre') => ({ id: 'o', rede, precoCents: preco });
const ap = (c: CupomLidoNaLoja, o: ReturnType<typeof of>, now = new Date('2026-11-15T22:30:00Z')) => aplicaNaOferta(c, o, now);
ok(ap(cup, of(122788)).aplica === 'nao' && (ap(cup, of(122788)) as { motivo: string }).motivo === 'abaixo_do_minimo', 'Odyssey G5 R$ 1.227,88 < mínimo 1.499: não');
ok(ap(cup, of(149900)).aplica === 'depende', '>= mínimo com "selecionados": depende de simulação (não é "todos os itens")');
ok(ap({ ...cup, escopo: 'todo_o_site' }, of(200000)).aplica === 'sim', 'todo o site declarado + mínimo: sim');
ok((ap({ ...cup, escopo: 'todo_o_site' }, of(200000)) as { descontoEstimadoCents: number }).descontoEstimadoCents === 22000, 'desconto limitado ao teto');
ok(ap(cup, of(149900, 'amazon')).aplica === 'nao', 'outra rede: não');
ok(ap(cup, of(149900), new Date('2026-11-16T03:00:00Z')).aplica === 'nao', 'cupom vencido: não');
ok(descontoEstimado({ ...cup, valorTipo: 'percentual', valorNum: 10, limiteCents: 4000 }, 100000) === 4000 && descontoEstimado({ ...cup, valorTipo: 'percentual', valorNum: 10, limiteCents: null }, 100000) === 10000, 'desconto percentual com e sem teto');
ok(precoFinalPublico(null) === null && precoFinalPublico(0) === null && precoFinalPublico(130000) === 130000, 'preço final público só com prova de simulação');

// ---- gentileza e flag
ok(!pistasLigadas({}) && pistasLigadas({ CUPOM_PISTAS_COMUNIDADE: '1' }) && !pistasLigadas({ CUPOM_PISTAS_COMUNIDADE: '0' }), 'flag desligada por padrão');
ok(!podeBuscarFonte({ ultimoAcessoEm: new Date('2026-11-15T22:55:00Z'), pausadaAte: null }, new Date('2026-11-15T23:00:00Z')) && podeBuscarFonte({ ultimoAcessoEm: new Date('2026-11-15T22:49:00Z'), pausadaAte: null }, new Date('2026-11-15T23:00:00Z')), '1 requisição a cada 10 min por canal');
ok(!podeBuscarFonte({ ultimoAcessoEm: null, pausadaAte: new Date('2026-11-16T05:00:00Z') }, new Date('2026-11-16T00:00:00Z')), 'pausa de 6 h respeitada');
ok(pausaAposStatus(429, t0)!.getTime() - t0.getTime() === 6 * 3_600_000 && pausaAposStatus(200, t0) === null, '429/403 pausam 6 h');
ok(urlPrevia('sddescontos') === 'https://t.me/s/sddescontos' && urlPrevia('qualquer') === null && urlPrevia('urubupromo') === null, 'só canais da Fase 1 e só a prévia pública');

if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
console.log('test-cupom-candidato-79: OK');
