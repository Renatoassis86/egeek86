/**
 * Parser CSV tolerante: BOM, delimitador detectado (; , tab), aspas com "" escapado,
 * quebras de linha dentro de campo entre aspas, CRLF/LF. Sem dependências.
 * Não lê XLSX: o dono deve exportar CSV (ou salvar a planilha como CSV UTF-8).
 */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  let best = ',';
  let bestCount = -1;
  for (const d of [';', ',', '\t']) {
    const c = sample.split(d).length - 1;
    if (c > bestCount) {
      best = d;
      bestCount = c;
    }
  }
  return best;
}

export function parseCsv(input: string): { rows: string[][]; delimiter: string; lines: number[] } {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  const pushRow = () => {
    row.push(field);
    field = '';
    rows.push(row);
    lines.push(rowStartLine);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushRow();
      line++;
      rowStartLine = line;
    } else field += c;
  }
  if (field !== '' || row.length) pushRow();
  return { rows, delimiter, lines };
}
