import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { toleranciaCents, type Cartao, type ResultadoAuditoria } from '@/lib/links/polycard';
import { getValidAccessToken } from '@/server/collector/sources/mercado-livre-auth';
import { itemIdDaUrl } from '@/lib/messaging/confirmacao-preco';

// ---------------------------------------------------------------------------
// Ritmo GLOBAL das leituras de página (cron + todos os scripts/fatias somam): no máximo 1 requisição a cada 2 s; captcha/429 abre recuo de 15 min.
// Estado em UMA linha de collector_runs (job 'auditoria-ritmo'), protegida por lock consultivo. O revisor levou captcha com 21 leituras a 1,5 s.
// ---------------------------------------------------------------------------
export const RITMO = { INTERVALO_MS: 2000, RECUO_MS: 15 * 60_000 } as const;

export type Slot = { ok: true; esperaMs: number } | { ok: false; ateMs: number };

export async function reservarSlot(): Promise<Slot> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('auditoria-ritmo'))`);
    const rows = (await tx.execute(sql`SELECT id, meta FROM collector_runs WHERE job = 'auditoria-ritmo' ORDER BY started_at DESC LIMIT 1`)) as unknown as { id: string | number; meta: { prox?: number; bloqueado_ate?: number } | null }[];
    const agora = Date.now();
    const m = rows[0]?.meta ?? {};
    if ((m.bloqueado_ate ?? 0) > agora) return { ok: false as const, ateMs: m.bloqueado_ate! };
    const prox = Math.max(m.prox ?? 0, agora);
    const novo = { ...m, prox: prox + RITMO.INTERVALO_MS };
    if (rows[0]) await tx.execute(sql`UPDATE collector_runs SET meta = ${JSON.stringify(novo)}::jsonb, finished_at = now() WHERE id = ${rows[0].id}`);
    else await tx.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('auditoria-ritmo', 'mercado-livre', now(), now(), 0, 'ok', ${JSON.stringify(novo)}::jsonb)`);
    return { ok: true as const, esperaMs: prox - agora };
  });
}

/** Captcha/429: bloqueia todas as leituras por 15 min e registra o motivo (collector_runs job 'auditoria-links-bloqueio'). */
export async function registrarBloqueio(nota: string): Promise<void> {
  try {
    await db.execute(sql`UPDATE collector_runs SET meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{bloqueado_ate}', to_jsonb(${Date.now() + RITMO.RECUO_MS}::bigint)) WHERE job = 'auditoria-ritmo'`);
    await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('auditoria-links-bloqueio', 'mercado-livre', now(), now(), 0, 'error', ${JSON.stringify({ nota })}::jsonb)`);
  } catch { /* melhor esforço */ }
}

// ---------------------------------------------------------------------------
// Link direto (produto.mercadolivre.com.br/MLB-...): a página do item exige verificação de conta no servidor, então a fonte é a API OFICIAL do
// catálogo (a mesma que o coletor usa). Anúncio na lista com preço dentro da tolerância = ok (fonte registrada); fora da lista NÃO vira `pausado`
// (o anúncio pode estar em outro catálogo): fica `erro_leitura` e o estrito o mantém fora.
// ---------------------------------------------------------------------------
export interface AlvoApi { offerId: string; link: string | null; itemEsperado: string | null; catalogo: string | null; precoCents: number }
export type ListaCatalogo = { completo: boolean; porItem: Map<string, { price: number; original_price: number | null; seller_id: number }> };
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function listaDoCatalogo(ref: string, cache: Map<string, ListaCatalogo>): Promise<ListaCatalogo> {
  const c = cache.get(ref);
  if (c) return c;
  const out: ListaCatalogo = { completo: true, porItem: new Map() };
  const token = await getValidAccessToken();
  for (let off = 0; off < 1000; off += 100) {
    await dormir(350);
    const res = await fetch(`https://api.mercadolibre.com/products/${ref}/items?limit=100&offset=${off}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404 && off === 0) break;
    if (res.status !== 200) { out.completo = false; break; }
    const d = (await res.json()) as { results?: { item_id: string; price: number; original_price: number | null; seller_id: number }[]; paging?: { total?: number } };
    for (const it of d.results ?? []) out.porItem.set(it.item_id, { price: it.price, original_price: it.original_price, seller_id: it.seller_id });
    if (off + 100 >= (d.paging?.total ?? 0)) break;
  }
  cache.set(ref, out);
  return out;
}

export async function auditarPorApi(a: AlvoApi, cache: Map<string, ListaCatalogo>): Promise<ResultadoAuditoria> {
  const item = itemIdDaUrl(a.link) ?? (a.itemEsperado && /^MLB\d{6,}$/.test(a.itemEsperado) && a.itemEsperado !== a.catalogo ? a.itemEsperado : null);
  if (!item || !a.catalogo) return { verdict: 'erro_leitura', cartao: null, diffPct: null, nota: 'url_de_catalogo_sem_anuncio: sem como ler (precisa do meli.la)' };
  const lista = await listaDoCatalogo(a.catalogo, cache);
  const it = lista.porItem.get(item);
  if (!it) return { verdict: 'erro_leitura', cartao: null, diffPct: null, nota: `fonte=api_catalogo; anuncio ${item} fora da lista${lista.completo ? '' : ' (lista incompleta)'}` };
  const cents = Math.round(it.price * 100);
  const cartao: Cartao = { itemId: item, productId: a.catalogo, titulo: null, precoCents: cents, precoAnteriorCents: it.original_price != null ? Math.round(it.original_price * 100) : null, pausado: false, vendedor: String(it.seller_id), pos: 0 };
  const diff = Math.round(((cents - a.precoCents) / a.precoCents) * 10000) / 100;
  if (Math.abs(cents - a.precoCents) > toleranciaCents(a.precoCents)) return { verdict: 'preco_divergente', cartao, diffPct: diff, nota: `fonte=api_catalogo; api ${cents}, oferta ${a.precoCents}` };
  return { verdict: 'ok', cartao, diffPct: diff, nota: 'fonte=api_catalogo (link direto; a página exige verificação de conta no servidor)' };
}
