/**
 * Aplica o PORTEIRO DO CATALOGO (src/lib/catalog/gate.ts) aos masters existentes.
 * Grava SO master_products.attributes -> catalogGate (jsonb_set). NUNCA apaga nada,
 * nunca toca em ofertas, cotacoes ou historico. Reversivel (log com o valor anterior).
 *
 *   npx tsx --conditions react-server scripts/apply-catalog-gate.ts            # dry-run (padrao)
 *   npx tsx --conditions react-server scripts/apply-catalog-gate.ts --apply    # grava (backup + transacao)
 *   npx tsx --conditions react-server scripts/apply-catalog-gate.ts --revert backup/dados/catalog-gate-log-<ts>.json
 *
 * Veredito humano (attributes.catalogGate.manual) e preservado e vence o automatico.
 * Depois de --apply, as paginas publicas refletem em ate 5 min (cache 'affiliate-offers').
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { evaluateCatalogGate, toPersistedGate, GATE_VERSION, type GateVerdict, type PersistedGate } from '../src/lib/catalog/gate';
import { classifyCatalogItem, titleLeadsWithAccessory } from '../src/lib/catalog/dimensions';
import { reconcilePlatform } from '../src/lib/catalog/platform';
import { isSameProduct, normalizeTitle } from '../src/lib/affiliate/dedup';
import { detectNonGameByRules } from '../src/lib/affiliate/product-type-classifier';
import type { ProductType } from '../src/db/schema';

const APPLY = process.argv.includes('--apply');
const revertIdx = process.argv.indexOf('--revert');
/** QA rodada 4 (P1-A): corrige plataforma (titulo so cita legado: Wii, PS2, PSP...) e, nos ids listados, o tipo. */
const RECLASS = process.argv.includes('--reclass');
const reclassTypeIds = new Set((process.argv.find((a) => a.startsWith('--reclass-type-ids='))?.split('=')[1] ?? '').split(',').filter(Boolean));
const ROOT = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

interface Row {
  id: string;
  name: string;
  product_type: ProductType;
  game_format: string | null;
  game_platform_gen: string | null;
  gate: PersistedGate | null;
  titles: string[] | null;
  median_cents: string | number | null;
  active_offers: string | number;
  min_cents: string | number | null;
}

const csv = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function revert(file: string) {
  const sql = connect();
  try {
    const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as {
      changes?: Array<{ id: string; before: PersistedGate | null }>;
      reclass?: Array<{ id: string; before: { game_platform_gen: string; product_type: string } }>;
      offerMoves?: Array<{ id: string; from_id: string }>;
    };
    await sql.begin(async (tx) => {
      for (const m of log.offerMoves ?? []) await tx`UPDATE affiliate_offers SET master_product_id = ${m.from_id} WHERE id = ${m.id}`;
      for (const c of log.reclass ?? []) {
        await tx`UPDATE master_products SET game_platform_gen = ${c.before.game_platform_gen}::game_platform_gen, product_type = ${c.before.product_type}::product_type WHERE id = ${c.id}`;
      }
      for (const c of log.changes ?? []) {
        if (c.before) {
          await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${tx.json(c.before as never)}::jsonb, true) WHERE id = ${c.id}`;
        } else {
          await tx`UPDATE master_products SET attributes = attributes - 'catalogGate' WHERE id = ${c.id}`;
        }
      }
    });
    console.log(`Revertidos ${(log.changes ?? []).length} vereditos e ${(log.reclass ?? []).length} reclassificacoes a partir de ${file}.`);
  } finally {
    await sql.end();
  }
}

async function main() {
  if (revertIdx >= 0) return revert(process.argv[revertIdx + 1]);
  const sql = connect();
  try {
    const rows = await sql<Row[]>`
      WITH agg AS (
        SELECT o.master_product_id,
               array_agg(DISTINCT o.title) AS titles,
               count(*) AS active_offers,
               min(o.current_price_cents) FILTER (WHERE o.current_price_cents > 0) AS min_cents,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY o.current_price_cents) FILTER (WHERE o.current_price_cents > 0) AS median_cents
        FROM affiliate_offers o WHERE o.status = 'active' GROUP BY o.master_product_id
      )
      SELECT m.id, m.name, m.product_type::text AS product_type, m.game_format::text AS game_format,
             m.game_platform_gen::text AS game_platform_gen, m.attributes -> 'catalogGate' AS gate,
             a.titles, a.median_cents, COALESCE(a.active_offers, 0) AS active_offers, a.min_cents
      FROM master_products m LEFT JOIN agg a ON a.master_product_id = m.id
      WHERE NOT (m.attributes ? 'mergedInto')`;

    const now = new Date().toISOString();
    const counts: Record<string, { masters: number; offers: number }> = {};
    const changes: Array<{ id: string; before: PersistedGate | null; after: PersistedGate | null; name: string }> = [];
    const report: string[] = ['verdict;categoria;motivo;trecho;ofertas_ativas;menor_preco_brl;tipo;master_id;nome'];
    let visibleBefore = 0;
    let visibleAfter = 0;
    let offersBefore = 0;
    let offersAfter = 0;

    for (const r of rows) {
      const manual: GateVerdict | null = r.gate?.manual === 'approved' || r.gate?.manual === 'rejected' ? r.gate.manual : null;
      const res = evaluateCatalogGate({
        name: r.name,
        productType: r.product_type,
        gameFormat: r.game_format,
        gamePlatformGen: r.game_platform_gen,
        offerTitles: r.titles ?? [],
        medianPriceCents: r.median_cents == null ? null : Number(r.median_cents),
        manual,
      });
      const active = Number(r.active_offers);
      const key = `${res.verdict}/${res.category}/${res.reason}`;
      (counts[key] ??= { masters: 0, offers: 0 }).masters++;
      counts[key].offers += active;

      const beforeVerdict = r.gate?.verdict ?? 'approved';
      if (beforeVerdict === 'approved') {
        visibleBefore++;
        offersBefore += active;
      }
      if (res.verdict === 'approved') {
        visibleAfter++;
        offersAfter += active;
      }
      if (res.verdict !== 'approved' && active > 0) {
        report.push([res.verdict, res.category, res.reason, res.matched, active, r.min_cents == null ? '' : (Number(r.min_cents) / 100).toFixed(2), r.product_type, r.id, r.name].map(csv).join(';'));
      }

      // grava: veredito nao aprovado; e remove/atualiza quando passou a aprovado e havia veredito antigo
      if (res.verdict !== 'approved') {
        const after = toPersistedGate(res, now, manual);
        if (!r.gate || r.gate.verdict !== after.verdict || r.gate.reason !== after.reason || r.gate.version !== GATE_VERSION) {
          changes.push({ id: r.id, before: r.gate, after, name: r.name });
        }
      } else if (r.gate && r.gate.verdict !== 'approved') {
        changes.push({ id: r.id, before: r.gate, after: manual ? toPersistedGate(res, now, manual) : null, name: r.name });
      }
    }

    // --- Reclassificacao de plataforma/tipo provada pelo titulo (QA rodada 4, P1-A) ---------------
    interface Reclass { id: string; name: string; active: number; before: { game_platform_gen: string; product_type: string }; after: { game_platform_gen: string; product_type: string }; dup?: string; twinId?: string }
    const reclass: Reclass[] = [];
    const modernDiff: string[] = [];
    if (RECLASS) {
      const live = rows.filter((r) => Number(r.active_offers) >= 0);
      for (const r of live) {
        const gen = r.game_platform_gen ?? 'unknown';
        const rp = reconcilePlatform(gen as never, r.name);
        let newGen = gen;
        if (rp !== gen) {
          if (rp === 'unknown') newGen = 'unknown'; // titulo so cita legado (enum nao tem Wii/PS2): unico valor valido
          else modernDiff.push(`${r.id};${gen}->${rp};${r.active_offers};${r.name}`); // so reportado, nao aplicado
        }
        let newType: string = r.product_type;
        // QA rodada 5: titulo que COMECA pelo acessorio (Controle/Joystick/Base vertical...) e game/console gravado => accessory
        if ((r.product_type === 'game' || r.product_type === 'console') && titleLeadsWithAccessory(r.name) && classifyCatalogItem(r.name, r.product_type).dimension === 'accessory') newType = 'accessory';
        if (reclassTypeIds.has(r.id)) {
          const dim = classifyCatalogItem(r.name, r.product_type).dimension;
          const rule = detectNonGameByRules(r.name)?.productType;
          // so troca quando as duas regras de titulo concordam e o destino e game/console/accessory
          if ((dim === 'game' || dim === 'console' || dim === 'accessory') && dim !== r.product_type && (rule === dim || dim === 'game')) newType = dim;
        }
        if (newGen !== gen || newType !== r.product_type) {
          reclass.push({ id: r.id, name: r.name, active: Number(r.active_offers), before: { game_platform_gen: gen, product_type: r.product_type }, after: { game_platform_gen: newGen, product_type: newType } });
        }
      }
      // duplicata: outro master (nao fundido) ja existente com mesma plataforma/tipo finais e mesmo produto => NAO aplica, so reporta
      const norm = new Map(rows.map((r) => [r.id, normalizeTitle(r.name, { productType: r.product_type, gameFormat: r.game_format })]));
      for (const c of reclass) {
        const nc = normalizeTitle(c.name, { productType: c.after.product_type as ProductType, gameFormat: rows.find((r) => r.id === c.id)?.game_format });
        const twin = rows.find((o) => o.id !== c.id && o.product_type === c.after.product_type && (o.game_platform_gen ?? 'unknown') === c.after.game_platform_gen && isSameProduct(nc, norm.get(o.id)!));
        if (twin) { c.dup = `${twin.id} ${twin.name}`; c.twinId = twin.id; }
      }
    }

    console.log(APPLY ? 'MODO: APPLY' : 'MODO: DRY-RUN (nada sera gravado)');
    console.log(`Masters avaliados: ${rows.length}`);
    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1].masters - a[1].masters)) {
      console.log(`  ${String(v.masters).padStart(5)} masters ${String(v.offers).padStart(6)} ofertas ativas  ${k}`);
    }
    console.log(`Visiveis antes (veredito gravado): ${visibleBefore} masters / ${offersBefore} ofertas ativas`);
    console.log(`Visiveis depois (porteiro):        ${visibleAfter} masters / ${offersAfter} ofertas ativas`);
    console.log(`Masters a alterar (attributes.catalogGate): ${changes.length}`);

    fs.mkdirSync(path.join(ROOT, 'backup', 'dados'), { recursive: true });
    const reportFile = path.join(ROOT, 'docs', `porteiro-catalogo-${APPLY ? 'aplicado' : 'dryrun'}-2026-11-02.csv`);
    fs.writeFileSync(reportFile, '﻿' + report.join('\n') + '\n', 'utf8');
    console.log(`Relatorio (masters fora do publico com oferta ativa): ${path.relative(ROOT, reportFile)} (${report.length - 1} linhas)`);

    if (RECLASS) {
      console.log(`Reclassificacao (--reclass): ${reclass.length} masters (${reclass.filter((c) => c.dup).length} com duplicata, nao aplicados); mudancas moderna->moderna so reportadas: ${modernDiff.length}`);
      for (const c of reclass) console.log(`  ${c.id} [${c.active} ofertas] ${c.before.game_platform_gen}/${c.before.product_type} -> ${c.after.game_platform_gen}/${c.after.product_type}${c.dup ? '  DUPLICATA de ' + c.dup : ''} | ${c.name}`);
      fs.writeFileSync(path.join(ROOT, 'docs', 'plataforma-moderna-divergente-2026-11-03.csv'), ['master_id;gravada->titulo;ofertas_ativas;nome', ...modernDiff].join(String.fromCharCode(10)) + String.fromCharCode(10), 'utf8');
    }

    if (!APPLY) return;
    const toReclass = reclass.filter((c) => !c.dup);
    // duplicata exata (mesmo produto ja cadastrado): reaponta as ofertas ativas para o master existente, com log; master de origem fica sem ofertas, intocado
    const dupMasters = reclass.filter((c) => c.dup && c.twinId);
    const offerMoves = dupMasters.length
      ? await sql<{ id: string; from_id: string; to_id: string }[]>`SELECT o.id, o.master_product_id AS from_id, o.master_product_id AS to_id FROM affiliate_offers o WHERE o.master_product_id = ANY(${dupMasters.map((d) => d.id)}::uuid[])`
      : [];
    for (const m of offerMoves) m.to_id = dupMasters.find((d) => d.id === m.from_id)!.twinId!;
    if (!changes.length && !toReclass.length && !offerMoves.length) return console.log('Nada a gravar.');

    // backup: attributes completos dos masters que serao tocados + log reversivel
    const ids = [...new Set([...changes.map((c) => c.id), ...toReclass.map((c) => c.id), ...dupMasters.map((c) => c.id), ...dupMasters.map((c) => c.twinId!)])];
    const before = await sql<{ id: string; attributes: unknown }[]>`SELECT id, attributes FROM master_products WHERE id = ANY(${ids}::uuid[])`;
    const backupFile = path.join(ROOT, 'backup', 'dados', `catalog-gate-backup-${stamp}.ndjson`);
    fs.writeFileSync(backupFile, before.map((b) => JSON.stringify(b)).join('\n') + '\n', 'utf8');
    const logFile = path.join(ROOT, 'backup', 'dados', `catalog-gate-log-${stamp}.json`);
    fs.writeFileSync(
      logFile,
      JSON.stringify({ at: now, version: GATE_VERSION, changes: changes.map((c) => ({ id: c.id, name: c.name, before: c.before, after: c.after })), reclass: toReclass, offerMoves }, null, 1),
      'utf8',
    );

    await sql.begin(async (tx) => {
      for (const m of offerMoves) await tx`UPDATE affiliate_offers SET master_product_id = ${m.to_id} WHERE id = ${m.id}`;
      for (const c of toReclass) {
        await tx`UPDATE master_products SET game_platform_gen = ${c.after.game_platform_gen}::game_platform_gen, product_type = ${c.after.product_type}::product_type WHERE id = ${c.id}`;
      }
      for (const c of changes) {
        if (c.after) {
          await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${tx.json(c.after as never)}::jsonb, true) WHERE id = ${c.id}`;
        } else {
          await tx`UPDATE master_products SET attributes = attributes - 'catalogGate' WHERE id = ${c.id}`;
        }
      }
    });
    console.log(`Gravado em ${changes.length} masters (veredito) e ${toReclass.length} (plataforma/tipo). Backup: ${path.relative(ROOT, backupFile)}; log reversivel: ${path.relative(ROOT, logFile)}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
