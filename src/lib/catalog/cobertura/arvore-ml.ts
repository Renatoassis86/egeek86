// Sem 'server-only': lógica PURA (sem banco, sem rede) da descoberta por ÁRVORE DE CATEGORIA / DESTAQUES do Mercado Livre.
// Usada por scripts/descobrir-por-arvore.ts (dry-run da fase 1 da cobertura total, 2026-11-16) e, depois da aprovação do dono, pela fatia do servidor.
import { domainMatches, SEGMENTS, type NonGamesVertical, type SegmentConfig } from '@/lib/catalog/vertical/config';
import type { MlCatalogPayload } from '@/lib/catalog/vertical/identity';

/**
 * O QUE A API OFICIAL DO ML PERMITE (medido AO VIVO em 2026-11-16, ver docs/cobertura-total-2026-11-16/01-diagnostico.md):
 *  - GET /sites/MLB/categories e /categories/{id}: ÁRVORE com `total_items_in_this_category` (universo de anúncios por categoria). 200.
 *  - GET /highlights/MLB/category/{id}: os 20 MAIS VENDIDOS da categoria (PRODUCT = id de catálogo, ITEM = anúncio livre). 200.
 *  - GET /trends/MLB/{id}: 50 palavras em alta da categoria (fonte de termos por demanda, não por palpite). 200.
 *  - GET /products/search EXIGE `q`/`keywords`/`product_identifier`/`attributes`: NÃO há navegação por categoria ou domínio puro (400).
 *  - /products/search: `offset` máximo 100 (400 acima) e `limit` máximo 100, então UMA consulta alcança no máximo 200 catálogos. O comentário
 *    antigo "20 páginas de 50 = 1000" nunca foi alcançável: a profundidade 3 em diante dá HTTP 400 (vira "termo esgotado").
 *  - `search_after` com o `paging.last` devolvido NÃO avança (repete a mesma página): não serve de cursor.
 *  - /sites/MLB/search: 403 (restrito), como já documentado.
 */
export const LIMITES_API_ML = { searchOffsetMax: 100, searchLimitMax: 100, highlightsPorCategoria: 20, trendsPorCategoria: 50 } as const;

/** Nó da árvore de categorias do ML. */
export interface CategoriaML {
  id: string;
  name: string;
  total: number | null;
  children: Array<{ id: string; name: string; total: number | null }>;
}

const ID_CATEGORIA = /^MLB\d{1,9}$/;

export function parseCategoria(json: unknown): CategoriaML | null {
  const j = json as { id?: unknown; name?: unknown; total_items_in_this_category?: unknown; children_categories?: unknown } | null;
  if (!j || typeof j.id !== 'string' || !ID_CATEGORIA.test(j.id)) return null;
  const children = Array.isArray(j.children_categories) ? j.children_categories : [];
  return {
    id: j.id,
    name: typeof j.name === 'string' ? j.name : j.id,
    total: typeof j.total_items_in_this_category === 'number' ? j.total_items_in_this_category : null,
    children: children
      .map((c: any) => ({ id: String(c?.id ?? ''), name: String(c?.name ?? ''), total: typeof c?.total_items_in_this_category === 'number' ? c.total_items_in_this_category : null }))
      .filter((c) => ID_CATEGORIA.test(c.id)),
  };
}

/** Categorias que nunca valem a pena para o hub: peças, acessórios, reposição, "outros" (regra do dono: sem itens miúdos). */
export const CATEGORIA_FORA = /pe[cç]as|acess[oó]rios|reposi[cç][aã]o|^outros|filtros?\b|cartuchos?|capas?\b|suportes?\b|cabos?\b|refil|utens[ií]lios|descart[aá]ve/i;

export interface CategoriaEscolhida {
  id: string;
  name: string;
  total: number | null;
  depth: number;
  path: string;
}

/**
 * Escolhe as categorias para pedir destaques: a partir das raízes, desce até `profundidade` níveis (1 = filhos diretos), ignora `CATEGORIA_FORA`
 * e categorias com menos de `minAnuncios` anúncios, e ordena pela maior (universo maior primeiro). Sem repetir id. `arvore` guarda os nós já lidos.
 */
export function escolherCategorias(arvore: Map<string, CategoriaML>, raizes: string[], opts: { profundidade: number; minAnuncios?: number; fora?: RegExp; max?: number }): CategoriaEscolhida[] {
  const fora = opts.fora ?? CATEGORIA_FORA;
  const min = opts.minAnuncios ?? 0;
  const vistos = new Set<string>();
  const out: CategoriaEscolhida[] = [];
  const visita = (id: string, depth: number, path: string) => {
    const n = arvore.get(id);
    if (!n) return;
    for (const c of n.children) {
      if (vistos.has(c.id) || fora.test(c.name) || (c.total != null && c.total < min)) continue;
      vistos.add(c.id);
      const p = path ? `${path} > ${c.name}` : c.name;
      out.push({ id: c.id, name: c.name, total: c.total, depth, path: p });
      if (depth < opts.profundidade) visita(c.id, depth + 1, p);
    }
  };
  for (const r of raizes) visita(r, 1, arvore.get(r)?.name ?? '');
  out.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  return opts.max ? out.slice(0, opts.max) : out;
}

/** Catálogos (PRODUCT) dos destaques de uma categoria, na ordem de posição. Itens livres (ITEM) não entram (a regra de identidade não os aceita). */
export function candidatosDeDestaques(json: unknown): { id: string; position: number }[] {
  const content = (json as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return [];
  const out: { id: string; position: number }[] = [];
  for (const c of content as any[]) {
    if (c?.type === 'PRODUCT' && typeof c.id === 'string' && /^MLB\d{5,12}$/.test(c.id)) out.push({ id: c.id, position: Number(c.position) || out.length + 1 });
  }
  return out;
}

/** Palavras em alta da categoria (`/trends`), normalizadas, sem repetir termos que o segmento já tem. Fonte de termos por DEMANDA. */
export function termosDeTendencias(json: unknown, jaTem: string[] = []): string[] {
  if (!Array.isArray(json)) return [];
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const tem = new Set(jaTem.map(norm));
  const out: string[] = [];
  for (const t of json as any[]) {
    const k = typeof t?.keyword === 'string' ? norm(t.keyword) : '';
    if (k.length >= 4 && k.length <= 60 && !tem.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

export interface Agrupamento {
  porSegmento: Map<string, MlCatalogPayload[]>;
  /** Domínio do ML que NENHUM segmento do departamento cobre: o tipo de produto não tem semente (buraco por tipo). */
  semSegmento: Map<string, MlCatalogPayload[]>;
}

/** Atribui cada catálogo ao segmento do departamento cujo domínio o aceita (`domainMatches`); o resto é "tipo sem semente". */
export function agruparPorSegmento(vertical: NonGamesVertical, payloads: MlCatalogPayload[], segmentos: SegmentConfig[] = SEGMENTS): Agrupamento {
  const segs = segmentos.filter((s) => s.vertical === vertical);
  const porSegmento = new Map<string, MlCatalogPayload[]>();
  const semSegmento = new Map<string, MlCatalogPayload[]>();
  for (const p of payloads) {
    const seg = segs.find((s) => domainMatches(s, p.domain_id));
    const alvo = seg ? porSegmento : semSegmento;
    const chave = seg ? seg.key : (p.domain_id ?? 'sem-dominio');
    const lista = alvo.get(chave) ?? [];
    lista.push(p);
    alvo.set(chave, lista);
  }
  return { porSegmento, semSegmento };
}

/** Flag da descoberta por árvore no servidor: DESLIGADA por padrão (só '1' liga). O dry-run por script não depende dela (só lê). */
export const descobertaArvoreLigada = (env: string | undefined): boolean => env === '1';

/**
 * Medida de COBERTURA de uma lista de destaques: quantos catálogos já estão no banco (ou têm 404 conhecido) e quantos faltam.
 * `meta` é a fração mínima aceitável da área (areas.ts); abaixo dela o medidor acende o alerta.
 */
export function coberturaDeDestaques(ids: string[], noBanco: Set<string>, semVendedor: Set<string>, meta: number) {
  const unicos = Array.from(new Set(ids));
  const ja = unicos.filter((i) => noBanco.has(i)).length;
  const sv = unicos.filter((i) => !noBanco.has(i) && semVendedor.has(i)).length;
  const faltam = unicos.length - ja - sv;
  const cobertura = unicos.length - sv > 0 ? ja / (unicos.length - sv) : 1;
  return { total: unicos.length, noBanco: ja, semVendedorConhecido: sv, faltam, cobertura, alerta: cobertura < meta };
}
