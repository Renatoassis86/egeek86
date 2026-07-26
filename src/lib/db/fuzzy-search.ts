import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';

/**
 * Condição de busca tolerante — usa `unaccent()` (extensão já habilitada no
 * banco) pra ignorar acento/maiúscula, quebra o termo digitado em palavras e
 * exige que cada palavra apareça em ALGUM dos campos informados, em
 * QUALQUER ordem (não precisa bater a frase inteira em sequência num campo
 * só). Assim "mario + rabbids", "rabbids mario" ou "mário rabbids" acham
 * "Mario Rabbids Sparks of Hope" do mesmo jeito — antes, um ILIKE simples
 * exigia a frase inteira, na ordem exata, sem acento diferente.
 *
 * Símbolos soltos (+, -, /) são descartados da lista de palavras (não viram
 * parte do termo buscado) — eles não existem nos nomes catalogados, então
 * exigir que apareçam só quebrava buscas legítimas.
 */
export function fuzzyMatch(columns: AnyColumn[], query: string): SQL | undefined {
  const words = query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 0);

  if (words.length === 0 || columns.length === 0) return undefined;

  const perWord = words.map((word) => {
    const perColumn = columns.map((col) => sql`unaccent(${col}) ILIKE unaccent(${'%' + word + '%'})`);
    return sql`(${sql.join(perColumn, sql` OR `)})`;
  });

  return sql.join(perWord, sql` AND `);
}

/**
 * Mesma lógica de `fuzzyMatch`, mas pra consultas 100% em SQL cru com alias
 * de tabela (ex: `mp.name`, não uma referência de coluna do drizzle) — os
 * nomes de coluna são sempre literais fixos no código-fonte (nunca vêm do
 * usuário), só o termo buscado é parametrizado.
 */
export function fuzzyMatchRaw(columnRefs: string[], query: string): SQL | undefined {
  const words = query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 0);

  if (words.length === 0 || columnRefs.length === 0) return undefined;

  const perWord = words.map((word) => {
    const perColumn = columnRefs.map((ref) => sql`unaccent(${sql.raw(ref)}) ILIKE unaccent(${'%' + word + '%'})`);
    return sql`(${sql.join(perColumn, sql` OR `)})`;
  });

  return sql.join(perWord, sql` AND `);
}
