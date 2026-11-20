import { lojasDaRodada } from '@/lib/messaging/pool-diversidade';
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { canSendTelegram, getAdTag, getGroupMessagesMode } from '@/lib/messaging/group-config';
import { canAutoSend, memberBrake, shouldCountMembers, type AutomationState, type MemberBrake } from '@/lib/messaging/group-automation';
import { applyLimits, type Candidate } from '@/lib/messaging/group-rules';
import { getTelegramMemberCount, type FetchLike } from '@/lib/messaging/telegram-send';
import { getAutomation } from '@/server/messaging/group-automation-store';
import { detectGroupCandidates, groupMessagesTableExists, loadSentHistory, groupMessagesV2Ready, type DetectionResult } from '@/server/messaging/group-offers';
import {
  expireStale,
  listPendingForSend,
  persistProposals,
  revalidateCandidate,
  runRechecks,
  sendApprovedTelegram,
  sendQueuedTelegram,
  type CardForFn,
  type CouponLookupFn,
  type CouponSentFn,
  type RenderCardFn,
  type SendOutcome,
} from '@/server/messaging/group-queue';

type Row = Record<string, unknown>;

/** Orçamento do envio por execução do cron (maxDuration da rota = 60 s; sobra tempo para reconferência e guardião de cupons). */
export const SEND_BUDGET_MS = 38_000;
/** Janela MÍNIMA do envio depois da detecção (P0 2026-11-12): se a detecção consumir os 38 s, o envio ainda ganha esta janela, sem passar do teto. */
export const SEND_MIN_WINDOW_MS = 14_000;
/** Teto absoluto do ciclo (maxDuration da rota = 60 s; um envio em andamento pode levar até ~12 s com reconferência e cartão). */
export const CYCLE_HARD_CAP_MS = 46_000;
/** Orçamento da detecção (P0 2026-11-12): passou disso, o ciclo NÃO aborta; envia a partir das propostas já gravadas (modo degradado). */
export const DETECT_BUDGET_MS = 22_000;
/** Fase 'deteccao' (invocacao propria, maxDuration 120 s): com o banco lento a consulta do pool passa de 22 s e abortar so empilhava consultas orfas e deixava 30 min sem proposta nova. */
export const DETECT_BUDGET_DEDICADO_MS = 95_000;
/** Teto de segurança de voltas por execução (não é teto diário: a próxima execução continua de onde parou). */
export const MAX_SENDS_PER_RUN = 60;
/** Linhas lidas da fila por execução (fila acumulada + novas). */
export const PENDING_LIMIT = 840;
/** Invocação própria de envio (fase 'envio'): sem detecção, o envio ganha quase o minuto inteiro (maxDuration da rota = 120 s; o cron seguinte espera a trava). */
export const SEND_BUDGET_ENVIO_MS = 52_000;
export const CYCLE_HARD_CAP_ENVIO_MS = 105_000;
/** Janela MINIMA do envio a partir do inicio do laco (banco lento: a preparacao do ciclo nao pode zerar o envio). */
export const SEND_MIN_WINDOW_ENVIO_MS = 30_000;

/**
 * Ciclo do cron das mensagens (a cada 5 min quando for agendado; NÃO está no vercel.json). Idempotente e tolerante a
 * execuções sobrepostas: a reivindicação da linha é atômica (sendQueuedTelegram), a gravação usa ON CONFLICT DO NOTHING e
 * a contagem de inscritos só grava a cada ~55 min.
 *
 * Ordem: estado da automação (linha de feature_flags, cache 30 s) -> expira velhas -> vigia a Amazon (ausência/volta) ->
 * contagem de inscritos e freio -> detecta -> grava decisões -> envia (só no estado 'on') -> reconferência de 30 min -> collector_runs.
 *
 * PONTOS DE LIGAÇÃO (outros engenheiros entregam em paralelo; este módulo NÃO importa nenhum deles):
 *  - `renderCard(masterProductId)`: cartão de histórico em PNG. A rota deve passar o renderizador quando existir
 *    (ex.: import { renderHistoryCard } from '@/server/messaging/history-card'). Com ele, alerta/insight saem por sendPhoto.
 *  - `couponLookup(offerId)`: cupom verificado { code, conditions, expiresAt, verifiedAt } ou null. Com ele, a linha do cupom
 *    entra no texto só se estiver verificada, vista há <= 2 h e dentro da validade lida.
 */
export interface CycleDeps {
  now?: Date;
  fetchImpl?: FetchLike;
  renderCard?: RenderCardFn;
  /** Escolha do cartão por tipo de mensagem (a rota do cron liga). */
  cardFor?: CardForFn;
  couponLookup?: CouponLookupFn;
  onCouponSent?: CouponSentFn;
  /**
   * 2026-11-18 (dono: aumentar o fluxo de envio; envios falhavam aos 30 s porque a detecção deixava consultas pesadas ocupando o pool do banco).
   * 'deteccao' = detecta e grava propostas, NAO envia. 'envio' = NAO detecta, so drena a fila já gravada (com orçamento próprio e maior).
   * undefined = comportamento anterior (as duas coisas no mesmo ciclo). A rota liga as duas invocações; GROUP_FASES=junto volta ao ciclo único.
   */
  fase?: 'deteccao' | 'envio';
}

export interface CycleSummary {
  ok: boolean;
  [k: string]: unknown;
}

/** Vigia da Amazon: registra quando uma oferta some da busca e quando volta (para exigir 2 observações >= 15 min). */
export async function syncAmazonWatch(): Promise<{ absent: number; returned: number }> {
  if (!(await groupMessagesV2Ready())) return { absent: 0, returned: 0 };
  const absent = await db.execute(sql`
    INSERT INTO group_offer_watch (offer_id, absent_since, returned_at, updated_at)
    SELECT o.id, now(), NULL, now() FROM affiliate_offers o
    INNER JOIN affiliate_networks n ON n.id = o.network_id
    WHERE (n.slug || ' ' || n.name) ILIKE '%amazon%' AND o.status = 'active' AND o.consecutive_miss_count > 0
    ON CONFLICT (offer_id) DO UPDATE SET
      absent_since = COALESCE(group_offer_watch.absent_since, EXCLUDED.absent_since), returned_at = NULL, updated_at = now()
  `);
  const returned = await db.execute(sql`
    UPDATE group_offer_watch w SET returned_at = o.last_price_confirmed_at, updated_at = now()
    FROM affiliate_offers o
    WHERE o.id = w.offer_id AND w.absent_since IS NOT NULL AND w.returned_at IS NULL
      AND o.consecutive_miss_count = 0 AND o.last_price_confirmed_at > w.absent_since
  `);
  return { absent: Number((absent as { count?: number }).count ?? 0), returned: Number((returned as { count?: number }).count ?? 0) };
}

export interface MemberStatus {
  brake: MemberBrake;
  counted: boolean;
  error?: string;
}

/** Lê getChatMemberCount a cada ~55 min, grava e calcula o freio (queda do pico de 24 h contra o limite configurável, padrão 5%). */
export async function runMemberCount(now: Date, limitPct: number, fetchImpl?: FetchLike): Promise<MemberStatus> {
  const empty: MemberBrake = { paused: false, dropPct: null, peak: null, current: null, stale: true, points: 0 };
  if (!(await groupMessagesV2Ready())) return { brake: empty, counted: false };
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let counted = false;
  let error: string | undefined;
  if (chatId && token) {
    const last = await db.execute<Row>(sql`SELECT max(counted_at) AS at FROM group_member_counts WHERE chat_id = ${chatId}`);
    const lastAt = last[0]?.at ? new Date(last[0].at as string | Date) : null;
    if (shouldCountMembers(lastAt, now)) {
      const r = await getTelegramMemberCount({ token, chatId, fetchImpl });
      if (r.ok && r.count != null) {
        await db.execute(sql`INSERT INTO group_member_counts (chat_id, member_count, counted_at) VALUES (${chatId}, ${r.count}::int, ${now.toISOString()}::timestamptz)`);
        counted = true;
      } else error = r.error;
    }
  }
  const pts = chatId
    ? await db.execute<Row>(sql`
        SELECT counted_at, member_count FROM group_member_counts
        WHERE chat_id = ${chatId} AND counted_at >= ${new Date(now.getTime() - 26 * 3600_000).toISOString()}::timestamptz ORDER BY counted_at
      `)
    : [];
  const brake = memberBrake(
    pts.map((p) => ({ at: new Date(p.counted_at as string | Date), count: Number(p.member_count) })),
    now,
    limitPct
  );
  return { brake, counted, error };
}

async function logRun(started: Date, status: 'ok' | 'error', meta: Record<string, unknown>): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, selected, checked, errors, meta)
      VALUES ('group-messages', 'telegram', ${started.toISOString()}::timestamptz, now(), ${Math.max(0, Date.now() - started.getTime())}::int, ${status},
              ${Number(meta.candidates ?? 0)}::int, ${Number(meta.sentCount ?? 0)}::int, ${status === 'error' ? 1 : 0}::int, ${JSON.stringify(meta)}::jsonb)
    `);
  } catch (e) {
    console.error('[group-messages] falha ao registrar collector_runs', e instanceof Error ? e.message : e);
  }
}

/** Modo sombra: escolhe o vencedor do plano que também passa na releitura de envio (frescor 30/40 min). */
export async function pickShadowWinner(detection: DetectionResult, now: Date): Promise<{ messageKey: string; sound: boolean } | null> {
  let pool = detection.candidates.filter((c) => c.sendable && c.status === 'auto' && !c.held);
  let plan = detection.plan;
  for (let i = 0; i < 3 && plan.next; i++) {
    const next = plan.next;
    const rev = await revalidateCandidate(next, next.priceCents, detection.history, { now, allowReview: false });
    if (rev.ok) return { messageKey: next.messageKey, sound: plan.nextSound };
    pool = pool.filter((c) => c.messageKey !== next.messageKey);
    plan = applyLimits(pool, detection.history, now);
  }
  return null;
}

/** Detecção vazia para o modo degradado: só o histórico de envios (necessário ao espaçamento e aos limites) e a configuração mínima. */
async function degradedDetection(now: Date): Promise<DetectionResult> {
  const h = await loadSentHistory('tg', now).catch(() => ({ records: [], source: 'nenhum (tabela ausente)' as const }));
  return {
    generatedAt: now.toISOString(),
    mode: 'dry',
    config: { verticals: [], maxAgeMin: 0, eventWindowHours: 0, adTag: getAdTag(), amazonMaxAgeMin: 0, amazonPaused: false, amazonLastRunAt: null },
    counts: { productsEvaluated: 0, candidates: 0, auto: 0, review: 0, notSendable: 0, blocked: 0 },
    cupom: { enabled: false, poolProducts: 0, generated: 0, sendable: 0, byStore: {}, barred: {} },
    candidates: [],
    blocked: [],
    plan: applyLimits([], h.records, now),
    history: h.records,
    historySource: h.source,
    warnings: ['Modo degradado: a detecção falhou ou passou do orçamento; o ciclo enviou a partir da fila já gravada.'],
  };
}

export async function runGroupMessagesCycle(deps: CycleDeps = {}): Promise<CycleSummary> {
  const started = new Date();
  const now = deps.now ?? started;
  const mode = getGroupMessagesMode();
  const table = await groupMessagesTableExists();
  const v2 = table && (await groupMessagesV2Ready());
  const automation = await getAutomation();
  // Sem a migration 0030 a automação não existe: cai para 'off' (propostas manuais, como na 0028).
  const state: AutomationState = v2 ? automation.state : 'off';
  const summary: CycleSummary = { ok: true, mode, automation: automation.state, effectiveState: state, v2Ready: v2, tableExists: table };
  if (automation.state !== 'off' && !v2) summary.warning = 'Automação ligada na linha de feature_flags, mas a migration 0030 não foi aplicada: tratada como off.';

  try {
    summary.expired = await expireStale();
    if (v2) summary.amazonWatch = await syncAmazonWatch();

    const members = await runMemberCount(now, automation.maxMemberDropPct, deps.fetchImpl);
    summary.members = { ...members.brake, counted: members.counted, ...(members.error ? { error: members.error } : {}) };

    const tDetect0 = Date.now();
    // Falha ou estouro da detecção (timeout do pool 'live', contenção do banco) não zera o ciclo: segue em modo degradado, sem gravar novas
    // propostas, e o laço de envio trabalha a fila já aprovada/persistida (cada linha ainda passa pela reconferência ao vivo antes de sair).
    let degraded: string | null = null;
    let detection: DetectionResult;
    const soEnvio = deps.fase === 'envio';
    const orcamentoDeteccao = deps.fase === 'deteccao' ? DETECT_BUDGET_DEDICADO_MS : DETECT_BUDGET_MS;
    const semEnvio = deps.fase === 'deteccao';
    if (soEnvio) {
      // Fase de envio: só o histórico de envios e a fila já gravada; nenhuma consulta pesada de detecção compete pelo pool do banco.
      detection = await degradedDetection(now);
      detection.warnings = [];
    } else try {
      // Fase 'deteccao': avalia so algumas lojas por ciclo (rodizio por minuto); GROUP_DETECT_LOJAS_POR_CICLO (padrao 3; 0/off = todas) mantem a consulta do pool dentro do orcamento com o banco lento.
      const lojasPorCiclo = /^(off|false)$/i.test((process.env.GROUP_DETECT_LOJAS_POR_CICLO ?? '').trim()) ? 0 : Number(process.env.GROUP_DETECT_LOJAS_POR_CICLO) >= 0 && (process.env.GROUP_DETECT_LOJAS_POR_CICLO ?? '').trim() !== '' ? Number(process.env.GROUP_DETECT_LOJAS_POR_CICLO) : 3;
      const lojasRodada = deps.fase === 'deteccao' ? lojasDaRodada(['games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte', 'impressao3d', 'beleza', 'brinquedos'], now, lojasPorCiclo) : undefined;
      const run = detectGroupCandidates({ now, includeSimulated: state === 'shadow', adTag: getAdTag(), ...(lojasRodada ? { verticals: lojasRodada } : {}) });
      run.catch(() => undefined); // evita rejeição não tratada se a corrida abaixo já terminou
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`detecção passou de ${orcamentoDeteccao / 1000} s`)), orcamentoDeteccao); });
      try { detection = await Promise.race([run, limit]); } finally { if (timer) clearTimeout(timer); }
    } catch (e) {
      degraded = e instanceof Error ? e.message.slice(0, 200) : 'erro na detecção';
      console.error('[group-messages] detecção falhou; ciclo segue em modo degradado:', degraded);
      detection = await degradedDetection(now);
    }
    const tDetect = Date.now() - tDetect0;
    if (degraded) summary.degraded = degraded;
    summary.counts = detection.counts;
    // Gatilho CUPOM: quantas mensagens de cupom foram geradas neste ciclo (e por loja), e por que ofertas com leitura foram barradas na agulha.
    summary.cupom = detection.cupom;
    summary.warnings = detection.warnings;
    summary.amazon = { paused: detection.config.amazonPaused, lastRunAt: detection.config.amazonLastRunAt };

    const shadowWinner = state === 'shadow' && !degraded ? await pickShadowWinner(detection, now) : null;
    const tPersist0 = Date.now();
    summary.persisted = degraded || soEnvio ? { inserted: 0, skipped: 0, byStatus: {} } : await persistProposals(detection, { state, shadowWinner });
    summary.timing = { preDetectMs: tDetect0 - started.getTime(), detectMs: tDetect, ...detection.timingMs, persistMs: Date.now() - tPersist0 };
    if (state === 'shadow') summary.shadow = { winner: shadowWinner, deferred: detection.plan.deferred.length, state: detection.plan.state };

    // ---- envio ----
    const gate = canSendTelegram();
    const auto = canAutoSend(state, members.brake, gate.ok);
    let sentCount = 0;
    if (mode === 'send' && gate.ok && state !== 'shadow' && !semEnvio) {
      const statuses = auto.ok ? (['aprovada', 'proposta_auto'] as const) : (['aprovada'] as const);
      if (v2) {
        const pending0 = await listPendingForSend([...statuses], PENDING_LIMIT);
        let outcome: SendOutcome | { outcome: string; reason?: string } = { outcome: 'nada na fila para enviar' };
        const sentBy: Record<string, number> = {};
        let cupomSent = 0;
        let expiredCount = 0;
        let restante = 0;
        const resultados: Record<string, number> = {};
        const conta = (k: string) => { resultados[k] = (resultados[k] ?? 0) + 1; };
        const temposEnvio: number[] = [];
        // Prazo do envio: o orçamento de 38 s do ciclo, mas nunca menos que SEND_MIN_WINDOW_MS a partir de agora (a detecção lenta não pode zerar o envio) e nunca além do teto do ciclo.
        // 2026-11-18: com o banco lento a PREPARACAO do ciclo (expirar, contagem de inscritos, historico) passava de 52 s e o envio nascia sem tempo (5 ciclos, 0 envios, 0 falhas).
        // Agora o envio ganha pelo menos SEND_MIN_WINDOW_ENVIO_MS a partir de AGORA, ate o teto CYCLE_HARD_CAP_ENVIO_MS (maxDuration da rota = 120 s).
        const sendDeadline = soEnvio
          ? Math.min(started.getTime() + CYCLE_HARD_CAP_ENVIO_MS, Math.max(started.getTime() + SEND_BUDGET_ENVIO_MS, Date.now() + SEND_MIN_WINDOW_ENVIO_MS))
          : Math.min(started.getTime() + CYCLE_HARD_CAP_MS, Math.max(started.getTime() + SEND_BUDGET_MS, Date.now() + SEND_MIN_WINDOW_MS));
        // 2026-11-17 (dono: "precisamos ser mais rapidos ... nao perdermos produtos"): cada canal tem o proprio espacamento, entao as filas de cada loja drenam EM PARALELO
        // (antes uma fila unica: cada envio levava ~10 s de revalidacao e render, 2 a 5 por ciclo para 7 canais). O espacamento por chat e o 429 continuam valendo dentro de cada fila.
        const porLoja = new Map<string, typeof pending0>();
        for (const r of pending0) { const k = String(r.candidate.vertical); (porLoja.get(k) ?? porLoja.set(k, []).get(k)!).push(r); }
        const drenar = async (inicial: typeof pending0) => {
          let pending = inicial;
          let history = detection.history;
          let guard = 0;
          let falhasSeguidas = 0;
          // Esvazia a fila da loja dentro do orcamento de tempo (sem teto diario; o freio e o espacamento por chat e o 429).
          // Cada volta envia UMA linha e relê o historico (a recem-enviada passa a contar para o espacamento do chat e o dedup).
          while (pending.length && guard++ < MAX_SENDS_PER_RUN && Date.now() < sendDeadline) {
            const cands: Candidate[] = pending.map((r) => ({ ...r.candidate, status: 'auto', held: false, sendable: true }));
            const plan = applyLimits(cands, history, new Date(Math.max(now.getTime(), Date.now())));
            if (!plan.next) {
              // Espaçamento por chat: se só falta esperar poucos segundos, espera dentro do orçamento em vez de perder a vez.
              const wait = plan.deferred.some((d) => d.reason.startsWith('intervalo_chat_')) && !plan.deferred.some((d) => !d.reason.startsWith('intervalo_chat_') && !d.reason.startsWith('produto_ja_enviado') && !d.reason.startsWith('mesmo_produto'));
              // 2026-11-18 (dono: aumentar o fluxo): o laço também espera o espaçamento (3 s) DEPOIS de enviar; antes parava no 1o envio e a loja só voltava ~3 min depois (rodízio de 3 lojas por minuto).
              if (wait && Date.now() + 3_500 < sendDeadline) {
                // 2026-11-18: NAO relê o histórico na espera. Ele só muda quando ESTE laço envia (relido logo depois do envio); relê-lo a cada 3 s em 7 laços paralelos
                // eram ~2 consultas pesadas por segundo e deixavam o ciclo em 60 a 118 s com 1 a 2 envios.
                await new Promise((r) => setTimeout(r, 3_100));
                continue;
              }
              outcome = { outcome: 'adiada', reason: plan.deferred[0]?.reason ?? 'limite' };
              conta(`adiada:${String(plan.deferred[0]?.reason ?? 'limite').replace(/\d+/g, 'N').slice(0, 40)}`);
              break;
            }
            const row = pending.find((r) => r.messageKey === plan.next?.messageKey);
            if (!row) break;
            const tEnvio = Date.now();
            const r = await sendQueuedTelegram(row.id, { now: new Date(), fetchImpl: deps.fetchImpl, renderCard: deps.renderCard, cardFor: deps.cardFor, couponLookup: deps.couponLookup, onCouponSent: deps.onCouponSent });
            outcome = r;
            conta(String((r as { outcome: string }).outcome));
            // 2026-11-18: motivo das falhas no resumo do ciclo (antes só o total 'failed'; sem o motivo não dava para atacar a causa dos envios que falham aos 30 s).
            if ((r as { outcome: string }).outcome === 'failed') conta(`falha:${String((r as { reason?: string }).reason ?? '?').replace(/\s+/g, ' ').replace(/\d+/g, 'N').slice(0, 60)}`);
            temposEnvio.push(Math.round((Date.now() - tEnvio) / 1000));
            pending = pending.filter((x) => x.id !== row.id);
            if (r.outcome === 'sent') {
              sentCount++;
              falhasSeguidas = 0;
              if (row.candidate.trigger === 'CUPOM') cupomSent++;
              sentBy[row.candidate.vertical] = (sentBy[row.candidate.vertical] ?? 0) + 1;
              history = (await loadSentHistory('tg', new Date())).records;
            } else if (r.outcome === 'expired') expiredCount++;
            else if (r.outcome === 'deferred') continue; // a linha foi devolvida à fila; tenta a próxima do plano
            else if (r.outcome === 'failed' && falhasSeguidas < 2 && /socket sem resposta|Failed query|CONNECTION|ECONN|ETIMEDOUT|timeout/i.test(String((r as { reason?: string }).reason ?? ''))) {
              // 2026-11-18: falha de CONEXAO com o banco (consulta sem resposta) e da linha, nao da loja: ela volta para a fila e o laco tenta a PROXIMA (ate 2 seguidas).
              // Antes o laco parava e a loja ficava sem envio ate o proximo ciclo (~1 min) a cada falha.
              falhasSeguidas++;
              continue;
            } else break; // blocked / failed (429 longo, erro do canal, falhas seguidas): para; a linha volta à fila para o próximo ciclo
          }
          restante += pending.length;
        };
        // 2026-11-18: no maximo GROUP_SEND_CONC (padrao 3) lojas por vez, em rodizio por minuto. O pool do banco na Vercel tem 3 conexoes (DB_POOL_*); 7 laços juntos
        // enfileiravam as consultas, o `stuckAwareSocket` derrubava as presas aos 30 s e 6 de 7 envios falhavam (resultados {failed: 6}, ~32 s cada).
        const grupos = [...porLoja.values()];
        const desloc = grupos.length ? Math.floor(started.getTime() / 60_000) % grupos.length : 0;
        const ordem = [...grupos.slice(desloc), ...grupos.slice(0, desloc)];
        const conc = Math.max(1, Math.min(7, Number(process.env.GROUP_SEND_CONC) || 3));
        let prox = 0;
        await Promise.all(Array.from({ length: Math.min(conc, ordem.length) }, async () => {
          while (prox < ordem.length && Date.now() < sendDeadline) await drenar(ordem[prox++]);
        }));
        for (; prox < ordem.length; prox++) restante += ordem[prox].length;
        summary.sendRun = { sent: sentCount, cupomSent, expired: expiredCount, byStore: sentBy, remainingInQueue: restante, ms: Date.now() - started.getTime(), resultados, temposEnvioS: temposEnvio };
        summary.send = outcome;
      } else {
        const next = await db
          .execute<{ id: string }>(sql`SELECT id FROM group_messages WHERE channel = 'tg' AND status = 'aprovada' AND claimed_at IS NULL ORDER BY approved_at NULLS LAST, created_at LIMIT 1`)
          .catch(() => []);
        const r = next[0] ? await sendApprovedTelegram(String(next[0].id), now) : { outcome: 'nada aprovado para enviar' };
        summary.send = r;
        if ((r as SendOutcome).outcome === 'sent') sentCount++;
      }
    } else {
      summary.send = { outcome: 'não enviou', reason: state === 'shadow' ? 'modo sombra: só registra a decisão' : mode !== 'send' ? 'GROUP_MESSAGES_MODE != send' : gate.reason };
    }
    if (state === 'on' && !auto.ok) summary.autoPaused = auto.reason;

    if (v2) summary.rechecks = await runRechecks(now);
    await logRun(started, 'ok', {
      state, fase: deps.fase ?? 'junto', degraded, timing: summary.timing, sendMs: (summary.sendRun as { ms?: number } | undefined)?.ms, sendRun: summary.sendRun, candidates: detection.counts.candidates, sentCount, persisted: summary.persisted, brake: members.brake.paused, amazonPaused: detection.config.amazonPaused,
      cupomGeradas: detection.cupom.generated, cupomEnviaveis: detection.cupom.sendable, cupomNoPool: detection.cupom.poolProducts, cupomPorLoja: detection.cupom.byStore,
      cupomBarradas: detection.cupom.barred, cupomEnviadas: (summary.sendRun as { cupomSent?: number } | undefined)?.cupomSent ?? 0,
    });
    return summary;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : 'erro';
    await logRun(started, 'error', { state, erro: msg });
    return { ...summary, ok: false, error: msg };
  }
}
