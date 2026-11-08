/**
 * TESTE DE ISOLAMENTO DE VERTICAL (Fase 0, ata 2026-11-08; ADR 0008). Escrito para o estado FINAL
 * (após a migração 0027 e o código de allow-list); ANTES disso ele FALHA de propósito, com explicação.
 *
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-vertical-isolation.ts
 *      (sai com código 1 se houver FAIL; WARN não reprova; o banco só é aberto em transação READ ONLY e só
 *       se DATABASE_URL existir)
 *
 * (a) SQL textual dos helpers: cada CTE pública que lê affiliate_offers/master_products precisa conter a
 *     allow-list `vertical = 'games'` (ou `vertical IN ('games')`).
 * (b) Varredura estática de src/: arquivo público que lê master_products/affiliate_offers precisa usar um
 *     helper de CTE pública OU declarar `vertical` na própria consulta.
 * (c) Banco (só se a coluna existir): nenhum master com vertical <> 'games' pode ter product_type = 'game';
 *     oferta e master precisam concordar na vertical.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import { publicOffersCtes } from '../src/server/queries/public-offers';
import { priceQuotesCtes, statsAggCtes } from '../src/server/queries/product-price-stats';

type Level = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
const results: Array<{ level: Level; id: string; msg: string }> = [];
const rec = (level: Level, id: string, msg: string) => results.push({ level, id, msg });
const ROOT = process.cwd();
const dialect = new PgDialect();
const render = (q: SQL) => dialect.sqlToQuery(q).sql;

// ---------------------------------------------------------------------------------------------
// (a) SQL textual das CTEs públicas
// ---------------------------------------------------------------------------------------------
const ALLOW = /\bvertical\s*(=\s*'games'|IN\s*\(\s*'games'\s*\)|=\s*ANY\s*\(\s*ARRAY\s*\[\s*'games'\s*\]\s*\))/i;
const READS_TABLE = /\b(FROM|JOIN)\s+(affiliate_offers|master_products)\b/i;

/** Quebra "WITH a AS (...), b AS MATERIALIZED (...)" em [nome, corpo] respeitando parênteses e aspas. */
function splitCtes(text: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /([a-z_][a-z0-9_]*)\s+AS\s+(?:NOT\s+)?(?:MATERIALIZED\s+)?\(/gi;
  let m: RegExpExecArray | null;
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") { i = text.indexOf("'", i + 1) + 1 || text.length; continue; }
    if (depth === 0) {
      re.lastIndex = i;
      m = re.exec(text);
      if (!m) break;
      let j = m.index + m[0].length;
      let d = 1;
      while (j < text.length && d > 0) {
        const c = text[j];
        if (c === "'") { j = text.indexOf("'", j + 1) + 1 || text.length; continue; }
        if (c === '(') d++;
        else if (c === ')') d--;
        j++;
      }
      out.push({ name: m[1], body: text.slice(m.index + m[0].length, j - 1) });
      i = j;
    } else i++;
  }
  return out;
}

function checkHelper(label: string, q: SQL, expectedCtes: string[]) {
  const text = render(q);
  const ctes = splitCtes(text);
  const names = ctes.map((c) => c.name);
  const missingNames = expectedCtes.filter((n) => !names.includes(n));
  if (missingNames.length) rec('FAIL', `a:${label}:estrutura`, `CTEs esperadas não encontradas (${missingNames.join(', ')}); o helper mudou de forma, ajuste o teste. Achadas: ${names.join(', ')}`);
  for (const c of ctes) {
    if (!READS_TABLE.test(c.body)) continue; // CTE derivada de outra CTE herda o filtro
    if (ALLOW.test(c.body)) rec('PASS', `a:${label}:${c.name}`, "tem allow-list vertical = 'games'");
    else rec('FAIL', `a:${label}:${c.name}`, `CTE pública lê ${(c.body.match(READS_TABLE) ?? [])[2]} sem o predicado vertical = 'games' (migração 0027 + allow-list ainda não implementadas neste helper)`);
  }
}

function sectionA() {
  checkHelper('publicOffersCtes', sql`WITH ${publicOffersCtes('games')} SELECT 1`, ['live_networks', 'fresh_offers', 'public_offers']);
  checkHelper('priceQuotesCtes', sql`WITH ${priceQuotesCtes(sql`TRUE`, 'games')} SELECT 1`, ['q_all']);
  checkHelper('statsAggCtes', sql`WITH ${statsAggCtes(sql`TRUE`, 'games')} SELECT 1`, ['q_all', 'raw']);
  const mig = fs.readdirSync(path.join(ROOT, 'drizzle/migrations')).filter((f) => /^0027.*\.sql$/.test(f) && !f.includes('rollback'));
  if (mig.length) rec('PASS', 'a:migracao-0027', `existe ${mig.join(', ')}`);
  else rec('FAIL', 'a:migracao-0027', 'drizzle/migrations/0027*.sql não existe (coluna vertical ainda não criada)');
  const rb = fs.readdirSync(path.join(ROOT, 'drizzle/migrations')).filter((f) => /^0027.*rollback\.sql$/.test(f));
  if (rb.length) rec('PASS', 'a:rollback-0027', `existe ${rb.join(', ')}`);
  else rec('FAIL', 'a:rollback-0027', 'rollback da 0027 não existe');
}

// ---------------------------------------------------------------------------------------------
// (b) varredura estática
// ---------------------------------------------------------------------------------------------
const HELPER = /\b(publicOffersCtes|priceQuotesCtes|statsAggCtes|filterPublicOfferIds|publicVerticalSql|verticalAllowSql)\b/;
const DIRECT = /(\b(FROM|JOIN)\s+(affiliate_offers|master_products)\b|\.(from|innerJoin|leftJoin)\(\s*(masterProducts|affiliateOffers)\b|\bFROM\s+\$\{[^}]*\b(masterProducts|affiliateOffers)\b)/gi;
const VERTICAL_TOKEN = /\bvertical\b/i;

/** Superfícies públicas: rotas, páginas, queries de leitura e componentes. Exclui admin, cron, webhook, coleta e actions. */
const EXCLUDE = [/[\\/]admin[\\/]/, /[\\/]api[\\/]cron[\\/]/, /[\\/]api[\\/]webhooks[\\/]/, /[\\/]actions[\\/]/, /\.test\./, /[\\/]jobs[\\/]/,
  /admin-metrics/, /affiliate-clicks/, /affiliate-conversions/, /[\\/]affiliate-reports[\\/]/, /[\\/]src[\\/]scripts[\\/]/];
const PUBLIC_DIRS = ['src/app', 'src/server/queries', 'src/server/pricing', 'src/components', 'src/lib/search'];

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * EXCEÇÕES JUSTIFICADAS (lista explícita; cada uma foi revisada arquivo a arquivo, ADR 0008 item 2). Arquivo aqui = leitura
 * direta SEM o predicado `vertical` no próprio arquivo, por um dos dois motivos abaixo. NÃO é lugar para "fazer passar":
 * toda entrada precisa de justificativa verificável e quem criar superfície pública nova com leitura direta deve
 * filtrar `vertical`, não entrar aqui.
 *   (D) DERIVA de ids já filtrados: o id do produto/oferta chega de um ponto de entrada que já aplicou a allow-list
 *       (publicOffersCtes(GAMES), produtoExiste(id, GAMES), getOfferBySlug com vertical = games).
 *   (A) AGNÓSTICA por desenho: derivação interna que precisa valer para TODOS os departamentos (grava/deriva histórico
 *       price_daily_* e price_min_events também das verticais novas) e não serve página pública.
 */
const EXCEPTIONS: Record<string, string> = {
  'src/server/pricing/eligibility-sql.ts': '(A) predicado de elegibilidade das métricas diárias (quarentena/identidade/porteiro); vale para qualquer departamento, usado por job e gancho de coleta, sem saída pública própria',
  'src/server/pricing/price-daily.ts': '(A) job que deriva price_daily_offer/state/min_events de snapshots; precisa cobrir TODAS as verticais (histórico da Black Friday); nenhuma página lê direto daqui',
  'src/server/pricing/shadow-hook.ts': '(A) gancho pós-snapshot da coleta: recalcula o dia da oferta recém-cotada, qualquer vertical; leitura por id da oferta',
  'src/server/pricing/price-chart-v2.ts': '(D) leitura por masterProductId; entradas públicas: rota /api/produtos/[id]/grafico (produtoExiste(id, GAMES), 404 fora de Games) e página /ofertas/[slug] (getOfferBySlug filtra vertical = games)',
  'src/server/pricing/price-metrics-v2.ts': '(D) leitura por masterProductId; mesmas entradas gateadas de price-chart-v2 (rota /api/produtos/[id]/grafico e página /ofertas/[slug])',
  'src/server/queries/home-search.ts': "(D) master lido por JOIN com public_offers (publicOffersCtes('games')); o predicado vertical = 'games' também está na consulta (via verticalSql)",
  'src/server/queries/price-table.ts': "(D) masters/ofertas ligados a public_offers (publicOffersCtes(GAMES)) e statsAggCtes(..., GAMES); o filtro explícito de vertical está em getNetworksWithOffers (verticalSql)",
  'src/server/queries/product-stores.ts': '(D) JOIN affiliate_offers por p.id de public_offers (publicOffersCtes(GAMES))',
  'src/server/queries/public-metrics.ts': '(D) JOIN por po.id de public_offers (publicOffersCtes(GAMES)); contagem de cotações filtra vertical via verticalSql',
  'src/server/queries/search-products.ts': '(D) ofertas ligadas a public_offers (publicOffersCtes(GAMES)); as duas leituras de master_products também filtram vertical via verticalSql',
};
// Nenhuma exceção pode ficar "órfã": se o arquivo sumiu ou passou a declarar `vertical`, a entrada é lixo e reprova.
function checkStaleExceptions(seen: Set<string>) {
  for (const k of Object.keys(EXCEPTIONS)) {
    if (!fs.existsSync(path.join(ROOT, k))) rec('FAIL', `b:excecao-orfa:${k}`, 'arquivo da exceção não existe mais (remova a entrada)');
    else if (!seen.has(k)) rec('FAIL', `b:excecao-sem-uso:${k}`, 'exceção não foi necessária nesta execução (arquivo já declara vertical ou não lê as tabelas); remova a entrada');
  }
}

function sectionB() {
  const files = PUBLIC_DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !EXCLUDE.some((r) => r.test(f)));
  const MUST = ['src/app/sitemap.ts', 'src/app/go/[slug]/route.ts', 'src/app/api/search/route.ts'];
  for (const m of MUST) if (!fs.existsSync(path.join(ROOT, m))) rec('WARN', `b:existe:${m}`, 'arquivo da superfície pública não encontrado (renomeado?)');
  let scanned = 0;
  let clean = 0;
  let excepted = 0;
  const usedExceptions = new Set<string>();
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    const direct = src.match(DIRECT)?.length ?? 0;
    if (!direct) continue;
    scanned++;
    const usesHelper = HELPER.test(src);
    const hasVertical = VERTICAL_TOKEN.test(src);
    if (hasVertical) { clean++; continue; }
    if (EXCEPTIONS[rel]) { usedExceptions.add(rel); excepted++; rec('PASS', `b:${rel}`, `exceção justificada: ${EXCEPTIONS[rel]}`); continue; }
    if (usesHelper) rec('WARN', `b:${rel}`, `${direct} leitura(s) direta(s) de master_products/affiliate_offers ao lado de helper público, sem 'vertical' no arquivo: revisar se alguma não deriva dos ids já filtrados`);
    else rec('FAIL', `b:${rel}`, `${direct} leitura(s) direta(s) de master_products/affiliate_offers SEM helper público e SEM filtro 'vertical' (consulta pública fora da allow-list)`);
  }
  checkStaleExceptions(usedExceptions);
  rec(clean + excepted === scanned && scanned > 0 ? 'PASS' : 'SKIP', 'b:resumo', `${scanned} arquivos públicos com leitura direta das tabelas; ${clean} declaram 'vertical'; ${excepted} em exceção justificada`);
}

// ---------------------------------------------------------------------------------------------
// (c) banco (READ ONLY, só se a coluna existir)
// ---------------------------------------------------------------------------------------------
async function sectionC() {
  if (!process.env.DATABASE_URL) {
    rec('SKIP', 'c:banco', 'DATABASE_URL ausente (rode com --env-file=.env.local)');
    return;
  }
  const { connect } = await import('./_dup-shared');
  const db = connect();
  try {
    await db.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY', async (tx) => {
      const cols = await tx<{ table_name: string }[]>`SELECT table_name FROM information_schema.columns WHERE column_name = 'vertical' AND table_name IN ('master_products','affiliate_offers')`;
      const has = new Set(cols.map((c) => c.table_name));
      if (!has.has('master_products')) {
        rec('SKIP', 'c:master-game-fora-de-games', "coluna master_products.vertical ainda não existe (esperado antes da 0027); a regra 'vertical<>games => product_type<>game' roda depois da migração");
        return;
      }
      const bad = await tx<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM master_products WHERE vertical <> 'games' AND product_type = 'game'`;
      rec(bad[0].n === 0 ? 'PASS' : 'FAIL', 'c:master-game-fora-de-games', `${bad[0].n} master(s) com vertical<>'games' e product_type='game'`);
      const nonGames = await tx<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM master_products WHERE vertical <> 'games'`;
      rec('PASS', 'c:info', `${nonGames[0].n} master(s) fora de games (informativo)`);
      if (has.has('affiliate_offers')) {
        const mism = await tx<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id WHERE o.vertical <> m.vertical`;
        rec(mism[0].n === 0 ? 'PASS' : 'FAIL', 'c:oferta-master-mesma-vertical', `${mism[0].n} oferta(s) com vertical diferente do master`);
      } else rec('FAIL', 'c:oferta-master-mesma-vertical', 'affiliate_offers.vertical não existe');
    });
  } finally {
    await db.end({ timeout: 5 });
  }
}

async function main() {
  sectionA();
  sectionB();
  await sectionC();
  const count = (l: Level) => results.filter((r) => r.level === l).length;
  for (const lvl of ['FAIL', 'WARN', 'SKIP'] as Level[]) {
    const rows = results.filter((r) => r.level === lvl);
    if (!rows.length) continue;
    console.log(`\n== ${lvl} (${rows.length}) ==`);
    for (const r of rows) console.log(`- [${r.id}] ${r.msg}`);
  }
  console.log(`\nPASS ${count('PASS')} | FAIL ${count('FAIL')} | WARN ${count('WARN')} | SKIP ${count('SKIP')}`);
  process.exit(count('FAIL') > 0 ? 1 : 0);
}
main().catch((e) => { console.error('ERRO do teste:', e instanceof Error ? e.message : e); process.exit(2); });
