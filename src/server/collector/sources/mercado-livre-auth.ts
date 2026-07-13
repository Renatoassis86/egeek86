import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { systemConfig } from '@/db/schema';

const CONFIG_KEY = 'mercado_livre_oauth';
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms — quando o access_token expira. */
  expiresAt: number;
}

async function readStoredTokens(): Promise<StoredTokens | null> {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, CONFIG_KEY)).limit(1);
  return (row?.value as StoredTokens | undefined) ?? null;
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  await db
    .insert(systemConfig)
    .values({ key: CONFIG_KEY, value: tokens, description: 'Tokens OAuth do app Mercado Livre (Geek Deals)' })
    .onConflictDoUpdate({ target: systemConfig.key, set: { value: tokens, updatedAt: new Date() } });
}

/** Chamado pela rota de callback logo após o usuário autorizar (etapa única, manual). */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<void> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.MERCADO_LIVRE_CLIENT_ID!,
      client_secret: process.env.MERCADO_LIVRE_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao trocar code por token (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  await saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
}

async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.MERCADO_LIVRE_CLIENT_ID!,
      client_secret: process.env.MERCADO_LIVRE_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao renovar token (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const tokens: StoredTokens = {
    accessToken: data.access_token,
    // Mercado Livre rotaciona o refresh_token a cada uso — sempre salvar o novo.
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

/**
 * Retorna um access_token válido, renovando automaticamente se estiver perto
 * de expirar (access_token dura 6h). Lança erro descritivo se a autorização
 * inicial (etapa manual, uma vez) ainda não foi feita.
 */
export async function getValidAccessToken(): Promise<string> {
  const stored = await readStoredTokens();
  if (!stored) {
    throw new Error(
      'Mercado Livre: nenhum token salvo ainda. Complete a autorização única em /auth/mercadolivre/start antes de coletar preços.'
    );
  }

  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() < stored.expiresAt - fiveMinutes) {
    return stored.accessToken;
  }

  const refreshed = await refreshTokens(stored.refreshToken);
  return refreshed.accessToken;
}
