/**
 * Consolida os masters duplicados "Nintendo Switch 2 + Mario Kart World" (dono autorizou em 2026-11-15) no master canonico 4704eddc.
 * Duplicados: 374675ec e 4013d841. Mesmo produto (console Switch 2 + jogo Mario Kart World, preto, 256 GB); NAO mistura bundle com NSO/assinatura,
 * edicao de outra regiao (Hong Kong/importado) nem edicao diferente: se algum titulo de oferta indicar isso, a execucao ABORTA.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/consolidar-switch2-mkw-2026-11-15.ts                # dry-run (padrao)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/consolidar-switch2-mkw-2026-11-15.ts --apply --por "Nome"
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/consolidar-switch2-mkw-2026-11-15.ts --rollback docs/backups/consolidar-switch2-mkw-log-<ts>.json [--apply]
 *
 * O que faz (nada e apagado):
 *  1. Por duplicado, numa transacao curta: trava os masters (FOR UPDATE), reaponta ofertas (todas, ativas e expiradas), watches (onde o usuario ja
 *     monitora o canonico, desativa), products e conversions; reaponta price_daily_offer das ofertas movidas (historico por oferta fica com a oferta);
 *     marca o duplicado como arquivado (attributes.mergedInto/archived/mergedAt, como scripts/merge-duplicate-masters.ts). As linhas de
 *     price_daily_state/price_min_events do duplicado ficam onde estao (historico do arquivado).
 *  2. Recalcula price_daily_offer e price_daily_state do canonico (mesmo codigo do job: upsertOfferDays + computeStatesForBatch + upsertStates).
 *  3. Slugs antigos: as paginas publicas sao por slug de OFERTA (preservado). O link /monitoramento/comparar/<id-antigo> redireciona ao canonico
 *     (mergedInto). Nao existe rota publica por slug de master.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { spDay } from '@/lib/pricing/daily-state';
import { computeStatesForBatch, upsertOfferDays, upsertStates } from '@/server/pricing/price-daily';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const por = argv.indexOf('--por') >= 0 ? argv[argv.indexOf('--por') + 1] : '';
const rb = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const CANON = '4704eddc';
const DUPS = ['374675ec', '4013d841'];
/** Sinais de produto/edicao diferente: assinatura NSO, importado/regiao, outro jogo no bundle, usado. */
const DIFERENTE = /(\bnso\b|assinatura|meses|3 ?m[eê]s|online|hong ?kong|hkg|import|japan|jap[aã]o|\bjpn\b|ea sports|fc ?2\d|pok[eé]mon|usado|seminovo)/i;

type Row = Record<string, unknown>;
type Tx = Pick<typeof db, 'execute'>;
const FKS = [
  { table: 'affiliate_offers', col: 'master_product_id' },
  { table: 'products', col: 'master_product_id' },
  { table: 'affiliate_conversions', col: 'master_product_id' },
] as const;

interface Log {
  criadoEm: string; por: string; canonical: string; from: string; backup: string; status: string;
  merged: Array<{ masterId: string; moved: Record<string, string[]>; watchesMoved: string[]; watchesDeactivated: string[]; offerDaysMoved: number }>;
  estados: { from: string; ate: string; backupState: string; backupOffer: string };
}

/** Lista de uuids como ARRAY[...] (o drizzle expande arrays JS em tupla). */
const arr = (ids: string[]) => sql`ARRAY[${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}]::uuid[]`;
const rowsOf = async (tx: Tx, q: ReturnType<typeof sql>) => (await tx.execute<{ j: unknown }>(q)).map((r) => r.j);

async function fullId(tx: Tx, pre: string): Promise<string> {
  const r = await tx.execute<{ id: string }>(sql`SELECT id::text AS id FROM master_products WHERE id::text LIKE ${pre + '%'}`);
  if (r.length !== 1) throw new Error(`prefixo ${pre}: ${r.length} masters`);
  return r[0]!.id;
}

async function resumo(tx: Tx, id: string) {
  const r = await tx.execute<Row>(sql`
    SELECT count(*) FILTER (WHERE status = 'active')::int AS ativas, count(*)::int AS total,
           count(*) FILTER (WHERE status = 'active' AND quarantined_at IS NULL)::int AS ativas_visiveis,
           min(current_price_cents) FILTER (WHERE status = 'active' AND quarantined_at IS NULL AND current_price_cents > 0)::int AS menor
    FROM affiliate_offers WHERE master_product_id = ${id}::uuid`);
  return r[0]!;
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  if (rb >= 0) return rollback(argv[rb + 1]!);
  const canon = await fullId(db, CANON);
  const dups = await Promise.all(DUPS.map((d) => fullId(db, d)));
  const all = [canon, ...dups];

  // Pre-condicoes: aprovados, console, mesma plataforma, nao arquivados; nenhum titulo indica produto/edicao diferente.
  const ms = await db.execute<Row>(sql`SELECT id::text AS id, name, product_type::text AS tipo, game_platform_gen::text AS gen, attributes ->> 'mergedInto' AS merged,
      attributes -> 'catalogGate' ->> 'verdict' AS gate FROM master_products WHERE id = ANY(${arr(all)})`);
  for (const m of ms) {
    console.log(`  ${String(m.id).slice(0, 8)} ${m.tipo}/${m.gen} gate=${m.gate} "${m.name}"${m.merged ? ' [ARQUIVADO]' : ''}`);
    if (m.merged || m.tipo !== 'console' || m.gen !== 'switch_2' || m.gate === 'rejected' || m.gate === 'review') throw new Error(`master ${m.id} fora das pre-condicoes`);
  }
  const titulos = await db.execute<{ id: string; title: string; status: string; master: string }>(sql`SELECT id::text AS id, title, status::text AS status, master_product_id::text AS master FROM affiliate_offers WHERE master_product_id = ANY(${arr(all)})`);
  const suspeitos = titulos.filter((t) => DIFERENTE.test(t.title));
  console.log(`Ofertas nos 3 masters: ${titulos.length}; titulos com sinal de edicao/produto diferente: ${suspeitos.length}`);
  for (const s of suspeitos) console.log(`  SUSPEITO ${s.master.slice(0, 8)} ${s.status} ${s.id.slice(0, 8)} ${s.title}`);
  if (suspeitos.length) throw new Error('ha titulos que indicam produto diferente: nada foi feito; revise antes de consolidar');

  console.log('ANTES canonico:', await resumo(db, canon));
  for (const d of dups) console.log(`ANTES ${d.slice(0, 8)}:`, await resumo(db, d));

  const [{ d0 }] = (await db.execute<{ d0: string }>(sql`SELECT least(
      (SELECT min(day) FROM price_daily_state WHERE master_product_id = ANY(${arr(all)}) AND quality <> 'legacy'),
      (SELECT min(day) FROM price_daily_offer WHERE master_product_id = ANY(${arr(all)}))
    )::text AS d0`)) as unknown as Array<{ d0: string }>;
  const FROM = d0 ?? '2026-10-31';
  const today = spDay(new Date());
  console.log(`Estados a recalcular: ${FROM} a ${today}`);
  if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply --por "Nome".');
  if (!por) throw new Error('--por "Nome" e obrigatorio com --apply');

  // Backup NDJSON ANTES de gravar
  const bkFile = path.join(DIR, `consolidar-switch2-mkw-${stamp}.ndjson`);
  const lines: string[] = [];
  for (const d of dups) {
    for (const fk of FKS) for (const r of await rowsOf(db, sql`SELECT to_jsonb(t) AS j FROM ${sql.raw(fk.table)} t WHERE ${sql.raw(fk.col)} = ${d}::uuid`)) lines.push(JSON.stringify({ tabela: fk.table, linha: r }));
    for (const r of await rowsOf(db, sql`SELECT to_jsonb(t) AS j FROM affiliate_price_watches t WHERE master_product_id = ${d}::uuid`)) lines.push(JSON.stringify({ tabela: 'affiliate_price_watches', linha: r }));
    for (const r of await rowsOf(db, sql`SELECT to_jsonb(t) AS j FROM master_products t WHERE id = ${d}::uuid`)) lines.push(JSON.stringify({ tabela: 'master_products', linha: r }));
  }
  fs.writeFileSync(bkFile, lines.join('\n') + '\n');
  const bkState = path.join(DIR, `consolidar-switch2-mkw-${stamp}-price_daily_state.ndjson`);
  const bkOffer = path.join(DIR, `consolidar-switch2-mkw-${stamp}-price_daily_offer.ndjson`);
  const st = await rowsOf(db, sql`SELECT to_jsonb(t) AS j FROM price_daily_state t WHERE master_product_id = ${canon}::uuid AND day >= ${FROM}::date AND quality <> 'legacy'`);
  const of = await rowsOf(db, sql`SELECT to_jsonb(t) AS j FROM price_daily_offer t WHERE master_product_id = ANY(${arr(all)}) AND day >= ${FROM}::date`);
  fs.writeFileSync(bkState, st.map((x) => JSON.stringify(x)).join('\n') + (st.length ? '\n' : ''));
  fs.writeFileSync(bkOffer, of.map((x) => JSON.stringify(x)).join('\n') + (of.length ? '\n' : ''));

  const log: Log = { criadoEm: new Date().toISOString(), por, canonical: canon, from: FROM, backup: path.basename(bkFile), status: 'pending', merged: [], estados: { from: FROM, ate: today, backupState: path.basename(bkState), backupOffer: path.basename(bkOffer) } };
  const logFile = path.join(DIR, `consolidar-switch2-mkw-log-${stamp}.json`);
  const flush = () => fs.writeFileSync(logFile, JSON.stringify({ ...log, rollback: `npx tsx --conditions=react-server --env-file=.env.local scripts/consolidar-switch2-mkw-2026-11-15.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));

  // 1. Uma transacao curta por duplicado
  for (const dup of dups) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);
      const locked = await tx.execute<{ id: string; merged: string | null }>(sql`SELECT id::text AS id, attributes ->> 'mergedInto' AS merged FROM master_products WHERE id = ANY(${arr([canon, dup])}) FOR UPDATE`);
      if (locked.length !== 2 || locked.some((l) => l.merged)) throw new Error('master arquivado ou ausente desde o plano');
      const moved: Record<string, string[]> = {};
      const watchesMoved: string[] = []; const watchesDeactivated: string[] = [];
      const ws = await tx.execute<{ id: string; user_id: string }>(sql`SELECT id::text AS id, user_id::text AS user_id FROM affiliate_price_watches WHERE master_product_id = ${dup}::uuid`);
      for (const w of ws) {
        const ex = await tx.execute(sql`SELECT 1 FROM affiliate_price_watches WHERE user_id = ${w.user_id}::uuid AND master_product_id = ${canon}::uuid`);
        if (ex.length) { await tx.execute(sql`UPDATE affiliate_price_watches SET is_active = false WHERE id = ${w.id}::uuid`); watchesDeactivated.push(w.id); }
        else { await tx.execute(sql`UPDATE affiliate_price_watches SET master_product_id = ${canon}::uuid WHERE id = ${w.id}::uuid`); watchesMoved.push(w.id); }
      }
      for (const fk of FKS) {
        const r = await tx.execute<{ id: string }>(sql`UPDATE ${sql.raw(fk.table)} SET ${sql.raw(fk.col)} = ${canon}::uuid WHERE ${sql.raw(fk.col)} = ${dup}::uuid RETURNING id::text AS id`);
        if (r.length) moved[`${fk.table}.${fk.col}`] = r.map((x) => x.id);
      }
      const offerIds = moved['affiliate_offers.master_product_id'] ?? [];
      let offerDaysMoved = 0;
      if (offerIds.length) {
        const r = await tx.execute(sql`UPDATE price_daily_offer SET master_product_id = ${canon}::uuid WHERE offer_id = ANY(${arr(offerIds)}) AND master_product_id = ${dup}::uuid RETURNING offer_id`);
        offerDaysMoved = r.length;
      }
      const note = { mergedInto: canon, archived: true, mergedAt: new Date().toISOString(), mergedOfferIds: offerIds, mergedWatchIds: watchesMoved, deactivatedWatchIds: watchesDeactivated, mergedBy: por, mergedReason: 'switch2-mario-kart-world-duplicado-2026-11-15' };
      const u = await tx.execute(sql`UPDATE master_products SET attributes = attributes || ${JSON.stringify(note)}::text::jsonb, updated_at = now() WHERE id = ${dup}::uuid AND (attributes ->> 'mergedInto') IS NULL RETURNING id`);
      if (u.length !== 1) throw new Error(`falha ao arquivar ${dup}`);
      for (const fk of FKS) {
        const [{ n }] = (await tx.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM ${sql.raw(fk.table)} WHERE ${sql.raw(fk.col)} = ${dup}::uuid`)) as unknown as Array<{ n: string }>;
        if (Number(n) !== 0) throw new Error(`restaram linhas em ${fk.table} apontando para ${dup}`);
      }
      log.merged.push({ masterId: dup, moved, watchesMoved, watchesDeactivated, offerDaysMoved });
      console.log(`  ${dup.slice(0, 8)} arquivado -> ${canon.slice(0, 8)}: ofertas ${offerIds.length}, price_daily_offer ${offerDaysMoved}, watches ${watchesMoved.length}+${watchesDeactivated.length}`);
    });
    flush();
  }

  // 2. Recalculo dos estados do canonico (mesmo codigo do job)
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
    const offers = await tx.execute<{ id: string }>(sql`SELECT id::text AS id FROM affiliate_offers WHERE master_product_id = ${canon}::uuid`);
    let po = 0;
    for (const o of offers) po += await upsertOfferDays(tx, FROM, today, o.id);
    const { rows } = await computeStatesForBatch(tx, [canon], FROM, today, new Date());
    await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id = ${canon}::uuid AND day >= ${FROM}::date AND quality <> 'legacy'`);
    const n = await upsertStates(tx, rows);
    console.log(`  recalculo: ofertas-dia ${po}, estados gravados ${n}`);
  });
  log.status = 'committed';
  flush();
  console.log('DEPOIS canonico:', await resumo(db, canon));
  for (const d of dups) console.log(`DEPOIS ${d.slice(0, 8)}:`, await resumo(db, d));
  const [ult] = (await db.execute<Row>(sql`SELECT day::text d, min_cents, avg_cents, median_offer_day_cents, n_offers, n_stores, quality FROM price_daily_state WHERE master_product_id = ${canon}::uuid ORDER BY day DESC LIMIT 1`)) as unknown as Row[];
  console.log('Ultimo estado do canonico:', ult);
  console.log(`GRAVADO. backup ${bkFile} | log ${logFile}`);
  process.exit(0);
}

async function rollback(file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Log;
  console.log(`rollback: ${log.merged.length} duplicados, estados de ${log.estados.from}`);
  if (!APPLY) return void console.log('DRY-RUN: use --apply');
  const readNd = (f: string) => { const t = fs.readFileSync(path.join(DIR, f), 'utf8').trim(); return t ? t.split('\n').map((l) => JSON.parse(l)) : []; };
  for (const m of log.merged) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);
      for (const [key, ids] of Object.entries(m.moved)) {
        const [table, col] = key.split('.');
        if (ids.length) await tx.execute(sql`UPDATE ${sql.raw(table!)} SET ${sql.raw(col!)} = ${m.masterId}::uuid WHERE id = ANY(${arr(ids)}) AND ${sql.raw(col!)} = ${log.canonical}::uuid`);
      }
      const offerIds = m.moved['affiliate_offers.master_product_id'] ?? [];
      if (offerIds.length) await tx.execute(sql`UPDATE price_daily_offer SET master_product_id = ${m.masterId}::uuid WHERE offer_id = ANY(${arr(offerIds)}) AND master_product_id = ${log.canonical}::uuid`);
      if (m.watchesMoved.length) await tx.execute(sql`UPDATE affiliate_price_watches SET master_product_id = ${m.masterId}::uuid WHERE id = ANY(${arr(m.watchesMoved)})`);
      if (m.watchesDeactivated.length) await tx.execute(sql`UPDATE affiliate_price_watches SET is_active = true WHERE id = ANY(${arr(m.watchesDeactivated)})`);
      await tx.execute(sql`UPDATE master_products SET attributes = attributes - 'mergedInto' - 'archived' - 'mergedAt' - 'mergedOfferIds' - 'mergedWatchIds' - 'deactivatedWatchIds' - 'mergedBy' - 'mergedReason', updated_at = now() WHERE id = ${m.masterId}::uuid`);
    });
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
    const bkS = readNd(log.estados.backupState); const bkO = readNd(log.estados.backupOffer);
    await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id = ${log.canonical}::uuid AND day >= ${log.estados.from}::date AND quality <> 'legacy'`);
    if (bkS.length) await tx.execute(sql`INSERT INTO price_daily_state SELECT * FROM jsonb_populate_recordset(NULL::price_daily_state, ${JSON.stringify(bkS)}::jsonb)`);
    const offerIds = [...new Set(bkO.map((r: { offer_id: string }) => r.offer_id))];
    if (offerIds.length) {
      await tx.execute(sql`DELETE FROM price_daily_offer WHERE offer_id = ANY(${arr(offerIds)}) AND day >= ${log.estados.from}::date`);
      await tx.execute(sql`INSERT INTO price_daily_offer SELECT * FROM jsonb_populate_recordset(NULL::price_daily_offer, ${JSON.stringify(bkO)}::jsonb)`);
    }
  });
  console.log('ROLLBACK aplicado.');
  process.exit(0);
}

main().catch((e) => { console.error('ERRO:', e instanceof Error ? (e.stack ?? e.message) : e); process.exit(1); });
