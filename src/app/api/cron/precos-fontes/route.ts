import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { interpretarKeepa, type KeepaResposta } from '@/lib/precos-fontes/keepa';
import { asinDaUrl } from '@/lib/precos-fontes/resolver';
import { gravarLeituras } from '@/server/precos-fontes/leituras';
import { MASTERS_PRIVADO } from '@/lib/messaging/painel-impressoras';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * R-82, camada 2: le na Keepa o preco dos ASINs da Amazon que o privado pode mostrar e grava em amazon_leituras_preco (migration 0065).
 * DORMENTE sem KEEPA_API_KEY (responde { skipped: 'sem_chave' }). Nunca escreve preco de oferta: so alimenta a validacao cruzada (resolver).
 * Sem chave de cron valida: falha fechada (mesma autenticacao das demais /api/cron/*).
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  const key = (process.env.KEEPA_API_KEY ?? '').trim();
  if (!key) return NextResponse.json({ skipped: 'sem_chave' });
  const t0 = Date.now();
  try {
    const rows = (await db.execute(sql`
      SELECT o.affiliate_url AS url FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
      WHERE n.slug = 'amazon' AND o.status = 'active' AND o.quarantined_at IS NULL
        AND o.master_product_id::text IN (${sql.join(MASTERS_PRIVADO.map((i) => sql`${i}`), sql`, `)})`)) as unknown as { url: string | null }[];
    const asins = [...new Set(rows.map((r) => asinDaUrl(r.url)).filter((a): a is string => !!a))].slice(0, 50);
    if (!asins.length) return NextResponse.json({ ok: true, asins: 0 });
    const resp = await fetch(`https://api.keepa.com/product?key=${encodeURIComponent(key)}&domain=12&asin=${asins.join(',')}&stats=1&history=0`, { cache: 'no-store', signal: AbortSignal.timeout(40_000) });
    if (!resp.ok) return NextResponse.json({ ok: false, status: resp.status }, { status: 502 });
    const j = (await resp.json()) as KeepaResposta;
    if (j.error) return NextResponse.json({ ok: false, erro: String(j.error.message ?? 'erro_keepa').slice(0, 120) }, { status: 502 });
    const { leituras, descartados } = interpretarKeepa(j, new Date());
    const gravadas = await gravarLeituras(leituras);
    const meta = { asins: asins.length, gravadas, descartados, tokensLeft: j.tokensLeft ?? null };
    await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('precos-fontes', 'amazon', now() - ${Date.now() - t0} * interval '1 millisecond', now(), ${Date.now() - t0}, 'ok', ${JSON.stringify(meta)}::jsonb)`);
    return NextResponse.json({ ok: true, ...meta });
  } catch (e) {
    console.error('[precos-fontes] falhou:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, erro: 'falha' }, { status: 500 });
  }
}
