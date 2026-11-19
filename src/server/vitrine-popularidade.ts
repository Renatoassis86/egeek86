import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { POPULARIDADE_VALIDADE_DIAS } from '@/lib/popularidade/score';
import { chavePopularidade } from '@/lib/vitrine/hierarquia-ofertas';

/**
 * Mapa de popularidade (offer_popularity) para a hierarquia da vitrine: UMA leitura pequena (a tabela guarda so os mais vendidos por categoria, centenas de linhas),
 * sem juncao com ofertas, em memoria por 5 min. Falha ou demora (> 1,5 s) = mapa vazio (a vitrine nunca espera por isso; popularidade 0 so deixa de pesar).
 */
const TTL_MS = 5 * 60_000;
const ESPERA_MS = 1500;
let cache: { em: number; mapa: Map<string, number> } | null = null;
let emVoo: Promise<Map<string, number>> | null = null;

async function ler(): Promise<Map<string, number>> {
  const rows = await db.execute<{ network_id: string; external_ref: string; score: number }>(sql`
    SELECT network_id, external_ref, max(score)::float AS score
    FROM offer_popularity
    WHERE observed_at > now() - make_interval(days => ${POPULARIDADE_VALIDADE_DIAS}::int)
    GROUP BY network_id, external_ref
    LIMIT 5000`);
  const mapa = new Map<string, number>();
  for (const r of rows) mapa.set(chavePopularidade(r.network_id, r.external_ref), Number(r.score) || 0);
  return mapa;
}

export async function carregarPopularidade(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.em < TTL_MS) return cache.mapa;
  if (!emVoo) {
    emVoo = ler()
      .then((m) => {
        cache = { em: Date.now(), mapa: m };
        return m;
      })
      .finally(() => {
        emVoo = null;
      });
    emVoo.catch(() => undefined);
  }
  try {
    return await Promise.race([emVoo, new Promise<Map<string, number>>((_, rej) => setTimeout(() => rej(new Error('espera')), ESPERA_MS))]);
  } catch {
    return cache?.mapa ?? new Map();
  }
}
