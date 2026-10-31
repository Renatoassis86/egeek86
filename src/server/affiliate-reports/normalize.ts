import type { ConversionStatus } from './types';

/** Remove acentos, caixa e pontuação: "Data da Venda (BRT)" -> "data da venda brt". */
export function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "R$ 1.234,56" | "1234.56" | "12,5" | 12.5 -> centavos. Vazio/ilegível -> null. */
export function parseMoneyToCents(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  let s = String(raw).replace(/[^\d,.\-]/g, '');
  if (!s || s === '-') return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // O último separador é o decimal.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.234" = mil duzentos e trinta e quatro
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return neg ? -cents : cents;
}

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function mk(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Texto sem fuso = horário de Brasília (UTC-3, sem horário de verão desde 2019).
  const dt = new Date(Date.UTC(y, mo - 1, d, h + 3, mi, s));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** ISO, dd/mm/aaaa [hh:mm[:ss]], "15 de outubro de 2026 [10:30]". Inválido -> null. */
export function parseDateTime(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (m) {
    if (m[7]) {
      const d = new Date(s.replace(' ', 'T'));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return mk(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return mk(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  const t = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  m = /^(\d{1,2})\s+de\s+([a-z]+)\.?\s+de\s+(\d{4})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m && MONTHS[m[2]]) return mk(+m[3], MONTHS[m[2]], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return null;
}

export function normalizeStatus(raw: string | null | undefined): ConversionStatus {
  if (!raw) return 'unknown';
  const t = normalizeHeader(raw);
  if (/cancel|rejeit|negad/.test(t)) return 'cancelled';
  if (/devol|reembols|estorn|refund/.test(t)) return 'refunded';
  if (/unpaid|nao pag|aguardando pag/.test(t)) return 'unpaid';
  if (/pend|aguard|analise|em validacao|processando/.test(t)) return 'pending';
  if (/complet|conclu|confirm|aprov|valid|pago|paga|liberad/.test(t)) return 'completed';
  return 'unknown';
}

export function parseIntSafe(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const str = String(raw);
  if (!/\d/.test(str)) return null;
  const n = Number(str.replace(/[^\d\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
