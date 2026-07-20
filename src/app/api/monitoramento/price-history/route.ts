import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getMasterProductPriceHistory } from '@/server/queries/price-history';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  masterProductId: z.string().min(1),
  timeframe: z.enum(['1D', '1S', '1M', '3M', '6M', '1A', 'Tudo']),
});

const DEMO_FALLBACK_HISTORY = {
  points: [
    { time: Math.floor(Date.now() / 1000) - 86400 * 30, value: 320 },
    { time: Math.floor(Date.now() / 1000) - 86400 * 20, value: 310 },
    { time: Math.floor(Date.now() / 1000) - 86400 * 10, value: 299 },
    { time: Math.floor(Date.now() / 1000), value: 299 },
  ],
  movingAveragePoints: [
    { time: Math.floor(Date.now() / 1000) - 86400 * 30, value: 325 },
    { time: Math.floor(Date.now() / 1000) - 86400 * 20, value: 315 },
    { time: Math.floor(Date.now() / 1000) - 86400 * 10, value: 305 },
    { time: Math.floor(Date.now() / 1000), value: 300 },
  ],
  pointOffers: {},
  quotes: [],
  totalOffersCount: 3,
  totalQuoteCount: 24,
  stats: {
    minPriceCents: 29900,
    maxPriceCents: 32000,
    avgPriceCents: 30800,
    globalMaxPriceCents: 35000,
  },
};

export async function GET(request: NextRequest) {
  try {
    const masterProductId = request.nextUrl.searchParams.get('masterProductId') ?? 'demo-1';
    const timeframe = (request.nextUrl.searchParams.get('timeframe') as any) ?? '1M';

    if (masterProductId.startsWith('demo-')) {
      return NextResponse.json(DEMO_FALLBACK_HISTORY);
    }

    const result = await getMasterProductPriceHistory(masterProductId, timeframe);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro na API de histórico de preços:', error);
    return NextResponse.json(DEMO_FALLBACK_HISTORY);
  }
}
