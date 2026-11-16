export {};
/**
 * Aplica a migration 0063_link_afiliado_obrigatorio (R-70, L2). Padrão DRY-RUN: roda tudo numa transação e DESFAZ (ROLLBACK), conferindo as
 * funções SQL contra os casos de referência e contando o backfill. --apply grava; --rollback desfaz a migration.
 * Backfill: só linhas cujo estado diverge do derivado (pending <> NOT valido, ou Amazon sem tag). Backup NDJSON ANTES em docs/backups.
 * Reverter dados: --restaurar <arquivo.ndjson> devolve affiliate_url e affiliate_link_pending dessas linhas (com o trigger desligado).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { CASOS_LINK } from './_link-afiliado-casos';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const iR = process.argv.indexOf('--restaurar');
const RESTAURAR = iR > 0 ? process.argv[iR + 1] : null;
const DDL = 'drizzle/migrations/0063_link_afiliado_obrigatorio.sql';
const DDL_RB = 'drizzle/migrations/0063_link_afiliado_obrigatorio.rollback.sql';
class Desfaz extends Error {}

type Tx = Parameters<Parameters<ReturnType<typeof connect>['begin']>[1]>[0];

async function conferirFuncoes(tx: Tx) {
  let falhas = 0;
  for (const [url, rede, esperado] of CASOS_LINK) {
    const [r] = await tx<{ v: boolean }[]>`select affiliate_link_valido(${url}, ${rede}) v`;
    if (r.v !== esperado) { falhas++; console.error('FUNÇÃO SQL DIVERGE do caso:', rede, url, 'esperado', esperado, 'obtido', r.v); }
  }
  const norm: [string, string][] = [
    ['https://www.amazon.com.br/dp/B0X?tag=outra-20&th=1', 'https://www.amazon.com.br/dp/B0X?th=1&tag=manusmonteiro-20'],
    ['https://www.amazon.com.br/dp/B0X', 'https://www.amazon.com.br/dp/B0X?tag=manusmonteiro-20'],
    ['https://www.amazon.com.br/dp/B0X?a=1&tag=x-20&b=2#r', 'https://www.amazon.com.br/dp/B0X?a=1&b=2&tag=manusmonteiro-20#r'],
  ];
  for (const [u, esp] of norm) {
    const [r] = await tx<{ n: string }[]>`select affiliate_link_normalizar(${u}, 'amazon') n`;
    if (r.n !== esp) { falhas++; console.error('NORMALIZAR diverge:', u, '->', r.n, 'esperado', esp); }
  }
  return falhas;
}

const DIVERGENTES = (tx: Tx) => tx<{ id: string; url: string; pend: boolean; slug: string; status: string }[]>`
  select o.id::text id, o.affiliate_url url, o.affiliate_link_pending pend, n.slug, o.status::text status
  from affiliate_offers o join affiliate_networks n on n.id = o.network_id
  where o.affiliate_link_pending is distinct from not affiliate_link_valido(o.affiliate_url, n.slug)
     or (n.slug = 'amazon' and o.affiliate_url ~* '^https://(www[.])?amazon[.]com[.]br/' and not affiliate_link_valido(o.affiliate_url, n.slug))`;

(async () => {
  const sql = connect();
  try {
    if (RESTAURAR) {
      const linhas = fs.readFileSync(RESTAURAR, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { id: string; affiliate_url: string; affiliate_link_pending: boolean });
      await sql.begin(async (tx) => {
        await tx`update affiliate_link_config set valor='0' where chave='trigger_ativo'`;
        for (const l of linhas) await tx`update affiliate_offers set affiliate_url=${l.affiliate_url}, affiliate_link_pending=${l.affiliate_link_pending} where id=${l.id}::uuid`;
        await tx`update affiliate_link_config set valor='1' where chave='trigger_ativo'`;
      });
      console.log(`restauradas ${linhas.length} linhas de ${RESTAURAR}`);
      return;
    }
    if (ROLLBACK) {
      await sql.begin(async (tx) => { await tx.unsafe(fs.readFileSync(DDL_RB, 'utf8')); });
      console.log('migration revertida (trigger, funções e tabelas removidos).');
      return;
    }
    const [x] = await sql<{ n: string }[]>`select count(*)::text n from pg_stat_activity where xact_start < now() - interval '30 seconds' and state <> 'idle'`;
    console.log(`${APPLY ? 'APPLY' : 'DRY-RUN (transação desfeita no fim)'}: transações > 30 s abertas: ${x.n}`);
    if (APPLY && Number(x.n) > 0) throw new Error('há transação longa aberta; tente de novo depois');
    let backupArq = '';
    for (let tent = 1; tent <= 8; tent++) {
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(fs.readFileSync(DDL, 'utf8'));
        const falhas = await conferirFuncoes(tx);
        if (falhas) throw new Error(`${falhas} divergência(s) entre as funções SQL e os casos de referência; nada foi aplicado`);
        console.log(`funções SQL conferidas contra ${CASOS_LINK.length} casos + 3 normalizações: OK`);
        const div = await DIVERGENTES(tx);
        const porSlug: Record<string, number> = {};
        for (const d of div) porSlug[`${d.slug}/${d.status}/pend=${d.pend}`] = (porSlug[`${d.slug}/${d.status}/pend=${d.pend}`] ?? 0) + 1;
        console.log(`backfill: ${div.length} linhas divergentes do estado derivado`, JSON.stringify(porSlug));
        if (!APPLY) throw new Desfaz();
        fs.mkdirSync('docs/backups', { recursive: true });
        backupArq = path.join('docs/backups', `link-afiliado-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`);
        const ids = div.map((d) => d.id);
        const bk = ids.length ? await tx<{ id: string; affiliate_url: string; affiliate_link_pending: boolean }[]>`select id::text id, affiliate_url, affiliate_link_pending from affiliate_offers where id = any(${ids}::uuid[])` : [];
        fs.writeFileSync(backupArq, bk.map((b) => JSON.stringify(b)).join('\n') + (bk.length ? '\n' : ''));
        for (let i = 0; i < ids.length; i += 500) {
          const lote = ids.slice(i, i + 500);
          await tx`update affiliate_offers set affiliate_link_pending = affiliate_link_pending where id = any(${lote}::uuid[])`; // dispara o trigger (deriva o estado)
        }
        const resto = await DIVERGENTES(tx);
        console.log(`backfill aplicado: ${ids.length} linhas; divergentes restantes: ${resto.length}; backup: ${backupArq}`);
      });
      break;
    } catch (e) {
      if (e instanceof Desfaz) { console.log('dry-run concluído; nada gravado.'); break; }
      // lock_timeout (55P03): a tabela está em uso pela coleta; tenta de novo (nada foi gravado: a transação foi desfeita).
      if ((e as { code?: string }).code === '55P03' && tent < 8) { console.log(`tabela ocupada (tentativa ${tent}); repetindo...`); await new Promise((r) => setTimeout(r, 4000)); continue; }
      throw e;
    }
    }
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
