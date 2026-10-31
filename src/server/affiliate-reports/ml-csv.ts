import { createHash } from 'node:crypto';
import { parseCsv } from './csv';
import { normalizeHeader, normalizeStatus, parseDateTime, parseIntSafe, parseMoneyToCents } from './normalize';
import type { NormalizedConversion, RejectedRow } from './types';

/**
 * Campos que o importador sabe ler de um relatório do painel de afiliados do ML.
 * ATENÇÃO: o Mercado Livre NÃO documenta publicamente as colunas do painel
 * (nenhuma fonte oficial confirmada em 2026-10-31). Os apelidos abaixo são
 * PALPITES razoáveis, não contrato. Se o cabeçalho real for outro, passe
 * `columnMap` (campo -> nome exato do cabeçalho) e nenhum código muda.
 */
export type MlField =
  | 'externalId'
  | 'orderId'
  | 'itemRef'
  | 'itemName'
  | 'clickAt'
  | 'purchaseAt'
  | 'status'
  | 'quantity'
  | 'itemPrice'
  | 'commission'
  | 'subId';

export const ML_DEFAULT_COLUMN_ALIASES: Record<MlField, string[]> = {
  externalId: ['id da conversao', 'id conversao', 'conversion id', 'id da venda', 'id venda'],
  orderId: ['id do pedido', 'numero do pedido', 'pedido', 'order id', 'id da compra', 'id compra'],
  itemRef: ['id do item', 'id do produto', 'item id', 'mlb', 'id do anuncio', 'codigo do produto', 'sku'],
  itemName: ['produto', 'nome do produto', 'titulo', 'titulo do produto', 'item', 'descricao'],
  clickAt: ['data do clique', 'data clique', 'clique em', 'click date'],
  purchaseAt: ['data da compra', 'data da venda', 'data do pedido', 'data', 'data de compra', 'purchase date'],
  status: ['status', 'status da comissao', 'situacao', 'status da venda', 'estado'],
  quantity: ['quantidade', 'qtd', 'unidades'],
  itemPrice: ['valor da venda', 'valor do produto', 'preco', 'valor', 'valor da compra', 'preco do produto'],
  commission: ['comissao', 'ganhos', 'valor da comissao', 'comissao estimada', 'ganho', 'comissao total'],
  subId: ['tag', 'etiqueta', 'campanha', 'matt word', 'matt tool', 'origem', 'canal', 'sub id', 'subid', 'link'],
};

export interface MlParseOptions {
  /** campo -> nome exato do cabeçalho no arquivo (sobrepõe os apelidos). */
  columnMap?: Partial<Record<MlField, string>>;
}

export interface MlParseResult {
  ok: boolean;
  /** Preenchido quando ok=false (cabeçalho irreconhecível). */
  fatal?: string;
  delimiter: string;
  headers: string[];
  headerLine: number;
  /** campo -> cabeçalho encontrado. */
  mapped: Partial<Record<MlField, string>>;
  rows: NormalizedConversion[];
  rejected: RejectedRow[];
  blankSkipped: number;
}

export function parseMlAffiliateReport(text: string, opts: MlParseOptions = {}): MlParseResult {
  const { rows: grid, delimiter, lines } = parseCsv(text);
  const empty: MlParseResult = {
    ok: false, delimiter, headers: [], headerLine: 0, mapped: {}, rows: [], rejected: [], blankSkipped: 0,
  };
  if (!grid.length) return { ...empty, fatal: 'Arquivo vazio.' };

  const explicit = new Map<string, MlField>();
  for (const [f, h] of Object.entries(opts.columnMap ?? {})) if (h) explicit.set(normalizeHeader(h), f as MlField);

  const resolve = (headers: string[]): Partial<Record<MlField, number>> => {
    const idx: Partial<Record<MlField, number>> = {};
    const norm = headers.map(normalizeHeader);
    for (const [h, f] of explicit) {
      const i = norm.indexOf(h);
      if (i >= 0) idx[f] = i;
    }
    for (const field of Object.keys(ML_DEFAULT_COLUMN_ALIASES) as MlField[]) {
      if (idx[field] != null || opts.columnMap?.[field]) continue;
      for (const alias of ML_DEFAULT_COLUMN_ALIASES[field]) {
        const i = norm.indexOf(alias);
        if (i >= 0 && !Object.values(idx).includes(i)) {
          idx[field] = i;
          break;
        }
      }
    }
    return idx;
  };

  // Cabeçalho = primeira linha (entre as 15 primeiras) que reconhece >= 2 campos.
  let headerRow = -1;
  let idx: Partial<Record<MlField, number>> = {};
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const cand = resolve(grid[r]);
    if (Object.keys(cand).length >= 2) {
      headerRow = r;
      idx = cand;
      break;
    }
  }
  if (headerRow < 0) {
    return {
      ...empty,
      headers: grid[0],
      fatal: `Cabeçalho não reconhecido. Colunas lidas: ${grid[0].join(' | ')}. Informe columnMap (campo -> nome da coluna).`,
    };
  }
  const headers = grid[headerRow];
  const mapped: Partial<Record<MlField, string>> = {};
  for (const [f, i] of Object.entries(idx)) mapped[f as MlField] = headers[i as number];
  const base = { ...empty, headers, headerLine: lines[headerRow], mapped };

  if (idx.purchaseAt == null && idx.clickAt == null) {
    return { ...base, fatal: 'Nenhuma coluna de data (compra/clique) reconhecida. Informe columnMap.' };
  }
  if (idx.commission == null && idx.itemPrice == null) {
    return { ...base, fatal: 'Nenhuma coluna de comissão/valor reconhecida. Informe columnMap.' };
  }

  const out: NormalizedConversion[] = [];
  const rejected: RejectedRow[] = [];
  let blankSkipped = 0;
  const get = (row: string[], f: MlField): string | null => {
    const i = idx[f];
    if (i == null) return null;
    const v = (row[i] ?? '').trim();
    return v === '' ? null : v;
  };

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const line = lines[r];
    if (row.every((c) => c.trim() === '')) {
      blankSkipped++;
      continue;
    }
    if (/^(total|subtotal|totais)\b/.test(normalizeHeader(row.find((c) => c.trim() !== '') ?? ''))) {
      rejected.push({ line, reason: 'linha de total', raw: row });
      continue;
    }
    const rawPurchase = get(row, 'purchaseAt');
    const rawClick = get(row, 'clickAt');
    const purchaseAt = parseDateTime(rawPurchase);
    const clickAt = parseDateTime(rawClick);
    if (!purchaseAt && !clickAt) {
      rejected.push({ line, reason: `data inválida ou ausente (${rawPurchase ?? rawClick ?? 'vazio'})`, raw: row });
      continue;
    }
    const rawCommission = get(row, 'commission');
    const rawPrice = get(row, 'itemPrice');
    const commissionCents = parseMoneyToCents(rawCommission);
    const itemPriceCents = parseMoneyToCents(rawPrice);
    if (rawCommission != null && commissionCents == null) {
      rejected.push({ line, reason: `comissão ilegível (${rawCommission})`, raw: row });
      continue;
    }
    if (rawPrice != null && itemPriceCents == null) {
      rejected.push({ line, reason: `valor ilegível (${rawPrice})`, raw: row });
      continue;
    }
    if (commissionCents == null && itemPriceCents == null) {
      rejected.push({ line, reason: 'sem comissão nem valor', raw: row });
      continue;
    }

    const orderId = get(row, 'orderId');
    const itemRefRaw = get(row, 'itemRef');
    const itemRef = itemRefRaw ? (/^MLB-?\d+$/i.test(itemRefRaw) ? itemRefRaw.toUpperCase().replace('-', '') : itemRefRaw) : null;
    const explicitId = get(row, 'externalId') ?? (orderId ? `${orderId}:${itemRef ?? ''}` : null);
    // Sem id no arquivo: hash do conteúdo SEM o status (o status muda entre exportações da mesma venda).
    const externalId =
      explicitId ??
      'h:' +
        createHash('sha256')
          .update(
            [purchaseAt?.toISOString(), clickAt?.toISOString(), itemRef, get(row, 'itemName'), itemPriceCents, commissionCents, get(row, 'subId')].join('|')
          )
          .digest('hex')
          .slice(0, 32);

    const rawStatus = get(row, 'status');
    out.push({
      source: 'ml_csv',
      networkSlug: 'mercadolivre',
      externalId,
      orderId,
      orderStatus: normalizeStatus(rawStatus),
      rawStatus,
      clickAt,
      purchaseAt,
      itemRef,
      itemName: get(row, 'itemName'),
      quantity: parseIntSafe(get(row, 'quantity')),
      itemPriceCents,
      commissionCents,
      netCommissionCents: null,
      refundCents: null,
      subId: get(row, 'subId'),
      attributionType: null,
      raw: Object.fromEntries(headers.map((h, i) => [h || `col${i}`, row[i] ?? ''])),
    });
  }

  // Mesmo id repetido no arquivo: mantém a última ocorrência e avisa.
  const seen = new Map<string, number>();
  out.forEach((c, i) => seen.set(c.externalId, i));
  const dedup = out.filter((c, i) => seen.get(c.externalId) === i);
  if (dedup.length !== out.length) {
    rejected.push({ line: 0, reason: `${out.length - dedup.length} linha(s) repetida(s) no arquivo (mesmo id); mantida a última`, raw: [] });
  }

  return { ok: true, delimiter, headers, headerLine: lines[headerRow], mapped, rows: dedup, rejected, blankSkipped };
}
