import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { gatilhoIscaLigado } from '@/lib/pricing/preco-isca';

/**
 * Filtro SQL do GATILHO DE PRECO-ISCA (Fluxo Mestre R-61): "esta cotacao NAO e uma isca vigente". Encaixa em qualquer leitura de
 * `affiliate_price_snapshots` que alimente minimo, media, regua, grafico, card ou mensagem. `alias` = alias do snapshot na consulta.
 * Com a flag GATILHO_PRECO_ISCA=0 vira `TRUE` (nada muda). A cotacao nunca e apagada: so fica de fora enquanto a marca estiver vigente
 * (preco_isca_marcas.liberado_em IS NULL).
 */
export function snapshotNaoIscaSql(alias = 's'): SQL {
  if (!gatilhoIscaLigado()) return sql`TRUE`;
  const a = alias.replace(/[^a-z0-9_]/gi, '');
  return sql`NOT EXISTS (SELECT 1 FROM preco_isca_marcas pik WHERE pik.snapshot_id = ${sql.raw(`${a}.id`)} AND pik.liberado_em IS NULL)`;
}

/**
 * R-73 (AUD-10): identidade de vendedor por oferta, SEM depender de `seller_id`. Rede que não cadastra vendedor (Shopee, Amazon) vota pela
 * LOJA (`network:store_name`); a Amazon, com uma só loja, vale um voto. Oferta sem vendedor e sem loja (placeholder de catálogo do ML) continua
 * sem identidade: é julgada, mas nunca serve de referência. `o` = alias de affiliate_offers, `n` = alias de affiliate_networks.
 */
export function identidadeVendedorSql(o = 'o', n = 'n'): SQL {
  const a = o.replace(/[^a-z0-9_]/gi, '');
  const b = n.replace(/[^a-z0-9_]/gi, '');
  return sql.raw(`COALESCE(${a}.seller_id::text, CASE WHEN NULLIF(btrim(${a}.store_name), '') IS NOT NULL THEN 'loja:' || ${b}.slug || ':' || lower(btrim(${a}.store_name)) END)`);
}
