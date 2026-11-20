import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getValidAccessToken } from '@/server/collector/sources/mercado-livre-auth';
import { meliItemIdFromUrl } from '@/lib/messaging/live-recheck';
import { secaoDe } from '@/lib/messaging/painel-impressoras';
import {
  CEP_ALVO, devida, dataBR, escolherItemMl, fretePrazoLigado, linhaFretePrazo, melhorCotacao, parseEntregaAmazon, parseShippingOptionsMl,
  type Cotacao, type FonteFrete, type ItemCatalogoMl,
} from '@/lib/shipping/frete-prazo';

/**
 * Frete e prazo das impressoras 3D (#118). ML: API oficial no servidor (catálogo -> anúncio -> shipping_options?zip_code=CEP), dentro do cron group-messages,
 * com orçamento de tempo/chamadas e freio de 429. Amazon: o loop cupons-24h já abre a página do produto e manda o texto da entrega no POST de leituras (sem requisição extra).
 * Tabela offer_shipping_quotes (migration 0054), uma linha por oferta e CEP (upsert). Flag FRETE_PRAZO_IMPRESSORAS (padrão desligada) liga a captura do ML.
 * Leitura para mensagens: cotacoesPorOferta() / linhasFretePrazoPorOferta(). Nunca lança no cron; nunca imprime token.
 */
const JOB = 'frete-prazo-impressoras';
const ML = 'https://api.mercadolibre.com';
const ESPACO_MS = 250;

interface RowQuote { offer_id: string; zip: string; cost_cents: number | null; free: boolean; eta_from: string | null; eta_to: string | null; carrier: string | null; logistic: string | null; sold_by: string | null; source: FonteFrete; read_at: Date | string }

const dia = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? '')).slice(0, 10) || null;

export async function gravarCotacao(offerId: string, c: { zip: string; costCents: number; free: boolean; etaFrom: string | null; etaTo: string | null; logistic?: string | null; soldBy?: string | null; itemId?: string | null; source: FonteFrete; rawText?: string | null }, now = new Date()): Promise<void> {
  const hoje = dataBR(now);
  const dmin = c.etaFrom ? Math.round((Date.parse(c.etaFrom) - Date.parse(hoje)) / 86400_000) : null;
  const dmax = c.etaTo ? Math.round((Date.parse(c.etaTo) - Date.parse(hoje)) / 86400_000) : null;
  await db.execute(sql`
    INSERT INTO offer_shipping_quotes (offer_id, zip, cost_cents, free, eta_from, eta_to, eta_days_min, eta_days_max, logistic, sold_by, item_id, source, raw_text, read_at)
    VALUES (${offerId}::uuid, ${c.zip}, ${c.costCents}::int, ${c.free}, ${c.etaFrom}::date, ${c.etaTo}::date, ${dmin}::int, ${dmax}::int, ${c.logistic ?? null}, ${c.soldBy ?? null}, ${c.itemId ?? null}, ${c.source}, ${(c.rawText ?? '').slice(0, 300) || null}, ${now.toISOString()}::timestamptz)
    ON CONFLICT (offer_id, zip) DO UPDATE SET cost_cents = EXCLUDED.cost_cents, free = EXCLUDED.free, eta_from = EXCLUDED.eta_from, eta_to = EXCLUDED.eta_to,
      eta_days_min = EXCLUDED.eta_days_min, eta_days_max = EXCLUDED.eta_days_max, logistic = EXCLUDED.logistic, sold_by = EXCLUDED.sold_by, item_id = EXCLUDED.item_id,
      source = EXCLUDED.source, raw_text = EXCLUDED.raw_text, read_at = EXCLUDED.read_at`);
}

/** CONTRATO DE LEITURA: melhor cotação (CEP-alvo, ou mesmo prefixo) por oferta. Oferta sem leitura não aparece no mapa. Não filtra idade (use linhaFretePrazo / cotacaoValida). */
export async function cotacoesPorOferta(offerIds: string[], cepAlvo: string = CEP_ALVO): Promise<Map<string, Cotacao>> {
  const out = new Map<string, Cotacao>();
  const ids = [...new Set(offerIds.filter((i) => /^[0-9a-f-]{36}$/i.test(i)))];
  if (!ids.length) return out;
  const rows = (await db.execute<RowQuote & Record<string, unknown>>(sql`
    SELECT offer_id::text, zip, cost_cents, free, eta_from::text, eta_to::text, carrier, logistic, sold_by, source, read_at
    FROM offer_shipping_quotes WHERE offer_id = ANY(${sql`ARRAY[${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}]`}) `)) as unknown as RowQuote[];
  const por = new Map<string, Cotacao[]>();
  for (const r of rows) {
    const q: Cotacao = { zip: r.zip, costCents: r.cost_cents, free: r.free, etaFrom: dia(r.eta_from), etaTo: dia(r.eta_to), carrier: r.carrier, logistic: r.logistic, soldBy: r.sold_by, source: r.source, readAt: new Date(r.read_at) };
    (por.get(r.offer_id) ?? por.set(r.offer_id, []).get(r.offer_id)!).push(q);
  }
  for (const [id, qs] of por) { const m = melhorCotacao(qs, cepAlvo); if (m) out.set(id, m); }
  return out;
}

/** CONTRATO DE LEITURA PARA MENSAGENS: { offerId -> linha pronta } ("Prazo ainda não lido" quando falta ou passou de 12 h). */
export async function linhasFretePrazoPorOferta(offerIds: string[], now = new Date(), cepAlvo: string = CEP_ALVO): Promise<Map<string, string>> {
  const qs = await cotacoesPorOferta(offerIds, cepAlvo).catch(() => new Map<string, Cotacao>());
  return new Map([...new Set(offerIds)].map((id) => [id, linhaFretePrazo(qs.get(id), now, cepAlvo)]));
}

/** Amazon: grava a entrega lida pela página do produto (loop cupons-24h). Linhas { id, entrega: { texto, cep, vendido } }. Devolve contagem. */
export async function gravarEntregasAmazon(rows: Array<{ id?: unknown; entrega?: unknown }>, now = new Date()): Promise<{ gravadas: number; recusadas: number }> {
  let gravadas = 0;
  let recusadas = 0;
  for (const r of rows) {
    const e = r.entrega as { texto?: unknown; cep?: unknown; cep_lido?: unknown; vendido?: unknown } | undefined;
    if (!e || typeof e.texto !== 'string' || !/^[0-9a-f-]{36}$/i.test(String(r.id))) continue;
    const p = parseEntregaAmazon(e.texto, now, { cepTexto: typeof e.cep_lido === 'string' && /^\d{8}$/.test(e.cep_lido) ? e.cep_lido : typeof e.cep === 'string' ? e.cep.slice(0, 80) : null, vendidoPor: typeof e.vendido === 'string' ? e.vendido.slice(0, 120) : null });
    if (!p || !p.zip) { recusadas++; continue; }
    const ok = (await db.execute(sql`SELECT 1 FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id WHERE o.id = ${String(r.id)}::uuid AND nn.slug = 'amazon' LIMIT 1`)) as unknown as unknown[];
    if (!ok.length) { recusadas++; continue; }
    await gravarCotacao(String(r.id), { zip: p.zip, costCents: p.costCents!, free: p.free, etaFrom: p.etaFrom, etaTo: p.etaTo, soldBy: p.soldBy, source: 'amazon_pagina', rawText: e.texto }, now);
    // R-107: o frete grátis da PÁGINA do item (CEP da conta; frete condicionado a Prime/primeiro pedido já foi recusado no parser) vira a flag da oferta, com a data da leitura.
    await db.execute(sql`UPDATE affiliate_offers SET free_shipping = ${p.free}, shipping_seen_at = ${now.toISOString()}::timestamptz WHERE id = ${String(r.id)}::uuid`).catch(() => undefined);
    gravadas++;
  }
  return { gravadas, recusadas };
}

/**
 * R-88: entrega lida na PÁGINA pelo loop rápido da Amazon (candidato pg=1 com `ent`). A linha do loop rápido traz o MASTER; a oferta é a ativa da Amazon com o mesmo
 * ASIN (external_ref 'amazon-<ASIN>'). Melhor esforço: erro aqui nunca derruba a ingestão do preço. Devolve quantas entregas gravou/recusou.
 */
export async function gravarEntregasPorAsin(networkId: string, masterId: string, cands: Array<{ a: string; pg?: number; ent?: { t: string; z?: string } }>, now = new Date()): Promise<{ gravadas: number; recusadas: number }> {
  const rows: Array<{ id: string; entrega: { texto: string; cep_lido?: string } }> = [];
  for (const c of cands) {
    if (c.pg !== 1 || !c.ent || typeof c.ent.t !== 'string' || !/^[A-Z0-9]{10}$/.test(c.a)) continue;
    const of = (await db.execute(sql`SELECT o.id::text AS id FROM affiliate_offers o WHERE o.network_id = ${networkId} AND o.master_product_id = ${masterId}::uuid AND o.status = 'active' AND o.external_ref = ${'amazon-' + c.a}`)) as unknown as Array<{ id: string }>;
    for (const o of of) rows.push({ id: o.id, entrega: { texto: c.ent.t, ...(c.ent.z && /^\d{8}$/.test(c.ent.z) ? { cep_lido: c.ent.z } : {}) } });
  }
  if (!rows.length) return { gravadas: 0, recusadas: 0 };
  return gravarEntregasAmazon(rows, now);
}

interface Alvo { id: string; ref: string; itemId: string | null; sellerExt: string | null; priceCents: number; masterName: string; ultima: Date | null }
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Ofertas de impressora do ML (mesma seleção dos painéis #117), com a última leitura de frete. */
async function alvosMl(): Promise<Alvo[]> {
  const rows = (await db.execute<Record<string, unknown>>(sql`
    SELECT o.id::text AS id, o.external_ref AS ref, o.external_item_id AS item_id, o.affiliate_url AS url, s.external_seller_id AS seller_ext,
           o.current_price_cents::text AS price, m.name AS master_name, q.read_at AS ultima
    FROM affiliate_offers o
    JOIN affiliate_networks nn ON nn.id = o.network_id
    JOIN master_products m ON m.id = o.master_product_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    LEFT JOIN offer_shipping_quotes q ON q.offer_id = o.id AND q.zip = ${CEP_ALVO}
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = 'impressao3d' AND o.current_price_cents > 0
      AND nn.slug = 'mercado-livre' AND o.last_checked_at > now() - interval '24 hours' AND m.name ~* '(impressora|printer|bambu|kobra)'
      AND o.external_ref ~ '^MLB[0-9]+$'`)) as unknown as Array<Record<string, any>>;
  return rows.map((r) => ({
    id: r.id, ref: r.ref, itemId: r.item_id ?? meliItemIdFromUrl(r.url), sellerExt: r.seller_ext ?? null, priceCents: Number(r.price), masterName: r.master_name, ultima: r.ultima ? new Date(r.ultima) : null,
  }));
}

const ehDestaque = (nome: string) => secaoDe({ masterName: nome } as Parameters<typeof secaoDe>[0]).destaque;

export interface ResultadoFrete { ligado: boolean; candidatas?: number; lidas?: number; sem_anuncio?: number; sem_opcao?: number; erros?: number; chamadas?: number; limitado_429?: boolean; pausado?: boolean; skipped?: string }

/** Captura do ML pela API oficial (um passo do cron). Orçamento por tempo (budgetMs) e por chamadas; 429 -> pausa de 10 min (job.meta.pausa_ate). */
export async function capturarFreteMl(now: Date, opts: { budgetMs: number; maxCalls?: number; env?: Record<string, string | undefined> }): Promise<ResultadoFrete> {
  if (!fretePrazoLigado(opts.env ?? process.env)) return { ligado: false };
  const t0 = Date.now();
  const res: ResultadoFrete = { ligado: true, lidas: 0, sem_anuncio: 0, sem_opcao: 0, erros: 0, chamadas: 0 };
  try {
    const ult = (await db.execute<{ meta: { pausa_ate?: string } | null }>(sql`SELECT meta FROM collector_runs WHERE job = ${JOB} ORDER BY started_at DESC LIMIT 1`)) as unknown as { meta: { pausa_ate?: string } | null }[];
    const pausa = ult[0]?.meta?.pausa_ate;
    if (pausa && new Date(pausa) > now) return { ...res, pausado: true };
    const todos = await alvosMl();
    const devidas = todos
      .map((a) => ({ a, d: ehDestaque(a.masterName) }))
      .filter((x) => devida(x.a.ultima, x.d, now))
      .sort((x, y) => Number(y.d) - Number(x.d) || (x.a.ultima?.getTime() ?? 0) - (y.a.ultima?.getTime() ?? 0));
    res.candidatas = devidas.length;
    if (!devidas.length) return res;
    const token = await getValidAccessToken();
    const maxCalls = opts.maxCalls ?? 40;
    const cat = new Map<string, ItemCatalogoMl[] | null>();
    const get = async (ep: string) => {
      res.chamadas!++;
      const r = await fetch(`${ML}${ep}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 429) { res.limitado_429 = true; return { status: 429, json: null as unknown }; }
      return { status: r.status, json: (await r.json().catch(() => null)) as unknown };
    };
    let pausaAte: string | null = null;
    for (const { a } of devidas) {
      if (Date.now() - t0 > opts.budgetMs || res.chamadas! >= maxCalls) break;
      let item: ItemCatalogoMl | null = null;
      if (!cat.has(a.ref)) {
        const c = await get(`/products/${a.ref}/items?limit=100`);
        if (c.status === 429) break;
        cat.set(a.ref, c.status === 200 && Array.isArray((c.json as { results?: unknown })?.results) ? ((c.json as { results: ItemCatalogoMl[] }).results) : null);
        await dormir(ESPACO_MS);
      }
      const rows = cat.get(a.ref);
      if (rows) item = escolherItemMl(rows, { itemId: a.itemId, sellerExternalId: a.sellerExt, priceCents: a.priceCents });
      if (!item?.item_id) { res.sem_anuncio!++; continue; }
      const s = await get(`/items/${item.item_id}/shipping_options?zip_code=${CEP_ALVO}`);
      if (s.status === 429) break;
      if (s.status !== 200) { res.erros!++; await dormir(ESPACO_MS); continue; }
      const p = parseShippingOptionsMl(s.json, item.shipping?.logistic_type ?? null);
      if (!p) { res.sem_opcao!++; await dormir(ESPACO_MS); continue; }
      await gravarCotacao(a.id, { zip: CEP_ALVO, costCents: p.costCents, free: p.free, etaFrom: p.etaFrom, etaTo: p.etaTo, logistic: p.logistic, itemId: item.item_id, source: 'ml_api' }, new Date());
      res.lidas!++;
      await dormir(ESPACO_MS);
    }
    if (res.limitado_429) pausaAte = new Date(Date.now() + 10 * 60_000).toISOString();
    if ((res.chamadas ?? 0) > 0) {
      await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
        VALUES (${JOB}, 'mercado-livre', now(), now(), ${Date.now() - t0}, ${res.erros && !res.lidas ? 'error' : 'ok'}, ${JSON.stringify({ ...res, pausa_ate: pausaAte })}::jsonb)`);
    }
    return res;
  } catch (e) {
    return { ...res, erros: (res.erros ?? 0) + 1, skipped: e instanceof Error ? e.message.slice(0, 120) : 'falha' };
  }
}

