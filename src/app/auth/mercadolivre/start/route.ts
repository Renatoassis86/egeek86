import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';

const PKCE_COOKIE = 'meli_pkce_verifier';

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Ponto de partida da autorização única do app Mercado Livre — protegido
 * (só admin logado consegue iniciar). Monta a URL com PKCE (achado real
 * 2026-07-30: o Mercado Livre passou a exigir code_verifier na troca de
 * code por token, então o code_challenge precisa já ir aqui) e redireciona;
 * a troca de code por token acontece em /auth/mercadolivre/callback.
 */
export async function GET() {
  await requireAdmin();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const redirectUri = `${appUrl}/auth/mercadolivre/callback`;

  // code_verifier: string aleatória guardada num cookie de curta duração só
  // pra sobreviver até o /callback voltar (RFC 7636) — code_challenge é o
  // hash dela, o que de fato vai na URL pública de autorização.
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  const authUrl = new URL('https://auth.mercadolivre.com.br/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', process.env.MERCADO_LIVRE_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(PKCE_COOKIE, codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10min — tempo de sobra pro admin completar o login no Mercado Livre
    path: '/auth/mercadolivre',
  });
  return response;
}
