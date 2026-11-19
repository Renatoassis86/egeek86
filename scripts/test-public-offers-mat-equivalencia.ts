/**
 * PROVA da migration 0069: `public_offers_mat` devolve as MESMAS ofertas e preços que a CTE `public_offers` (games, tecnologia, esporte, eletrodomesticos),
 * nenhuma oferta ativa pública fica de fora, e o memo da série de preços das mensagens devolve os MESMOS pontos.
 * Antes de comparar roda um refresco incremental (o mesmo do cron). Diferença só vale se a oferta mudou DEPOIS do início desse refresco (coleta no
 * intervalo); essas ficam documentadas na saída e o teste ainda falha se qualquer diferença for de oferta parada. Consultas leves (uma por vez).
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { primePublicOffersMat, publicOffersCtes, publicOffersMatOn } from '@/server/queries/public-offers';
import { refreshPublicOffersMat } from '@/server/jobs/public-offers-mat';
import { loadSeries } from '@/server/messaging/group-offers';
import type { Vertical } from '@/lib/catalog/verticais';

type P = { id: string; p: string };
let falhas = 0;
const ok = (c: boolean, msg: string) => { console.log(`${c ? 'OK   ' : 'FALHA'} ${msg}`); if (!c) falhas++; };

(async () => {
  await db.execute(sql`SET statement_timeout = '60s'`);
  const run = await refreshPublicOffersMat({ budgetMs: 100_000 });
  ok(run.ok, `refresco incremental ok (${run.ms} ms, produtos sujos ${run.dirtyMasters}, upserts ${run.upserts}, deletes ${run.deletes}) ${run.erro ?? ''}`);
  const [{ t }] = await db.execute<{ t: string }>(sql`SELECT (SELECT ts FROM public_offers_mat_meta WHERE key='wm')::text AS t`);
  const ready = await primePublicOffersMat();
  ok(publicOffersMatOn(), 'flag PUBLIC_OFFERS_MAT ligada por padrão');

  for (const v of ['games', 'tecnologia', 'esporte', 'eletrodomesticos'] as Vertical[]) {
    ok(ready.has(v), `${v}: tabela pronta para leitura`);
    const live = await db.execute<P>(sql`WITH ${publicOffersCtes(v, { forceLive: true })} SELECT id::text AS id, current_price_cents::text AS p FROM public_offers`);
    const mat = await db.execute<P>(sql`WITH ${publicOffersCtes(v)} SELECT id::text AS id, current_price_cents::text AS p FROM public_offers`);
    const L = new Map(live.map((r) => [r.id, r.p]));
    const M = new Map(mat.map((r) => [r.id, r.p]));
    const faltam = [...L.keys()].filter((i) => !M.has(i));
    const sobram = [...M.keys()].filter((i) => !L.has(i));
    const preco = [...L.keys()].filter((i) => M.has(i) && M.get(i) !== L.get(i));
    const dif = [...new Set([...faltam, ...sobram, ...preco])];
    let sem = 0;
    if (dif.length) {
      const r = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM affiliate_offers WHERE id IN (${sql.join(dif.map((d) => sql`${d}::uuid`), sql`, `)}) AND updated_at < ${t}::timestamptz - interval '2 minutes'`);
      sem = Number(r[0]?.n ?? 0);
    }
    console.log(`     ${v}: CTE=${L.size} tabela=${M.size} | faltam=${faltam.length} sobram=${sobram.length} preco_diferente=${preco.length} (mudaram no intervalo: ${dif.length - sem}; sem explicacao: ${sem})`);
    ok(sem === 0, `${v}: mesmos ids e preços (diferenças só por coleta no intervalo)`);
    ok(faltam.length - Math.min(faltam.length, dif.length - sem) <= 0 || sem === 0, `${v}: nenhuma oferta ativa pública ficou fora`);
  }

  // Série de preços (memo): mesmos pontos com e sem memo.
  const ids = (await db.execute<{ id: string }>(sql`SELECT DISTINCT master_product_id::text AS id FROM price_daily_offer WHERE day >= current_date - 10 LIMIT 5`)).map((r) => r.id);
  const today = new Date().toISOString().slice(0, 10);
  process.env.GRUPO_SERIE_MEMO = 'off';
  const sem = await loadSeries(ids, today, 'off' as never);
  process.env.GRUPO_SERIE_MEMO = 'on';
  const a = await loadSeries(ids, today, 'off' as never); // enche o memo
  const b = await loadSeries(ids, today, 'off' as never); // lê do memo
  const j = (m: Map<string, unknown>) => JSON.stringify([...m.entries()].sort((x, y) => x[0].localeCompare(y[0])));
  ok(j(sem) === j(a) && j(a) === j(b), `série de preços: mesmos pontos sem memo, no 1º uso e vindos do memo (${ids.length} produtos, ${[...b.values()].reduce((s, e) => s + e.main.length + e.amazon.length, 0)} pontos)`);

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO', e instanceof Error ? e.message : e); process.exit(1); });
