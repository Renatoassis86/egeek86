import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes('placeholder')) {
      return NextResponse.next({ request });
    }
    return await updateSession(request);
  } catch (e) {
    return NextResponse.next({ request });
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
