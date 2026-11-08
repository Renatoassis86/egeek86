import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export interface GameSynopsis {
  text: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  /** Idioma da fonte, derivado do nome gravado pelo importador ("Wikipédia (en)"). */
  lang: 'pt' | 'en';
}

/** Corrige texto gravado com a codificação duplicada (UTF-8 lido como Latin-1), sem tocar em texto sadio. */
function fixMojibake(text: string): string {
  if (!/[\u00C3\u00E2][\u0080-\u00BF]/.test(text)) return text;
  try {
    const fixed = Buffer.from(text, 'latin1').toString('utf8');
    return fixed.includes('\uFFFD') ? text : fixed;
  } catch {
    return text;
  }
}

/** Sinopse real do jogo (importada de fonte oficial com crédito). Nunca gerada aqui: sem registro, retorna null. */
export async function getGameSynopsis(masterProductId: string): Promise<GameSynopsis | null> {
  const rows = (await db.execute(sql`
    select description, attributes->'synopsis_source' as src
    from master_products where id = ${masterProductId} and vertical = 'games' limit 1`)) as unknown as Array<{
    description: string | null;
    src: { name?: string; url?: string; license?: string } | null;
  }>;
  const r = rows[0];
  if (!r?.description || !r.src?.url) return null;
  const sourceName = fixMojibake(r.src.name ?? 'Wikipédia');
  const lang: 'pt' | 'en' = /\(en\)\s*$/i.test(sourceName) || /\/\/en\.wikipedia\.org/i.test(r.src.url) ? 'en' : 'pt';
  return { text: fixMojibake(r.description), sourceName, sourceUrl: r.src.url, license: r.src.license ?? 'CC BY-SA 4.0', lang };
}
