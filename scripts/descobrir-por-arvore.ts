/**
 * DESCOBERTA POR ÁRVORE DE CATEGORIA (fase 1 da cobertura total, 2026-11-16): DRY-RUN. Só LÊ a API oficial do Mercado Livre e o banco; NÃO grava nada
 * (nem master, nem oferta, nem cursor). Mostra quantos catálogos NOVOS a fonte "mais vendidos por categoria" traria para um departamento e quantos o
 * porteiro/identidade/duplicata barrariam, com o motivo de cada barra. A gravação (fase 2) só entra com a flag DESCOBERTA_ARVORE_ML=1 e o ok do dono.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/descobrir-por-arvore.ts --vertical eletrodomesticos --max-calls 150
 *
 * Opções: --vertical <dept> (padrão eletrodomesticos) | --max-calls N (padrão 150; cobra do orçamento diário da semeadura, 480/dia) |
 *         --profundidade N (padrão: a da área em areas.ts) | --max-categorias N (padrão 30) | --tendencias (1 chamada por categoria: palavras em alta) |
 *         --out-dir <pasta> (padrão backup/dados/descobrir-arvore-<ts>/).
 * Fluxo: /categories (árvore) -> escolhe categorias (sem peça/acessório/outros) -> /highlights (20 mais vendidos de cada) -> descarta o que o banco já
 * tem (0 chamadas) e o cache de 404 -> /products/{id} (detalhe) -> agrupa por segmento pelo domínio -> MESMO funil da semeadura (planSeed): item miúdo,
 * identidade forte, duplicata, /items (vendedor novo), porteiro. Domínio que nenhum segmento cobre = TIPO SEM SEMENTE (buraco por tipo).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { connect } from './_dup-shared';
import { segmentsOf, type NonGamesVertical } from '../src/lib/catalog/vertical/config';
import { normalizeTitleKey, type MlCatalogPayload } from '../src/lib/catalog/vertical/identity';
import { createMlClient, RateLimited } from '../src/lib/catalog/vertical/ml-api';
import { planSeed, type ExistingLookup, type SeedReport } from '../src/lib/catalog/vertical/seed-plan';
import { DAILY_CALL_CAP, dayKeySP, effectiveMaxCalls, isKnownNotFound, remainingOn, usedOn } from '../src/lib/catalog/vertical/seed-budget';
import { isVertical } from '../src/lib/catalog/verticais';
import { chargeOne, loadState, rememberNotFound } from './_semear-estado';
import { areaDe } from '../src/lib/catalog/cobertura/areas';
import { agruparPorSegmento, candidatosDeDestaques, coberturaDeDestaques, escolherCategorias, parseCategoria, termosDeTendencias, type CategoriaML } from '../src/lib/catalog/cobertura/arvore-ml';

const argv = process.argv.slice(2);
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (n: string) => argv.includes(n);
const VERTICAL = (opt('--vertical') ?? 'eletrodomesticos') as NonGamesVertical;
const MAX_CALLS = Number(opt('--max-calls') ?? 150);
const MAX_CATEGORIAS = Number(opt('--max-categorias') ?? 30);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(opt('--out-dir') ?? path.join('backup', 'dados', `descobrir-arvore-${stamp}`));
fs.mkdirSync(outDir, { recursive: true });
const log = (m: string) => {
  console.log(m);
  fs.appendFileSync(path.join(outDir, 'log.txt'), `${new Date().toISOString()} ${m}\n`, 'utf8');
};

async function main() {
  if (!isVertical(VERTICAL) || (VERTICAL as string) === 'games') throw new Error(`vertical inválida: ${VERTICAL}`);
  const area = areaDe(VERTICAL);
  const fonte = area?.fontes.ml;
  if (!fonte || fonte.raizes.length === 0) throw new Error(`área ${VERTICAL} sem raízes de categoria do ML em areas.ts (fonte por árvore não configurada)`);
  const profundidade = Number(opt('--profundidade') ?? fonte.profundidade);

  const state0 = loadState();
  const today = dayKeySP(new Date());
  const effective = effectiveMaxCalls(state0, today, MAX_CALLS, DAILY_CALL_CAP);
  log(`orçamento diário (${today}): usadas=${usedOn(state0, today)} restam=${remainingOn(state0, today, DAILY_CALL_CAP)} de ${DAILY_CALL_CAP}; este dry-run usa no máximo ${effective}`);
  if (effective <= 0) throw new Error('orçamento diário esgotado; 0 chamadas');

  const sql = connect();
  try {
    // Token: SELECT puro (dry-run nunca renova, pois renovar grava no banco).
    const rows = await sql`select value from system_config where key = 'mercado_livre_oauth' limit 1`;
    const v = rows[0]?.value as { accessToken?: string; expiresAt?: number } | undefined;
    if (!v?.accessToken || (v.expiresAt ?? 0) - Date.now() < 180_000) throw new Error('ML: token ausente ou perto de expirar; o dry-run não renova');
    const run = { runId: randomUUID(), startedAt: new Date().toISOString(), mode: 'dry-run' as const };
    const client = createMlClient({
      token: v.accessToken,
      maxCalls: effective,
      beforeCall: () => chargeOne(run, DAILY_CALL_CAP),
      onCall: (c) => log(`ML #${c.n}/${effective} ${c.endpoint} -> ${c.status} (${c.ms} ms)`),
    });
    const pausa = () => new Promise((r) => setTimeout(r, 350));
    const get = async (ep: string) => {
      const r = await client.get(ep);
      await pausa();
      return r;
    };

    // 1) Árvore: raízes e, se pedido, o nível seguinte só das maiores categorias.
    const arvore = new Map<string, CategoriaML>();
    for (const raiz of fonte.raizes) {
      const r = await get(`/categories/${raiz}`);
      const n = r.status === 200 ? parseCategoria(r.json) : null;
      if (n) arvore.set(n.id, n);
      else log(`categoria ${raiz}: HTTP ${r.status}`);
    }
    if (profundidade >= 2) {
      const nivel1 = escolherCategorias(arvore, fonte.raizes, { profundidade: 1, minAnuncios: fonte.minAnuncios });
      for (const c of nivel1.slice(0, 12)) {
        const r = await get(`/categories/${c.id}`);
        const n = r.status === 200 ? parseCategoria(r.json) : null;
        if (n) arvore.set(n.id, n);
      }
    }
    const categorias = escolherCategorias(arvore, fonte.raizes, { profundidade, minAnuncios: fonte.minAnuncios, max: MAX_CATEGORIAS });
    log(`categorias escolhidas: ${categorias.length} (profundidade ${profundidade}, mínimo ${fonte.minAnuncios} anúncios): ${categorias.map((c) => `${c.name}[${c.total}]`).join(' | ')}`);

    // 2) Destaques (20 mais vendidos por categoria) e, opcional, tendências.
    const origem = new Map<string, string>(); // catalogId -> categoria
    const tendencias: Record<string, string[]> = {};
    for (const c of categorias) {
      if (client.remaining() < 30) break; // reserva para detalhe + items
      const r = await get(`/highlights/MLB/category/${c.id}`);
      if (r.status !== 200) {
        log(`destaques ${c.id}: HTTP ${r.status}`);
        continue;
      }
      for (const d of candidatosDeDestaques(r.json)) if (!origem.has(d.id)) origem.set(d.id, c.name);
      if (flag('--tendencias') && client.remaining() > 40) {
        const t = await get(`/trends/MLB/${c.id}`);
        if (t.status === 200) tendencias[c.name] = termosDeTendencias(t.json, segmentsOf(VERTICAL).flatMap((s) => s.terms)).slice(0, 15);
      }
    }
    const ids = Array.from(origem.keys());
    log(`destaques: ${ids.length} catálogos únicos`);

    // 3) Já no banco / 404 conhecido (0 chamadas).
    const noBanco = new Set<string>();
    for (const r of await sql`select meli_catalog_id as id from master_products where meli_catalog_id = any(${ids}) union select external_ref from affiliate_offers where external_ref = any(${ids}) and seller_id is null`) noBanco.add(r.id as string);
    const now = new Date();
    const sv = new Set(ids.filter((i) => isKnownNotFound(state0, i, now)));
    const cob = coberturaDeDestaques(ids, noBanco, sv, area!.coberturaMinima);
    log(`cobertura dos mais vendidos: ${cob.noBanco} de ${cob.total} já no banco (${(cob.cobertura * 100).toFixed(1)}% dos que têm vendedor; meta ${(area!.coberturaMinima * 100).toFixed(0)}%) | 404 conhecido ${cob.semVendedorConhecido} | faltam ${cob.faltam} | alerta=${cob.alerta}`);

    // 4) Detalhe dos que faltam (1 chamada cada) para saber o domínio e os atributos.
    const faltam = ids.filter((i) => !noBanco.has(i) && !sv.has(i));
    const detalhes: MlCatalogPayload[] = [];
    let detalharParou: string | null = null;
    // Metade do que sobra vai para o detalhe e a outra metade para o /items do funil (1 chamada por candidato).
    const reservaFunil = Math.ceil(client.remaining() / 2);
    try {
      for (const id of faltam) {
        if (client.remaining() <= reservaFunil) {
          detalharParou = 'orcamento_de_chamadas';
          break;
        }
        const r = await get(`/products/${id}`);
        if (r.status === 200 && r.json?.id) detalhes.push(r.json as MlCatalogPayload);
        else log(`detalhe ${id}: HTTP ${r.status}`);
      }
    } catch (e) {
      if (e instanceof RateLimited) detalharParou = 'http_429';
      else throw e;
    }
    const grupos = agruparPorSegmento(VERTICAL, detalhes);
    log(`detalhados: ${detalhes.length} de ${faltam.length}${detalharParou ? ` (parou: ${detalharParou})` : ''}; em segmento existente: ${Array.from(grupos.porSegmento.values()).reduce((a, l) => a + l.length, 0)}; TIPO SEM SEMENTE: ${Array.from(grupos.semSegmento.values()).reduce((a, l) => a + l.length, 0)} (${Array.from(grupos.semSegmento.keys()).join(', ') || 'nenhum'})`);

    // 5) Mesmo funil da semeadura, por segmento (sem gravar).
    const titleRows = await sql<{ id: string; name: string }[]>`select id, name from master_products where (vertical <> 'games' or product_type in ('console', 'accessory')) and (attributes ->> 'mergedInto') is null`;
    const titles = new Map<string, { id: string; name: string }>();
    for (const r of titleRows) {
      const k = normalizeTitleKey(r.name);
      if (k && !titles.has(k)) titles.set(k, r);
    }
    const one = async (q: Promise<{ id: string; name: string }[]>) => (await q)[0] ?? null;
    const lookup: ExistingLookup = {
      byCatalogId: async (id) =>
        (await one(sql`select id, name from master_products where meli_catalog_id = ${id} limit 1`)) ??
        (await one(sql`select m.id, m.name from affiliate_offers o join master_products m on m.id = o.master_product_id where o.external_ref = ${id} and o.seller_id is null limit 1`)),
      byGtins: (g) => one(sql`select id, name from master_products where gtin in ${sql(g)} limit 1`),
      byIdentityKey: (k) => one(sql`select id, name from master_products where attributes -> 'vertical' ->> 'identityKey' = ${k} limit 1`),
      byTitleKey: async (k) => titles.get(k) ?? null,
    };
    const reports: SeedReport[] = [];
    for (const seg of segmentsOf(VERTICAL)) {
      const cands = grupos.porSegmento.get(seg.key);
      if (!cands?.length) continue;
      if (client.remaining() < 2) break;
      const rep = await planSeed(client, seg, lookup, {
        candidates: cands,
        candidatesPrefetched: true,
        candidatesLabel: 'arvore:destaques',
        isKnownNotFound: (id) => isKnownNotFound(state0, id, now),
        onNotFound: (id) => rememberNotFound(id),
        log: () => {},
      });
      reports.push(rep);
      log(`segmento ${seg.key}: candidatos ${cands.length} | planejados ${rep.plans.length} | revisão ${rep.reviews.length} | motivos ${JSON.stringify(rep.counts)}${rep.stoppedBecause ? ` | parou: ${rep.stoppedBecause}` : ''}`);
    }

    // 6) Resumo.
    const motivos: Record<string, number> = {};
    for (const r of reports) for (const [k, n] of Object.entries(r.counts)) motivos[k] = (motivos[k] ?? 0) + n;
    const novos = reports.reduce((a, r) => a + r.plans.length, 0);
    const resumo = {
      vertical: VERTICAL,
      geradoEm: new Date().toISOString(),
      modo: 'dry-run (nada gravado)',
      chamadasUsadas: client.used(),
      categorias: categorias.map((c) => ({ id: c.id, nome: c.path, anuncios: c.total })),
      destaquesUnicos: ids.length,
      cobertura: cob,
      detalhados: detalhes.length,
      naoDetalhados: faltam.length - detalhes.length,
      tiposSemSemente: Object.fromEntries(Array.from(grupos.semSegmento.entries()).map(([k, l]) => [k, l.map((p) => p.name?.slice(0, 70))])),
      novosPlanejados: novos,
      motivosDoFunil: motivos,
      novosPorSegmento: Object.fromEntries(reports.map((r) => [r.segment, r.plans.map((p) => ({ id: p.catalogId, nome: p.name.slice(0, 80), vendedoresNovos: p.sellers, menorPreco: p.priceMinCents != null ? p.priceMinCents / 100 : null }))])),
      tendencias,
      estimativaPorTodasAsCategorias: faltam.length > 0 && detalhes.length > 0 ? { taxaNovosPorDetalhado: Number((novos / detalhes.length).toFixed(3)), nota: 'extrapolação simples: novos/detalhados; calibrar com mais amostra' } : null,
    };
    fs.writeFileSync(path.join(outDir, 'resumo.json'), JSON.stringify(resumo, null, 2), 'utf8');
    log(`RESUMO: ${novos} catálogos novos seriam criados (de ${detalhes.length} detalhados; ${ids.length} destaques); ${client.used()} chamadas; saída ${outDir}`);
    log(`motivos do funil: ${JSON.stringify(motivos)}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(`FALHOU: ${(e as Error).message}`);
  process.exit(1);
});
