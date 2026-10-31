// Next 16: convenção `proxy` (antiga `middleware`). Só renova cookie de sessão; autorização real fica nas actions/rotas/layout (requireAdmin).
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (e) {
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all paths exceto:
     * - _next/static, _next/image, favicon, imagens
     * - rotas de webhook (precisam ser intocadas pelo middleware)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
