import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { couponCors, couponGuard } from '@/server/coupons/ingest-guard';

export const dynamic = 'force-dynamic';

/**
 * SAUDE DOS LOOPS DO CHROME (dono, 2026-11-18: "implemente uma metodologia de uso do Chrome que seja a mais eficiente"). Cada loop injetado numa aba (Amazon, ML linkbuilder,
 * ML cupons, Shopee, cupons 24 h) manda UM batimento por minuto: estado, versao, atraso do timer (lagMs: a aba esta congelada ou a thread principal travada),
 * visibilidade da aba e memoria. O vigia le a ultima linha de cada `loop:<nome>` no banco (scripts/vigia-loops.ts) em vez de sondar cada aba por CDP (a sonda
 * estoura em 45 s numa aba congelada e a troca de aba descarta o loop). Mesma protecao das rotas de cupom (origem por rede + token). Grava no maximo 1 linha por loop a cada 4 min.
 *   POST /api/ingest/loop-saude?rede=amazon|mercado-livre|shopee&loop=<nome>   { estado, versao?, lagMs?, visivel?, memMb?, url? }
 */
const LOOPS = new Set(['amazon-assistida', 'cupons-24h', 'ml-cupons-item', 'ml-links-ui', 'shopee-cupons', 'shopee-vivo']);
const REDES = new Set(['amazon', 'mercado-livre', 'shopee']);

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: couponCors(request) });
}

export async function POST(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  const rede = q.get('rede') ?? '';
  const loop = q.get('loop') ?? '';
  const denied = couponGuard(request, rede);
  if (denied) return denied;
  const headers = couponCors(request);
  if (!REDES.has(rede) || !LOOPS.has(loop)) return NextResponse.json({ error: 'parametro_invalido' }, { status: 400, headers });
  const text = await request.text();
  if (text.length > 1_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let b: Record<string, unknown> = {};
  try { b = JSON.parse(text) as Record<string, unknown>; } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[^\w./:-]/g, '').slice(0, n) : null);
  const meta = { estado: b.estado === 'parado' ? 'parado' : 'ok', versao: str(b.versao, 12), lagMs: num(b.lagMs, 3_600_000), visivel: str(b.visivel, 10), memMb: num(b.memMb, 100_000), url: str(b.url, 60) };
  const job = `loop:${loop}`;
  try {
    const rows = (await db.execute(sql`SELECT 1 AS x FROM collector_runs WHERE job = ${job} AND started_at > now() - interval '4 minutes' LIMIT 1`)) as unknown as unknown[];
    if (!rows.length || meta.estado === 'parado') {
      await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, checked, meta)
        VALUES (${job}, ${rede}, now(), now(), ${meta.lagMs ?? 0}, ${meta.estado === 'parado' ? 'error' : 'ok'}, 0, ${JSON.stringify(meta)}::text::jsonb)`);
    }
  } catch { /* o batimento nunca derruba o loop */ }
  return NextResponse.json({ ok: true }, { headers });
}
