/**
 * QUARENTENA DE PREÇOS ABSURDOS (decisão adotada por delegação em 2026-11-03, reversível).
 * Marca affiliate_offers.quarantined_at (migration 0023). NUNCA apaga oferta nem cotação,
 * não altera status nem preço: a oferta só sai de toda leitura pública e indicador.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/quarentena-precos-absurdos.ts            # dry-run (padrão)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/quarentena-precos-absurdos.ts --apply    # grava (transação, log)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/quarentena-precos-absurdos.ts --revert backup/dados/quarentena-log-<ts>.json
 *
 * Fonte: docs/precos-absurdos-quarentena-2026-11-01.csv. Entram só as linhas com nivel=quarentena
 * (acima de 3x a mediana, ou abaixo de 0,35x, ou acima de R$ 50.000). As linhas nivel=revisao
 * (cauda inferior robusta, 0,35x a 0,8x da mediana) NÃO entram: são preços baixos plausíveis, e
 * escondê-los violaria a regra de concorrência real. Cada oferta é REVALIDADA ao vivo contra a
 * mediana atual das demais ofertas ativas do mesmo master; se o preço já se corrigiu, é pulada.
 * Backup obrigatório (<= 12 h): backup/backup-pre-fusao.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const revertIdx = process.argv.indexOf('--revert');
/** --rescan: em vez da lista do CSV, varre as ofertas ATIVAS de hoje (preço novo absurdo depois do CSV de 2026-11-01). */
const RESCAN = process.argv.includes('--rescan');
const RESCAN_MIN_OTHERS = 3;
/** --hard-only (com --rescan): só preço >= R$ 50.000, sem julgamento estatístico. */
const HARD_ONLY = process.argv.includes('--hard-only');
const CSV = 'docs/precos-absurdos-quarentena-2026-11-01.csv';
const HIGH_RATIO = 3;
const LOW_RATIO = 0.35;
const HARD_CEILING_CENTS = 5_000_000;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

/** Motivo ao vivo: null = o preço atual já não é absurdo (não quarentenar). Pura, testável. */
export function absurdReason(priceCents: number, medianOthersCents: number | null): string | null {
  if (priceCents >= HARD_CEILING_CENTS) return 'acima_de_R$50.000';
  if (!medianOthersCents || medianOthersCents <= 0) return null;
  const r = priceCents / medianOthersCents;
  if (r > HIGH_RATIO) return `razao_acima_de_${HIGH_RATIO}`;
  if (r < LOW_RATIO) return `razao_abaixo_de_${LOW_RATIO}`;
  return null;
}

function recentBackupOk(): string {
  const f = path.resolve('backup/dados/affiliate_offers.ndjson');
  if (!fs.existsSync(f)) throw new Error('Sem backup de affiliate_offers. Rode backup/backup-pre-fusao.mjs.');
  const ageH = (Date.now() - fs.statSync(f).mtimeMs) / 3_600_000;
  if (ageH > 12) throw new Error(`Backup com ${ageH.toFixed(1)} h (> 12 h). Rode backup/backup-pre-fusao.mjs.`);
  return `${ageH.toFixed(1)} h`;
}

async function revert(file: string) {
  const sql = connect();
  try {
    const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as { appliedAt: string; items: Array<{ offer_id: string }> };
    const ids = log.items.map((i) => i.offer_id);
    const res = await sql`UPDATE affiliate_offers SET quarantined_at = NULL WHERE id IN ${sql(ids)} AND quarantined_at IS NOT NULL`;
    console.log(`Revertido: ${res.count} de ${ids.length} ofertas voltaram a ser públicas.`);
  } finally {
    await sql.end();
  }
}

async function main() {
  if (revertIdx >= 0) return revert(process.argv[revertIdx + 1]);
  const backupAge = recentBackupOk();
  const sql = connect();
  try {
    let ids: string[];
    if (RESCAN) {
      const found = await sql<Array<{ id: string }>>`
        SELECT o.id FROM affiliate_offers o
        WHERE o.status = 'active' AND o.current_price_cents > 0 AND o.quarantined_at IS NULL
          AND (o.current_price_cents >= ${HARD_CEILING_CENTS} OR (
            SELECT count(*) FROM affiliate_offers x WHERE x.master_product_id = o.master_product_id AND x.id <> o.id
              AND x.status = 'active' AND x.current_price_cents > 0 AND x.quarantined_at IS NULL) >= ${RESCAN_MIN_OTHERS})`;
      ids = found.map((r) => r.id);
    } else {
      ids = fs
        .readFileSync(path.resolve(CSV), 'utf8')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .slice(1)
        .filter(Boolean)
        .map((l) => l.split(';'))
        .filter((c) => c[12] === 'quarentena')
        .map((c) => c[0]);
    }
    const rows = await sql<
      Array<{ id: string; title: string; status: string; price: string; master: string; median_others: string | null; quarantined_at: Date | null }>
    >`
      SELECT o.id, o.title, o.status, o.current_price_cents AS price, o.master_product_id AS master, o.quarantined_at,
             (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x.current_price_cents)
                FROM affiliate_offers x
               WHERE x.master_product_id = o.master_product_id AND x.id <> o.id AND x.status = 'active'
                 AND x.current_price_cents > 0 AND x.quarantined_at IS NULL) AS median_others
      FROM affiliate_offers o WHERE o.id IN ${sql(ids)}
    `;
    const items: Array<Record<string, unknown>> = [];
    const skipped: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const price = Number(r.price);
      const med = r.median_others == null ? null : Number(r.median_others);
      const reason = r.quarantined_at ? null : absurdReason(price, med);
      const rec = { offer_id: r.id, title: r.title, status: r.status, price_cents: price, master_id: r.master, median_others_cents: med };
      if (reason && HARD_ONLY && !reason.startsWith('acima_de')) skipped.push({ ...rec, why: 'fora de --hard-only' });
      else if (reason) items.push({ ...rec, reason });
      else skipped.push({ ...rec, why: r.quarantined_at ? 'ja em quarentena' : 'preço atual não é mais absurdo' });
    }
    console.log(`${RESCAN ? 'Varredura ao vivo' : 'CSV nivel=quarentena'}: ${ids.length}; encontradas: ${rows.length}; a quarentenar: ${items.length}; puladas: ${skipped.length}; backup: ${backupAge}`);
    if (!APPLY) {
      console.log('DRY-RUN (use --apply). Amostra:');
      for (const i of items.slice(0, 5)) console.log(' ', JSON.stringify(i));
      return;
    }
    const appliedAt = new Date().toISOString();
    await sql.begin(async (tx) => {
      const res = await tx`UPDATE affiliate_offers SET quarantined_at = ${appliedAt}::timestamptz WHERE id IN ${tx(items.map((i) => i.offer_id as string))} AND quarantined_at IS NULL`;
      if (res.count !== items.length) throw new Error(`Esperado ${items.length} linhas, gravou ${res.count}; transação abortada.`);
    });
    const logFile = `backup/dados/quarentena-log${RESCAN ? '-rescan' : ''}-${stamp}.json`;
    fs.writeFileSync(logFile, JSON.stringify({ appliedAt, source: RESCAN ? 'rescan ao vivo' : CSV, items, skipped }, null, 2));
    console.log(`Gravado. Log (reversão): ${logFile}`);
  } finally {
    await sql.end();
  }
}

// Só roda como script (o teste importa absurdReason sem executar o banco).
if (process.argv[1] && /quarentena-precos-absurdos/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
