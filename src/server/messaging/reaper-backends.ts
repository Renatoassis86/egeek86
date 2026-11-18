import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Derruba conexoes ORFAS do banco (2026-11-18, fluxo parado): quando uma funcao serverless e morta no meio de um UPDATE (maxDuration), o backend fica 'active' com
 * wait_event_type = Client (ou 'idle in transaction') segurando LOCKS de linhas de group_messages/affiliate_offers; os envios seguintes esperam o lock e estouram aos 30 s
 * (resultados {failed}, ciclos de 108 a 121 s). Medido: UPDATE group_messages preso 231 s e UPDATE affiliate_offers preso 148 s.
 * So conexoes do app (application_name = egeek-web) e so acima de 120 s ativas / 90 s em transacao ociosa. Devolve quantas foram encerradas.
 */
export const REAPER_ATIVA_S = 120;
export const REAPER_OCIOSA_S = 90;
export async function encerrarBackendsOrfaos(): Promise<number> {
  try {
    const r = (await db.execute(sql`
      SELECT count(pg_terminate_backend(pid))::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND application_name = 'egeek-web'
        AND ((state = 'active' AND wait_event_type = 'Client' AND now() - query_start > make_interval(secs => ${REAPER_ATIVA_S}))
          OR (state = 'idle in transaction' AND now() - state_change > make_interval(secs => ${REAPER_OCIOSA_S})))`)) as unknown as Array<{ n: number }>;
    const n = Number(r[0]?.n ?? 0);
    if (n > 0) console.warn(`[reaper] ${n} conexao(oes) orfa(s) encerrada(s)`);
    return n;
  } catch {
    return 0;
  }
}
