// Modulo PURO (sem banco, sem server-only): classifica a falha de uma consulta ao marketplace para o registro de execucao.
// So olha o TEXTO ja produzido pelos adapters (ex.: "... /products/{id}/items HTTP 429; ... rede: ...") e o `kind` do
// ShopeeApiError. Nunca inclui o texto original no resultado (pode conter ids; nada de segredo e gravado).

export type CollectorErrorKind = 'http_429' | 'http_5xx' | 'http_4xx' | 'auth' | 'network' | 'other';

/** Prioridade quando uma mensagem junta varias falhas: 429 > auth > 5xx > 4xx > rede > outro. */
export function classifyCollectorError(message: string): CollectorErrorKind {
  const m = message ?? '';
  const codes = Array.from(m.matchAll(/HTTP (\d{3})/g)).map((x) => Number(x[1]));
  if (codes.includes(429) || /rate.?limit|too many requests/i.test(m)) return 'http_429';
  if (codes.some((c) => c === 401 || c === 403)) return 'auth';
  if (codes.some((c) => c >= 500)) return 'http_5xx';
  if (codes.some((c) => c >= 400)) return 'http_4xx';
  if (/rede|network|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|timeout|socket/i.test(m)) return 'network';
  return 'other';
}

/** Mapeia o `kind` do ShopeeApiError (shopee-auth.ts) para as mesmas categorias. */
export function classifyShopeeKind(kind: string): CollectorErrorKind {
  switch (kind) {
    case 'rate_limit':
      return 'http_429';
    case 'auth':
    case 'access':
      return 'auth';
    case 'network':
      return 'network';
    case 'http':
      return 'http_5xx';
    case 'params':
    case 'business':
      return 'http_4xx';
    default:
      return 'other';
  }
}
