import { NextResponse, type NextRequest } from 'next/server';
import { discoverNewProducts } from '@/server/collector/discover-products';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Disparado periodicamente por um agendador externo (Supabase pg_cron +
 * pg_net), não por um usuário — mesmo padrão de autenticação de
 * /api/cron/collect-prices/route.ts. Frequência recomendada bem menor que a
 * de preço (ex: a cada 6h) — descoberta de produto novo não tem a mesma
 * urgência.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary = await discoverNewProducts();
  return NextResponse.json(summary);
}
