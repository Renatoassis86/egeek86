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
