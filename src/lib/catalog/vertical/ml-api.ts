// Sem 'server-only': cliente de LEITURA da API oficial do Mercado Livre com teto de chamadas (fetch injetável para testes).
// Usado pela semeadura (scripts/semear-vertical.ts). O coletor recorrente usa o OAuth/paginação próprios (collect-vertical.ts).

export class CallBudgetExceeded extends Error {}
export class RateLimited extends Error {}

export interface MlCallRecord {
  n: number;
  endpoint: string;
  status: number | 'rede';
  ms: number;
}

export interface MlClient {
  /** GET autenticado. Conta 1 chamada ANTES de enviar; lança CallBudgetExceeded se o teto já foi usado. */
  get(endpoint: string): Promise<{ status: number; json: any }>;
  used(): number;
  remaining(): number;
  history(): MlCallRecord[];
}

export interface MlClientOptions {
  token: string;
  maxCalls: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  onCall?: (c: MlCallRecord) => void;
}

/** Remove qualquer token de uma URL antes de logar. */
export function sanitizeUrl(u: string): string {
  return u.replace(/access_token=[^&]+/g, 'access_token=***');
}

export function createMlClient(opts: MlClientOptions): MlClient {
  const base = opts.baseUrl ?? 'https://api.mercadolibre.com';
  const doFetch = opts.fetchImpl ?? fetch;
  const hist: MlCallRecord[] = [];
  return {
    async get(endpoint) {
      if (hist.length >= opts.maxCalls) throw new CallBudgetExceeded(`teto de ${opts.maxCalls} chamadas ao ML atingido`);
      const t0 = Date.now();
      const n = hist.length + 1;
      let status: number | 'rede' = 'rede';
      let json: any = null;
      try {
        const res = await doFetch(`${base}${endpoint}`, { headers: { Authorization: `Bearer ${opts.token}` } });
        status = res.status;
        const txt = await res.text();
        try {
          json = JSON.parse(txt);
        } catch {
          json = { _raw: txt.slice(0, 200) };
        }
      } catch (e) {
        json = { _erro: (e as Error).message };
      }
      const rec: MlCallRecord = { n, endpoint: sanitizeUrl(endpoint), status, ms: Date.now() - t0 };
      hist.push(rec);
      opts.onCall?.(rec);
      if (status === 429) throw new RateLimited('HTTP 429 recebido: parando');
      return { status: typeof status === 'number' ? status : 0, json };
    },
    used: () => hist.length,
    remaining: () => Math.max(0, opts.maxCalls - hist.length),
    history: () => hist.slice(),
  };
}
