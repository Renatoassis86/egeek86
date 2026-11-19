import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { VERTICALS, type Vertical } from '@/lib/catalog/verticais';
import { primeLiveNetworks, primePublicOffersMat, publicOffersCtes } from '@/server/queries/public-offers';

/**
 * Refresco INCREMENTAL das ofertas públicas materializadas (migration 0069). A tabela `public_offers_mat` guarda o resultado da CTE
 * `public_offers`; aqui só se recalculam os PRODUTOS que mudaram desde a última rodada (a mediana de plausibilidade é por produto, então
 * o produto inteiro é recalculado, nunca a oferta isolada). Oferta ativa nunca fica de fora (entra em até 1 intervalo do cron) e oferta
 * inativa sai (a leitura ainda confere status/preço/quarentena ao vivo; ver publicOffersFromMat). Nada é apagado fora da tabela derivada.
 *
 * Sujo = produto de oferta com updated_at >= marca d'água - 2 min (trigger universal de updated_at; toda gravação do coletor/status/título
 * passa por ele), produto onde a oferta ESTAVA na tabela (cobre troca de produto/vertical) e produto com updated_at novo (porteiro do catálogo).
 * Rede de segurança: reconciliação COMPLETA por vertical (CTE inteira, diff com a tabela) a cada FULL_EVERY_MIN min e na primeira rodada.
 * Flag: PUBLIC_OFFERS_MAT=off para de ler a tabela (o cron segue alimentando; sem custo de leitura relevante).
 */
const FULL_EVERY_MIN = 60;
const OVERLAP_MIN = 2;
const CHUNK = 400;

export interface MatRunResult {
  ok: boolean;
  mode: Record<string, 'full' | 'incremental'>;
  dirtyMasters: number;
  upserts: number;
  deletes: number;
  ms: number;
  erro?: string;
}

async function applyDiff(vertical: Vertical, masters: string[] | null): Promise<{ ups: number; dels: number }> {
  const v = sql.raw(`'${vertical}'`);
  const scope = masters ? { onlyMasters: masters, forceLive: true } : { forceLive: true };
  const delScope = masters
    ? sql`AND d.master_product_id IN (${sql.join(masters.map((m) => sql`${m}::uuid`), sql`, `)})`
    : sql``;
  const rows = await db.execute<{ ups: string; dels: string }>(sql`
    WITH ${publicOffersCtes(vertical, scope)},
    up AS (
      INSERT INTO public_offers_mat AS t (id, vertical, master_product_id, current_price_cents, avg_excluded, refreshed_at)
      SELECT po.id, ${v}, po.master_product_id, po.current_price_cents, po.avg_excluded, now() FROM public_offers po
      ON CONFLICT (id) DO UPDATE SET vertical = EXCLUDED.vertical, master_product_id = EXCLUDED.master_product_id,
        current_price_cents = EXCLUDED.current_price_cents, avg_excluded = EXCLUDED.avg_excluded, refreshed_at = now()
      WHERE t.vertical IS DISTINCT FROM EXCLUDED.vertical OR t.master_product_id IS DISTINCT FROM EXCLUDED.master_product_id
         OR t.current_price_cents IS DISTINCT FROM EXCLUDED.current_price_cents OR t.avg_excluded IS DISTINCT FROM EXCLUDED.avg_excluded
      RETURNING 1
    ),
    del AS (
      DELETE FROM public_offers_mat d
      WHERE d.vertical = ${v} ${delScope} AND NOT EXISTS (SELECT 1 FROM public_offers po WHERE po.id = d.id)
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM up)::text AS ups, (SELECT count(*) FROM del)::text AS dels
  `);
  return { ups: Number(rows[0]?.ups ?? 0), dels: Number(rows[0]?.dels ?? 0) };
}

export async function refreshPublicOffersMat(opts: { budgetMs?: number; forceFull?: boolean } = {}): Promise<MatRunResult> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 150_000;
  const out: MatRunResult = { ok: false, mode: {}, dirtyMasters: 0, upserts: 0, deletes: 0, ms: 0 };
  try {
    const meta = await db.execute<{ key: string; ts: string; age_min: number }>(sql`
      SELECT key, ts::text AS ts, (extract(epoch FROM (clock_timestamp() - ts)) / 60)::float AS age_min FROM public_offers_mat_meta`);
    // Início da rodada no RELÓGIO DO BANCO (o mesmo que carimba updated_at), não no do servidor da função.
    const [{ start_ts }] = await db.execute<{ start_ts: string }>(sql`SELECT clock_timestamp()::text AS start_ts`);
    const wm = meta.find((m) => m.key === 'wm')?.ts ?? null;
    const fullAge = new Map(meta.filter((m) => m.key.startsWith('full:')).map((m) => [m.key.slice(5), Number(m.age_min)]));

    const needFull = (v: Vertical) => opts.forceFull || wm === null || !fullAge.has(v) || (fullAge.get(v) ?? 1e9) >= FULL_EVERY_MIN;
    const fullList = VERTICALS.filter(needFull);

    // Produtos sujos desde a marca d'água (um conjunto para todas as verticais: a CTE de cada uma filtra a sua).
    let dirty: string[] = [];
    if (wm !== null && fullList.length < VERTICALS.length) {
      const rows = await db.execute<{ id: string }>(sql`
        SELECT DISTINCT id::text AS id FROM (
          SELECT o.master_product_id AS id FROM affiliate_offers o WHERE o.updated_at >= ${wm}::timestamptz - interval '${sql.raw(String(OVERLAP_MIN))} minutes'
          UNION
          SELECT m.master_product_id AS id FROM public_offers_mat m
            WHERE m.id IN (SELECT o.id FROM affiliate_offers o WHERE o.updated_at >= ${wm}::timestamptz - interval '${sql.raw(String(OVERLAP_MIN))} minutes')
          UNION
          SELECT mp.id AS id FROM master_products mp WHERE mp.updated_at >= ${wm}::timestamptz - interval '${sql.raw(String(OVERLAP_MIN))} minutes'
        ) x`);
      dirty = rows.map((r) => r.id);
    }
    out.dirtyMasters = dirty.length;

    for (const v of VERTICALS) {
      if (Date.now() - t0 > budget) throw new Error('orçamento de tempo esgotado antes de terminar as verticais (a marca d\'água não avança)');
      if (fullList.includes(v)) {
        await primeLiveNetworks(v); // reconciliação completa usa as redes vivas recém-lidas
        const r = await applyDiff(v, null);
        await db.execute(sql`INSERT INTO public_offers_mat_meta (key, ts, ran_at) VALUES (${'full:' + v}, now(), now()) ON CONFLICT (key) DO UPDATE SET ts = now(), ran_at = now()`);
        out.mode[v] = 'full';
        out.upserts += r.ups; out.deletes += r.dels;
      } else if (dirty.length) {
        for (let i = 0; i < dirty.length; i += CHUNK) {
          const r = await applyDiff(v, dirty.slice(i, i + CHUNK));
          out.upserts += r.ups; out.deletes += r.dels;
        }
        out.mode[v] = 'incremental';
      } else out.mode[v] = 'incremental';
    }
    // A marca d'água só avança no fim, com o instante do INÍCIO da rodada (qualquer falha acima repete o intervalo).
    await db.execute(sql`INSERT INTO public_offers_mat_meta (key, ts, ran_at) VALUES ('wm', ${start_ts}::timestamptz, now())
      ON CONFLICT (key) DO UPDATE SET ts = EXCLUDED.ts, ran_at = now()`);
    await primePublicOffersMat();
    out.ok = true;
  } catch (e) {
    out.erro = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
  }
  out.ms = Date.now() - t0;
  return out;
}
