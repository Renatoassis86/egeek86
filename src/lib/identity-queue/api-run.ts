// R4: laco de consulta a API OFICIAL do Mercado Livre para os itens da fila. PURO: toda a rede e toda a gravacao entram por injecao (`ApiRunDeps`),
// entao o teste roda com respostas simuladas e nada sai da maquina. Respeita a quota: limite por execucao, parada no primeiro 429 e em 403 repetido.
import {
  ML_ITEM_FIELDS, errorEvidence, extractMlEvidence, extractMlWinnerEvidence, judgeEvidence, type JudgeInput, type MlEvidence, type RawMlItem,
} from '@/lib/identity-queue/api-evidence';

export const ML_API = 'https://api.mercadolibre.com';
export const MAX_403_SEGUIDOS = 3;
export const MAX_ERROS = 5;

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

export interface ApiItem extends JudgeInput {
  itemId: string; // id do item da fila (identity_review_items.id)
  offerId: string;
  mlItemId: string; // MLB123...
  catalogRef: string | null; // affiliate_offers.external_ref (catalogo), usado so no fallback
  title: string;
}

export interface ApiRunDeps {
  fetchImpl: FetchLike;
  token: () => Promise<string>;
  now: () => Date;
  /** Grava a evidencia no item da fila (so com apply). */
  saveEvidence?: (item: ApiItem, ev: MlEvidence) => Promise<void>;
  /** Aplica a decisao 'api_oficial' (so com apply). */
  applyVerdict?: (item: ApiItem, value: string) => Promise<{ ok: boolean; error?: string; already?: boolean }>;
}

export interface ApiRunOptions { apply: boolean; maxCalls: number; deadlineAt?: number; timeoutMs?: number }

export interface ApiRunLine { itemId: string; offerId: string; mlItemId: string; axis: string; via?: string; condition?: string | null; atributos?: Record<string, string>; veredito?: { value: string; motivo: string } | null; resultado: string }
export interface ApiRunResult {
  modo: 'apply' | 'dry-run';
  parou: 'fim' | '429' | '403_repetido' | 'erros' | 'tempo' | 'limite_de_chamadas';
  chamadas: number;
  consultados: number;
  comProva: number;
  aplicados: number;
  erros: number;
  linhas: ApiRunLine[];
}

type Got = { kind: 'ok'; body: unknown } | { kind: 'rate_limited' } | { kind: 'forbidden' } | { kind: 'not_found' } | { kind: 'error'; status: number };

async function getJson(url: string, deps: ApiRunDeps, timeoutMs: number): Promise<Got> {
  try {
    const token = await deps.token();
    const res = await deps.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 429) return { kind: 'rate_limited' };
    if (res.status === 403) return { kind: 'forbidden' };
    if (res.status === 404) return { kind: 'not_found' };
    if (!res.ok) return { kind: 'error', status: res.status };
    return { kind: 'ok', body: await res.json() };
  } catch {
    return { kind: 'error', status: 0 };
  }
}

export async function runApiOficial(items: ApiItem[], deps: ApiRunDeps, opts: ApiRunOptions): Promise<ApiRunResult> {
  const out: ApiRunResult = { modo: opts.apply ? 'apply' : 'dry-run', parou: 'fim', chamadas: 0, consultados: 0, comProva: 0, aplicados: 0, erros: 0, linhas: [] };
  const timeoutMs = opts.timeoutMs ?? 8_000;
  let seq403 = 0;
  const seen = new Set<string>(); // o mesmo anuncio em dois eixos e consultado uma vez so
  const cache = new Map<string, MlEvidence>();

  for (const it of items) {
    if (opts.deadlineAt && deps.now().getTime() > opts.deadlineAt) { out.parou = 'tempo'; break; }
    if (out.chamadas >= opts.maxCalls) { out.parou = 'limite_de_chamadas'; break; }
    const line: ApiRunLine = { itemId: it.itemId, offerId: it.offerId, mlItemId: it.mlItemId, axis: it.axis, resultado: '' };
    let ev = cache.get(it.mlItemId) ?? null;
    if (!ev) {
      if (seen.has(it.mlItemId)) continue;
      seen.add(it.mlItemId);
      const got = await getJson(`${ML_API}/items/${encodeURIComponent(it.mlItemId)}?attributes=${ML_ITEM_FIELDS}`, deps, timeoutMs);
      out.chamadas++;
      if (got.kind === 'rate_limited') { out.parou = '429'; line.resultado = '429_parou'; out.linhas.push(line); break; }
      if (got.kind === 'ok') {
        seq403 = 0;
        ev = extractMlEvidence(got.body as RawMlItem, it.mlItemId, deps.now());
      } else if (got.kind === 'not_found') {
        seq403 = 0;
        ev = errorEvidence(it.mlItemId, deps.now(), 404, 'anúncio não encontrado');
      } else if (got.kind === 'forbidden') {
        seq403++;
        // Fallback oficial: /products/{catalogo}/items (a coleta usa este caminho). Da condicao/preco/vendedor, sem atributos.
        if (it.catalogRef && /^MLB\d+$/.test(it.catalogRef) && out.chamadas < opts.maxCalls) {
          const fb = await getJson(`${ML_API}/products/${it.catalogRef}/items?limit=100`, deps, timeoutMs);
          out.chamadas++;
          if (fb.kind === 'rate_limited') { out.parou = '429'; line.resultado = '429_parou'; out.linhas.push(line); break; }
          if (fb.kind === 'ok') {
            const rows = (fb.body as { results?: Array<{ item_id?: string; price?: number; condition?: string | null; seller_id?: number | string; listing_type_id?: string | null; sold_quantity?: number | null }> })?.results;
            const row = Array.isArray(rows) ? rows.find((r) => r.item_id === it.mlItemId) : undefined;
            if (row) ev = extractMlWinnerEvidence(row, it.mlItemId, deps.now());
          }
        }
        if (!ev) ev = errorEvidence(it.mlItemId, deps.now(), 403, 'a API negou acesso ao anúncio (403)');
        if (seq403 >= MAX_403_SEGUIDOS) {
          // Grava o que tem e para: a rota de itens esta negando; insistir so gasta quota.
          out.parou = '403_repetido';
        }
      } else {
        out.erros++;
        line.resultado = `erro_http_${got.status}`;
        out.linhas.push(line);
        if (out.erros >= MAX_ERROS) { out.parou = 'erros'; break; }
        continue; // sem evidencia: nada e gravado, tenta de novo na proxima rodada
      }
      cache.set(it.mlItemId, ev);
    }
    out.consultados++;
    const verdict = judgeEvidence(it, ev);
    line.via = ev.via; line.condition = ev.condition; line.atributos = ev.attrs; line.veredito = verdict ? { value: verdict.value, motivo: verdict.motivo } : null;
    if (verdict) out.comProva++;
    const toSave: MlEvidence = { ...ev, veredito: verdict ? { ...verdict, aplicado: false } : null };
    line.resultado = verdict ? 'prova' : ev.erro ? 'sem_dados' : 'sem_prova';
    if (opts.apply && deps.saveEvidence) {
      if (verdict && deps.applyVerdict) {
        const r = await deps.applyVerdict(it, verdict.value);
        if (r.ok && !r.already) { out.aplicados++; toSave.veredito = { ...verdict, aplicado: true }; line.resultado = 'aplicado'; }
        else if (!r.ok) line.resultado = `prova_nao_aplicada_${r.error ?? 'erro'}`;
      }
      await deps.saveEvidence(it, toSave);
    }
    out.linhas.push(line);
    if (out.parou === '403_repetido') break;
  }
  return out;
}
