/**
 * EXECUÇÃO REAL SUPERVISIONADA da descoberta do Mercado Livre (GRAVA: masters novos, ofertas placeholder,
 * cotação inicial e o cursor/ última execução em system_config). Lote mínimo por padrão.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/run-descoberta-supervisionada.ts [maxNew=10] [termos=4] [probes=25]
 * Exige backup <= 12 h em backup/dados (rodar backup/backup-pre-fusao.mjs antes). Log: backup/dados/descoberta-log-<ts>.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { discoverNewProducts } from '../src/server/collector/discover-products';

(async () => {
  const f = path.resolve('backup/dados/master_products.ndjson');
  const ageH = (Date.now() - fs.statSync(f).mtimeMs) / 3_600_000;
  if (ageH > 12) throw new Error(`backup velho (${ageH.toFixed(1)} h > 12 h): rode backup/backup-pre-fusao.mjs`);
  const [maxNew, terms, probes] = process.argv.slice(2).map(Number);
  const r = await discoverNewProducts({
    dryRun: false,
    termsLimit: terms || 4,
    limits: { maxNewMasters: maxNew || 10, probesPerTerm: probes || 25 },
  });
  const out = path.resolve(`backup/dados/descoberta-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(out, JSON.stringify(r, null, 1), 'utf8');
  console.log('backup (h):', ageH.toFixed(2), '| log:', out);
  const { skipSamples, preview, ...rest } = r;
  console.log(JSON.stringify(rest, null, 1));
  process.exit(0);
})().catch((e) => { console.error('ERR', e?.message ?? e); process.exit(1); });
