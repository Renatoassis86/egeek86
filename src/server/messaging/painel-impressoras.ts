import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getAdTag } from '@/lib/messaging/group-config';
import { GROUP_LINK_BASE } from '@/lib/messaging/group-messages';
import { classificarTipo } from '@/lib/catalog/tipos-produto';
import { ehItemMiudoOuDuvida } from '@/lib/catalog/item-miudo';
import { beneficiosVivosPorOferta } from '@/server/coupons/card-benefits';
import { rotuloBeneficioCartao } from '@/lib/coupons/card-benefit';
import { lookupItemCouponDetail } from '@/server/messaging/coupon-item-lookup';
import { decidir, quedaMinimaCents, INTERVALO_MIN_MS, JANELA_MINIMO_DIAS, type MenorPreco } from '@/lib/coupons/monitor-preco-impressoras';
import {
  alvosLigados, INTERVALO_RODADA_MS, MAX_QUEDAS_POR_CICLO, montarPaineis, QUEDA_MAX_PLAUSIVEL_PCT, secaoDe, textoQuedaSeguro,
  type Alvo, type OfertaPainel, type SaidaPaineis,
} from '@/lib/messaging/painel-impressoras';

/**
 * LISTA das impressoras 3D no chat PRIVADO do dono (#117; o CANAL não recebe lista nem painel, decisão do dono 2026-11-15):
 *  - a cada 10 min uma lista NOVA (silenciosa, sem foto) com TODAS as impressoras ativas, frescas (24 h) e fora da quarentena do ML e da Amazon,
 *    combos P2S/P1S primeiro; a lista do ciclo anterior é APAGADA (deleteMessage) quando a nova termina;
 *  - queda de preço por anúncio (>= 2% ou R$ 50 sobre o último preço visto, ou novo mínimo de 14 dias do anúncio): mensagem INDIVIDUAL com som,
 *    no máximo 6 por ciclo (combos primeiro, maiores quedas primeiro), cooldown de 2 h por oferta; reutiliza `decidir` do monitor #114.
 * Estado em collector_runs (sem tabela nova): 'lista-impressoras' (lista congelada do ciclo + preços), 'lista-impressoras-privado' (cursor e ids
 * de mensagem do destino), 'lista-impressoras-queda' (cooldown). Flag PAINEL_IMPRESSORAS (1/on/privado liga; padrão desligada).
 * Roda no cron de group-messages (a cada minuto) com o tempo que sobra; 1,2 s entre chamadas; 429 pausa e retoma no cursor. Nunca lança.
 * Nunca imprime token nem chat id.
 */
const ESPACO_MS = 1200;
const MIN_CHAMADA_MS = 2500;
const JOB_LISTA = 'lista-impressoras';
const JOB_QUEDA = 'lista-impressoras-queda';
const jobDestino = (alvo: Alvo) => `lista-impressoras-${alvo}`;
const JOB_LEGADO = (alvo: Alvo) => `painel-impressoras-${alvo}`;

interface ItemTexto { key: string; rede: 'mercado-livre' | 'amazon'; text: string }
interface QuedaTexto { oferta: string; text: string }
interface ListaCongelada { inicio: string; listas: ItemTexto[]; quedas: QuedaTexto[]; precos: Record<string, number>; ativosMl: number; ativosAmazon: number; problemas: string[] }
interface Estado { lista: string | null; cursor: number; ids: (string | null)[]; apagar: string[]; aberta: boolean; pausaAte: Date | null }

export interface ResultadoAlvo {
  alvo: Alvo;
  acao: 'recente' | 'pausado' | 'sem_destino' | 'sem_lista' | 'em_andamento' | 'concluida' | 'erro';
  chamadas?: number; enviados?: number; quedas?: number; apagados?: number; erros?: number; partes?: number; cursor?: number; erro?: string;
}
export interface ResultadoPaineis { ligado: boolean; alvos: ResultadoAlvo[]; gerada?: boolean; ativosMl?: number; ativosAmazon?: number; quedas?: number; problemas?: string[] }

interface RowOferta {
  id: string; master_id: string; master_name: string; title: string | null; rede: string; loja: string | null; price: string; url: string | null; slug: string;
  checked: Date | string; rating: string | null; nivel: string | null;
}

const id12 = (id: string) => id.replace(/-/g, '').slice(0, 12);

/** Impressoras (aparelhos) do ML e da Amazon: tipo 'impressoras' do site; sem item miúdo; ativas, <= 24 h, sem quarentena. */
export async function carregarOfertasImpressoras(now: Date): Promise<(OfertaPainel & { id: string })[]> {
  const rows = (await db.execute<RowOferta & Record<string, unknown>>(sql`
    SELECT o.id::text AS id, m.id::text AS master_id, m.name AS master_name, o.title, nn.slug AS rede,
           COALESCE(NULLIF(o.store_name, ''), s.nickname) AS loja, o.current_price_cents::text AS price,
           o.affiliate_url AS url, o.slug, o.last_checked_at AS checked, s.positive_rating_percent::text AS rating, s.reputation_level AS nivel
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
      id: r.id, title: r.title, masterId: r.master_id, masterName: r.master_name, rede: r.rede, loja: r.loja, cents: Number(r.price),
      url: r.url || (r.slug ? `${GROUP_LINK_BASE}/go/${encodeURIComponent(r.slug)}` : null), checkedAt: new Date(r.checked),
      reputacao: r.rating ? `${Math.round(Number(r.rating))}% de avaliações positivas` : null,
    }));
  // Cartão: todas as ofertas (uma consulta). Cupom lido na página: só os 8 menores de cada modelo em destaque e rede (as demais saem sem cupom).
  const cartoes = await beneficiosVivosPorOferta(base.map((o) => o.id)).catch(() => new Map());
  const alvos = new Map<string, typeof base>();
  for (const o of base) {
    const sc = secaoDe(o);
    if (!sc.destaque) continue;
    const k = `${sc.chave}|${o.rede}`;
    alvos.set(k, [...(alvos.get(k) ?? []), o]);
  }
  const top = [...alvos.values()].flatMap((l) => l.sort((a, b) => a.cents - b.cents).slice(0, 8));
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
    return { ...o, cupomFinalCents: c?.final ?? null, cupomNome: c?.nome ?? null, beneficios: bs };
  });
}

async function ultimaLista(): Promise<ListaCongelada | null> {
  const r = (await db.execute<{ meta: ListaCongelada | null }>(sql`SELECT meta FROM collector_runs WHERE job = ${JOB_LISTA} AND status = 'ok' ORDER BY started_at DESC LIMIT 1`)) as unknown as { meta: ListaCongelada | null }[];
  return r[0]?.meta ?? null;
}

async function gravar(job: string, status: 'ok' | 'error', ms: number, meta: Record<string, unknown>): Promise<void> {
  await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
    VALUES (${job}, 'telegram', now(), now(), ${Math.round(ms)}, ${status}, ${JSON.stringify(meta)}::jsonb)`);
}

/** Gera a lista do ciclo (e as quedas) e a congela em collector_runs. gravar=false = pré-visualização (nada é gravado). */
export async function gerarLista(now: Date, gravarLista = true): Promise<ListaCongelada> {
  const t0 = Date.now();
  const ofertas = await carregarOfertasImpressoras(now);
  const anterior = await ultimaLista();
  const prev = anterior && now.getTime() - new Date(anterior.inicio).getTime() < 3 * 3600_000 ? anterior.precos : null;
  const comAnterior: (OfertaPainel & { id: string })[] = ofertas.map((o) => ({ ...o, anteriorCents: prev ? (prev[id12(o.id)] ?? null) : null }));

  // Quedas: só com base do ciclo anterior. Cooldown de 2 h por oferta (collector_runs). Novo mínimo = abaixo do menor preço do anúncio em 14 dias.
  const quedas: QuedaTexto[] = [];
  const problemas: string[] = [];
  const caiu = comAnterior.filter((o) => o.anteriorCents && o.cents < o.anteriorCents && (o.anteriorCents - o.cents) * 100 / o.anteriorCents <= QUEDA_MAX_PLAUSIVEL_PCT);
  if (caiu.length) {
    const recentes = (await db.execute<{ oferta: string }>(sql`SELECT meta->>'oferta' AS oferta FROM collector_runs WHERE job = ${JOB_QUEDA} AND started_at > now() - ${INTERVALO_MIN_MS / 1000}::int * interval '1 second'`)) as unknown as { oferta: string }[];
    const emCooldown = new Set(recentes.map((r) => r.oferta));
    const ids = caiu.map((o) => o.id);
    const mins = (await db.execute<{ id: string; mn: string }>(sql`
      SELECT offer_id::text AS id, min(price_cents)::text AS mn FROM affiliate_price_snapshots
      WHERE offer_id::text IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND collected_at > now() - (${JANELA_MINIMO_DIAS}::int * interval '1 day') AND collected_at < now() - interval '30 minutes'
      GROUP BY 1`)) as unknown as { id: string; mn: string }[];
    const min14 = new Map(mins.map((m) => [m.id, Number(m.mn)]));
    type Cand = { o: (typeof caiu)[number]; acao: 'queda' | 'minimo'; min: boolean; ordem: number };
    const cands: Cand[] = [];
    for (const o of caiu) {
      if (emCooldown.has(o.id)) continue;
      const atual: MenorPreco = { chave: o.id, rotulo: o.masterName, cents: o.cents, rede: o.rede, loja: o.loja, slug: '' };
      const acao = decidir({ atual, base: { cents: o.anteriorCents as number, rede: o.rede }, min14: min14.get(o.id) ?? null, ultimoAvisoEm: null, now });
      if (acao !== 'queda' && acao !== 'minimo') continue;
      const sc = secaoDe(o);
      cands.push({ o, acao, min: min14.has(o.id) && o.cents < (min14.get(o.id) as number), ordem: sc.rank * 100 + sc.ordemFixa });
    }
    cands.sort((a, b) => a.ordem - b.ordem || ((b.o.anteriorCents as number) - b.o.cents) - ((a.o.anteriorCents as number) - a.o.cents));
    for (const c of cands.slice(0, MAX_QUEDAS_POR_CICLO)) {
      const o = c.o;
      let cupom: { nome: string | null; finalCents: number; passo: string | null } | null = null;
      try {
        const r = await lookupItemCouponDetail(o.id, undefined, now);
        if (r && r.detail.finalCents > 0 && r.detail.finalCents < o.cents) cupom = { nome: r.detail.named ? r.detail.name : null, finalCents: r.detail.finalCents, passo: r.detail.activation || null };
      } catch { /* sem cupom */ }
      const bens = ((await beneficiosVivosPorOferta([o.id]).catch(() => new Map())).get(o.id) ?? []) as (Parameters<typeof rotuloBeneficioCartao>[0] & { needsConfirm: boolean; kind: string; finalPriceCents: number | null })[];
      const cartoes = bens.filter((b) => b.kind === 'cartao_pct' || b.kind === 'pix_pct').map((b) => ({ rotulo: rotuloBeneficioCartao(b) ?? '', finalCents: b.finalPriceCents, needsConfirm: b.needsConfirm })).filter((b) => b.rotulo);
      const t = textoQuedaSeguro({
        rede: o.rede, titulo: o.title || o.masterName, loja: o.loja, reputacao: (o as { reputacao?: string | null }).reputacao ?? null, cents: o.cents, anteriorCents: o.anteriorCents as number,
        minimo14: c.min, url: o.url, leituraEm: o.checkedAt, cupom, cartoes, adTag: getAdTag(),
      });
      if (t.text) quedas.push({ oferta: o.id, text: t.text }); else problemas.push(`queda ${id12(o.id)}: ${t.problemas.join('; ')}`);
    }
  }
  const p: SaidaPaineis = montarPaineis({ ofertas: comAnterior, inicio: now, adTag: getAdTag() });
  const precos: Record<string, number> = {};
  for (const o of ofertas) precos[id12(o.id)] = o.cents;
  const lista: ListaCongelada = {
    inicio: now.toISOString(), listas: p.paineis.map((x) => ({ key: x.key, rede: x.rede, text: x.text })), quedas, precos,
    ativosMl: p.ativosMl, ativosAmazon: p.ativosAmazon, problemas: [...problemas, ...p.problemas].slice(0, 8),
  };
  if (gravarLista) {
    await gravar(JOB_LISTA, 'ok', Date.now() - t0, lista as unknown as Record<string, unknown>);
    for (const q of quedas) await gravar(JOB_QUEDA, 'ok', 0, { oferta: q.oferta });
    await db.execute(sql`DELETE FROM collector_runs WHERE job = ${JOB_LISTA} AND started_at < (SELECT min(started_at) FROM (SELECT started_at FROM collector_runs WHERE job = ${JOB_LISTA} ORDER BY started_at DESC LIMIT 3) x)`).catch(() => undefined);
  }
  return lista;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function scrub(s: string, token: string): string { return s.split(token).join('***').replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***').slice(0, 200); }

interface RespTg { ok: boolean; status: number; desc: string; messageId?: string; retryAfter?: number }
async function tg(token: string, metodo: string, payload: Record<string, unknown>): Promise<RespTg> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const b = ((await res.json().catch(() => ({}))) ?? {}) as { ok?: boolean; description?: string; result?: { message_id?: number }; parameters?: { retry_after?: number } };
    return { ok: res.status === 200 && b.ok === true, status: res.status, desc: scrub(String(b.description ?? `HTTP ${res.status}`), token), messageId: b.result?.message_id != null ? String(b.result.message_id) : undefined, retryAfter: b.parameters?.retry_after };
  } catch (e) {
    return { ok: false, status: 0, desc: `rede: ${scrub(e instanceof Error ? e.message : 'falha', token)}` };
  }
}

async function lerEstado(alvo: Alvo): Promise<Estado & { legado: string[] }> {
  const r = (await db.execute<{ meta: { lista?: string; cursor?: number; ids?: (string | null)[]; apagar?: string[]; aberta?: boolean; pausa_ate?: string } | null }>(sql`
    SELECT meta FROM collector_runs WHERE job = ${jobDestino(alvo)} ORDER BY started_at DESC LIMIT 1`)) as unknown as { meta: { lista?: string; cursor?: number; ids?: (string | null)[]; apagar?: string[]; aberta?: boolean; pausa_ate?: string } | null }[];
  const m = r[0]?.meta;
  // Painéis editados do desenho anterior (se existirem): entram na faxina da primeira lista. Só ids que o próprio painel guardou.
  let legado: string[] = [];
  if (!m) {
    const l = (await db.execute<{ meta: { paineis?: Record<string, { message_id: string }> } | null }>(sql`SELECT meta FROM collector_runs WHERE job = ${JOB_LEGADO(alvo)} ORDER BY started_at DESC LIMIT 1`)) as unknown as { meta: { paineis?: Record<string, { message_id: string }> } | null }[];
    legado = Object.values(l[0]?.meta?.paineis ?? {}).map((x) => x.message_id);
  }
  return { lista: m?.lista ?? null, cursor: m?.cursor ?? 0, ids: m?.ids ?? [], apagar: m?.apagar ?? [], aberta: !!m?.aberta, pausaAte: m?.pausa_ate ? new Date(m.pausa_ate) : null, legado };
}

async function rodarAlvo(alvo: Alvo, L: ListaCongelada, now: Date, deadline: number): Promise<ResultadoAlvo> {
  const t0 = Date.now();
  const est = await lerEstado(alvo);
  if (est.pausaAte && est.pausaAte > now) return { alvo, acao: 'pausado' };
  if (est.lista === L.inicio && !est.aberta) return { alvo, acao: 'recente' };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = alvo === 'privado' ? process.env.TELEGRAM_ALERT_CHAT_ID : undefined;
  if (!token || !chat) return { alvo, acao: 'sem_destino' };
  if (!L.listas.length && !L.quedas.length) { await gravar(jobDestino(alvo), 'error', Date.now() - t0, { tipo: 'sem_lista', problemas: L.problemas, lista: L.inicio, cursor: 0, ids: [], apagar: est.apagar, aberta: false }); return { alvo, acao: 'sem_lista' }; }

  let { cursor, ids, apagar } = est;
  if (est.lista !== L.inicio) {
    // Lista nova: o que já foi enviado de uma lista anterior (inclusive incompleta) e os painéis antigos entram na faxina.
    apagar = [...new Set([...apagar, ...ids.filter((x): x is string => !!x), ...est.legado])];
    ids = [];
    cursor = 0;
  }
  const Q = L.quedas.length;
  const total = Q + L.listas.length;
  const c = { chamadas: 0, enviados: 0, quedas: 0, apagados: 0, erros: 0 };
  const erros: string[] = [];
  let pausaAte: string | undefined;

  while (cursor < total && deadline - Date.now() >= MIN_CHAMADA_MS) {
    if (c.chamadas > 0) await dormir(ESPACO_MS);
    const ehQueda = cursor < Q;
    const texto = ehQueda ? L.quedas[cursor].text : L.listas[cursor - Q].text;
    // Queda com som; lista silenciosa. Sem foto, sem pré-visualização de link.
    const r = await tg(token, 'sendMessage', { chat_id: chat, text: texto, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, disable_notification: !ehQueda });
    c.chamadas++;
    if (r.status === 429) { pausaAte = new Date(Date.now() + (r.retryAfter ?? 5) * 1000).toISOString(); break; }
    if (r.ok && r.messageId) {
      if (ehQueda) c.quedas++; else { ids[cursor - Q] = r.messageId; c.enviados++; }
    } else { c.erros++; if (erros.length < 3) erros.push(`${ehQueda ? 'queda' : 'parte'} ${cursor}: ${r.desc}`); }
    cursor++;
  }
  // Lista completa: apaga as mensagens da lista anterior (se o delete falhar por idade/permissão, segue).
  while (cursor >= total && !pausaAte && apagar.length && deadline - Date.now() >= MIN_CHAMADA_MS) {
    if (c.chamadas > 0) await dormir(ESPACO_MS);
    const id = apagar[0];
    const r = await tg(token, 'deleteMessage', { chat_id: chat, message_id: Number(id) });
    c.chamadas++;
    if (r.status === 429) { pausaAte = new Date(Date.now() + (r.retryAfter ?? 5) * 1000).toISOString(); break; }
    apagar.shift();
    if (r.ok) c.apagados++; else if (!/not found/i.test(r.desc) && erros.length < 3) erros.push(`apagar: ${r.desc}`);
  }
  const concluida = cursor >= total && apagar.length === 0;
  await gravar(jobDestino(alvo), c.erros ? 'error' : 'ok', Date.now() - t0, { tipo: 'lista', lista: L.inicio, cursor, ids, apagar, aberta: !concluida, pausa_ate: pausaAte, ...c, total, erros });
  return { alvo, acao: concluida ? (c.erros ? 'erro' : 'concluida') : 'em_andamento', ...c, partes: L.listas.length, cursor, erro: erros[0] };
}

/**
 * Entrada do cron. `budgetMs` = tempo que o ciclo permite. Nunca lança. Sem flag = não faz nada.
 * Gera a lista a cada 10 min (uma por ciclo, compartilhada pelos destinos) e a entrega com cursor.
 */
export async function atualizarPaineisImpressoras(now: Date = new Date(), opts: { budgetMs?: number; force?: boolean; alvos?: Alvo[] } = {}): Promise<ResultadoPaineis> {
  const alvos = opts.alvos ?? alvosLigados();
  if (!alvos.length) return { ligado: false, alvos: [] };
  const deadline = Date.now() + (opts.budgetMs ?? 25_000);
  const out: ResultadoPaineis = { ligado: true, alvos: [] };
  try {
    let L = await ultimaLista();
    if (opts.force || !L || now.getTime() - new Date(L.inicio).getTime() >= INTERVALO_RODADA_MS) {
      L = await gerarLista(now, true);
      out.gerada = true;
    }
    out.ativosMl = L.ativosMl; out.ativosAmazon = L.ativosAmazon; out.quedas = L.quedas.length; out.problemas = L.problemas;
    for (const alvo of alvos) {
      try { out.alvos.push(await rodarAlvo(alvo, L, now, deadline)); }
      catch (e) { console.error('[lista-impressoras] falhou:', alvo, e instanceof Error ? e.message : e); out.alvos.push({ alvo, acao: 'erro', erro: e instanceof Error ? e.message.slice(0, 120) : 'erro' }); }
    }
  } catch (e) {
    console.error('[lista-impressoras] falhou:', e instanceof Error ? e.message : e);
    out.alvos.push({ alvo: 'privado', acao: 'erro', erro: e instanceof Error ? e.message.slice(0, 120) : 'erro' });
  }
  return out;
}
