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

  // As duas chamadas do Mercado Livre share o mesmo rate limit (mesmo
  // access_token) e ficam sequenciais entre si, como sempre foram — mas
  // Shopee e Magalu são serviços externos totalmente separados, cada um
  // com seu próprio limite, então rodar os três "grupos" em paralelo não
  // aumenta a carga que NENHUM dos três serviços vê individualmente, só
  // usa melhor o tempo de execução (2026-08-02 — antes rodava tudo em
  // série, desperdiçando boa parte do maxDuration esperando um serviço de
  // cada vez em vez de aproveitar os três ao mesmo tempo).
  const [meli, shopeeSummary, magaluSummary] = await Promise.all([
    (async () => {
      const categorySummary = await discoverAllCategoryProducts(3);
      const discoverySummary = await discoverNewProducts();
      return { categorySummary, discoverySummary };
    })(),
    discoverShopeeProducts(),
    discoverMagaluProducts(),
  ]);
  const { categorySummary, discoverySummary } = meli;

  return NextResponse.json({
    categorySummary,
    discoverySummary,
    shopeeSummary,
    magaluSummary,
    status: 'success',
    timestamp: new Date().toISOString(),
  });
}
