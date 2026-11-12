/**
 * BACKUP e REVERSAO em bloco das decisoes feitas na /admin/aprovacao (padrao "aprovacao ampla com backup", dono 2026-11-12).
 * A Vercel nao grava em docs/backups, entao a fonte de verdade e o banco (identity_decisions guarda o estado anterior; o gate anterior do master fica
 * em master_products.attributes.aprovacaoHumana). Este script exporta essas decisoes para NDJSON local e reverte a partir do arquivo.
 *
 *   Exportar (so SELECT):  npx tsx --conditions=react-server --env-file=.env.local scripts/aprovacao-backup.ts [--desde 2026-11-12]
 *   Reverter (APENAS o dono): ... scripts/aprovacao-backup.ts --reverter docs/backups/aprovacao-<carimbo>.ndjson [--apply]   (sem --apply so simula)
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { desfazer } from '@/server/aprovacao/aprovacao';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const rows = <T>(r: unknown) => r as unknown as T[];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

async function exportar() {
  const desde = arg('desde') ?? '2000-01-01';
  const r = rows<Record<string, unknown>>(await db.execute(sql`
    SELECT d.id::text AS decision_id, d.offer_id::text, d.item_id::text, d.axis, d.value, d.kind, d.decided_via, d.decided_by::text, d.decided_at::text,
           d.prev_status, d.prev_quarantined_at::text, d.from_master_id::text, d.to_master_id::text, d.undone_at::text, d.title,
           m.attributes->'aprovacaoHumana' AS master_aprovacao, o.status::text AS status_atual, o.published_at::text AS published_atual
    FROM identity_decisions d LEFT JOIN affiliate_offers o ON o.id = d.offer_id LEFT JOIN master_products m ON m.id = d.from_master_id
    WHERE d.decided_by IS NOT NULL AND d.decided_at >= ${desde}::timestamptz ORDER BY d.decided_at`));
  fs.mkdirSync('docs/backups', { recursive: true });
  const file = path.join('docs/backups', `aprovacao-${stamp}.ndjson`);
  fs.writeFileSync(file, r.map((x) => JSON.stringify(x)).join('\n') + (r.length ? '\n' : ''));
  const log = { stamp, desde, decisoes: r.length, ativas: r.filter((x) => !x.undone_at).length, arquivo: file, reverter: `npx tsx --conditions=react-server --env-file=.env.local scripts/aprovacao-backup.ts --reverter ${file} --apply` };
  fs.writeFileSync(path.join('docs/backups', `aprovacao-log-${stamp}.json`), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
}

async function reverter(file: string) {
  const apply = process.argv.includes('--apply');
  const linhas = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { decision_id: string; decided_by: string; undone_at: string | null });
  const alvo = linhas.filter((l) => !l.undone_at).reverse();
  console.log(`${alvo.length} decisoes a reverter (${apply ? 'APLICANDO' : 'simulacao'}).`);
  if (!apply) return;
  let ok = 0; let erro = 0;
  for (const l of alvo) {
    const r = await desfazer(db, { decisionId: l.decision_id, userId: l.decided_by });
    if (r.ok) ok++; else { erro++; console.error('falhou', l.decision_id, r.error); }
    await new Promise((res) => setTimeout(res, 50));
  }
  console.log(JSON.stringify({ revertidas: ok, erros: erro }));
}

(async () => { const f = arg('reverter'); if (f) await reverter(f); else await exportar(); process.exit(0); })();
