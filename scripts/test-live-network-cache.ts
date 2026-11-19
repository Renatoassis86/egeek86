/**
 * Equivalencia do cache de "redes vivas" (public-offers.ts, LIVE_NETWORK_CACHE): a lista de ofertas publicas (id, produto, preco)
 * tem de ser IDENTICA com a CTE original (cache off) e com a lista em memoria (cache on), em duas verticais. Toca o banco (so leitura).
 * npx tsx --conditions=react-server --env-file=.env.local scripts/test-live-network-cache.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { GAMES, type Vertical } from '../src/lib/catalog/verticais';
import { publicOffersCtes, primeLiveNetworks } from '../src/server/queries/public-offers';

let falhas = 0;
const ok = (c: boolean, msg: string) => { console.log(c ? 'OK  ' : 'FALHA', msg); if (!c) falhas++; };

async function listar(v: Vertical): Promise<string[]> {
  const rows = await db.execute<{ id: string; mp: string; p: number }>(sql`
    WITH ${publicOffersCtes(v)} SELECT id::text AS id, master_product_id::text AS mp, current_price_cents AS p FROM public_offers ORDER BY id`);
  return rows.map((r) => `${r.id}|${r.mp}|${r.p}`);
}

(async () => {
  for (const v of [GAMES, 'tecnologia' as Vertical]) {
    // As coletas gravam preco o tempo todo: compara com/sem cache em sequencia sem/com/sem. O resultado "com cache" tem de
    // coincidir com ALGUMA das duas leituras sem cache (a primeira ou a segunda); se as duas leituras sem cache ja diferem
    // entre si, e ruido de coleta e a comparacao usa a mais proxima.
    process.env.LIVE_NETWORK_CACHE = 'off';
    let t = Date.now();
    const sem1 = await listar(v);
    const msSem = Date.now() - t;
    const redes = await primeLiveNetworks(v);
    ok(redes !== null, `${v}: leitura das redes vivas ok (${redes?.length ?? 0} redes)`);
    process.env.LIVE_NETWORK_CACHE = 'on';
    t = Date.now();
    const com = await listar(v);
    const msCom = Date.now() - t;
    process.env.LIVE_NETWORK_CACHE = 'off';
    const sem2 = await listar(v);
    ok(sem1.length > 0, `${v}: ${sem1.length} ofertas publicas (sem cache ${msSem} ms, com cache ${msCom} ms)`);
    const dif = (a: string[], b: string[]) => { const sb = new Set(b); return a.filter((x) => !sb.has(x)).length + b.filter((x) => !new Set(a).has(x)).length; };
    const d1 = dif(sem1, com), d2 = dif(com, sem2), ruido = dif(sem1, sem2);
    console.log(`     diferencas: sem1-com=${d1} com-sem2=${d2} (ruido sem1-sem2=${ruido})`);
    ok(d1 === 0 || d2 === 0 || Math.max(d1, d2) <= ruido, `${v}: mesmas ofertas, produtos e precos com e sem cache (dentro do ruido de coleta)`);
  }
  // o texto SQL com cache nao varre as ofertas para achar redes (usa a lista); com cache off usa a CTE original
  process.env.LIVE_NETWORK_CACHE = 'off';
  const off = JSON.stringify(publicOffersCtes(GAMES));
  process.env.LIVE_NETWORK_CACHE = 'on';
  const on = JSON.stringify(publicOffersCtes(GAMES));
  ok(off !== on && off.includes('lo.created_at') && !on.includes('lo.created_at'), 'cache on troca a varredura pela lista; off mantem a CTE original');
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nOK: cache de redes vivas equivalente');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO', String(e.message ?? e).slice(0, 200)); process.exit(1); });
