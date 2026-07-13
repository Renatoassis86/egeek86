import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';

/**
 * Ponto de partida da autorização única do app Mercado Livre — protegido
 * (só admin logado consegue iniciar). Só monta a URL e redireciona; a troca
 * de code por token acontece em /auth/mercadolivre/callback.
 */
export async function GET() {
  await requireAdmin();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const redirectUri = `${appUrl}/auth/mercadolivre/callback`;

  const authUrl = new URL('https://auth.mercadolivre.com.br/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', process.env.MERCADO_LIVRE_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri', redirectUri);

  return NextResponse.redirect(authUrl);
}
