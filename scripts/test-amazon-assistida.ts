/**
 * Testes do LOOP DA COLETA ASSISTIDA DA AMAZON (scripts/chrome/amazon-assistida.js). SEM rede e SEM banco.
 * Uso: npx tsx scripts/test-amazon-assistida.ts  (código 1 se algo falhar)
 * Cobre: parser da busca e da página (HTML), validação de payload contra o contrato da rota, política de recuo (nunca para, teto 30 min),
 * pausa humana, bloqueios e a ponte com o julgamento do servidor (judgeGame: patrocinado sem página pede página; com pg=1 aceita).
 * ATENÇÃO: os HTMLs abaixo são FIXTURES de EXEMPLO escritas à mão no formato conhecido da Amazon; NÃO são leituras reais da loja.
 * A estrutura real precisa ser conferida na aba logada em simulação (enviar:false), ver docs/amazon-assistida-loop.md.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { judgeGame, prepareGame, type AmzCand } from '../src/lib/affiliate/amazon-identity';

let fails = 0;
let total = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  total++;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: any = createRequire(__filename)(path.resolve(__dirname, 'chrome/amazon-assistida.js'));

const card = (asin: string, titulo: string, o: { preco?: string; lista?: string; patro?: boolean; img?: string } = {}) => `
<div data-asin="${asin}" data-component-type="s-search-result" class="s-result-item ${o.patro ? 'AdHolder' : ''}">
  ${o.patro ? '<span class="puis-sponsored-label-text">Patrocinado</span>' : ''}
  <img class="s-image" src="${o.img ?? 'https://m.media-amazon.com/images/I/71abcDEF12._AC_UL320_.jpg'}" alt="x">
  <h2 class="a-size-base"><a href="/dp/${asin}"><span>${titulo}</span></a></h2>
  ${o.preco ? `<span class="a-price" data-a-size="xl"><span class="a-offscreen">R$&nbsp;${o.preco}</span><span aria-hidden="true">x</span></span>` : ''}
  ${o.lista ? `<span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">R$ ${o.lista}</span></span>` : ''}
</div>`;

const BUSCA = `<html><body>
${card('B0ABCDE123', 'Resident Evil Village &amp; Gold - PS5 M&iacute;dia F&iacute;sica', { preco: '1.299,90', lista: '1.499,90' })}
${card('B0SPONSOR1', 'Resident Evil Village - PS5', { patro: true, preco: '10,00' })}
${card('B0SEMPRECO', 'Jogo sem preco orgânico')}
<div data-asin="" data-component-type="s-search-result"></div>
${card('B0ABCDE123', 'Duplicado do primeiro', { preco: '9,99' })}
${card('B0IMGRUIM1', 'Imagem fora da CDN', { preco: '99,00', img: 'https://evil.example/x.jpg' })}
</body></html>`;

const PAGINA = (asin: string, preco: string | null) => `<html><head><link rel="canonical" href="https://www.amazon.com.br/dp/${asin}"></head><body>
<input type="hidden" id="ASIN" name="ASIN" value="${asin}">
<div id="productTitle">Produto</div>
<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">${preco ? `R$&nbsp;${preco}` : ''}</span></span></div>
<div id="similar"><span class="a-price"><span class="a-offscreen">R$ 5,00</span></span></div>
</body></html>`;

const UUID = '123e4567-e89b-12d3-a456-426614174000';

function main() {
  // ---------------- parser da busca ----------------
  const b = P.parseBusca(BUSCA);
  check('busca: reconhece os cards e devolve ok', b.ok === true && b.cartoes === 6, b);
  const c0 = b.candidatos[0];
  check('busca: ASIN, título decodificado, preço normalizado e lista', c0.a === 'B0ABCDE123' && c0.t.startsWith('Resident Evil Village & Gold - PS5 M') && c0.p === 'R$ 1.299,90' && c0.l === 'R$ 1.499,90' && c0.s === 0, c0);
  check('busca: imagem só da CDN da Amazon', c0.i === 'https://m.media-amazon.com/images/I/71abcDEF12._AC_UL320_.jpg' && !('i' in b.candidatos.find((c: AmzCand) => c.a === 'B0IMGRUIM1')), b.candidatos);
  const sp = b.candidatos.find((c: AmzCand) => c.a === 'B0SPONSOR1');
  check('busca: patrocinado marcado s=1 e com p=null (preço do card nunca vale)', sp && sp.s === 1 && sp.p === null && sp.l === null, sp);
  check('busca: orgânico sem preço é omitido; card sem ASIN ignorado; ASIN duplicado só uma vez', !b.candidatos.some((c: AmzCand) => c.a === 'B0SEMPRECO') && b.candidatos.filter((c: AmzCand) => c.a === 'B0ABCDE123').length === 1 && b.candidatos.length === 3, b.candidatos.map((c: AmzCand) => c.a));
  check('busca: no máximo 10 candidatos', P.parseBusca(Array.from({ length: 15 }, (_, i) => card('B0' + String(i).padStart(8, '0'), 'Jogo ' + i, { preco: '10,00' })).join('')).candidatos.length === 10);
  const vazia = P.parseBusca('<html><body><span>Nenhum resultado para "xyz"</span></body></html>');
  check('busca: "nenhum resultado" é ok com lista vazia (vira busca sem candidato)', vazia.ok === true && vazia.candidatos.length === 0 && vazia.semResultados === true, vazia);
  check('busca: HTML desconhecido ou vazio NÃO é ok (não envia linha vazia por engano)', P.parseBusca('<html><body>Algo</body></html>').ok === false && P.parseBusca('').ok === false);
  check('busca: título por aria-label quando h2 sem texto', P.parseBusca('<div data-asin="B0ARIA0001" data-component-type="s-search-result"><h2 aria-label="Titulo via aria"></h2><span class="a-price"><span class="a-offscreen">R$ 10,00</span></span></div>').candidatos[0]?.t === 'Titulo via aria');

  // ---------------- parser da página ----------------
  const pg = P.parsePagina(PAGINA('B0SPONSOR1', '259,90'), 'B0SPONSOR1');
  check('página: preço do bloco do produto (não do "similar")', pg.ok && pg.p === 'R$ 259,90', pg);
  check('página: ASIN diferente é recusado', P.parsePagina(PAGINA('B0OUTRO001', '10,00'), 'B0SPONSOR1').ok === false);
  check('página: sem preço lido = descarte (nada é inventado)', P.parsePagina(PAGINA('B0SPONSOR1', null), 'B0SPONSOR1').ok === false);
  check('página: sem bloco de preço = descarte', P.parsePagina('<input id="ASIN" value="B0SPONSOR1"><span class="a-price"><span class="a-offscreen">R$ 5,00</span></span>', 'B0SPONSOR1').motivo === 'sem_bloco_de_preco');
  const cp = P.candidatoDePagina(sp, pg);
  check('candidato da página: s=1, pg=1 e preço da página', cp.s === 1 && cp.pg === 1 && cp.p === 'R$ 259,90' && cp.a === 'B0SPONSOR1', cp);

  // ---------------- preço ----------------
  check('normalizarPreco com nbsp e milhar', P.normalizarPreco('R$ 1.234,56') === 'R$ 1.234,56' && P.normalizarPreco('R$ 99,00') === 'R$ 99,00' && P.normalizarPreco('sem preço') === null);
  check('parseBrl igual ao do servidor', P.parseBrl('R$ 1.234,56') === 123456 && P.parseBrl(null) === null && P.parseBrl('R$ 0,00') === null);

  // ---------------- payload x contrato da rota ----------------
  const ok = P.validarPayload([{ id: UUID, q: 'x', r: [{ a: 'B0ABCDE123', t: ' Titulo ', p: 'R$ 10,00', l: 'lixo', s: 0, i: 'https://m.media-amazon.com/images/I/71abcDEF12._AC_UL320_.jpg' }] }]);
  check('payload válido passa; lista inválida vira null', ok.rows.length === 1 && ok.rows[0].r[0].l === null && ok.rows[0].r[0].t === 'Titulo' && ok.descartes.length === 0, ok);
  const ruim = P.validarPayload([
    { id: 'nao-uuid', r: [] },
    { id: UUID, r: 'x' },
    { id: UUID, r: [{ a: 'curto', t: 'x', p: 'R$ 1,00', s: 0 }, { a: 'B0ABCDE123', t: '', p: 'R$ 1,00', s: 0 }, { a: 'B0ABCDE124', t: 'ok', p: null, s: 0 }, { a: 'B0ABCDE125', t: 'ok', p: null, s: 1, pg: 1 }, { a: 'B0ABCDE126', t: 'ok', p: 'R$ 5,00', s: 0, pg: 1 }] },
  ]);
  check('payload: linhas/candidatos fora do contrato são descartados (id, ASIN, título, sem preço, pg sem preço, pg sem patrocinado)',
    ruim.rows.length === 1 && ruim.rows[0].r.length === 0 && ruim.descartes.length === 7, ruim);
  check('payload: patrocinado sem página pode ir com p null; i fora da CDN é cortada', (() => { const r = P.validarPayload([{ id: UUID, r: [{ a: 'B0SPONSOR1', t: 'S', p: null, s: 1, i: 'https://x.com/a.jpg' }] }]); return r.rows[0].r.length === 1 && !('i' in r.rows[0].r[0]); })());
  check('payload: no máximo 40 linhas e 10 candidatos por linha', (() => { const rows = Array.from({ length: 45 }, () => ({ id: UUID, r: Array.from({ length: 12 }, (_, i) => ({ a: 'B0' + String(i).padStart(8, '0'), t: 't', p: 'R$ 1,00', s: 0 })) })); const r = P.validarPayload(rows); return r.rows.length === 40 && r.rows[0].r.length === 10; })());
  check('payload: tamanho do corpo > 400 KB é detectado', P.tamanhoOk('x'.repeat(400000)) && !P.tamanhoOk('x'.repeat(400001)));

  // ---------------- ponte com o julgamento do servidor (contrato real) ----------------
  const rev = prepareGame({ name: 'Resident Evil Village', gen: 'ps5' })!;
  const dePatro: AmzCand = { a: 'B0SPONSOR1', t: 'Resident Evil Village - PS5 Mídia Física', p: null, l: null, s: 1 };
  check('servidor: patrocinado sem página pede a página', judgeGame(rev, dePatro).needsPage === true);
  const comPg = P.candidatoDePagina(dePatro, { p: 'R$ 259,90', l: null });
  check('servidor: o reenvio montado por este loop (s=1, pg=1, p da página) é aceito', judgeGame(rev, comPg).outcome === 'accept', judgeGame(rev, comPg));
  const pend = P.paginasPendentes({ stats: { paginas_pendentes: [{ id: UUID, a: 'B0SPONSOR1' }, { id: UUID, a: 'B0SPONSOR1' }, { id: 'x', a: 'B0SPONSOR1' }, { id: UUID, a: 'curto' }] } });
  check('paginas_pendentes: saneia e deduplica', pend.length === 1 && P.paginasPendentes(null).length === 0 && P.paginasPendentes({}).length === 0, pend);

  // ---------------- bloqueios ----------------
  const det = P.detectarBloqueio;
  check('bloqueio por status', det({ status: 429 }) === 'http_429' && det({ status: 403 }) === 'http_403' && det({ status: 503 }) === 'http_503' && det({ status: 502 }) === 'amazon_5xx' && det({ status: 200 }) === null);
  check('bloqueio por caminho e texto', det({ status: 200, pathname: '/errors/validateCaptcha' }) === 'captcha' && det({ status: 200, pathname: '/ap/signin' }) === 'login' && det({ status: 200, texto: 'Digite os caracteres que você vê abaixo' }) === 'captcha');
  check('texto de login só vale sem conteúdo (menu da Amazon tem "faça login")', det({ status: 200, texto: 'Olá, faça login', temConteudo: true }) === null && det({ status: 200, texto: 'Olá, faça login', temConteudo: false }) === 'login');

  // ---------------- política de recuo: NUNCA para, teto 30 min ----------------
  const tipos = ['captcha', 'login', 'http_403', 'http_429', 'http_503', 'amazon_5xx', 'token_recusado', 'origem_recusada', 'servidor_desligado', 'servidor_instavel', 'rede', 'layout', 'desconhecido'];
  check('política: toda ocorrência vira pausa (nunca parar), entre 1 e 30 min, para qualquer repetição', tipos.every((t) => [1, 2, 3, 4, 5, 6, 7, 50, 0, -3].every((n) => { const p = P.politica(t, n); return p.acao === 'pausar' && p.min >= 1 && p.min <= 30; })));
  check('política: recuo cresce com as repetições até o teto', P.politica('rede', 1).min === 1 && P.politica('rede', 3).min === 5 && P.politica('rede', 99).min === 30 && P.politica('servidor_instavel', 2).min === 5);
  check('política: Retry-After sobe a pausa, mas nunca acima de 30 min', P.politica('rede', 1, 600).min === 10 && P.politica('rede', 1, 99999).min === 30 && P.politica('rede', 1, 0).min === 1);
  check('Retry-After: segundos, vazio e data', P.parseRetryAfter('120') === 120 && P.parseRetryAfter(null) === 0 && P.parseRetryAfter('') === 0 && P.parseRetryAfter('lixo') === 0);
  check('tipo de falha do servidor', P.tipoServidor(401) === 'token_recusado' && P.tipoServidor(403) === 'origem_recusada' && P.tipoServidor(503, 'desligado') === 'servidor_desligado' && P.tipoServidor(500) === 'servidor_instavel' && P.tipoServidor(429) === 'http_429');

  // ---------------- ritmo humano ----------------
  const faixa = [4000, 9000];
  check('pausa entre buscas: 4 a 9 s, nunca abaixo do piso', P.pausaEntreItens(faixa, 0, 4000) === 4000 && P.pausaEntreItens(faixa, 1, 4000) === 9000 && P.pausaEntreItens([100, 200], 0, 4000) === 4000);
  check('cadência do servidor sobe o piso', P.pausaEntreItens(faixa, 0, 4000, 6) === 6000 && P.pausaEntreItens(faixa, 0, 4000, 20) === 20000);
  check('montarUrlBusca codifica a consulta', P.montarUrlBusca('God of War  Ragnarök PS5') === '/s?k=God+of+War++Ragnar%C3%B6k+PS5' && P.montarUrlBusca(' a&b ') === '/s?k=a%26b');

  // ---------------- configuração ----------------
  const tok = 'x'.repeat(40);
  const cfg = P.validarCfg({ api: 'https://www.egeek86.com/', token: tok, enviar: false, lote: 99 }, 'www.amazon.com.br');
  check('cfg válida: simulação por padrão, lote limitado a 40, token só no retorno separado', cfg.ok && cfg.cfg.enviar === false && cfg.cfg.lote === 40 && cfg.cfg.api === 'https://www.egeek86.com' && !JSON.stringify(cfg.cfg).includes(tok) && cfg.token === tok, cfg);
  check('cfg: enviar só com true literal; modos inválidos caem no padrão', P.validarCfg({ api: 'https://a.com', token: tok, enviar: 'true', modos: ['x'] }, 'www.amazon.com.br').cfg.enviar === false && P.validarCfg({ api: 'https://a.com', token: tok, modos: ['x'] }, 'amazon.com.br').cfg.modos.join() === 'refresh,discover');
  const bad = [P.validarCfg(null, 'www.amazon.com.br'), P.validarCfg({ api: 'http://a.com', token: tok }, 'www.amazon.com.br'), P.validarCfg({ api: 'https://a.com/x', token: tok }, 'www.amazon.com.br'), P.validarCfg({ api: 'https://a.com', token: 'curto' }, 'www.amazon.com.br'), P.validarCfg({ api: 'https://a.com', token: tok }, 'www.shopee.com.br')];
  check('cfg inválida (ausente, http, caminho, token curto, host errado) e o erro não vaza o token', bad.every((x: { ok: boolean; erro?: string }) => x.ok === false && !String(x.erro).includes(tok)), bad);

  console.log(`\n${total - fails}/${total} ok`);
  if (fails) process.exit(1);
}
main();
