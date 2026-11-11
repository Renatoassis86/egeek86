/**
 * Gera o documento do inventario do catalogo (leitura do banco; so SELECT). Decisao do dono, 2026-11-11.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/gerar-inventario-catalogo.ts
 * Escreve docs/inventario-catalogo/README.md (totais por loja, por rede e por departamento/tipo) e um CSV por loja
 * (docs/inventario-catalogo/<loja>.csv, UTF-8 com BOM). O inventario vivo e /admin/catalogo; este documento e o retrato
 * versionado do momento da geracao. Os CSVs do repositorio NAO levam o link de afiliado (coluna url_oferta_mais_barata vazia).
 */
import fs from 'node:fs';
import path from 'node:path';
import { VERTICALS } from '../src/lib/catalog/verticais';
import { CSV_BOM, LOJAS, cabecalhoCsv, linhaParaCsv, rotuloLoja, type LojaTotais } from '../src/lib/catalog/inventario';
import { carregarPorTipo, carregarTotaisLojas, iterarCatalogo } from '../src/server/queries/catalogo-inventario';

const OUT = path.resolve(process.cwd(), 'docs/inventario-catalogo');
const n = (x: number) => x.toLocaleString('pt-BR');
const p = (x: number | null) => (x == null ? '-' : `${x.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const brl = (c: number | null) => (c == null ? '-' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const agora = new Date();
  const totais = await carregarTotaisLojas();
  const porTipo = await carregarPorTipo();
  const opts = { omitirUrlOferta: true } as const;

  const linhasCsv: Record<string, number> = {};
  for (const v of VERTICALS) {
    let count = 0;
    const fd = fs.openSync(path.join(OUT, `${v}.csv`), 'w');
    fs.writeSync(fd, CSV_BOM + cabecalhoCsv(opts));
    for await (const bloco of iterarCatalogo(v)) {
      fs.writeSync(fd, bloco.map((l) => linhaParaCsv(l, opts)).join(''));
      count += bloco.length;
    }
    fs.closeSync(fd);
    linhasCsv[v] = count;
    console.log(`${v}: ${count} linhas`);
  }

  const T = LOJAS.map((l) => totais[l.slug]);
  const soma = (f: (t: LojaTotais) => number) => T.reduce((a, t) => a + f(t), 0);
  const L: string[] = [];
  L.push('# Inventario do catalogo por loja', '');
  L.push(`Gerado em ${agora.toISOString()} a partir do banco (somente leitura). Retrato do momento: o inventario vivo e a pagina **/admin/catalogo** (so admin), com historico diario dos ultimos 14 dias; este documento e os CSVs devem ser regenerados quando lojas, produtos ou fontes mudarem.`, '');
  L.push('Regerar: `npx tsx --conditions=react-server --env-file=.env.local scripts/gerar-inventario-catalogo.ts`', '');
  L.push('Definicoes: produto = master_product nao fundido; status = veredito do porteiro (sem veredito = aprovado); oferta ativa = status active, fora da quarentena de preco e com preco > 0; link oficial = Mercado Livre `https://meli.la/...`, demais redes link nao pendente; media unica = ultima linha de `price_daily_state` com media calculada (cada oferta vale 1 por dia). Nenhum dado e estimado ou preenchido.', '');
  L.push('## Totais por loja', '');
  L.push('| Loja | Aprovados | Em revisao | Rejeitados | Ofertas ativas | Link oficial | Aprovados com media | Faixa de preco | Ultima coleta |', '|---|---:|---:|---:|---:|---:|---:|---|---|');
  for (const t of T) {
    L.push(`| ${rotuloLoja(t.vertical)} | ${n(t.mastersAprovados)} | ${n(t.mastersRevisao)} | ${n(t.mastersRejeitados)} | ${n(t.ofertasAtivas)} | ${p(t.pctLinkOficial)} | ${p(t.pctComMedia)} | ${brl(t.menorPrecoCents)} a ${brl(t.maiorPrecoCents)} | ${t.ultimaColeta ?? '-'} |`);
  }
  L.push(`| **Total** | **${n(soma((t) => t.mastersAprovados))}** | **${n(soma((t) => t.mastersRevisao))}** | **${n(soma((t) => t.mastersRejeitados))}** | **${n(soma((t) => t.ofertasAtivas))}** | | | | |`, '');
  L.push('## Ofertas ativas por rede', '');
  L.push('| Loja | Mercado Livre | Shopee | Amazon | Outras |', '|---|---:|---:|---:|---:|');
  for (const t of T) L.push(`| ${rotuloLoja(t.vertical)} | ${n(t.ofertasMl)} | ${n(t.ofertasShopee)} | ${n(t.ofertasAmazon)} | ${n(t.ofertasOutras)} |`);
  L.push(`| **Total** | **${n(soma((t) => t.ofertasMl))}** | **${n(soma((t) => t.ofertasShopee))}** | **${n(soma((t) => t.ofertasAmazon))}** | **${n(soma((t) => t.ofertasOutras))}** |`, '');
  L.push('## Por departamento (tipo/segmento, produtos aprovados)', '');
  for (const l of LOJAS) {
    const rows = porTipo.filter((r) => r.vertical === l.slug);
    L.push(`### ${l.rotulo}`, '', '| Tipo/segmento | Produtos aprovados | Ofertas ativas |', '|---|---:|---:|');
    if (rows.length === 0) L.push('| (vazio) | 0 | 0 |');
    for (const r of rows) L.push(`| ${r.tipo} | ${n(r.masters)} | ${n(r.ofertas)} |`);
    L.push('');
  }
  L.push('## CSV por loja', '');
  for (const l of LOJAS) L.push(`- [${l.rotulo}](${l.slug}.csv) - ${n(linhasCsv[l.slug])} produtos (todos os status; coluna \`status_porteiro\`)`);
  L.push('', 'Os CSVs daqui nao trazem o link de afiliado da oferta mais barata (coluna vazia); o export completo, com o link, e `GET /api/admin/catalogo/export?loja=<slug>` (so admin) ou o botao CSV em /admin/catalogo.', '');
  fs.writeFileSync(path.join(OUT, 'README.md'), L.join('\n'), 'utf8');
  console.log('README.md escrito');
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
