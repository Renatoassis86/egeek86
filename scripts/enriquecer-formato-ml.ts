/**
 * Prova o FORMATO (físico x digital) dos masters de jogo com catálogo do Mercado Livre pelo atributo estruturado FORMAT
 * da API OFICIAL (GET /products/{catalog_product_id}). Só leitura na API; grava só `master_products.game_format`
 * e só quando o NOME do master não prova o formato (o nome vence a API) e a API devolve físico ou digital.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/enriquecer-formato-ml.ts            # dry-run (consulta a API, não grava)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/enriquecer-formato-ml.ts --apply    # grava (exige backup <= 12 h)
 * Log reversível: backup/dados/enriquecer-formato-log-*.json (campo `colunas`; desfazer: scripts/revert-separar-formato.ts <log>).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, describeBackup, readBackupIds } from './_dup-shared';
import { classifyMeliCatalogProduct } from '../src/server/collector/sources/mercado-livre-classify';
import { deriveGameFormat } from '../src/lib/affiliate/game-classification';

const APPLY = process.argv.includes('--apply');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sql = connect();
  try {
    const masters = await sql<{ id: string; name: string; meli: string }[]>`
      select id, name, meli_catalog_id meli from master_products
      where product_type = 'game' and game_format = 'unknown' and meli_catalog_id is not null and attributes->>'mergedInto' is null`;
    // --ids-file=<json> (lista de objetos com `id` ou de ids): restringe a esses masters.
    const idsArg = process.argv.find((a) => a.startsWith('--ids-file='))?.split('=')[1];
    const only = idsArg ? new Set((JSON.parse(fs.readFileSync(idsArg, 'utf8')) as Array<string | { id: string }>).map((x) => (typeof x === 'string' ? x : x.id))) : null;
    const todo = masters.filter((m) => deriveGameFormat(m.name) === 'unknown' && (!only || only.has(m.id)));
    console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}; masters com catálogo ML e formato não provado pelo nome: ${todo.length}`);
    const found: Array<{ id: string; name: string; fmt: 'physical' | 'digital' }> = [];
    const noFormat: string[] = [];
    const errors: Array<{ id: string; err: string }> = [];
    for (const m of todo) {
      try {
        const r = await classifyMeliCatalogProduct(m.meli);
        if (r.gameFormat === 'physical' || r.gameFormat === 'digital') found.push({ id: m.id, name: m.name, fmt: r.gameFormat });
        else noFormat.push(m.id);
      } catch (e) {
        errors.push({ id: m.id, err: String(e instanceof Error ? e.message : e).slice(0, 120) });
      }
      await sleep(120);
    }
    console.log(`API: físico ${found.filter((f) => f.fmt === 'physical').length}, digital ${found.filter((f) => f.fmt === 'digital').length}, sem atributo FORMAT ${noFormat.length}, erro ${errors.length}`);
    if (errors.length) console.log('  exemplos de erro:', errors.slice(0, 3));
    const csvFile = path.resolve(process.cwd(), 'docs', `formato-ml-api-${APPLY ? 'aplicado' : 'dryrun'}-2026-11-03.csv`);
    fs.writeFileSync(csvFile, '﻿master_id;nome;formato_api\n' + found.map((f) => `${f.id};"${f.name.replace(/"/g, '""')}";${f.fmt}`).join('\n') + '\n', 'utf8');
    console.log('CSV:', path.relative(process.cwd(), csvFile));
    if (!APPLY) return;

    const backup = describeBackup(process.cwd(), 12);
    const bm = readBackupIds(path.join(backup.dir, 'master_products.ndjson'));
    if (!backup.ok || found.some((f) => !bm.has(f.id))) throw new Error('Backup ausente/antigo/incompleto.');
    const logFile = path.resolve(process.cwd(), 'backup', 'dados', `enriquecer-formato-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const log: any = { criado_em: new Date().toISOString(), masters_criados: [], movimentos: [], rascunhos: [], colunas: [] };
    await sql.begin(async (tx) => {
      for (const f of found) {
        const u = await tx`update master_products set game_format = ${f.fmt}::game_format, updated_at = now() where id = ${f.id} and game_format = 'unknown'`;
        if (u.count !== 1) throw new Error('coluna mudou: ' + f.id);
        log.colunas.push({ master_id: f.id, nome: f.name, de: 'unknown', para: f.fmt, motivo: 'atributo FORMAT da API oficial do Mercado Livre' });
      }
      fs.writeFileSync(logFile, JSON.stringify(log, null, 2), 'utf8');
    });
    console.log('Log:', path.relative(process.cwd(), logFile), `(${log.colunas.length} masters)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error('Falha:', e instanceof Error ? e.message : e);
  process.exit(1);
});
