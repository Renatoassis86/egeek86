// Next 16: convenção `proxy` (antiga `middleware`). Só renova cookie de sessão; autorização real fica nas actions/rotas/layout (requireAdmin).
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  // Barreira barata: /admin sem cookie de sessão do Supabase redireciona para /login antes de renderizar
  // (evita que o corpo RSC da página vaze junto com o redirect do layout). A autorização real segue em requireAdmin.
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const hasSession = request.cookies.getAll().some((c) => /^sb-.+-auth-token/.test(c.name));
    if (!hasSession) return NextResponse.redirect(new URL('/login', request.url));
  }
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
