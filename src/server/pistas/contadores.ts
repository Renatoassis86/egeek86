import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runInBgPool } from '@/lib/db/pool-context';
import { ContadoresMem, type LinhaContador } from '@/lib/pistas/contadores-mem';
import { horaBucket } from '@/lib/pistas/admissao';

/**
 * R-112: contadores por canal/hora/tipo/marca. Leitura e escrita ATOMICAS em memoria do processo (ContadoresMem); gravacao AGREGADA em lote em
 * `pista_contador` (INSERT ... ON CONFLICT DO UPDATE n = n + delta); NUNCA um SELECT sobre o historico a cada confirmacao.
 * Reconstrucao leve quando o processo sobe: uma consulta (2 h) com LIMIT.
 */
export const contadores = new ContadoresMem();

const MARCA_SEM = '';
const LIM_RECONSTRUCAO = 5000;
const REC_TIMEOUT = '5s';

async function comTimeout<T>(ms: string, fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return runInBgPool(() => db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${ms.replace(/[^0-9a-z]/g, '')}'`));
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    return fn(tx);
  }));
}

/** Fase 2 (envio real): reconstroi a hora corrente e a anterior a partir dos ENVIOS reais em group_messages (2 h, uma consulta). Usa a coluna `tipo` quando preenchida. */
export async function reconstruirDeEnvios(canais: readonly string[]): Promise<number> {
  if (!canais.length) return 0;
  const rows = await comTimeout(REC_TIMEOUT, (tx) => tx.execute<{ canal: string; hora: string; tipo: string | null; marca: string | null }>(sql`
    SELECT vertical::text AS canal, date_trunc('hour', sent_at) AS hora, COALESCE(tipo, candidate ->> 'tipo') AS tipo, NULL::text AS marca
    FROM group_messages
    WHERE status = 'enviada' AND created_at >= now() - interval '6 hours' AND sent_at >= now() - interval '2 hours' AND vertical = ANY(${sql.raw(`ARRAY[${canais.map((c) => `'${c.replace(/[^a-z0-9-]/g, '')}'`).join(',')}]::text[]`)})
    LIMIT ${LIM_RECONSTRUCAO}`));
  let n = 0;
  for (const r of rows as unknown as Array<{ canal: string; hora: string; tipo: string | null; marca: string | null }>) {
    contadores.incrementar(r.canal, new Date(r.hora), r.tipo, r.marca, 1, false);
    n++;
  }
  return n;
}

/** Sombra: reconstroi a partir das decisoes 'enviaria' das ultimas 2 h (o que a pista SIMULOU enviar). */
export async function reconstruirDeDecisoes(canais: readonly string[]): Promise<number> {
  if (!canais.length) return 0;
  const rows = await comTimeout(REC_TIMEOUT, (tx) => tx.execute<{ canal: string; janela: string; tipo: string | null; marca: string | null }>(sql`
    SELECT canal, janela, tipo, marca FROM pista_decisao
    WHERE decisao = 'enviaria' AND criado_em >= now() - interval '2 hours' AND canal = ANY(${sql.raw(`ARRAY[${canais.map((c) => `'${c.replace(/[^a-z0-9-]/g, '')}'`).join(',')}]::text[]`)})
    LIMIT ${LIM_RECONSTRUCAO}`));
  let n = 0;
  for (const r of rows as unknown as Array<{ canal: string; janela: string; tipo: string | null; marca: string | null }>) {
    contadores.incrementar(r.canal, new Date(r.janela), r.tipo, r.marca, 1, false);
    n++;
  }
  return n;
}

/** Grava os deltas pendentes em UM INSERT multi-linha (agregado). Falhou: devolve os deltas ao contador (nada se perde) e propaga o erro ao chamador. */
export async function gravarLote(): Promise<number> {
  const lote: LinhaContador[] = contadores.coletarLote();
  if (!lote.length) return 0;
  try {
    const valores = lote.map((l) => sql`(${l.canal}, ${new Date(l.horaMs).toISOString()}::timestamptz, ${l.tipo}, ${l.marca ?? MARCA_SEM}, ${l.n})`);
    await comTimeout('5s', (tx) => tx.execute(sql`
      INSERT INTO pista_contador (canal, hora_bucket, tipo, marca, n)
      VALUES ${sql.join(valores, sql`, `)}
      ON CONFLICT (canal, hora_bucket, tipo, marca) DO UPDATE SET n = pista_contador.n + EXCLUDED.n, atualizado = now()`));
    return lote.length;
  } catch (e) {
    contadores.devolver(lote);
    throw e;
  }
}

export { horaBucket };
