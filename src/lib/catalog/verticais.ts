import { sql, type SQL } from 'drizzle-orm';

/**
 * DEPARTAMENTOS (verticais) do catálogo. ADR 0008, item 2: ISOLAMENTO POR INCLUSÃO (allow-list).
 *
 * A lista é a MESMA dos CHECKs `master_products_vertical_chk` / `affiliate_offers_vertical_chk` (migração 0027).
 * Departamento novo = nova migração que troca o CHECK + entrada aqui. Nunca texto livre.
 *
 * Toda consulta PÚBLICA recebe um `Vertical` OBRIGATÓRIO (sem default silencioso): quem chama declara o
 * departamento da superfície. Superfícies gamer passam `GAMES`.
 */
export const VERTICALS = ['games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte'] as const;
export type Vertical = (typeof VERTICALS)[number];

/** Departamento das superfícies gamer (home, busca, ofertas, notícias, /api/produtos, /go, sitemap). */
export const GAMES: Vertical = 'games';

export function isVertical(v: unknown): v is Vertical {
  return typeof v === 'string' && (VERTICALS as readonly string[]).includes(v);
}

/**
 * Predicado da allow-list: `<alias>.vertical = '<vertical>'`. O literal vai INLINE (não como parâmetro `$n`) de
 * propósito: o valor sai de uma lista fixa validada aqui (sem injeção), o plano do Postgres vê a constante
 * (usa o índice parcial / descarta a faixa) e o teste de isolamento enxerga o predicado no SQL renderizado.
 * `alias` = alias da tabela (affiliate_offers ou master_products) na consulta.
 */
export function verticalSql(alias: string, vertical: Vertical): SQL {
  if (!isVertical(vertical)) throw new Error(`vertical inválida: ${String(vertical)}`);
  const a = alias.replace(/[^a-z0-9_]/gi, '');
  return sql`${sql.raw(a)}.vertical = ${sql.raw(`'${vertical}'`)}`;
}
