import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterProducts } from '@/db/schema';

/**
 * Normaliza o título de um item para comparação/deduplicação.
 * Remove acentos, caracteres especiais, termos comuns de plataforma e ruídos comerciais.
 */
export function normalizeTitle(title: string): { cleanTitle: string; platform: string } {
  let text = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase();

  // Extrai a plataforma de jogo
  let platform = 'unknown';
  if (text.includes('nintendo switch 2') || text.includes('switch 2')) {
    platform = 'switch_2';
  } else if (text.includes('nintendo switch') || text.includes('switch') || text.includes('nsw') || text.includes('lite')) {
    platform = 'switch_1';
  } else if (text.includes('ps5') || text.includes('playstation 5')) {
    platform = 'ps5';
  } else if (text.includes('ps4') || text.includes('playstation 4')) {
    platform = 'ps4';
  } else if (text.includes('xbox series x/s') || text.includes('xbox series') || text.includes('xbox series x') || text.includes('xbox series s')) {
    platform = 'xbox_series';
  } else if (text.includes('xbox one') || text.includes('xb1')) {
    platform = 'xbox_one';
  } else if (text.includes('xbox 360') || text.includes('x360')) {
    platform = 'xbox_360';
  }

  // Remove ruídos de termos de plataforma
  text = text
    .replace(/nintendo switch 2/g, '')
    .replace(/nintendo switch/g, '')
    .replace(/switch 2/g, '')
    .replace(/switch/g, '')
    .replace(/playstation 5/g, '')
    .replace(/playstation 4/g, '')
    .replace(/ps5/g, '')
    .replace(/ps4/g, '')
    .replace(/xbox series x\/s/g, '')
    .replace(/xbox series x/g, '')
    .replace(/xbox series s/g, '')
    .replace(/xbox series/g, '')
    .replace(/xbox one/g, '')
    .replace(/xbox 360/g, '');

  // Termos irrelevantes que costumam poluir anúncios
  const noiseWords = [
    'fisico', 'fisica', 'midia fisica', 'midia', 'jogo', 'original', 'lacrado', 'novo', 'nna', 'edicao', 'edition',
    'standard', 'classico', 'portugues', 'dublado', 'legendado', 'br', 'usa', 'eur', 'nsc', 'nna', 'brinde', 'promocao'
  ];

  // Limpa caracteres especiais, pontuação etc.
  text = text.replace(/[^a-z0-9\s]+/g, ' ');

  // Separa em palavras, filtra ruídos e reagrupa
  const tokens = text.split(/\s+/).filter(token => token.length > 1 && !noiseWords.includes(token));

  return {
    cleanTitle: tokens.join(' ').trim(),
    platform
  };
}

/**
 * Busca um masterProduct correspondente no banco usando lógica de similaridade textual.
 * Compara o cleanTitle normalizado e o Jaccard Similarity dos conjuntos de palavras (tokens).
 */
export async function findExistingMasterProduct(name: string, platformGen: string): Promise<any | null> {
  const normInput = normalizeTitle(name);
  if (!normInput.cleanTitle) return null;

  // Filtra candidatos da mesma plataforma de hardware
  const candidates = await db
    .select({
      id: masterProducts.id,
      name: masterProducts.name,
      gamePlatformGen: masterProducts.gamePlatformGen
    })
    .from(masterProducts)
    .where(eq(masterProducts.gamePlatformGen, (platformGen || normInput.platform) as any));

  for (const candidate of candidates) {
    const normCand = normalizeTitle(candidate.name);
    
    // Comparação de igualdade exata após normalização
    if (normCand.cleanTitle === normInput.cleanTitle) {
      return candidate;
    }

    // Comparação por Jaccard Similarity das palavras
    const candTokens = new Set(normCand.cleanTitle.split(' '));
    const inputTokens = normInput.cleanTitle.split(' ');
    
    const intersection = inputTokens.filter(t => candTokens.has(t));
    const unionSize = Math.max(candTokens.size, inputTokens.length);
    const similarity = intersection.length / unionSize;

    // Se bater mais de 80% dos termos cruciais de título na mesma plataforma, é o mesmo item
    if (similarity >= 0.8) {
      return candidate;
    }
  }

  return null;
}
