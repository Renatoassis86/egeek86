import { NextResponse, type NextRequest } from 'next/server';
import { produtoExiste } from '@/server/pricing/produto-existe';
import { isPriceMetricsV2Enabled, isProductCardV1Enabled } from '@/lib/pricing/price-metrics-config';
import { getLojasHoje } from '@/server/pricing/lojas-hoje';

/**
 * Dados do painel "Lojas de hoje" da camada do cartão-pai (Fase 3, painel 2). SÓ LEITURA, chamada só quando a camada abre.
 * Mesmas consultas e regras do "preço agora" (ver `src/server/pricing/lojas-hoje.ts`); cache em memória de 60 s mais
 * Cache-Control s-maxage 60. Atrás de PRODUCT_CARD_V1 + PRICE_METRICS_V2: com qualquer uma desligada a rota não existe (404).
 */
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Resposta negativa (id inválido ou produto inexistente): cache de CDN de 5 min e NADA em memória, para UUIDs inexistentes não custarem consultas nem crescerem cache. */
const NEGATIVO = { 'Cache-Control': 'public, max-age=0, s-maxage=300' } as const;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isProductCardV1Enabled() || !isPriceMetricsV2Enabled()) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Produto inválido' }, { status: 400, headers: NEGATIVO });

  try {
    // Existência por chave primária ANTES das métricas (consulta leve, sem cache em memória).
    if (!(await produtoExiste(id))) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404, headers: NEGATIVO });
    const lojas = await getLojasHoje(id);
    return NextResponse.json({ ...lojas, nowIso: new Date().toISOString() }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120' } });
  } catch (error) {
    console.error(`[api/produtos/lojas] falha (masterProductId=${id})`, error);
    return NextResponse.json({ error: 'Falha ao carregar as lojas de hoje' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
