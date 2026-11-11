import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { memberBrake, type AutomationState, type MemberBrake } from '@/lib/messaging/group-automation';
import { getAutomation } from '@/server/messaging/group-automation-store';
import { groupMessagesTableExists, groupMessagesV2Ready, loadAmazonLastRun } from '@/server/messaging/group-offers';
import { amazonLoopPaused } from '@/lib/messaging/group-rules';

type Row = Record<string, unknown>;

/** DTO serializável do cabeçalho de /admin/mensagens: estado da automação, freio, Amazon e contagens por status (24 h). */
export interface AutomationOverview {
  state: AutomationState;
  rowExists: boolean;
  updatedAt: string | null;
  maxMemberDropPct: number;
  v2Ready: boolean;
  members: Pick<MemberBrake, 'paused' | 'dropPct' | 'peak' | 'current' | 'stale' | 'points'>;
  amazon: { paused: boolean; lastRunAt: string | null };
  last24h: Record<string, number>;
  soundToday: number;
  sentToday: number;
  rechecked: { total: number; diverged: number };
}

export async function loadAutomationOverview(now = new Date()): Promise<AutomationOverview> {
  const automation = await getAutomation({ fresh: true });
  const table = await groupMessagesTableExists().catch(() => false);
  const v2 = table && (await groupMessagesV2Ready().catch(() => false));
  const amazonLast = await loadAmazonLastRun().catch(() => null);
  const base: AutomationOverview = {
    state: automation.state,
    rowExists: automation.rowExists,
    updatedAt: automation.updatedAt,
    maxMemberDropPct: automation.maxMemberDropPct,
    v2Ready: v2,
    members: { paused: false, dropPct: null, peak: null, current: null, stale: true, points: 0 },
    amazon: { paused: amazonLoopPaused(amazonLast, now), lastRunAt: amazonLast ? amazonLast.toISOString() : null },
    last24h: {},
    soundToday: 0,
    sentToday: 0,
    rechecked: { total: 0, diverged: 0 },
  };
  if (!v2) return base;
  try {
    const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const [byStatus, sound, pts, rc] = await Promise.all([
      db.execute<Row>(sql`SELECT status, count(*)::int AS n FROM group_messages WHERE channel = 'tg' AND created_at >= ${since}::timestamptz GROUP BY status`),
      db.execute<Row>(sql`
        SELECT count(*) FILTER (WHERE is_sound)::int AS snd, count(*)::int AS tot FROM group_messages
        WHERE channel = 'tg' AND status = 'enviada' AND sent_at >= ${since}::timestamptz`),
      db.execute<Row>(sql`SELECT counted_at, member_count FROM group_member_counts WHERE counted_at >= ${new Date(now.getTime() - 26 * 3600_000).toISOString()}::timestamptz ORDER BY counted_at`),
      db.execute<Row>(sql`
        SELECT count(*)::int AS total, count(*) FILTER (WHERE recheck_divergence_pct > 2)::int AS diverged FROM group_messages
        WHERE channel = 'tg' AND status = 'enviada' AND recheck_at IS NOT NULL AND sent_at >= ${since}::timestamptz`),
    ]);
    for (const r of byStatus) base.last24h[String(r.status)] = Number(r.n);
    base.soundToday = Number(sound[0]?.snd ?? 0);
    base.sentToday = Number(sound[0]?.tot ?? 0);
    base.members = memberBrake(
      pts.map((p) => ({ at: new Date(p.counted_at as string | Date), count: Number(p.member_count) })),
      now,
      automation.maxMemberDropPct
    );
    base.rechecked = { total: Number(rc[0]?.total ?? 0), diverged: Number(rc[0]?.diverged ?? 0) };
  } catch {
    // painel de leitura: nunca derruba a página
  }
  return base;
}
