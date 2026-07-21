import 'server-only';
import { createHash } from 'node:crypto';

export const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID || '18366231139';
export const SHOPEE_SECRET = process.env.SHOPEE_SECRET || '7MLEHQMQVUNF2GTSEUKIDGEGDX3SECUV';
export const SHOPEE_GRAPHQL_ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

/**
 * Gera os cabeçalhos de autenticação oficial da Shopee Affiliate Open API (GraphQL).
 * A assinatura SHA256 é calculada com: AppID + Timestamp + Payload + Secret.
 */
export function generateShopeeAuthHeaders(payloadString: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const factor = `${SHOPEE_APP_ID}${timestamp}${payloadString}${SHOPEE_SECRET}`;
  const signature = createHash('sha256').update(factor).digest('hex');

  return {
    'Content-Type': 'application/json',
    'Authorization': `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
    'User-Agent': 'EspacoGeek86-Scraper/1.0',
  };
}

/**
 * Executa uma requisição GraphQL autenticada para a API oficial da Shopee.
 */
export async function fetchShopeeGraphQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const body = JSON.stringify({ query, variables });
  const headers = generateShopeeAuthHeaders(body);

  const res = await fetch(SHOPEE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers,
    body,
    cache: 'no-store',
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
