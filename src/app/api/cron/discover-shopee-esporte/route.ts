import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { discoverShopeeEsporte, medirCamposShopee } from '@/server/collector/discover-shopee-esporte';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Descoberta Shopee do departamento ESPORTE (tênis, roupas esportivas e acessórios) pela Affiliate Open API oficial.
 * GET /api/cron/discover-shopee-esporte
 *   (sem parâmetros)  DRY-RUN: lê a Shopee e o banco, devolve o que criaria e os contadores por motivo. NÃO grava nada.
 *   ?apply=1          grava (masters em 'review' + ofertas + cotação inicial + cursor). ?dry=1 vence ?apply=1.
 *   ?terms=8 &pages=2 &from=<n> &maxCalls=150 &maxMasters=40 &maxOffers=120 &budgetMs=240000 &minSales=5 &minRating=4
 *   ?q=<termo>        busca dirigida (um termo; não mexe no cursor)      ?cat=<productCatId medido>
 *   ?link=offer       usa o offerLink do anúncio em vez de gastar uma chamada de generateShortLink por oferta
 *   ?probe=1          medição somente leitura (<= 6 chamadas): quais campos extras (categoria, tipo de loja, comissão) a API aceita
 * Autorização: `Authorization: Bearer <CRON_SECRET>` (ou ?key=) OU `Authorization: Bearer <TESTE_LOJA_KEY>` para disparo manual.
 * NÃO está no vercel.json: o agendamento é decisão do dono.
 */
function chaveDeTeste(request: NextRequest): boolean {
  const esperado = process.env.TESTE_LOJA_KEY;
  if (!esperado || esperado.length < 24) return false;
  const dado = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(dado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const intParam = (v: string | null): number | undefined => {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
};

export async function GET(request: NextRequest) {
  if (!chaveDeTeste(request)) {
    const denied = rejectUnlessCronAuthorized(request);
    if (denied) return denied;
  }
  const sp = request.nextUrl.searchParams;

  if (sp.get('probe') === '1') {
    return NextResponse.json(await medirCamposShopee((sp.get('q') ?? 'tenis nike').slice(0, 80)));
  }

  const q = sp.get('q')?.trim().slice(0, 80);
  if (q && !/^[\p{L}\p{N} .+\-]+$/u.test(q)) return NextResponse.json({ error: 'q_invalido' }, { status: 400 });
  const cat = sp.get('cat') ?? undefined;
  if (cat && !/^\d{1,19}$/.test(cat)) return NextResponse.json({ error: 'cat_invalido' }, { status: 400 });

  const apply = sp.get('apply') === '1' && sp.get('dry') !== '1';
  const minRating = sp.get('minRating');
  const summary = await discoverShopeeEsporte({
    apply,
    termos: intParam(sp.get('terms')),
    paginas: intParam(sp.get('pages')),
    from: intParam(sp.get('from')),
    q: q || undefined,
    catId: cat,
    maxChamadas: intParam(sp.get('maxCalls')),
    maxMasters: intParam(sp.get('maxMasters')),
    maxOfertas: intParam(sp.get('maxOffers')),
    orcamentoMs: intParam(sp.get('budgetMs')),
    minVendas: intParam(sp.get('minSales')),
    minNota: minRating != null && minRating !== '' && Number.isFinite(Number(minRating)) ? Number(minRating) : undefined,
    link: sp.get('link') === 'offer' ? 'offer' : 'short',
  });
  // Observabilidade: o corpo da resposta do cron não fica nos logs da Vercel. Só contagens, sem segredos.
  console.log(
    '[discover-shopee-esporte]',
    JSON.stringify({
      modo: summary.modo,
      termos: summary.termosBuscados,
      chamadas: summary.chamadas,
      encontrados: summary.encontrados,
      mastersCriados: summary.mastersCriados,
      mastersPlanejados: summary.mastersPlanejados,
      ofertasCriadas: summary.ofertasCriadas,
      ofertasPlanejadas: summary.ofertasPlanejadas,
      anexadas: summary.anexadasAMasterExistente,
      parou: summary.parou,
      contadores: summary.contadores,
      erros: summary.erros.length,
      ms: summary.ms,
    })
  );
  return NextResponse.json(summary);
}
