/**
 * DRY-RUN HISTORICO do gatilho de preco-isca (Fluxo Mestre R-61). SOMENTE LEITURA. Mede, por limiar (razao) e minimo de vendedores,
 * quantas oferta-dia / ofertas / masters / redes seriam marcadas, e imprime amostra para julgar falso positivo.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/medir-preco-isca.ts [--razao 0.55] [--min 3] [--amostra 40] [--master <uuid>]
 *   --apply            grava as marcas HISTORICAS (origem 'historico') das cotacoes-isca com o criterio padrao (razao<0.5, >=3 vendedores) e refaz as linhas oferta-dia; backup NDJSON em docs/backups.
 *   --rollback <arq>   desfaz: apaga as marcas listadas no backup e restaura as linhas oferta-dia.
 * Base: price_daily_offer (menor preco do dia da oferta) x mediana por vendedor das OUTRAS ofertas do master nos ultimos 3 dias.
 */
import fs from 'node:fs';
import postgres from 'postgres';
import { ISCA_JANELA_REF_DIAS, avaliarIsca, type ReferenciaIsca } from '../src/lib/pricing/preco-isca';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const RAZOES = [0.3, 0.4, 0.5, 0.55, 0.6, 0.7];
const ALTAS = [0.5, 0.55, 0.6, 0.65];
const MINS = [2, 3, 4];
const RAZAO = Number(arg('--razao', '0.55'));
const MIN = Number(arg('--min', '3'));
const AMOSTRA = Number(arg('--amostra', '40'));
const MASTER = arg('--master', '');
const LO = Number(arg('--lo', '0'));
const SALTO = Number(arg('--salto', '1'));
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 5 });
const dayNum = (d: Date | string) => Math.floor(new Date(d).getTime() / 86400000);

const APPLY = process.argv.includes('--apply');
const RB = process.argv.indexOf('--rollback');

(async () => {
  if (RB > 0) {
    const L = fs.readFileSync(process.argv[RB + 1], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const ids = L.filter((l) => l.t === 'marca').map((l) => l.id as string);
    for (let i = 0; i < ids.length; i += 1000) await sql`DELETE FROM preco_isca_marcas WHERE snapshot_id = ANY(${ids.slice(i, i + 1000)}::bigint[]) AND origem = 'historico'`;
    let n = 0;
    for (const l of L.filter((x) => x.t === 'dia')) {
      const r = l.r;
      await sql`INSERT INTO price_daily_offer (offer_id, master_product_id, day, median_cents, last_cents, min_cents, max_cents, n_collected, last_observed_at, computed_at)
        VALUES (${r.offer_id}, ${r.master_product_id}, ${r.day}, ${r.median_cents}, ${r.last_cents}, ${r.min_cents}, ${r.max_cents}, ${r.n_collected}, ${r.last_observed_at}, ${r.computed_at})
        ON CONFLICT (offer_id, day) DO UPDATE SET median_cents = EXCLUDED.median_cents, last_cents = EXCLUDED.last_cents, min_cents = EXCLUDED.min_cents, max_cents = EXCLUDED.max_cents, n_collected = EXCLUDED.n_collected, last_observed_at = EXCLUDED.last_observed_at, computed_at = EXCLUDED.computed_at`;
      n++;
    }
    console.log(`rollback: ${ids.length} marcas apagadas, ${n} linhas oferta-dia restauradas`);
    await sql.end();
    return;
  }
  const rows = await sql<any[]>`
    SELECT d.offer_id::text oid, d.master_product_id::text mid, d.day, d.min_cents::bigint mn, d.median_cents::bigint md, o.seller_id::text sid, o.status::text st,
           (o.quarantined_at IS NOT NULL) q, n.slug rede, o.title, m.name mt
    FROM price_daily_offer d JOIN affiliate_offers o ON o.id = d.offer_id JOIN affiliate_networks n ON n.id = o.network_id JOIN master_products m ON m.id = d.master_product_id
    WHERE d.day >= '2026-10-24' ${MASTER ? sql`AND d.master_product_id = ${MASTER}::uuid` : sql``}`;
  console.log('offer-dias lidos:', rows.length);
  const porMaster = new Map<string, any[]>();
  for (const r of rows) (porMaster.get(r.mid) ?? porMaster.set(r.mid, []).get(r.mid)!).push({ ...r, dn: dayNum(r.day), mn: Number(r.mn), md: Number(r.md) });
  interface Hit { r: any; razao: number; med: number; nv: number }
  const hitsPor = new Map<string, Hit[]>();
  let avaliados = 0;
  for (const [, L] of porMaster) {
    const refsPool = L.filter((x) => x.sid && !x.q && x.st !== 'draft');
    if (new Set(refsPool.map((x) => x.sid)).size < 2) continue;
    for (const a of L) {
      const refs: ReferenciaIsca[] = [];
      for (const b of refsPool) if (b.oid !== a.oid && b.dn <= a.dn && b.dn >= a.dn - ISCA_JANELA_REF_DIAS) refs.push({ priceCents: b.md, sellerId: b.sid });
      avaliados++;
      for (const mn of MINS) for (const rz of RAZOES) {
        const v = avaliarIsca(a.mn, refs, { razaoMax: rz, razaoAlta: 0, minVendedores: mn });
        if (v.isca) { const k = `${rz}|${mn}`; (hitsPor.get(k) ?? hitsPor.set(k, []).get(k)!).push({ r: a, razao: v.razao!, med: v.medianaCents!, nv: v.vendedores }); }
      }
    }
  }
  console.log('offer-dias avaliaveis (>=2 vendedores de referencia no master):', avaliados);
  console.log('\n2o degrau (forte<0.5 + isolada), min 3:');
  const dd: Record<string, Set<string>> = {};
  const mm: Record<string, Set<string>> = {};
  const amostra2: any[] = [];
  for (const [, L] of porMaster) {
    const refsPool = L.filter((x) => x.sid && !x.q && x.st !== 'draft');
    if (new Set(refsPool.map((x) => x.sid)).size < 3) continue;
    for (const a of L) {
      const refs: ReferenciaIsca[] = [];
      for (const b of refsPool) if (b.oid !== a.oid && b.dn <= a.dn && b.dn >= a.dn - ISCA_JANELA_REF_DIAS) refs.push({ priceCents: b.md, sellerId: b.sid });
      for (const alta of ALTAS) {
        const v = avaliarIsca(a.mn, refs, { razaoMax: 0.5, razaoAlta: alta, minVendedores: 3 });
        if (v.isca) { (dd['alta' + alta] ??= new Set()).add(a.oid + '|' + a.day); (mm['alta' + alta] ??= new Set()).add(a.mid); }
        if (alta === 0.6 && v.degrau === 'isolada') amostra2.push({ a, v });
      }
    }
  }
  for (const k of Object.keys(dd).sort()) console.log(k, 'offer-dias', dd[k].size, 'masters', mm[k].size);
  amostra2.sort((x, y) => x.v.razao - y.v.razao);
  const passo = Math.max(1, Math.floor(amostra2.length / 25));
  console.log('amostra isolada (razao 0.5-0.6), 1 a cada', passo, 'de', amostra2.length);
  amostra2.filter((_, i) => i % passo === 0).forEach(({ a, v }) => console.log(a.rede.padEnd(13), (a.mn / 100).toFixed(2), 'vs med', (v.medianaCents / 100).toFixed(2), 'menor outro', (v.menorOutroCents / 100).toFixed(2), (v.razao * 100).toFixed(0) + '%', a.sid ? a.sid.slice(0, 6) : 'PLACEH', String(a.mt).slice(0, 55)));
  console.log('\nrazao  min | offer-dias | ofertas | masters | redes');
  for (const mn of MINS) for (const rz of RAZOES) {
    const h = hitsPor.get(`${rz}|${mn}`) ?? [];
    const redes: Record<string, number> = {};
    for (const x of h) redes[x.r.rede] = (redes[x.r.rede] ?? 0) + 1;
    console.log(`${String(rz).padEnd(5)}  ${mn}   | ${String(h.length).padStart(10)} | ${String(new Set(h.map((x) => x.r.oid)).size).padStart(7)} | ${String(new Set(h.map((x) => x.r.mid)).size).padStart(7)} | ${JSON.stringify(redes)}`);
  }
  if (APPLY) {
    const def = hitsPor.get('0.5|3') ?? [];
    console.log(`\nAPLICANDO historico: ${def.length} oferta-dias`);
    const arq = `docs/backups/preco-isca-historico-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
    const linhas: string[] = [];
    const porOferta = new Map<string, string[]>();
    let nMarcas = 0;
    const chaves = new Set(def.map((x) => x.r.oid + '|' + new Date(x.r.day).toISOString().slice(0, 10)));
    const oidsAll = [...new Set(def.map((x) => x.r.oid as string))];
    for (let i = 0; i < oidsAll.length; i += 500) {
      const dias = await sql<any[]>`SELECT * FROM price_daily_offer WHERE offer_id = ANY(${oidsAll.slice(i, i + 500)}::uuid[]) AND day >= '2026-10-24'`;
      for (const d of dias) if (chaves.has(d.offer_id + '|' + new Date(d.day).toISOString().slice(0, 10))) linhas.push(JSON.stringify({ t: 'dia', r: d }));
    }
    for (const x of def) {
      const dia = new Date(x.r.day).toISOString().slice(0, 10);
      const limite = Math.ceil(x.med * 0.5) ;
      const ins = await sql<{ id: string }[]>`
        INSERT INTO preco_isca_marcas (snapshot_id, offer_id, master_product_id, price_cents, mediana_ref_cents, razao, vendedores_ref, origem)
        SELECT s.id, s.offer_id, ${x.r.mid}::uuid, s.price_cents, ${Math.round(x.med)}::bigint, round(s.price_cents::numeric / ${x.med}::numeric, 4), ${x.nv}::int, 'historico'
        FROM affiliate_price_snapshots s
        WHERE s.offer_id = ${x.r.oid}::uuid AND (s.collected_at AT TIME ZONE 'America/Sao_Paulo')::date = ${dia}::date AND s.price_cents > 0 AND s.price_cents < ${limite}
        ON CONFLICT (snapshot_id) DO NOTHING RETURNING snapshot_id::text AS id`;
      for (const r of ins) linhas.push(JSON.stringify({ t: 'marca', id: r.id }));
      nMarcas += ins.length;
      (porOferta.get(x.r.oid) ?? porOferta.set(x.r.oid, []).get(x.r.oid)!).push(dia);
    }
    fs.writeFileSync(arq, linhas.join('\n') + '\n');
    console.log(`marcas gravadas: ${nMarcas}; backup: ${arq}; refazendo oferta-dia de ${porOferta.size} ofertas`);
    const { refazerOfertaDias } = await import('../src/server/pricing/preco-isca');
    let k = 0;
    for (const [oid, dias] of porOferta) { await refazerOfertaDias(oid, dias); if (++k % 100 === 0) console.log('  ofertas refeitas', k); }
    console.log('pronto. Rollback: --rollback', arq);
  }
  const h = (hitsPor.get(`${RAZAO}|${MIN}`) ?? []).filter((x) => x.razao >= LO).sort((a, b) => a.razao - b.razao);
  console.log(`\nAMOSTRA (razao<${RAZAO}, min ${MIN}) — ${h.length} offer-dias; ${AMOSTRA} piores, 1 por oferta:`);
  const vistos = new Set<string>();
  let k = 0;
  for (const x of h) {
    if (vistos.has(x.r.oid)) continue;
    vistos.add(x.r.oid);
    if (k++ % SALTO !== 0) continue;
    if (k > AMOSTRA * SALTO) break;
    console.log(`${x.r.rede.padEnd(13)} ${new Date(x.r.day).toISOString().slice(0, 10)} preco ${(x.r.mn / 100).toFixed(2)} vs mediana ${(x.med / 100).toFixed(2)} (${(x.razao * 100).toFixed(0)}%, ${x.nv} vend) seller=${x.r.sid ? x.r.sid.slice(0, 6) : 'PLACEHOLDER'} | ${String(x.r.mt).slice(0, 60)} | oferta: ${String(x.r.title).slice(0, 50)}`);
  }
  await sql.end();
})();
