/**
 * MOVE celulares, tablets/leitores e relogios inteligentes de Eletronicos para Tecnologia (dono, 2026-11-13). Um produto fica em UM departamento.
 *
 *   # DRY-RUN (padrao): so SELECT; imprime contagens e amostra de 20 titulos. Nao escreve nada.
 *   npx tsx --env-file=.env.local scripts/mover-celulares-tecnologia.ts
 *   # APLICAR: backup NDJSON + log antes; transacao por lote; vertical de masters E ofertas.
 *   npx tsx --env-file=.env.local scripts/mover-celulares-tecnologia.ts --apply
 *   # REVERTER (dry-run por padrao; --apply grava): restaura a vertical anterior so de quem ainda esta em 'tecnologia'.
 *   npx tsx --env-file=.env.local scripts/mover-celulares-tecnologia.ts --rollback docs/backups/mover-celulares-log-<ts>.json [--apply]
 *
 * Seleciona: masters com vertical='eletroeletronicos' cujo tipo derivado do titulo (classificarTipo('tecnologia')) e celular, tablet-leitor ou relogios,
 * e que NAO sao acessorio/peca/item miudo (R-50 em item-miudo.ts + lista de palavras de acessorio). Nunca imprime URL/senha/token.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { classificarTipo, normalizarTitulo } from '../src/lib/catalog/tipos-produto';
import { avaliarItemMiudo } from '../src/lib/catalog/item-miudo';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const rbIdx = argv.indexOf('--rollback');
const ROLLBACK = rbIdx >= 0 ? argv[rbIdx + 1] : undefined;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const TIPOS = new Set(['celular', 'tablet-leitor', 'relogios']);
const LOTE = 20;
const TIPO_KW = /\b(celular|celulares|smartphone|smartphones|iphone|galaxy [asmz] ?\d+|redmi|poco [xfm]\d+|moto [gex]\d+|tablet|ipad|e reader|kindle|galaxy tab|tab [as]\d+|smartwatch|smart watch|relogio inteligente|relogio smart|smartband|galaxy watch|apple watch|amazfit|mi band)\b/;

/** Acessorio/peca/miudo: nunca move (permanece onde esta; o porteiro/limpeza decide). */
const ACESSORIO = /\b(capa|capas|capinha|capinhas|case|cases|pelicula|peliculas|protetor|carregador|carregadores|cabo|cabos|fonte|suporte|suportes|caixa|caixinha|amplificador|lupa|microfone|microfones|lapela|charger|adapter|plug|tomada|tripe|gimbal|selfie|lampada|camera|speaker|soundbar|headset|fones|fone|adaptador|adaptadores|dock|kit|stylus|brinquedo|replica|dummy|mostruario|usado|usada|seminovo|recondicionado|retrofit|vitrine|open box)\b/;
/** Palavras de peca que, ANTES do nome do aparelho, indicam que o item e a peca (ex.: "Tela para Galaxy A16"); depois do nome sao especificacao. */
const PECA_ANTES = /\b(pulseira|pulseiras|correia|bracadeira|fone|fones|bateria|baterias|tela|display|placa|tampa|lente|chip|teclado|bumper|popsocket|gaveta|flex|conector|caneta|base|refil|cartucho)\b/;

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (ROLLBACK) return await doRollback(sql);
    const rows = await sql<{ id: string; name: string; product_type: string; vertical: string; preco: number | null; ofertas: number }[]>`
      SELECT m.id, m.name, m.product_type::text AS product_type, m.vertical,
             (SELECT MIN(o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0)::bigint::float8 AS preco,
             (SELECT COUNT(*) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.vertical = 'eletroeletronicos')::int AS ofertas
      FROM master_products m WHERE m.vertical = 'eletroeletronicos'`;
    const mover: typeof rows = [];
    const barrados: { name: string; motivo: string }[] = [];
    for (const r of rows) {
      const tipo = classificarTipo('tecnologia', r.name);
      if (!TIPOS.has(tipo)) continue;
      const t = normalizarTitulo(r.name).trim();
      const kw = (TIPO_KW.exec(` ${t} `)?.index ?? 0);
      const ac = ACESSORIO.exec(t) ?? PECA_ANTES.exec(` ${t} `.slice(0, kw + 1));
      if (ac) { barrados.push({ name: r.name, motivo: `acessorio:${ac[0]}` }); continue; }
      const mi = avaliarItemMiudo(r.name, r.preco, r.product_type, 'tecnologia');
      const me = avaliarItemMiudo(r.name, r.preco, r.product_type, 'eletroeletronicos');
      if (mi.veredito !== 'nao' || me.veredito === 'sim') { barrados.push({ name: r.name, motivo: `miudo:${mi.veredito}/${mi.motivo}` }); continue; }
      mover.push(r);
    }
    const porTipo: Record<string, number> = {};
    for (const r of mover) { const k = classificarTipo('tecnologia', r.name); porTipo[k] = (porTipo[k] ?? 0) + 1; }
    const ofertas = mover.reduce((a, r) => a + r.ofertas, 0);
    console.log(`masters em eletroeletronicos: ${rows.length}`);
    console.log(`a mover: ${mover.length} masters, ${ofertas} ofertas (todas as situacoes)`, porTipo);
    console.log(`barrados (acessorio/miudo): ${barrados.length}`);
    console.log('--- amostra 20 a mover ---');
    for (const r of mover.slice(0, process.env.ALL ? 9999 : 20)) console.log(`  [${classificarTipo('tecnologia', r.name)}] ${r.name.slice(0, 110)}`);
    console.log('--- amostra 10 barrados ---');
    for (const b of barrados.slice(0, 10)) console.log(`  (${b.motivo}) ${b.name.slice(0, 100)}`);
    if (!APPLY) { console.log('DRY-RUN: nada gravado. Use --apply.'); return; }

    const ids = mover.map((r) => r.id);
    const bkM = path.join(DIR, `mover-celulares-masters-${stamp}.ndjson`);
    const bkO = path.join(DIR, `mover-celulares-ofertas-${stamp}.ndjson`);
    const offers = ids.length ? await sql<{ id: string; master_product_id: string; vertical: string }[]>`SELECT id, master_product_id, vertical FROM affiliate_offers WHERE master_product_id IN ${sql(ids)} AND vertical = 'eletroeletronicos'` : [];
    fs.writeFileSync(bkM, mover.map((r) => JSON.stringify({ id: r.id, vertical: r.vertical, name: r.name })).join('\n') + '\n');
    fs.writeFileSync(bkO, offers.map((o) => JSON.stringify({ id: o.id, master_product_id: o.master_product_id, vertical: o.vertical })).join('\n') + '\n');
    const logFile = path.join(DIR, `mover-celulares-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: new Date().toISOString(), de: 'eletroeletronicos', para: 'tecnologia', masters: ids.length, ofertas: offers.length, porTipo, backupMasters: path.basename(bkM), backupOfertas: path.basename(bkO), rollback: `npx tsx --env-file=.env.local scripts/mover-celulares-tecnologia.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));
    let nm = 0, no = 0;
    for (let i = 0; i < ids.length; i += LOTE) {
      const lote = ids.slice(i, i + LOTE);
      await sql.begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = '180s'`;
        const o = await tx`UPDATE affiliate_offers SET vertical = 'tecnologia' WHERE master_product_id IN ${tx(lote)} AND vertical = 'eletroeletronicos'`;
        const m = await tx`UPDATE master_products SET vertical = 'tecnologia' WHERE id IN ${tx(lote)} AND vertical = 'eletroeletronicos'`;
        no += o.count; nm += m.count;
      });
    }
    console.log(`APLICADO: ${nm} masters e ${no} ofertas -> tecnologia. Log: ${path.relative(process.cwd(), logFile)}`);
  } finally {
    await sql.end();
  }
}

async function doRollback(sql: ReturnType<typeof connect>) {
  const log = JSON.parse(fs.readFileSync(path.resolve(ROLLBACK!), 'utf8'));
  const lerNd = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { id: string; vertical: string });
  const ms = lerNd(log.backupMasters);
  const os = lerNd(log.backupOfertas);
  const mAtual = ms.length ? await sql<{ id: string }[]>`SELECT id FROM master_products WHERE id IN ${sql(ms.map((x) => x.id))} AND vertical = 'tecnologia'` : [];
  const oAtual = os.length ? await sql<{ id: string }[]>`SELECT id FROM affiliate_offers WHERE id IN ${sql(os.map((x) => x.id))} AND vertical = 'tecnologia'` : [];
  console.log(`rollback: ${mAtual.length}/${ms.length} masters e ${oAtual.length}/${os.length} ofertas ainda em tecnologia (voltam para eletroeletronicos)`);
  if (!APPLY) { console.log('DRY-RUN: nada gravado. Use --apply.'); return; }
  const mIds = mAtual.map((x) => x.id), oIds = oAtual.map((x) => x.id);
  for (let i = 0; i < Math.max(mIds.length, oIds.length); i += LOTE) {
    await sql.begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = '180s'`;
      const mi = mIds.slice(i, i + LOTE), oi = oIds.slice(i, i + LOTE);
      if (oi.length) await tx`UPDATE affiliate_offers SET vertical = 'eletroeletronicos' WHERE id IN ${tx(oi)} AND vertical = 'tecnologia'`;
      if (mi.length) await tx`UPDATE master_products SET vertical = 'eletroeletronicos' WHERE id IN ${tx(mi)} AND vertical = 'tecnologia'`;
    });
  }
  console.log('ROLLBACK aplicado.');
}

main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
