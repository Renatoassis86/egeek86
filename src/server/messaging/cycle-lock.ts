import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runInBgPool } from '@/lib/db/pool-context';

/**
 * Trava de ciclo único do cron group-messages (P0 2026-11-13).
 *
 * Por quê: com o banco lento o ciclo passou de 60 s e o cron seguinte começava por cima, empilhando varreduras pesadas
 * (3 a 4 'live AS MATERIALIZED' simultâneas de 30 a 77 s). Só um ciclo roda por vez.
 *
 * Como: `pg_try_advisory_xact_lock` numa transação que fica aberta até `release()`. O pooler do Supabase roda em modo
 * TRANSAÇÃO, então lock de sessão não serve; o lock de transação cai sozinho no COMMIT/ROLLBACK ou quando a conexão morre.
 * Contra transação órfã (função morta no meio): `idle_in_transaction_session_timeout` de 75 s e `statement_timeout` de 5 s
 * valem SÓ nesta transação (SET LOCAL) e o servidor derruba a sessão sozinho, soltando a trava. Roda no pool 'bg' para não
 * gastar uma das conexões 'live' do ciclo.
 *
 * Falha ABERTA: se não der para consultar a trava (banco saturado, erro), o ciclo roda assim mesmo (o envio nunca para por causa da trava).
 * Só devolve `acquired: false` quando OUTRO ciclo comprovadamente segura a trava.
 */
export interface CycleLock {
  acquired: boolean;
  /** true quando a trava não pôde ser consultada e o ciclo segue sem ela. */
  failedOpen: boolean;
  release: () => void;
}

const LOCK_KEY = 'group-messages:cycle';
const ACQUIRE_TIMEOUT_MS = 8_000;

export async function acquireCycleLock(): Promise<CycleLock> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const outcome = new Promise<boolean>((resolve, reject) => {
    runInBgPool(() =>
      db
        .transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '75s'`);
          await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
          const rows = await tx.execute<{ ok: boolean }>(sql`SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})) AS ok`);
          const got = Boolean((rows as unknown as Array<{ ok: boolean }>)[0]?.ok);
          resolve(got);
          if (got) await held; // mantém a transação (e a trava) aberta até release()
        })
        .catch(reject)
    );
  });
  outcome.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), ACQUIRE_TIMEOUT_MS); });
  try {
    const r = await Promise.race([outcome, limit]);
    if (r === 'timeout') { release(); return { acquired: true, failedOpen: true, release: () => undefined }; }
    if (!r) { release(); return { acquired: false, failedOpen: false, release: () => undefined }; }
    return { acquired: true, failedOpen: false, release };
  } catch {
    release();
    return { acquired: true, failedOpen: true, release: () => undefined };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
