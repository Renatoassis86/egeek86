/**
 * Testes da CENTRAL DE APROVACAO (/admin/aprovacao, dono 2026-11-12).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-aprovacao.ts   (codigo 1 se algo falhar)
 * Parte A: pura. Parte B: banco real DENTRO DE UMA TRANSACAO REVERTIDA (decidir/desfazer abrem savepoints; nada e gravado; confere a contagem no fim).
 */
import fs from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { EXPLICACOES, MIN_OFERTAS_QUEDA, motivoDe, parseKey, quedaReal, valorAprovar, valorRecusar } from '@/lib/aprovacao/motivos';
import { decidir, desfazer, historico, painel, previaObvios, proximosCartoes } from '@/server/aprovacao/aprovacao';
import { catalogGateVisibleSql, offerIdentityVisibleSql } from '@/server/queries/public-offers';

let fails = 0;
const check = (n: string, ok: boolean, extra?: unknown) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FALHA'} ${n}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); };
const rows = <T>(r: unknown) => r as unknown as T[];

function parteA() {
  console.log('--- A: pura ---');
  check('queda so com >= 5 ofertas', quedaReal(8000, 10000, 4) == null && quedaReal(8000, 10000, MIN_OFERTAS_QUEDA) === 0.2);
  check('queda nunca inventada sem referencia', quedaReal(8000, null, 9) == null && quedaReal(null, 10000, 9) == null && quedaReal(0, 10000, 9) == null);
  check('motivo: rascunho com master em revisao = produto novo', motivoDe({ axis: 'identidade', origem: 'sem_item', tipo: null, draft: true, masterEmRevisao: true }) === 'produto_novo');
  check('motivo: rascunho sem item e master ok = rascunho', motivoDe({ axis: 'identidade', origem: 'sem_item', tipo: null, draft: true, masterEmRevisao: false }) === 'rascunho');
  check('motivo: midia/modelo/armazenamento/preco por eixo', (['midia', 'modelo', 'armazenamento', 'preco'] as const).every((a) => motivoDe({ axis: a, origem: null, tipo: null, draft: false, masterEmRevisao: false }) === a));
  check('motivo: dispersao e fronteira', motivoDe({ axis: 'identidade', origem: null, tipo: null, draft: false, masterEmRevisao: false }) === 'dispersao' && motivoDe({ axis: 'identidade', origem: 'amazon_cobertura', tipo: 'fronteira', draft: true, masterEmRevisao: false }) === 'fronteira');
  const op = (v: string, k = 'escolha') => ({ value: v, label: v, kind: k as 'escolha' });
  check('aprovar: identidade=sim, preco=preco_certo, midia exige escolha', valorAprovar('identidade', [op('sim')]) === 'sim' && valorAprovar('preco', [op('preco_certo')]) === 'preco_certo' && valorAprovar('midia', [op('digital')]) == null);
  check('recusar: nao_e_este; preco=preco_errado', valorRecusar('identidade', [op('nao_e_este', 'nao_e_este')]) === 'nao_e_este' && valorRecusar('preco', [op('preco_errado'), op('nao_e_este', 'nao_e_este')]) === 'preco_errado');
  check('chave invalida e rejeitada (injecao)', parseKey('item:1; drop table x') == null && parseKey('oferta:zzz') == null && parseKey('item:00000000-0000-0000-0000-000000000000') != null);
  check('toda explicacao tem porque/aprovar/recusar, sem a palavra proibida', Object.values(EXPLICACOES).every((e) => e.porque && e.aprovar && e.recusar && !/afiliad/i.test(JSON.stringify(e))));
  const act = fs.readFileSync('src/server/actions/aprovacao.ts', 'utf8');
  const fns = act.split(/export async function /).slice(1);
  check('toda Server Action chama requireAdmin() antes de qualquer coisa', fns.length >= 6 && fns.every((f) => f.indexOf('requireAdmin()') > 0 && f.indexOf('requireAdmin()') < f.indexOf('db') + 1000 && f.indexOf('requireAdmin()') < (f.indexOf('await ', f.indexOf('requireAdmin()') + 5) === -1 ? 1e9 : f.indexOf('await ', f.indexOf('requireAdmin()') + 5))), fns.map((f) => f.slice(0, 30)));
  const pg = fs.readFileSync('src/app/admin/aprovacao/page.tsx', 'utf8');
  check('a pagina chama requireAdmin() dentro dela', /await requireAdmin\(\)/.test(pg));
}

class Rollback extends Error {}

async function parteB() {
  console.log('--- B: banco real, transacao revertida ---');
  const admin = rows<{ id: string }>(await db.execute(sql`SELECT id::text AS id FROM profiles WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1`))[0]?.id;
  if (!admin) { check('ha um admin para o teste', false); return; }
  const antes = rows<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM identity_decisions`))[0].n;
  const snap = async (id: string, dbx: typeof db) => rows<Record<string, unknown>>(await dbx.execute(sql`SELECT o.status::text s, o.published_at::text p, m.attributes->'catalogGate' g, m.attributes->'aprovacaoHumana' a FROM affiliate_offers o JOIN master_products m ON m.id=o.master_product_id WHERE o.id=${id}::uuid`))[0];
  try {
    await db.transaction(async (outer) => {
      const dbx = outer as unknown as typeof db;
      const p = await painel(dbx, admin);
      check('painel: motivos somam o total', p.total >= 0 && p.porMotivo.reduce((s, x) => s + x.n, 0) === p.total, p);
      console.log('     painel:', JSON.stringify({ total: p.total, porMotivo: p.porMotivo, porLoja: p.porLoja, encerradas: p.encerradas }));
      const t0 = Date.now();
      const cards = await proximosCartoes(dbx, { limit: 20 });
      console.log(`     (20 cartoes em ${Date.now() - t0} ms; ${cards.length} lidos)`);
      check('cartoes: no maximo 20', cards.length <= 20 && cards.every((c) => c.key && c.title));
      check('queda so existe com >= 5 ofertas', cards.every((c) => c.queda == null || (c.nRefs ?? 0) >= MIN_OFERTAS_QUEDA));
      const todos = await proximosCartoes(dbx, { limit: 400 });
      const sem = todos.find((c) => c.itemId === null && c.draft);
      const com = todos.find((c) => c.itemId !== null && c.draft && !c.masterEmRevisao);
      const rev = todos.find((c) => c.draft && c.masterEmRevisao);
      for (const [nome, c] of [['rascunho SEM item', sem], ['rascunho COM item', com], ['rascunho de master em revisao', rev]] as const) {
        if (!c) { console.log(`     (sem amostra de ${nome}; pulado)`); continue; }
        const s0 = await snap(c.offerId, dbx);
        const r = await decidir(dbx, { key: c.key, acao: 'aprovar', userId: admin });
        if (!r.ok) { console.log(`     ${nome}: bloqueado pela guarda (${r.error})`); check(`${nome}: bloqueio e uma guarda conhecida`, /quarentena|sem_preco|open_box|usado|geracoes|rejeitado|duplicata/.test(String(r.error)), r); continue; }
        const s1 = await snap(c.offerId, dbx);
        check(`${nome}: aprovar ativa a oferta`, s1.s === 'active' && r.liberada === true, { s0, s1, r });
        const vis = rows<{ ok: boolean }>(await dbx.execute(sql`SELECT (${catalogGateVisibleSql('o.master_product_id')} AND ${offerIdentityVisibleSql('o.id', { activeOnly: true })} AND o.status = 'active' AND o.current_price_cents > 0 AND o.affiliate_url ~* '^https?://') AS ok FROM affiliate_offers o WHERE o.id = ${c.offerId}::uuid`))[0];
        check(`${nome}: EFEITO VISIVEL: passa nos porteiros publicos (gate do catalogo, identidade, ativa, preco, link)`, vis?.ok === true, vis);
        const dec = rows<{ prev_status: string; decided_by: string; value: string }>(await dbx.execute(sql`SELECT prev_status, decided_by::text, value FROM identity_decisions WHERE id=${r.decisionId}::uuid`))[0];
        check(`${nome}: decisao gravada com estado anterior e autor`, dec?.prev_status === 'draft' && dec.decided_by === admin && dec.value === 'sim', dec);
        const r2 = await decidir(dbx, { key: c.key, acao: 'aprovar', userId: admin });
        check(`${nome}: duplo clique e idempotente`, r2.ok && r2.already === true, r2);
        const h = await historico(dbx, 50);
        check(`${nome}: aparece no historico`, h.some((x) => x.decisionId === r.decisionId));
        const u = await desfazer(dbx, { decisionId: r.decisionId!, userId: admin });
        const s2 = await snap(c.offerId, dbx);
        check(`${nome}: desfazer devolve status, published_at e gate do master ao estado exato`, u.ok && s2.s === s0.s && s2.p === s0.p && JSON.stringify(s2.g) === JSON.stringify(s0.g) && s2.a == null, { s0, s2, u });
        const u2 = await desfazer(dbx, { decisionId: r.decisionId!, userId: admin });
        check(`${nome}: desfazer 2x e idempotente`, u2.ok && u2.already === true);
      }
      const ruim = await decidir(dbx, { key: 'item:nao-e-uuid', acao: 'aprovar', userId: admin });
      check('chave invalida e recusada', !ruim.ok && ruim.error === 'pedido_invalido');
      const pv = await previaObvios(dbx);
      check('previa de obvios: grupos com amostra e total coerente', pv.total >= pv.ids.length && pv.grupos.reduce((s, g) => s + g.n, 0) === pv.total);
      console.log('     previa obvios:', JSON.stringify(pv.grupos.map((g) => [g.criterio, g.n])));
      throw new Rollback();
    });
  } catch (e) { if (!(e instanceof Rollback)) check('execucao sem erro', false, e instanceof Error ? e.message : e); }
  const depois = rows<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM identity_decisions`))[0].n;
  check('NADA foi gravado (identity_decisions antes = depois)', antes === depois, { antes, depois });
}

(async () => { parteA(); await parteB(); console.log(fails ? `\n${fails} FALHA(S)` : '\nTudo ok'); process.exit(fails ? 1 : 0); })();
