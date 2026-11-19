/**
 * Carga inicial do resumo incremental de cotacoes (migration 0068). Uma passada por faixas de id, com pausas; idempotente.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-price-rollup.ts [--faixa=150000] [--pausa=3000]
 * Nao altera nenhuma cotacao; so escreve nas 3 tabelas de resumo. Rode com o envio do Telegram sendo observado (R-analise-pesada).
 */
import { backfillRollup } from '@/server/pricing/price-rollup';
const arg = (k: string, d: number) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1] ?? d);
(async () => {
  const t = Date.now();
  const r = await backfillRollup({ rangeIds: arg('faixa', 150_000), pauseMs: arg('pausa', 3000), log: (s) => console.log(s) });
  console.log(`pronto: ${r.offers} ofertas com estado novo, ${r.ranges} faixas, ${Math.round((Date.now() - t) / 1000)} s`);
  process.exit(0);
})().catch((e) => { console.error(String(e?.cause?.message ?? e?.message ?? e).slice(0, 500)); process.exit(1); });
