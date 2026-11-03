/**
 * DRY-RUN da descoberta do Mercado Livre (nada é gravado no banco; só GETs na API oficial e SELECTs).
 * Única escrita possível: refresh do token OAuth em system_config (feito por qualquer coletor).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/dry-run-descoberta.ts [cursor] [termos] [maxNew] [sondas]
 * Saída: resumo no console + docs/descoberta-dryrun-<data>.json (preview e amostras de descarte).
 */
import fs from 'node:fs';
import { discoverNewProducts } from '../src/server/collector/discover-products';

(async () => {
  const [cursor, terms, maxNew, probes] = process.argv.slice(2).map((x) => (x === undefined ? undefined : Number(x)));
  const r = await discoverNewProducts({
    dryRun: true,
    cursorStart: cursor,
    termsLimit: terms ?? 4,
    limits: { maxNewMasters: maxNew ?? 40, probesPerTerm: probes ?? 25, timeBudgetMs: 100_000 },
  });
  const out = `docs/descoberta-dryrun-2026-11-03-c${r.cursorStart}.json`;
  fs.writeFileSync(out, JSON.stringify(r, null, 1), 'utf8');
  const { preview, skipSamples, ...rest } = r;
  console.log(JSON.stringify(rest, null, 1));
  console.log('arquivo:', out, '| preview:', preview.length, '| amostras de descarte:', skipSamples.length);
  process.exit(0);
})().catch((e) => { console.error('ERR', e?.message ?? e); process.exit(1); });
