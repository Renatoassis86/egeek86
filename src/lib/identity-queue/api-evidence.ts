// R4 da fila de classificacao (ata 2026-11-11-time-identidade-itens): EVIDENCIA da API OFICIAL da loja. PURO: sem banco, sem rede, sem 'server-only'.
// Regra de ouro: so dado que a API devolveu. Nada e inferido por preco nem por titulo. A prova so vale quando e INEQUIVOCA (um unico valor possivel,
// item sem variacoes, condicao nova); qualquer ambiguidade devolve null e o item continua pendente, com a evidencia exibida ao dono.
import type { QueueAxis, QueueOption } from '@/lib/identity-queue/model';

/** Atributos do item que o projeto guarda (o resto da resposta e descartado: a evidencia fica pequena). */
export const ML_ATTR_IDS = ['CAPACITY', 'INTERNAL_MEMORY', 'STORAGE_CAPACITY', 'MODEL', 'ALPHANUMERIC_MODEL', 'LINE', 'BRAND', 'ITEM_CONDITION', 'GTIN', 'MPN'] as const;
/** Campos pedidos ao /items/{id} (selecao de campos da API oficial). */
export const ML_ITEM_FIELDS = 'id,title,condition,status,price,listing_type_id,sold_quantity,available_quantity,seller_id,catalog_product_id,attributes,variations';

export interface MlEvidence {
  fonte: 'mercado_livre';
  /** items = GET /items/{id}; products_items = fallback GET /products/{catalogo}/items (so condicao/preco/vendedor). */
  via: 'items' | 'products_items';
  itemId: string;
  consultadoEm: string;
  httpStatus: number;
  status?: string | null;
  condition?: string | null;
  listingType?: string | null;
  soldQuantity?: number | null;
  availableQuantity?: number | null;
  sellerId?: string | null;
  catalogProductId?: string | null;
  price?: number | null;
  title?: string | null;
  /** Quantidade de variacoes do anuncio (atributos no nivel do item nao valem como prova quando > 0). */
  variations?: number | null;
  attrs: Record<string, string>;
  /** Motivo de nao haver dados (ex.: 'nao_encontrado', 'api_negou_403'). */
  erro?: string;
  veredito?: { value: string; label: string; motivo: string; aplicado: boolean } | null;
}

interface RawAttr { id?: string; name?: string; value_name?: string | null; value_struct?: { number?: number | string; unit?: string } | null; values?: Array<{ name?: string | null }> }
export interface RawMlItem {
  id?: string; title?: string; condition?: string | null; status?: string | null; price?: number | null; listing_type_id?: string | null; sold_quantity?: number | null;
  available_quantity?: number | null; seller_id?: number | string | null; catalog_product_id?: string | null; attributes?: RawAttr[]; variations?: unknown[];
}

const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Texto do atributo: value_name, ou numero+unidade da value_struct, ou o primeiro de values. */
function attrText(a: RawAttr): string | null {
  const vn = a.value_name?.trim();
  if (vn) return vn;
  const s = a.value_struct;
  if (s && s.number != null && s.number !== '') return `${s.number}${s.unit ? ` ${s.unit}` : ''}`.trim();
  const v = a.values?.find((x) => x?.name)?.name;
  return v ? String(v).trim() : null;
}

export function extractMlEvidence(body: RawMlItem, itemId: string, now: Date, httpStatus = 200): MlEvidence {
  const attrs: Record<string, string> = {};
  for (const a of body.attributes ?? []) {
    const id = a?.id;
    if (!id || !(ML_ATTR_IDS as readonly string[]).includes(id)) continue;
    const t = attrText(a);
    if (t) attrs[id] = t;
  }
  return {
    fonte: 'mercado_livre', via: 'items', itemId, consultadoEm: now.toISOString(), httpStatus,
    status: str(body.status), condition: str(body.condition), listingType: str(body.listing_type_id), soldQuantity: numOrNull(body.sold_quantity),
    availableQuantity: numOrNull(body.available_quantity), sellerId: str(body.seller_id), catalogProductId: str(body.catalog_product_id), price: numOrNull(body.price),
    title: str(body.title), variations: Array.isArray(body.variations) ? body.variations.length : null, attrs,
  };
}

/** Fallback /products/{catalogo}/items: o anuncio vencedor traz condicao, preco e vendedor (sem atributos). */
export function extractMlWinnerEvidence(row: { item_id?: string; price?: number; condition?: string | null; seller_id?: number | string; listing_type_id?: string | null; sold_quantity?: number | null }, itemId: string, now: Date): MlEvidence {
  return {
    fonte: 'mercado_livre', via: 'products_items', itemId, consultadoEm: now.toISOString(), httpStatus: 200, condition: str(row.condition), price: numOrNull(row.price),
    sellerId: str(row.seller_id), listingType: str(row.listing_type_id), soldQuantity: numOrNull(row.sold_quantity), attrs: {},
  };
}

export function errorEvidence(itemId: string, now: Date, httpStatus: number, erro: string): MlEvidence {
  return { fonte: 'mercado_livre', via: 'items', itemId, consultadoEm: now.toISOString(), httpStatus, attrs: {}, erro };
}

// ------------------------------------------------------------------------------------------------
// Texto para o cartao do popup ("a API do ML diz: ...")
// ------------------------------------------------------------------------------------------------
const COND_PT: Record<string, string> = { new: 'novo', used: 'usado', not_specified: 'não especificada' };
const ATTR_PT: Record<string, string> = {
  CAPACITY: 'capacidade', INTERNAL_MEMORY: 'memória interna', STORAGE_CAPACITY: 'armazenamento', MODEL: 'modelo', ALPHANUMERIC_MODEL: 'código do modelo', LINE: 'linha',
  BRAND: 'marca', ITEM_CONDITION: 'condição (atributo)', GTIN: 'GTIN', MPN: 'MPN',
};

/** Linhas curtas e honestas do que a API disse (so o que veio). Vazio quando nao ha dado. */
export function evidenceLines(ev: MlEvidence | null | undefined): string[] {
  if (!ev) return [];
  const loja = ev.fonte === 'mercado_livre' ? 'Mercado Livre' : String(ev.fonte);
  if (ev.erro) return [`API do ${loja}: sem dados (${ev.erro}).`];
  const parts: string[] = [];
  if (ev.condition) parts.push(`condição: ${COND_PT[ev.condition] ?? ev.condition}`);
  if (ev.status) parts.push(`anúncio: ${ev.status}`);
  if (ev.listingType) parts.push(`tipo: ${ev.listingType}`);
  if (ev.soldQuantity != null) parts.push(`vendidos: ${ev.soldQuantity}`);
  if (ev.sellerId) parts.push(`vendedor: ${ev.sellerId}`);
  if (ev.catalogProductId) parts.push(`catálogo: ${ev.catalogProductId}`);
  if (ev.variations) parts.push(`${ev.variations} variações`);
  for (const [k, v] of Object.entries(ev.attrs)) parts.push(`${ATTR_PT[k] ?? k}: ${v}`);
  const lines = [`A API do ${loja} diz: ${parts.length ? parts.join(' · ') : 'sem atributos relevantes'}.`];
  if (ev.via === 'products_items') lines.push('(leitura pelo catálogo: o anúncio não deu acesso aos atributos)');
  if (ev.veredito) lines.push(`${ev.veredito.aplicado ? 'Aplicado pela API' : 'A API sugere'}: ${ev.veredito.label} (${ev.veredito.motivo}).`);
  return lines;
}

// ------------------------------------------------------------------------------------------------
// Prova inequivoca
// ------------------------------------------------------------------------------------------------
export interface JudgeInput { axis: QueueAxis; options: QueueOption[]; understood: Record<string, unknown> }
export interface Verdict { value: string; label: string; motivo: string }

/** "825 GB", "1 TB", "1TB", "512gb" -> GB (TB = 1000). null se nao for capacidade. */
export function parseCapacityGb(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(m[2].toLowerCase() === 'tb' ? n * 1000 : n);
}

/** GB -> valor da opcao do eixo 'armazenamento' (Xbox). So os tamanhos oficiais; 825 GB nao e opcao. */
export function storageOptionValue(gb: number): string | null {
  if (gb === 512) return '512gb';
  if (gb === 1000 || gb === 1024) return '1000gb';
  if (gb === 2000 || gb === 2048) return '2000gb';
  return null;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Modelo de console por codigo/nome que a API devolveu em MODEL/ALPHANUMERIC_MODEL/LINE. Mais de um modelo distinto = ambiguo (null). */
export function modelOptionValue(family: string, attrs: Record<string, string>): string | null {
  const found = new Set<string>();
  for (const k of ['MODEL', 'ALPHANUMERIC_MODEL', 'LINE']) {
    const raw = attrs[k];
    if (!raw) continue;
    const t = fold(raw);
    if (family === 'ps5') {
      // Codigos Sony CFI-1xxx (original), CFI-12xx/20xx (Slim), CFI-7xxx (Pro); ou o nome escrito.
      const cfi = /\bcfi[- ]?(\d{4})/.exec(t);
      if (cfi) {
        const n = cfi[1];
        if (n.startsWith('7')) found.add('pro');
        else if (n.startsWith('12') || n.startsWith('20')) found.add('slim');
        else if (n.startsWith('10') || n.startsWith('11')) found.add('base');
      }
      const slim = /\bslim\b/.test(t);
      const pro = /\bpro\b/.test(t);
      if (slim && !pro) found.add('slim');
      else if (pro && !slim) found.add('pro');
    } else if (family === 'xbox_series') {
      const s = /\bseries ?s\b|\bmodelo? ?1883\b|\b1883\b/.test(t);
      const x = /\bseries ?x\b|\bmodelo? ?1882\b|\b1882\b/.test(t);
      if (s && !x) found.add('series_s');
      else if (x && !s) found.add('series_x');
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

const USED_RE = /\b(usad[oa]s?|recondicionad[oa]s?|seminov[oa]s?|refurbished|used)\b/;

/**
 * Julga se a evidencia PROVA a resposta de um item da fila. Conservador: so devolve veredito quando
 *  - a API disse que o anuncio e USADO/recondicionado (condicao explicita e sem contradicao no atributo) -> "Nao e este produto" (so produto novo e em linha); ou
 *  - eixo de console (modelo/armazenamento), anuncio NOVO e SEM variacoes, atributo com UM unico valor possivel, e a opcao tem master de destino (existente ou a criar).
 * Midia (digital x disco), identidade por dispersao e preco nunca sao aplicados pela API: ficam pendentes com a evidencia no cartao.
 */
export function judgeEvidence(item: JudgeInput, ev: MlEvidence): Verdict | null {
  if (ev.erro) return null;
  const attrCond = ev.attrs.ITEM_CONDITION ? fold(ev.attrs.ITEM_CONDITION) : null;
  const apiUsed = ev.condition === 'used';
  const attrUsed = attrCond != null && USED_RE.test(attrCond);
  const attrNew = attrCond != null && /\bnov[oa]s?\b|\bnew\b/.test(attrCond) && !attrUsed;
  if ((apiUsed && !attrNew) || (attrUsed && ev.condition !== 'new')) {
    const opt = item.options.find((o) => o.kind === 'nao_e_este');
    if (!opt) return null;
    return { value: opt.value, label: opt.label, motivo: `a API do ML marca o anúncio como ${attrUsed && !apiUsed ? 'usado/recondicionado (atributo)' : 'usado'}` };
  }
  if (ev.condition !== 'new' || attrUsed) return null;
  if (item.axis !== 'armazenamento' && item.axis !== 'modelo') return null;
  if (ev.via !== 'items' || ev.variations == null || ev.variations > 0) return null;
  const family = String(item.understood.familia ?? '');
  let value: string | null = null;
  let motivo = '';
  if (item.axis === 'armazenamento') {
    const vals = new Set<string>();
    for (const k of ['INTERNAL_MEMORY', 'STORAGE_CAPACITY', 'CAPACITY']) {
      const gb = ev.attrs[k] ? parseCapacityGb(ev.attrs[k]) : null;
      if (gb == null) continue;
      const v = storageOptionValue(gb);
      if (v) vals.add(v);
      else return null; // capacidade que nao e opcao (ex.: 825 GB): nao prova
    }
    if (vals.size === 1) { value = [...vals][0]; motivo = `a API do ML informa capacidade ${ev.attrs.INTERNAL_MEMORY ?? ev.attrs.STORAGE_CAPACITY ?? ev.attrs.CAPACITY}`; }
  } else {
    value = modelOptionValue(family, ev.attrs);
    if (value) motivo = `a API do ML informa o modelo ${ev.attrs.MODEL ?? ev.attrs.ALPHANUMERIC_MODEL ?? ev.attrs.LINE}`;
  }
  if (!value) return null;
  const opt = item.options.find((o) => o.value === value && o.kind === 'escolha');
  if (!opt || (!opt.targetMasterId && !opt.create)) return null;
  return { value: opt.value, label: opt.label, motivo };
}
