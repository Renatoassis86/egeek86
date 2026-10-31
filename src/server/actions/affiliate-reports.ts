'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import { parseMlAffiliateReport, type MlField } from '@/server/affiliate-reports/ml-csv';
import { upsertConversions } from '@/server/affiliate-reports/store';
import type { ImportSummary, RejectedRow } from '@/server/affiliate-reports/types';

const MAX_BYTES = 5 * 1024 * 1024;

export type ImportMlReportResult =
  | { ok: true; summary: ImportSummary; mapped: Partial<Record<MlField, string>>; blankSkipped: number }
  | { ok: false; error: string; headers?: string[]; rejected?: RejectedRow[] };

/**
 * Ação de admin: importa o CSV exportado do painel de afiliados do Mercado Livre.
 * Campos do FormData: `file` (CSV UTF-8) e, opcional, `columnMap` (JSON campo -> cabeçalho).
 * Gate: requireAdmin (Server Actions são endpoints públicos). Sem tela por ora.
 * Exige a migration 0021 aplicada; sem ela devolve erro, nunca grava em outro lugar.
 */
export async function importMlAffiliateReport(formData: FormData): Promise<ImportMlReportResult> {
  await requireAdmin();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Envie um arquivo CSV.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'Arquivo acima de 5 MB.' };
  if (/\.xlsx?$/i.test(file.name)) {
    return { ok: false, error: 'XLSX não suportado: abra a planilha e salve como CSV UTF-8, depois envie.' };
  }

  let columnMap: Partial<Record<MlField, string>> | undefined;
  const rawMap = formData.get('columnMap');
  if (typeof rawMap === 'string' && rawMap.trim()) {
    try {
      columnMap = JSON.parse(rawMap);
    } catch {
      return { ok: false, error: 'columnMap não é JSON válido.' };
    }
  }

  const parsed = parseMlAffiliateReport(await file.text(), { columnMap });
  if (!parsed.ok) return { ok: false, error: parsed.fatal ?? 'Falha ao ler o arquivo.', headers: parsed.headers };
  if (!parsed.rows.length) return { ok: false, error: 'Nenhuma linha válida.', rejected: parsed.rejected, headers: parsed.headers };

  try {
    const summary = await upsertConversions(parsed.rows, {
      batch: `ml:${file.name}:${new Date().toISOString()}`,
      rejected: parsed.rejected,
      received: parsed.rows.length + parsed.rejected.filter((r) => r.line > 0).length,
    });
    return { ok: true, summary, mapped: parsed.mapped, blankSkipped: parsed.blankSkipped };
  } catch (e) {
    return { ok: false, error: `Falha ao gravar (migration 0021 aplicada?): ${(e as Error).message.slice(0, 200)}` };
  }
}
