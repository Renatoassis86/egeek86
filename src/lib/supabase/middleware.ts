import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return supabaseResponse;

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Timeout curto e explícito: sem isso, uma resposta lenta/travada da API
    // de auth do Supabase (rede, incidente pontual, etc) segurava TODA
    // requisição de TODA página do site indefinidamente — o middleware roda
    // em toda rota não-estática, então um travamento aqui é um travamento
    // do site inteiro, não só da página que o usuário tentou abrir.
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('auth check timeout')), 5000)),
    ]);
  } catch (e) {
    // Trata timeout/erro da checagem de auth como "segue sem sessão
    // confirmada" — as rotas protegidas (requireAdmin etc) fazem sua própria
    // checagem completa depois; esse middleware é só um refresh de cookie
    // best-effort, nunca deveria ser o motivo da página não carregar.
  }

  return supabaseResponse;
}
