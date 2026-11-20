import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorRunsEnabled } from '@/server/collector/collector-runs';
import { sendTelegramMessage } from '@/server/notifications/send-telegram';
import { SLO } from '@/lib/collector-runs/slo';
import { memoUsable, mergeHourly, nextMemo, type HourlyMemo } from '@/lib/collector-runs/hourly-memo';
import { readShowcase, writeShowcase } from '@/server/queries/snapshot-store';
import {
  evaluateHealth,
  formatAlertMessage,
  planNotifications,
  spDayOf,
  type Alert,
  type DayCloseState,
  type HealthInput,
  type RunRow,
} from '@/lib/collector-runs/health-eval';

/**
 * Avaliacao de saude do coletor (PROPOSTA; ata 2026-11-05). So LEITURA do banco. Envio ao Telegram so com
 * COLLECTOR_ALERTS=1 E TELEGRAM_ALERT_CHAT_ID definido; caso contrario devolve o que enviaria (modo "dry-run") e nao
 * escreve nada. Exige a migration 0025 e COLLECTOR_RUNS=1 (sem isso a rota responde "skipped").
 * Regras e limiares: src/lib/collector-runs/slo.ts e health-eval.ts (puros e testados).
 */
export function collectorAlertsEnabled(): boolean {
  return process.env.COLLECTOR_ALERTS === '1' && !!process.env.TELEGRAM_ALERT_CHAT_ID;
}

type RunDbRow = {
  job: string;
  network: string | null;
  started_at: Date;
  finished_at: Date | null;
  status: RunRow['status'];
  checked: number | null;
  errors: number | null;
  rate_limited: number | null;
  misses: number | null;
  price_confirmed: number | null;
  oldest_due_age_s: number | null;
};

const SNAP_JANELA_DIAS = 8;
const SNAP_MEMO_KEY = 'collector-health-snap-hourly-v1';

/**
 * Cotacoes gravadas por hora nos ultimos 8 dias. Antes: `count(*) GROUP BY hora` sobre ~3 M de linhas a cada rodada (~9 s, ~260 mil blocos/h).
 * Agora: horas fechadas vem do memo (showcase_snapshot) e so a cauda (da hora de corte em diante, ~2 h) e contada pelo indice de data.
 * `HEALTH_HOURLY_MEMO=off` volta a consulta completa. Memo ausente/invalido: consulta completa uma vez e grava o memo.
 */
async function cotacoesPorHora(): Promise<{ h: Date; n: number }[]> {
  const full = async () => (await db.execute<{ h: Date; n: number }>(sql`
    SELECT date_trunc('hour', collected_at) AS h, count(*)::int AS n
    FROM affiliate_price_snapshots
    WHERE collected_at >= now() - interval '8 days'
    GROUP BY 1
  `)).map((r) => ({ h: new Date(r.h), n: Number(r.n) }));
  if (/^(0|off|false)$/i.test((process.env.HEALTH_HOURLY_MEMO ?? '').trim())) return full();
  const now = new Date();
  try {
    const hit = await readShowcase<HourlyMemo>(SNAP_MEMO_KEY, 30 * 24 * 3_600_000);
    const memo = hit?.value ?? null;
    if (memoUsable(memo, now, SNAP_JANELA_DIAS)) {
      const tailRows = await db.execute<{ h: Date; n: number }>(sql`
        SELECT date_trunc('hour', collected_at) AS h, count(*)::int AS n
        FROM affiliate_price_snapshots
        WHERE collected_at >= ${memo.through}::timestamptz
        GROUP BY 1
      `);
      const series = mergeHourly(memo, tailRows.map((r) => ({ h: new Date(r.h).toISOString(), n: Number(r.n) })), now, SNAP_JANELA_DIAS);
      void writeShowcase(SNAP_MEMO_KEY, nextMemo(series, now, SNAP_JANELA_DIAS));
      return series.map((p) => ({ h: new Date(p.h), n: p.n }));
    }
  } catch (err) {
    console.error('[collector-health] memo por hora falhou, usando a consulta completa:', err instanceof Error ? err.message.slice(0, 120) : err);
  }
  const rows = await full();
  void writeShowcase(SNAP_MEMO_KEY, nextMemo(rows.map((r) => ({ h: r.h.toISOString(), n: r.n })), now, SNAP_JANELA_DIAS));
  return rows;
}

export async function loadHealthInput(now: Date): Promise<HealthInput> {
  const runRows = await db.execute<RunDbRow>(sql`
    SELECT job, network, started_at, finished_at, status, checked, errors, rate_limited, misses, price_confirmed, oldest_due_age_s
    FROM collector_runs
    WHERE started_at > now() - interval '8 days' AND job IN ('collect-prices', 'collect-shopee', 'amazon-assistida')
  `);
  const runs: RunRow[] = runRows.map((r) => ({
    job: r.job,
    network: r.network,
    startedAt: new Date(r.started_at),
    finishedAt: r.finished_at ? new Date(r.finished_at) : null,
    status: r.status,
    checked: r.checked ?? 0,
    errors: r.errors ?? 0,
    rateLimited: r.rate_limited ?? 0,
    misses: r.misses ?? 0,
    oldestDueAgeS: r.oldest_due_age_s,
  }));

  // Serie 1: cotacoes gravadas por hora (affiliate_price_snapshots; tem linha de base historica desde ja).
  const snapRows = await cotacoesPorHora();
  // Serie 2: confirmacoes de preco por hora (collector_runs; so tem linha de base depois de alguns dias com a flag).
  const confirmByHour = new Map<number, number>();
  for (const r of runRows) {
    const h = Math.floor(new Date(r.started_at).getTime() / 3_600_000) * 3_600_000;
    confirmByHour.set(h, (confirmByHour.get(h) ?? 0) + (r.price_confirmed ?? 0));
  }

  let dayClose: DayCloseState | null = null;
  if (process.env.PRICE_DAILY_SHADOW === '1') {
    const day = spDayOf(new Date(now.getTime() - 24 * 3_600_000));
    const rows = await db.execute<{ total: number; open: number }>(sql`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT closed)::int AS open
      FROM price_daily_state WHERE day = ${day}::date
    `);
    dayClose = { day, rowsTotal: rows[0]?.total ?? 0, rowsOpen: rows[0]?.open ?? 0 };
  }

  // Loops do Chrome: ultima gravacao concluida (ok/partial) por job, 3 dias de janela.
  const chromeJobs = SLO.chromeLoops.map((r) => r.job);
  const lastRows = await db.execute<{ job: string; last_at: Date | null }>(sql`
    SELECT job, max(COALESCE(finished_at, started_at)) AS last_at
    FROM collector_runs
    WHERE started_at > now() - interval '3 days' AND status IN ('ok', 'partial') AND job IN (${sql.join(chromeJobs.map((j) => sql`${j}`), sql`, `)})
    GROUP BY job
  `);
  const chromeLoops = chromeJobs.map((job) => {
    const r = lastRows.find((x) => x.job === job);
    return { job, lastAt: r?.last_at ? new Date(r.last_at) : null };
  });

  return {
    now,
    chromeLoops,
    runs,
    volumeSeries: [
      { name: 'cotacoes gravadas', points: snapRows.map((r) => ({ hour: new Date(r.h), n: r.n })) },
      { name: 'confirmacoes de preco', points: Array.from(confirmByHour, ([h, n]) => ({ hour: new Date(h), n })) },
    ],
    dayClose,
  };
}

export interface HealthReport {
  mode: 'dry-run' | 'send';
  alerts: Alert[];
  wouldSend: Alert[];
  wouldResolve: string[];
  sent: boolean;
  message: string | null;
}

export async function runCollectorHealth(opts: { now?: Date } = {}): Promise<HealthReport | { skipped: string }> {
  if (!collectorRunsEnabled()) return { skipped: 'COLLECTOR_RUNS desligada' };
  const now = opts.now ?? new Date();
  const alerts = evaluateHealth(await loadHealthInput(now));

  const stateRows = await db.execute<{ key: string; last_sent_at: Date | null; resolved_at: Date | null }>(sql`
    SELECT key, last_sent_at, resolved_at FROM collector_alert_state
  `);
  const plan = planNotifications(
    alerts,
    stateRows.map((s) => ({
      key: s.key,
      lastSentAt: s.last_sent_at ? new Date(s.last_sent_at) : null,
      resolvedAt: s.resolved_at ? new Date(s.resolved_at) : null,
    })),
    now
  );
  const message = plan.send.length || plan.resolve.length ? formatAlertMessage(plan.send, plan.resolve) : null;
  const report: HealthReport = {
    mode: collectorAlertsEnabled() ? 'send' : 'dry-run',
    alerts,
    wouldSend: plan.send,
    wouldResolve: plan.resolve,
    sent: false,
    message,
  };
  if (report.mode === 'dry-run' || !message) return report;

  const res = await sendTelegramMessage(process.env.TELEGRAM_ALERT_CHAT_ID!, message);
  if (!res.ok) {
    console.error('[collector-health] Telegram recusou:', res.description);
    return report;
  }
  report.sent = true;
  // Estado de dedup so e gravado depois do envio confirmado.
  try {
    for (const a of plan.send) {
      await db.execute(sql`
        INSERT INTO collector_alert_state (key, opened_at, last_sent_at, last_value, resolved_at)
        VALUES (${a.key}, now(), now(), ${JSON.stringify({ title: a.title, detail: a.detail })}::jsonb, NULL)
        ON CONFLICT (key) DO UPDATE SET last_sent_at = now(), resolved_at = NULL,
          opened_at = CASE WHEN collector_alert_state.resolved_at IS NOT NULL THEN now() ELSE collector_alert_state.opened_at END,
          last_value = EXCLUDED.last_value
      `);
    }
    for (const k of plan.resolve) {
      await db.execute(sql`UPDATE collector_alert_state SET resolved_at = now() WHERE key = ${k}`);
    }
  } catch (err) {
    console.error('[collector-health] estado de alerta nao gravado:', err instanceof Error ? err.message : err);
  }
  return report;
}
