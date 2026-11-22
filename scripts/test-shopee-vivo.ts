/**
 * R-119: LEITOR DE PAGINAS DA SHOPEE (verdade viva). Teste PURO (sem rede, sem banco): parser da pagina (public/loops/shopee-vivo.js), priorizacao da fila e regra de ritmo
 * (src/lib/messaging/shopee-fila-viva.ts) e contrato com a rota de gravacao (validarLeituraPagina).
 * FIXTURES: o texto abaixo reproduz a ESTRUTURA do innerText da pagina de anuncio da Shopee BR (titulo, preco riscado + preco atual + selo, cupons, frete, quantidade e estoque,
 * botoes, depois descricao e "produtos semelhantes"), anonimizado (sem loja, sem vendedor, ids ficticios). A pagina real estava atras da verificacao anti-robo na hora da escrita
 * e NAO foi aberta de proposito: a estrutura deve ser conferida na SIMULACAO do loop (enviar:false) antes de ligar a gravacao.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { FILA_MAX_POR_HORA, FILA_PAUSA_VERIFICACAO_MIN, decidirFila, janelaDeLeitura, minutosAteProximaVitrine, precisaLer, priorizarFila, urlLeituraShopee, type CandidatoShopee } from '../src/lib/messaging/shopee-fila-viva';
import { validarLeituraPagina } from '../src/lib/messaging/verdade-viva';

const SV = createRequire(import.meta.url)(path.resolve(process.cwd(), 'public/loops/shopee-vivo.js'));
let n = 0;
const t = (nome: string, f: () => void) => { f(); n++; console.log('ok  ' + nome); };
const pag = (linhas: string[]) => linhas.join('\n');
const ITEM = '12345678901';
const ARGS = { pathname: `/product/111/${ITEM}`, search: '', itemIdEsperado: ITEM };

const CAB = ['Shopee', 'Categorias', 'Jogos e Consoles > Jogos > PlayStation 5', 'Jogo Exemplo Aventura PS5 Mídia Física Lacrado Original', '4.9 1,2mil Avaliações 3,4mil Vendidos'];
const MEIO = ['Cupom da loja', 'R$5 OFF', 'Frete grátis acima de R$ 99', 'Receba até 3 dias úteis', 'Quantidade'];
const FIM = ['Descrição do produto', 'Jogo novo lacrado.', 'Avaliações do produto', 'Produtos semelhantes', 'Jogo Outro PS5 R$ 59,90 Esgotado', 'Esgotado'];

// ---------- anuncio ativo: preco riscado + atual + selo; estoque e botoes ----------
const ATIVO = pag([...CAB, 'R$139,90', 'R$119,62', '14% OFF', ...MEIO, '12 peças disponíveis', 'Adicionar ao carrinho', 'Comprar agora', ...FIM]);
t('anuncio ativo: disponivel, preco de lista = o MENOR do grupo (119,62), nao o riscado', () => {
  const a = SV.analisarPagina({ ...ARGS, texto: ATIVO });
  assert.equal(a.estado, 'disponivel'); assert.equal(a.precoCents, 11962); assert.equal(a.faixa, true); assert.equal(a.estoque, 12);
});
t('ativo sem desconto (um preco so)', () => {
  const a = SV.analisarPagina({ ...ARGS, texto: pag([...CAB, 'R$ 89,90', ...MEIO, '3 peças disponíveis', 'Comprar agora', ...FIM]) });
  assert.equal(a.estado, 'disponivel'); assert.equal(a.precoCents, 8990); assert.equal(a.faixa, false);
});
t('faixa de variacoes: usa o menor da faixa', () => {
  const a = SV.analisarPagina({ ...ARGS, texto: pag([...CAB, 'R$99,00 - R$129,00', ...MEIO, 'Adicionar ao carrinho', ...FIM]) });
  assert.equal(a.estado, 'disponivel'); assert.equal(a.precoCents, 9900);
});
t('milhar: R$1.299,90', () => {
  const a = SV.analisarPagina({ ...ARGS, texto: pag([...CAB, 'R$1.499,00', 'R$1.299,90', '13% OFF', ...MEIO, '2 peças disponíveis', 'Comprar agora', ...FIM]) });
  assert.equal(a.precoCents, 129990);
});
t('o frete, o cupom e o parcelado NUNCA viram preco', () => {
  const a = SV.analisarPagina({ ...ARGS, texto: pag([...CAB, 'Frete R$ 9,90', 'R$5 OFF em compras acima de R$ 50', '12x R$ 9,99', 'R$119,62', ...MEIO, '5 peças disponíveis', 'Comprar agora', ...FIM]) });
  assert.equal(a.precoCents, 11962);
});

// ---------- esgotado ----------
const ESG = pag([...CAB, 'R$139,90', 'R$119,62', '14% OFF', ...MEIO, 'Esgotado', 'Adicionar ao carrinho', ...FIM]);
t('esgotado na pagina (mesmo com o botao desenhado): esgotado', () => {
  const a = SV.analisarPagina({ ...ARGS, texto: ESG });
  assert.equal(a.estado, 'esgotado'); assert.equal(a.motivo, 'esgotado_na_pagina');
});
t('estoque 0: esgotado', () => assert.equal(SV.analisarPagina({ ...ARGS, texto: pag([...CAB, 'R$ 119,62', ...MEIO, '0 peças disponíveis', ...FIM]) }).estado, 'esgotado'));
t('"Esgotado" so nos PRODUTOS SEMELHANTES (depois do bloco principal) NAO esgota o anuncio ativo', () => {
  assert.equal(SV.analisarPagina({ ...ARGS, texto: ATIVO }).estado, 'disponivel'); // FIM contem "Esgotado" depois de "Produtos semelhantes"
});
t('estoque > 0 vence "Esgotado" solto (variacao esgotada, anuncio ativo)', () => {
  const a = SV.analisarPagina({ ...ARGS, texto: pag([...CAB, 'R$ 100,00', ...MEIO, 'Esgotado', '4 peças disponíveis', 'Comprar agora', ...FIM]) });
  assert.equal(a.estado, 'disponivel');
});

// ---------- indisponivel / outros estados ----------
t('pagina de produto removido: indisponivel', () => {
  const a = SV.analisarPagina({ ...ARGS, texto: 'Shopee\nEste produto não está mais disponível\nVoltar para a página inicial' });
  assert.equal(a.estado, 'indisponivel');
});
t('"Algo deu errado" generico NAO e indisponivel (nunca expira por erro da Shopee)', () => {
  const a = SV.analisarPagina({ ...ARGS, texto: 'Ops! Algo deu errado. Tente novamente mais tarde.' });
  assert.ok(!['indisponivel', 'esgotado', 'disponivel'].includes(a.estado));
});
t('pagina ainda carregando (bloco curto): carregando, nao grava', () => {
  assert.equal(SV.analisarPagina({ ...ARGS, texto: 'Shopee\nCarregando...' }).estado, 'carregando');
});
t('sem estoque e sem botao: nao e disponivel (padrao negado)', () => {
  assert.equal(SV.analisarPagina({ ...ARGS, texto: pag([...CAB, 'R$ 119,62', ...MEIO, ...FIM]) }).estado, 'carregando');
});
t('VERIFICACAO anti-robo: por URL (verify, scene=crawler_item) e por texto', () => {
  assert.equal(SV.analisarPagina({ pathname: '/verify/captcha', search: 'scene=crawler_item', texto: '', itemIdEsperado: ITEM }).estado, 'verificacao');
  assert.equal(SV.analisarPagina({ pathname: `/product/111/${ITEM}`, search: 'scene=crawler_item', texto: 'x', itemIdEsperado: ITEM }).estado, 'verificacao');
  assert.equal(SV.analisarPagina({ ...ARGS, texto: 'Verifique que você não é um robô\nArraste o controle deslizante' }).estado, 'verificacao');
});
t('login: redireciona para /buyer/login', () => assert.equal(SV.analisarPagina({ pathname: '/buyer/login', search: '', texto: 'Entrar', itemIdEsperado: ITEM }).estado, 'login'));
t('URL final com OUTRO item: item_diferente (nunca grava no item errado)', () => {
  assert.equal(SV.analisarPagina({ ...ARGS, pathname: '/product/111/99999', texto: ATIVO }).estado, 'item_diferente');
});
t('itemIdDaUrl: 3 formatos', () => {
  assert.equal(SV.itemIdDaUrl('https://shopee.com.br/product/111/222'), '222');
  assert.equal(SV.itemIdDaUrl('https://shopee.com.br/Jogo-Exemplo-i.111.222?sp=1'), '222');
  assert.equal(SV.itemIdDaUrl('/product/222'), '222');
  assert.equal(SV.itemIdDaUrl('/m/cupom-de-desconto'), null);
});

// ---------- coerencia de preco e linha para a rota ----------
t('preco incoerente com o esperado (0,4x a 2,5x) nao grava', () => {
  assert.equal(SV.precoCoerente(990, 11962), false); assert.equal(SV.precoCoerente(11962, 13990), true); assert.equal(SV.precoCoerente(40000, 13990), false);
});
t('linhaParaGravar: esgotado/indisponivel gravam disponivel:false; disponivel coerente grava o preco; duvida = null', () => {
  assert.deepEqual(SV.linhaParaGravar('o1', { estado: 'esgotado' }, 13990), { offer_id: 'o1', disponivel: false, motivo: 'esgotado' });
  assert.deepEqual(SV.linhaParaGravar('o1', { estado: 'indisponivel' }, 13990), { offer_id: 'o1', disponivel: false, motivo: 'indisponivel' });
  assert.deepEqual(SV.linhaParaGravar('o1', { estado: 'disponivel', precoCents: 11962 }, 13990), { offer_id: 'o1', disponivel: true, preco_cents: 11962 });
  assert.equal(SV.linhaParaGravar('o1', { estado: 'disponivel', precoCents: 990 }, 13990), null);
  assert.equal(SV.linhaParaGravar('o1', { estado: 'carregando' }, 13990), null);
  assert.equal(SV.linhaParaGravar('o1', { estado: 'verificacao' }, 13990), null);
});
t('contrato com a rota: as linhas do loop passam em validarLeituraPagina', () => {
  const oid = '123e4567-e89b-12d3-a456-426614174000';
  assert.ok(validarLeituraPagina(SV.linhaParaGravar(oid, { estado: 'disponivel', precoCents: 11962 }, 13990)).ok);
  assert.ok(validarLeituraPagina(SV.linhaParaGravar(oid, { estado: 'esgotado' }, 13990)).ok);
});

// ---------- ritmo do loop ----------
t('pausa humana: piso de 15 s e faixa respeitada', () => {
  assert.equal(SV.pausaEntre([1000, 2000], 0), 15000);
  assert.equal(SV.pausaEntre([20000, 45000], 0), 20000); assert.equal(SV.pausaEntre([20000, 45000], 0.999999), 45000);
  const d = SV.descansoDeLote(0.5); assert.ok(d >= 120000 && d <= 240000);
});
t('podeLer: piso de 15 s entre paginas, nunca em paralelo', () => {
  const now = 1_000_000_000;
  assert.equal(SV.podeLer(now, [now - 5000], {}).pode, false);
  assert.equal(SV.podeLer(now, [now - 5000], {}).motivo, 'piso_entre_paginas');
  assert.equal(SV.podeLer(now, [now - 20000], {}).pode, true);
});
t('podeLer: descanso depois de um lote de 8 e teto por hora', () => {
  const now = 1_000_000_000;
  const lote = Array.from({ length: 8 }, (_, i) => now - 30000 - (7 - i) * 30000); // 8 leituras a cada 30 s, a ultima ha 30 s
  const r = SV.podeLer(now, lote, { loteMax: 8 });
  assert.equal(r.pode, false); assert.equal(r.motivo, 'descanso_de_lote');
  assert.equal(SV.podeLer(now + 100000, lote, { loteMax: 8 }).pode, true); // 2 min depois do ultimo
  const hora = Array.from({ length: 70 }, (_, i) => now - 3500000 + i * 40000);
  assert.equal(SV.podeLer(now, hora, { maxPorHora: 70 }).motivo, 'teto_por_hora');
  assert.equal(SV.validarCfg({ api: 'https://x.com', token: 'a'.repeat(40), maxPorHora: 500 }, 'shopee.com.br').cfg.maxPorHora, 90); // teto duro
});
t('verificacao anti-robo: recuo longo e crescente; 401/403 pausam', () => {
  assert.deepEqual([1, 2, 3, 9].map((k) => SV.politica('verificacao', k).min), [90, 180, 360, 360]);
  assert.equal(SV.tipoHttp(401), 'token_recusado'); assert.equal(SV.tipoHttp(403), 'origem_recusada'); assert.equal(SV.tipoHttp(200), null);
});
t('config: so shopee.com.br, https, token longo; padrao = simulacao', () => {
  assert.equal(SV.validarCfg({ api: 'https://x.com', token: 'a'.repeat(40) }, 'www.mercadolivre.com.br').ok, false);
  assert.equal(SV.validarCfg({ api: 'http://x.com', token: 'a'.repeat(40) }, 'shopee.com.br').ok, false);
  assert.equal(SV.validarCfg({ api: 'https://x.com', token: 'curto' }, 'shopee.com.br').ok, false);
  const ok = SV.validarCfg({ api: 'https://x.com/', token: 'a'.repeat(40) }, 'shopee.com.br');
  assert.ok(ok.ok); assert.equal(ok.cfg.enviar, false);
});

// ---------- fila: janela, priorizacao, ritmo do servidor ----------
const at = (min: number, s = 0) => new Date(Date.UTC(2026, 10, 22, 15, min, s));
t('janela: abre 14 min antes da marca do cron (:00/:30), fecha 3 min depois, fecha no meio', () => {
  assert.equal(minutosAteProximaVitrine(at(16)), 14);
  assert.equal(janelaDeLeitura(at(16)).aberta, true);
  assert.equal(janelaDeLeitura(at(15, 30)).aberta, false);
  assert.equal(janelaDeLeitura(at(29)).aberta, true);
  assert.equal(janelaDeLeitura(at(2)).aberta, true); // cron atrasado
  assert.equal(janelaDeLeitura(at(5)).aberta, false);
  assert.equal(janelaDeLeitura(at(46)).aberta, true); assert.equal(janelaDeLeitura(at(44)).aberta, false);
});
t('precisaLer: leitura que chegaria ao envio com mais de 14 min precisa ser refeita', () => {
  assert.equal(precisaLer(null, 5), true);
  assert.equal(precisaLer(2, 10), false); // 12 min no envio
  assert.equal(precisaLer(6, 10), true); // 16 min no envio
  assert.equal(precisaLer(0.5, 13), false);
});
const C = (p: string, pos: number, idade: number | null): CandidatoShopee => ({ offerId: `o-${p}${pos}`, itemId: String(1000 + pos), plataforma: p, posicao: pos, precoCents: 5000 + pos, idadeMin: idade });
t('priorizacao: intercala plataformas por posicao, nunca-lido antes de lido, so os N primeiros, pula leitura fresca, corta no limite', () => {
  const cands = [C('ps5', 0, null), C('ps5', 1, 1), C('ps5', 2, null), C('ps4', 0, 9), C('ps4', 1, null), C('xbox', 0, null), C('xbox', 9, null), C('ps5', 12, null)];
  const f = priorizarFila(cands, { minAteVitrine: 10, limite: 50 });
  assert.deepEqual(f.map((x) => x.offerId), ['o-ps50', 'o-xbox0', 'o-ps40', 'o-ps41', 'o-ps52']);
  assert.deepEqual(f.map((x) => x.prioridade), [1, 2, 3, 4, 5]);
  assert.equal(priorizarFila(cands, { minAteVitrine: 10, limite: 2 }).length, 2);
  assert.equal(priorizarFila([{ ...C('ps5', 0, null), itemId: 'abc' }], { minAteVitrine: 10, limite: 5 }).length, 0); // item sem id valido nunca entra
  assert.equal(priorizarFila([C('ps5', 0, null), C('ps5', 0, null)], { minAteVitrine: 10, limite: 5 }).length, 1); // sem duplicata
});
t('ritmo do servidor: fora da janela, teto por hora, verificacao anti-robo e kill-switch fecham a fila', () => {
  const base = { now: at(20), lidasUltimaHora: 0, minDesdeVerificacao: null };
  assert.equal(decidirFila(base).servir, true);
  assert.deepEqual(decidirFila({ ...base, now: at(5) }), { servir: false, motivo: 'fora_da_janela', reabreEmMin: 11 });
  assert.equal((decidirFila({ ...base, lidasUltimaHora: FILA_MAX_POR_HORA }) as { motivo: string }).motivo, 'teto_por_hora');
  const v = decidirFila({ ...base, minDesdeVerificacao: 10 }) as { motivo: string; reabreEmMin: number };
  assert.equal(v.motivo, 'verificacao_antirrobo'); assert.equal(v.reabreEmMin, FILA_PAUSA_VERIFICACAO_MIN - 10);
  assert.equal(decidirFila({ ...base, minDesdeVerificacao: FILA_PAUSA_VERIFICACAO_MIN + 1 }).servir, true);
  assert.equal((decidirFila({ ...base, desligado: true }) as { motivo: string }).motivo, 'desligado');
  const ok = decidirFila({ ...base, lidasUltimaHora: FILA_MAX_POR_HORA - 3 });
  assert.ok(ok.servir && ok.limite === 3); // nunca serve mais do que falta para o teto
});
t('url de leitura: sem tag, sem afiliado, so o itemId', () => {
  assert.equal(urlLeituraShopee('58266395293'), 'https://shopee.com.br/product/58266395293');
  assert.equal(urlLeituraShopee('x; DROP'), null);
});
t('o loop nao carrega token nem credencial', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'public/loops/shopee-vivo.js'), 'utf8') as string;
  assert.ok(!/Bearer [A-Za-z0-9]{20,}/.test(src)); assert.ok(!/(token|senha|password)\s*[:=]\s*['"][A-Za-z0-9]{16,}['"]/i.test(src));
  assert.ok(!/click\(\)|dispatchEvent|\.submit\(/.test(src)); // so leitura: nunca clica
});

console.log(`\n${n} verificacoes OK (R-119 leitor de paginas da Shopee)`);
