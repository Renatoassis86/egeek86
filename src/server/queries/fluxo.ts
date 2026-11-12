import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { withTimeout } from '@/lib/cache/swr';
import { parseFilaExecucao, type Bloco, type FluxoSnapshot, type JobRow } from '@/lib/fluxo/modelo';

/**
 * Leitura do /admin/fluxo (somente leitura). Consultas leves e agregadas, uma por bloco, em sequencia (1 conexao por vez,
 * banco Micro). Cada bloco tem try/catch proprio: falha vira "indisponivel", nunca zero. Cache de 15 s em memoria com
 * single-flight (varios admins/abas nao multiplicam consultas).
 * Indices usados: collector_runs_started_idx, group_messages_status_created_idx, identity_review_items_pending_idx,
 * affiliate_offers_network_idx, product_price_stats_computed_at_idx, showcase_snapshot_computed_at_idx.
 */
const TTL_MS = 15_000;
const TETO_CONSULTA_MS = 8_000;

type Raw = Record<string, unknown>;
const int = (v: unknown): number => Number(v ?? 0) || 0;
const nInt = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const iso = (v: unknown): string | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

async function bloco<T>(nome: string, fn: () => Promise<T>): Promise<Bloco<T>> {
  try {
    return { ok: true, dados: await withTimeout(fn(), TETO_CONSULTA_MS, `fluxo:${nome}`) };
  } catch (e) {
    console.error(`[fluxo] bloco ${nome} falhou:`, e instanceof Error ? e.message : e);
    return { ok: false, erro: 'indisponível agora', dados: null };
  }
}

async function lerFila(): Promise<FluxoSnapshot['fila']> {
  try {
    const md = await readFile(path.join(process.cwd(), 'docs', 'fila-de-execucao.md'), 'utf8');
    const linhas = parseFilaExecucao(md);
    if (!linhas.length) return { ok: false, erro: 'tabela não encontrada em docs/fila-de-execucao.md (formato mudou?)', linhas: [] };
    return { ok: true, linhas };
  } catch {
    return { ok: false, erro: 'arquivo docs/fila-de-execucao.md indisponível neste ambiente', linhas: [] };
  }
}

async function montar(): Promise<FluxoSnapshot> {
  const jobs = await bloco('jobs', async () => {
    const rows = (await db.execute(sql`
      SELECT job, network,
             max(started_at) AS last_started,
             max(started_at) FILTER (WHERE status IN ('ok','partial')) AS last_ok,
             (array_agg(status ORDER BY started_at DESC))[1] AS last_status,
             (array_agg(duration_ms ORDER BY started_at DESC))[1] AS last_duration,
             (array_agg(checked ORDER BY started_at DESC))[1] AS checked,
             (array_agg(errors ORDER BY started_at DESC))[1] AS errors,
             (array_agg(rate_limited ORDER BY started_at DESC))[1] AS rate_limited,
             (array_agg(budget_exhausted ORDER BY started_at DESC))[1] AS budget_exhausted,
             (array_agg(stopped_because ORDER BY started_at DESC))[1] AS stopped_because,
             (array_agg(oldest_due_age_s ORDER BY started_at DESC))[1] AS oldest_due,
             count(*) AS runs,
             count(*) FILTER (WHERE status = 'error') AS errs,
             count(*) FILTER (WHERE status = 'running' AND started_at < now() - interval '10 minutes') AS stale
        FROM collector_runs
       WHERE started_at > now() - interval '24 hours'
       GROUP BY job, network
       ORDER BY job, network`)) as unknown as Raw[];
    const ult = (await db.execute(sql`SELECT max(started_at) AS m FROM collector_runs`)) as unknown as Raw[];
    const linhas: JobRow[] = rows.map((r) => ({
      job: String(r.job), network: r.network == null ? null : String(r.network),
      lastStartedAt: iso(r.last_started), lastOkAt: iso(r.last_ok), lastStatus: r.last_status == null ? null : String(r.last_status),
      lastDurationMs: nInt(r.last_duration), checked: nInt(r.checked), errors: nInt(r.errors), rateLimited: nInt(r.rate_limited),
      budgetExhausted: r.budget_exhausted == null ? null : Boolean(r.budget_exhausted),
      stoppedBecause: r.stopped_because == null ? null : String(r.stopped_because), oldestDueAgeS: nInt(r.oldest_due),
      runs24h: int(r.runs), errors24h: int(r.errs), runningStale: int(r.stale),
    }));
    return { linhas, totalRuns24h: linhas.reduce((a, l) => a + l.runs24h, 0), ultimoRegistroEm: iso(ult[0]?.m) };
  });

  const mensagens = await bloco('mensagens', async () => {
    const rows = (await db.execute(sql`
      SELECT status, count(*) AS n, min(created_at) AS antigo, max(created_at) AS recente,
             count(*) FILTER (WHERE status = 'enviando' AND claimed_at < now() - interval '10 minutes') AS presos
        FROM group_messages WHERE created_at > now() - interval '24 hours' GROUP BY status ORDER BY status`)) as unknown as Raw[];
    let ultima: string | null = null;
    for (const r of rows) { const t = iso(r.recente); if (t && (!ultima || t > ultima)) ultima = t; }
    return {
      porStatus: rows.map((r) => ({ status: String(r.status), n: int(r.n), maisAntigoEm: iso(r.antigo) })),
      enviandoPresos: rows.reduce((a, r) => a + int(r.presos), 0),
      ultimaCriadaEm: ultima,
    };
  });

  const classificacao = await bloco('classificacao', async () => {
    const r = ((await db.execute(sql`
      SELECT count(*) AS n, count(*) FILTER (WHERE snoozed_until > now()) AS adiadas, min(created_at) AS antigo
        FROM identity_review_items WHERE status = 'pending'`)) as unknown as Raw[])[0] ?? {};
    return { pendentes: int(r.n), adiadas: int(r.adiadas), maisAntigaEm: iso(r.antigo) };
  });

  const ofertas = await bloco('ofertas', async () => {
    const rows = (await db.execute(sql`
      SELECT n.slug AS rede,
             count(*) FILTER (WHERE o.status = 'draft') AS rascunhos,
             count(*) FILTER (WHERE o.status = 'active') AS ativas,
             count(*) FILTER (WHERE o.status = 'active' AND n.slug = 'mercado-livre' AND COALESCE(o.affiliate_url, '') NOT LIKE 'https://meli.la/%') AS ml_pend,
             count(*) FILTER (WHERE o.status = 'active' AND n.slug = 'amazon' AND o.last_price_confirmed_at > now() - interval '40 minutes') AS az_fresca,
             max(o.last_price_confirmed_at) FILTER (WHERE n.slug = 'amazon') AS az_ultima
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
       WHERE o.status IN ('draft','active') GROUP BY n.slug`)) as unknown as Raw[];
    const por = (slug: string): Raw => rows.find((r) => String(r.rede) === slug) ?? {};
    return {
      mlLinksPendentes: int(por('mercado-livre').ml_pend), mlAtivas: int(por('mercado-livre').ativas),
      rascunhos: rows.reduce((a, r) => a + int(r.rascunhos), 0),
      amazonAtivas: int(por('amazon').ativas), amazonFrescas40: int(por('amazon').az_fresca),
      amazonUltimaConfirmacaoEm: iso(por('amazon').az_ultima),
    };
  });

  const idleTx = await bloco('idleTx', async () => {
    const r = ((await db.execute(sql`
      SELECT count(*) AS n, max(extract(epoch FROM now() - xact_start)) AS longa
        FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction' AND pid <> pg_backend_pid()`)) as unknown as Raw[])[0] ?? {};
    return { n: int(r.n), maisLongaS: nInt(r.longa) };
  });

  const snapshots = await bloco('snapshots', async () => {
    const a = ((await db.execute(sql`SELECT max(computed_at) AS m FROM product_price_stats`)) as unknown as Raw[])[0] ?? {};
    const b = ((await db.execute(sql`SELECT min(computed_at) AS velho, max(computed_at) AS novo FROM showcase_snapshot`)) as unknown as Raw[])[0] ?? {};
    return { statsEm: iso(a.m), showcaseMaisAntigoEm: iso(b.velho), showcaseMaisRecenteEm: iso(b.novo) };
  });

  // Verificador automatico da regra "plataforma unknown": masters de games, nao fundidos, ainda 'unknown'.
  const plataformaDesconhecida = await bloco('plataforma', async () => {
    const r = ((await db.execute(sql`
      SELECT count(*) AS n FROM master_products m
       WHERE m.vertical = 'games' AND m.game_platform_gen::text = 'unknown' AND NOT (m.attributes ? 'mergedInto')`)) as unknown as Raw[])[0] ?? {};
    return { n: int(r.n) };
  });

  return {
    geradoEm: new Date().toISOString(),
    jobs, mensagens, classificacao, ofertas, idleTx, snapshots, plataformaDesconhecida,
    fila: await lerFila(),
  };
}

let cache: { at: number; v: FluxoSnapshot } | null = null;
let voo: Promise<FluxoSnapshot> | null = null;

export async function carregarFluxo(): Promise<FluxoSnapshot> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.v;
  if (!voo) {
    voo = montar().then((v) => { cache = { at: Date.now(), v }; return v; }).finally(() => { voo = null; });
  }
  return voo;
}
