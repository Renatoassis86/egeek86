import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { isVertical } from '@/lib/catalog/verticais';
import { CSV_BOM, cabecalhoCsv, linhaParaCsv, parseFiltros } from '@/lib/catalog/inventario';
import { iterarCatalogo } from '@/server/queries/catalogo-inventario';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Exportação do catálogo de uma loja em CSV (só admin; streaming; UTF-8 com BOM).
 *   GET /api/admin/catalogo/export?loja=<slug>[&formato=pt][&q=&marca=&rede=&status=&link=]
 * `formato=pt` usa `;` e vírgula decimal (abre direto no Excel em português). Os mesmos filtros da página são aceitos.
 * Lê em blocos de 1000 masters (paginação por id), então a memória fica constante mesmo com a base inteira.
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const loja = sp.get('loja') ?? '';
  if (!isVertical(loja)) return NextResponse.json({ error: 'loja inválida' }, { status: 400 });

  const f = parseFiltros(Object.fromEntries(sp.entries()));
  const formato = sp.get('formato') === 'pt' ? 'pt' : 'padrao';
  const opts = { formato, origem: request.nextUrl.origin } as const;
  const dia = new Date().toISOString().slice(0, 10);
  const encoder = new TextEncoder();
  const it = iterarCatalogo(loja, { q: f.q, marca: f.marca, rede: f.rede, status: f.status, link: f.link });
  let primeiro = true;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (primeiro) {
          primeiro = false;
          controller.enqueue(encoder.encode(CSV_BOM + cabecalhoCsv(opts)));
          return;
        }
        const { value, done } = await it.next();
        if (done) return controller.close();
        controller.enqueue(encoder.encode(value.map((l) => linhaParaCsv(l, opts)).join('')));
      } catch (err) {
        console.error('[admin/catalogo/export] falhou:', err);
        controller.error(err);
      }
    },
    async cancel() {
      await it.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="catalogo-${loja}-${dia}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
