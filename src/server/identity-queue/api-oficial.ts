import 'server-only';
import { sql } from 'drizzle-orm';
import type { db as Db } from '@/lib/db';
import { meliItemIdFromUrl } from '@/lib/messaging/live-recheck';
import { runApiOficial, type ApiItem, type ApiRunResult, type FetchLike } from '@/lib/identity-queue/api-run';
import type { QueueAxis, QueueOption } from '@/lib/identity-queue/model';
import { applyInTx, drainRecalc, hasEvidenceColumns, type Exec } from '@/server/identity-queue/queue';

/**
 * R4 (ata 2026-11-11-time-identidade-itens): confirma na API OFICIAL do Mercado Livre os atributos das ofertas da fila de classificacao.
 * Amazon: a PA-API 5.0 NAO esta credenciada (sources/amazon.ts e stub; a coleta e assistida), entao nenhum item da Amazon e consultado aqui;
 * eles seguem pendentes sem evidencia e o relatorio os conta. Sem scraping.
 */
export const JOB = 'fila-api-oficial-ml';
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 40;
/** Teto de chamadas em 24 h (soma de collector_runs.checked deste job, dry-run incluso: a quota e gasta do mesmo jeito). Ajustavel por IDENTITY_API_DAILY_CAP. */
export const DEFAULT_DAILY_CAP = 1200;
/** Depois de um 429, o job nao consulta por este tempo. */
export const COOLDOWN_429_MIN = 60;
const REVISIT_DAYS = 7;

const rows = <T>(r: unknown) => r as unknown as T[];

interface SelRow { id: string; offer_id: string; axis: QueueAxis; options: QueueOption[]; understood: Record<string, unknown>; title: string; item: string | null; ref: string | null; url: string | null }

/** Itens pendentes de ofertas do ML, ainda nao consultados (ou ha mais de 7 dias) e sem decisao anterior da API (desfazer do dono e respeitado). */
export async function selectItems(exec: Exec, limit: number, withEvidenceColumns: boolean): Promise<{ items: ApiItem[]; semIdDoAnuncio: number }> {
  const filtros = withEvidenceColumns
    ? sql`AND (i.api_checked_at IS NULL OR i.api_checked_at < now() - ${REVISIT_DAYS} * interval '1 day')
          AND NOT EXISTS (SELECT 1 FROM identity_decisions d WHERE d.item_id = i.id AND d.decided_via = 'api_oficial')`
    : sql``;
  // Prioridade: consoles (chave_nd/confianca) primeiro; depois masters com mais itens em dispersao; depois o mais antigo.
  const r = rows<SelRow>(await exec.execute(sql`
    SELECT i.id::text AS id, i.offer_id::text AS offer_id, i.axis, i.options, i.understood, i.title,
           o.external_item_id AS item, o.external_ref AS ref, o.affiliate_url AS url
    FROM identity_review_items i
    JOIN affiliate_offers o ON o.id = i.offer_id
    JOIN affiliate_networks n ON n.id = o.network_id
    WHERE i.status = 'pending' AND n.slug = 'mercado-livre' AND o.status = 'active'
      ${filtros}
    ORDER BY (i.source IN ('chave_nd', 'confianca')) DESC, count(*) OVER (PARTITION BY i.master_id) DESC, i.created_at, i.id
    LIMIT ${limit * 3}`));
  const items: ApiItem[] = [];
  let semIdDoAnuncio = 0;
  for (const x of r) {
    const ml = x.item && /^MLB\d+$/.test(x.item) ? x.item : meliItemIdFromUrl(x.url);
    if (!ml) { semIdDoAnuncio++; continue; }
    items.push({ itemId: x.id, offerId: x.offer_id, mlItemId: ml, catalogRef: x.ref, title: x.title, axis: x.axis, options: x.options, understood: x.understood });
  }
  return { items, semIdDoAnuncio };
}

/** Chamadas ja gastas nas ultimas 24 h e se houve 429 dentro do cooldown. */
export async function quotaState(exec: Exec): Promise<{ usadas24h: number; em429: boolean }> {
  const r = rows<{ usadas: string | number; cooldown: boolean }>(await exec.execute(sql`
    SELECT COALESCE(sum(checked), 0) AS usadas,
           COALESCE(bool_or(meta->>'parou' = '429' AND started_at > now() - ${COOLDOWN_429_MIN} * interval '1 minute'), false) AS cooldown
    FROM collector_runs WHERE job = ${JOB} AND started_at > now() - interval '24 hours'`));
  return { usadas24h: Number(r[0]?.usadas ?? 0), em429: Boolean(r[0]?.cooldown) };
}

async function countAmazonPending(exec: Exec): Promise<number> {
  const r = rows<{ n: number }>(await exec.execute(sql`
    SELECT count(*)::int AS n FROM identity_review_items i JOIN affiliate_offers o ON o.id = i.offer_id JOIN affiliate_networks n ON n.id = o.network_id
    WHERE i.status = 'pending' AND n.slug = 'amazon'`));
  return Number(r[0]?.n ?? 0);
}

export interface ApiOficialParams { apply: boolean; limit: number }
export interface ApiOficialOutput {
  skipped?: 'em_cooldown_429' | 'teto_diario' | 'migracao_0043_pendente';
  quota?: { usadas24h: number; tetoDiario: number };
  semIdDoAnuncio?: number;
  amazon?: { pendentes: number; status: string };
  result?: ApiRunResult;
}

export function dailyCap(): number {
  const v = Number(process.env.IDENTITY_API_DAILY_CAP);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_DAILY_CAP;
}

export async function runFilaApiOficial(
  dbx: typeof Db,
  deps: { fetchImpl: FetchLike; token: () => Promise<string> },
  p: ApiOficialParams,
  budgetMs = 45_000
): Promise<ApiOficialOutput> {
  const started = Date.now();
  const exec = dbx as unknown as Exec;
  const hasCols = await hasEvidenceColumns(exec);
  // Gravar (apply) exige a 0043; o dry-run funciona sem ela (so le e consulta).
  if (p.apply && !hasCols) return { skipped: 'migracao_0043_pendente' };
  const q = await quotaState(exec);
  const cap = dailyCap();
  const quota = { usadas24h: q.usadas24h, tetoDiario: cap };
  if (q.em429) return { skipped: 'em_cooldown_429', quota };
  if (q.usadas24h >= cap) return { skipped: 'teto_diario', quota };

  const limit = Math.min(Math.max(1, Math.floor(p.limit)), MAX_LIMIT);
  const { items, semIdDoAnuncio } = await selectItems(exec, limit, hasCols);
  const maxCalls = Math.min(limit * 2, cap - q.usadas24h); // x2: cada item pode gastar 1 chamada extra no fallback do catalogo
  const result = await runApiOficial(items.slice(0, limit), {
    fetchImpl: deps.fetchImpl,
    token: deps.token,
    now: () => new Date(),
    saveEvidence: async (it, ev) => {
      await dbx.execute(sql`UPDATE identity_review_items SET api_evidence = ${JSON.stringify(ev)}::jsonb, api_checked_at = now() WHERE id = ${it.itemId}::uuid`);
    },
    applyVerdict: (it, value) => dbx.transaction((tx) => applyInTx(tx as unknown as Exec, { itemId: it.itemId, value, userId: null, via: 'api_oficial' })),
  }, { apply: p.apply, maxCalls, deadlineAt: started + budgetMs });

  if (p.apply && result.aplicados > 0) {
    try {
      await drainRecalc(dbx);
    } catch (e) {
      console.error('[fila-api-oficial] recalculo adiado:', e instanceof Error ? e.message : e);
    }
  }

  const erro = result.parou === '429' ? 'rate_limited' : null;
  try {
    const status = result.parou === 'fim' || result.parou === 'limite_de_chamadas' ? 'ok' : result.consultados > 0 ? 'partial' : 'error';
    await dbx.execute(sql`
      INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, selected, checked, offers_created, errors, meta)
      VALUES (${JOB}, 'mercado-livre', ${new Date(started).toISOString()}::timestamptz, now(), ${Date.now() - started}, ${status}, ${items.length}, ${result.chamadas}, 0, ${result.erros},
        ${JSON.stringify({ dry_run: !p.apply, parou: result.parou, erro, consultados: result.consultados, com_prova: result.comProva, aplicados: result.aplicados, sem_id_do_anuncio: semIdDoAnuncio })}::jsonb)`);
  } catch (e) {
    console.error('[fila-api-oficial] falha ao registrar collector_runs:', e instanceof Error ? e.message : e);
  }
  return {
    quota: { usadas24h: q.usadas24h + result.chamadas, tetoDiario: cap },
    semIdDoAnuncio,
    amazon: { pendentes: await countAmazonPending(exec).catch(() => 0), status: 'sem_api_configurada (PA-API 5.0 nao credenciada; coleta assistida)' },
    result,
  };
}
