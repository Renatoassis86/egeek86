import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Health check — valida conexões Supabase + Postgres (Drizzle).
 * Acesse: http://localhost:3000/api/health
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Supabase client
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.getSession();
    checks.supabase = error ? { ok: false, detail: error.message } : { ok: true };
  } catch (e) {
    checks.supabase = { ok: false, detail: (e as Error).message };
  }

  // Postgres (Drizzle)
  try {
    const result = await db.execute(sql`SELECT 1 AS ok`);
    checks.postgres = { ok: result.length > 0 };
  } catch (e) {
    checks.postgres = { ok: false, detail: (e as Error).message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
