/**
 * Testes das partes PURAS do loop de links meli.la e do loop de cupom de item (2026-11-12). SEM rede e SEM banco.
 * Uso: npx tsx --conditions=react-server scripts/test-ml-links-ui.ts  (código 1 se algo falhar)
 * Cobre: extração/validação do link, aviso de não elegível, recuo (rede nunca para), configuração, ordenação de prioridade da fila,
 * URL de anúncio x catálogo, regra de reintento das falhas e o parser de cupom de item. Os textos/HTML abaixo são FIXTURES escritas à mão
 * para exercitar a lógica; NÃO são leituras reais do Mercado Livre.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  REINTENTO_DIAS, TETO_TENTATIVAS, falhaBloqueia, faixaTicket, motivoValido, ordenarFilaLinks, rotuloPrioridade, urlDoAnuncio, ehUrlDeCatalogo, type FilaRow,
} from '../src/lib/ml-links/fila';

const req = createRequire(import.meta.url);
const L = req(path.resolve(process.cwd(), 'scripts/chrome/ml-links-ui.js'));
const C = req(path.resolve(process.cwd(), 'scripts/chrome/ml-cupons-item.js'));

let fails = 0, total = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  total++; if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
}

// ---- link ----
check('extrai link curto do texto', L.extrairLink('Copie: https://meli.la/2aBcD9x agora') === 'https://meli.la/2aBcD9x');
check('não extrai link de outro domínio', L.extrairLink('https://exemplo.com/abcd') === null);
check('não extrai link curto demais', L.extrairLink('https://meli.la/ab') === null);
check('valida formato exato', L.linkValido('https://meli.la/AbC123') && !L.linkValido('https://meli.la/AbC123/x') && !L.linkValido('http://meli.la/AbC123'));
check('aviso de não elegível', L.ehNaoElegivel('⚠️ Este produto não cumpre com os requisitos do Programa') && !L.ehNaoElegivel('Copie o link'));
check('erro transitório do gerador', L.ehErroTransitorio('Algo deu errado') && !L.ehErroTransitorio('Link curto'));

// ---- recuo ----
const seq = (f: (n: number) => { min: number }) => [1, 2, 3, 4, 5, 6, 40].map((n) => f(n).min);
check('rede recua 1,2,5,10,20 e fica em 20 (nunca para)', JSON.stringify(seq((n) => L.politica('rede', n))) === JSON.stringify([1, 2, 5, 10, 20, 20, 20]));
check('500 e 429 do servidor usam o recuo e não param', L.politica('http_5xx', 99).acao === 'pausar' && L.politica('http_429', 99).acao === 'pausar');
check('503 (kill-switch) recua 10..60', L.politica('servidor_desligado', 1).min === 10 && L.politica('servidor_desligado', 9).min === 60);
check('login/captcha/token/origem NUNCA param (regra do dono): pausam e voltam', ['login', 'captcha', 'token_recusado', 'origem_recusada', 'saiu_do_gerador'].every((t) => L.politica(t, 1).acao === 'pausar' && L.politica(t, 99).acao === 'pausar'));
check('status HTTP -> tipo', L.tipoHttp(200) === null && L.tipoHttp(401) === 'token_recusado' && L.tipoHttp(403) === 'origem_recusada' && L.tipoHttp(503) === 'servidor_desligado' && L.tipoHttp(500) === 'http_5xx' && L.tipoHttp(429) === 'http_429');
check('bloqueio: login e captcha', L.detectarBloqueio({ pathname: '/jms/mlb/lgz/login' }) === 'login' && L.detectarBloqueio({ pathname: '/afiliados/linkbuilder', texto: 'verifique que você é humano' }) === 'captcha' && L.detectarBloqueio({ pathname: '/afiliados/linkbuilder', texto: 'ok' }) === null);
check('pausa humana respeita o piso e a faixa', L.pausaEntreItens([1000, 2000], 0, 3000) === 3000 && L.pausaEntreItens([3500, 7000], 1, 3000) === 7000 && L.pausaEntreItens([3500, 7000], 0, 3000) === 3500);
check('filtrarNovos tira ids já tratados', L.filtrarNovos([{ id: 'a', url: 'u' }, { id: 'b', url: 'u' }], { a: 1 }).length === 1);
check('skips retidos só liberam se o item seguinte funcionou', L.liberarSkips([{ id: 'x' }], true).length === 1 && L.liberarSkips([{ id: 'x' }], false).length === 0);

const tok = 'x'.repeat(32);
check('cfg válida (padrões)', (() => { const v = L.validarCfg({ api: 'https://site.com/', token: tok }, 'www.mercadolivre.com.br'); return v.ok && v.cfg.api === 'https://site.com' && v.cfg.enviar === false && v.cfg.lote === 25; })());
check('cfg recusa host errado, token curto e api com caminho', !L.validarCfg({ api: 'https://s.com', token: tok }, 'amazon.com.br').ok && !L.validarCfg({ api: 'https://s.com', token: 'curto' }, 'mercadolivre.com.br').ok && !L.validarCfg({ api: 'https://s.com/x', token: tok }, 'mercadolivre.com.br').ok);
check('cfg limita o lote a 40', L.validarCfg({ api: 'https://s.com', token: tok, lote: 999 }, 'mercadolivre.com.br').cfg.lote === 40);
check('cfg nunca devolve o token na mensagem de erro', !JSON.stringify(L.validarCfg({ api: 'ruim', token: tok }, 'mercadolivre.com.br')).includes(tok));

// ---- ordenação de prioridade ----
const R = (id: string, vertical: string, nome: string, priceCents: number, rn = 1, masterId = id): FilaRow => ({ id, masterId, vertical, nome, priceCents, rn });
const fila = [
  R('g1', 'games', 'Jogo Resident Evil PS5', 29900),
  R('p-cabo', 'eletroeletronicos', 'Cabo HDMI 2m', 3000),
  R('p-tv', 'eletroeletronicos', 'Smart TV 55 polegadas 4K', 250000),
  R('p-tv-rn2', 'eletroeletronicos', 'Smart TV 50 polegadas', 180000, 2),
  R('p-ger', 'eletrodomesticos', 'Geladeira Frost Free 400L', 320000),
  R('p-caro-outro', 'eletroeletronicos', 'Console retro portátil', 200000),
  R('p-nb', 'tecnologia', 'Notebook Gamer i7', 600000),
  R('p-imp3d', 'impressao3d', 'Impressora 3D Ender', 150000),
  R('p-fil', 'impressao3d', 'Filamento PLA 1kg', 9000),
];
const ord = ordenarFilaLinks(fila).map((r) => r.id);
check('Plus (mesmo a demais-ofertas) antes de games? não: games só depois de todo o bloco Plus', ord.indexOf('g1') === ord.length - 1, ord);
check('mais barata de cada produto (rn=1) antes das demais, dentro de Plus', ord.indexOf('p-fil') < ord.indexOf('p-tv-rn2'), ord);
check('ticket alto primeiro (notebook, geladeira, TV, impressora 3D)', ord.slice(0, 4).join() === ['p-nb', 'p-ger', 'p-tv', 'p-imp3d'].join(), ord);
check('ticket médio-alto de outro tipo depois dos de ticket alto e antes do barato', ord.indexOf('p-caro-outro') > ord.indexOf('p-imp3d') && ord.indexOf('p-caro-outro') < ord.indexOf('p-cabo'), ord);
check('ordem determinística', JSON.stringify(ordenarFilaLinks([...fila].reverse()).map((r) => r.id)) === JSON.stringify(ord));
check('faixas de ticket', faixaTicket('eletroeletronicos', 'Smart TV 55', 10000) === 0 && faixaTicket('eletroeletronicos', 'Cabo', 200000) === 1 && faixaTicket('eletroeletronicos', 'Cabo', 5000) === 2);
check('rótulo de prioridade', rotuloPrioridade(R('x', 'games', 'Jogo', 100, 2)) === 'games/demais-ofertas/ticket-2' && rotuloPrioridade(R('y', 'tecnologia', 'Monitor 27', 90000)) === 'plus/mais-barata/ticket-0');

// ---- URL do anúncio x catálogo ----
check('item id vira URL de anúncio', urlDoAnuncio('MLB123456789', 'https://www.mercadolivre.com.br/p/MLB48918613') === 'https://produto.mercadolivre.com.br/MLB-123456789');
check('sem item id e URL de catálogo => null (não elegível)', urlDoAnuncio(null, 'https://www.mercadolivre.com.br/p/MLB48918613?x=1') === null && ehUrlDeCatalogo('https://www.mercadolivre.com.br/p/MLB48918613'));
check('sem item id e URL de anúncio => usa a URL limpa', urlDoAnuncio(null, 'https://produto.mercadolivre.com.br/MLB-111-titulo?a=b#c') === 'https://produto.mercadolivre.com.br/MLB-111-titulo');

// ---- falhas ----
check('motivos aceitos', motivoValido('nao_elegivel') && motivoValido('sem_resultado') && motivoValido('erro_pagina') && !motivoValido('outro') && !motivoValido(undefined));
check('falha recente bloqueia; passado o prazo, libera', falhaBloqueia('sem_resultado', 1, 1) && !falhaBloqueia('sem_resultado', 1, REINTENTO_DIAS.sem_resultado + 0.1) && falhaBloqueia('nao_elegivel', 1, 29) && !falhaBloqueia('nao_elegivel', 1, 31));
check('teto de tentativas bloqueia para sempre', falhaBloqueia('erro_pagina', TETO_TENTATIVAS, 9999));

// ---- cupom de item (fixtures) ----
check('item id da URL de leitura', C.itemIdDaUrl('https://www.mercadolivre.com.br/p/MLB48918613?pdp_filters=item_id%3AMLB3456789012') === 'MLB3456789012');
const htmlComSpan = '<p>R$ <b>315,46</b> com Cupom</p> MLB3456789012 "price":340';
check('lê "R$ x com Cupom" mesmo com tags no meio', C.extrairCupons(htmlComSpan).cupons.length === 1 && C.extrairCupons(htmlComSpan).cupons[0].label === 'R$ 315,46 com Cupom', C.extrairCupons(htmlComSpan));
const sem = '<div>Sem promoção</div> MLB3456789012 "price":340 R$ 340';
check('sem cupom e sem menção => não ambíguo', (() => { const x = C.extrairCupons(sem); return x.cupons.length === 0 && !x.ambiguo; })());
const amb = '<div>Aplique seu cupom no carrinho</div> MLB3456789012 R$ 340';
check('menção a cupom sem preço lido => ambíguo (não afirma "sem cupom")', C.extrairCupons(amb).ambiguo === true);
check('página só confere com o itemId e preço', C.paginaConfere(sem, 'MLB3456789012') && !C.paginaConfere(sem, 'MLB999999999') && !C.paginaConfere('<html>vazia MLB3456789012</html>', 'MLB3456789012'));
check('tipo da página: 429/403 => pausa longa; 5xx curto; login/captcha param', C.tipoPagina({ status: 429 }) === 'http_429' && C.tipoPagina({ status: 403 }) === 'http_429' && C.tipoPagina({ status: 503 }) === 'http_5xx' && C.tipoPagina({ status: 200, finalUrl: 'https://www.mercadolivre.com.br/jms/mlb/lgz/login' }) === 'login' && C.tipoPagina({ status: 200, finalUrl: 'https://www.mercadolivre.com.br/p/MLB1' }) === 'ok' && C.tipoPagina({ status: 404 }) === 'nao_encontrada');
check('429 recua 15, 30 e fica em 30; nunca para', [1, 2, 3, 4, 9].map((n) => C.politica('http_429', n).min).join() === '15,30,30,30,30' && C.politica('http_429', 50).acao === 'pausar');
check('5xx do ML recua curto e rede recua até 20', C.politica('http_5xx', 1).min === 1 && C.politica('http_5xx', 9).min === 10 && C.politica('rede', 9).min === 20);
check('cupom: NENHUM LOOP PARA (login/captcha/token/origem/429/5xx pausam, teto 30 min)', ['login', 'captcha', 'token_recusado', 'origem_recusada', 'http_429', 'http_5xx', 'rede'].every((t) => [1, 3, 99].every((n) => { const p = C.politica(t, n); return p.acao === 'pausar' && p.min <= 30; })));
check('janela de sessão: não relê antes de 40 min, mantém a ordem', (() => { const it = [{ id: 'a', url: 'u' }, { id: 'b', url: 'u' }, { id: 'c', url: 'u' }]; const f = C.filtrarFila(it, { b: 1000 }, 1000 + 39 * 60000, 40); const g = C.filtrarFila(it, { b: 1000 }, 1000 + 41 * 60000, 40); return f.map((x: { id: string }) => x.id).join() === 'a,c' && g.length === 3; })());
check('cfg do cupom válida e recusa token curto', C.validarCfg({ api: 'https://s.com', token: tok }, 'www.mercadolivre.com.br').ok && !C.validarCfg({ api: 'https://s.com', token: 'x' }, 'www.mercadolivre.com.br').ok);

console.log(`\n${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
