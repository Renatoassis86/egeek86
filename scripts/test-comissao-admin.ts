/**
 * Testes da COMISSÃO PREVISTA (#62, só admin) e guarda de privacidade.
 *   npx tsx scripts/test-comissao-admin.ts   (código 1 se algo falhar)
 * A: cálculo puro e tabela. B: nada de comissão vaza para módulos públicos (imports e termos).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  TABELA, acumular, categoriaComissao, comissaoOferta, comissaoProduto, resumir, taxaPara, type CategoriaComissao,
} from '@/lib/admin-gestao/taxas-comissao';

let fails = 0;
const check = (n: string, ok: boolean, extra?: unknown) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FALHA'} ${n}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); };

function parteA() {
  console.log('--- A: cálculo ---');
  check('categorias por departamento', categoriaComissao('games', 'console') === 'consoles' && categoriaComissao('games', 'accessory') === 'acessorios-games' && categoriaComissao('games', 'game') === 'jogos' && categoriaComissao('livros', null) === 'livros' && categoriaComissao('xyz', null) === 'outros');
  const a = comissaoOferta('amazon', 'games', 'game', 20000);
  check('Amazon jogo R$200 = 8% = R$16,00, confirmada', a.taxa === 0.08 && a.cents === 1600 && a.confianca === 'confirmada', a);
  const l = comissaoOferta('amazon', 'livros', null, 5990);
  check('Amazon livro 10% arredonda', l.cents === 599, l);
  const s = comissaoOferta('shopee', 'games', 'accessory', 10000);
  check('Shopee games 3% estimada', s.cents === 300 && s.confianca === 'estimada', s);
  check('preço zero ou inválido = R$0', comissaoOferta('amazon', 'games', 'game', 0).cents === 0 && comissaoOferta('amazon', 'games', 'game', NaN).cents === 0);
  check('rede desconhecida = fallback estimado', taxaPara('kabum', 'jogos').confianca === 'estimada' && taxaPara('kabum', 'jogos').taxa === 0.03);
  const p = comissaoProduto([
    { precoCents: 30000, comissao: comissaoOferta('amazon', 'games', 'game', 30000) },
    { precoCents: 25000, comissao: comissaoOferta('shopee', 'games', 'game', 25000) },
    { precoCents: 28000, comissao: comissaoOferta('mercado-livre', 'games', 'game', 28000) },
  ]);
  check('produto: comissão da oferta de menor preço (Shopee 3% = 750)', p.menor?.cents === 750 && p.menor.rede === 'shopee', p.menor);
  check('produto: faixa min/máx de centavos e taxa', p.minCents === 750 && p.maxCents === 2400 && p.minTaxa === 0.03 && p.maxTaxa === 0.08 && p.ofertas === 3, p);
  check('produto sem ofertas', comissaoProduto([]).menor === null);
  const g = new Map();
  acumular(g, 'x', 20000, 1600, false, 1);
  acumular(g, 'x', 10000, 300, true, 1);
  const r = resumir(g)[0];
  check('agregado: taxa ponderada = 1900/30000 e 50% estimada', Math.abs((r.taxaMedia ?? 0) - 1900 / 30000) < 1e-9 && r.pctEstimada === 0.5 && r.ofertas === 2, r);
  const cats = new Set<CategoriaComissao>(TABELA.map((t) => t.categoria));
  const redes = [...new Set(TABELA.map((t) => t.rede))];
  check('tabela completa: toda rede tem toda categoria', redes.every((rd) => [...cats].every((c) => TABELA.some((t) => t.rede === rd && t.categoria === c))));
  check('toda taxa tem fonte, data e confiança válida, 0 < taxa <= 16%', TABELA.every((t) => t.fonte.length > 10 && /^\d{4}-\d{2}-\d{2}$/.test(t.data) && (t.confianca === 'confirmada' || t.confianca === 'estimada') && t.taxa > 0 && t.taxa <= 0.16));
  check('só Amazon é confirmada (demais dependem de login/credencial)', TABELA.filter((t) => t.confianca === 'confirmada').every((t) => t.rede === 'amazon'));
}

// ---------------------------------------------------------------- B: privacidade
const SRC = path.resolve('src');
const norm = (p: string) => p.split(path.sep).join('/');
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(norm(full));
  }
  return out;
}
const rel = (f: string) => f.slice(norm(SRC).length + 1);

/** Módulos ADMIN autorizados a importar/usar a métrica. */
const ADMIN_OK = [/^app\/admin\//, /^app\/api\/admin\//, /^components\/admin\//, /^lib\/admin-gestao\//, /^server\/queries\/admin-comissao\.ts$/];
const isAdmin = (r: string) => ADMIN_OK.some((re) => re.test(r));

/**
 * Arquivos que já falavam de comissão ANTES da #62 (aviso legal "podemos receber comissão", comentários, conversões reais
 * da rede para o admin, coletor Shopee). Nenhum calcula nem exibe a comissão PREVISTA. Arquivo novo com o termo = falha.
 */
const BASELINE = new Set([
  'app/(shop)/sobre/page.tsx', 'app/(shop)/termos/page.tsx', 'app/api/cron/discover-shopee-esporte/route.ts', 'app/go/[slug]/route.ts',
  'components/layout/admin-nav-links.tsx', 'components/legal/commission-notice.tsx', 'db/schema/affiliate_networks.ts', 'db/schema/affiliate_offers.ts',
  'db/schema/orders.ts', 'db/schema/sellers.ts', 'lib/affiliate/message-template.ts', 'lib/affiliate/shopee-cobertura.ts', 'lib/coupons/network-adapters.ts',
  'lib/coupons/page-read.ts', 'server/actions/affiliate.ts', 'server/affiliate-reports/ml-csv.ts', 'server/affiliate-reports/shopee-api.ts',
  'server/affiliate-reports/store.ts', 'server/affiliate-reports/types.ts', 'server/collector/collect-shopee-prices.ts', 'server/collector/discover-products.ts',
  'server/collector/discover-shopee-esporte.ts', 'server/collector/shopee-campaigns-core.ts', 'server/collector/shopee-campaigns.ts',
  'server/collector/sources/shopee-auth.ts', 'server/collector/sources/shopee.ts', 'server/queries/affiliate-clicks.ts', 'server/queries/affiliate-conversions.ts',
]);

/** Superfícies públicas / de mensagem: nem o termo pode aparecer em código (só nos textos legais e comentários da baseline). */
const PUBLICOS = [
  /^app\/\(shop\)\//, /^app\/\(detalhe\)\//, /^app\/g\//, /^app\/go\//, /^app\/api\/(produtos|search|health|monitoramento)\//, /^app\/(sitemap|robots)/,
  /^lib\/messaging\//, /^lib\/affiliate\/message-template\.ts$/, /^lib\/vitrines\//, /^lib\/search\//, /^server\/queries\/public-offers\.ts$/,
];
const LEGAL_OK = new Set(['app/(shop)/sobre/page.tsx', 'app/(shop)/termos/page.tsx', 'app/go/[slug]/route.ts', 'lib/affiliate/message-template.ts']);
const TERMO = /comiss|commission/i;
const IMPORT_ADMIN = /admin-gestao|admin-comissao|comissao-celula|taxas-comissao/;

function parteB() {
  console.log('--- B: privacidade ---');
  const files = walk(SRC).filter((f) => !/\.(test|spec)\./.test(f));
  const vazamentoImport: string[] = [];
  const novos: string[] = [];
  const publicosComTermo: string[] = [];
  for (const f of files) {
    const r = rel(f);
    const txt = fs.readFileSync(f, 'utf8');
    if (!isAdmin(r) && IMPORT_ADMIN.test(txt)) vazamentoImport.push(r);
    if (!isAdmin(r) && TERMO.test(txt) && !BASELINE.has(r)) novos.push(r);
    if (PUBLICOS.some((re) => re.test(r)) && TERMO.test(txt) && !LEGAL_OK.has(r)) publicosComTermo.push(r);
  }
  check('nenhum módulo fora do admin importa a métrica de comissão prevista', vazamentoImport.length === 0, vazamentoImport);
  check("nenhum arquivo novo fora do admin contém 'comissao'/'commission'", novos.length === 0, novos);
  check("superfícies públicas e de mensagem não contêm 'comissao'/'commission' (exceto aviso legal)", publicosComTermo.length === 0, publicosComTermo);
  for (const f of ['app/(shop)/sobre/page.tsx', 'app/(shop)/termos/page.tsx']) {
    const txt = fs.readFileSync(path.join(SRC, f), 'utf8');
    const linhas = txt.split('\n').filter((l) => TERMO.test(l));
    check(`${f}: só o aviso legal genérico, sem percentual`, linhas.every((l) => !/\d\s*%/.test(l)), linhas);
  }
  const msg = ['lib/messaging', 'lib/affiliate/message-template.ts'].flatMap((p) => {
    const full = path.join(SRC, p);
    return fs.existsSync(full) ? (fs.statSync(full).isDirectory() ? walk(full) : [norm(full)]) : [];
  });
  check('há módulos de mensagem Telegram varridos', msg.length > 0, msg.length);
  // Telegram/mensagens: nenhuma referência a taxa de comissão prevista.
  check('mensagens não leem a tabela de taxas', msg.every((f) => !IMPORT_ADMIN.test(fs.readFileSync(f, 'utf8'))));
  // A página/queries admin exigem admin.
  const pg = fs.readFileSync(path.join(SRC, 'app/admin/comissao/page.tsx'), 'utf8');
  check('página /admin/comissao chama requireAdmin', /await requireAdmin\(\)/.test(pg));
  const lay = fs.readFileSync(path.join(SRC, 'app/admin/layout.tsx'), 'utf8');
  check('layout do admin chama requireAdmin', /await requireAdmin\(\)/.test(lay));
  const q = fs.readFileSync(path.join(SRC, 'server/queries/admin-comissao.ts'), 'utf8');
  check("queries admin são 'server-only'", /^import 'server-only'/.test(q));
  const cel = fs.readFileSync(path.join(SRC, 'components/admin/comissao-celula.tsx'), 'utf8');
  check('componente de célula não importa banco', !/@\/lib\/db|server\/queries/.test(cel));
}

function main() {
  parteA();
  parteB();
  console.log(fails === 0 ? '\nTUDO OK' : `\n${fails} FALHA(S)`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
export {};
