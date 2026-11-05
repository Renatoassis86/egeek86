import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorRunsEnabled } from '@/server/collector/collector-runs';
import { sendTelegramMessage } from '@/server/notifications/send-telegram';
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

export async function loadHealthInput(now: Date): Promise<HealthInput> {
  const runRows = await db.execute<RunDbRow>(sql`
    SELECT job, network, started_at, finished_at, status, checked, errors, rate_limited, misses, price_confirmed, oldest_due_age_s
    FROM collector_runs
    WHERE started_at > now() - interval '8 days' AND job IN ('collect-prices', 'collect-shopee')
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
  const snapRows = await db.execute<{ h: Date; n: number }>(sql`
    SELECT date_trunc('hour', collected_at) AS h, count(*)::int AS n
    FROM affiliate_price_snapshots
    WHERE collected_at >= now() - interval '8 days'
    GROUP BY 1
  `);
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

  return {
    now,
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
