/**
 * C10 (dono, 2026-11-14): revisões ambíguas decididas POR REGRA, com dry-run, backup e rollback.
 *   G1 consoles ambíguos           -> fora (catalogGate rejected, motivo console_ambiguo_fora:<motivo>); só aparelho confirmado entra.
 *   G2 jogos tipados como console  -> viram JOGO (product_type='game', plataforma pelo título, veredito do porteiro) quando o título é de jogo
 *                                     com plataforma conhecida; senão fora (rejected, console_tipo_errado_sem_plataforma).
 *   G3 itens miúdos ambíguos       -> fora (rejected, item_miudo_ambiguo_fora:<motivo>).
 * Nunca toca master com decisão humana (catalogGate.manual), já rejeitado ou mesclado. Nunca apaga master/oferta/cotação/histórico.
 *
 *   npx tsx --env-file=.env.local scripts/aplicar-revisoes-ambiguas-2026-11-14.ts                       # dry-run (amostras por grupo)
 *   npx tsx --env-file=.env.local scripts/aplicar-revisoes-ambiguas-2026-11-14.ts --apply --por "Nome"  # grava (backup NDJSON + log antes)
 *   npx tsx --env-file=.env.local scripts/aplicar-revisoes-ambiguas-2026-11-14.ts --rollback docs/backups/revisoes-ambiguas-log-<ts>.json [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { avaliarConsoleVideoGame } from '../src/lib/catalog/console-videogame';
import { avaliarItemMiudo } from '../src/lib/catalog/item-miudo';
import { derivePlatformFromTitle } from '../src/lib/affiliate/game-classification';
import { evaluateCatalogGate, toPersistedGate, GATE_VERSION, type PersistedGate } from '../src/lib/catalog/gate';

const argv = process.argv.slice(2);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = argv.includes('--apply');
const POR = arg('--por') ?? '';
const RB = arg('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const APPROVED_BY = 'bloco:c10:2026-11-14';

type Mud = {
  id: string; titulo: string; grupo: 'G1' | 'G2' | 'G3'; tipoAntes: string; tipoDepois: string; genAntes: string | null; genDepois: string | null;
  gateAntes: PersistedGate | null; gateDepois: PersistedGate; motivo: string;
};

function rejeitado(reason: string, matched: string | null, at: string): PersistedGate {
  return { verdict: 'rejected', category: 'out_of_scope', reason, matched, version: GATE_VERSION, at, approvedBy: APPROVED_BY } as PersistedGate;
}

async function plano(sql: ReturnType<typeof connect>): Promise<Mud[]> {
  const at = new Date().toISOString();
  const rows = await sql<{ id: string; name: string; vertical: string; t: string; gate: PersistedGate | null; plat: string | null; fmt: string | null; n: number; minp: string | number | null; med: string | number | null; titles: string[] | null }[]>`
    SELECT m.id::text AS id, m.name, m.vertical, m.product_type::text AS t, m.attributes -> 'catalogGate' AS gate, m.game_platform_gen::text AS plat, m.game_format::text AS fmt,
      (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS n,
      (SELECT min(o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0) AS minp,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0) AS med,
      (SELECT array_agg(DISTINCT o.title) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS titles
    FROM master_products m WHERE (m.attributes ->> 'mergedInto') IS NULL ORDER BY m.vertical, m.name LIMIT 20000`;
  const out: Mud[] = [];
  for (const r of rows) {
    const g = r.gate;
    if (g?.manual) continue;
    if (g?.verdict === 'rejected') continue;
    const preco = r.minp == null ? null : Number(r.minp);
    if (r.t === 'console') {
      // O mesmo critério de "liberado" da limpeza de console: sem veredito ou approved.
      if (g && g.verdict !== 'approved') continue;
      const x = avaliarConsoleVideoGame(r.name, preco, { plataforma: r.plat });
      if (x.veredito === 'sim' || (x.veredito === 'nao' && x.forte)) continue;
      if (x.veredito === 'ambiguo') {
        out.push({ id: r.id, titulo: r.name, grupo: 'G1', tipoAntes: 'console', tipoDepois: 'console', genAntes: r.plat, genDepois: r.plat, gateAntes: g, gateDepois: rejeitado(`console_ambiguo_fora:${x.motivo}`, x.termo, at), motivo: `console_ambiguo_fora:${x.motivo}` });
        continue;
      }
      // 'nao' sem prova forte = jogo (ou item) tipado como console.
      const mi = avaliarItemMiudo(r.name, preco, 'game', 'games');
      const gen = derivePlatformFromTitle(r.name);
      if (mi.veredito === 'nao' && gen && gen !== 'unknown' && !NAO_JOGO.test(r.name)) {
        const manual = null;
        const res = evaluateCatalogGate({ name: r.name, productType: 'game', gameFormat: r.fmt as never, gamePlatformGen: gen as never, offerTitles: r.titles ?? [], medianPriceCents: r.med == null ? null : Number(r.med), manual });
        const depois = { ...toPersistedGate(res, at, manual), approvedBy: APPROVED_BY } as PersistedGate;
        out.push({ id: r.id, titulo: r.name, grupo: 'G2', tipoAntes: 'console', tipoDepois: 'game', genAntes: r.plat, genDepois: r.plat && r.plat !== 'unknown' ? r.plat : gen, gateAntes: g, gateDepois: depois, motivo: `vira_jogo:${gen}:${res.verdict}` });
      } else {
        out.push({ id: r.id, titulo: r.name, grupo: 'G2', tipoAntes: 'console', tipoDepois: 'console', genAntes: r.plat, genDepois: r.plat, gateAntes: g, gateDepois: rejeitado('console_tipo_errado_sem_plataforma', x.termo, at), motivo: 'fora:console_tipo_errado_sem_plataforma' });
      }
      continue;
    }
    // G3: item miúdo ambíguo (liberado = sem veredito, approved ou review).
    if (g && !(g.verdict === 'approved' || g.verdict === 'review')) continue;
    const m = avaliarItemMiudo(r.name, preco, r.t, r.vertical, { plataforma: r.plat });
    if (m.veredito === 'ambiguo') {
      out.push({ id: r.id, titulo: r.name, grupo: 'G3', tipoAntes: r.t, tipoDepois: r.t, genAntes: r.plat, genDepois: r.plat, gateAntes: g, gateDepois: rejeitado(`item_miudo_ambiguo_fora:${m.motivo}`, m.termo, at), motivo: `item_miudo_ambiguo_fora:${m.motivo}` });
    }
  }
  return out;
}

/** Título de revista, card, pôster, livro, boneco e afins: nunca vira jogo (fica fora). */
const NAO_JOGO = /(revista|magazine|issues?|cards?|posters?|livros?|guia|figures?|figuras?|funko|chaveiro|camiseta|quadro|miniatura|colecionavel|artbook|trilha sonora|cartas?)/i;
const por = <T>(a: T[], f: (x: T) => string) => a.reduce<Record<string, number>>((r, x) => { const k = f(x); r[k] = (r[k] ?? 0) + 1; return r; }, {});

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (RB) {
      const log = JSON.parse(fs.readFileSync(path.resolve(RB), 'utf8')) as { gravados: Mud[] };
      console.log('a restaurar:', log.gravados.length);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      let n = 0;
      for (const m of log.gravados) {
        const r = await sql`UPDATE master_products SET product_type = ${m.tipoAntes}::product_type, game_platform_gen = ${m.genAntes}::game_platform_gen,
            attributes = CASE WHEN ${m.gateAntes ? JSON.stringify(m.gateAntes) : null}::text IS NULL THEN attributes - 'catalogGate' ELSE jsonb_set(attributes, '{catalogGate}', ${JSON.stringify(m.gateAntes)}::text::jsonb, true) END
          WHERE id = ${m.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${m.gateDepois.at} AND attributes -> 'catalogGate' ->> 'approvedBy' = ${APPROVED_BY}`;
        n += r.count;
      }
      return void console.log('ROLLBACK aplicado:', n);
    }
    const p = await plano(sql);
    console.log('Plano por grupo/destino:', JSON.stringify(por(p, (x) => `${x.grupo}:${x.motivo.split(':').slice(0, 2).join(':')}`)));
    for (const g of ['G1', 'G2', 'G3'] as const) {
      const l = p.filter((x) => x.grupo === g);
      console.log(`\n${g}: ${l.length}`);
      for (const x of l.slice(0, 12)) console.log(`  ${x.id.slice(0, 8)} | ${x.motivo} | ${x.titulo.slice(0, 90)}`);
    }
    if (!APPLY) return void console.log('\nDRY-RUN: nada gravado. Use --apply --por "Nome".');
    if (!POR) throw new Error('--por "Nome" é obrigatório com --apply');
    const bk = path.join(DIR, `revisoes-ambiguas-${stamp}.ndjson`);
    fs.writeFileSync(bk, p.map((m) => JSON.stringify({ id: m.id, titulo: m.titulo, tipoAntes: m.tipoAntes, genAntes: m.genAntes, catalogGateAntes: m.gateAntes })).join('\n') + '\n');
    const gravados: Mud[] = [];
    for (let i = 0; i < p.length; i += 20) {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = '60s'`;
        for (const m of p.slice(i, i + 20)) {
          const antes = m.gateAntes ? JSON.stringify(m.gateAntes) : null;
          const r = await tx`UPDATE master_products SET product_type = ${m.tipoDepois}::product_type, game_platform_gen = ${m.genDepois}::game_platform_gen,
              attributes = jsonb_set(COALESCE(attributes, '{}'::jsonb), '{catalogGate}', ${JSON.stringify(m.gateDepois)}::text::jsonb, true)
            WHERE id = ${m.id}::uuid AND COALESCE(attributes -> 'catalogGate', 'null'::jsonb) = COALESCE(${antes}::text::jsonb, 'null'::jsonb)`;
          if (r.count) gravados.push(m);
        }
      });
    }
    const logFile = path.join(DIR, `revisoes-ambiguas-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: new Date().toISOString(), por: POR, backup: path.basename(bk), gravados, rollback: `npx tsx --env-file=.env.local scripts/aplicar-revisoes-ambiguas-2026-11-14.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 1));
    console.log(`GRAVADOS ${gravados.length}/${p.length} | backup ${bk} | log ${logFile}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
