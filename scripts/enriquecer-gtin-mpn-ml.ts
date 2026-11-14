/**
 * ENRIQUECIMENTO DE GTIN/MPN pelo catálogo oficial do Mercado Livre (C13, dono 2026-11-14). Regras puras em src/lib/catalog/enriquecimento-chave.ts.
 *
 *   # DRY-RUN (padrão): consulta a API (somente GET) até --max-calls masters e imprime contagens e amostra; não grava nada
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/enriquecer-gtin-mpn-ml.ts --max-calls 120 [--vertical games]
 *   # APLICAR: grava gtin/mpn só em master que ainda os tem NULL (guarda otimista), em lotes pequenos, com backup NDJSON + log
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/enriquecer-gtin-mpn-ml.ts --max-calls 300 --apply --por "Nome"
 *   # Lotes sucessivos: --offset N pula os N primeiros candidatos (mesma ordem), para varrer a lista em rodadas de --max-calls
 *   # REVERTER: volta gtin/mpn a NULL só de quem ainda tem o valor gravado por este lote
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/enriquecer-gtin-mpn-ml.ts --rollback docs/backups/enriquecer-gtin-log-<ts>.json [--apply]
 *
 * Duplicatas (GTIN já em outro master) NUNCA são gravadas: saem em docs/backups/gtin-duplicatas-<ts>.json para o fluxo de mescla.
 * Parada imediata em 429/403 da API. Nunca imprime token. Não toca updated_at.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { avaliarEnriquecimento, type MasterParaEnriquecer } from '../src/lib/catalog/enriquecimento-chave';
import type { MlCatalogPayload } from '../src/lib/catalog/vertical/identity';

const argv = process.argv.slice(2);
const arg = (n: string): string | undefined => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const APPLY = argv.includes('--apply');
const MAX = Number(arg('--max-calls') ?? 120);
const VERTICAL = arg('--vertical');
const OFFSET = Number(arg('--offset') ?? 0);
const POR = arg('--por') ?? '';
const ROLLBACK = arg('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** GTIN-12/13/14 do mesmo produto diferem só por zeros à esquerda: a comparação de dono usa a forma sem zeros. */
const semZeros = (g: string) => g.replace(/^0+/, '');

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (ROLLBACK) {
      const log = JSON.parse(fs.readFileSync(ROLLBACK, 'utf8')) as { gravados: Array<{ id: string; gtin: string | null; mpn: string | null }> };
      console.log('a reverter:', log.gravados.length);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      for (const g of log.gravados) {
        if (g.gtin) await sql`UPDATE master_products SET gtin = NULL WHERE id = ${g.id}::uuid AND gtin = ${g.gtin}`;
        if (g.mpn) await sql`UPDATE master_products SET mpn = NULL WHERE id = ${g.id}::uuid AND mpn = ${g.mpn}`;
      }
      return void console.log('ROLLBACK aplicado.');
    }
    const { getValidAccessToken } = await import('../src/server/collector/sources/mercado-livre-auth');
    const token = await getValidAccessToken();

    const vf = VERTICAL ? sql`AND m.vertical = ${VERTICAL}` : sql``;
    const masters = await sql<{ id: string; name: string; manufacturer: string | null; gtin: string | null; mpn: string | null; cat: string }[]>`
      SELECT m.id::text AS id, m.name, m.manufacturer, m.gtin, m.mpn, m.meli_catalog_id AS cat
      FROM master_products m
      WHERE m.meli_catalog_id IS NOT NULL AND (m.gtin IS NULL OR m.mpn IS NULL) ${vf}
        AND COALESCE(m.attributes -> 'catalogGate' ->> 'verdict', '') <> 'rejected'
        AND EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active')
      ORDER BY (m.gtin IS NULL) DESC, m.id LIMIT ${MAX} OFFSET ${OFFSET}`;
    const gtinsDono = new Map<string, string>();
    for (const r of await sql<{ id: string; gtin: string }[]>`SELECT id::text AS id, gtin FROM master_products WHERE gtin IS NOT NULL`) gtinsDono.set(semZeros(r.gtin), r.id);

    const stats: Record<string, number> = {};
    const gravar: Array<{ id: string; nome: string; gtin: string | null; mpn: string | null; marca: string }> = [];
    const duplicatas: Array<{ id: string; nome: string; gtin: string; outroMasterId: string }> = [];
    let calls = 0;
    for (const m of masters) {
      const res = await fetch(`https://api.mercadolibre.com/products/${m.cat}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
      calls++;
      if (!res) { stats.rede = (stats.rede ?? 0) + 1; continue; }
      if (res.status === 429 || res.status === 403) { console.log(`PARADA: API respondeu ${res.status} após ${calls} chamadas.`); break; }
      if (!res.ok) { stats[`http_${res.status}`] = (stats[`http_${res.status}`] ?? 0) + 1; await sleep(250); continue; }
      const payload = (await res.json()) as MlCatalogPayload;
      const base: MasterParaEnriquecer = { id: m.id, nome: m.name, fabricante: m.manufacturer, gtin: m.gtin, mpn: m.mpn };
      const r = avaliarEnriquecimento(base, payload, (g) => gtinsDono.get(semZeros(g)) ?? null);
      if (r.acao === 'gravar') {
        stats.gravar = (stats.gravar ?? 0) + 1;
        if (r.gtin) { stats.gravar_gtin = (stats.gravar_gtin ?? 0) + 1; gtinsDono.set(semZeros(r.gtin), m.id); }
        if (r.mpn) stats.gravar_mpn = (stats.gravar_mpn ?? 0) + 1;
        gravar.push({ id: m.id, nome: m.name, gtin: r.gtin, mpn: r.mpn, marca: r.marca });
      } else if (r.acao === 'duplicata') {
        stats.duplicata = (stats.duplicata ?? 0) + 1;
        duplicatas.push({ id: m.id, nome: m.name, gtin: r.gtin, outroMasterId: r.outroMasterId });
      } else stats[`ignorar_${r.motivo}`] = (stats[`ignorar_${r.motivo}`] ?? 0) + 1;
      await sleep(300);
    }
    console.log(`consultados: ${calls}/${masters.length}`, JSON.stringify(stats));
    for (const g of gravar.slice(0, 12)) console.log(`  gravar ${g.id.slice(0, 8)} | gtin=${g.gtin ?? '-'} mpn=${g.mpn ?? '-'} | marca=${g.marca} | ${g.nome.slice(0, 60)}`);
    for (const d of duplicatas.slice(0, 8)) console.log(`  DUPLICATA ${d.id.slice(0, 8)} ~ ${d.outroMasterId.slice(0, 8)} gtin=${d.gtin} | ${d.nome.slice(0, 60)}`);
    if (duplicatas.length) {
      const f = path.join(DIR, `gtin-duplicatas-${stamp}.json`);
      fs.writeFileSync(f, JSON.stringify(duplicatas, null, 2));
      console.log('duplicatas candidatas:', f);
    }
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply --por "Nome".');
    if (!POR) throw new Error('--por "Nome" é obrigatório com --apply');

    const bk = path.join(DIR, `enriquecer-gtin-${stamp}.ndjson`);
    fs.writeFileSync(bk, gravar.map((g) => JSON.stringify({ id: g.id, nome: g.nome, gtinAnterior: null, mpnAnterior: null, gtin: g.gtin, mpn: g.mpn })).join('\n') + '\n');
    const gravados: Array<{ id: string; gtin: string | null; mpn: string | null }> = [];
    for (const g of gravar) {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = '15s'`;
        await tx`SET LOCAL lock_timeout = '3s'`;
        let tocou = false;
        if (g.gtin) {
          const u = await tx`UPDATE master_products SET gtin = ${g.gtin} WHERE id = ${g.id}::uuid AND gtin IS NULL AND NOT EXISTS (SELECT 1 FROM master_products x WHERE ltrim(x.gtin, '0') = ${semZeros(g.gtin)})`;
          tocou = u.count > 0;
        }
        if (g.mpn) {
          const u = await tx`UPDATE master_products SET mpn = ${g.mpn} WHERE id = ${g.id}::uuid AND mpn IS NULL`;
          tocou = tocou || u.count > 0;
        }
        if (tocou) gravados.push({ id: g.id, gtin: g.gtin, mpn: g.mpn });
      }).catch((e) => console.log('falha', g.id.slice(0, 8), e instanceof Error ? e.message.slice(0, 80) : ''));
    }
    const logFile = path.join(DIR, `enriquecer-gtin-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: new Date().toISOString(), por: POR, backup: path.basename(bk), gravados, rollback: `npx tsx --conditions=react-server --env-file=.env.local scripts/enriquecer-gtin-mpn-ml.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));
    console.log(`GRAVADOS: ${gravados.length}/${gravar.length} | backup: ${bk} | log: ${logFile}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
