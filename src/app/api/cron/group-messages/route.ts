import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { getGroupMessagesMode, isGroupMessagesEnabled } from '@/lib/messaging/group-config';
import { detectGroupCandidates, groupMessagesTableExists } from '@/server/messaging/group-offers';
import { expireStale, persistProposals, sendApprovedTelegram } from '@/server/messaging/group-queue';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron das mensagens para grupos. NÃO está no vercel.json (entra com autorização do dono).
 * - GROUP_MESSAGES_ENABLED ausente/desligado: não faz nada (nem lê o banco).
 * - Ligado: roda o detector, grava propostas (se a tabela existir) e expira as velhas.
 * - GROUP_MESSAGES_MODE=send: envia no Telegram UMA proposta já APROVADA por execução (limites e revalidação em sendApprovedTelegram).
 * Nunca envia proposta não aprovada. Nunca envia ao WhatsApp.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;

  if (!isGroupMessagesEnabled()) return NextResponse.json({ ok: true, skipped: 'GROUP_MESSAGES_ENABLED desligado' });
  const mode = getGroupMessagesMode();

  try {
    const expired = await expireStale();
    const detection = await detectGroupCandidates();
    const persisted = await persistProposals(detection);
    const summary: Record<string, unknown> = {
      ok: true,
      mode,
      tableExists: await groupMessagesTableExists(),
      expired,
      persisted,
      counts: detection.counts,
      warnings: detection.warnings,
    };
    if (mode === 'send') {
      const next = await db.execute<{ id: string }>(sql`
        SELECT id FROM group_messages WHERE channel = 'tg' AND status = 'aprovada' AND claimed_at IS NULL ORDER BY approved_at NULLS LAST, created_at LIMIT 1
      `).catch(() => []);
      summary.send = next[0] ? await sendApprovedTelegram(String(next[0].id)) : { outcome: 'nada aprovado para enviar' };
    }
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : 'erro' }, { status: 500 });
  }
}
