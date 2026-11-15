// Leitor do estado embutido na página do perfil de afiliado (/social/<perfil>) para onde o link meli.la redireciona (#119).
// PURO: recebe o HTML, devolve os cartões (polycards). Sem rede e sem banco. Fixture real em scripts/fixtures/polycards-*.json.
//
// Estrutura medida em 2026-11-15: `"polycards":[{ metadata:{ id, product_id, url_params }, components:[{type:'title'|'price'|...}] }, ...]`.
// A página mostra o cartão do produto do link e depois recomendações; o cartão do link é o que casa com o anúncio/catálogo esperado.

export interface Cartao {
  itemId: string | null;
  productId: string | null;
  titulo: string | null;
  precoCents: number | null;
  precoAnteriorCents: number | null;
  pausado: boolean;
  vendedor: string | null;
  /** posição do cartão na lista (0 = primeiro). */
  pos: number;
}

type Obj = Record<string, unknown>;

/** Extrai o array JSON que começa em `"polycards":[` com contagem de colchetes que respeita strings. */
export function extrairPolycardsJson(html: string): unknown[] | null {
  const marca = '"polycards":[';
  const i = html.indexOf(marca);
  if (i < 0) return null;
  const ini = i + marca.length - 1;
  let prof = 0;
  let emTexto = false;
  let escape = false;
  for (let j = ini; j < html.length; j++) {
    const c = html[j];
    if (emTexto) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') emTexto = true;
    else if (c === '[' || c === '{') prof++;
    else if (c === ']' || c === '}') {
      prof--;
      if (prof === 0) {
        try {
          const arr = JSON.parse(html.slice(ini, j + 1));
          return Array.isArray(arr) ? arr : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : null);

export function lerCartoes(html: string): Cartao[] {
  const arr = extrairPolycardsJson(html);
  if (!arr) return [];
  return arr.map((raw, pos) => {
    const c = raw as Obj;
    const meta = (c.metadata ?? {}) as Obj;
    const comps = Array.isArray(c.components) ? (c.components as Obj[]) : [];
    const titulo = ((comps.find((x) => x.type === 'title')?.title ?? {}) as Obj).text;
    const preco = (comps.find((x) => x.type === 'price')?.price ?? {}) as Obj;
    const atual = (preco.current_price ?? {}) as Obj;
    const antes = (preco.previous_price ?? {}) as Obj;
    const sel = comps.find((x) => x.type === 'seller') as Obj | undefined;
    const vend = sel ? (((sel.seller ?? {}) as Obj).text as string | undefined) : undefined;
    const txt = JSON.stringify(c);
    return {
      itemId: typeof meta.id === 'string' ? meta.id : null,
      productId: typeof meta.product_id === 'string' ? meta.product_id : null,
      titulo: typeof titulo === 'string' ? titulo : null,
      precoCents: num(atual.value),
      precoAnteriorCents: num(antes.value),
      pausado: /an[uú]ncio pausado|publica[cç][aã]o pausada|paused/i.test(txt),
      vendedor: vend ?? null,
      pos,
    };
  });
}

export type VereditoLink = 'ok' | 'preco_divergente' | 'item_diferente' | 'pausado' | 'sem_link' | 'erro_leitura';

export interface OfertaEsperada {
  /** Anúncio esperado (external_item_id, ou o do link registrado). */
  itemId: string | null;
  /** Catálogo da oferta (external_ref MLB...). */
  productId: string | null;
  precoCents: number;
}

export interface ResultadoAuditoria {
  verdict: VereditoLink;
  cartao: Cartao | null;
  diffPct: number | null;
  nota: string;
}

/** Tolerância do preço da página x oferta: o MAIOR entre R$ 1,00 e 0,1% (a página mostra reais inteiros; 0,5% deixava passar R$ 30 em R$ 7,7 mil). */
export const TOLERANCIA_MIN_CENTS = 100;
export const TOLERANCIA_PCT = 0.1;
export const toleranciaCents = (precoCents: number) => Math.max(TOLERANCIA_MIN_CENTS, Math.round((precoCents * TOLERANCIA_PCT) / 100));

/**
 * Compara o que a página mostra com a oferta. Escolha do cartão: o primeiro cujo anúncio é o esperado; senão o primeiro do mesmo catálogo;
 * senão o primeiro cartão (o do link). Ordem do veredito: pausado, anúncio diferente do esperado, preço fora de 0,5%.
 * Oferta sem anúncio esperado (external_item_id nulo): compara só catálogo e preço (anúncio desconhecido não vira erro).
 */
export function auditarCartoes(cartoes: Cartao[], esperado: OfertaEsperada): ResultadoAuditoria {
  if (!cartoes.length) return { verdict: 'erro_leitura', cartao: null, diffPct: null, nota: 'página sem polycards' };
  const nIgual = (a: string | null, b: string | null) => !!a && !!b && a.replace(/\D/g, '') === b.replace(/\D/g, '');
  const c = cartoes.find((x) => nIgual(x.itemId, esperado.itemId)) ?? cartoes.find((x) => nIgual(x.productId, esperado.productId)) ?? cartoes[0]!;
  if (c.pausado) return { verdict: 'pausado', cartao: c, diffPct: null, nota: 'cartão marcado como anúncio pausado' };
  if (esperado.itemId && c.itemId && !nIgual(c.itemId, esperado.itemId)) return { verdict: 'item_diferente', cartao: c, diffPct: null, nota: `link mostra ${c.itemId}, oferta espera ${esperado.itemId}` };
  if (!esperado.itemId && esperado.productId && c.productId && !nIgual(c.productId, esperado.productId)) return { verdict: 'item_diferente', cartao: c, diffPct: null, nota: `link mostra o catálogo ${c.productId}, oferta é do ${esperado.productId}` };
  if (c.precoCents == null || esperado.precoCents <= 0) return { verdict: 'erro_leitura', cartao: c, diffPct: null, nota: 'preço não lido' };
  const diff = ((c.precoCents - esperado.precoCents) / esperado.precoCents) * 100;
  const d = Math.round(diff * 100) / 100;
  if (Math.abs(c.precoCents - esperado.precoCents) > toleranciaCents(esperado.precoCents)) return { verdict: 'preco_divergente', cartao: c, diffPct: d, nota: `página ${c.precoCents}, oferta ${esperado.precoCents}` };
  return { verdict: 'ok', cartao: c, diffPct: d, nota: 'confere' };
}
