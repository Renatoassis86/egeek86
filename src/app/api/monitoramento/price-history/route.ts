import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getMasterProductPriceHistory, type PriceHistoryTimeframe } from '@/server/queries/price-history';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  masterProductId: z.string().min(1),
  timeframe: z.enum(['1D', '1S', '1M', '3M', '6M', '1A', 'Tudo']),
});

export async function GET(request: NextRequest) {
  // Nunca há série sintética: produto sem histórico suficiente é tratado
  // honestamente no front (PriceHistoryChart mostra "ainda não há histórico
  // suficiente" quando points.length < 2).
  const parsed = querySchema.safeParse({
    masterProductId: request.nextUrl.searchParams.get('masterProductId') ?? '',
    timeframe: request.nextUrl.searchParams.get('timeframe') ?? '1M',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }
  const { masterProductId, timeframe } = parsed.data as { masterProductId: string; timeframe: PriceHistoryTimeframe };

  try {
    const result = await getMasterProductPriceHistory(masterProductId, timeframe);
    return NextResponse.json(result);
  } catch (error) {
    // Produto inexistente OU de outro departamento (ADR 0008): 404, nunca detalhe de outra vertical.
    if (error instanceof Error && error.message === 'Produto master não encontrado') {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }
    console.error('Erro na API de histórico de preços:', error);
    return NextResponse.json({ error: 'Falha ao carregar histórico de preço' }, { status: 500 });
  }
}
