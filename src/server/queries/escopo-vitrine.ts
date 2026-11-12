import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { ESCOPO_VITRINE_ATIVO } from '@/lib/catalog/escopo-compra';

/**
 * Predicado de VITRINE (ata 2026-11-12): TRUE quando o master NÃO está marcado como fora do escopo de compra real
 * (`attributes.vertical.foraDeEscopo`). Tolerante à ausência da marca (master sem marca = dentro). Com a flag
 * PLUS_ESCOPO_VITRINE=0 vira sempre TRUE (a marca é ignorada). Usar SOMENTE em vitrines, faixas da home, contagens,
 * mensagens e "menor preço do dia"; busca direta e link direto NÃO usam.
 * `alias` = alias de master_products.
 */
export function masterNoEscopoSql(alias: string): SQL {
  if (!ESCOPO_VITRINE_ATIVO) return sql`TRUE`;
  const a = sql.raw(alias.replace(/[^a-z0-9_]/gi, ''));
  return sql`(${a}.attributes -> 'vertical' -> 'foraDeEscopo') IS NULL`;
}
