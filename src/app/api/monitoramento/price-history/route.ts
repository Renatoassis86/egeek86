import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getMasterProductPriceHistory, type PriceHistoryTimeframe } from '@/server/queries/price-history';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  masterProductId: z.string().min(1),
  timeframe: z.enum(['1D', '1S', '1M', '3M', '6M', '1A', 'Tudo']),
});

export function generateTimeframeHistory(timeframe: PriceHistoryTimeframe = '1M', basePrice = 299) {
  const now = Math.floor(Date.now() / 1000);
  let durationSeconds = 30 * 86400;
  let steps = 8;

  switch (timeframe) {
    case '1D':
      durationSeconds = 86400; // 24 horas
      steps = 7;
      break;
    case '1S':
      durationSeconds = 7 * 86400; // 7 dias
      steps = 7;
      break;
    case '1M':
      durationSeconds = 30 * 86400; // 30 dias
      steps = 10;
      break;
    case '3M':
      durationSeconds = 90 * 86400; // 90 dias
      steps = 10;
      break;
    case '6M':
      durationSeconds = 180 * 86400; // 180 dias
      steps = 12;
      break;
    case '1A':
      durationSeconds = 365 * 86400; // 365 dias
      steps = 12;
      break;
    case 'Tudo':
      durationSeconds = 730 * 86400; // 2 anos
      steps = 15;
      break;
  }

  const stepSeconds = Math.floor(durationSeconds / (steps - 1));
  const startTime = now - durationSeconds;

  const points = [];
  const avgPoints = [];

  for (let i = 0; i < steps; i++) {
    const time = startTime + i * stepSeconds;
    const factor = 1 + Math.sin(i / 1.5) * 0.03 + (steps - 1 - i) * 0.004;
    const value = Math.round(basePrice * factor * 100) / 100;
    const avgValue = Math.round((value + 2.5) * 100) / 100;

    points.push({ time, value });
    avgPoints.push({ time, value: avgValue });
  }

  return {
    points,
    avgPoints,
    pointOffers: {},
    quotes: [],
    totalOffersCount: 3,
    totalQuoteCount: steps * 2,
    stats: {
      minPriceCents: Math.round(Math.min(...points.map((p) => p.value)) * 100),
      maxPriceCents: Math.round(Math.max(...points.map((p) => p.value)) * 100),
      avgPriceCents: Math.round((points.reduce((a, b) => a + b.value, 0) / points.length) * 100),
      globalMaxPriceCents: Math.round(basePrice * 1.25 * 100),
    },
  };
}

export async function GET(request: NextRequest) {
  const masterProductId = request.nextUrl.searchParams.get('masterProductId') ?? 'demo-1';
  const timeframe = (request.nextUrl.searchParams.get('timeframe') as PriceHistoryTimeframe) ?? '1M';

  // Dado sintético só pro modo demonstração (visitante sem conta) — nunca
  // como fallback pra um produto real com pouco histórico. Esse último caso
  // já é tratado honestamente no front (PriceHistoryChart mostra "ainda não
  // há histórico suficiente" quando points.length < 2), em vez de fingir uma
  // tendência de preço que não existe.
  if (masterProductId.startsWith('demo-')) {
    return NextResponse.json(generateTimeframeHistory(timeframe, 299));
  }

  try {
    const result = await getMasterProductPriceHistory(masterProductId, timeframe);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro na API de histórico de preços:', error);
    return NextResponse.json({ error: 'Falha ao carregar histórico de preço' }, { status: 500 });
  }
}
