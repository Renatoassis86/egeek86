import { capturarFreteMl } from '@/server/shipping/frete-prazo';
import { DEGRAUS, faixaTexto } from '@/lib/messaging/regua';
import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { isGroupMessagesEnabled } from '@/lib/messaging/group-config';
import { runGroupMessagesCycle } from '@/server/messaging/group-auto';
import { renderHistoryCard } from '@/server/messaging/price-card';
import { consultarCupom, registrarDivulgacao } from '@/server/messaging/agente-cupons';
import { cicloAgenteCupons } from '@/server/messaging/guardiao-cupons';
import { preencherAnuncios, renovarShopee } from '@/server/pricing/integridade-preco';
import { cicloAuditoriaLinks } from '@/server/links/auditoria-links';
import { encerrarBackendsOrfaos } from '@/server/messaging/reaper-backends';
import { atualizarPaineisImpressoras } from '@/server/messaging/painel-impressoras';
import { refreshShopeeCampaigns } from '@/server/collector/shopee-campaigns';
import { loadOfferCardInput, renderOfferCard } from '@/server/messaging/offer-card';
import { discoverStoreChats } from '@/server/stores-discover';
import { retirarAvisosSemProva, revogarVencidos } from '@/server/coupons/cofre';
import { acquireCycleLock } from '@/server/messaging/cycle-lock';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
// 2026-11-17: 60 -> 120 s. O ciclo já rodava 43 a 48 s e, com a carga do dia, passou de 60 s: a função era morta antes de gravar a execução e o envio parou por ~70 min
// (últimas mensagens 20:11 UTC). O orçamento interno do envio (SEND_BUDGET_MS) e o da integridade (50 s) NÃO mudaram; isto só tira o corte seco do Vercel.
export const maxDuration = 120;

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
  // Invocação PRÓPRIA da integridade de preço (#119): `?fase=integridade` (mesma rota, entrada própria no vercel.json), com trava e orçamento próprios.
  // Antes as 3 fases (auditoria, anúncios, Shopee) rodavam depois do envio e morriam de fome quando o envio passava de 40 s.
  if (request.nextUrl.searchParams.get('fase') === 'integridade') {
    const lockI = await acquireCycleLock('group-messages:integridade');
    if (!lockI.acquired) return NextResponse.json({ ok: true, skipped: 'integridade anterior ainda em andamento (trava)' });
    try {
      return await runIntegridade();
    } finally {
      lockI.release();
    }
  }
  const lock = await acquireCycleLock();
  if (!lock.acquired) return NextResponse.json({ ok: true, skipped: 'ciclo anterior ainda em andamento (trava)' });
  try {
    return await runCycle(request, lock.failedOpen);
  } finally {
    lock.release();
  }
}

type Fases = Record<string, number>;
async function fase<T>(fases: Fases, nome: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try { return await fn(); } finally { fases[nome] = Date.now() - t; }
}
/** Tempo por fase em collector_runs (job 'group-messages-fases'), para a tabela de tempos e o ajuste de orçamento. Melhor esforço. */
async function registrarFases(origem: string, fases: Fases, totalMs: number): Promise<void> {
  try {
    await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('group-messages-fases', 'cron', now() - make_interval(secs => ${totalMs / 1000}), now(), ${totalMs}, 'ok', ${JSON.stringify({ origem, fases })}::jsonb)`);
  } catch { /* medição não derruba o ciclo */ }
}

/**
 * Invocação AUXILIAR (`?fase=integridade`): ordem fixa de prioridade e mínimo por fase, teto total de 50 s (maxDuration 60):
 * painel do privado > agente de cupons > auditoria de links > frete/prazo > anúncios > Shopee. Cada fase sai se o tempo restante for menor que o seu mínimo.
 */
async function runIntegridade() {
  const t0 = Date.now();
  const fases: Fases = {};
  const restante = () => 50_000 - (Date.now() - t0);
  const nao = (v?: string) => /^(0|off|false)$/i.test(v ?? '');
  const paineis = restante() >= 8_000 ? await fase(fases, 'painel_privado', () => atualizarPaineisImpressoras(new Date(), { budgetMs: Math.min(16_000, restante() - 2_000) })).catch(() => ({ erro: 'falha' })) : { skipped: 'sem tempo' };
  const agente = restante() >= 6_000 ? await fase(fases, 'agente_cupons', () => cicloAgenteCupons({ budgetMs: Math.min(9_000, restante() - 1_000) })).catch(() => ({ erro: 'falha' })) : { skipped: 'sem tempo' };
  // Cofre (R-64): revoga automaticamente o que passou do TTL da prova (a trilha e o relatório entram em collector_runs 'cofre-cupons').
  const cofre = await fase(fases, 'cofre', async () => ({ ...(await revogarVencidos()), avisos: await retirarAvisosSemProva() })).catch(() => ({ revogados: -1 }));
  const auditoriaLinks = restante() >= 10_000 ? await fase(fases, 'auditoria', () => cicloAuditoriaLinks({ budgetMs: Math.min(18_000, restante() - 8_000) })).catch(() => ({ erro: 'falha' })) : { skipped: 'sem tempo' };
  const fretePrazo = restante() >= 9_000 ? await fase(fases, 'frete_prazo', () => capturarFreteMl(new Date(), { budgetMs: Math.min(8_000, restante() - 2_000) })).catch(() => ({ erro: 'falha' })) : { skipped: 'sem tempo' };
  const anuncios = !nao(process.env.ANUNCIOS_PREENCHER) && restante() >= 8_000 ? await fase(fases, 'anuncios', () => preencherAnuncios({ orcamentoMs: Math.min(12_000, restante() - 3_000), maxCatalogos: 2 })).catch(() => ({ erro: 'falha' })) : { skipped: 'desligado ou sem tempo' };
  const shopeeRenov = !nao(process.env.SHOPEE_RENOVAR) && restante() >= 5_000 ? await fase(fases, 'shopee', () => renovarShopee({ limite: 6 })).catch(() => ({ erro: 'falha' })) : { skipped: 'desligado ou sem tempo' };
  await registrarFases('integridade', fases, Date.now() - t0);
  return NextResponse.json({ ok: true, fase: 'integridade', fases, paineisImpressoras: paineis, agenteCupons: agente, cofre, auditoriaLinks, fretePrazo, anuncios, shopeeRenov });
}

async function runCycle(request: NextRequest, lockFailedOpen: boolean) {
  const startedAt = Date.now();

  if (!isGroupMessagesEnabled()) return NextResponse.json({ ok: true, skipped: 'GROUP_MESSAGES_ENABLED desligado' });

  // Campanhas oficiais da Shopee (links de afiliado por categoria): 1x por hora, no minuto 7 (poucas chamadas; tolerante a falha).
  if (new Date().getUTCMinutes() === 7) await refreshShopeeCampaigns().catch(() => undefined);

  // Conexoes orfas (funcao morta no meio de um UPDATE) seguram locks e fazem os envios falharem aos 30 s: encerra antes do ciclo.
  await encerrarBackendsOrfaos();

  // Canais novos das lojas: o bot resolve o link público em chat id (só leitura; tolerante a falha).
  await discoverStoreChats(process.env.TELEGRAM_BOT_TOKEN).catch(() => []);

  // Cartão de histórico (PNG) e cupom verificado: injeções do ciclo (ambos tolerantes a falha; sem eles a mensagem sai em texto puro).
  const fases: Fases = {};
  const summary = await fase(fases, 'ciclo_envio', () => runGroupMessagesCycle({
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
        input.regua = { degrau: candidate.regua.degrau, rotulo: candidate.regua.rotulo, cor: d.cor, corTexto: d.corTexto, pctTexto: candidate.regua.mostrarPct ? `${candidate.regua.pct.toFixed(1).replace('.', ',')}% abaixo da média das lojas${candidate.avgCents ? ` (R$ ${(candidate.avgCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}` : null, faixaTexto: candidate.regua.faixa ? faixaTexto(candidate.regua.faixa) : null };
      }
      return input ? ((await renderOfferCard(input))?.png ?? null) : null;
    },
    // Agente de Cupons: consulta única (anúncio -> campanha do dono -> loja/categoria), com auditoria em coupon_consults.
    couponLookup: (offerId: string) => consultarCupom(offerId),
    // Mensagem com cupom enviada: o agente passa a acompanhar esse cupom (o guardião avisa o grupo quando ele acabar).
    onCouponSent: (info, ctx) => registrarDivulgacao(info, ctx),
  }));
  // As fases AUXILIARES (painel do privado, agente de cupons, frete/prazo, auditoria de links, anúncios, Shopee) rodam na invocação `?fase=integridade`
  // (mesma rota, trava e orçamento próprios). O envio usa até 38 s por desenho (SEND_BUDGET_MS) e, nos horários de mais mensagens, deixava as
  // fases auxiliares sem tempo (painel/agente parados de 23:52Z a 00:15Z de 16/11); medido: o tempo do ciclo acompanha o nº de mensagens enviadas.
  await registrarFases('envio', { ...fases, pick: ((summary as { timing?: Record<string, number> }).timing?.pick) ?? 0, facts: ((summary as { timing?: Record<string, number> }).timing?.facts) ?? 0, detect: ((summary as { timing?: Record<string, number> }).timing?.detectMs) ?? 0 }, Date.now() - startedAt);
  return NextResponse.json({ ...summary, ...(lockFailedOpen ? { lockFailedOpen: true } : {}) }, { status: summary.ok ? 200 : 500 });
}
