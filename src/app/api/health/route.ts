import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';

/**
 * Health check público: responde só ok/falha, sem detalhe de infraestrutura.
 * O diagnóstico por componente (mensagens de erro incluídas) só sai com o
 * mesmo CRON_SECRET das rotas /api/cron (mesma regra do rejectUnlessCronAuthorized).
 */
export async function GET(request: NextRequest) {
  // #73: mesma regra das rotas /api/cron (Bearer em tempo constante; ?key= so enquanto CRON_ACEITA_KEY_NA_URL nao for 'off').
  // O corpo publico (so ok/fail) continua igual para qualquer sonda externa, sem credencial.
  const detailed = rejectUnlessCronAuthorized(request) === null;

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
