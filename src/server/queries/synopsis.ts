import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export interface GameSynopsis {
  text: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
}

/** Sinopse real do jogo (importada de fonte oficial com crédito). Nunca gerada aqui: sem registro, retorna null. */
export async function getGameSynopsis(masterProductId: string): Promise<GameSynopsis | null> {
  const rows = (await db.execute(sql`
    select description, attributes->'synopsis_source' as src
    from master_products where id = ${masterProductId} limit 1`)) as unknown as Array<{
    description: string | null;
    src: { name?: string; url?: string; license?: string } | null;
  }>;
  const r = rows[0];
  if (!r?.description || !r.src?.url) return null;
  return { text: r.description, sourceName: r.src.name ?? 'Wikipédia', sourceUrl: r.src.url, license: r.src.license ?? 'CC BY-SA 4.0' };
}
