import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Credenciais lidas das env vars (sem fallback hardcoded). As credenciais
 * antigas hardcoded foram testadas ao vivo em 2026-07-21 e voltaram "Invalid
 * Signature" (10020): não eram de uma conta de afiliado aprovada.
 * Lidas a cada chamada (não no import) para refletirem o ambiente real.
 */
export const SHOPEE_GRAPHQL_ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

function appId(): string {
  return process.env.SHOPEE_AFFILIATE_APP_ID || '';
}
function appSecret(): string {
  return process.env.SHOPEE_AFFILIATE_APP_SECRET || '';
}

export function isShopeeAffiliateConfigured(): boolean {
  return Boolean(appId() && appSecret());
}
/** Alias mantido por compatibilidade com chamadores existentes. */
export const hasShopeeAffiliateCredentials = isShopeeAffiliateConfigured;

/**
 * Classes de falha da API oficial (códigos documentados no Open API da
 * Shopee Afiliados): 10020 assinatura/credencial/timestamp, 10030 rate
 * limit, 10031/10032/10033/10034/10035 acesso negado/afiliado inválido ou
 * congelado, 11000 erro de negócio, 11001 parâmetro inválido.
 */
export type ShopeeErrorKind = 'auth' | 'rate_limit' | 'access' | 'params' | 'business' | 'http' | 'network' | 'unknown';

export class ShopeeApiError extends Error {
  constructor(
    message: string,
    public readonly kind: ShopeeErrorKind,
    public readonly code: number | null,
    public readonly httpStatus: number | null
  ) {
    super(message);
    this.name = 'ShopeeApiError';
  }
  /** Erro que invalida o lote inteiro (credencial, acesso, limite): não adianta tentar o próximo item. */
  get isFatalForBatch(): boolean {
    return this.kind === 'auth' || this.kind === 'access' || this.kind === 'rate_limit';
  }
}

function kindFromCode(code: number | null, httpStatus: number | null): ShopeeErrorKind {
  if (code === 10020) return 'auth';
  if (code === 10030 || httpStatus === 429) return 'rate_limit';
  if (code != null && code >= 10031 && code <= 10035) return 'access';
  if (code === 11001) return 'params';
  if (code === 11000) return 'business';
  if (httpStatus === 401) return 'auth';
  if (httpStatus === 403) return 'access';
  if (httpStatus != null && httpStatus >= 400) return 'http';
  return 'unknown';
}

function extractCode(err: any): number | null {
  const fromExt = Number(err?.extensions?.code);
  if (Number.isFinite(fromExt) && fromExt > 0) return fromExt;
  const m = /\b(1[01]\d{3})\b/.exec(String(err?.message ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Cabeçalhos de autenticação oficial (GraphQL): SHA256 de
 * AppID + Timestamp + Payload + Secret.
 */
function generateShopeeAuthHeaders(payloadString: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const factor = `${appId()}${timestamp}${payloadString}${appSecret()}`;
  const signature = createHash('sha256').update(factor).digest('hex');

  return {
    'Content-Type': 'application/json',
    Authorization: `SHA256 Credential=${appId()}, Timestamp=${timestamp}, Signature=${signature}`,
    'User-Agent': 'EspacoGeek86/1.0',
  };
}

/**
 * Requisição GraphQL autenticada à API oficial. Lança ShopeeApiError
 * classificado (nunca devolve dado parcial em silêncio). Só chamar depois de
 * isShopeeAffiliateConfigured().
 */
export async function fetchShopeeGraphQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  if (!isShopeeAffiliateConfigured()) {
    throw new ShopeeApiError('Shopee: credenciais ausentes (SHOPEE_AFFILIATE_APP_ID/SECRET)', 'auth', null, null);
  }
  const body = JSON.stringify({ query, variables });
  const headers = generateShopeeAuthHeaders(body);

  let res: Response;
  try {
    res = await fetch(SHOPEE_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new ShopeeApiError(`Shopee rede: ${(e as Error).message}`, 'network', null, null);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // corpo não-JSON: tratado abaixo pelo status HTTP
  }

  // GraphQL pode devolver erro com HTTP 200 ou com 4xx; lê `errors` nos dois casos.
  if (json?.errors?.length) {
    const first = json.errors[0];
    const code = extractCode(first);
    throw new ShopeeApiError(
      `Shopee GraphQL${code ? ` [${code}]` : ''}: ${String(first?.message ?? 'erro').slice(0, 300)}`,
      kindFromCode(code, res.ok ? null : res.status),
      code,
      res.status
    );
  }
  if (!res.ok) {
    throw new ShopeeApiError(`Shopee API HTTP ${res.status}: ${text.slice(0, 200)}`, kindFromCode(null, res.status), null, res.status);
  }
  if (!json || json.data == null) {
    throw new ShopeeApiError('Shopee API: resposta sem campo data', 'unknown', null, res.status);
  }
  return json.data as T;
}

/** Sub IDs de rastreio (máx. 5 pela API): identificam a origem do clique nos relatórios de comissão. */
export const SHOPEE_DEFAULT_SUB_IDS = ['egeek86', 'site'];

/**
 * Link de afiliado oficial (mutation generateShortLink, saída documentada:
 * shortLink). Retorna null (nunca um link fabricado) quando não há
 * credencial ou a mutation falha — o chamador usa a URL pública e marca
 * affiliateLinkPending: true.
 */
export async function generateShopeeAffiliateLink(
  originUrl: string,
  subIds: string[] = SHOPEE_DEFAULT_SUB_IDS
): Promise<string | null> {
  if (!isShopeeAffiliateConfigured()) return null;
  try {
    const mutation = `
      mutation GenerateShortLink($input: ShortLinkInput!) {
        generateShortLink(input: $input) {
          shortLink
        }
      }
    `;
    const data = await fetchShopeeGraphQL(mutation, { input: { originUrl, subIds: subIds.slice(0, 5) } });
    const link = data?.generateShortLink?.shortLink;
    return typeof link === 'string' && /^https:\/\//.test(link) ? link : null;
  } catch (e) {
    console.error('Erro ao gerar link de afiliado Shopee:', (e as Error).message);
    return null;
  }
}
