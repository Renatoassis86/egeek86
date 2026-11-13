import { DEGRAUS, faixaTexto } from '@/lib/messaging/regua';
import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { isGroupMessagesEnabled } from '@/lib/messaging/group-config';
import { runGroupMessagesCycle } from '@/server/messaging/group-auto';
import { renderHistoryCard } from '@/server/messaging/price-card';
import { consultarCupom, registrarDivulgacao } from '@/server/messaging/agente-cupons';
import { cicloAgenteCupons } from '@/server/messaging/guardiao-cupons';
import { refreshShopeeCampaigns } from '@/server/collector/shopee-campaigns';
import { loadOfferCardInput, renderOfferCard } from '@/server/messaging/offer-card';
import { discoverStoreChats } from '@/server/stores-discover';
import { acquireCycleLock } from '@/server/messaging/cycle-lock';

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
  // Um ciclo por vez (P0 2026-11-13): ciclo que passa de 60 s não empilha o seguinte; a trava cai sozinha (ver cycle-lock.ts).
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  const lock = await acquireCycleLock();
  if (!lock.acquired) return NextResponse.json({ ok: true, skipped: 'ciclo anterior ainda em andamento (trava)' });
  try {
    return await runCycle(request, lock.failedOpen);
  } finally {
    lock.release();
  }
}

async function runCycle(request: NextRequest, lockFailedOpen: boolean) {
  const startedAt = Date.now();

  if (!isGroupMessagesEnabled()) return NextResponse.json({ ok: true, skipped: 'GROUP_MESSAGES_ENABLED desligado' });

  // Campanhas oficiais da Shopee (links de afiliado por categoria): 1x por hora, no minuto 7 (poucas chamadas; tolerante a falha).
  if (new Date().getUTCMinutes() === 7) await refreshShopeeCampaigns().catch(() => undefined);

  // Canais novos das lojas: o bot resolve o link público em chat id (só leitura; tolerante a falha).
  await discoverStoreChats(process.env.TELEGRAM_BOT_TOKEN).catch(() => []);

  // Cartão de histórico (PNG) e cupom verificado: injeções do ciclo (ambos tolerantes a falha; sem eles a mensagem sai em texto puro).
  const summary = await runGroupMessagesCycle({
    renderCard: async (masterProductId: string) => (await renderHistoryCard(masterProductId))?.png ?? null,
    // Escolha do cartão: histórico (P1 e G5) ou card de oferta (capa + preço + insight) para alerta/insight de preço.
    cardFor: async ({ kind, offerId, masterProductId, candidate }) => {
      if (kind === 'historico') return (await renderHistoryCard(masterProductId))?.png ?? null;
      // Achado e Cupom ativo: card simples (sem média, sem histórico, sem comparação).
      if (kind === 'simples') {
        const simple = await loadOfferCardInput(offerId, {
          simple: true,
          couponFinalCents: candidate.trigger === 'CUPOM' ? candidate.couponFinalCents ?? null : null,
          couponName: candidate.trigger === 'CUPOM' ? candidate.couponName ?? null : null,
          couponReadAt: candidate.trigger === 'CUPOM' && candidate.couponInfo?.verifiedAt ? new Date(candidate.couponInfo.verifiedAt) : null,
        });
        return simple ? ((await renderOfferCard(simple))?.png ?? null) : null;
      }
      const input = await loadOfferCardInput(offerId);
      if (input && candidate.regua) {
        // Régua de destaque: faixa da cor do degrau com o veredito em texto e as marcas (a cor nunca fica sozinha).
        const d = DEGRAUS[candidate.regua.degrau];
        input.regua = { degrau: candidate.regua.degrau, rotulo: candidate.regua.rotulo, cor: d.cor, corTexto: d.corTexto, pctTexto: candidate.regua.mostrarPct ? `${candidate.regua.pct.toFixed(1).replace('.', ',')}% abaixo da média das lojas` : null, faixaTexto: candidate.regua.faixa ? faixaTexto(candidate.regua.faixa) : null };
      }
      return input ? ((await renderOfferCard(input))?.png ?? null) : null;
    },
    // Agente de Cupons: consulta única (anúncio -> campanha do dono -> loja/categoria), com auditoria em coupon_consults.
    couponLookup: (offerId: string) => consultarCupom(offerId),
    // Mensagem com cupom enviada: o agente passa a acompanhar esse cupom (o guardião avisa o grupo quando ele acabar).
    onCouponSent: (info, ctx) => registrarDivulgacao(info, ctx),
  });
  // Guardião de cupons (~5 min, tolerante a falha, orçamento próprio): fecha cupons divulgados que acabaram, avisa o grupo da loja
  // com um card silencioso e grava o relatório da equipe em collector_runs (job 'agente-cupons').
  const agente = Date.now() - startedAt < 35_000 ? await cicloAgenteCupons({ budgetMs: 12_000 }).catch(() => ({ erro: 'falha' })) : { skipped: 'sem tempo' };
  return NextResponse.json({ ...summary, agenteCupons: agente, ...(lockFailedOpen ? { lockFailedOpen: true } : {}) }, { status: summary.ok ? 200 : 500 });
}
