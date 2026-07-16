import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { exchangeCodeForTokens } from '@/server/collector/sources/mercado-livre-auth';

function htmlResponse(title: string, message: string, ok: boolean) {
  return new NextResponse(
    `<!doctype html><html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
      <h1 style="color: ${ok ? '#16a34a' : '#dc2626'}">${title}</h1>
      <p>${message}</p>
      <a href="/admin">Voltar pro admin</a>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: ok ? 200 : 400 }
  );
}

export async function GET(request: NextRequest) {
  await requireAdmin();

  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return htmlResponse('Autorização recusada', `O Mercado Livre retornou: ${error}. Tente de novo em /auth/mercadolivre/start.`, false);
  }
  if (!code) {
    return htmlResponse('Faltou o código', 'Nenhum "code" veio na URL. Tente iniciar de novo em /auth/mercadolivre/start.', false);
  }

  try {
    await exchangeCodeForTokens(code, `${origin}/auth/mercadolivre/callback`);
    return htmlResponse(
      'Autorização concluída! 🎉',
      'O token do Mercado Livre foi salvo. A coleta automática de preços já pode usar a API.',
      true
    );
  } catch (err) {
    return htmlResponse('Erro ao trocar o código por token', (err as Error).message, false);
  }
}
