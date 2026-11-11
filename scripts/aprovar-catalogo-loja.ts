/**
 * APROVAÇÃO EM BLOCO DO CATÁLOGO DE UMA LOJA/VERTICAL (plano 2026-11-11, trilha A4). Hoje só 'impressao3d'.
 * Grava SÓ master_products.attributes -> catalogGate (verdict 'review' -> 'approved'), somente nos masters que passam nos critérios
 * de src/lib/catalog/aprovacao-impressao3d.ts. Os demais ficam como estão ('review'). Nunca apaga, nunca toca em ofertas/cotações.
 *
 *   npx tsx --env-file=.env.local scripts/aprovar-catalogo-loja.ts --vertical impressao3d                 # dry-run (padrão, só leitura)
 *   npx tsx --env-file=.env.local scripts/aprovar-catalogo-loja.ts --vertical impressao3d --apply         # backup + log + grava
 *   npx tsx --env-file=.env.local scripts/aprovar-catalogo-loja.ts --rollback backup/logs/aprovar-catalogo-<ts>.json [--apply]
 *
 * Backup lógico (linha completa dos masters afetados, NDJSON) em backup/dados/ e log em backup/logs/ ANTES de gravar.
 * approvedBy = 'bloco:i3d-v1:<data>' (padrão do plano). Reversão restaura o catalogGate anterior só de quem ainda está aprovado por este script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { avaliarImpressao3d, CRITERIA_I3D_LABEL, CRITERIA_I3D_VERSION, type CandidatoI3d, type OfertaCandidata } from '../src/lib/catalog/aprovacao-impressao3d';
import { normalizeTitleKey } from '../src/lib/catalog/vertical/identity';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const vertical = arg('--vertical') ?? 'impressao3d';
const rollbackPath = arg('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dia = new Date().toISOString().slice(0, 10);
const DADOS = path.resolve(process.cwd(), 'backup', 'dados');
const LOGS = path.resolve(process.cwd(), 'backup', 'logs');
const logTxt = path.join(LOGS, `aprovar-catalogo-${stamp}.log`);

function log(msg: string) {
  console.log(msg);
  fs.mkdirSync(LOGS, { recursive: true });
  fs.appendFileSync(logTxt, `${new Date().toISOString()} ${msg}\n`, 'utf8');
}

type Sql = ReturnType<typeof connect>;

interface RowMaster {
  id: string; name: string; manufacturer: string | null; mpn: string | null; image: string | null;
  gate: CandidatoI3d['gate']; cat: Record<string, unknown> | null; segment: string | null; vertical: string; ikey: string | null;
}

async function carregar(sql: Sql): Promise<Array<{ m: RowMaster; cand: CandidatoI3d }>> {
  const masters = await sql<RowMaster[]>`
    SELECT m.id, m.name, m.manufacturer, m.mpn, m.default_images ->> 0 AS image, m.vertical,
           m.attributes -> 'catalogGate' AS gate, m.attributes -> 'vertical' -> 'catalogAttributes' AS cat,
           m.attributes -> 'vertical' ->> 'segment' AS segment, m.attributes -> 'vertical' ->> 'identityKey' AS ikey
    FROM master_products m
    WHERE m.vertical = ${vertical} AND (m.attributes ->> 'mergedInto') IS NULL
    ORDER BY m.name`;
  const ids = masters.map((m) => m.id);
  const ofertas = ids.length
    ? await sql<Array<{ master_product_id: string; title: string; price: string; slug: string; quarentena: boolean; rep: string | null; vendas: number | null }>>`
        SELECT o.master_product_id, o.title, o.current_price_cents AS price, n.slug, (o.quarantined_at IS NOT NULL) AS quarentena,
               s.reputation_level AS rep, s.total_sales AS vendas
        FROM affiliate_offers o
        JOIN affiliate_networks n ON n.id = o.network_id
        LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
        WHERE o.status = 'active' AND o.master_product_id IN ${sql(ids)}`
    : [];
  // Duplicata: mesmo título normalizado OU mesma chave de identidade em outro master fora de games (qualquer departamento).
  const outros = await sql<Array<{ id: string; name: string; ikey: string | null }>>`
    SELECT id, name, attributes -> 'vertical' ->> 'identityKey' AS ikey FROM master_products
    WHERE vertical <> 'games' AND (attributes ->> 'mergedInto') IS NULL`;
  const porTitulo = new Map<string, string[]>();
  const porChave = new Map<string, string[]>();
  for (const o of outros) {
    const k = normalizeTitleKey(o.name);
    if (k) porTitulo.set(k, [...(porTitulo.get(k) ?? []), o.id]);
    if (o.ikey) porChave.set(o.ikey, [...(porChave.get(o.ikey) ?? []), o.id]);
  }
  return masters.map((m) => {
    const of: OfertaCandidata[] = ofertas
      .filter((o) => o.master_product_id === m.id)
      .map((o) => ({ priceCents: Number(o.price), networkSlug: o.slug, quarentena: o.quarentena, sellerReputation: o.rep, sellerSales: o.vendas, title: o.title }));
    const tk = normalizeTitleKey(m.name);
    const dup = (tk && (porTitulo.get(tk)?.length ?? 0) > 1) || (m.ikey != null && (porChave.get(m.ikey)?.length ?? 0) > 1);
    return {
      m,
      cand: { id: m.id, name: m.name, segment: m.segment, vertical: m.vertical, manufacturer: m.manufacturer, mpn: m.mpn, hasImage: Boolean(m.image), gate: m.gate, catalogAttributes: m.cat, identityKey: m.ikey, ofertas: of, duplicado: Boolean(dup) },
    };
  });
}

async function main() {
  const sql = connect();
  try {
    if (rollbackPath) return await rollback(sql);
    if (vertical !== 'impressao3d') throw new Error(`vertical sem critérios implementados: ${vertical} (hoje só impressao3d)`);
    const rows = await carregar(sql);
    const avals = rows.map((r) => ({ ...r, ava: avaliarImpressao3d(r.cand) }));
    log(`aprovar-catalogo-loja: vertical=${vertical} modo=${APPLY ? 'APPLY' : 'DRY-RUN (só leitura)'} masters=${avals.length} critérios=${CRITERIA_I3D_LABEL} v${CRITERIA_I3D_VERSION}`);
    const aprov = avals.filter((a) => a.ava.aprovavel);
    const rejeit = avals.filter((a) => !a.ava.aprovavel && a.ava.rejeitavel);
    const jaAprov = avals.filter((a) => a.cand.gate?.verdict === 'approved');
    const review = avals.filter((a) => !a.ava.aprovavel && !a.ava.rejeitavel && a.cand.gate?.verdict !== 'approved');
    for (const a of avals) {
      const tag = a.ava.aprovavel ? 'APROVAR ' : a.ava.rejeitavel ? 'REJEITAVEL' : a.cand.gate?.verdict === 'approved' ? 'JA_APROV' : 'REVIEW  ';
      log(`${tag} [${a.m.segment ?? '?'}] ${a.m.name} | campos=${JSON.stringify(a.ava.campos)}${a.ava.motivos.length ? ` | motivos=${a.ava.motivos.join(',')}` : ''}${a.ava.avisos.length ? ` | avisos=${a.ava.avisos.join(',')}` : ''} | id ${a.m.id}`);
    }
    log(`RESUMO: aprovaveis=${aprov.length} review=${review.length} rejeitaveis(mantidos em review)=${rejeit.length} ja_aprovados=${jaAprov.length} de ${avals.length}`);
    if (!APPLY) return void log('DRY-RUN: nada foi escrito no banco.');
    if (!aprov.length) return void log('Nada a aprovar.');

    fs.mkdirSync(DADOS, { recursive: true });
    const completos = await sql`SELECT * FROM master_products WHERE id IN ${sql(aprov.map((a) => a.m.id))}`;
    const nd = path.join(DADOS, `aprovar-catalogo-${vertical}-${stamp}.ndjson`);
    fs.writeFileSync(nd, completos.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const approvedAt = new Date().toISOString();
    const approvedBy = `${CRITERIA_I3D_LABEL}:${dia}`;
    const logJson = path.join(LOGS, `aprovar-catalogo-${stamp}.json`);
    fs.writeFileSync(
      logJson,
      JSON.stringify({ stamp, vertical, approvedBy, approvedAt, criteriaVersion: CRITERIA_I3D_VERSION, backup: path.relative(process.cwd(), nd), changes: aprov.map((a) => ({ id: a.m.id, name: a.m.name, campos: a.ava.campos, avisos: a.ava.avisos, before: a.m.gate })) }, null, 2)
    );
    let n = 0;
    await sql.begin(async (tx) => {
      for (const a of aprov) {
        const novo = { ...(a.m.gate ?? {}), verdict: 'approved', approvedBy, approvedAt, criteriaVersion: CRITERIA_I3D_VERSION, previousVerdict: a.m.gate?.verdict ?? null };
        const r = await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${tx.json(novo)}::jsonb, true), updated_at = now()
                           WHERE id = ${a.m.id} AND vertical = ${vertical} AND attributes -> 'catalogGate' ->> 'verdict' = 'review'`;
        n += r.count;
      }
    });
    log(`APLICADO: ${n} master(s) aprovados. Backup ${path.relative(process.cwd(), nd)} | log ${path.relative(process.cwd(), logJson)}`);
    log(`Reverter: npx tsx --env-file=.env.local scripts/aprovar-catalogo-loja.ts --rollback ${path.relative(process.cwd(), logJson)} --apply`);
  } finally {
    await sql.end();
  }
}

async function rollback(sql: Sql) {
  const l = JSON.parse(fs.readFileSync(path.resolve(rollbackPath as string), 'utf8')) as { stamp: string; approvedBy: string; changes: Array<{ id: string; name: string; before: unknown }> };
  log(`ROLLBACK ${APPLY ? '(APPLY)' : '(dry-run)'} de ${l.changes.length} master(s) do log ${l.stamp}`);
  const atuais = await sql<Array<{ id: string; verdict: string | null; by: string | null }>>`
    SELECT id, attributes -> 'catalogGate' ->> 'verdict' AS verdict, attributes -> 'catalogGate' ->> 'approvedBy' AS by
    FROM master_products WHERE id IN ${sql(l.changes.map((c) => c.id))}`;
  const mapa = new Map(atuais.map((a) => [a.id, a]));
  const alvo = l.changes.filter((c) => {
    const a = mapa.get(c.id);
    return a?.verdict === 'approved' && a.by === l.approvedBy;
  });
  for (const c of l.changes) log(`${alvo.includes(c) ? 'RESTAURAR' : 'PULAR    '} ${c.name} (${c.id})`);
  if (!APPLY) return void log(`Dry-run: ${alvo.length} seriam restaurados. Nada escrito.`);
  await sql.begin(async (tx) => {
    for (const c of alvo) {
      if (c.before) await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${tx.json(c.before as never)}::jsonb, true), updated_at = now() WHERE id = ${c.id}`;
      else await tx`UPDATE master_products SET attributes = attributes - 'catalogGate', updated_at = now() WHERE id = ${c.id}`;
    }
  });
  log(`RESTAURADO: ${alvo.length} master(s).`);
}

main().catch((e) => {
  log(`FALHA: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
