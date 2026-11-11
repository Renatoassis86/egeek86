/**
 * Testes das funcoes puras do inventario do catalogo (sem banco, sem rede). Uso:
 *   npx tsx scripts/test-catalogo-inventario.ts   (sai com codigo 1 se algo falhar)
 */
import {
  CSV_BOM, CSV_COLUMNS, LOJAS, MAX_PAGES, cabecalhoCsv, caminhoProduto, centsParaReais, csvEscape, csvLine, deltaSerie, escapeLike,
  foldTotais, linhaParaCsv, parseFiltros, pct, redeBucket, statusDoVeredito, type CatalogoLinha, type SnapshotDia,
} from '../src/lib/catalog/inventario';
import { VERTICALS } from '../src/lib/catalog/verticais';

let fails = 0;
let total = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`);
  }
}

// lojas cobrem todas as verticais, sem repetir
check('LOJAS = VERTICALS', LOJAS.length === VERTICALS.length && LOJAS.every((l) => (VERTICALS as readonly string[]).includes(l.slug)));

// status / rede / pct
check('sem veredito = approved', statusDoVeredito(null) === 'approved' && statusDoVeredito(undefined) === 'approved' && statusDoVeredito('x') === 'approved');
check('review/rejected', statusDoVeredito('review') === 'review' && statusDoVeredito('rejected') === 'rejected');
check('rede buckets', redeBucket('mercado-livre') === 'ml' && redeBucket('shopee') === 'shopee' && redeBucket('amazon') === 'amazon' && redeBucket('kabum') === 'outras' && redeBucket(null) === 'outras');
check('pct sem denominador = null', pct(0, 0) === null && pct(5, 0) === null);
check('pct 1 casa', pct(1, 3) === 33.3 && pct(3, 4) === 75 && pct(0, 10) === 0);

// agregacao
const t = foldTotais(
  [
    { vertical: 'games', status: 'approved', n: 10 },
    { vertical: 'games', status: 'review', n: 2 },
    { vertical: 'games', status: 'rejected', n: 3 },
    { vertical: 'livros', status: 'approved', n: 4 },
    { vertical: 'inexistente', status: 'approved', n: 99 },
  ],
  [
    { vertical: 'games', rede: 'mercado-livre', ativas: 8, oficiais: 4, min_cents: '500', max_cents: 9000, ultima_coleta: '2026-11-11T10:00:00Z' },
    { vertical: 'games', rede: 'shopee', ativas: 2, oficiais: 2, min_cents: 300, max_cents: '12000', ultima_coleta: new Date('2026-11-11T11:00:00Z') },
    { vertical: 'games', rede: 'amazon', ativas: 1, oficiais: 0, min_cents: null, max_cents: null, ultima_coleta: null },
    { vertical: 'games', rede: 'kabum', ativas: 1, oficiais: 1, min_cents: 800, max_cents: 800, ultima_coleta: null },
  ],
  [{ vertical: 'games', n: 5 }]
);
const g = t.games;
check('masters por status', g.mastersAprovados === 10 && g.mastersRevisao === 2 && g.mastersRejeitados === 3 && g.mastersTotal === 15, g);
check('ofertas por rede', g.ofertasMl === 8 && g.ofertasShopee === 2 && g.ofertasAmazon === 1 && g.ofertasOutras === 1 && g.ofertasAtivas === 12, g);
check('oficiais e pct', g.ofertasOficiais === 7 && g.pctLinkOficial === 58.3, g);
check('faixa de preco', g.menorPrecoCents === 300 && g.maiorPrecoCents === 12000, g);
check('ultima coleta = maior', g.ultimaColeta === '2026-11-11T11:00:00.000Z', g.ultimaColeta);
check('pct com media sobre aprovados', g.mastersComMedia === 5 && g.pctComMedia === 50, g);
check('loja vazia fica zerada e sem pct inventado', t.esporte.mastersTotal === 0 && t.esporte.pctLinkOficial === null && t.esporte.menorPrecoCents === null && t.esporte.ultimaColeta === null);
check('vertical desconhecida ignorada', Object.keys(t).length === VERTICALS.length);

// filtros
const f0 = parseFiltros({});
check('filtros padrao', f0.q === '' && f0.rede === '' && f0.status === '' && f0.link === '' && f0.sort === 'nome' && f0.page === 1);
const f1 = parseFiltros({ q: '  zelda  ', rede: 'shopee', status: 'review', link: 'sem', sort: 'preco', page: '3' });
check('filtros validos', f1.q === 'zelda' && f1.rede === 'shopee' && f1.status === 'review' && f1.link === 'sem' && f1.sort === 'preco' && f1.page === 3, f1);
const f2 = parseFiltros({ rede: 'drop table', status: 'x', link: 'y', sort: 'z', page: '-4' });
check('filtros invalidos caem no padrao', f2.rede === '' && f2.status === '' && f2.link === '' && f2.sort === 'nome' && f2.page === 1, f2);
check('pagina limitada', parseFiltros({ page: '999999' }).page === MAX_PAGES && parseFiltros({ page: 'abc' }).page === 1 && parseFiltros({ page: '2.7' }).page === 2);
check('array na URL usa o primeiro', parseFiltros({ q: ['a', 'b'] }).q === 'a');
check('q limitado a 80', parseFiltros({ q: 'x'.repeat(500) }).q.length === 80);
check('escapeLike', escapeLike('100%_a\\b') === '100\\%\\_a\\\\b');

// CSV
check('csv simples', csvEscape('abc') === 'abc' && csvEscape(null) === '' && csvEscape(undefined) === '' && csvEscape(12) === '12');
check('csv virgula', csvEscape('a,b') === '"a,b"');
check('csv aspas', csvEscape('Jogo "Edicao" 2') === '"Jogo ""Edicao"" 2"');
check('csv quebra de linha', csvEscape('a\nb') === '"a\nb"' && csvEscape('a\r\nb') === '"a\r\nb"');
check('csv: so o delimitador do formato forca aspas', csvEscape('a;b', ';') === '"a;b"' && csvEscape('a;b') === 'a;b' && csvEscape('a,b', ';') === 'a,b');
check('csvLine termina com CRLF', csvLine(['a', 'b,c', null]) === 'a,"b,c",\r\n' && csvLine(['a', 'b'], ';') === 'a;b\r\n');
check('BOM', CSV_BOM === '﻿' && CSV_BOM.charCodeAt(0) === 0xfeff);
check('cabecalho tem todas as colunas', cabecalhoCsv() === CSV_COLUMNS.join(',') + '\r\n' && cabecalhoCsv({ formato: 'pt' }) === CSV_COLUMNS.join(';') + '\r\n');
check('centsParaReais', centsParaReais(12345) === '123.45' && centsParaReais(12345, true) === '123,45' && centsParaReais(null) === '' && centsParaReais(0) === '0.00');

const base: CatalogoLinha = {
  id: 'id1', slug: 'zelda-botw', vertical: 'games', nome: 'Zelda, "Breath" do\nWild', marca: null, modelo: null, plataforma: 'switch_1', tipo: 'game',
  chave: null, status: 'approved', ofertasMl: 2, ofertasShopee: 1, ofertasAmazon: 0, ofertasOutras: 0, ofertasTotal: 3, ofertasOficiais: 2,
  menorPrecoCents: 19990, redeMenorPreco: 'shopee', mediaCents: null, mediaDia: null, ultimaColeta: '2026-11-11T10:00:00.000Z',
  ofertaBaratoId: 'o1', ofertaBaratoSlug: 'zelda-oferta', ofertaBaratoUrl: 'https://x/y?a=1,2',
};
const linha = linhaParaCsv(base, { origem: 'https://site.test' });
check('linha: campo com virgula/aspas/quebra fica entre aspas', linha.includes('"Zelda, ""Breath"" do\nWild"'), linha);
check('linha: preco com ponto, media vazia (nunca 0 inventado)', linha.includes(',199.90,shopee,,,2026-11-11'), linha);
check('linha: url de jogo usa a oferta', linha.includes('https://site.test/ofertas/zelda-oferta'), linha);
check('linha: url da oferta com virgula escapada', linha.includes('"https://x/y?a=1,2"'), linha);
check('linha: omitirUrlOferta esvazia o link', !linhaParaCsv(base, { omitirUrlOferta: true }).includes('https://x/y'));
check('linha pt usa ; e decimal virgula', linhaParaCsv(base, { formato: 'pt' }).includes(';199,90;shopee;'), linhaParaCsv(base, { formato: 'pt' }));
check('caminho de outra loja usa o slug do master', caminhoProduto({ vertical: 'livros', slug: 'abc', ofertaBaratoSlug: null }) === '/mercado/livros/abc');
check('games sem oferta ativa = sem caminho', caminhoProduto({ vertical: 'games', slug: 'abc', ofertaBaratoSlug: null }) === null);
// o numero de campos da linha confere com o cabecalho (parse simples de CSV)
function contaCampos(s: string, delim: string): number {
  let n = 1, q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { if (q && s[i + 1] === '"') i++; else q = !q; } else if (c === delim && !q) n++;
  }
  return n;
}
check('linha tem o mesmo numero de colunas do cabecalho', contaCampos(linha.replace(/\r\n$/, ''), ',') === CSV_COLUMNS.length, contaCampos(linha, ','));

// evolucao
const mk = (day: string, a: number, ml: number): SnapshotDia => ({ day, mastersAprovados: a, mastersRevisao: 0, mastersRejeitados: 0, ofertasMl: ml, ofertasShopee: 0, ofertasAmazon: 0, ofertasOutras: 0, ofertasOficiais: 0, pctOficial: null });
check('delta sem 2 pontos = null', deltaSerie([], 'ofertasMl') === null && deltaSerie([mk('2026-11-10', 1, 1)], 'ofertasMl') === null);
check('delta usa mais novo menos mais antigo, mesmo fora de ordem', deltaSerie([mk('2026-11-11', 120, 50), mk('2026-11-09', 100, 70)], 'mastersAprovados') === 20 && deltaSerie([mk('2026-11-11', 120, 50), mk('2026-11-09', 100, 70)], 'ofertasMl') === -20);

console.log(fails === 0 ? `OK: ${total} verificacoes` : `${fails} FALHA(S) de ${total}`);
process.exit(fails === 0 ? 0 : 1);
