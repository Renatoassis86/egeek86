/**
 * Reprocessa arquivos amz-lote-*.json da coleta assistida da Amazon (modo manual/de emergência; o caminho normal é a rota
 * /api/ingest/amazon-assistida chamada pela aba logada). Padrão: simulação. Com --apply grava.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/ingest-amazon-assistida.ts \
 *     --dir <pasta dos lotes> --queue <queue.json> --tag <id-de-rastreamento> [--apply]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ingestAmazonRows, type AmzRow } from '@/server/collector/amazon-assisted';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes('--apply');
const DIR = arg('dir')!, QUEUE = arg('queue')!, TAG = arg('tag')!;
if (!DIR || !QUEUE || !TAG) throw new Error('uso: --dir --queue --tag [--apply]');

async function main() {
  const queue: { master_id: string; q: string }[] = JSON.parse(readFileSync(QUEUE, 'utf8'));
  const files = readdirSync(DIR).filter((f) => /^amz-lote-\d+.*\.json$/.test(f)).sort();
  const rows: AmzRow[] = [];
  for (const f of files) {
    const data = JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as { off: number; stopped: string | null; R: { i: number; q: string; r: AmzRow['r'] }[] };
    if (data.stopped) console.log(`[aviso] ${f} parou: ${data.stopped}`);
    for (const row of data.R) { const it = queue[data.off + row.i]; if (it && it.q === row.q) rows.push({ id: it.master_id, r: row.r }); }
  }
  const { stats, log } = await ingestAmazonRows(rows, { tag: TAG, apply: APPLY });
  const out = path.join(DIR, `amz-ingest-${APPLY ? 'aplicado' : 'simulacao'}.ndjson`);
  writeFileSync(out, log.map((l) => JSON.stringify(l)).join('\n') + '\n');
  console.log(JSON.stringify(stats, null, 2)); console.log('relatório:', out);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
