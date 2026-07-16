import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getMasterProductPriceHistory } from '@/server/queries/price-history';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  masterProductId: z.string().uuid(),
  timeframe: z.enum(['1D', '1S', '1M', '3M', '6M', '1A', 'Tudo']),
});

/**
 * Leitura pública (preço já é público em /ofertas). Usado pelo gráfico do
 * monitoramento tanto na primeira renderização quanto no polling periódico.
 * Retorna o MENOR preço entre vendedores do produto, não de uma oferta
 * específica — ver getMasterProductPriceHistory.
 */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    masterProductId: request.nextUrl.searchParams.get('masterProductId'),
    timeframe: request.nextUrl.searchParams.get('timeframe'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 });
  }

  const points = await getMasterProductPriceHistory(parsed.data.masterProductId, parsed.data.timeframe);
  return NextResponse.json({ points });
}
