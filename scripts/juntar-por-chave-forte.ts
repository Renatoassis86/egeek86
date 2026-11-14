/**
 * BUSCA CRUZADA POR CHAVE FORTE (C13, dono 2026-11-14): transforma as duplicatas candidatas do enriquecimento (GTIN que o catálogo oficial do ML
 * atribui a um master mas que já está gravado em OUTRO master) em pares de fusão, só quando a chave bate E o modelo é idêntico
 * (vertical, tipo, plataforma e tokens de modelo iguais; sufixos parecidos ficam separados). Só SELECT; grava o arquivo de pares.
 *
 *   npx tsx --env-file=.env.local scripts/juntar-por-chave-forte.ts docs/backups/gtin-duplicatas-<ts>.json
 *   # depois, a fusão em si usa o fluxo existente (dry-run por padrão; --apply exige backup recente em backup/dados):
 *   npx tsx --env-file=.env.local scripts/merge-duplicate-masters.ts --pairs docs/backups/pares-chave-forte-<ts>.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { podeJuntarPorChave } from '../src/lib/catalog/enriquecimento-chave';

const entrada = process.argv[2];
if (!entrada) { console.error('uso: juntar-por-chave-forte.ts <gtin-duplicatas.json>'); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

async function main() {
  const dups = JSON.parse(fs.readFileSync(entrada!, 'utf8')) as Array<{ id: string; nome: string; gtin: string; outroMasterId: string }>;
  const sql = connect();
  try {
    const ids = [...new Set(dups.flatMap((d) => [d.id, d.outroMasterId]))];
    const rows = await sql<{ id: string; name: string; vertical: string; tipo: string; plat: string | null; merged: string | null; ofertas: number }[]>`
      SELECT m.id::text AS id, m.name, m.vertical, m.product_type::text AS tipo, m.game_platform_gen::text AS plat, m.attributes ->> 'mergedInto' AS merged,
             (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS ofertas
      FROM master_products m WHERE m.id = ANY(${ids}::uuid[])`;
    const by = new Map(rows.map((r) => [r.id, r]));
    const pares: Array<{ canonicalId: string; mergeIds: string[] }> = [];
    const motivos: Record<string, number> = {};
    for (const d of dups) {
      const a = by.get(d.outroMasterId); // dono do GTIN = canônico
      const b = by.get(d.id);
      if (!a || !b || a.merged || b.merged) { motivos.arquivado_ou_ausente = (motivos.arquivado_ou_ausente ?? 0) + 1; continue; }
      const r = podeJuntarPorChave(
        { id: a.id, nome: a.name, vertical: a.vertical, tipo: a.tipo, plataforma: a.plat },
        { id: b.id, nome: b.name, vertical: b.vertical, tipo: b.tipo, plataforma: b.plat },
      );
      motivos[r.motivo] = (motivos[r.motivo] ?? 0) + 1;
      if (r.ok) pares.push({ canonicalId: a.id, mergeIds: [b.id] });
      else console.log(`  separado (${r.motivo}): ${a.name.slice(0, 40)} | ${b.name.slice(0, 40)}`);
    }
    console.log(`candidatas: ${dups.length}; pares aprovados: ${pares.length}`, JSON.stringify(motivos));
    if (pares.length) {
      const f = path.resolve('docs/backups', `pares-chave-forte-${stamp}.json`);
      fs.writeFileSync(f, JSON.stringify(pares, null, 2));
      console.log('pares:', f);
    }
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
