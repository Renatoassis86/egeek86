// Sem 'server-only': função pura (sem banco, sem rede), importável por coletor, scripts tsx e testes.
import { domainMatches, type SegmentConfig } from './config';
import { scopeIssue } from './scope';
import { isNewRetroStyleHardware } from '../gate';
import { chaveImpressora3d, marcaComLexico, marcaCanonica, diametroDe, massaOuVolumeDe, materialDe, tipoResinaDe } from './i3d-fields';

/**
 * IDENTIDADE POR DEPARTAMENTO (ADR 0008 item 4). Função pura: dado o payload de catálogo do ML
 * (`/products/search` ou `/products/{id}`), devolve a chave de identidade FORTE ou o motivo de não haver.
 *
 *   isbn:<13 dígitos>             livro (GTIN do ML com prefixo 978/979 e dígito verificador válido)
 *   gtin:<8|12|13|14 dígitos>     GTIN/EAN com dígito verificador GS1 válido
 *   mpn:<marca>|<mpn>             part number do fabricante + marca
 *   bm:<segmento>|<marca>|<modelo>|<extras...>   marca+modelo(+ALPHANUMERIC_MODEL; placa: +SERIES/EDITION/MEMORY_SIZE)
 *
 * Status:
 *   strong      chave forte formada: pode virar master (após checar duplicata);
 *   review      sem chave forte: NUNCA vira master automático; vai para a fila de revisão humana (com o que faltou);
 *   rejected    usado, recondicionado, Open Box, importado, réplica...: fora, sem revisão;
 *   off_domain  domain_id do catálogo não pertence ao segmento (a busca por termo traz lixo): descartado, não é revisão.
 *
 * Dado que a API não devolve fica ausente (null); nada é estimado.
 */

export interface MlAttribute {
  id: string;
  name?: string | null;
  value_id?: string | null;
  value_name?: string | null;
  values?: Array<{ id?: string | null; name?: string | null }> | null;
}

export interface MlCatalogPayload {
  id: string;
  name?: string | null;
  domain_id?: string | null;
  status?: string | null;
  attributes?: MlAttribute[] | null;
  pictures?: Array<{ url?: string | null; secure_url?: string | null }> | null;
  parent_id?: string | null;
}

export type IdentityStatus = 'strong' | 'review' | 'rejected' | 'off_domain';
export type IdentityKeyKind = 'isbn' | 'gtin' | 'mpn' | 'brand_model';

export interface IdentityResult {
  status: IdentityStatus;
  /** Chave forte (só quando status = strong). */
  key: string | null;
  keyKind: IdentityKeyKind | null;
  /** Todos os GTIN válidos do catálogo, ordenados (a duplicata é checada contra qualquer um). */
  gtins: string[];
  mpn: string | null;
  brand: string | null;
  model: string | null;
  /** Motivo curto e estável (log/auditoria). */
  reason: string;
  /** Atributos obrigatórios ausentes (status review por fallback incompleto). */
  missing: string[];
  /** Termo que causou a rejeição (status rejected). */
  matched: string | null;
  /** true quando a chave foi montada por CAMPOS/FAMÍLIA (cor junta): catálogos da mesma chave são o mesmo produto e se anexam a um master só. */
  byFields?: boolean;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** Minúsculas, sem acento, só [a-z0-9 ], espaços colapsados. */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Título normalizado para checar duplicata (tokens ordenados: ordem das palavras não separa produtos). */
export function normalizeTitleKey(title: string): string {
  const tokens = foldText(title).split(' ').filter(Boolean);
  return Array.from(new Set(tokens)).sort().join(' ');
}

/** Valor textual de um atributo (value_name, senão values[0].name); vazio => null. */
export function attrValue(p: MlCatalogPayload, id: string): string | null {
  const a = (p.attributes ?? []).find((x) => x?.id === id);
  if (!a) return null;
  const v = (a.value_name ?? a.values?.find((x) => x?.name)?.name ?? '').toString().trim();
  return v === '' ? null : v;
}

/** Todos os valores de um atributo (value_name pode trazer lista separada por vírgula/ponto e vírgula). */
function attrValues(p: MlCatalogPayload, id: string): string[] {
  const a = (p.attributes ?? []).find((x) => x?.id === id);
  if (!a) return [];
  const raw = [a.value_name, ...(a.values ?? []).map((v) => v?.name)].filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return raw.flatMap((r) => r.split(/[,;|]+/)).map((x) => x.trim()).filter(Boolean);
}

/** Dígito verificador GS1 (módulo 10) para 8, 12, 13 e 14 dígitos. */
export function isValidGtin(digits: string): boolean {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  const nums = digits.split('').map(Number);
  const check = nums.pop()!;
  let sum = 0;
  nums.reverse().forEach((n, i) => {
    sum += n * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

/** ISBN-10 (dígitos, 'X' final) => ISBN-13 (978...) ou null se o dígito verificador não bater. */
export function isbn10to13(raw: string): string | null {
  const s = raw.replace(/[-\s]/g, '').toUpperCase();
  if (!/^\d{9}[\dX]$/.test(s)) return null;
  const sum = s.split('').reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
  if (sum % 11 !== 0) return null;
  const core = '978' + s.slice(0, 9);
  const nums = core.split('').map(Number);
  const sum13 = nums.reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 1 : 3), 0);
  return core + String((10 - (sum13 % 10)) % 10);
}

export function isIsbn13(digits: string): boolean {
  return /^97[89]\d{10}$/.test(digits) && isValidGtin(digits);
}

/** GTIN/EAN/ISBN válidos do catálogo (ISBN-10 convertido para ISBN-13), únicos e ordenados. */
export function extractGtins(p: MlCatalogPayload): string[] {
  const out = new Set<string>();
  for (const id of ['GTIN', 'EAN', 'ISBN']) {
    for (const raw of attrValues(p, id)) {
      const digits = raw.replace(/[-\s]/g, '');
      if (isValidGtin(digits)) out.add(digits);
      else {
        const conv = isbn10to13(digits);
        if (conv) out.add(conv);
      }
    }
  }
  return Array.from(out).sort();
}

// ---------------------------------------------------------------------------
// Rejeição: usado, recondicionado, Open Box, importado, réplica...
// ---------------------------------------------------------------------------

/**
 * Léxico de itens que NÃO entram (regra do dono: usado/Open Box/recondicionado/reembalado/importado fora). Aplicado ao
 * nome do catálogo e aos atributos de condição. Os padrões usam raiz (prefixos) sobre o texto sem acento.
 */
const REJECT_LEXICON: Array<{ label: string; re: RegExp }> = [
  { label: 'usado', re: /\b(usad[oa]s?|seminov[oa]s?|semi novo|segunda mao|de segunda|sebo)\b/ },
  { label: 'recondicionado', re: /\b(recondicionad[oa]s?|refurbished|renovad[oa]s?)\b/ },
  { label: 'open_box', re: /\b(open ?box|vitrine|mostruario|outlet|sem caixa|sem lacre|caixa aberta)\b/ },
  { label: 'reembalado', re: /\b(reembalad[oa]s?)\b/ },
  { label: 'importado', re: /\b(importad[oa]s?|importacao|internacional)\b/ },
  { label: 'avariado', re: /\b(avariad[oa]s?|com defeito|defeituos[oa]|sucata|retirada de pecas)\b/ },
  { label: 'fora_de_linha', re: /\b(modelo antigo|geracao anterior|descontinuad[oa]s?|fora de linha|edicao esgotada|esgotad[oa] na editora|raridade|item raro|livro raro|colecionador|lote de|vintage|retro|lancamento antigo|peca de reposicao usada)\b/ },
  { label: 'nao_original', re: /\b(replica|falsificad[oa]|paralelo|pirata|compativel generico|tailandesa|primeira linha|1a linha)\b/ },
];

const BAD_CONDITION_RE = /\b(usad[oa]|used|recondicionad[oa]|refurbished|reembalad[oa]|open ?box|seminov[oa])\b/;

/** Motivo de rejeição por nome/atributos de condição, ou null. */
export function rejectionOf(p: MlCatalogPayload): { reason: string; matched: string } | null {
  const cond = foldText(attrValue(p, 'ITEM_CONDITION') ?? '');
  if (cond && BAD_CONDITION_RE.test(cond)) return { reason: 'condicao_nao_nova', matched: `ITEM_CONDITION=${cond}` };
  const refurb = foldText(attrValue(p, 'IS_REFURBISHED') ?? attrValue(p, 'REFURBISHED') ?? '');
  if (refurb === 'sim' || refurb === 'yes' || refurb === 'true') return { reason: 'recondicionado', matched: 'REFURBISHED=sim' };
  const name = foldText(p.name ?? '');
  // Exceção do dono (2026-11-12): hardware de estilo retrô NOVO de fabricante que o vende hoje (Hyperkin, Analogue, Retro-Bit, 8BitDo). Condição já foi checada acima.
  if (isNewRetroStyleHardware(name)) return null;
  for (const { label, re } of REJECT_LEXICON) {
    const m = re.exec(name);
    if (m) return { reason: label, matched: m[0] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Identidade
// ---------------------------------------------------------------------------

function result(partial: Partial<IdentityResult> & Pick<IdentityResult, 'status' | 'reason'>, base: Partial<IdentityResult>): IdentityResult {
  return {
    key: null,
    keyKind: null,
    gtins: [],
    mpn: null,
    brand: null,
    model: null,
    missing: [],
    matched: null,
    ...base,
    ...partial,
  };
}

/**
 * Avalia o payload de catálogo contra o perfil de identidade do segmento. Ordem (a primeira que dispara decide):
 *  1. domínio fora do segmento => off_domain;
 *  2. usado/recondicionado/Open Box/importado/... => rejected;
 *  2b. título de pacote ("A + B", "Kit 2...") ou de acessório/peça do aparelho => review (scope.ts);
 *  3. segmento review_only (tênis) => review;
 *  4. isbn_only (livros): ISBN-13 válido => strong; senão review;
 *  5. gtin_then_attrs: GTIN válido => strong (gtin:); MPN+marca => strong (mpn:); atributos obrigatórios completos =>
 *     strong (bm:); senão review com a lista do que faltou.
 */
export function evaluateIdentity(p: MlCatalogPayload, seg: SegmentConfig): IdentityResult {
  const gtins = extractGtins(p);
  const brand = attrValue(p, 'BRAND');
  const model = attrValue(p, 'MODEL');
  const mpn = attrValue(p, 'MPN');
  const base: Partial<IdentityResult> = { gtins, brand, model, mpn };

  if (!domainMatches(seg, p.domain_id ?? null)) {
    return result({ status: 'off_domain', reason: 'dominio_fora_do_segmento', matched: p.domain_id ?? null }, base);
  }
  const rej = rejectionOf(p);
  if (rej) return result({ status: 'rejected', reason: rej.reason, matched: rej.matched }, base);

  // Pacote de 2+ produtos ou acessório/peça dentro do domínio do aparelho: revisão, nunca master (scope.ts).
  const issue = scopeIssue(seg.key, p.name ?? '');
  if (issue) return result({ status: 'review', reason: issue.reason, matched: issue.matched }, base);

  // Marca real obrigatória (ampliação 2026-11-11): sem marca ou "Genérica" = kit genérico, fora.
  if (seg.requireBrand) {
    const b = brand ?? attrValue(p, 'MANUFACTURER');
    if (!b || isGenericBrand(b)) return result({ status: 'rejected', reason: 'marca_ausente_ou_generica', matched: b ?? 'sem_marca' }, base);
  }

  const { strategy, fallbackAttrs, keyExtras } = seg.profile;
  if (strategy === 'review_only') {
    return result({ status: 'review', reason: 'segmento_sem_identificador_confiavel_so_revisao' }, base);
  }
  if (strategy === 'isbn_only') {
    const isbn = gtins.find(isIsbn13);
    // Livros: só edição brasileira (grupo de registro 978-65 / 978-85). Outros grupos (Portugal 972/989, Itália 88 etc.)
    // são livro importado, que a regra do dono deixa de fora (dono: 'livros diversos', 2026-11-08).
    if (isbn && !/^978(65|85)/.test(isbn)) return result({ status: 'rejected', reason: 'isbn_importado', missing: [] }, base);
    if (isbn) return result({ status: 'strong', key: `isbn:${isbn}`, keyKind: 'isbn', reason: 'isbn13_valido' }, base);
    return result({ status: 'review', reason: 'sem_isbn13_valido', missing: ['ISBN-13'] }, base);
  }

  // Chave de família (tênis, chuteira, camisa, meia, boné, mochila...): atributos, sem GTIN; cor e tamanho nunca entram.
  if (seg.profile.familyKey) return identityPorFamilia(p, seg, base);

  // Impressora 3D de marca com léxico de famílias: chave por família + variante, sem GTIN (cor junta).
  if (seg.key === 'impressora-3d') {
    const fam = chaveImpressora3d(brand, p.name ?? '', model);
    if (fam) return result({ status: 'strong', key: fam, keyKind: 'brand_model', reason: 'marca_familia_variante', byFields: true }, base);
    if (marcaComLexico(brand, p.name ?? '')) return result({ status: 'review', reason: 'familia_nao_reconhecida', missing: ['FAMILIA'] }, base);
  }

  // Impressão 3D (filamento/resina): chave por CAMPOS, sem GTIN (cor junta). Título primeiro, atributo estruturado como reserva.
  if (seg.profile.keyIgnoresGtin) return identityPorCampos(p, seg, base);

  // gtin_then_attrs
  if (gtins.length > 0) {
    return result({ status: 'strong', key: `gtin:${gtins[0]}`, keyKind: 'gtin', reason: 'gtin_valido' }, base);
  }
  if (mpn && brand) {
    return result({ status: 'strong', key: `mpn:${foldText(brand)}|${foldText(mpn)}`, keyKind: 'mpn', reason: 'mpn_com_marca' }, base);
  }
  const missing = fallbackAttrs.filter((id) => !attrValue(p, id));
  if (missing.length > 0) {
    return result({ status: 'review', reason: 'fallback_incompleto', missing }, base);
  }
  const parts = [...fallbackAttrs, ...keyExtras.filter((id) => !fallbackAttrs.includes(id))]
    .map((id) => [id.toLowerCase(), foldText(attrValue(p, id) ?? '')] as const)
    .filter(([, v]) => v !== '')
    .map(([id, v]) => `${id}=${v}`);
  return result({ status: 'strong', key: `bm:${seg.key}|${parts.join('|')}`, keyKind: 'brand_model', reason: 'marca_modelo_completo' }, base);
}

/** Marca ausente de verdade: "Genérica", "Sem marca", ou um "nome de marca" que na prática é o título do anúncio (4+ palavras). */
export function isGenericBrand(brand: string): boolean {
  const f = foldText(brand);
  if (!f) return true;
  if (/^(generic[oa]s?|sem marca|no brand|nao informad[oa]|nao especificad[oa]|n a|marca generica|oem|outras?|outros?|diversas?|varias?)$/.test(f)) return true;
  if (f.startsWith('generic')) return true;
  return f.split(' ').length >= 4;
}

/**
 * Chave de família (ver SegmentConfig.profile.familyKey): bm:<segmento>|brand=..|model=..|gender=..|line=..|version=..
 * Obrigatório ausente => review com a lista do que faltou. Cor e tamanho nunca entram: catálogos do ML que só diferem em cor/tamanho
 * geram a MESMA chave e se anexam a um master só (byFields).
 */
function identityPorFamilia(p: MlCatalogPayload, seg: SegmentConfig, base: Partial<IdentityResult>): IdentityResult {
  const fam = seg.profile.familyKey!;
  const missing = fam.required.filter((id) => !attrValue(p, id));
  if (missing.length > 0) return result({ status: 'review', reason: 'campos_da_familia_incompletos', missing }, base);
  const parts = [...fam.required, ...fam.optional.filter((id) => !fam.required.includes(id))]
    .map((id) => [id.toLowerCase(), foldText(attrValue(p, id) ?? '')] as const)
    .filter(([, v]) => v !== '')
    .map(([id, v]) => `${id}=${v}`);
  return result({ status: 'strong', key: `bm:${seg.key}|${parts.join('|')}`, keyKind: 'brand_model', reason: 'marca_modelo_genero_familia', byFields: true }, base);
}

/**
 * Chave por campos do filamento e da resina (cor NUNCA entra; GTIN NUNCA entra):
 *   filamento : bm:<segmento>|brand=<marca>|material=<PLA|PLA+|PLA-SILK|PETG|ABS|TPU...>|diametro=<1.75mm|2.85mm>|massa=<1kg|500g...>|pack=<N>
 *   resina    : bm:<segmento>|brand=<marca>|tipo=<standard|abs-like|water-washable...>|volume=<1kg|500ml...>|pack=<N>
 * Campo obrigatório que não aparece (nem no título nem no atributo) => review com a lista do que faltou; nada é completado por suposição.
 */
function identityPorCampos(p: MlCatalogPayload, seg: SegmentConfig, base: Partial<IdentityResult>): IdentityResult {
  const brand = attrValue(p, 'BRAND');
  const nome = p.name ?? '';
  const packN = Number((attrValue(p, 'UNITS_PER_PACK') ?? '1').replace(/\D+/g, '')) || 1;
  const missing: string[] = [];
  const parts: string[] = [];
  if (!brand) missing.push('BRAND');
  else parts.push('brand=' + marcaCanonica(brand));
  if (seg.key === 'resina-3d') {
    const tipo = tipoResinaDe(nome);
    const volume = massaOuVolumeDe(nome) ?? massaOuVolumeDe(attrValue(p, 'NET_VOLUME') ?? attrValue(p, 'NET_WEIGHT') ?? '');
    if (!tipo) missing.push('RESIN_TYPE');
    else parts.push('tipo=' + tipo);
    if (!volume) missing.push('VOLUME');
    else parts.push('volume=' + volume);
  } else {
    const material = materialDe(nome) ?? materialDe(attrValue(p, 'MATERIAL') ?? attrValue(p, 'FILAMENT_MATERIAL') ?? '');
    const diametro = diametroDe(nome) ?? diametroDe(attrValue(p, 'FILAMENT_DIAMETER') ?? attrValue(p, 'DIAMETER') ?? '');
    const massa = massaOuVolumeDe(nome) ?? massaOuVolumeDe(attrValue(p, 'NET_WEIGHT') ?? '');
    if (!material) missing.push('MATERIAL');
    else parts.push('material=' + material);
    if (!diametro) missing.push('FILAMENT_DIAMETER');
    else parts.push('diametro=' + diametro);
    if (!massa) missing.push('NET_WEIGHT');
    else parts.push('massa=' + massa);
  }
  if (missing.length > 0) return result({ status: 'review', reason: 'campos_da_chave_incompletos', missing }, base);
  parts.push('pack=' + packN);
  return result({ status: 'strong', key: 'bm:' + seg.key + '|' + parts.join('|'), keyKind: 'brand_model', reason: 'marca_material_medida_sem_gtin', byFields: true }, base);
}
