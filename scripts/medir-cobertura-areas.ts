/**
 * MEDIDOR DE COBERTURA POR ÁREA (fase 1 da cobertura total, 2026-11-16). SOMENTE LEITURA (SELECT + opcionalmente a API oficial do ML).
 * Por departamento: ofertas por rede e status, masters por veredito, masters sem oferta ativa, masters aprovados por rede, profundidade por TIPO
 * (masters por segmento de semeadura; segmento raso = buraco), quem semeia (collector_runs das 72 h) e, com --destaques N, a cobertura dos mais
 * vendidos do ML (N categorias de nível 1 por área). Acende ALERTA quando a cobertura de destaques fica abaixo da meta da área (areas.ts).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/medir-cobertura-areas.ts [--destaques 4] [--out docs/cobertura-total-2026-11-16/medicao-areas.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { SEGMENTS } from '../src/lib/catalog/vertical/config';
import { AREAS, areaDe } from '../src/lib/catalog/cobertura/areas';
import { candidatosDeDestaques, coberturaDeDestaques, escolherCategorias, parseCategoria, type CategoriaML } from '../src/lib/catalog/cobertura/arvore-ml';

const argv = process.argv.slice(2);
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DESTAQUES = Number(opt('--destaques') ?? 0);
const OUT = opt('--out');
/** Segmento com menos masters aprovados que isto é "raso" (a semeadura por termo saturou antes de cobrir o tipo). */
const RASO = 30;

async function main() {
  const sql = connect();
  const out: any = { geradoEm: new Date().toISOString(), modo: 'somente leitura', areas: {} as Record<string, any>, alertas: [] as string[] };
  try {
    const ofertas = await sql`select o.vertical, n.slug rede, o.status, count(*)::int n from affiliate_offers o join affiliate_networks n on n.id = o.network_id group by 1, 2, 3`;
    const masters = await sql`select vertical, coalesce(attributes->'catalogGate'->>'verdict', 'sem') v, count(*)::int n from master_products group by 1, 2`;
    const semOferta = await sql`select m.vertical, count(*)::int n from master_products m where not exists (select 1 from affiliate_offers o where o.master_product_id = m.id and o.status = 'active') group by 1`;
    const porSeg = await sql`select vertical, coalesce(attributes->'vertical'->>'segment', '(sem segmento)') seg, count(*) filter (where attributes->'catalogGate'->>'verdict' = 'approved')::int aprovados, count(*)::int total from master_products where vertical <> 'games' group by 1, 2`;
    const jobs = await sql`select job, count(*)::int n, max(started_at) ultimo from collector_runs where started_at > now() - interval '72 hours' and (job like 'semear-vertical%' or job like 'cobertura-%' or job like 'discover-%' or job = 'amazon-assistida') group by 1`;
    const criadosPorDia = await sql`select vertical, (created_at at time zone 'America/Sao_Paulo')::date d, count(*)::int n from master_products where vertical <> 'games' and created_at > now() - interval '7 days' group by 1, 2 order by 2, 1`;

    for (const a of AREAS) {
      const d = a.departamento;
      const of = ofertas.filter((r) => r.vertical === d);
      const ativas = (rede: string) => of.filter((r) => r.rede === rede && r.status === 'active').reduce((s, r) => s + r.n, 0);
      const m = (v: string) => masters.filter((r) => r.vertical === d && r.v === v).reduce((s, r) => s + r.n, 0);
      const segs = porSeg.filter((r) => r.vertical === d);
      const definidos = SEGMENTS.filter((s) => s.vertical === d).map((s) => s.key);
      const rasos = definidos
        .map((k) => ({ segmento: k, aprovados: segs.find((r) => r.seg === k)?.aprovados ?? 0, mastersNoSegmento: segs.find((r) => r.seg === k)?.total ?? 0 }))
        .filter((s) => s.aprovados < RASO)
        .sort((x, y) => x.aprovados - y.aprovados);
      out.areas[d] = {
        rotulo: a.rotulo,
        ofertasAtivas: { ml: ativas('mercado-livre'), amazon: ativas('amazon'), shopee: ativas('shopee') },
        masters: { aprovados: m('approved'), emRevisao: m('review'), rejeitados: m('rejected') },
        mastersSemOfertaAtiva: semOferta.find((r) => r.vertical === d)?.n ?? 0,
        segmentosDefinidos: definidos.length,
        segmentosRasos: { limiteAprovados: RASO, quantos: rasos.length, lista: rasos.slice(0, 25) },
        mastersCriadosUltimos7Dias: criadosPorDia.filter((r) => r.vertical === d).map((r) => [String(r.d instanceof Date ? r.d.toISOString().slice(0, 10) : r.d).slice(0, 10), r.n]),
      };
      if (d !== 'games' && rasos.length / Math.max(1, definidos.length) > 0.5) out.alertas.push(`${d}: ${rasos.length} de ${definidos.length} tipos com menos de ${RASO} masters aprovados`);
    }
    out.semeadura = jobs.map((j) => ({ job: j.job, execucoes72h: j.n, ultimo: j.ultimo }));
    const semeiaServidor = jobs.filter((j) => String(j.job).startsWith('semear-vertical:')).map((j) => String(j.job).split(':')[1]);
    for (const a of AREAS) if (a.departamento !== 'games' && a.departamento !== 'impressao3d' && !semeiaServidor.includes(a.departamento)) out.alertas.push(`${a.departamento}: nenhuma execução da semeadura de servidor nas últimas 72 h`);

    if (DESTAQUES > 0) {
      const r0 = await sql`select value from system_config where key = 'mercado_livre_oauth' limit 1`;
      const v = r0[0]?.value as { accessToken?: string; expiresAt?: number } | undefined;
      if (!v?.accessToken || (v.expiresAt ?? 0) - Date.now() < 180_000) throw new Error('ML: token ausente ou perto de expirar; o medidor não renova');
      let calls = 0;
      const get = async (ep: string) => {
        calls++;
        const res = await fetch(`https://api.mercadolibre.com${ep}`, { headers: { Authorization: `Bearer ${v.accessToken}` } });
        const json = await res.json().catch(() => null);
        await new Promise((r) => setTimeout(r, 400));
        if (res.status === 429) throw new Error('HTTP 429: parando');
        return { status: res.status, json };
      };
      const known = new Set<string>();
      for (const r of await sql`select meli_catalog_id as id from master_products where meli_catalog_id is not null union select external_ref from affiliate_offers where external_ref like 'MLB%' and seller_id is null`) known.add(r.id as string);
      for (const a of AREAS) {
        const f = a.fontes.ml;
        if (!f?.destaques || f.raizes.length === 0) continue;
        const arvore = new Map<string, CategoriaML>();
        for (const raiz of f.raizes) {
          const r = await get(`/categories/${raiz}`);
          const n = r.status === 200 ? parseCategoria(r.json) : null;
          if (n) arvore.set(n.id, n);
        }
        const cats = escolherCategorias(arvore, f.raizes, { profundidade: 1, minAnuncios: f.minAnuncios, max: DESTAQUES });
        const ids: string[] = [];
        for (const c of cats) {
          const r = await get(`/highlights/MLB/category/${c.id}`);
          if (r.status === 200) ids.push(...candidatosDeDestaques(r.json).map((x) => x.id));
        }
        const cob = coberturaDeDestaques(ids, known, new Set(), a.coberturaMinima);
        out.areas[a.departamento].destaquesML = { categorias: cats.map((c) => c.name), ...cob, meta: a.coberturaMinima };
        if (cob.alerta) out.alertas.push(`${a.departamento}: só ${(cob.cobertura * 100).toFixed(1)}% dos mais vendidos do ML estão no banco (meta ${(a.coberturaMinima * 100).toFixed(0)}%)`);
      }
      out.chamadasML = calls;
    }
    void areaDe;
  } finally {
    await sql.end({ timeout: 5 });
  }
  const json = JSON.stringify(out, null, 2);
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUT), json, 'utf8');
  }
  console.log(json);
}

main().catch((e) => {
  console.error(`FALHOU: ${(e as Error).message}`);
  process.exit(1);
});
