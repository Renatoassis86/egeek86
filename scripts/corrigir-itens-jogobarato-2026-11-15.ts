/**
 * Inventario Jogo Barato (Shopee, dono 2026-11-15): correcoes pontuais, reversiveis, com backup NDJSON e log.
 *
 *   npx tsx --conditions react-server --env-file=.env.local scripts/corrigir-itens-jogobarato-2026-11-15.ts                 # DRY-RUN (padrao)
 *   npx tsx --conditions react-server --env-file=.env.local scripts/corrigir-itens-jogobarato-2026-11-15.ts --apply --por "Nome"
 *   npx tsx --conditions react-server --env-file=.env.local scripts/corrigir-itens-jogobarato-2026-11-15.ts --rollback docs/backups/itens-jogobarato-log-<ts>.json [--apply]
 *
 * A) 4704eddc: product_type 'game' -> 'console' (bundle de console; titulo e ofertas provam; porteiro e classifyCatalogItem concordam).
 * B) b0996ccb (Switch Lite turquesa, Shopee/ML): restaura o veredito anterior (approved) tirado por 'foto_com_mao' em 2026-11-14. A foto marcada
 *    como "mao" e arte impressa da caixa oficial (mao ilustrada) em varias ofertas; so a oferta da ARgames (95ea41a5, "Novinho") tem mao real.
 * C) 95ea41a5 (ARgames, mao real na foto = seminovo, regra do dono): quarentena POR OFERTA (quarantined_at), em vez de derrubar o master inteiro.
 * D) Masters com catalogGate NULL do inventario: porteiro roda; so grava 'approved' (novo/em linha). Outro veredito: so relata.
 * Nunca apaga nada. Guardas otimistas: so grava se o estado ainda e o lido.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { evaluateCatalogGate, toPersistedGate, type PersistedGate } from '../src/lib/catalog/gate';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const por = argv.indexOf('--por') >= 0 ? argv[argv.indexOf('--por') + 1] : '';
const rb = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');

const RETIPAR = ['4704eddc'];
const RESTAURAR_FOTO_MAO = ['b0996ccb'];
const QUARENTENAR = ['95ea41a5'];
const NULOS = ['89177877', '613b1201', 'f9502f26', '20980d7b', '96b98a87'];

const BACKUP_FOTO = 'docs/backups/foto-com-mao-2026-11-14T11-53-53-158Z.ndjson';

type Log = {
  criadoEm: string; por: string; backup: string;
  retipados: Array<{ id: string; antes: string; depois: string }>;
  restaurados: Array<{ id: string; antes: PersistedGate | null; depois: PersistedGate }>;
  quarentenados: Array<{ id: string; antes: string | null }>;
  porteiro: Array<{ id: string; antes: PersistedGate | null; depois: PersistedGate }>;
};

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (rb >= 0) {
      const log = JSON.parse(fs.readFileSync(argv[rb + 1]!, 'utf8')) as Log;
      console.log(`rollback: ${log.retipados.length} tipos, ${log.restaurados.length} restauros, ${log.quarentenados.length} quarentenas, ${log.porteiro.length} vereditos`);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      await sql.begin(async (tx) => {
        for (const r of log.retipados) await tx`UPDATE master_products SET product_type = ${r.antes}::product_type, updated_at = now() WHERE id = ${r.id}::uuid AND product_type = ${r.depois}::product_type`;
        for (const g of [...log.restaurados, ...log.porteiro]) {
          if (g.antes) await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${JSON.stringify(g.antes)}::text::jsonb, true) WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
          else await tx`UPDATE master_products SET attributes = attributes - 'catalogGate' WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
        }
        for (const q of log.quarentenados) await tx`UPDATE affiliate_offers SET quarantined_at = ${q.antes}::timestamptz, updated_at = now() WHERE id = ${q.id}::uuid AND quarantined_at IS NOT NULL`;
      });
      return void console.log('ROLLBACK aplicado.');
    }

    const full = async (pre: string, table: 'master_products' | 'affiliate_offers') => {
      const r = await sql<{ id: string }[]>`SELECT id::text AS id FROM ${sql(table)} WHERE id::text LIKE ${pre + '%'}`;
      if (r.length !== 1) throw new Error(`prefixo ${pre} em ${table}: ${r.length} resultados`);
      return r[0]!.id;
    };
    const now = new Date().toISOString();
    const log: Log = { criadoEm: now, por: por ?? '', backup: '', retipados: [], restaurados: [], quarentenados: [], porteiro: [] };
    const backupRows: unknown[] = [];

    // A
    for (const p of RETIPAR) {
      const id = await full(p, 'master_products');
      const [m] = await sql<{ name: string; product_type: string }[]>`SELECT name, product_type::text AS product_type FROM master_products WHERE id = ${id}::uuid`;
      console.log(`A) ${p} "${m!.name}" tipo atual=${m!.product_type} -> console`);
      if (m!.product_type === 'game') { backupRows.push({ acao: 'retipar', id, product_type: 'game' }); log.retipados.push({ id, antes: 'game', depois: 'console' }); }
    }
    // B
    const anteriores = new Map<string, PersistedGate>();
    for (const l of fs.readFileSync(BACKUP_FOTO, 'utf8').split('\n').filter(Boolean)) { const j = JSON.parse(l); anteriores.set(j.id, j.catalogGateAnterior); }
    for (const p of RESTAURAR_FOTO_MAO) {
      const id = await full(p, 'master_products');
      const [m] = await sql<{ name: string; gate: PersistedGate | null }[]>`SELECT name, attributes -> 'catalogGate' AS gate FROM master_products WHERE id = ${id}::uuid`;
      const ant = anteriores.get(id);
      console.log(`B) ${p} gate=${m!.gate?.verdict}/${m!.gate?.reason} -> restaurar ${ant?.verdict}/${ant?.reason}`);
      if (m!.gate?.reason === 'foto_com_mao' && !m!.gate.manual && ant) { backupRows.push({ acao: 'restaurar', id, catalogGate: m!.gate }); log.restaurados.push({ id, antes: m!.gate, depois: { ...ant, at: now } as PersistedGate }); }
    }
    // C
    for (const p of QUARENTENAR) {
      const id = await full(p, 'affiliate_offers');
      const [o] = await sql<{ title: string; q: string | null }[]>`SELECT title, quarantined_at::text AS q FROM affiliate_offers WHERE id = ${id}::uuid`;
      console.log(`C) ${p} "${o!.title}" quarentena atual=${o!.q ?? '-'} -> quarentenar`);
      if (!o!.q) { backupRows.push({ acao: 'quarentenar', id, quarantined_at: null }); log.quarentenados.push({ id, antes: null }); }
    }
    // D
    for (const p of NULOS) {
      const id = await full(p, 'master_products');
      const [m] = await sql<{ name: string; product_type: string; gf: string | null; gen: string | null; gate: PersistedGate | null; titles: string[] | null; med: string | null }[]>`
        SELECT m.name, m.product_type::text AS product_type, m.game_format::text AS gf, m.game_platform_gen::text AS gen, m.attributes -> 'catalogGate' AS gate,
          (SELECT array_agg(DISTINCT o.title) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS titles,
          (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0)::text AS med
        FROM master_products m WHERE m.id = ${id}::uuid`;
      const res = evaluateCatalogGate({ name: m!.name, productType: m!.product_type as never, gameFormat: m!.gf, gamePlatformGen: m!.gen, offerTitles: m!.titles ?? [], medianPriceCents: m!.med == null ? null : Math.round(Number(m!.med)), manual: null } as never);
      console.log(`D) ${p} gate atual=${m!.gate?.verdict ?? 'NULL'} | porteiro=${res.verdict}/${res.category}/${res.reason} | ${m!.name.slice(0, 70)}`);
      if (!m!.gate && res.verdict === 'approved') {
        const depois = { ...toPersistedGate(res, now), approvedBy: 'porteiro:jogobarato-2026-11-15' } as unknown as PersistedGate;
        backupRows.push({ acao: 'porteiro', id, catalogGate: null }); log.porteiro.push({ id, antes: null, depois });
      }
    }

    console.log(`\nA gravar: ${log.retipados.length} tipos, ${log.restaurados.length} restauros, ${log.quarentenados.length} quarentenas, ${log.porteiro.length} vereditos`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply --por "Nome".');
    if (!por) throw new Error('--por "Nome" e obrigatorio com --apply');
    const bk = path.join(DIR, `itens-jogobarato-${stamp}.ndjson`);
    fs.writeFileSync(bk, backupRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    log.backup = path.basename(bk);
    await sql.begin(async (tx) => {
      for (const r of log.retipados) await tx`UPDATE master_products SET product_type = 'console'::product_type, updated_at = now() WHERE id = ${r.id}::uuid AND product_type = 'game'::product_type`;
      for (const g of [...log.restaurados, ...log.porteiro]) await tx`UPDATE master_products SET attributes = jsonb_set(COALESCE(attributes, '{}'::jsonb), '{catalogGate}', ${JSON.stringify(g.depois)}::text::jsonb, true) WHERE id = ${g.id}::uuid AND COALESCE(attributes -> 'catalogGate', 'null'::jsonb) = COALESCE(${g.antes ? JSON.stringify(g.antes) : null}::text::jsonb, 'null'::jsonb)`;
      for (const q of log.quarentenados) await tx`UPDATE affiliate_offers SET quarantined_at = now(), updated_at = now() WHERE id = ${q.id}::uuid AND quarantined_at IS NULL`;
    });
    const lf = path.join(DIR, `itens-jogobarato-log-${stamp}.json`);
    fs.writeFileSync(lf, JSON.stringify({ ...log, rollback: `npx tsx --conditions react-server --env-file=.env.local scripts/corrigir-itens-jogobarato-2026-11-15.ts --rollback docs/backups/${path.basename(lf)} --apply` }, null, 2));
    console.log(`GRAVADO. backup: ${bk} | log: ${lf}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
