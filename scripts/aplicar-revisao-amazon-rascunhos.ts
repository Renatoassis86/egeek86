/**
 * REVISAO das ofertas Amazon fora da media (rascunhos e pausadas) e das ativas que a regra nova recusa (dono, 2026-11-12).
 * Reavalia cada oferta com a regra nova (flex) e propoe: reativar (aceita), mandar para a FILA (duvida/fronteira), descartar (recusa legitima),
 * ou, se ATIVA e agora recusada, devolver a rascunho + pergunta na fila.
 *
 *   Simulacao (padrao, so SELECT):  npx tsx --conditions=react-server --env-file=.env.local scripts/aplicar-revisao-amazon-rascunhos.ts [--out plano.json]
 *   Aplicar (APENAS o dono):         ... --apply     (uma transacao; backup NDJSON antes; recalcula os masters tocados)
 *   Desfazer:                        ... --rollback docs/backups/revisao-amazon-<carimbo>.ndjson
 *
 * Reversivel: o backup guarda o status/published_at anteriores de cada oferta e os ids das perguntas criadas na fila; o rollback devolve os status e
 * remove as perguntas AINDA pendentes criadas por esta passada. Nada e apagado de verdade (descartar = status 'archived').
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { judgeGame, judgeGeneric, prepareGame, prepareGeneric, type AmzCand, type Verdict } from '@/lib/affiliate/amazon-identity';
import { masterFromRow } from '@/server/collector/amazon-assisted';
import { enfileirarDuvidaAmazon } from '@/server/collector/amazon-fila';
import { recalcMasters, type Exec } from '@/server/identity-queue/queue';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes('--apply');
const ROLLBACK = arg('rollback');
const OUT = arg('out');
const rowsOf = <T = Record<string, any>>(r: unknown) => r as unknown as T[];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

type Acao = 'reativar' | 'fila' | 'descartar' | 'ativa_para_fila' | 'manter';
interface Item {
  oid: string; status: string; vertical: string; mid: string; master: string; asin: string; titulo: string; acao: Acao; motivo: string;
  veredito: string; border: boolean; covM?: number; covC?: number; prevPublishedAt: string | null;
}

async function plan(): Promise<Item[]> {
  const am = rowsOf(await db.execute(sql`
    SELECT o.id::text oid, o.status::text status, o.title, o.current_price_cents price, o.external_ref, o.published_at::text published_at,
           m.id::text mid, m.name, m.vertical, m.game_platform_gen gen, m.gtin, m.mpn, m.manufacturer, b.name brand_name,
           m.attributes->'vertical'->>'segment' segment, m.attributes->'vertical'->'catalogAttributes' cat
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id JOIN master_products m ON m.id = o.master_product_id
    LEFT JOIN brands b ON b.id = m.brand_id
    WHERE n.slug = 'amazon' AND o.status IN ('draft', 'paused', 'active') AND o.quarantined_at IS NULL`));
  const out: Item[] = [];
  for (const r of am) {
    const m = masterFromRow(r as never);
    if (!m) continue;
    const c: AmzCand = { a: String(r.external_ref).replace(/^amazon-/, ''), t: r.title, p: 'R$ ' + (Number(r.price) / 100).toFixed(2).replace('.', ','), l: null, s: 0 };
    let v: Verdict;
    let semCtx = false;
    if (m.vertical === 'games') { const ctx = prepareGame({ name: m.name, gen: m.gen }); if (!ctx) { semCtx = true; v = { outcome: 'reject', counter: 'fora_de_linha_ou_retro', reason: 'master_fora_de_linha_ou_sem_plataforma', score: 0 }; } else v = judgeGame(ctx, c, { flex: true }); }
    else v = judgeGeneric(prepareGeneric(m), c, { flex: true });
    let acao: Acao;
    if (r.status === 'draft') acao = v.outcome === 'accept' ? 'reativar' : v.outcome === 'draft' ? 'fila' : 'descartar';
    else if (r.status === 'paused') acao = v.outcome === 'accept' ? 'reativar' : v.outcome === 'draft' ? 'fila' : 'descartar';
    else acao = v.outcome === 'reject' && !semCtx ? 'ativa_para_fila' : 'manter'; // ativa: so mexe se a regra nova recusa (hoje: sequencia/numeral diferente)
    out.push({ oid: r.oid, status: r.status, vertical: m.vertical, mid: r.mid, master: r.name, asin: c.a, titulo: r.title, acao, motivo: v.reason, veredito: `${v.outcome}:${v.counter}`, border: Boolean(v.border), covM: v.covM, covC: v.covC, prevPublishedAt: r.published_at });
  }
  return out;
}

async function main() {
  if (ROLLBACK) return rollback(ROLLBACK);
  const items = await plan();
  const act = items.filter((i) => i.acao !== 'manter');
  const sumary: Record<string, number> = {};
  for (const i of act) sumary[`${i.status}/${i.vertical} -> ${i.acao}`] = (sumary[`${i.status}/${i.vertical} -> ${i.acao}`] ?? 0) + 1;
  console.log(APPLY ? 'APLICANDO' : 'SIMULACAO (nada gravado)', '| ofertas avaliadas:', items.length, '| com acao:', act.length);
  console.log(JSON.stringify(sumary, null, 1));
  for (const i of act.filter((x) => x.acao === 'reativar' || x.acao === 'ativa_para_fila')) console.log(`  ${i.acao}: [${i.status}/${i.vertical}] ${i.master.slice(0, 50)} | ${i.titulo.slice(0, 70)} (${i.motivo})`);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(act, null, 1));
  if (!APPLY) { console.log('Nada foi gravado. Para aplicar (dono): --apply. Para desfazer: --rollback <backup.ndjson>.'); process.exit(0); }

  const dir = path.resolve('docs/backups');
  fs.mkdirSync(dir, { recursive: true });
  const backupFile = path.join(dir, `revisao-amazon-${stamp}.ndjson`);
  const fd = fs.openSync(backupFile, 'w');
  const touched = new Set<string>();
  let filaNovos = 0;
  await db.transaction(async (tx) => {
    const t = tx as unknown as Exec;
    for (const i of act) {
      fs.writeSync(fd, JSON.stringify({ kind: 'oferta', oid: i.oid, prevStatus: i.status, prevPublishedAt: i.prevPublishedAt, acao: i.acao, mid: i.mid }) + '\n');
      if (i.acao === 'reativar') {
        await t.execute(sql`UPDATE affiliate_offers SET status = 'active', published_at = COALESCE(published_at, now()), updated_at = now() WHERE id = ${i.oid}::uuid AND status = ${i.status}::affiliate_offer_status`);
        touched.add(i.mid);
      } else if (i.acao === 'descartar') {
        await t.execute(sql`UPDATE affiliate_offers SET status = 'archived', updated_at = now() WHERE id = ${i.oid}::uuid AND status = ${i.status}::affiliate_offer_status`);
        touched.add(i.mid);
      } else if (i.acao === 'ativa_para_fila' || i.acao === 'fila') {
        if (i.acao === 'ativa_para_fila') {
          await t.execute(sql`UPDATE affiliate_offers SET status = 'draft', updated_at = now() WHERE id = ${i.oid}::uuid AND status = 'active'`);
          touched.add(i.mid);
        }
        const created = await enfileirarDuvidaAmazon(t as never, { offerId: i.oid, masterId: i.mid, masterNome: i.master, vertical: i.vertical, asin: i.asin, titulo: i.titulo, motivo: i.motivo, fronteira: i.border, score: 0, covM: i.covM, covC: i.covC });
        if (created) {
          filaNovos++;
          const it = rowsOf<{ id: string }>(await t.execute(sql`SELECT id::text AS id FROM identity_review_items WHERE offer_id = ${i.oid}::uuid AND axis = 'identidade'`))[0];
          if (it) fs.writeSync(fd, JSON.stringify({ kind: 'item_fila', itemId: it.id, oid: i.oid }) + '\n');
        }
      }
    }
    if (touched.size) await recalcMasters(t, [...touched]);
  });
  fs.closeSync(fd);
  console.log(`Aplicado. Perguntas novas na fila: ${filaNovos}. Masters recalculados: ${touched.size}. Backup: ${backupFile}`);
  process.exit(0);
}

async function rollback(file: string) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>);
  const touched = new Set<string>();
  let restaurados = 0, itens = 0;
  await db.transaction(async (tx) => {
    const t = tx as unknown as Exec;
    for (const l of lines) {
      if (l.kind === 'oferta' && l.setStatus) {
        // So desfaz se a oferta ainda esta no status que ESTA passada deu (se o dono decidiu depois, a decisao dele vale).
        const r = await t.execute(sql`UPDATE affiliate_offers SET status = ${l.prevStatus}::affiliate_offer_status, published_at = ${l.prevPublishedAt}::timestamptz, updated_at = now() WHERE id = ${l.oid}::uuid AND status = ${l.setStatus}::affiliate_offer_status`);
        restaurados += (r as unknown as { count?: number }).count ?? 1;
        touched.add(l.mid);
      } else if (l.kind === 'item_fila') {
        const r = await t.execute(sql`DELETE FROM identity_review_items WHERE id = ${l.itemId}::uuid AND status = 'pending' AND decision_id IS NULL`);
        itens += (r as unknown as { count?: number }).count ?? 0;
      }
    }
    if (touched.size) await recalcMasters(t, [...touched]);
  });
  console.log(`Rollback concluido. Ofertas restauradas: ${restaurados}. Perguntas pendentes removidas: ${itens}. Masters recalculados: ${touched.size}.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
