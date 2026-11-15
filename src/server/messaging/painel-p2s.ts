import 'server-only';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getStoreByVertical, chatForStore } from '@/server/stores';
import { getAdTag } from '@/lib/messaging/group-config';
import { GROUP_LINK_BASE } from '@/lib/messaging/group-messages';
import { sendTelegramGroupMessage } from '@/lib/messaging/telegram-send';
import { beneficiosVivosPorOferta } from '@/server/coupons/card-benefits';
import { rotuloBeneficioCartao } from '@/lib/coupons/card-benefit';
import { lookupItemCouponDetail } from '@/server/messaging/coupon-item-lookup';
import { INTERVALO_PAINEL_MS, MASTER_P2S_COMBO, montarPainel, painelLigado, type OfertaPainel, type SaidaPainel } from '@/lib/messaging/painel-p2s';

/**
 * Painel vivo do P2S Combo no canal Impressão 3D (#117). UMA mensagem, editada a cada 30 min (editMessageText), sem mensagem nova por ciclo.
 * Estado: collector_runs (job 'p2s-painel-canal'; meta.message_id/hash/tipo) — sem tabela nova (mesmo padrão do monitor de preço #114).
 * 1ª vez: sendMessage + pinChatMessage silencioso (se falhar, segue). Depois: edita SÓ se o texto mudou. Mensagem apagada: reenvia e troca o id.
 * Flag P2S_PAINEL_CANAL (1/on/true liga; padrão desligada). Alvo 'privado' = chat do dono (TELEGRAM_ALERT_CHAT_ID), job de estado próprio, para teste.
 * Nunca lança, nunca imprime token nem chat id.
 */
const JOB_CANAL = 'p2s-painel-canal';
const JOB_PRIVADO = 'p2s-painel-teste';
const LIMITE_MS = 12_000;
const GUARDA_MS = INTERVALO_PAINEL_MS - 2 * 60_000;

export interface ResultadoPainel {
  ligado: boolean;
  acao: 'desligado' | 'recente' | 'previa' | 'enviado' | 'editado' | 'inalterado' | 'reenviado' | 'sem_texto' | 'sem_canal' | 'erro';
  ativos?: number;
  omitidasVelhas?: number;
  links?: number;
  chars?: number;
  problemas?: string[];
  erro?: string;
  text?: string;
}

interface RowOferta { id: string; rede: string; loja: string | null; price: string; url: string | null; slug: string; checked: Date | string }

/** Lê as ofertas do P2S Combo e junta cupom e cartão (só dos 10 menores anúncios frescos). */
export async function carregarOfertasPainel(now: Date): Promise<OfertaPainel[]> {
  const rows = (await db.execute<RowOferta & Record<string, unknown>>(sql`
    SELECT o.id::text AS id, nn.slug AS rede, COALESCE(NULLIF(o.store_name, ''), s.nickname) AS loja, o.current_price_cents::text AS price,
           o.affiliate_url AS url, o.slug, o.last_checked_at AS checked
    FROM affiliate_offers o
    JOIN affiliate_networks nn ON nn.id = o.network_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.master_product_id = ${MASTER_P2S_COMBO}::uuid AND o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0
      AND nn.slug IN ('mercado-livre', 'shopee')`)) as unknown as RowOferta[];
  const todas = rows.map((r) => ({
    id: r.id, rede: r.rede, loja: r.loja, cents: Number(r.price),
    url: r.url || (r.slug ? `${GROUP_LINK_BASE}/go/${encodeURIComponent(r.slug)}` : null),
    checkedAt: new Date(r.checked),
  }));
  const frescas = todas.filter((o) => now.getTime() - o.checkedAt.getTime() <= 24 * 3600_000).sort((a, b) => a.cents - b.cents);
  const top = frescas.slice(0, 10);
  const ids = top.map((o) => o.id);
  const cartoes = await beneficiosVivosPorOferta(ids).catch(() => new Map());
  const cupons = new Map<string, { final: number; nome: string | null }>();
  await Promise.all(top.map(async (o) => {
    try {
      const r = await lookupItemCouponDetail(o.id, undefined, now);
      if (r && r.detail.finalCents > 0 && r.detail.finalCents < o.cents) cupons.set(o.id, { final: r.detail.finalCents, nome: r.detail.named ? r.detail.name : null });
    } catch { /* sem cupom */ }
  }));
  return todas.map((o) => {
    const bs = (cartoes.get(o.id) ?? [])
      .filter((b: { kind: string }) => b.kind !== 'parcelas')
      .map((b: Parameters<typeof rotuloBeneficioCartao>[0] & { needsConfirm: boolean }) => ({ rotulo: rotuloBeneficioCartao(b), needsConfirm: b.needsConfirm }))
      .filter((b: { rotulo: string | null }): b is { rotulo: string; needsConfirm: boolean } => !!b.rotulo);
    const c = cupons.get(o.id);
    return { rede: o.rede, loja: o.loja, cents: o.cents, url: o.url, checkedAt: o.checkedAt, cupomFinalCents: c?.final ?? null, cupomNome: c?.nome ?? null, beneficios: bs };
  });
}

export async function montarPainelAgora(now: Date = new Date()): Promise<SaidaPainel> {
  const ofertas = await carregarOfertasPainel(now);
  return montarPainel({ ofertas, now, adTag: getAdTag() });
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 32);

interface Estado { messageId: string | null; hash: string | null; lastOkAt: Date | null; lastAnyAt: Date | null }

async function lerEstado(job: string): Promise<Estado> {
  const r = (await db.execute<{ mid: string | null; hash: string | null; status: string; at: Date | string }>(sql`
    SELECT meta->>'message_id' AS mid, meta->>'hash' AS hash, status, started_at AS at FROM collector_runs
    WHERE job = ${job} ORDER BY started_at DESC LIMIT 20`)) as unknown as { mid: string | null; hash: string | null; status: string; at: Date | string }[];
  const ok = r.find((x) => x.status === 'ok' && x.mid);
  return { messageId: ok?.mid ?? null, hash: ok?.hash ?? null, lastOkAt: r.find((x) => x.status === 'ok') ? new Date(r.find((x) => x.status === 'ok')!.at) : null, lastAnyAt: r[0] ? new Date(r[0].at) : null };
}

async function gravar(job: string, status: 'ok' | 'error', ms: number, meta: Record<string, unknown>): Promise<void> {
  await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
    VALUES (${job}, 'telegram', now(), now(), ${Math.round(ms)}, ${status}, ${JSON.stringify(meta)}::jsonb)`);
}

function scrub(s: string, token: string): string {
  return s.split(token).join('***').replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***').slice(0, 200);
}

async function tg(token: string, metodo: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; desc: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const b = ((await res.json().catch(() => ({}))) ?? {}) as { ok?: boolean; description?: string };
    return { ok: res.status === 200 && b.ok === true, status: res.status, desc: scrub(String(b.description ?? `HTTP ${res.status}`), token) };
  } catch (e) {
    return { ok: false, status: 0, desc: `rede: ${scrub(e instanceof Error ? e.message : 'falha', token)}` };
  }
}

async function executar(now: Date, opts: { alvo: 'canal' | 'privado'; force: boolean; dryRun: boolean }): Promise<ResultadoPainel> {
  const t0 = Date.now();
  const job = opts.alvo === 'canal' ? JOB_CANAL : JOB_PRIVADO;
  const base: ResultadoPainel = { ligado: true, acao: 'sem_texto' };
  if (!opts.force && !opts.dryRun) {
    const est0 = await lerEstado(job);
    if (est0.lastOkAt && now.getTime() - est0.lastOkAt.getTime() < GUARDA_MS) return { ...base, acao: 'recente' };
    if (est0.lastAnyAt && now.getTime() - est0.lastAnyAt.getTime() < 4 * 60_000) return { ...base, acao: 'recente' };
  }
  const p = await montarPainelAgora(now);
  const r: ResultadoPainel = { ...base, ativos: p.ativos, omitidasVelhas: p.omitidasVelhas, links: p.links, problemas: p.problemas, chars: p.text?.length };
  if (!p.text) return opts.dryRun ? r : (await gravar(job, 'error', Date.now() - t0, { tipo: 'sem_texto', problemas: p.problemas }), r);
  if (opts.dryRun) return { ...r, acao: 'previa', text: p.text };

  const token = process.env.TELEGRAM_BOT_TOKEN;
  let chat: string | undefined;
  if (opts.alvo === 'privado') chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  else {
    const st = await getStoreByVertical('impressao3d', { fresh: true }).catch(() => null);
    if (st && st.telegramChatId && st.telegramVerifiedAt && st.telegramBotCanPost) chat = chatForStore(st);
  }
  if (!token || !chat) return { ...r, acao: 'sem_canal' };

  const hash = sha(p.text);
  const est = await lerEstado(job);
  if (est.messageId && est.hash === hash) {
    await gravar(job, 'ok', Date.now() - t0, { tipo: 'inalterado', message_id: est.messageId, hash, ativos: p.ativos });
    return { ...r, acao: 'inalterado' };
  }
  const corpo = { chat_id: chat, text: p.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  let reenviar = !est.messageId;
  if (est.messageId) {
    const ed = await tg(token, 'editMessageText', { ...corpo, message_id: Number(est.messageId) });
    if (ed.ok || /not modified/i.test(ed.desc)) {
      await gravar(job, 'ok', Date.now() - t0, { tipo: 'editado', message_id: est.messageId, hash, ativos: p.ativos, links: p.links });
      return { ...r, acao: 'editado' };
    }
    if (ed.status === 400 && /not found|message_id_invalid|can't be edited|to edit/i.test(ed.desc)) reenviar = true;
    else {
      await gravar(job, 'error', Date.now() - t0, { tipo: 'edicao_falhou', erro: ed.desc, status: ed.status });
      return { ...r, acao: 'erro', erro: ed.desc };
    }
  }
  if (reenviar) {
    const s = await sendTelegramGroupMessage({ token, chatId: chat, text: p.text, silent: true });
    if (!s.ok || !s.messageId) {
      await gravar(job, 'error', Date.now() - t0, { tipo: 'envio_falhou', erro: s.error ?? 'sem id' });
      return { ...r, acao: 'erro', erro: s.error ?? 'sem id' };
    }
    const pin = await tg(token, 'pinChatMessage', { chat_id: chat, message_id: Number(s.messageId), disable_notification: true });
    await gravar(job, 'ok', Date.now() - t0, { tipo: est.messageId ? 'reenviado' : 'enviado', message_id: s.messageId, hash, ativos: p.ativos, links: p.links, fixado: pin.ok, fixar_erro: pin.ok ? undefined : pin.desc });
    return { ...r, acao: est.messageId ? 'reenviado' : 'enviado' };
  }
  return r;
}

/** Entrada do ciclo (e do uso manual). Nunca lança; limite de 12 s. */
export async function atualizarPainelP2s(now: Date = new Date(), opts: { alvo?: 'canal' | 'privado'; force?: boolean; dryRun?: boolean; ignorarFlag?: boolean } = {}): Promise<ResultadoPainel> {
  const ligado = painelLigado();
  if (!ligado && !opts.ignorarFlag) return { ligado: false, acao: 'desligado' };
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<ResultadoPainel>((resolve) => { timer = setTimeout(() => resolve({ ligado, acao: 'erro', erro: 'limite de tempo' }), LIMITE_MS); });
    const r = await Promise.race([executar(now, { alvo: opts.alvo ?? 'canal', force: !!opts.force, dryRun: !!opts.dryRun }), limite]);
    if (timer) clearTimeout(timer);
    return r;
  } catch (e) {
    console.error('[painel-p2s] falhou:', e instanceof Error ? e.message : e);
    return { ligado, acao: 'erro', erro: e instanceof Error ? e.message.slice(0, 120) : 'erro' };
  }
}
