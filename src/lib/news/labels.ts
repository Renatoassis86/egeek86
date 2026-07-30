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

/**
 * Cor por categoria — inspirado no padrão globo.com/UOL (cada editoria tem
 * sua própria cor, aplicada de forma consistente no card inteiro: borda,
 * título e etiqueta). Classes Tailwind por extenso de propósito (não
 * interpoladas por variável) pra o scanner do Tailwind conseguir gerar
 * cada uma — string montada em runtime não é detectada.
 */
export const ARTICLE_CATEGORY_STYLES: Record<
  ArticleCategory,
  { border: string; heading: string; chipBg: string; chipText: string }
> = {
  cultura_pop: { border: 'border-amber-200', heading: 'text-amber-700', chipBg: 'bg-amber-50', chipText: 'text-amber-700' },
  sinopse_jogo: { border: 'border-emerald-200', heading: 'text-emerald-700', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700' },
  tecnologia: { border: 'border-sky-200', heading: 'text-sky-700', chipBg: 'bg-sky-50', chipText: 'text-sky-700' },
  lancamentos: { border: 'border-rose-200', heading: 'text-rose-700', chipBg: 'bg-rose-50', chipText: 'text-rose-700' },
  filmes: { border: 'border-red-200', heading: 'text-red-700', chipBg: 'bg-red-50', chipText: 'text-red-700' },
  series_tv: { border: 'border-violet-200', heading: 'text-violet-700', chipBg: 'bg-violet-50', chipText: 'text-violet-700' },
  animes: { border: 'border-pink-200', heading: 'text-pink-700', chipBg: 'bg-pink-50', chipText: 'text-pink-700' },
  games: { border: 'border-green-200', heading: 'text-green-700', chipBg: 'bg-green-50', chipText: 'text-green-700' },
  korea: { border: 'border-fuchsia-200', heading: 'text-fuchsia-700', chipBg: 'bg-fuchsia-50', chipText: 'text-fuchsia-700' },
  criticas: { border: 'border-orange-200', heading: 'text-orange-700', chipBg: 'bg-orange-50', chipText: 'text-orange-700' },
  listas: { border: 'border-cyan-200', heading: 'text-cyan-700', chipBg: 'bg-cyan-50', chipText: 'text-cyan-700' },
  colunistas: { border: 'border-indigo-200', heading: 'text-indigo-700', chipBg: 'bg-indigo-50', chipText: 'text-indigo-700' },
  ccxp: { border: 'border-purple-200', heading: 'text-purple-700', chipBg: 'bg-purple-50', chipText: 'text-purple-700' },
  pesquisa_mercado: { border: 'border-teal-200', heading: 'text-teal-700', chipBg: 'bg-teal-50', chipText: 'text-teal-700' },
};
