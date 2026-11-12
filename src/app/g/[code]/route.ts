import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { codigoCurtoValido, destinoDoCodigo } from '@/lib/messaging/short-code';

export const dynamic = 'force-dynamic';

/**
 * LINK CURTO do WhatsApp (dono, 2026-11-12): egeek86.com/g/<5 caracteres base62>.
 * O destino sai SEMPRE da linha 'wa' do banco (slug da oferta e message_key), nunca de parametro da requisicao: nao existe redirecionamento
 * aberto. Resolve para o MESMO link rastreado /go/<slug>?s=wa&m=<messageKey>, que grava o clique (o evento so existe no /go, sem contar em dobro).
 * Codigo invalido ou inexistente = 404 sem corpo e sem cache (nao redireciona para a home, para nao mascarar varredura). Pagina publica,
 * sem token; sem indexacao (X-Robots-Tag e Disallow em /g/); sem referrer.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
  if (!codigoCurtoValido(code)) return new NextResponse(null, { status: 404, headers });
  try {
    const rows = await db.execute<{ message_key: string; slug: string | null }>(sql`
      SELECT message_key, candidate ->> 'offerSlug' AS slug FROM group_messages WHERE short_code = ${code} AND channel = 'wa' LIMIT 1
    `);
    const row = rows[0];
    const destino = row?.slug ? destinoDoCodigo(String(row.slug), String(row.message_key)) : null;
    if (!destino) return new NextResponse(null, { status: 404, headers });
    return NextResponse.redirect(new URL(destino, request.url), { status: 302, headers });
  } catch (err) {
    console.error('[g] falha ao resolver codigo curto', err instanceof Error ? err.message : err);
    return new NextResponse(null, { status: 404, headers });
  }
}
