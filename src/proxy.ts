// Next 16: convenção `proxy` (antiga `middleware`). Só renova cookie de sessão; autorização real fica nas actions/rotas/layout (requireAdmin).
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { COOKIE_VISITANTE_HOME } from '@/lib/redesenho-home';

export async function proxy(request: NextRequest) {
  // Barreira barata: /admin sem cookie de sessão do Supabase redireciona para /login antes de renderizar
  // (evita que o corpo RSC da página vaze junto com o redirect do layout). A autorização real segue em requireAdmin.
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const hasSession = request.cookies.getAll().some((c) => /^sb-.+-auth-token/.test(c.name));
    if (!hasSession) return NextResponse.redirect(new URL('/login', request.url));
  }
  // Flag REDESENHO_HOME: identificador anonimo e estavel do visitante (so na home), usado no sorteio por percentual.
  // Sem dado pessoal; vale 1 ano. Escrito tambem na requisicao para a primeira visita ja ter o grupo.
  const precisaIdVisitante = request.nextUrl.pathname === '/' && !request.cookies.has(COOKIE_VISITANTE_HOME);
  const novoId = precisaIdVisitante ? crypto.randomUUID() : null;
  if (novoId) request.cookies.set(COOKIE_VISITANTE_HOME, novoId);
  const comId = (res: NextResponse) => {
    if (novoId) {
      res.cookies.set(COOKIE_VISITANTE_HOME, novoId, {
        maxAge: 31_536_000,
        path: '/',
        sameSite: 'lax',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return res;
  };
  try {
    return comId(await updateSession(request));
  } catch (e) {
    return comId(NextResponse.next({ request }));
  }
}

export const config = {
  matcher: [
    /*
     * Match all paths exceto:
     * - _next/static, _next/image, favicon, imagens
     * - rotas de webhook (precisam ser intocadas pelo middleware)
     * - api/ingest (coleta assistida da Amazon: autenticada por token dedicado, CORS próprio, sem cookie de sessão)
     * - rotas de dados públicas da camada do cartão (api/produtos/[id]/grafico e /lojas): não precisam de sessão e devem ficar
     *   cacheáveis no CDN (sem refresh de cookie, sem chamada ao Supabase Auth, sem risco de Set-Cookie na resposta)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/ingest|api/produtos|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
