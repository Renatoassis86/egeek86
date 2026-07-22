import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Mesmos nomes de env var documentados em .env.example/.env.local — sem
 * fallback hardcoded. As credenciais antigas hardcoded aqui foram testadas
 * ao vivo contra o endpoint oficial em 2026-07-21 e voltaram "Invalid
 * Signature" (código 10020): não são uma conta de afiliado aprovada.
 */
export const SHOPEE_AFFILIATE_APP_ID = process.env.SHOPEE_AFFILIATE_APP_ID || '';
export const SHOPEE_AFFILIATE_APP_SECRET = process.env.SHOPEE_AFFILIATE_APP_SECRET || '';
export const SHOPEE_GRAPHQL_ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

export function hasShopeeAffiliateCredentials(): boolean {
  return Boolean(SHOPEE_AFFILIATE_APP_ID && SHOPEE_AFFILIATE_APP_SECRET);
}

/**
 * Gera os cabeçalhos de autenticação oficial da Shopee Affiliate Open API (GraphQL).
 * A assinatura SHA256 é calculada com: AppID + Timestamp + Payload + Secret.
 */
function generateShopeeAuthHeaders(payloadString: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const factor = `${SHOPEE_AFFILIATE_APP_ID}${timestamp}${payloadString}${SHOPEE_AFFILIATE_APP_SECRET}`;
  const signature = createHash('sha256').update(factor).digest('hex');

  return {
    'Content-Type': 'application/json',
    'Authorization': `SHA256 Credential=${SHOPEE_AFFILIATE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
    'User-Agent': 'EspacoGeek86-Scraper/1.0',
  };
}

/**
 * Executa uma requisição GraphQL autenticada para a API oficial da Shopee.
 * Só chamar depois de checar hasShopeeAffiliateCredentials().
 */
export async function fetchShopeeGraphQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const body = JSON.stringify({ query, variables });
  const headers = generateShopeeAuthHeaders(body);

  const res = await fetch(SHOPEE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers,
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopee API HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Shopee GraphQL Error: ${json.errors[0].message}`);
  }

  return json.data as T;
}

/**
 * Gera um link de afiliado rastreável oficial da Shopee a partir de uma URL
 * de produto. Retorna null (nunca um link fabricado) quando não há
 * credencial de afiliado aprovada configurada, ou quando a mutation falha —
 * o chamador deve usar a URL pública original e marcar `affiliateLinkPending:
 * true` nesse caso, nunca fingir comissão que não existe.
 */
export async function generateShopeeAffiliateLink(originUrl: string): Promise<string | null> {
  if (!hasShopeeAffiliateCredentials()) return null;

  try {
    const mutation = `
      mutation GenerateCustomLink($originUrl: String!) {
        generateCustomLink(input: { originUrl: $originUrl }) {
          shortLink
          longLink
        }
      }
    `;
    const data = await fetchShopeeGraphQL(mutation, { originUrl });
    return data?.generateCustomLink?.shortLink || data?.generateCustomLink?.longLink || null;
  } catch (e) {
    console.error('Erro ao gerar link customizado Shopee via GraphQL:', e);
    return null;
  }
}
