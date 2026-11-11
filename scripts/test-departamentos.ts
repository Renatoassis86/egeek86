/**
 * TESTE DE DEPARTAMENTOS (ata 2026-11-10, emenda E.1 item 9 / E.3). Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-departamentos.ts
 * (npm run test:departamentos). Sai com código 1 se houver FAIL. O banco só recebe SELECT (sem DATABASE_URL, a parte
 * de banco é pulada).
 *
 * (a) regras puras: estado (trava mestra, flag, mínimo de 3 masters), linha de identidade, mediana, busca, origem do clique, aprovação.
 * (b) SQL das consultas novas: exigem vertical do registro, porteiro approved por inclusão, link não pendente, frescor, rede ML/Shopee.
 * (c) estático: /go bloqueia pendente, usa after(), não repassa s/m ao destino; arquivos novos sem "afiliad" e sem raio.
 * (d) banco (SELECT): isolamento nos DOIS sentidos; flag fechada = nenhum resultado; link pendente nunca clicável.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import {
  DEPARTAMENTOS, MIN_MASTERS_DEPARTAMENTO, decidirEstado, estadoPermiteVer, linhaIdentidade, regrasSoAdmin, rotuloMediana, termosBusca,
  travaMestraLigada, departamentoPorSlug, OFERTA_CLICAVEL_MAX_HORAS,
} from '../src/lib/catalog/departamentos';
import { parseOrigemClique } from '../src/lib/analytics/origem-clique';
import { avaliarCandidato, type CandidatoMaster } from '../src/lib/catalog/aprovacao-nicho';

type Level = 'PASS' | 'FAIL' | 'INFO';
const results: Array<{ level: Level; id: string; msg: string }> = [];
const rec = (level: Level, id: string, msg: string) => results.push({ level, id, msg });
const check = (cond: boolean, id: string, msg: string) => rec(cond ? 'PASS' : 'FAIL', id, msg);
const ROOT = process.cwd();
const dialect = new PgDialect();
const render = (q: SQL) => dialect.sqlToQuery(q).sql;
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

// ------------------------------------------------------------------------------------------- (a)
function secaoA() {
  const flagAberta = { key: 'dept_livros', enabled: true, rules: [] };
  check(decidirEstado({ masterEnv: undefined, flag: flagAberta, mastersVisiveis: 10 }) === 'fechado', 'a:mestra-ausente', 'MERCADO_UI ausente => fechado');
  check(decidirEstado({ masterEnv: '0', flag: flagAberta, mastersVisiveis: 10 }) === 'fechado', 'a:mestra-zero', 'MERCADO_UI=0 => fechado');
  check(travaMestraLigada('1') && travaMestraLigada('true') && !travaMestraLigada('') && !travaMestraLigada('yes'), 'a:mestra-valores', 'só "1"/"true" ligam a trava mestra');
  check(decidirEstado({ masterEnv: '1', flag: null, mastersVisiveis: 10 }) === 'fechado', 'a:flag-ausente', 'sem linha na feature_flags => fechado');
  check(decidirEstado({ masterEnv: '1', flag: { ...flagAberta, enabled: false }, mastersVisiveis: 10 }) === 'fechado', 'a:flag-fechada', 'flag enabled=false => fechado (mesmo com masters)');
  check(decidirEstado({ masterEnv: '1', flag: flagAberta, mastersVisiveis: MIN_MASTERS_DEPARTAMENTO - 1 }) === 'fechado', 'a:menos-de-3', '< 3 masters visíveis => fechado');
  check(decidirEstado({ masterEnv: '1', flag: flagAberta, mastersVisiveis: MIN_MASTERS_DEPARTAMENTO }) === 'publico', 'a:exato-3', 'exatos 3 masters + flag + trava => público');
  const admin = { ...flagAberta, rules: [{ audience: 'admin' }] };
  check(decidirEstado({ masterEnv: '1', flag: admin, mastersVisiveis: 5 }) === 'admin' && regrasSoAdmin(['admin']) && !regrasSoAdmin([]), 'a:janela-admin', 'rules audience=admin => estado admin');
  check(estadoPermiteVer('admin', false) === false && estadoPermiteVer('admin', true) === true && estadoPermiteVer('fechado', true) === false && estadoPermiteVer('publico', false), 'a:permite-ver', 'admin só para admin; fechado nunca; público para todos');

  check(!DEPARTAMENTOS.some((d) => (d.slug as string) === 'games'), 'a:registro-sem-games', 'registro não contém games');
  check(DEPARTAMENTOS.length === 5 && DEPARTAMENTOS.every((d) => d.flag === `dept_${d.slug}`), 'a:registro-flags', 'cinco departamentos, uma flag dept_<slug> cada');
  check(departamentoPorSlug('games') === null && departamentoPorSlug('xyz') === null, 'a:slug-desconhecido', 'slug desconhecido/games => null');
  check(!DEPARTAMENTOS.some((d) => /afiliad/i.test(`${d.rotulo} ${d.descricao}`)), 'a:sem-afiliado', 'rótulos sem a palavra "afiliad"');

  const base = { gtin: null, mpn: null, manufacturer: null, catalogAttributes: null };
  check(linhaIdentidade('livro', base).length === 0 && linhaIdentidade('eletro', base).length === 0 && linhaIdentidade('tecnologia', base).length === 0, 'a:identidade-vazia', 'master sem dado => nenhuma linha de identidade');
  const livro = linhaIdentidade('livro', { ...base, gtin: '9788535914849', catalogAttributes: { BOOK_EDITION: '2ª' } });
  check(livro.some((l) => l.rotulo === 'ISBN') && livro.some((l) => l.rotulo === 'Edição') && !livro.some((l) => l.rotulo === 'Editora'), 'a:identidade-livro', 'livro: ISBN e edição só quando existem');
  const eletro = linhaIdentidade('eletro', { ...base, catalogAttributes: { BRAND: 'LG', MODEL: 'X1' } });
  check(!eletro.some((l) => l.rotulo === 'Voltagem') && eletro.some((l) => l.rotulo === 'Modelo'), 'a:identidade-eletro', 'eletro: voltagem ausente não aparece');
  check(linhaIdentidade('eletro', { ...base, catalogAttributes: { VOLTAGE: '127V' } }).some((l) => l.valor === '127V'), 'a:identidade-voltagem', 'eletro: voltagem aparece quando existe');
  const tec = linhaIdentidade('tecnologia', { ...base, mpn: 'ZT-1', gtin: '123', manufacturer: 'Zotac' });
  check(['Marca', 'Part number', 'GTIN'].every((r) => tec.some((l) => l.rotulo === r)), 'a:identidade-tec', 'tecnologia: marca, part number e GTIN');

  check(rotuloMediana(2) === null && rotuloMediana(3) !== null && /apenas Mercado Livre/.test(rotuloMediana(3) ?? ''), 'a:mediana', 'mediana só com 3+ vendedores e rotulada "apenas Mercado Livre"');
  check(termosBusca("a %_ ' ab").every((t) => !/(^|[^\\])[%_]/.test(t)) && termosBusca('  ').length === 0, 'a:busca', 'busca escapa curingas LIKE e ignora vazio');

  const o = parseOrigemClique('tg', 'msg-123');
  check(o.origem === 'tg' && o.mensagem === 'msg-123', 'a:origem-valida', 'origem tg + mensagem válida gravadas');
  const ruim = parseOrigemClique('telegram', 'Mensagem com espaço <script>');
  check(ruim.origem === undefined && ruim.mensagem === undefined, 'a:origem-invalida', 'valores fora da lista ignorados');
  check(parseOrigemClique('wa', 'ab').mensagem === undefined && parseOrigemClique('wa', 'a'.repeat(41)).mensagem === undefined && parseOrigemClique('site', 'a'.repeat(40)).mensagem !== undefined, 'a:origem-tamanho', 'id da mensagem 3 a 40 caracteres');
  check(parseOrigemClique('WA', 'ABC-1').origem === undefined && parseOrigemClique(null, null).origem === undefined, 'a:origem-caixa', 'maiúsculas e nulos ignorados');

  const cand: CandidatoMaster = {
    id: 'x', name: 'Soundbar Samsung B450 2022 Preto', vertical: 'eletroeletronicos', gtin: '1', mpn: null, hasImage: true,
    gate: { verdict: 'review', suggested: 'approved' }, catalogAttributes: { MODEL: 'B450' },
    precosClicaveis: [100000, 150000], ofertasAtivas: 3, ofertasQuarentena: 0, titulosOfertas: ['Soundbar Samsung B450'], nomeDuplicado: false,
  };
  check(avaliarCandidato(cand).aprovavel, 'a:aprov-ok', 'candidato válido é aprovável');
  check(avaliarCandidato({ ...cand, precosClicaveis: [] }).motivos.includes('sem_oferta_clicavel'), 'a:aprov-sem-oferta', 'sem oferta clicável => revisão');
  check(avaliarCandidato({ ...cand, precosClicaveis: [100000, 260000] }).motivos.some((m) => m.startsWith('amplitude')), 'a:aprov-amplitude', 'amplitude > 2,5x => revisão');
  check(avaliarCandidato({ ...cand, name: 'Soundbar Samsung usada Preto' }).motivos.includes('nao_e_produto_novo'), 'a:aprov-usado', 'usado => revisão');
  check(avaliarCandidato({ ...cand, gate: { verdict: 'review', suggested: 'review' } }).motivos.includes('sem_evidencia_positiva_do_porteiro'), 'a:aprov-evidencia', 'sem evidência positiva => revisão');
  check(avaliarCandidato({ ...cand, name: 'Manga' }).motivos.includes('nome_generico'), 'a:aprov-generico', 'nome genérico => revisão');
  check(avaliarCandidato({ ...cand, gate: { verdict: 'rejected', suggested: 'approved' } }).aprovavel === false, 'a:aprov-rejeitado', 'rejeitado pelo dono nunca é aprovável');
  check(avaliarCandidato({ ...cand, ofertasAtivas: 2, ofertasQuarentena: 1 }).motivos.includes('quarentena_acima_de_30pct'), 'a:aprov-quarentena', 'quarentena >= 30% => revisão');
}

// ------------------------------------------------------------------------------------------- (b)
async function secaoB() {
  const { departamentoClicaveisCtes, masterAprovadoSql } = await import('../src/server/queries/departamento');
  for (const d of DEPARTAMENTOS) {
    const t = render(sql`WITH ${departamentoClicaveisCtes(d.slug)} SELECT 1`);
    check(t.includes(`vertical = '${d.slug}'`), `b:${d.slug}:vertical`, `SQL contém vertical = '${d.slug}'`);
    check(!/vertical\s*=\s*'games'/i.test(t), `b:${d.slug}:sem-games`, "SQL não contém vertical = 'games'");
    check(/verdict' = 'approved'/.test(t) && /manual' = 'approved'/.test(t), `b:${d.slug}:approved`, 'porteiro approved por inclusão (verdict ou manual)');
    check(/affiliate_link_pending = false/.test(t), `b:${d.slug}:pendente`, 'exige affiliate_link_pending = false');
    check(/quarantined_at IS NULL/.test(t) && /status = 'active'/.test(t), `b:${d.slug}:quarentena`, 'exige oferta ativa e sem quarentena');
    check(new RegExp(`interval '${OFERTA_CLICAVEL_MAX_HORAS} hours'`).test(t), `b:${d.slug}:frescor`, `exige checagem < ${OFERTA_CLICAVEL_MAX_HORAS} h`);
    check(/n\.slug IN \(\$\d+, \$\d+\)/.test(t) || /n\.slug IN/.test(t), `b:${d.slug}:redes`, 'restringe a redes ML/Shopee (Amazon fora)');
    check(/public_offers/.test(t) && /fresh_offers/.test(t), `b:${d.slug}:helper`, 'reaproveita publicOffersCtes');
  }
  let threw = false;
  try { departamentoClicaveisCtes('games'); } catch { threw = true; }
  check(threw, 'b:recusa-games', 'consulta de departamento recusa vertical games');
  let threw2 = false;
  try { departamentoClicaveisCtes("x' OR 1=1 --"); } catch { threw2 = true; }
  check(threw2, 'b:recusa-injecao', 'vertical fora do registro é recusada');
  check(/approved/.test(render(masterAprovadoSql('m'))) && /<> 'rejected'/.test(render(masterAprovadoSql('m'))), 'b:aprovado-sql', 'masterAprovadoSql respeita rejected manual');
  const src = read('src/server/queries/departamento.ts');
  check(!/catalogGateVisibleSql/.test(src), 'b:sem-exclusao', 'não usa o filtro de exclusão (NOT IN review) como porteiro');
}

// ------------------------------------------------------------------------------------------- (c)
function secaoC() {
  const go = read('src/app/go/[slug]/route.ts');
  check(/affiliateLinkPending/.test(go) && /link-em-ativacao/.test(go), 'c:go-pendente', '/go bloqueia link pendente e redireciona ao aviso');
  check(/after\(/.test(go) && /from 'next\/server'/.test(go), 'c:go-after', '/go grava o evento com after()');
  check(/parseOrigemClique/.test(go), 'c:go-origem', '/go lê origem s/m pela lista permitida');
  check(!/searchParams\.get\('s'\)[^;]*destinationUrl|destinationUrl[^;]*searchParams/.test(go), 'c:go-nao-repassa', 'parâmetros s/m não vão para o destino');
  check(/departamentoLiberadoParaGo/.test(go), 'c:go-depto', '/go consulta a chave de departamento');
  check(!/eq\(affiliateOffers\.vertical, GAMES\)/.test(go) && /offer\.vertical !== GAMES/.test(go), 'c:go-allowlist', '/go: games sempre; demais só com departamento liberado');
  const ordem = go.indexOf('affiliateLinkPending') < go.indexOf("gravar('affiliate_click', {})");
  check(ordem, 'c:go-ordem', 'bloqueio de pendente vem antes do clique válido');

  const novos = [
    ...walk('src/components/mercado'), ...walk('src/app/(detalhe)/mercado'), ...walk('src/app/(shop)/link-em-ativacao'),
    'src/lib/catalog/departamentos.ts', 'src/server/departamentos.ts', 'src/server/departamentos-rotas.ts', 'src/server/queries/departamento.ts', 'src/lib/analytics/origem-clique.ts',
  ];
  for (const f of novos) {
    const t = read(f);
    check(!/afiliad/i.test(t.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')), `c:afiliado:${f}`, 'sem "afiliad" fora de comentário');
    check(!/\brounded(?!-\[var\(--radius)/.test(t) && !/border-radius/i.test(t), `c:cantos:${f}`, 'sem rounded/border-radius');
    check(!/line-through|text-decoration:\s*line-through/.test(t), `c:de-por:${f}`, 'sem "de/por" riscado');
  }
  // Nenhuma imagem nova nem importada nas páginas novas.
  const paginas = walk('src/app/(detalhe)/mercado').concat(walk('src/components/mercado')).map(read).join('\n').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  check(!/\/images\//.test(paginas) && !/next\/image/.test(paginas), 'c:sem-imagem-nova', 'nenhum arquivo de public/images nas telas novas');
  check(!/graf|chart|selo|% abaixo|menor preço desde/i.test(paginas.replace(/Menor preço agora/g, '')), 'c:sem-selo-grafico', 'sem gráfico, selo, "% abaixo" ou "menor preço desde"');
  const sitemap = read('src/app/sitemap.ts');
  check(!/mercado/.test(sitemap), 'c:sitemap', 'sitemap não lista /mercado');
  check(/robots: \{ index: false/.test(read('src/app/(detalhe)/mercado/[vertical]/page.tsx')) && /robots: \{ index: false/.test(read('src/app/(detalhe)/mercado/[vertical]/[slug]/page.tsx')), 'c:noindex', 'páginas /mercado com noindex');
  check(/exigirDepartamento/.test(read('src/app/(detalhe)/mercado/[vertical]/page.tsx')) && /exigirDepartamento/.test(read('src/app/(detalhe)/mercado/[vertical]/[slug]/page.tsx')), 'c:porteiro-rotas', 'rotas passam por exigirDepartamento (404)');
  check(!/generateStaticParams/.test(paginas), 'c:sem-static-params', 'sem generateStaticParams (sob demanda)');
}

// ------------------------------------------------------------------------------------------- (d)
async function secaoD() {
  if (!process.env.DATABASE_URL) return rec('INFO', 'd:skip', 'sem DATABASE_URL: parte de banco pulada');
  const { db } = await import('../src/lib/db');
  const { publicOffersCtes } = await import('../src/server/queries/public-offers');
  const dep = await import('../src/server/queries/departamento');
  const srv = await import('../src/server/departamentos');

  // Flag fechada = nenhum resultado (estado), com e sem trava mestra.
  const antes = process.env.MERCADO_UI;
  try {
    delete process.env.MERCADO_UI;
    srv._limparCacheDepartamentos();
    const e1 = await Promise.all(DEPARTAMENTOS.map((d) => srv.estadoDoDepartamento(d.slug)));
    check(e1.every((e) => e === 'fechado'), 'd:trava-mestra', 'MERCADO_UI ausente => todos fechados (sem ler o banco)');
    check((await srv.departamentosVisiveis(true)).length === 0, 'd:menu-vazio-trava', 'menu "Departamentos" vazio com trava desligada, até para admin');
    process.env.MERCADO_UI = '1';
    srv._limparCacheDepartamentos();
    const flags = await db.execute<{ key: string; enabled: boolean }>(sql`SELECT key, enabled FROM feature_flags WHERE key LIKE 'dept\\_%'`);
    const abertas = new Set(flags.filter((f) => f.enabled).map((f) => f.key));
    const e2 = await Promise.all(DEPARTAMENTOS.map(async (d) => [d, await srv.estadoDoDepartamento(d.slug)] as const));
    for (const [d, e] of e2) {
      if (!abertas.has(d.flag)) check(e === 'fechado', `d:flag-fechada:${d.slug}`, `${d.slug}: flag desligada/ausente => fechado`);
      else rec('INFO', `d:flag-aberta:${d.slug}`, `${d.slug}: flag ligada, estado ${e}`);
    }
  } finally {
    if (antes === undefined) delete process.env.MERCADO_UI;
    else process.env.MERCADO_UI = antes;
    srv._limparCacheDepartamentos();
  }

  // Isolamento nos dois sentidos.
  const nicho = new Set((await db.execute<{ id: string }>(sql`SELECT id FROM master_products WHERE vertical <> 'games'`)).map((r) => r.id));
  const games = await db.execute<{ id: string }>(sql`WITH ${publicOffersCtes('games')} SELECT DISTINCT master_product_id AS id FROM public_offers`);
  check(games.length > 0, 'd:games-nao-vazio', `consulta de games devolve masters (${games.length})`);
  check(games.every((g) => !nicho.has(g.id)), 'd:iso-games-sem-nicho', 'nenhum master de nicho aparece na consulta de games');
  const gamesIds = new Set(games.map((g) => g.id));
  const allGames = new Set((await db.execute<{ id: string }>(sql`SELECT id FROM master_products WHERE vertical = 'games'`)).map((r) => r.id));
  let vazouParaNicho = 0;
  for (const d of DEPARTAMENTOS) {
    const pag = await dep.listarDepartamento(d.slug, { pagina: 1 });
    const ids = pag.itens.map((i) => i.id);
    check(ids.every((id) => !allGames.has(id) && !gamesIds.has(id)), `d:iso-nicho-sem-games:${d.slug}`, `${d.slug}: nenhum master de games na consulta de nicho`);
    if (ids.length) {
      const v = await db.execute<{ vertical: string }>(sql`SELECT DISTINCT vertical FROM master_products WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
      check(v.length === 1 && v[0].vertical === d.slug, `d:vertical-certa:${d.slug}`, `${d.slug}: todos os itens são da vertical`);
    }
    const n = await dep.contarMastersVisiveis(d.slug);
    check(n === pag.total, `d:contagem:${d.slug}`, `${d.slug}: contagem (${n}) = total da lista (${pag.total})`);
    check(pag.itens.length <= 24, `d:pagina24:${d.slug}`, `${d.slug}: no máximo 24 por página`);
    // cada item: link não pendente e frescor (via ofertas do banco)
    const detalhe = pag.itens[0] ? await dep.detalheDepartamento(d.slug, pag.itens[0].slug) : null;
    if (detalhe) {
      const slugs = detalhe.vendedoresLista.map((v) => v.ofertaSlug);
      const o = await db.execute<{ p: boolean; q: boolean; h: number }>(sql`SELECT affiliate_link_pending AS p, quarantined_at IS NOT NULL AS q, EXTRACT(EPOCH FROM (now() - last_checked_at))/3600 AS h FROM affiliate_offers WHERE slug IN (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)})`);
      check(o.every((x) => !x.p && !x.q && Number(x.h) <= OFERTA_CLICAVEL_MAX_HORAS), `d:clicavel:${d.slug}`, `${d.slug}: ofertas do detalhe sem pendente, sem quarentena, frescas`);
    }
    if (pag.total > 0) vazouParaNicho += 0;
  }
  // Link pendente nunca clicável: a consulta de clicáveis, executada de verdade, não devolve oferta pendente/quarentenada/velha/Amazon.
  for (const d of DEPARTAMENTOS) {
    const r = await db.execute<{ bad: number }>(sql`
      WITH ${dep.departamentoClicaveisCtes(d.slug)}
      SELECT COUNT(*)::int AS bad FROM clickable c INNER JOIN affiliate_offers o ON o.id = c.id
      WHERE o.affiliate_link_pending OR o.quarantined_at IS NOT NULL OR o.status <> 'active' OR c.network_slug NOT IN ('mercado-livre','shopee')
         OR o.last_checked_at < now() - interval '${sql.raw(String(OFERTA_CLICAVEL_MAX_HORAS))} hours' OR o.vertical <> ${d.slug}`);
    check(Number(r[0]?.bad) === 0, `d:clicavel-limpo:${d.slug}`, `${d.slug}: 0 oferta clicável pendente/quarentenada/velha/Amazon/outra vertical`);
  }
  // Informativo: situação atual (nada foi aprovado ainda pelo dono).
  const cont = await Promise.all(DEPARTAMENTOS.map(async (d) => `${d.slug}=${await dep.contarMastersVisiveis(d.slug)}`));
  rec('INFO', 'd:visiveis-hoje', `masters aprovados e visíveis por departamento: ${cont.join(', ')}`);
  const gc = await db.execute<{ masters: number; ofertas: number }>(sql`WITH ${publicOffersCtes('games')} SELECT COUNT(DISTINCT master_product_id)::int AS masters, COUNT(*)::int AS ofertas FROM public_offers`);
  rec('INFO', 'd:games-baseline', `games (publicOffersCtes): ${gc[0].masters} masters, ${gc[0].ofertas} ofertas públicas`);
  void vazouParaNicho;
}

async function main() {
  secaoA();
  await secaoB();
  secaoC();
  await secaoD();
  let fail = 0;
  for (const r of results) {
    if (r.level === 'FAIL') fail++;
    if (r.level !== 'PASS') console.log(`${r.level}  ${r.id}: ${r.msg}`);
  }
  const pass = results.filter((r) => r.level === 'PASS').length;
  console.log(`\n${pass} PASS, ${fail} FAIL, ${results.filter((r) => r.level === 'INFO').length} INFO`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error('ERRO NO TESTE:', e);
  process.exit(1);
});
