import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Health check público: responde só ok/falha, sem detalhe de infraestrutura.
 * O diagnóstico por componente (mensagens de erro incluídas) só sai com o
 * mesmo CRON_SECRET das rotas /api/cron (Bearer ou ?key=).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const detailed =
    !!secret &&
    (request.headers.get('authorization') === `Bearer ${secret}` ||
      request.nextUrl.searchParams.get('key') === secret);

  let dbOk = false;
  let dbDetail: string | undefined;
  try {
    const result = await db.execute(sql`SELECT 1 AS ok`);
    dbOk = result.length > 0;
  } catch (e) {
    dbDetail = (e as Error).message;
  }

  const status = dbOk ? 200 : 503;
  if (!detailed) {
    return NextResponse.json({ status: dbOk ? 'ok' : 'fail' }, { status });
  }
  return NextResponse.json(
    { status: dbOk ? 'ok' : 'fail', timestamp: new Date().toISOString(), checks: { postgres: { ok: dbOk, detail: dbDetail } } },
    { status },
  );
}
