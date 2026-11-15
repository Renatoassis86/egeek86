import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { toleranciaCents, type Cartao, type ResultadoAuditoria } from '@/lib/links/polycard';
import { getValidAccessToken } from '@/server/collector/sources/mercado-livre-auth';
import { itemIdDaUrl } from '@/lib/messaging/confirmacao-preco';
import { bloquear, ESTADO_ZERO, metaParaGravar, reservar, RITMO_CFG, sanearMeta, type EstadoRitmo } from '@/lib/links/ritmo';

// ---------------------------------------------------------------------------
// Ritmo GLOBAL das leituras de página (cron + todos os scripts/fatias somam): no máximo 1 requisição a cada 2 s; captcha/429 abre recuo de 15 min.
// Estado em UMA linha de collector_runs (job 'auditoria-ritmo'), protegida por lock consultivo. O revisor levou captcha com 21 leituras a 1,5 s.
// ---------------------------------------------------------------------------
export { RITMO_CFG as RITMO } from '@/lib/links/ritmo';

export type Slot = { ok: true; esperaMs: number } | { ok: false; ateMs: number; motivo: string };

/** Lê o estado SEM carregar meta gigante (pg_column_size) e sempre saneado; grava só as 6 chaves numéricas, nunca o meta lido. */
async function lerEstado(tx: Pick<typeof db, 'execute'>): Promise<{ id: string | number | null; estado: EstadoRitmo }> {
  const rows = (await tx.execute(sql`SELECT id, CASE WHEN pg_column_size(meta) > ${RITMO_CFG.META_MAX_CHARS} THEN NULL ELSE meta::text END AS txt FROM collector_runs WHERE job = 'auditoria-ritmo' ORDER BY started_at DESC LIMIT 1`)) as unknown as { id: string | number; txt: string | null }[];
  const r = rows[0];
  if (!r) return { id: null, estado: { ...ESTADO_ZERO } };
  return { id: r.id, estado: r.txt == null ? { ...ESTADO_ZERO } : sanearMeta(r.txt) };
}

async function gravarEstado(tx: Pick<typeof db, 'execute'>, id: string | number | null, e: EstadoRitmo): Promise<void> {
  const json = JSON.stringify(metaParaGravar(e));
  if (id != null) await tx.execute(sql`UPDATE collector_runs SET meta = ${json}::jsonb, finished_at = now() WHERE id = ${id}`);
  else await tx.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('auditoria-ritmo', 'mercado-livre', now(), now(), 0, 'ok', ${json}::jsonb)`);
}

export async function reservarSlot(): Promise<Slot> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('auditoria-ritmo'))`);
    const { id, estado } = await lerEstado(tx);
    const r = reservar(estado, Date.now());
    if (!r.ok) return { ok: false as const, ateMs: r.ateMs, motivo: r.motivo };
    await gravarEstado(tx, id, r.estado);
    return { ok: true as const, esperaMs: r.esperaMs };
  });
}

/** Captcha/429: recuo crescente (15, 30, 60 min) para todos e registro (collector_runs job 'auditoria-links-bloqueio'). */
export async function registrarBloqueio(nota: string): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('auditoria-ritmo'))`);
      const { id, estado } = await lerEstado(tx);
      await gravarEstado(tx, id, bloquear(estado, Date.now()));
    });
    await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('auditoria-links-bloqueio', 'mercado-livre', now(), now(), 0, 'error', ${JSON.stringify({ nota: nota.slice(0, 100) })}::jsonb)`);
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
