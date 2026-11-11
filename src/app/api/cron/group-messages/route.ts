import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { isGroupMessagesEnabled } from '@/lib/messaging/group-config';
import { runGroupMessagesCycle } from '@/server/messaging/group-auto';
import { renderHistoryCard } from '@/server/messaging/price-card';
import { lookupVerifiedCoupon } from '@/server/messaging/coupon-lookup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron das mensagens para grupos. NÃO está no vercel.json (o dono agenda; sugestão a cada 5 minutos).
 *
 * Duas travas, as duas precisam estar abertas para ENVIAR:
 *  1. ambiente: GROUP_MESSAGES_ENABLED ligado (e GROUP_MESSAGES_MODE=send, token e chat id para enviar);
 *  2. automação: linha 'group_messages_auto' de feature_flags (off | shadow | on; sem linha = off), lida com cache de 30 s,
 *     então o kill-switch pela linha vale em até 30 s, sem deploy.
 * Estados: off = só propostas manuais (aprovadas na tela); shadow = decide e registra 'simulada', não envia;
 * on = envia sozinho as classes seguras e deixa as de risco para aprovação (ver src/server/messaging/group-auto.ts).
 *
 * PONTOS DE LIGAÇÃO (descomente quando os módulos dos outros engenheiros existirem; este arquivo NÃO os importa hoje):
 *   import { renderHistoryCard } from '@/server/messaging/history-card';      // (masterProductId) => Promise<Buffer | null>
 *   import { lookupVerifiedCoupon } from '@/server/coupons/lookup';           // (offerId) => Promise<{ code, conditions, expiresAt, verifiedAt } | null>
 *   ... runGroupMessagesCycle({ renderCard: renderHistoryCard, couponLookup: lookupVerifiedCoupon })
 * Sem eles o ciclo funciona igual: texto puro, sem linha de cupom.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;

  if (!isGroupMessagesEnabled()) return NextResponse.json({ ok: true, skipped: 'GROUP_MESSAGES_ENABLED desligado' });

  // Cartão de histórico (PNG) e cupom verificado: injeções do ciclo (ambos tolerantes a falha; sem eles a mensagem sai em texto puro).
  const summary = await runGroupMessagesCycle({
    renderCard: async (masterProductId: string) => (await renderHistoryCard(masterProductId))?.png ?? null,
    couponLookup: lookupVerifiedCoupon,
  });
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
