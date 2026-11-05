/**
 * Roda UM ciclo do job refresh-price-daily fora do cron (medição de tempo e verificação de idempotência).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/run-refresh-price-daily.ts
 * Independe da flag PRICE_DAILY_SHADOW (a flag só governa o cron e o gancho da coleta).
 */
import { refreshPriceDaily } from '@/server/jobs/refresh-price-daily';

refreshPriceDaily({ budgetMs: 240_000 })
  .then((s) => {
    console.log(JSON.stringify(s, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
