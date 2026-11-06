/**
 * SOMENTE LEITURA (transacao READ ONLY). Valida a coleta por master (COLLECT_MASTER_GROUPING, ata 2026-11-06) contra
 * dados reais, sem gravar nada e sem chamar a API do Mercado Livre:
 *   1. Celeste PS4 (48f4279e) e RE3 (6813e83f): simula em memoria, sobre os snapshots reais das ofertas de vendedor, a
 *      serie que o agrupamento por master produziria (janela deslizante (padrao 180 min; os snapshots de um mesmo vendedor chegam ~1 por 40-60 min) = uma passada completa por todos os
 *      catalogos do master; o payload bruto por catalogo nao e guardado, entao e APROXIMACAO, nao substitui o piloto) e
 *      compara as reversoes A-B-A da serie gravada hoje com as da serie simulada.
 *   2. Estima chamadas de catalogo por ciclo antes/depois, com a mesma consulta de "ofertas devidas" do coletor.
 *
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/medir-agrupamento-master.ts [horas=72] [janela_min=180]
 */
import { connect } from './_dup-shared';
import { createCallBudget, masterCallCap } from '../src/lib/affiliate/master-consolidation';

const PILOTS = [
  { label: 'Celeste PS4', id: '48f4279e-d37a-4369-b8fe-499e81c461cb' },
  { label: 'RE3 PS5', id: '6813e83f-ef94-4b10-b54d-6e844c8a05b5' },
];
const WINDOW_MIN = Number(process.argv[3] ?? 180);
const hours = Number(process.argv[2] ?? 72);

const reversals = (xs: number[]) => {
  const c = xs.filter((v, i) => i === 0 || v !== xs[i - 1]); // colapsa repetidos consecutivos
  let r = 0;
  for (let i = 2; i < c.length; i++) if (c[i] === c[i - 2] && c[i] !== c[i - 1]) r++;
  return r;
};

async function main() {
  const sql = connect();
  try {
    await sql.begin(async (tx) => {
      await tx`SET TRANSACTION READ ONLY`;

      console.log(`== 1. Simulacao em memoria (ultimas ${hours} h, janela ${WINDOW_MIN} min) ==`);
      for (const p of PILOTS) {
        const offers = await tx<{ id: string; external_ref: string; status: string; ext: string | null }[]>`
          SELECT o.id, o.external_ref, o.status::text AS status, s.external_seller_id AS ext
          FROM affiliate_offers o LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
          WHERE o.master_product_id = ${p.id}::uuid AND o.seller_id IS NOT NULL AND o.status IN ('active','draft')
          ORDER BY o.external_ref, o.id`;
        const refs = new Set(offers.map((o) => o.external_ref));
        console.log(`\n${p.label} (${p.id.slice(0, 8)}): ${offers.length} ofertas de vendedor ativas/rascunho em ${refs.size} catalogos`);
        let legacyTotal = 0, simTotal = 0, oscLegacy = 0, oscSim = 0;
        for (const o of offers) {
          const snaps = await tx<{ price_cents: number; t: Date }[]>`
            SELECT price_cents, collected_at AS t FROM affiliate_price_snapshots
            WHERE offer_id = ${o.id}::uuid AND collected_at > now() - (${hours} || ' hours')::interval
            ORDER BY collected_at`;
          if (snaps.length < 3) continue;
          const prices = snaps.map((s) => s.price_cents);
          const times = snaps.map((s) => s.t.getTime());
          const sim: number[] = [];
          for (let i = 0; i < prices.length; i++) {
            if (times[i] - times[0] < WINDOW_MIN * 60_000) continue; // janela ainda incompleta
            let m = Infinity;
            for (let j = i; j >= 0 && times[i] - times[j] <= WINDOW_MIN * 60_000; j--) m = Math.min(m, prices[j]);
            sim.push(m);
          }
          const rl = reversals(prices), rs = reversals(sim);
          legacyTotal += rl; simTotal += rs;
          if (rl >= 3) oscLegacy++;
          if (rs >= 3) oscSim++;
          if (rl >= 3 || o.ext === '3003302367') {
            const distinct = [...new Set(prices)].sort((a, b) => a - b);
            console.log(`  oferta ${o.id.slice(0, 8)} vend ${o.ext} cat ${o.external_ref}: ${prices.length} snapshots, ${distinct.length} precos distintos [${distinct.slice(0, 6).join(', ')}], reversoes A-B-A gravado=${rl} simulado=${rs}, ultimo simulado=${sim.length ? sim[sim.length - 1] : 'n/a'}`);
          }
        }
        console.log(`  TOTAL reversoes A-B-A: gravado=${legacyTotal} -> simulado=${simTotal}; ofertas com 3+ reversoes: ${oscLegacy} -> ${oscSim}`);
      }

      console.log('\n== 2. Chamadas de catalogo por ciclo (estimativa com dados reais, mesma consulta do coletor) ==');
      const due = await tx<{ id: string; master_product_id: string; external_ref: string; network_id: string }[]>`
        SELECT o.id, o.master_product_id, o.external_ref, o.network_id
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
        WHERE o.status IN ('active','draft') AND n.slug = 'mercado-livre' AND o.external_ref IS NOT NULL
          AND (o.last_checked_at IS NULL OR o.last_checked_at < now() - CASE WHEN EXISTS (
                SELECT 1 FROM affiliate_price_watches w WHERE w.master_product_id = o.master_product_id AND w.is_active = true)
              THEN interval '5 minutes' ELSE interval '15 minutes' END)
        ORDER BY (EXISTS (SELECT 1 FROM affiliate_price_watches w WHERE w.master_product_id = o.master_product_id AND w.is_active = true)) DESC,
                 o.last_checked_at ASC NULLS FIRST
        LIMIT 150`;
      const total = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
        WHERE o.status IN ('active','draft') AND n.slug = 'mercado-livre' AND o.external_ref IS NOT NULL`;
      const all = await tx<{ master_product_id: string; external_ref: string }[]>`
        SELECT DISTINCT o.master_product_id, o.external_ref
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
        WHERE o.status IN ('active','draft') AND n.slug = 'mercado-livre' AND o.external_ref IS NOT NULL`;
      const catsByMaster = new Map<string, Set<string>>();
      for (const r of all) {
        if (!catsByMaster.has(r.master_product_id)) catsByMaster.set(r.master_product_id, new Set());
        catsByMaster.get(r.master_product_id)!.add(r.external_ref);
      }

      const legacyCalls = new Set(due.map((d) => d.external_ref)).size;
      const dueMasters = [...new Set(due.map((d) => d.master_product_id))];
      const refsAllMasters = new Set<string>();
      for (const m of dueMasters) for (const r of catsByMaster.get(m)!) refsAllMasters.add(r);
      console.log(`ofertas ML ativas/rascunho no total: ${total[0].n}; devidas agora (teto 150): ${due.length}`);
      console.log(`CICLO ATUAL (amostra): legado = ${legacyCalls} chamadas (catalogos distintos devidos); por master em TODOS os masters = ${refsAllMasters.size} chamadas (${dueMasters.length} masters) => ${(100 * (refsAllMasters.size / legacyCalls - 1)).toFixed(1)}% neste ciclo`);

      const D = new Set(all.map((a) => a.external_ref)).size;
      let S = 0, multi = 0, over5 = 0, maxCat = 0;
      for (const set of catsByMaster.values()) { S += set.size; if (set.size > 1) multi++; if (set.size > 5) over5++; maxCat = Math.max(maxCat, set.size); }
      console.log(`REGIME (por passada completa, cada oferta uma vez): legado = ${D} catalogos distintos; por master (todos) = ${S} => ${(100 * (S / D - 1)).toFixed(2)}% (so catalogos compartilhados por 2+ masters repetem, e o cache do ciclo deduplica os que caem no mesmo ciclo)`);
      console.log(`masters ML com oferta ativa/rascunho: ${catsByMaster.size}; com 2+ catalogos: ${multi}; com mais de 5: ${over5}; maximo: ${maxCat}`);

      for (const p of PILOTS) {
        const set = catsByMaster.get(p.id) ?? new Set();
        const dueHere = due.filter((d) => d.master_product_id === p.id);
        console.log(`PILOTO ${p.label}: ${set.size} catalogos ativos/rascunho; legado chamaria so os devidos neste instante (${new Set(dueHere.map((d) => d.external_ref)).size}); por master chama ${set.size} por passada (e carimba todas as irmas, entao os catalogos nao ficam devidos de novo no mesmo intervalo).`);
      }
      const pilotRefs = new Set<string>();
      for (const p of PILOTS) for (const r of catsByMaster.get(p.id) ?? []) pilotRefs.add(r);
      const cap = masterCallCap(pilotRefs.size);
      const b = createCallBudget(cap);
      console.log(`PILOTO (2 masters): ${pilotRefs.size} catalogos por passada; mesma quantidade que o legado faria por passada (cada catalogo e chamado uma vez a cada intervalo de 15 min nos dois modos) => 0% em regime; teto de ciclo = ${cap}; primeiro master sempre passa (reserva ok=${b.tryReserve([...pilotRefs])}).`);
    });
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
