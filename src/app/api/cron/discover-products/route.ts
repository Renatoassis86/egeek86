import { NextResponse, type NextRequest } from 'next/server';
import { discoverNewProducts, discoverAllCategoryProducts } from '@/server/collector/discover-products';
import { discoverShopeeProducts } from '@/server/collector/discover-shopee-products';
import { discoverMagaluProducts } from '@/server/collector/discover-magalu-products';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const secretParam = request.nextUrl.searchParams.get('key');
    if (secretParam !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const categorySummary = await discoverAllCategoryProducts(3);
  const discoverySummary = await discoverNewProducts();
  const shopeeSummary = await discoverShopeeProducts();
  const magaluSummary = await discoverMagaluProducts();

  return NextResponse.json({
    categorySummary,
    discoverySummary,
    shopeeSummary,
    magaluSummary,
    status: 'success',
    timestamp: new Date().toISOString(),
  });
}
