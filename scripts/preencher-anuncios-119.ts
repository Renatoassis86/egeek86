/**
 * #119, invariante 1: preenche o anúncio concreto (external_item_id) das ofertas ML ativas pela API oficial do catálogo, em lotes pequenos.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/preencher-anuncios-119.ts                       # dry-run: conta pendentes
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/preencher-anuncios-119.ts --apply --por=<quem> [--rodadas=40] [--catalogos=5]
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/preencher-anuncios-119.ts --rollback=docs/backups/<arquivo>.ndjson
 * Backup NDJSON ANTES (estado das ofertas pendentes: status, anúncio, link, preço, preço anterior, confirmação). Para no 429. Nunca imprime token.
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';
import { preencherAnuncios } from '../src/server/pricing/integridade-preco';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const APPLY = process.argv.includes('--apply');
const ROLLBACK = arg('rollback');

async function main() {
  const sql = connect();
  try {
    if (ROLLBACK) {
      const linhas = fs.readFileSync(ROLLBACK, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
      for (const l of linhas) {
        await sql`UPDATE affiliate_offers SET external_item_id = NULL, link_item_id = ${(l.link_item_id as string | null) ?? null}, affiliate_url = ${l.affiliate_url as string}, affiliate_link_pending = ${l.affiliate_link_pending as boolean},
          current_price_cents = ${l.current_price_cents as number}, previous_price_cents = ${(l.previous_price_cents as number | null) ?? null}, last_price_confirmed_at = ${(l.last_price_confirmed_at as string | null) ?? null}
          WHERE id = ${l.id as string}::uuid`;
      }
      console.log(`rollback: ${linhas.length} ofertas restauradas (snapshots de preço gravados ficam: histórico append-only)`);
      return;
    }
    const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre' WHERE o.status = 'active' AND o.external_item_id IS NULL AND o.seller_id IS NOT NULL`;
    console.log(`ofertas ML ativas sem anúncio concreto: ${n}`);
    if (!APPLY) return;
    if (!arg('por')) throw new Error('--apply exige --por=<quem>');
    const arq = `docs/backups/preencher-anuncios-119-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
    fs.mkdirSync('docs/backups', { recursive: true });
    const rows = await sql`SELECT o.id::text, o.link_item_id, o.affiliate_url, o.affiliate_link_pending, o.current_price_cents::int, o.previous_price_cents::int, o.last_price_confirmed_at
      FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre' WHERE o.status = 'active' AND o.external_item_id IS NULL AND o.seller_id IS NOT NULL`;
    fs.writeFileSync(arq, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`backup: ${arq} (${rows.length} linhas)`);
    const rodadas = Number(arg('rodadas') ?? 40);
    const tot = { catalogos: 0, ofertas: 0, preenchidas: 0, ausentes: 0 };
    for (let i = 0; i < rodadas; i++) {
      const r = await preencherAnuncios({ orcamentoMs: 120_000, maxCatalogos: Number(arg('catalogos') ?? 5) });
      tot.catalogos += r.catalogos; tot.ofertas += r.ofertas; tot.preenchidas += r.preenchidas; tot.ausentes += r.ausentes;
      console.log(`rodada ${i + 1}: ${JSON.stringify(r)}`);
      if (r.parou || r.catalogos === 0) break;
    }
    console.log('total', JSON.stringify(tot));
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
export {};
