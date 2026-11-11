/**
 * APROVAÇÃO DE MASTERS DE NICHO (ata 2026-11-10, emenda E.2). Grava SÓ master_products.attributes -> catalogGate
 * (verdict 'review' -> 'approved'). Nunca apaga nada, nunca toca em ofertas, cotações ou histórico. Reversível.
 *
 *   npx tsx --env-file=.env.local scripts/aprovar-masters-nicho.ts                      # dry-run (padrão): lista proposta, só LEITURA
 *   npx tsx --env-file=.env.local scripts/aprovar-masters-nicho.ts --lista docs/x.json  # dry-run restrito à lista nominal do dono
 *   npx tsx --env-file=.env.local scripts/aprovar-masters-nicho.ts --lista docs/x.json --apply --por "Nome"   # grava (backup NDJSON + log antes)
 *   npx tsx --env-file=.env.local scripts/aprovar-masters-nicho.ts --rollback docs/backups/aprovar-nichos-log-<ts>.json [--apply]
 *
 * Lista nominal: JSON `{"ids": ["<uuid>", ...]}` (ou um array de uuid). O dry-run sem --lista avalia todos os
 * masters de nicho e grava a PROPOSTA em docs/backups/aprovar-nichos-proposta-<ts>.json (para o dono conferir e
 * devolver como lista). --apply EXIGE --lista e --por; reavalia cada id ao vivo e só aprova quem ainda passa.
 * Critérios (todos): evidência positiva do porteiro, produto novo, >= 1 oferta clicável (ativa, link não pendente,
 * sem quarentena, checada há < 6 h, Mercado Livre/Shopee), amplitude <= 2,5x, quarentena < 30%, nome específico,
 * identidade forte, sem nome duplicado, com foto. Ver src/lib/catalog/aprovacao-nicho.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { avaliarCandidato, CLICAVEL_MAX_HORAS, CRITERIA_VERSION, normalizarNome, type CandidatoMaster } from '../src/lib/catalog/aprovacao-nicho';
import { REDES_DEPARTAMENTO } from '../src/lib/catalog/departamentos';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const listaPath = arg('--lista');
const rollbackPath = arg('--rollback');
const por = arg('--por');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUPS = path.resolve(process.cwd(), 'docs/backups');

interface RowMaster {
  id: string; name: string; slug: string; vertical: string; gtin: string | null; mpn: string | null;
  image: string | null; gate: CandidatoMaster['gate']; cat: Record<string, unknown> | null;
}

function lerLista(p: string): string[] {
  const j = JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
  const ids: unknown = Array.isArray(j) ? j : j?.ids;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))) throw new Error('lista inválida: esperado {"ids":[uuid,...]}');
  return [...new Set(ids as string[])];
}

async function carregar(sql: ReturnType<typeof connect>, ids: string[] | null) {
  const masters = await sql<RowMaster[]>`
    SELECT m.id, m.name, m.slug, m.vertical, m.gtin, m.mpn, m.default_images ->> 0 AS image,
           m.attributes -> 'catalogGate' AS gate, m.attributes -> 'vertical' -> 'catalogAttributes' AS cat
    FROM master_products m
    WHERE m.vertical <> 'games' ${ids ? sql`AND m.id IN ${sql(ids)}` : sql``}
    ORDER BY m.vertical, m.name`;
  const idList = masters.map((m) => m.id);
  const ofertas = idList.length
    ? await sql<{ master_product_id: string; title: string; price: string; clicavel: boolean; quarentena: boolean }[]>`
        SELECT o.master_product_id, o.title, o.current_price_cents AS price,
               (o.affiliate_link_pending = false AND o.quarantined_at IS NULL AND n.slug IN ${sql([...REDES_DEPARTAMENTO])}
                AND o.affiliate_url ~* '^https?://' AND o.current_price_cents > 0
                AND o.last_checked_at >= now() - make_interval(hours => ${CLICAVEL_MAX_HORAS})) AS clicavel,
               (o.quarantined_at IS NOT NULL) AS quarentena
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
        WHERE o.status = 'active' AND o.master_product_id IN ${sql(idList)}`
    : [];
  const nomes = new Map<string, number>();
  for (const m of masters) {
    const k = `${m.vertical}|${normalizarNome(m.name)}`;
    nomes.set(k, (nomes.get(k) ?? 0) + 1);
  }
  return masters.map((m) => {
    const of = ofertas.filter((o) => o.master_product_id === m.id);
    const cand: CandidatoMaster = {
      id: m.id, name: m.name, vertical: m.vertical, gtin: m.gtin, mpn: m.mpn, hasImage: Boolean(m.image), gate: m.gate, catalogAttributes: m.cat,
      precosClicaveis: of.filter((o) => o.clicavel).map((o) => Number(o.price)),
      ofertasAtivas: of.filter((o) => !o.quarentena).length,
      ofertasQuarentena: of.filter((o) => o.quarentena).length,
      titulosOfertas: of.map((o) => o.title),
      nomeDuplicado: (nomes.get(`${m.vertical}|${normalizarNome(m.name)}`) ?? 0) > 1,
    };
    return { m, cand, ava: avaliarCandidato(cand) };
  });
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main() {
  const sql = connect();
  try {
    if (rollbackPath) return await rollback(sql);
    if (APPLY && (!listaPath || !por)) throw new Error('--apply exige --lista <arquivo.json> e --por "<quem aprovou>"');
    const ids = listaPath ? lerLista(listaPath) : null;
    const rows = await carregar(sql, ids);
    if (ids && rows.length !== ids.length) console.warn(`ATENÇÃO: ${ids.length - rows.length} id(s) da lista não são masters de nicho e foram ignorados.`);

    console.log(`\nModo: ${APPLY ? 'APPLY' : 'DRY-RUN (somente leitura)'} | masters avaliados: ${rows.length}\n`);
    for (const r of rows) {
      const p = r.cand.precosClicaveis;
      const faixa = p.length ? `${brl(Math.min(...p))} a ${brl(Math.max(...p))}` : 'sem oferta clicável';
      console.log(`${r.ava.aprovavel ? 'APROVAR ' : 'MANTER  '} [${r.m.vertical}] ${r.m.name} | ofertas clicáveis: ${p.length} | ${faixa}${r.ava.amplitude ? ` | amplitude ${r.ava.amplitude.toFixed(2)}x` : ''}${r.ava.aprovavel ? '' : ` | motivos: ${r.ava.motivos.join(', ')}`} | id ${r.m.id}`);
    }
    const aprov = rows.filter((r) => r.ava.aprovavel);
    const porDept: Record<string, number> = {};
    for (const r of aprov) porDept[r.m.vertical] = (porDept[r.m.vertical] ?? 0) + 1;
    console.log(`\nProposta: ${aprov.length} de ${rows.length} aprovável(is). Por departamento: ${JSON.stringify(porDept)}`);

    if (!APPLY) {
      if (!ids) {
        fs.mkdirSync(BACKUPS, { recursive: true });
        const f = path.join(BACKUPS, `aprovar-nichos-proposta-${stamp}.json`);
        fs.writeFileSync(f, JSON.stringify({ geradoEm: new Date().toISOString(), criteriaVersion: CRITERIA_VERSION, ids: aprov.map((r) => r.m.id), nomes: aprov.map((r) => r.m.name) }, null, 2));
        console.log(`Proposta gravada em ${path.relative(process.cwd(), f)} (arquivo local; nada foi escrito no banco). Confira, edite e devolva com --lista.`);
      }
      console.log('DRY-RUN: nada foi escrito no banco.');
      return;
    }

    // APPLY: backup NDJSON ANTES (linha completa do master), depois transação.
    const alvo = aprov;
    if (!alvo.length) return void console.log('Nada a aprovar.');
    fs.mkdirSync(BACKUPS, { recursive: true });
    const completos = await sql`SELECT * FROM master_products WHERE id IN ${sql(alvo.map((r) => r.m.id))}`;
    const nd = path.join(BACKUPS, `aprovar-nichos-${stamp}.ndjson`);
    fs.writeFileSync(nd, completos.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const logFile = path.join(BACKUPS, `aprovar-nichos-log-${stamp}.json`);
    const approvedAt = new Date().toISOString();
    const changes = alvo.map((r) => ({ id: r.m.id, name: r.m.name, before: r.m.gate }));
    fs.writeFileSync(logFile, JSON.stringify({ stamp, approvedBy: por, approvedAt, criteriaVersion: CRITERIA_VERSION, backup: path.relative(process.cwd(), nd), changes }, null, 2));
    await sql.begin(async (tx) => {
      for (const r of alvo) {
        const novo = { ...(r.m.gate ?? {}), verdict: 'approved', approvedBy: por, approvedAt, criteriaVersion: CRITERIA_VERSION, previousVerdict: r.m.gate?.verdict ?? null };
        await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${tx.json(novo)}::jsonb, true), updated_at = now() WHERE id = ${r.m.id} AND attributes -> 'catalogGate' ->> 'verdict' = 'review'`;
      }
    });
    console.log(`APLICADO: ${alvo.length} master(s). Backup ${path.relative(process.cwd(), nd)} | log ${path.relative(process.cwd(), logFile)}`);
    console.log(`Reverter: npx tsx --env-file=.env.local scripts/aprovar-masters-nicho.ts --rollback ${path.relative(process.cwd(), logFile)} --apply`);
  } finally {
    await sql.end();
  }
}

async function rollback(sql: ReturnType<typeof connect>) {
  const log = JSON.parse(fs.readFileSync(path.resolve(rollbackPath as string), 'utf8')) as { stamp: string; changes: Array<{ id: string; name: string; before: unknown }> };
  console.log(`\nROLLBACK ${APPLY ? '(APPLY)' : '(dry-run)'} de ${log.changes.length} master(s) do log ${log.stamp}`);
  const atuais = await sql<{ id: string; verdict: string | null; by: string | null }[]>`
    SELECT id, attributes -> 'catalogGate' ->> 'verdict' AS verdict, attributes -> 'catalogGate' ->> 'approvedBy' AS by
    FROM master_products WHERE id IN ${sql(log.changes.map((c) => c.id))}`;
  const mapa = new Map(atuais.map((a) => [a.id, a]));
  let n = 0;
  for (const c of log.changes) {
    const a = mapa.get(c.id);
    const ok = a?.verdict === 'approved' && a.by;
    console.log(`${ok ? 'RESTAURAR' : 'PULAR    '} ${c.name} (${c.id})${ok ? '' : ' - já não está aprovado por este script'}`);
    if (ok) n++;
  }
  if (!APPLY) return void console.log(`Dry-run: ${n} seriam restaurados. Nada escrito.`);
  await sql.begin(async (tx) => {
    for (const c of log.changes) {
      const a = mapa.get(c.id);
      if (!(a?.verdict === 'approved' && a.by)) continue;
      if (c.before) await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${tx.json(c.before as never)}::jsonb, true), updated_at = now() WHERE id = ${c.id}`;
      else await tx`UPDATE master_products SET attributes = attributes - 'catalogGate', updated_at = now() WHERE id = ${c.id}`;
    }
  });
  console.log(`RESTAURADO: ${n} master(s).`);
}

main().catch((e) => {
  console.error('FALHA:', e instanceof Error ? e.message : e);
  process.exit(1);
});
