/**
 * Tarefa #59 (Bambu Lab A1/P1S/P2S, dono 2026-11-15): correcoes de OFERTA mal casada que distorciam o menor preco do modelo. Reversivel, backup NDJSON + log.
 *
 *   npx tsx --conditions react-server --env-file=.env.local scripts/corrigir-bambu-59-2026-11-15.ts                  # DRY-RUN (padrao)
 *   npx tsx --conditions react-server --env-file=.env.local scripts/corrigir-bambu-59-2026-11-15.ts --apply --por "Nome"
 *   npx tsx --conditions react-server --env-file=.env.local scripts/corrigir-bambu-59-2026-11-15.ts --rollback docs/backups/bambu-59-log-<ts>.json [--apply]
 *
 * A) Amazon B0FF43Z74V "Creality Hi Combo" estava no master Bambu Lab A1 Combo (juiz: familia_nao_reconhecida) e era o MENOR preco dele (R$ 3.149 contra R$ 3.879):
 *    volta para o master Creality Hi Combo (fafd99c6), onde ja moram as outras ofertas desse produto.
 * B) Amazon B0DMPQF96B "Bambu Lab P1P" estava no master Anycubic Photon P1 (R$ 7.456 entrando na media da resina): nao ha master P1P (modelo fora do pedido);
 *    a oferta vai para RASCUNHO (invisivel), reversivel. Criar o master P1P exige decisao do dono.
 * Guarda otimista: so grava se a oferta ainda esta no master/status lidos. Nunca apaga nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const por = argv.indexOf('--por') >= 0 ? argv[argv.indexOf('--por') + 1] : '';
const rb = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');

const MOVER = [{ oferta: '41997640-3f11-4d6c-8057-cd0920987115', para: 'fafd99c6-0d8a-4c29-8c85-f42876023d5c' }];
const RASCUNHO = ['982013e5-a5d1-4947-b213-6555d10ed8f9'];

type Log = {
  criadoEm: string; por: string; backup: string;
  movidas: Array<{ oferta: string; de: string; para: string }>;
  rascunhos: Array<{ oferta: string; statusAntes: string }>;
};

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (rb >= 0) {
      const log = JSON.parse(fs.readFileSync(argv[rb + 1]!, 'utf8')) as Log;
      console.log(`rollback: ${log.movidas.length} movidas, ${log.rascunhos.length} rascunhos`);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      await sql.begin(async (tx) => {
        for (const m of log.movidas) await tx`UPDATE affiliate_offers SET master_product_id = ${m.de}::uuid, updated_at = now() WHERE id = ${m.oferta}::uuid AND master_product_id = ${m.para}::uuid`;
        for (const r of log.rascunhos) await tx`UPDATE affiliate_offers SET status = ${r.statusAntes}::affiliate_offer_status, updated_at = now() WHERE id = ${r.oferta}::uuid AND status = 'draft'`;
      });
      return void console.log('ROLLBACK aplicado.');
    }
    const log: Log = { criadoEm: new Date().toISOString(), por, backup: '', movidas: [], rascunhos: [] };
    const backup: unknown[] = [];
    for (const m of MOVER) {
      const [o] = await sql<{ title: string; mid: string; st: string; p: string }[]>`SELECT title, master_product_id::text mid, status::text st, (current_price_cents/100)::text p FROM affiliate_offers WHERE id = ${m.oferta}::uuid`;
      const [alvo] = await sql<{ name: string }[]>`SELECT name FROM master_products WHERE id = ${m.para}::uuid`;
      console.log(`A) ${m.oferta.slice(0, 8)} "${o?.title.slice(0, 60)}" R$ ${o?.p} ${o?.mid.slice(0, 8)} -> ${m.para.slice(0, 8)} (${alvo?.name})`);
      if (o && alvo && o.mid !== m.para) { backup.push({ acao: 'mover', ...m, de: o.mid }); log.movidas.push({ oferta: m.oferta, de: o.mid, para: m.para }); }
    }
    for (const id of RASCUNHO) {
      const [o] = await sql<{ title: string; st: string; p: string }[]>`SELECT title, status::text st, (current_price_cents/100)::text p FROM affiliate_offers WHERE id = ${id}::uuid`;
      console.log(`B) ${id.slice(0, 8)} "${o?.title.slice(0, 60)}" R$ ${o?.p} status ${o?.st} -> draft`);
      if (o && o.st !== 'draft') { backup.push({ acao: 'rascunho', oferta: id, statusAntes: o.st }); log.rascunhos.push({ oferta: id, statusAntes: o.st }); }
    }
    console.log(`\nA gravar: ${log.movidas.length} movidas, ${log.rascunhos.length} rascunhos`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply --por "Nome".');
    if (!por) throw new Error('--por "Nome" e obrigatorio com --apply');
    const bk = path.join(DIR, `bambu-59-${stamp}.ndjson`);
    fs.writeFileSync(bk, backup.map((r) => JSON.stringify(r)).join('\n') + '\n');
    log.backup = path.basename(bk);
    await sql.begin(async (tx) => {
      for (const m of log.movidas) await tx`UPDATE affiliate_offers SET master_product_id = ${m.para}::uuid, updated_at = now() WHERE id = ${m.oferta}::uuid AND master_product_id = ${m.de}::uuid`;
      for (const r of log.rascunhos) await tx`UPDATE affiliate_offers SET status = 'draft'::affiliate_offer_status, updated_at = now() WHERE id = ${r.oferta}::uuid AND status = ${r.statusAntes}::affiliate_offer_status`;
    });
    const lg = path.join(DIR, `bambu-59-log-${stamp}.json`);
    fs.writeFileSync(lg, JSON.stringify(log, null, 2));
    console.log(`APLICADO. backup=${bk} log=${lg}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
