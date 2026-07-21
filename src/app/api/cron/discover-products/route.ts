import { NextResponse, type NextRequest } from 'next/server';
import { discoverNewProducts, discoverAllCategoryProducts } from '@/server/collector/discover-products';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Permite chamadas internas ou com chave
    const secretParam = request.nextUrl.searchParams.get('key');
    if (secretParam !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const categorySummary = await discoverAllCategoryProducts(3);
  const discoverySummary = await discoverNewProducts();

  return NextResponse.json({
    categorySummary,
    discoverySummary,
    status: 'success',
    timestamp: new Date().toISOString(),
  });
}
