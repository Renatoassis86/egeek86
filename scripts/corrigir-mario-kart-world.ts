/**
 * Correção pontual e reversível do Mario Kart World (autorização do dono, 2026-11-05; SOMENTE este jogo).
 *  1) master 7ac4d8d5 'Mario Kart World (Switch 2)': game_format 'unknown' -> 'physical' + attributes.formatEvidence =
 *     FORMAT_EVIDENCE_ASSUMED (mesmo padrão de scripts/assumir-fisico-sem-marcador-digital.ts);
 *  2) fusão dos irmãos vazios 241b0817 e 17fd97e2: já arquivados (mergedInto) em 2026-10-31 pelo merge-duplicate-masters;
 *     o script só VERIFICA (0 linhas em qualquer FK, mergedInto = canônico) e não escreve nada;
 *  3) oferta 62efd30a (bundle de console) sai do master do jogo para o master de console existente achado por
 *     findExistingMasterProduct (productType 'console'). Nenhum master é criado. A oferta digital d47bcd1b (draft) NÃO é tocada.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/corrigir-mario-kart-world.ts                 # dry-run
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/corrigir-mario-kart-world.ts --apply         # grava
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/corrigir-mario-kart-world.ts --revert <log> [--apply]
 * Nunca apaga linha; não toca em cotações.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { FORMAT_EVIDENCE_ASSUMED } from '../src/lib/affiliate/game-classification';
import { findExistingMasterProduct } from '../src/lib/affiliate/dedup';

const MK = '7ac4d8d5-65cd-4a19-9e39-4f288a3386e7';
const SIBLINGS = ['241b0817-70af-4a6a-a4e8-c9086f4eeb30', '17fd97e2-15b9-4f4f-bfcb-463275dd21a9'];
const BUNDLE_OFFER = '62efd30a-7cb9-4575-894b-56322f6354bb';
const DIGITAL_DRAFT = 'd47bcd1b-45ac-40ac-ad82-fc67895c011b';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ri = args.indexOf('--revert');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('backup', 'dados');

class DryRun extends Error {}

async function main() {
  const sql = connect();
  try {
    if (ri >= 0) return await revert(sql, args[ri + 1]);
    await sql`SET statement_timeout = '120s'`;

    // Destino da oferta de bundle: o mecanismo oficial de dedup, como console.
    const [off] = await sql<any[]>`select id::text, title, status::text st, master_product_id::text mid from affiliate_offers where id = ${BUNDLE_OFFER}`;
    const dest = await findExistingMasterProduct(off.title, 'switch_2', { productType: 'console' });
    console.log('Destino por findExistingMasterProduct:', dest ? `${dest.id} | ${dest.name} | ${dest.productType}` : 'NENHUM');
    const moveOffer = !!dest && dest.id !== MK && off.mid === MK;
    if (!dest) console.log('Nenhum master serve: a oferta fica onde está.');

    const logFile = path.join(DIR, `mario-kart-world-log-${stamp}.json`);
    const log: any = { criado_em: new Date().toISOString(), escopo: 'Mario Kart World', status: 'pending', colunas: [], movimentos: [], arquivos_backup: {}, verificacoes: {} };

    try {
      await sql.begin(async (tx) => {
        await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
        await tx`SET LOCAL statement_timeout = '120s'`;
        const [{ n: o0 }] = await tx`select count(*)::int n from affiliate_offers`;
        const [{ n: s0 }] = await tx`select count(*)::int n from affiliate_price_snapshots`;
        const [{ n: m0 }] = await tx`select count(*)::int n from master_products`;

        // Backup NDJSON dos registros afetados (antes de escrever)
        const destId = dest?.id as string | undefined;
        const mIds = [MK, ...SIBLINGS, ...(destId ? [destId] : [])];
        const bkMasters = (await tx`select to_jsonb(t) j from master_products t where id = any(${mIds}::uuid[]) order by id`).map((r) => r.j);
        const bkOffers = (await tx`select to_jsonb(t) j from affiliate_offers t where master_product_id = any(${mIds}::uuid[]) or id = ${BUNDLE_OFFER} order by id`).map((r) => r.j);
        const w = (n: string, rows: unknown[]) => {
          const f = path.join(DIR, `mario-kart-world-${stamp}-${n}.ndjson`);
          fs.writeFileSync(f, rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
          return f;
        };
        if (APPLY) log.arquivos_backup = { master_products: w('master_products', bkMasters), affiliate_offers: w('affiliate_offers', bkOffers) };
        console.log(`Backup: ${bkMasters.length} masters, ${bkOffers.length} ofertas`);

        // (2) verificação dos irmãos
        for (const s of SIBLINGS) {
          const [m] = await tx`select attributes->>'mergedInto' mi from master_products where id = ${s}`;
          const [{ n }] = await tx`select (select count(*) from affiliate_offers where master_product_id = ${s}) + (select count(*) from products where master_product_id = ${s}) + (select count(*) from affiliate_price_watches where master_product_id = ${s}) + (select count(*) from affiliate_conversions where master_product_id = ${s}) n`;
          log.verificacoes[s] = { mergedInto: m?.mi, linhasEmFks: Number(n) };
          if (m?.mi !== MK || Number(n) !== 0) throw new Error(`irmão ${s} não está fundido/vazio: exige fusão real (merge-duplicate-masters --pairs)`);
        }

        // (1) formato
        const ev = { formatEvidence: FORMAT_EVIDENCE_ASSUMED, formatEvidenceAt: new Date().toISOString() };
        const u = await tx`update master_products set game_format = 'physical', attributes = attributes || ${tx.json(ev)}, updated_at = now() where id = ${MK} and game_format = 'unknown'`;
        if (u.count !== 1) throw new Error('master Mario Kart World mudou desde o plano');
        log.colunas.push({ master_id: MK, nome: 'Mario Kart World (Switch 2)', de: 'unknown', para: 'physical', motivo: FORMAT_EVIDENCE_ASSUMED, removeAttr: ['formatEvidence', 'formatEvidenceAt'] });

        // (3) oferta de bundle
        if (moveOffer) {
          const [{ n: pdo }] = await tx`select count(*)::int n from price_daily_offer where offer_id = ${BUNDLE_OFFER}`;
          if (pdo > 0) throw new Error('oferta de bundle tem linhas em price_daily_offer; tratar à parte');
          const mv = await tx`update affiliate_offers set master_product_id = ${destId!}, updated_at = now() where id = ${BUNDLE_OFFER} and master_product_id = ${MK}`;
          if (mv.count !== 1) throw new Error('oferta de bundle mudou desde o plano');
          log.movimentos.push({ offer_id: BUNDLE_OFFER, master_antigo: MK, master_novo: destId, titulo: off.title });
        }
        const [d] = await tx`select master_product_id::text mid, status::text st from affiliate_offers where id = ${DIGITAL_DRAFT}`;
        log.verificacoes[DIGITAL_DRAFT] = d;

        const [{ n: o1 }] = await tx`select count(*)::int n from affiliate_offers`;
        const [{ n: s1 }] = await tx`select count(*)::int n from affiliate_price_snapshots`;
        const [{ n: m1 }] = await tx`select count(*)::int n from master_products`;
        if (o0 !== o1 || s0 !== s1 || m0 !== m1) throw new Error('contagens mudaram: rollback');
        log.verificacoes.contagens = { ofertas: o1, cotacoes: s1, masters: m1, inalteradas: true };
        console.log(JSON.stringify(log, null, 1));
        if (!APPLY) throw new DryRun();
        log.status = 'committed';
        fs.writeFileSync(logFile, JSON.stringify(log, null, 2), 'utf8');
      });
    } catch (e) {
      if (e instanceof DryRun) console.log('DRY-RUN: transação desfeita; nada gravado. Use --apply.');
      else {
        if (fs.existsSync(logFile)) fs.renameSync(logFile, logFile + '.invalido');
        throw e;
      }
    }
    if (APPLY) console.log('Gravado. Log:', logFile);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function revert(sql: ReturnType<typeof connect>, file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (log.status !== 'committed') throw new Error('log sem status committed');
  console.log(`${APPLY ? 'REVERTENDO' : 'DRY-RUN da reversão'}: ${log.colunas.length} coluna(s), ${log.movimentos.length} oferta(s)`);
  try {
    await sql.begin(async (tx) => {
      for (const m of log.movimentos) {
        const [cur] = await tx`select master_product_id::text mid from affiliate_offers where id = ${m.offer_id}`;
        if (cur?.mid !== m.master_novo) console.log(`  AVISO: oferta ${m.offer_id} está em ${cur?.mid}, log esperava ${m.master_novo}`);
        const r = await tx`update affiliate_offers set master_product_id = ${m.master_antigo}, updated_at = now() where id = ${m.offer_id}`;
        console.log(`  oferta ${m.offer_id} -> ${m.master_antigo} (${r.count} linha)`);
      }
      for (const c of log.colunas) {
        const r = await tx`update master_products set game_format = ${c.de}::game_format, attributes = attributes - 'formatEvidence' - 'formatEvidenceAt', updated_at = now() where id = ${c.master_id}`;
        console.log(`  master ${c.master_id} game_format -> ${c.de} (${r.count} linha)`);
      }
      if (!APPLY) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    console.log('DRY-RUN da reversão: transação desfeita.');
  }
}

main()
  .catch((e) => {
    console.error('Falha:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .then(() => process.exit(0));
