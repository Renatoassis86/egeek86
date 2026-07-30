import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { exchangeCodeForTokens } from '@/server/collector/sources/mercado-livre-auth';

const PKCE_COOKIE = 'meli_pkce_verifier';

function htmlResponse(title: string, message: string, ok: boolean) {
  const response = new NextResponse(
    `<!doctype html><html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
      <h1 style="color: ${ok ? '#16a34a' : '#dc2626'}">${title}</h1>
      <p>${message}</p>
      <a href="/admin">Voltar pro admin</a>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: ok ? 200 : 400 }
  );
  // Cookie de PKCE é de uso único — some daqui pra frente, dê certo ou não.
  response.cookies.delete(PKCE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  await requireAdmin();

  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const codeVerifier = request.cookies.get(PKCE_COOKIE)?.value;

  if (error) {
    return htmlResponse('Autorização recusada', `O Mercado Livre retornou: ${error}. Tente de novo em /auth/mercadolivre/start.`, false);
  }
  if (!code) {
    return htmlResponse('Faltou o código', 'Nenhum "code" veio na URL. Tente iniciar de novo em /auth/mercadolivre/start.', false);
  }
  if (!codeVerifier) {
    return htmlResponse(
      'Sessão de autorização expirada',
      'O cookie de verificação (PKCE) não chegou junto — provavelmente demorou demais entre iniciar e voltar do Mercado Livre, ou o link foi aberto direto sem passar por /auth/mercadolivre/start. Tente de novo em /auth/mercadolivre/start.',
      false
    );
  }

  try {
    // Precisa ser EXATAMENTE a mesma string usada em /auth/mercadolivre/start
    // pra montar a URL de autorização — o Mercado Livre exige bater
    // caractere a caractere nas duas pontas. Usar request.nextUrl.origin
    // aqui (em vez de NEXT_PUBLIC_APP_URL, a mesma fonte do /start) foi o
    // bug real (2026-07-30): atrás do proxy da Vercel esse origin não bate
    // sempre com o domínio público, e o Mercado Livre recusa a troca com
    // "the redirect_uri does not match the original".
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    await exchangeCodeForTokens(code, `${appUrl}/auth/mercadolivre/callback`, codeVerifier);
    return htmlResponse(
      'Autorização concluída! 🎉',
      'O token do Mercado Livre foi salvo. A coleta automática de preços já pode usar a API.',
      true
    );
  } catch (err) {
    return htmlResponse('Erro ao trocar o código por token', (err as Error).message, false);
  }
}
