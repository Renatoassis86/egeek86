import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runInBgPool } from '@/lib/db/pool-context';
import { snapshotKey } from '@/server/queries/snapshot-store';
import { getMasterProductPriceStatsBatchRaw } from '@/server/queries/product-price-stats';
import { priceTableDataCached, getPriceTableProductCount, getPriceTableBadgeCounters } from '@/server/queries/price-table';
import { publicMetricsCached, getQuoteCount } from '@/server/queries/public-metrics';
import { overridesCached } from '@/server/queries/catalog-dimensions';
import { homeSearchCached } from '@/server/queries/home-search';
import { rankedOfferListCached, rankFeaturedOfferIdsCached } from '@/server/queries/affiliate';
import type { GamePlatformGen, ProductType } from '@/db/schema';
import { GAMES, verticalSql } from '@/lib/catalog/verticais';
import { mastersVisiveisCached } from '@/server/departamentos';
import { destaquesPlusCached } from '@/server/plus-destaques';
import { tiposPlusCached } from '@/server/plus-tipos';
import { DEPARTAMENTOS } from '@/lib/catalog/departamentos';
import { LOJAS_PLUS } from '@/lib/catalog/plus';
import { todasAsChaves } from '@/lib/vitrines';
import { atualizarTodasVitrines } from '@/server/vitrines';

/**
 * Recalcula o pré-cálculo persistido da vitrine (Fase 2; ata 2026-11-03-fase2-precalculo.md).
 * Reutiliza EXATAMENTE as funções de cálculo das telas (fonte única): nada aqui reimplementa fórmula.
 *  - `refreshProductStats`: estatística canônica por produto -> `product_price_stats`.
 *  - `refreshShowcase`: blocos da vitrine (contadores, rankings por filtro, tabela) -> `showcase_snapshot`.
 * Só ESCREVE nas duas tabelas derivadas; não toca em ofertas, cotações nem produtos.
 */

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? null : Number(v));

/** Uma linha do VALUES de `product_price_stats` (mesma ordem das colunas do INSERT). */
function statsValues(id: string, r: Row | undefined, payload: unknown) {
  return sql`(${id}::uuid, ${Number(r?.quote_count ?? 0)}, ${num(r?.avg_quote_count)}, ${num(r?.avg_cents)}, ${num(r?.raw_avg_cents)},
    ${num(r?.max_cents)}, ${num(r?.max_raw_cents)}, ${(r?.history_since as string | null) ?? null}::timestamptz, ${(r?.history_until as string | null) ?? null}::timestamptz,
    ${num(r?.history_days)}, ${num(r?.min_all)}, ${num(r?.min_1y)}, ${num(r?.min_3m)}, ${num(r?.median_cents)}, ${num(r?.dispersion_ratio)},
    ${num(r?.n_all)}, ${num(r?.raw_min)}, ${num(r?.floor_cents)}, ${num(r?.pf_median)}, ${JSON.stringify(payload)}::jsonb, now())`;
}

export async function persistStatsChunk(ids: string[]): Promise<void> {
  let agg: Row[] = [];
  const stats = await getMasterProductPriceStatsBatchRaw(ids, (rows) => {
    agg = rows;
  });
  const byId = new Map(agg.map((r) => [String(r.master_product_id), r]));
  const values = ids.map((id) => statsValues(id, byId.get(id), stats.get(id)));
  await db.execute(sql`
    INSERT INTO product_price_stats (master_product_id, quote_count, avg_quote_count, avg_cents, raw_avg_cents,
      max_cents, max_raw_cents, history_since, history_until, history_days, min_all, min_1y, min_3m, median_cents,
      dispersion_ratio, n_all, raw_min, floor_cents, pf_median, payload, computed_at)
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (master_product_id) DO UPDATE SET
      quote_count = EXCLUDED.quote_count, avg_quote_count = EXCLUDED.avg_quote_count, avg_cents = EXCLUDED.avg_cents,
      raw_avg_cents = EXCLUDED.raw_avg_cents, max_cents = EXCLUDED.max_cents, max_raw_cents = EXCLUDED.max_raw_cents,
      history_since = EXCLUDED.history_since, history_until = EXCLUDED.history_until, history_days = EXCLUDED.history_days,
      min_all = EXCLUDED.min_all, min_1y = EXCLUDED.min_1y, min_3m = EXCLUDED.min_3m, median_cents = EXCLUDED.median_cents,
      dispersion_ratio = EXCLUDED.dispersion_ratio, n_all = EXCLUDED.n_all, raw_min = EXCLUDED.raw_min,
      floor_cents = EXCLUDED.floor_cents, pf_median = EXCLUDED.pf_median, payload = EXCLUDED.payload, computed_at = now()
  `);
}

export interface StatsRefreshSummary {
  candidates: number;
  refreshed: number;
  failedChunks: number;
  elapsedMs: number;
  budgetExhausted: boolean;
}

/** Produtos com estatística ausente ou mais velha que `minAgeMs`, os mais antigos primeiro, até acabar o orçamento de tempo. */
export async function refreshProductStats(opts: { budgetMs: number; minAgeMs?: number; chunkSize?: number; concurrency?: number }): Promise<StatsRefreshSummary> {
  const started = Date.now();
  const minAgeSec = Math.round((opts.minAgeMs ?? 10 * 60_000) / 1000);
  const chunkSize = opts.chunkSize ?? 120;
  const concurrency = opts.concurrency ?? 2;
  const rows = await db.execute<{ id: string }>(sql`
    SELECT mp.id FROM master_products mp
    LEFT JOIN product_price_stats ps ON ps.master_product_id = mp.id
    WHERE ${verticalSql('mp', GAMES)} AND NOT (mp.attributes ? 'mergedInto')
      AND (ps.computed_at IS NULL OR ps.computed_at < now() - (${minAgeSec} * interval '1 second'))
    ORDER BY ps.computed_at ASC NULLS FIRST, mp.id
  `);
  const ids = rows.map((r) => r.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
  let next = 0;
  let refreshed = 0;
  let failedChunks = 0;
  let budgetExhausted = false;
  const worker = async () => {
    while (next < chunks.length) {
      if (Date.now() - started > opts.budgetMs) {
        budgetExhausted = true;
        return;
      }
      const chunk = chunks[next++];
      try {
        await runInBgPool(() => persistStatsChunk(chunk));
        refreshed += chunk.length;
      } catch (err) {
        failedChunks++;
        console.error('[refresh-snapshots] lote de estatística falhou:', err instanceof Error ? err.message : err);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { candidates: ids.length, refreshed, failedChunks, elapsedMs: Date.now() - started, budgetExhausted };
}

// ---------------------------------------------------------------------------------------------
// Blocos da vitrine
// ---------------------------------------------------------------------------------------------

interface Job {
  key: string;
  run: () => Promise<unknown>;
}

/** Fabricante -> gerações (espelha MAKERS de /ofertas) e gerações individuais dos chips. */
const MAKER_GENS: GamePlatformGen[][] = [
  ['switch_2', 'switch_1'],
  ['ps5', 'ps4'],
  ['xbox_series', 'xbox_one', 'xbox_360'],
];
const SINGLE_GENS: GamePlatformGen[] = ['switch_2', 'switch_1', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'xbox_360'];
const TYPES: ProductType[] = ['game', 'console', 'accessory'];
/** Quantos jobs do começo da lista são dependências dos demais (contadores): rodam antes e sozinhos. */
const HEAD_JOBS = 6;

/**
 * Lista dos blocos pré-calculados: as MESMAS perguntas (mesmas chaves) que as páginas fazem
 * (home, /ofertas com tipo/fabricante/geração, /tabela-de-precos). Pergunta fora da lista continua
 * funcionando: calcula ao vivo uma vez e grava o resultado (write-through em createPersistedQuery).
 */
export function showcaseJobs(): Job[] {
  const jobs: Job[] = [];
  const add = <A extends unknown[]>(q: { snapshotKeyFor: (...a: A) => string; refresh: (...a: A) => Promise<unknown> }, ...args: A) =>
    jobs.push({ key: snapshotKey(q.snapshotKeyFor(...args)), run: () => q.refresh(...args) });

  // 1) Exceções de dimensão (filtro de TODAS as consultas) e contadores: dependências primeiro.
  add(overridesCached);
  add(getPriceTableProductCount);
  add(getPriceTableBadgeCounters);
  add(getQuoteCount);
  add(publicMetricsCached);
  add(homeSearchCached);

  // 2) Tabela de preços (visões padrão das abas e filtros mais usados).
  const tableBase = { onlyBelowAvg: false, sortBy: 'name_asc' as const, limit: 40, offset: 0 };
  for (const t of TYPES) add(priceTableDataCached, { productType: t, ...tableBase });
  add(priceTableDataCached, { productType: 'game', gameFormat: 'physical', ...tableBase });
  add(priceTableDataCached, { productType: 'game', ...tableBase, onlyBelowAvg: true });

  // 3) Home (carrossel, prateleiras por geração).
  const sortBy = 'price_asc' as const;
  add(rankedOfferListCached, { sortBy, gameFormat: 'physical' });
  add(rankedOfferListCached, { sortBy });
  add(rankedOfferListCached, { sortBy, productType: 'console' });
  for (const g of SINGLE_GENS.slice(0, 6)) add(rankedOfferListCached, { sortBy, gameFormat: 'physical', gamePlatformGen: g });
  add(rankFeaturedOfferIdsCached, { gameFormat: 'physical' }, 30);

  // 4) /ofertas: tipo x (todas | fabricante | geração), mais os destaques de cada recorte.
  const genSets: Array<GamePlatformGen[] | undefined> = [undefined, ...MAKER_GENS, ...SINGLE_GENS.map((g) => [g])];
  for (const gens of genSets) {
    const g = gens ? { gamePlatformGen: gens } : {};
    add(rankedOfferListCached, { sortBy, ...g });
    add(rankFeaturedOfferIdsCached, { sortBy, ...g }, 12);
    for (const t of TYPES) {
      add(rankedOfferListCached, { sortBy, productType: t, ...g });
      add(rankFeaturedOfferIdsCached, { sortBy, productType: t, ...g }, 12);
    }
  }
  // 5) Layout e home que antes consultavam ao vivo: contagem por departamento (menu), faixas e atalhos das lojas Plus.
  for (const d of DEPARTAMENTOS) add(mastersVisiveisCached, d.slug);
  for (const l of LOJAS_PLUS) {
    add(destaquesPlusCached, l.dept);
    add(tiposPlusCached, l.dept);
  }
  // sem duplicatas (a mesma chave pode ter sido gerada por dois blocos)
  const seen = new Set<string>();
  return jobs.filter((j) => (seen.has(j.key) ? false : (seen.add(j.key), true)));
}

export interface ShowcaseRefreshSummary {
  total: number;
  due: number;
  refreshed: number;
  failed: Array<{ key: string; error: string }>;
  elapsedMs: number;
  budgetExhausted: boolean;
  timings: Array<{ key: string; ms: number }>;
}

/** Recalcula os blocos ausentes ou mais velhos que `minAgeMs` (ausentes e mais antigos primeiro), até acabar o orçamento. */
export async function refreshShowcase(opts: { budgetMs: number; minAgeMs?: number; concurrency?: number; force?: boolean }): Promise<ShowcaseRefreshSummary> {
  const started = Date.now();
  const jobs = showcaseJobs();
  const head = new Set(jobs.slice(0, HEAD_JOBS).map((j) => j.key));
  const minAgeMs = opts.minAgeMs ?? 10 * 60_000;
  const ages = new Map<string, number>();
  try {
    const rows = await db.execute<{ key: string; age: number }>(sql`
      SELECT key, EXTRACT(EPOCH FROM (now() - computed_at))::float AS age FROM showcase_snapshot
      WHERE key IN (${sql.join(jobs.map((j) => sql`${j.key}`), sql`, `)})
    `);
    for (const r of rows) ages.set(r.key, Number(r.age) * 1000);
  } catch (err) {
    console.error('[refresh-snapshots] não leu idades:', err instanceof Error ? err.message : err);
  }
  const due = jobs
    .filter((j) => opts.force || !ages.has(j.key) || (ages.get(j.key) ?? 0) >= minAgeMs)
    .sort((a, b) => (ages.get(b.key) ?? Infinity) - (ages.get(a.key) ?? Infinity));

  let next = 0;
  let refreshed = 0;
  let budgetExhausted = false;
  const failed: ShowcaseRefreshSummary['failed'] = [];
  const timings: ShowcaseRefreshSummary['timings'] = [];
  const concurrency = opts.concurrency ?? 2;
  const runOne = async (job: Job) => {
    const t = Date.now();
    try {
      await runInBgPool(() => job.run());
      refreshed++;
    } catch (err) {
      failed.push({ key: job.key.slice(0, 120), error: err instanceof Error ? err.message.slice(0, 160) : String(err) });
    }
    timings.push({ key: job.key.slice(0, 120), ms: Date.now() - t });
  };
  // Dependências (contadores) primeiro e em sequência: o publicMetrics lê o que elas acabaram de gravar.
  for (const job of jobs.filter((j) => head.has(j.key) && due.includes(j))) {
    if (Date.now() - started > opts.budgetMs) {
      budgetExhausted = true;
      break;
    }
    await runOne(job);
  }
  const rest = due.filter((j) => !head.has(j.key));
  const worker = async () => {
    while (next < rest.length) {
      if (Date.now() - started > opts.budgetMs) {
        budgetExhausted = true;
        return;
      }
      await runOne(rest[next++]);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { total: jobs.length, due: due.length, refreshed, failed, elapsedMs: Date.now() - started, budgetExhausted, timings };
}

// ---------------------------------------------------------------------------------------------
// Vitrines da nova home (checklist #7; R-49)
// ---------------------------------------------------------------------------------------------

export interface VitrinesRefreshSummary {
  total: number;
  ok: number;
  falhas: string[];
  elapsedMs: number;
  budgetExhausted: boolean;
}

/**
 * Grava o snapshot das 18 vitrines (`getVitrineCached.refresh` -> showcase_snapshot) para a primeira visita nunca esconder o bloco.
 * Pouca carga por construção: UMA leitura em lote do pool (cache em memória de 2 min dentro da instância; ~5 a 6 s medido), em
 * seguida só cálculo em memória e uma escrita por vitrine. Sequencial (concorrência 1), no pool 'bg', com orçamento de tempo:
 * estourou, para e devolve o que fez (as restantes ficam para o ciclo seguinte; o snapshot anterior continua valendo por até 24 h).
 * Falha de uma vitrine não impede as demais.
 */
export async function refreshVitrines(opts: { budgetMs: number }): Promise<VitrinesRefreshSummary> {
  const started = Date.now();
  const chaves = todasAsChaves();
  let ok = 0;
  const falhas: string[] = [];
  let budgetExhausted = false;
  for (const c of chaves) {
    if (Date.now() - started > opts.budgetMs) {
      budgetExhausted = true;
      break;
    }
    const r = await runInBgPool(() => atualizarTodasVitrines([c]));
    ok += r.ok;
    falhas.push(...r.falhas);
  }
  return { total: chaves.length, ok, falhas, elapsedMs: Date.now() - started, budgetExhausted };
}
