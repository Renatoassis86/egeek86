/**
 * Rótulos de categoria de notícias — centralizados aqui (mesmo padrão de
 * src/lib/affiliate/labels.ts) pra evitar o que já aconteceu antes: cada
 * categoria nova precisava ser adicionada em 4 arquivos duplicados
 * (público, detalhe, admin novo, admin editar) e era fácil esquecer um.
 */
import type { ArticleCategory } from '@/db/schema';

export const ARTICLE_CATEGORY_LABELS: Record<ArticleCategory, string> = {
  cultura_pop: 'Cultura Pop',
  sinopse_jogo: 'Sinopse de Jogo',
  tecnologia: 'Tecnologia',
  lancamentos: 'Lançamentos',
  filmes: 'Filmes',
  series_tv: 'Séries e TV',
  animes: 'Animes',
  games: 'Games',
  korea: 'Korea',
  criticas: 'Críticas',
  listas: 'Listas',
  colunistas: 'Colunistas',
  ccxp: 'CCXP',
  pesquisa_mercado: 'Pesquisas de Mercado',
};

export const ARTICLE_CATEGORY_OPTIONS = Object.entries(ARTICLE_CATEGORY_LABELS) as [ArticleCategory, string][];
