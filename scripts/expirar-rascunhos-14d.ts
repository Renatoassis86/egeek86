/**
 * RASCUNHO SEM RESPOSTA EM 14 DIAS SAI DA FILA (C13, dono 2026-11-14): oferta em status 'draft' criada há mais de 14 dias, sem nenhuma decisão
 * de identidade vigente, passa a 'archived' (volta como "não identificado": nada é apagado). Cada oferta ganha uma linha de trilha em
 * identity_decisions (kind 'auto_regra', is_rule=false, prev_status='draft') para auditoria e reversão.
 *
 *   # DRY-RUN (padrão): só SELECT; imprime contagem por rede e amostra
 *   npx tsx --env-file=.env.local scripts/expirar-rascunhos-14d.ts
 *   # APLICAR: backup NDJSON + log antes; lotes pequenos em transação curta; guarda otimista (só grava se ainda é 'draft')
 *   npx tsx --env-file=.env.local scripts/expirar-rascunhos-14d.ts --apply --por "Nome"
 *   # REVERTER: volta a 'draft' só de quem ainda está 'archived' por este lote
 *   npx tsx --env-file=.env.local scripts/expirar-rascunhos-14d.ts --rollback docs/backups/rascunhos-14d-log-<ts>.json [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (n: string): string | undefined => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const POR = arg('--por') ?? '';
const ROLLBACK = arg('--rollback');
const DIAS = Number(arg('--dias') ?? 14);
const LOTE = 25;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');

interface Linha { id: string; titulo: string; rede: string; criada: string; vertical: string }

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (ROLLBACK) {
      const log = JSON.parse(fs.readFileSync(ROLLBACK, 'utf8')) as { gravados: string[]; decisaoIds: string[] };
      console.log('a reverter:', log.gravados.length);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      for (let i = 0; i < log.gravados.length; i += LOTE) {
        const ids = log.gravados.slice(i, i + LOTE);
        await sql.begin(async (tx) => {
          await tx`SET LOCAL statement_timeout = '20s'`;
          await tx`UPDATE affiliate_offers SET status = 'draft' WHERE id = ANY(${ids}::uuid[]) AND status = 'archived'`;
        });
      }
      if (log.decisaoIds.length) await sql`UPDATE identity_decisions SET undone_at = now() WHERE id = ANY(${log.decisaoIds}::uuid[]) AND undone_at IS NULL`;
      return void console.log('ROLLBACK aplicado.');
    }

    const rows = await sql<Linha[]>`
      SELECT o.id::text AS id, left(o.title, 120) AS titulo, n.slug AS rede, o.created_at::date::text AS criada, COALESCE(o.vertical, 'games') AS vertical
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
      WHERE o.status = 'draft' AND o.created_at < now() - make_interval(days => ${DIAS})
        AND NOT EXISTS (SELECT 1 FROM identity_decisions d WHERE d.offer_id = o.id AND d.undone_at IS NULL)
      ORDER BY o.created_at`;
    const porRede: Record<string, number> = {};
    for (const r of rows) porRede[r.rede] = (porRede[r.rede] ?? 0) + 1;
    console.log(`rascunhos com mais de ${DIAS} dias e sem decisão: ${rows.length}`, JSON.stringify(porRede));
    for (const r of rows.slice(0, 10)) console.log(`  ${r.id.slice(0, 8)} | ${r.rede} | ${r.criada} | ${r.titulo.slice(0, 70)}`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply --por "Nome".');
    if (!POR) throw new Error('--por "Nome" é obrigatório com --apply');
    if (!rows.length) return void console.log('nada a fazer.');

    const bk = path.join(DIR, `rascunhos-14d-${stamp}.ndjson`);
    fs.writeFileSync(bk, rows.map((r) => JSON.stringify({ id: r.id, statusAnterior: 'draft', titulo: r.titulo, rede: r.rede, criada: r.criada })).join('\n') + '\n');
    const gravados: string[] = [];
    const decisaoIds: string[] = [];
    for (let i = 0; i < rows.length; i += LOTE) {
      const lote = rows.slice(i, i + LOTE);
      await sql.begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = '20s'`;
        await tx`SET LOCAL lock_timeout = '3s'`;
        for (const r of lote) {
          const u = await tx`UPDATE affiliate_offers SET status = 'archived' WHERE id = ${r.id}::uuid AND status = 'draft'`;
          if (!u.count) continue;
          const d = await tx<{ id: string }[]>`
            INSERT INTO identity_decisions (offer_id, vertical, axis, value, value_label, kind, title, title_norm, prev_status, is_rule)
            VALUES (${r.id}::uuid, ${r.vertical}, 'identidade', 'nao_identificado', ${`rascunho sem resposta em ${DIAS} dias`}, 'auto_regra', ${r.titulo}, ${r.titulo.toLowerCase()}, 'draft', false)
            RETURNING id::text AS id`;
          gravados.push(r.id);
          decisaoIds.push(d[0]!.id);
        }
      }).catch((e) => console.log('falha no lote', i, e instanceof Error ? e.message.slice(0, 100) : ''));
    }
    const logFile = path.join(DIR, `rascunhos-14d-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: new Date().toISOString(), por: POR, dias: DIAS, backup: path.basename(bk), gravados, decisaoIds, rollback: `npx tsx --env-file=.env.local scripts/expirar-rascunhos-14d.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));
    console.log(`ARQUIVADOS: ${gravados.length}/${rows.length} | backup: ${bk} | log: ${logFile}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
