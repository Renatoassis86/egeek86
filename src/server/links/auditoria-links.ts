import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditarCartoes, lerCartoes, type ResultadoAuditoria } from '@/lib/links/polycard';
import { auditarPorApi, registrarBloqueio, reservarSlot, type ListaCatalogo } from '@/server/links/ritmo-e-api';
import { VEREDITOS_BLOQUEANTES } from '@/lib/messaging/confirmacao-preco';

/**
 * Auditoria dos links afiliados do Mercado Livre (#119): resolve no SERVIDOR o link meli.la (segue os redirecionamentos até a página do
 * perfil de afiliado, sem Chrome e sem a aba do dono), lê o cartão embutido (polycards) e compara com a oferta: anúncio, preço (0,5%), pausado.
 * Ritmo: 1 requisição a cada 1,2 a 2 s, User-Agent fixo, para em 429/captcha e retoma no ciclo seguinte. Grava em offer_link_audit; collector_runs
 * job `auditoria-links`. Amazon e Shopee não usam esta via (preço vem da leitura da página/API que já existe). Nunca imprime token.
 */
export const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type Leitura = { ok: true; html: string } | { ok: false; parar: boolean; nota: string };

export async function resolverLinkMl(url: string, fetchImpl: typeof fetch = fetch): Promise<Leitura> {
  try {
    const res = await fetchImpl(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' }, signal: AbortSignal.timeout(12_000) });
    if (res.status === 429) return { ok: false, parar: true, nota: 'http_429' };
    if (/captcha|account-verification|gz\/user-logged/i.test(res.url)) return { ok: false, parar: true, nota: 'captcha' };
    if (res.status !== 200) return { ok: false, parar: res.status >= 500 ? false : res.status === 403, nota: `http_${res.status}` };
    const html = await res.text();
    if (!html.includes('"polycards":[')) return { ok: false, parar: /captcha/i.test(html.slice(0, 5000)), nota: html.length < 20_000 ? 'pagina_curta_sem_polycards' : 'sem_polycards' };
    return { ok: true, html };
  } catch (e) {
    return { ok: false, parar: false, nota: `rede: ${e instanceof Error ? e.message.slice(0, 60) : 'erro'}` };
  }
}

/** Versão da regra de comparação gravada em cada veredito: 2 = tolerância maior entre R$ 1,00 e 0,1% (1 = 0,5%, reauditar). */
export const REGRA_VERSAO = 2;

export interface AlvoAuditoria {
  offerId: string;
  link: string | null;
  itemEsperado: string | null;
  catalogo: string | null;
  precoCents: number;
}

export type Escopo = 'privado' | 'bambu' | 'canal' | 'combos' | 'impressoras' | 'resto';
/** Masters do privado do dono (P2S Combo e P1S Combo): auditados primeiro. Mantido igual a MASTERS_PRIVADO. */
const MASTERS_PRIVADO_IDS = ['2e4a5bd1-27d7-42c6-bc62-dfa1d5eace45', '23bfa05b-053e-46cc-8308-7d4332fadf18'];
const COMBO = 'P2S.*Combo|P1S.*Combo|A1 Combo';

/** Ofertas ML ativas com link a auditar, as sem auditoria ou com a mais velha primeiro. `ateMin`: reaudita só as auditadas há mais que isto. */
export async function carregarAlvos(escopo: Escopo, limite: number, ateMin: number, shard?: { i: number; n: number }): Promise<AlvoAuditoria[]> {
  const frag = shard && shard.n > 1 ? sql`AND abs(hashtext(o.id::text)) % ${shard.n} = ${shard.i}` : sql``;
  const filtro =
    escopo === 'privado' ? sql`o.master_product_id::text IN (${sql.join(MASTERS_PRIVADO_IDS.map((i) => sql`${i}`), sql`, `)}) AND NOT EXISTS (SELECT 1 FROM (SELECT verdict, checked_at, regra_versao FROM offer_link_audit k WHERE k.offer_id = o.id ORDER BY checked_at DESC LIMIT 1) l WHERE l.verdict = 'ok' AND l.regra_versao >= ${REGRA_VERSAO} AND l.checked_at > now() - make_interval(mins => ${ateMin}) AND l.checked_at >= GREATEST(coalesce(o.last_price_change_at, '-infinity'::timestamptz), coalesce(o.item_trocado_at, '-infinity'::timestamptz)))`
    : escopo === 'bambu' ? sql`o.vertical = 'impressao3d' AND m.name ~* 'bambu' AND NOT EXISTS (SELECT 1 FROM (SELECT verdict, checked_at, regra_versao FROM offer_link_audit k WHERE k.offer_id = o.id ORDER BY checked_at DESC LIMIT 1) l WHERE l.verdict = 'ok' AND l.regra_versao >= ${REGRA_VERSAO} AND l.checked_at > now() - make_interval(mins => ${ateMin}) AND l.checked_at >= GREATEST(coalesce(o.last_price_change_at, '-infinity'::timestamptz), coalesce(o.item_trocado_at, '-infinity'::timestamptz)))`
    : escopo === 'canal' ? sql`o.id IN (SELECT offer_id FROM group_messages WHERE created_at > now() - interval '24 hours' AND status IN ('enviada','proposta','proposta_auto') AND offer_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM (SELECT verdict, checked_at, regra_versao FROM offer_link_audit k WHERE k.offer_id = o.id ORDER BY checked_at DESC LIMIT 1) l WHERE l.verdict = 'ok' AND l.regra_versao >= ${REGRA_VERSAO} AND l.checked_at > now() - make_interval(mins => ${ateMin}) AND l.checked_at >= GREATEST(coalesce(o.last_price_change_at, '-infinity'::timestamptz), coalesce(o.item_trocado_at, '-infinity'::timestamptz)))`
    : escopo === 'combos' ? sql`o.vertical = 'impressao3d' AND m.name ~* ${COMBO}`
    : escopo === 'impressoras' ? sql`o.vertical = 'impressao3d' AND NOT (m.name ~* ${COMBO})`
    : sql`o.vertical <> 'impressao3d'`;
  const rows = (await db.execute(sql`
    SELECT o.id::text AS id, o.affiliate_url AS link, COALESCE(o.link_item_id, o.external_item_id) AS item, o.external_ref AS cat, o.current_price_cents::int AS cents
    FROM affiliate_offers o
    JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
    JOIN master_products m ON m.id = o.master_product_id
    LEFT JOIN LATERAL (SELECT max(checked_at) AS ult FROM offer_link_audit a WHERE a.offer_id = o.id) au ON true
    LEFT JOIN (SELECT offer_id, count(*) AS c FROM group_messages WHERE created_at > now() - interval '24 hours' AND offer_id IS NOT NULL GROUP BY 1) fr ON fr.offer_id = o.id
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0 AND ${filtro}
      AND (${escopo === 'privado' || escopo === 'canal' || escopo === 'bambu' ? sql`true` : sql`au.ult IS NULL OR au.ult < now() - make_interval(mins => ${ateMin})`}) ${frag}
    ORDER BY coalesce(fr.c, 0) DESC, au.ult ASC NULLS FIRST, o.current_price_cents DESC
    LIMIT ${limite}`)) as unknown as { id: string; link: string | null; item: string | null; cat: string | null; cents: number }[];
  return rows.map((r) => ({ offerId: r.id, link: r.link, itemEsperado: r.item, catalogo: r.cat && /^MLB\d+$/.test(r.cat) ? r.cat : null, precoCents: Number(r.cents) }));
}

export interface ResultadoLote { lidas: number; porVeredito: Record<string, number>; parou: string | null; linhas: { alvo: AlvoAuditoria; r: ResultadoAuditoria }[] }

/** Audita até `limite` alvos dentro de `orcamentoMs`. Grava cada veredito. Para em 429/captcha. Nunca lança. */
export async function auditarLote(alvos: AlvoAuditoria[], orcamentoMs: number, opts: { gravar?: boolean; fetchImpl?: typeof fetch } = {}): Promise<ResultadoLote> {
  const out: ResultadoLote = { lidas: 0, porVeredito: {}, parou: null, linhas: [] };
  const fim = Date.now() + orcamentoMs;
  const cache = new Map<string, Leitura>();
  const listas = new Map<string, ListaCatalogo>();
  for (const a of alvos) {
    if (Date.now() > fim - 3000) break;
    let r: ResultadoAuditoria;
    if (!a.link || !/^https?:\/\//.test(a.link)) r = { verdict: 'sem_link', cartao: null, diffPct: null, nota: 'oferta sem link' };
    else if (!/meli\.la\//i.test(a.link)) r = await auditarPorApi(a, listas).catch((e) => ({ verdict: 'erro_leitura' as const, cartao: null, diffPct: null, nota: `api: ${e instanceof Error ? e.message.slice(0, 60) : 'erro'}` }));
    else {
      let leitura = cache.get(a.link);
      if (!leitura) {
        const slot = await reservarSlot().catch(async () => { await dormir(400); return reservarSlot(); });
        if (!slot.ok) { out.parou = 'recuo_global (captcha/429 recente)'; break; }
        if (slot.esperaMs > Math.max(0, fim - Date.now() - 3000)) { out.parou = 'sem_orcamento_para_o_ritmo'; break; }
        if (slot.esperaMs > 0) await dormir(slot.esperaMs);
        leitura = await resolverLinkMl(a.link, opts.fetchImpl);
        cache.set(a.link, leitura);
        out.lidas++;
      }
      if (!leitura.ok) {
        if (leitura.parar) { out.parou = leitura.nota; await registrarBloqueio(leitura.nota); break; }
        r = { verdict: 'erro_leitura', cartao: null, diffPct: null, nota: leitura.nota };
      } else {
        r = auditarCartoes(lerCartoes(leitura.html), { itemId: a.itemEsperado, productId: a.catalogo, precoCents: a.precoCents });
      }
    }
    out.porVeredito[r.verdict] = (out.porVeredito[r.verdict] ?? 0) + 1;
    out.linhas.push({ alvo: a, r });
    if (opts.gravar !== false) {
      // A conexão do pooler fecha por ociosidade durante a espera do ritmo (2 s) e das chamadas à API: uma nova tentativa reabre a conexão.
      for (let t = 0; ; t++) try { await db.execute(sql`
        INSERT INTO offer_link_audit (offer_id, link, item_id_link, product_id_link, price_link_cents, status_link, offer_price_cents, diff_pct, verdict, note, regra_versao)
        VALUES (${a.offerId}::uuid, ${a.link}, ${r.cartao?.itemId ?? null}, ${r.cartao?.productId ?? null}, ${r.cartao?.precoCents ?? null}, ${r.cartao ? (r.cartao.pausado ? 'pausado' : 'ativo') : null},
                ${a.precoCents}, ${r.diffPct}, ${r.verdict}, ${r.nota.slice(0, 200)}, ${REGRA_VERSAO})`); break; } catch (e) { if (t >= 2) throw e; await dormir(400); }
    }
  }
  return out;
}

/** Último veredito de cada oferta (porteiro de mensagem). Sem linha = nunca auditada. Tolera tabela ausente. */
export async function ultimosVereditos(offerIds: string[]): Promise<Map<string, { verdict: string; checkedAt: Date; okEm: Date | null }>> {
  const m = new Map<string, { verdict: string; checkedAt: Date; okEm: Date | null }>();
  if (!offerIds.length) return m;
  try {
    const rows = (await db.execute(sql`
      SELECT DISTINCT ON (offer_id) offer_id::text AS id, verdict, checked_at,
        (SELECT max(k.checked_at) FROM offer_link_audit k WHERE k.offer_id = a.offer_id AND k.verdict = 'ok' AND k.regra_versao >= ${REGRA_VERSAO}) AS ok_em, regra_versao
      FROM offer_link_audit a
      WHERE offer_id IN (${sql.join(offerIds.map((i) => sql`${i}::uuid`), sql`, `)}) ORDER BY offer_id, checked_at DESC`)) as unknown as { id: string; verdict: string; checked_at: Date | string; ok_em: Date | string | null; regra_versao: number }[];
    for (const r of rows) m.set(r.id, { verdict: r.verdict === 'ok' && Number(r.regra_versao) < REGRA_VERSAO ? 'ok_regra_antiga' : r.verdict, checkedAt: new Date(r.checked_at), okEm: r.ok_em ? new Date(r.ok_em) : null });
  } catch { /* tabela ausente: sem porteiro de auditoria */ }
  return m;
}

export { VEREDITOS_BLOQUEANTES };

/** Flag AUDITORIA_LINKS: ligada por padrão; '0'/'off' desliga. */
export function auditoriaLigada(): boolean {
  return !/^(0|off|false)$/i.test((process.env.AUDITORIA_LINKS ?? '').trim());
}

/**
 * Ciclo do cron (a cada minuto, com o tempo que sobra): combos Bambu reauditados a cada 30 min, depois as demais impressoras (a cada 6 h) e o resto
 * em rodízio (a cada 24 h). Só LÊ e grava veredito (nenhuma oferta é alterada aqui: a correção é o script com backup). Alarme no Telegram do dono
 * (1 vez a cada 6 h) se mais de 0,5% das leituras das últimas 24 h divergirem. Nunca lança.
 */
export async function cicloAuditoriaLinks(opts: { budgetMs: number }): Promise<Record<string, unknown>> {
  if (!auditoriaLigada()) return { ligado: false };
  const t0 = Date.now();
  try {
    const res: Record<string, unknown> = {};
    res.amazonShopee = await veredictosAmazonShopee().catch(() => -1);
    let restante = opts.budgetMs;
    for (const [escopo, ate, lim] of [['privado', 300, 12], ['bambu', 300, 12], ['canal', 300, 12], ['combos', 30, 12], ['impressoras', 360, 12], ['resto', 1440, 12]] as const) {
      if (restante < 5000) break;
      const alvos = await carregarAlvos(escopo, lim, ate);
      if (!alvos.length) continue;
      const r = await auditarLote(alvos, restante);
      res[escopo] = { lidas: r.lidas, porVeredito: r.porVeredito, parou: r.parou };
      restante = opts.budgetMs - (Date.now() - t0);
      if (r.parou) break;
      if (r.lidas > 0) break; // uma faixa por minuto: respeita o ritmo de 1 requisição a cada 1 a 2 s
    }
    await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
      VALUES ('auditoria-links', 'mercado-livre', now() - make_interval(secs => ${(Date.now() - t0) / 1000}), now(), ${Date.now() - t0}, 'ok', ${JSON.stringify(res)}::jsonb)`);
    await alarmeSeDivergirMuito();
    return res;
  } catch (e) {
    return { erro: e instanceof Error ? e.message.slice(0, 100) : 'erro' };
  }
}

async function alarmeSeDivergirMuito(): Promise<void> {
  const [r] = (await db.execute(sql`SELECT count(*)::int n, count(*) FILTER (WHERE verdict IN ('preco_divergente','item_diferente','pausado'))::int ruins FROM offer_link_audit WHERE checked_at > now() - interval '24 hours' AND verdict <> 'erro_leitura'`)) as unknown as { n: number; ruins: number }[];
  if (!r || r.n < 50 || r.ruins / r.n <= 0.005) return;
  const ja = (await db.execute(sql`SELECT 1 FROM collector_runs WHERE job = 'auditoria-links-alarme' AND started_at > now() - interval '6 hours' LIMIT 1`)) as unknown as unknown[];
  if (ja.length) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!token || !chat) return;
  const pct = ((r.ruins / r.n) * 100).toFixed(1).replace('.', ',');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: `Auditoria de links: ${r.ruins} de ${r.n} leituras das últimas 24 h (${pct}%) divergem do que a oferta diz (preço, anúncio ou pausado). Detalhe em offer_link_audit.`, disable_notification: false }),
  }).catch(() => null);
  if (res?.ok) await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('auditoria-links-alarme', 'telegram', now(), now(), 0, 'ok', ${JSON.stringify({ n: r.n, ruins: r.ruins })}::jsonb)`);
}

/**
 * Amazon e Shopee (#119): a página/API já é a FONTE do preço (loop assistido da Amazon e API da Shopee gravam o preço lido), então não há leitura
 * nova da página. O veredito registra a idade dessa leitura: `ok` se a confirmação está dentro da janela (Amazon 130 min, Shopee 6 h), senão
 * `erro_leitura` com a idade. Só ofertas que foram para mensagem nas últimas 24 h e ainda sem veredito recente. Sem rede.
 */
export async function veredictosAmazonShopee(limite = 400): Promise<number> {
  const r = (await db.execute(sql`
    INSERT INTO offer_link_audit (offer_id, link, offer_price_cents, verdict, note, regra_versao)
    SELECT o.id, o.affiliate_url, o.current_price_cents,
      CASE WHEN o.last_price_confirmed_at > now() - (CASE WHEN n.slug = 'amazon' THEN interval '130 minutes' ELSE interval '6 hours' END) THEN 'ok' ELSE 'erro_leitura' END,
      'fonte=' || CASE WHEN n.slug = 'amazon' THEN 'loop_assistido' ELSE 'api_shopee' END || '; idade_min=' || coalesce((extract(epoch FROM now() - o.last_price_confirmed_at) / 60)::int::text, 'nunca'), ${REGRA_VERSAO}
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug IN ('amazon', 'shopee')
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0
      AND o.id IN (SELECT offer_id FROM group_messages WHERE created_at > now() - interval '24 hours' AND offer_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM offer_link_audit a WHERE a.offer_id = o.id AND a.checked_at > now() - interval '30 minutes')
    LIMIT ${limite} RETURNING id`)) as unknown as unknown[];
  return r.length;
}
