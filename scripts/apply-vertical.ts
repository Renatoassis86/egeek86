/**
 * Aplica a migration 0027 (coluna `vertical` em master_products e affiliate_offers, CHECKs, indices parciais, product_type 'general').
 *   npx tsx --env-file=.env.local scripts/apply-vertical.ts                      # dry-run (padrao): estado + ENSAIO em tabelas TEMP (sempre ROLLBACK)
 *   npx tsx --env-file=.env.local scripts/apply-vertical.ts --apply              # aplica: ensaio, backup, log, LOCK, 1 transacao, verificacao
 *   npx tsx --env-file=.env.local scripts/apply-vertical.ts --rollback           # dry-run do rollback (nada e escrito)
 *   npx tsx --env-file=.env.local scripts/apply-vertical.ts --rollback --apply   # desfaz de verdade (aborta se houver registro fora de 'games')
 * Opcoes: --no-rehearse (pula o ensaio), --skip-prereq-check (nao exige 0025 e 0026 ja aplicadas; so com ordem do dono).
 * Aditiva e reversivel. NAO rodar sem aprovacao do dono. Sem --apply nada e escrito no banco (o ensaio so escreve em tabelas TEMP da
 * propria sessao e termina em ROLLBACK; nunca ha COMMIT no dry-run).
 *
 * Backup: backup/dados/vertical-<ts>/{master_products,affiliate_offers}.ndjson (linhas completas) + baseline.json.
 * Log: backup/dados/vertical-<ts>/log.txt. (backup/ e ignorado pelo git.)
 *
 * NOTA DE DEPLOY: depois do apply, o schema Drizzle (src/db/schema) ja lista `vertical`; `db.select().from(masterProducts)` passa a
 * pedir a coluna. Portanto: APLICAR O BANCO PRIMEIRO, so entao publicar o codigo com o schema novo. Nunca o inverso.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, type Sql, type Tx } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const NO_REHEARSE = process.argv.includes('--no-rehearse');
const SKIP_PREREQ = process.argv.includes('--skip-prereq-check');
const ROOT = process.cwd();
const dir = path.resolve(ROOT, 'drizzle/migrations');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(ROOT, 'backup', 'dados', `vertical-${stamp}`);
let logFile: string | null = null;

function log(msg: string) {
  console.log(msg);
  if (logFile) fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`, 'utf8');
}

const VERTICALS = ['games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte'];

class Abort extends Error {}
const ROLLBACK_ENSAIO = '__ROLLBACK_ENSAIO__';

type Base = { masters: number; offers: number; offersActive: number; masterTypes: Record<string, number>; offerStatus: Record<string, number> };
type Full = Base & { mastersNotGames: number; offersNotGames: number };
async function counts(tx: Sql | Tx, withVertical: true): Promise<Full>;
async function counts(tx: Sql | Tx, withVertical: false): Promise<Base>;
async function counts(tx: Sql | Tx, withVertical: boolean): Promise<Base | Full>;
async function counts(tx: Sql | Tx, withVertical: boolean): Promise<Base | Full> {
  const [m] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM master_products`;
  const [o] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM affiliate_offers`;
  const [oa] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM affiliate_offers WHERE status = 'active'`;
  const types = await tx<{ t: string; n: number }[]>`SELECT product_type::text AS t, count(*)::int AS n FROM master_products GROUP BY 1 ORDER BY 1`;
  const status = await tx<{ t: string; n: number }[]>`SELECT status::text AS t, count(*)::int AS n FROM affiliate_offers GROUP BY 1 ORDER BY 1`;
  const base = {
    masters: m.n,
    offers: o.n,
    offersActive: oa.n,
    masterTypes: Object.fromEntries(types.map((r) => [r.t, r.n])),
    offerStatus: Object.fromEntries(status.map((r) => [r.t, r.n])),
  };
  if (!withVertical) return base;
  const [nm] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM master_products WHERE vertical IS DISTINCT FROM 'games'`;
  const [no] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM affiliate_offers WHERE vertical IS DISTINCT FROM 'games'`;
  return { ...base, mastersNotGames: nm.n, offersNotGames: no.n };
}

async function estado(sql: Sql | Tx) {
  const cols = await sql<{ t: string }[]>`
    SELECT table_name AS t FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('master_products', 'affiliate_offers') AND column_name = 'vertical' ORDER BY 1`;
  const enumv = await sql<{ v: string }[]>`SELECT enumlabel AS v FROM pg_enum WHERE enumtypid = 'product_type'::regtype ORDER BY enumsortorder`;
  const idx = await sql<{ i: string }[]>`
    SELECT indexname AS i FROM pg_indexes WHERE schemaname = 'public'
      AND indexname IN ('master_products_vertical_idx', 'affiliate_offers_vertical_status_idx') ORDER BY 1`;
  const chk = await sql<{ c: string }[]>`
    SELECT conname AS c FROM pg_constraint WHERE conname IN ('master_products_vertical_chk', 'affiliate_offers_vertical_chk', 'master_products_vertical_type_chk') ORDER BY 1`;
  const pre25 = await sql<{ t: string }[]>`
    SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('collector_runs', 'collector_alert_state') ORDER BY 1`;
  const pre25c = await sql<{ c: string }[]>`
    SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'affiliate_offers'
      AND column_name IN ('last_price_confirmed_at', 'external_item_id') ORDER BY 1`;
  const [{ v }] = await sql<{ v: string }[]>`SELECT current_setting('server_version_num') AS v`;
  return {
    pgVersionNum: v,
    colunasVertical: cols.map((r) => r.t),
    productTypeEnum: enumv.map((r) => r.v),
    indices: idx.map((r) => r.i),
    checks: chk.map((r) => r.c),
    prereq0025: { tabelas: pre25.map((r) => r.t), coluna: pre25c.map((r) => r.c).includes('last_price_confirmed_at') },
    prereq0026: pre25c.map((r) => r.c).includes('external_item_id'),
  };
}

function prereqsOk(e: Awaited<ReturnType<typeof estado>>) {
  return e.prereq0025.tabelas.length === 2 && e.prereq0025.coluna && e.prereq0026;
}

async function verifyPost(sql: Sql | Tx) {
  const e = await estado(sql);
  const problems: string[] = [];
  if (e.colunasVertical.length !== 2) problems.push('coluna vertical ausente em alguma tabela');
  if (e.checks.length !== 3) problems.push(`CHECKs esperados 3, achados ${e.checks.length}`);
  if (e.indices.length !== 2) problems.push(`indices esperados 2, achados ${e.indices.length}`);
  if (!e.productTypeEnum.includes('general')) problems.push("enum product_type sem 'general'");
  const c: Full = await counts(sql, true);
  if (c.mastersNotGames !== 0 || c.offersNotGames !== 0) {
    problems.push(`registros fora de 'games' logo apos a migracao: ${c.mastersNotGames} masters, ${c.offersNotGames} ofertas`);
  }
  const rls = await sql<{ relname: string; rls: boolean; anon: boolean }[]>`
    SELECT c.relname, c.relrowsecurity AS rls,
           (has_table_privilege('anon', c.oid, 'SELECT') OR has_column_privilege('anon', c.oid, 'vertical', 'SELECT')
            OR has_table_privilege('authenticated', c.oid, 'SELECT') OR has_column_privilege('authenticated', c.oid, 'vertical', 'SELECT')) AS anon
    FROM pg_class c WHERE c.oid IN ('public.master_products'::regclass, 'public.affiliate_offers'::regclass)`;
  for (const r of rls) {
    if (!r.rls) problems.push(`RLS desligado em ${r.relname}`);
    if (r.anon) problems.push(`anon/authenticated com SELECT em ${r.relname}`);
  }
  return { e, c, problems };
}

/** Ensaio: copia as tabelas para TEMP (sombreiam as reais via search_path), roda 0027, testa CHECKs, EXPLAIN e o rollback. SEMPRE ROLLBACK. */
async function rehearse(sql: Sql, up: string, down: string) {
  const upTemp = up.replace(/^ALTER TYPE product_type ADD VALUE[^;]*;\s*$/gm, '-- (ALTER TYPE omitido no ensaio: o enum e global)');
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path = pg_temp, public`);
      await tx.unsafe(`SET LOCAL client_min_messages = warning`);
      await tx.unsafe(`CREATE TEMP TABLE master_products AS SELECT * FROM public.master_products`);
      await tx.unsafe(`CREATE TEMP TABLE affiliate_offers AS SELECT * FROM public.affiliate_offers`);
      await tx.unsafe(
        `CREATE INDEX affiliate_offers_active_price_idx ON affiliate_offers (status, current_price_cents) WHERE status = 'active' AND current_price_cents > 0`,
      );
      await tx.unsafe(`CREATE INDEX affiliate_offers_master_idx ON affiliate_offers (master_product_id)`);
      await tx.unsafe(`ANALYZE master_products`);
      await tx.unsafe(`ANALYZE affiliate_offers`);
      const before = await counts(tx, false);
      log(`[ensaio] antes: ${JSON.stringify(before)}`);

      await tx.unsafe(upTemp);
      const { mastersNotGames, offersNotGames, ...after } = await counts(tx, true);
      log(`[ensaio] depois: ${JSON.stringify({ ...after, mastersNotGames, offersNotGames })}`);
      if (JSON.stringify(after) !== JSON.stringify(before) || mastersNotGames || offersNotGames) {
        throw new Abort('ensaio: contagens divergentes ou registro fora de games');
      }
      await tx.unsafe(upTemp); // idempotencia: segunda execucao nao pode falhar
      log('[ensaio] OK: aplicar duas vezes e idempotente; contagens identicas; 0 fora de games');

      const expectFail = async (label: string, stmt: string) => {
        let failed = false;
        try {
          await tx.savepoint(async (sp) => {
            await sp.unsafe(stmt);
          });
        } catch (e) {
          failed = true;
          log(`[ensaio] OK rejeitado (${label}): ${(e as Error).message}`);
        }
        if (!failed) throw new Abort(`ensaio: ${label} deveria ter falhado`);
      };
      await expectFail('vertical invalida', `UPDATE master_products SET vertical = 'foo' WHERE id = (SELECT id FROM master_products LIMIT 1)`);
      await expectFail(
        'vertical<>games com product_type=game',
        `UPDATE master_products SET vertical = 'tecnologia' WHERE id = (SELECT id FROM master_products WHERE product_type = 'game' LIMIT 1)`,
      );
      await expectFail('oferta com vertical invalida', `UPDATE affiliate_offers SET vertical = 'foo' WHERE id = (SELECT id FROM affiliate_offers LIMIT 1)`);
      // (o caso 'games' + 'general' nao e ensaiavel: o valor so existe depois do COMMIT real; coberto no teste pos-apply)

      // EXPLAIN real (planos nas copias TEMP, estatisticas recem-analisadas), com 1 master e suas ofertas movidos para 'tecnologia'
      await tx.unsafe(
        `UPDATE master_products SET product_type = 'accessory', vertical = 'tecnologia' WHERE id = (SELECT id FROM master_products WHERE product_type = 'accessory' LIMIT 1)`,
      );
      await tx.unsafe(`UPDATE affiliate_offers SET vertical = 'tecnologia' WHERE master_product_id = (SELECT id FROM master_products WHERE vertical = 'tecnologia' LIMIT 1)`);
      await tx.unsafe(`ANALYZE master_products`);
      await tx.unsafe(`ANALYZE affiliate_offers`);
      const plans: Array<[string, string]> = [
        ['publico gamer (active + preco + vertical=games)', `SELECT count(*) FROM affiliate_offers WHERE status = 'active' AND current_price_cents > 0 AND vertical = 'games'`],
        ['fila por vertical (ofertas ativas de tecnologia)', `SELECT id FROM affiliate_offers WHERE vertical = 'tecnologia' AND status = 'active'`],
        ['masters de tecnologia', `SELECT id FROM master_products WHERE vertical = 'tecnologia'`],
        ['teste de vazamento (masters fora de games)', `SELECT count(*) FROM master_products WHERE vertical <> 'games'`],
      ];
      for (const [label, q] of plans) {
        const r = await tx.unsafe(`EXPLAIN ${q}`);
        log(`[EXPLAIN] ${label}\n  ${r.map((x) => String(x['QUERY PLAN'])).join('\n  ')}`);
      }

      // Rollback: a trava deve barrar com registro fora de games; sem ele, deve desfazer e deixar o estado original.
      await expectFail('rollback com registro fora de games', down);
      await tx.unsafe(`UPDATE affiliate_offers SET vertical = 'games'`);
      await tx.unsafe(`UPDATE master_products SET vertical = 'games' WHERE vertical = 'tecnologia'`);
      await tx.unsafe(down);
      const gone = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema LIKE 'pg_temp%' AND table_name IN ('master_products', 'affiliate_offers') AND column_name = 'vertical'`;
      if (gone[0].n !== 0) throw new Abort('ensaio: rollback nao removeu a coluna');
      await tx.unsafe(down); // idempotente
      log('[ensaio] OK: rollback barra com dado fora de games, desfaz limpo e e idempotente');
      throw new Abort(ROLLBACK_ENSAIO);
    });
  } catch (e) {
    if (e instanceof Abort && e.message === ROLLBACK_ENSAIO) {
      log('[ensaio] transacao encerrada com ROLLBACK (nada gravado)');
      return true;
    }
    log(`[ensaio] FALHOU: ${(e as Error).message}`);
    return false;
  }
}

async function backup(sql: Sql) {
  fs.mkdirSync(outDir, { recursive: true });
  const baseline = { takenAt: new Date().toISOString(), counts: await counts(sql, false), estado: await estado(sql) };
  fs.writeFileSync(path.join(outDir, 'baseline.json'), JSON.stringify(baseline, null, 2), 'utf8');
  for (const t of ['master_products', 'affiliate_offers']) {
    const file = path.join(outDir, `${t}.ndjson`);
    fs.writeFileSync(file, '', 'utf8');
    let n = 0;
    await sql.unsafe(`SELECT row_to_json(t)::text AS j FROM ${t} t`).cursor(2000, async (rows) => {
      fs.appendFileSync(file, rows.map((r) => String(r.j)).join('\n') + '\n', 'utf8');
      n += rows.length;
    });
    log(`backup ${t}: ${n} linhas em ${path.relative(ROOT, file)}`);
  }
  return baseline;
}

async function main() {
  const sql = connect();
  try {
    if (APPLY) {
      fs.mkdirSync(outDir, { recursive: true });
      logFile = path.join(outDir, 'log.txt');
    }
    const upText = fs.readFileSync(path.join(dir, '0027_vertical.sql'), 'utf8');
    const downText = fs.readFileSync(path.join(dir, '0027_vertical.rollback.sql'), 'utf8');
    const est = await estado(sql);
    const jaAplicada = est.colunasVertical.length === 2;
    log(`Modo: ${APPLY ? '' : 'DRY-RUN '}${ROLLBACK ? 'ROLLBACK' : 'APPLY'}  Verticais permitidas: ${VERTICALS.join(', ')}`);
    log(`Estado atual: ${JSON.stringify(est)}`);
    log(`Contagens atuais: ${JSON.stringify(await counts(sql, jaAplicada))}`);
    log(`Pre-requisitos 0025/0026 aplicados: ${prereqsOk(est) ? 'sim' : 'NAO'}`);

    if (!APPLY) {
      if (!NO_REHEARSE && !jaAplicada) {
        if (!(await rehearse(sql, upText, downText))) process.exitCode = 1;
      } else if (jaAplicada) {
        log('Ensaio pulado: a coluna ja existe (o ensaio parte do estado sem a coluna).');
      }
      log(`DRY-RUN: ${ROLLBACK ? '0027_vertical.rollback.sql' : '0027_vertical.sql'} NAO executado. Use --apply${ROLLBACK ? ' junto com --rollback' : ''}.`);
      return;
    }

    if (ROLLBACK) {
      if (jaAplicada) {
        const [m] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM master_products WHERE vertical <> 'games'`;
        const [o] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM affiliate_offers WHERE vertical <> 'games'`;
        if (m.n > 0 || o.n > 0) throw new Error(`Rollback barrado: ${m.n} masters e ${o.n} ofertas fora de games.`);
      }
      await backup(sql);
      await sql.begin(async (tx) => {
        await tx.unsafe(downText);
      });
      log(`Rollback executado. Estado: ${JSON.stringify(await estado(sql))}`);
      return;
    }

    if (jaAplicada && est.checks.length === 3 && est.indices.length === 2 && est.productTypeEnum.includes('general')) {
      log('Migracao 0027 ja aplicada. Nada a fazer.');
      return;
    }
    if (!prereqsOk(est) && !SKIP_PREREQ) {
      throw new Error('0025 e/ou 0026 nao aplicadas. Ordem do dono: 0025 -> 0026 -> 0027. (--skip-prereq-check para forcar.)');
    }
    if (!NO_REHEARSE && !jaAplicada && !(await rehearse(sql, upText, downText))) throw new Error('Ensaio falhou; nada foi aplicado.');

    const baseline = await backup(sql);
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL lock_timeout = '5s'`);
      await tx.unsafe(`LOCK TABLE master_products, affiliate_offers IN ACCESS EXCLUSIVE MODE`);
      const pre = await counts(tx, false);
      log(`[tx] contagens sob lock (antes): ${JSON.stringify(pre)}`);
      await tx.unsafe(upText);
      const { c, problems } = await verifyPost(tx);
      const { mastersNotGames, offersNotGames, ...post } = c;
      void mastersNotGames;
      void offersNotGames;
      if (JSON.stringify(post) !== JSON.stringify(pre)) {
        problems.push(`contagens divergem sob lock: antes=${JSON.stringify(pre)} depois=${JSON.stringify(post)}`);
      }
      if (problems.length) throw new Error(`Verificacao falhou, ROLLBACK da transacao: ${problems.join('; ')}`);
      log('[tx] verificacao ok, confirmando (COMMIT)');
    });
    const final = await verifyPost(sql);
    log(`Pos-commit: ${JSON.stringify(final.e)}`);
    log(`Pos-commit contagens: ${JSON.stringify(final.c)}`);
    if (final.problems.length) {
      log(`ATENCAO pos-commit: ${final.problems.join('; ')}`);
      process.exitCode = 1;
    }
    log(`Baseline: ${JSON.stringify(baseline.counts)}`);
    log('Aplicado. Proximo: publicar o codigo com o schema Drizzle novo (DEPOIS do banco) e rodar os testes de isolamento.');
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  log(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
