import 'server-only';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getStoreByVertical, chatForStore } from '@/server/stores';
import { getAdTag } from '@/lib/messaging/group-config';
import { GROUP_LINK_BASE } from '@/lib/messaging/group-messages';
import { classificarTipo } from '@/lib/catalog/tipos-produto';
import { ehItemMiudoOuDuvida } from '@/lib/catalog/item-miudo';
import { beneficiosVivosPorOferta } from '@/server/coupons/card-benefits';
import { rotuloBeneficioCartao } from '@/lib/coupons/card-benefit';
import { lookupItemCouponDetail } from '@/server/messaging/coupon-item-lookup';
import { alvosLigados, INTERVALO_RODADA_MS, montarPaineis, secaoDe, type Alvo, type OfertaPainel, type SaidaPaineis } from '@/lib/messaging/painel-impressoras';

/**
 * Painéis vivos das impressoras 3D (#117): TODAS as impressoras (aparelhos) ativas, frescas e fora da quarentena do Mercado Livre e da Amazon,
 * em mensagens FIXAS editadas (editMessageText) a cada 10 min, no canal Impressão 3D e no chat privado do dono (ids separados por destino).
 * Roda no cron de group-messages (a cada minuto, depois do agente de cupons) com orçamento de tempo: uma RODADA começa a cada 10 min e pode levar vários minutos;
 * o cursor (meta.rodada) guarda onde parou. Só chama a API do Telegram quando o texto do painel mudou (hash); 1,2 s entre chamadas; 429 pausa.
 * Estado: collector_runs (job painel-impressoras-<alvo>; meta.paineis = {chave: {message_id, hash}}), sem tabela nova.
 * Flag PAINEL_IMPRESSORAS (1 = canal e privado; canal; privado; padrão desligada). Nunca lança; nunca imprime token nem chat id.
 */
const ESPACO_MS = 1200;
const MIN_CHAMADA_MS = 2500;

export interface Slot { message_id: string; hash: string }
interface Rodada { inicio: string; cursor: number; aberta: boolean }
interface Estado { slots: Record<string, Slot>; rodada: Rodada | null; ultimoInicio: Date | null; pausaAte: Date | null }

export interface ResultadoAlvo {
  alvo: Alvo;
  acao: 'recente' | 'pausado' | 'sem_destino' | 'sem_painel' | 'em_andamento' | 'concluida' | 'erro';
  chamadas?: number;
  enviados?: number;
  editados?: number;
  inalterados?: number;
  apagados?: number;
  erros?: number;
  paineis?: number;
  cursor?: number;
  erro?: string;
}
export interface ResultadoPaineis { ligado: boolean; alvos: ResultadoAlvo[]; ativosMl?: number; ativosAmazon?: number; problemas?: string[] }

interface RowOferta { id: string; master_id: string; master_name: string; rede: string; loja: string | null; price: string; url: string | null; slug: string; checked: Date | string }

/** Impressoras (aparelhos) do ML e da Amazon: tipo 'impressoras' do site; sem item miúdo. Lojas de papel sem filtro de frescor aqui: a montagem separa 24 h. */
export async function carregarOfertasImpressoras(now: Date): Promise<OfertaPainel[]> {
  const rows = (await db.execute<RowOferta & Record<string, unknown>>(sql`
    SELECT o.id::text AS id, m.id::text AS master_id, m.name AS master_name, nn.slug AS rede,
           COALESCE(NULLIF(o.store_name, ''), s.nickname) AS loja, o.current_price_cents::text AS price,
           o.affiliate_url AS url, o.slug, o.last_checked_at AS checked
    FROM affiliate_offers o
    JOIN affiliate_networks nn ON nn.id = o.network_id
    JOIN master_products m ON m.id = o.master_product_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = 'impressao3d' AND o.current_price_cents > 0
      AND nn.slug IN ('mercado-livre', 'amazon') AND o.last_checked_at > now() - interval '24 hours'
      AND m.name ~* '(impressora|printer|bambu|kobra)'`)) as unknown as RowOferta[];
  const base = rows
    .filter((r) => classificarTipo('impressao3d', r.master_name) === 'impressoras')
    .filter((r) => !ehItemMiudoOuDuvida(r.master_name, Number(r.price), 'general', 'impressao3d'))
    .map((r) => ({
      id: r.id, masterId: r.master_id, masterName: r.master_name, rede: r.rede, loja: r.loja, cents: Number(r.price),
      url: r.url || (r.slug ? `${GROUP_LINK_BASE}/go/${encodeURIComponent(r.slug)}` : null), checkedAt: new Date(r.checked),
    }));
  // Cupom e cartão só para os dois modelos em destaque (os 8 menores de cada modelo e rede).
  const alvos = new Map<string, typeof base>();
  for (const o of base) {
    const sc = secaoDe(o);
    if (!sc.destaque) continue;
    const k = `${sc.chave}|${o.rede}`;
    alvos.set(k, [...(alvos.get(k) ?? []), o]);
  }
  const top = [...alvos.values()].flatMap((l) => l.sort((a, b) => a.cents - b.cents).slice(0, 8));
  const cartoes = await beneficiosVivosPorOferta(top.map((o) => o.id)).catch(() => new Map());
  const cupons = new Map<string, { final: number; nome: string | null }>();
  await Promise.all(top.map(async (o) => {
    try {
      const r = await lookupItemCouponDetail(o.id, undefined, now);
      if (r && r.detail.finalCents > 0 && r.detail.finalCents < o.cents) cupons.set(o.id, { final: r.detail.finalCents, nome: r.detail.named ? r.detail.name : null });
    } catch { /* sem cupom */ }
  }));
  return base.map((o) => {
    const bs = ((cartoes.get(o.id) ?? []) as (Parameters<typeof rotuloBeneficioCartao>[0] & { needsConfirm: boolean; kind: string })[])
      .filter((b) => b.kind !== 'parcelas')
      .map((b) => ({ rotulo: rotuloBeneficioCartao(b), needsConfirm: b.needsConfirm }))
      .filter((b): b is { rotulo: string; needsConfirm: boolean } => !!b.rotulo);
    const c = cupons.get(o.id);
    return { masterId: o.masterId, masterName: o.masterName, rede: o.rede, loja: o.loja, cents: o.cents, url: o.url, checkedAt: o.checkedAt, cupomFinalCents: c?.final ?? null, cupomNome: c?.nome ?? null, beneficios: bs };
  });
}

export async function montarPaineisAgora(inicio: Date = new Date()): Promise<SaidaPaineis> {
  const ofertas = await carregarOfertasImpressoras(inicio);
  return montarPaineis({ ofertas, inicio, adTag: getAdTag() });
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 32);
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jobDe = (alvo: Alvo) => `painel-impressoras-${alvo}`;

async function lerEstado(job: string): Promise<Estado> {
  const r = (await db.execute<{ meta: { paineis?: Record<string, Slot>; rodada?: Rodada; pausa_ate?: string } | null; at: Date | string }>(sql`
    SELECT meta, started_at AS at FROM collector_runs WHERE job = ${job} ORDER BY started_at DESC LIMIT 1`)) as unknown as { meta: { paineis?: Record<string, Slot>; rodada?: Rodada; pausa_ate?: string } | null; at: Date | string }[];
  const m = r[0]?.meta ?? null;
  const rodada = m?.rodada ?? null;
  return { slots: m?.paineis ?? {}, rodada, ultimoInicio: rodada ? new Date(rodada.inicio) : null, pausaAte: m?.pausa_ate ? new Date(m.pausa_ate) : null };
}

async function gravar(job: string, status: 'ok' | 'error', ms: number, meta: Record<string, unknown>): Promise<void> {
  await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
    VALUES (${job}, 'telegram', now(), now(), ${Math.round(ms)}, ${status}, ${JSON.stringify(meta)}::jsonb)`);
}

function scrub(s: string, token: string): string {
  return s.split(token).join('***').replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***').slice(0, 200);
}

interface RespTg { ok: boolean; status: number; desc: string; messageId?: string; retryAfter?: number }
async function tg(token: string, metodo: string, payload: Record<string, unknown>): Promise<RespTg> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const b = ((await res.json().catch(() => ({}))) ?? {}) as { ok?: boolean; description?: string; result?: { message_id?: number }; parameters?: { retry_after?: number } };
    return {
      ok: res.status === 200 && b.ok === true, status: res.status, desc: scrub(String(b.description ?? `HTTP ${res.status}`), token),
      messageId: b.result?.message_id != null ? String(b.result.message_id) : undefined, retryAfter: b.parameters?.retry_after,
    };
  } catch (e) {
    return { ok: false, status: 0, desc: `rede: ${scrub(e instanceof Error ? e.message : 'falha', token)}` };
  }
}

async function chatDoAlvo(alvo: Alvo): Promise<string | undefined> {
  if (alvo === 'privado') return process.env.TELEGRAM_ALERT_CHAT_ID || undefined;
  const st = await getStoreByVertical('impressao3d', { fresh: true }).catch(() => null);
  return st && st.telegramChatId && st.telegramVerifiedAt && st.telegramBotCanPost ? chatForStore(st) : undefined;
}

type Tarefa = { tipo: 'upsert'; key: string; text: string; hash: string } | { tipo: 'apagar'; key: string };

async function rodarAlvo(alvo: Alvo, obterPainel: (inicio: Date) => Promise<SaidaPaineis>, now: Date, deadline: number, force: boolean): Promise<ResultadoAlvo> {
  const job = jobDe(alvo);
  const t0 = Date.now();
  const est = await lerEstado(job);
  if (est.pausaAte && est.pausaAte > now) return { alvo, acao: 'pausado' };
  const emAndamento = !!est.rodada?.aberta;
  if (!emAndamento && !force && est.ultimoInicio && now.getTime() - est.ultimoInicio.getTime() < INTERVALO_RODADA_MS) return { alvo, acao: 'recente' };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = token ? await chatDoAlvo(alvo) : undefined;
  if (!token || !chat) return { alvo, acao: 'sem_destino' };
  const inicio = emAndamento ? new Date(est.rodada!.inicio) : now;
  const p = await obterPainel(inicio);
  if (!p.paineis.length) {
    await gravar(job, 'error', Date.now() - t0, { tipo: 'sem_painel', problemas: p.problemas.slice(0, 5), paineis: est.slots, rodada: { inicio: inicio.toISOString(), cursor: 0, aberta: false } });
    return { alvo, acao: 'sem_painel' };
  }
  const tarefas: Tarefa[] = p.paineis.map((x) => ({ tipo: 'upsert', key: x.key, text: x.text, hash: sha(x.text) }));
  for (const k of Object.keys(est.slots)) if (!p.paineis.some((x) => x.key === k)) tarefas.push({ tipo: 'apagar', key: k });
  const slots: Record<string, Slot> = { ...est.slots };
  const c = { chamadas: 0, enviados: 0, editados: 0, inalterados: 0, apagados: 0, erros: 0 };
  const erros: string[] = [];
  let cursor = emAndamento ? Math.min(est.rodada!.cursor, tarefas.length) : 0;
  let pausaAte: string | undefined;
  let fixado: boolean | null = null;

  for (; cursor < tarefas.length; cursor++) {
    const t = tarefas[cursor];
    if (t.tipo === 'upsert' && slots[t.key]?.hash === t.hash) { c.inalterados++; continue; }
    if (deadline - Date.now() < MIN_CHAMADA_MS) break;
    if (c.chamadas > 0) await dormir(ESPACO_MS);
    let r: RespTg;
    if (t.tipo === 'apagar') {
      r = await tg(token, 'deleteMessage', { chat_id: chat, message_id: Number(slots[t.key].message_id) });
      c.chamadas++;
      if (r.ok || /not found/i.test(r.desc)) { delete slots[t.key]; c.apagados++; continue; }
    } else {
      const corpo = { chat_id: chat, text: t.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
      const ant = slots[t.key];
      r = ant ? await tg(token, 'editMessageText', { ...corpo, message_id: Number(ant.message_id) }) : await tg(token, 'sendMessage', { ...corpo, disable_notification: true });
      c.chamadas++;
      if (ant && (r.ok || /not modified/i.test(r.desc))) { slots[t.key] = { message_id: ant.message_id, hash: t.hash }; c.editados++; continue; }
      if (!ant && r.ok && r.messageId) {
        slots[t.key] = { message_id: r.messageId, hash: t.hash };
        c.enviados++;
        if (t.key === 'ml-00') {
          await dormir(ESPACO_MS);
          const pin = await tg(token, 'pinChatMessage', { chat_id: chat, message_id: Number(r.messageId), disable_notification: true });
          fixado = pin.ok;
        }
        continue;
      }
      // Mensagem apagada no Telegram: reenvia como nova e troca o id.
      if (ant && r.status === 400 && /not found|message_id_invalid|can't be edited|to edit/i.test(r.desc)) {
        await dormir(ESPACO_MS);
        const s = await tg(token, 'sendMessage', { ...corpo, disable_notification: true });
        c.chamadas++;
        if (s.ok && s.messageId) { slots[t.key] = { message_id: s.messageId, hash: t.hash }; c.enviados++; continue; }
        r = s;
      }
    }
    if (r.status === 429) { pausaAte = new Date(Date.now() + (r.retryAfter ?? 5) * 1000).toISOString(); break; }
    c.erros++;
    if (erros.length < 3) erros.push(`${t.key}: ${r.desc}`);
  }
  const concluida = cursor >= tarefas.length;
  const rodada: Rodada = { inicio: inicio.toISOString(), cursor: concluida ? 0 : cursor, aberta: !concluida };
  await gravar(job, c.erros ? 'error' : 'ok', Date.now() - t0, { tipo: 'painel', paineis: slots, rodada, pausa_ate: pausaAte, ...c, total: tarefas.length, ativosMl: p.ativosMl, ativosAmazon: p.ativosAmazon, fixado, erros });
  return { alvo, acao: c.erros && concluida ? 'erro' : concluida ? 'concluida' : 'em_andamento', ...c, paineis: p.paineis.length, cursor, erro: erros[0] };
}

/**
 * Entrada do cron. `budgetMs` = tempo que o ciclo permite. Nunca lança. Sem flag = não faz nada.
 * dryRun: monta e devolve os textos sem chamar o Telegram nem gravar.
 */
export async function atualizarPaineisImpressoras(now: Date = new Date(), opts: { budgetMs?: number; force?: boolean; alvos?: Alvo[] } = {}): Promise<ResultadoPaineis> {
  const alvos = (opts.alvos ?? alvosLigados()).filter((a, i, arr) => arr.indexOf(a) === i);
  if (!alvos.length) return { ligado: false, alvos: [] };
  const deadline = Date.now() + (opts.budgetMs ?? 25_000);
  const out: ResultadoPaineis = { ligado: true, alvos: [] };
  let painel: SaidaPaineis | null = null;
  let ofertas: OfertaPainel[] | null = null;
  // Carrega as ofertas uma vez por ciclo e só quando um destino precisa; o texto usa a hora de início da rodada (estável entre minutos).
  const obterPainel = async (inicio: Date): Promise<SaidaPaineis> => {
    ofertas ??= await carregarOfertasImpressoras(now);
    painel = montarPaineis({ ofertas, inicio, adTag: getAdTag() });
    return painel;
  };
  for (const alvo of alvos) {
    try {
      if (Date.now() > deadline - MIN_CHAMADA_MS) { out.alvos.push({ alvo, acao: 'em_andamento' }); continue; }
      const r = await rodarAlvo(alvo, obterPainel, now, deadline, !!opts.force);
      out.alvos.push(r);
    } catch (e) {
      console.error('[painel-impressoras] falhou:', alvo, e instanceof Error ? e.message : e);
      out.alvos.push({ alvo, acao: 'erro', erro: e instanceof Error ? e.message.slice(0, 120) : 'erro' });
    }
  }
  const pn = painel as SaidaPaineis | null;
  if (pn) { out.ativosMl = pn.ativosMl; out.ativosAmazon = pn.ativosAmazon; out.problemas = pn.problemas.slice(0, 5); }
  return out;
}

