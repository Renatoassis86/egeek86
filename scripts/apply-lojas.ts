/**
 * Aplica as migracoes 0032 (lojas/secoes) e 0033 (vertical impressao3d). Plano: docs/plano-lojas-secoes-canais-2026-11-11.md.
 *   npx tsx --env-file=.env.local scripts/apply-lojas.ts            # DRY-RUN: estado + TESTE DE ROLLBACK (transacao sempre desfeita)
 *   npx tsx --env-file=.env.local scripts/apply-lojas.ts --apply    # backup + teste de rollback + 0032 + 0033 (uma transacao cada)
 *
 * Sequencia do --apply (para tudo e relata se qualquer passo divergir):
 *   1. Backup logico (NDJSON) de group_messages e feature_flags + definicao dos CHECKs, em backup/dados/lojas-pre-0032-<ts>/.
 *   2. Teste de rollback: BEGIN; 0032; 0033; ensaio do CHECK; rollback 0033; rollback 0032; confere que o estado voltou ao original; ROLLBACK.
 *   3. 0032 em transacao propria (REPEATABLE READ), contagens antes/depois identicas, backfill 100%; COMMIT.
 *   4. 0033 em transacao propria, contagens antes/depois identicas, CHECKs preservam as verticais atuais + impressao3d; COMMIT.
 * Log: backup/logs/apply-lojas-<ts>.log. NAO rodar sem autorizacao do dono (dada em 2026-11-11). Nenhuma linha de negocio e escrita.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, type Sql, type Tx } from './_dup-shared';

const APPLY = process.argv.includes('--apply');
const root = process.cwd();
const migDir = path.resolve(root, 'drizzle/migrations');
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = path.resolve(root, 'backup/logs', `apply-lojas-${ts}.log`);
const backupDir = path.resolve(root, 'backup/dados', `lojas-pre-0032-${ts}`);
fs.mkdirSync(path.dirname(logPath), { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logPath, line + '\n');
}
const read = (f: string) => fs.readFileSync(path.join(migDir, f), 'utf8');
const SQL = {
  m32: read('0032_store_sections.sql'),
  r32: read('0032_store_sections.rollback.sql'),
  m33: read('0033_vertical_impressao3d.sql'),
  r33: read('0033_vertical_impressao3d.rollback.sql'),
};
const NEW_TABLES = ['store_sections', 'store_section_verticals', 'telegram_chat_discoveries'];
const OLD_VERTICALS = ['games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte'];

type Q = Sql | Tx;

/** Foto das contagens de negocio. Dentro de uma transacao REPEATABLE READ e estavel (mesmo snapshot). */
async function snapshot(q: Q) {
  const masters = await q`SELECT vertical, count(*)::int AS n FROM master_products GROUP BY 1 ORDER BY 1`;
  const offers = await q`SELECT vertical, status::text AS status, count(*)::int AS n FROM affiliate_offers GROUP BY 1, 2 ORDER BY 1, 2`;
  const gm = await q`SELECT vertical, count(*)::int AS n FROM group_messages GROUP BY 1 ORDER BY 1`;
  const media = await q`
    SELECT count(*)::int AS n, coalesce(sum(current_price_cents), 0)::text AS soma, coalesce(round(avg(current_price_cents))::bigint, 0)::text AS media
    FROM affiliate_offers WHERE vertical = 'games' AND status = 'active' AND current_price_cents > 0`;
  const flags = await q`SELECT count(*)::int AS n FROM feature_flags`;
  return JSON.stringify({ masters, offers, group_messages: gm, mediaGamesAtivas: media[0], feature_flags: flags[0].n });
}

async function estrutura(q: Q) {
  const tabs = await q<{ t: string }[]>`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY(${NEW_TABLES}) ORDER BY 1`;
  const col = await q<{ c: string }[]>`SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'group_messages' AND column_name = 'store_id'`;
  const chk = await q<{ conname: string; d: string; convalidated: boolean }[]>`
    SELECT conname, pg_get_constraintdef(oid) AS d, convalidated FROM pg_constraint
    WHERE conname IN ('master_products_vertical_chk', 'affiliate_offers_vertical_chk') ORDER BY conname`;
  return { tabelas: tabs.map((r) => r.t), temStoreId: col.length === 1, checks: chk.map((r) => ({ conname: r.conname, d: r.d, ok: r.convalidated })) };
}

function checkHas(def: string, v: string) {
  return def.includes(`'${v}'::text`);
}

async function verificaPos32(tx: Tx) {
  const st = await estrutura(tx);
  if (JSON.stringify(st.tabelas) !== JSON.stringify([...NEW_TABLES].sort())) throw new Error(`pos-0032: tabelas inesperadas ${JSON.stringify(st.tabelas)}`);
  if (!st.temStoreId) throw new Error('pos-0032: group_messages.store_id ausente');
  const orf = await tx`SELECT count(*)::int AS n FROM group_messages WHERE store_id IS NULL`;
  if (orf[0].n !== 0) throw new Error(`pos-0032: ${orf[0].n} linhas de group_messages sem store_id (backfill incompleto)`);
  const errado = await tx`
    SELECT count(*)::int AS n FROM group_messages g JOIN store_section_verticals v ON v.store_id = g.store_id WHERE v.vertical <> g.vertical`;
  if (errado[0].n !== 0) throw new Error(`pos-0032: ${errado[0].n} linhas com store_id de outra vertical`);
  const g = await tx`SELECT s.slug, s.stage, s.telegram_chat_id, s.limits FROM store_sections s WHERE s.slug = 'games'`;
  const lim = g[0]?.limits as Record<string, unknown> | undefined;
  if (!lim || lim.dailyCap !== 400 || lim.hourlyCap !== 60 || lim.spacingDayMin !== 1) throw new Error('pos-0032: limites da loja games divergem dos atuais');
  const lojas = await tx`SELECT slug, stage, telegram_chat_id FROM store_sections ORDER BY slug`;
  const comChat = lojas.filter((l) => l.telegram_chat_id !== null);
  if (comChat.length) throw new Error('pos-0032: loja com chat id gravado (nao deveria)');
  const map = await tx`SELECT vertical FROM store_section_verticals ORDER BY vertical`;
  if (map.length !== 7) throw new Error(`pos-0032: ${map.length} verticais mapeadas (esperado 7)`);
  return { lojas: lojas.map((l) => `${l.slug}:${l.stage}`), verticaisMapeadas: map.length };
}

async function verificaPos33(tx: Tx) {
  const st = await estrutura(tx);
  if (st.checks.length !== 2) throw new Error('pos-0033: CHECKs de vertical nao encontrados');
  for (const c of st.checks) {
    for (const v of [...OLD_VERTICALS, 'impressao3d']) if (!checkHas(c.d, v)) throw new Error(`pos-0033: ${c.conname} sem '${v}'`);
    if (!c.ok) throw new Error(`pos-0033: ${c.conname} nao validado`);
  }
  return st.checks.map((c) => c.conname);
}

/**
 * Trava ACCESS EXCLUSIVE das tabelas que a migracao altera, numa unica instrucao, ANTES de qualquer consulta da transacao (em
 * REPEATABLE READ o snapshot nasce na 1a consulta). Pegar o lock forte de uma vez evita o deadlock de "promocao de lock" contra as
 * transacoes curtas do coletor (medido: SRE + ALTER deu 40P01). A transacao dura poucos segundos; lock_timeout aborta em vez de enfileirar.
 */
async function travar(tx: Tx, tabelas: string[]) {
  await tx.unsafe("SET LOCAL lock_timeout = '8s'");
  await tx.unsafe(`LOCK TABLE ${tabelas.join(', ')} IN ACCESS EXCLUSIVE MODE`);
}

/** Repete a transacao inteira em deadlock (40P01), falha de serializacao (40001) ou lock_timeout (55P03). */
async function comRetry<T>(nome: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (i < 10 && (code === '40P01' || code === '40001' || code === '55P03')) {
        log(`${nome}: tentativa ${i} abortada (${code}); nada gravado; repetindo`);
        await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 3000)));
        continue;
      }
      throw e;
    }
  }
}

class Desfeito extends Error {}

/** Roda `fn` numa transacao que e SEMPRE desfeita; devolve null se OK ou a mensagem de erro. */
async function ensaio(nome: string, tabelas: string[], fn: (tx: Tx) => Promise<void>): Promise<string | null> {
  let erro: string | null = null;
  try {
    await comRetry(nome, () =>
      sql_().begin('ISOLATION LEVEL REPEATABLE READ', async (tx) => {
        await travar(tx, tabelas);
        await fn(tx);
        throw new Desfeito();
      }),
    );
  } catch (e) {
    if (!(e instanceof Desfeito)) erro = e instanceof Error ? e.message : String(e);
  }
  return erro;
}
let _sql: Sql | null = null;
const sql_ = () => _sql as Sql;

/** Teste de rollback: duas transacoes de ensaio (uma por migracao, como na aplicacao real), ambas DESFEITAS. */
async function testeRollback(sql: Sql) {
  _sql = sql;
  log('--- TESTE DE ROLLBACK (transacoes de ensaio, sempre DESFEITAS) ---');
  const e32 = await ensaio('teste-0032', ['group_messages'], async (tx) => {
    const antes = await snapshot(tx);
    const estAntes = await estrutura(tx);
    await tx.unsafe(SQL.m32);
    log(`teste 0032: aplicada na tx de ensaio -> ${JSON.stringify(await verificaPos32(tx))}`);
    await tx.unsafe(SQL.r32);
    const estDepois = await estrutura(tx);
    const depois = await snapshot(tx);
    if (JSON.stringify(estDepois.tabelas) !== JSON.stringify(estAntes.tabelas) || estDepois.temStoreId !== estAntes.temStoreId) throw new Error('rollback 0032 nao restaurou a estrutura');
    if (antes !== depois) throw new Error(`contagens mudaram.
antes=${antes}
depois=${depois}`);
    log('teste 0032: BEGIN; 0032; rollback 0032; verificacao OK (tabelas e store_id removidos; contagens identicas)');
  });
  const e33 = await ensaio('teste-0033', ['master_products', 'affiliate_offers'], async (tx) => {
    const antes = await snapshot(tx);
    const estAntes = await estrutura(tx);
    await tx.unsafe(SQL.m33);
    log(`teste 0033: aplicada na tx de ensaio -> CHECKs ${JSON.stringify(await verificaPos33(tx))}`);
    // Ensaio do CHECK com um master real de impressora 3D (em tecnologia); o UPDATE e desfeito no ponto de salvamento.
    const alvo = await tx`SELECT id FROM master_products WHERE vertical = 'tecnologia' AND name ~* 'impressora 3d' LIMIT 1`;
    if (alvo.length) {
      await tx.unsafe('SAVEPOINT ensaio_check');
      await tx`UPDATE master_products SET vertical = 'impressao3d' WHERE id = ${alvo[0].id}`;
      log('teste 0033: CHECK aceitou vertical=impressao3d em um master real (UPDATE desfeito)');
      // Trava do rollback 0033: com linha na vertical nova ele DEVE abortar.
      await tx.unsafe('SAVEPOINT ensaio_trava');
      let abortou = false;
      try {
        await tx.unsafe(SQL.r33);
      } catch {
        abortou = true;
      }
      await tx.unsafe('ROLLBACK TO SAVEPOINT ensaio_trava');
      await tx.unsafe('ROLLBACK TO SAVEPOINT ensaio_check');
      if (!abortou) throw new Error('rollback 0033 NAO abortou com linha em impressao3d (trava falhou)');
      log('teste 0033: trava do rollback abortou corretamente com linha em impressao3d');
    } else {
      log('teste 0033: nenhum master de impressora 3D para ensaiar o CHECK (pulado)');
    }
    await tx.unsafe(SQL.r33);
    const estDepois = await estrutura(tx);
    const depois = await snapshot(tx);
    if (JSON.stringify(estDepois.checks.map((c) => c.d)) !== JSON.stringify(estAntes.checks.map((c) => c.d))) throw new Error('CHECKs diferentes do original apos rollback 0033');
    if (antes !== depois) throw new Error(`contagens mudaram.
antes=${antes}
depois=${depois}`);
    log('teste 0033: BEGIN; 0033; rollback 0033; verificacao OK (CHECKs identicos ao original; contagens identicas)');
  });
  const ok = !e32 && !e33;
  log(`TESTE DE ROLLBACK: ${ok ? 'OK' : `FALHOU 0032=${e32 ?? 'ok'} 0033=${e33 ?? 'ok'}`} (transacoes desfeitas; nada gravado)`);
  return ok;
}

async function backup(sql: Sql) {
  fs.mkdirSync(backupDir, { recursive: true });
  const gm = await sql`SELECT * FROM group_messages ORDER BY sent_at NULLS LAST, id`;
  fs.writeFileSync(path.join(backupDir, 'group_messages.ndjson'), gm.map((r) => JSON.stringify(r)).join('\n') + (gm.length ? '\n' : ''));
  const ff = await sql`SELECT * FROM feature_flags ORDER BY key`;
  fs.writeFileSync(path.join(backupDir, 'feature_flags.ndjson'), ff.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const est = await estrutura(sql);
  const resumo = {
    geradoEm: new Date().toISOString(),
    group_messages: { contagem: gm.length, amostraIds: gm.slice(0, 5).concat(gm.slice(-5)).map((r) => r.id) },
    feature_flags: { contagem: ff.length, chaves: ff.map((r) => r.key) },
    estrutura: est,
    snapshot: JSON.parse(await snapshot(sql)),
    restaurar: 'rollbacks em drizzle/migrations/0033_*.rollback.sql e 0032_*.rollback.sql; group_messages/feature_flags nao sao alteradas alem de store_id (derivado)',
  };
  fs.writeFileSync(path.join(backupDir, 'resumo.json'), JSON.stringify(resumo, null, 2));
  log(`BACKUP: ${backupDir} | group_messages=${gm.length} linhas | feature_flags=${ff.length} | amostra de ids=${resumo.group_messages.amostraIds.slice(0, 3).join(',')}...`);
}

async function aplicar(sql: Sql, nome: string, texto: string, tabelas: string[], verifica: (tx: Tx) => Promise<unknown>) {
  await comRetry(nome, () => sql.begin('ISOLATION LEVEL REPEATABLE READ', async (tx) => {
    await travar(tx, tabelas);
    const antes = await snapshot(tx);
    await tx.unsafe(texto);
    const extra = await verifica(tx);
    const depois = await snapshot(tx);
    if (antes !== depois) throw new Error(`${nome}: contagens ANTES e DEPOIS divergem.\nantes=${antes}\ndepois=${depois}`);
    log(`${nome}: contagens antes/depois IDENTICAS: ${antes}`);
    log(`${nome}: verificacoes internas OK: ${JSON.stringify(extra)}`);
  }));
  log(`${nome}: COMMIT feito.`);
}

async function main() {
  const sql = connect();
  try {
    log(`apply-lojas ${APPLY ? '--apply' : 'DRY-RUN'}`);
    const est0 = await estrutura(sql);
    log(`Estado inicial: ${JSON.stringify(est0)}`);
    log(`Snapshot inicial: ${await snapshot(sql)}`);
    if (est0.tabelas.length || est0.temStoreId) throw new Error('0032 parece ja aplicada (tabelas/coluna existem). Nada a fazer.');
    if (est0.checks.some((c) => checkHas(c.d, 'impressao3d'))) throw new Error('0033 parece ja aplicada.');

    if (APPLY) await backup(sql);
    const ok = await testeRollback(sql);
    if (!ok) throw new Error('Teste de rollback FALHOU: nada foi aplicado em producao.');
    if (!APPLY) {
      log('DRY-RUN concluido: teste de rollback OK, nada gravado. Use --apply.');
      return;
    }
    await aplicar(sql, '0032', SQL.m32, ['group_messages'], verificaPos32);
    await aplicar(sql, '0033', SQL.m33, ['master_products', 'affiliate_offers'], verificaPos33);
    const estF = await estrutura(sql);
    log(`Estado final: ${JSON.stringify(estF)}`);
    log(`Snapshot final: ${await snapshot(sql)}`);
    log('CONCLUIDO: 0032 e 0033 aplicadas.');
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  log(`ERRO: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
