import 'server-only';
import { eq, and, desc, count, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { newsArticles, profiles, type ArticleCategory, type ArticleStatus } from '@/db/schema';
import { fuzzyMatch } from '@/lib/db/fuzzy-search';

export interface PaginatedArticles<T> {
  items: T[];
  totalCount: number;
  totalPages: number;
}

/**
 * Listagem pública (só publicados, mais recente primeiro). Filtro de
 * categoria opcional — mesmo padrão de searchParams já usado em /ofertas.
 */
export async function getPublishedArticles({
  category,
  page = 1,
  pageSize = 12,
}: {
  category?: ArticleCategory;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedArticles<typeof newsArticles.$inferSelect>> {
  const conditions = [eq(newsArticles.status, 'published')];
  if (category) conditions.push(eq(newsArticles.category, category));
  const where = and(...conditions);

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(newsArticles)
      .where(where)
      .orderBy(desc(newsArticles.publishedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(newsArticles).where(where),
  ]);

  const total = Number(countResult?.[0]?.total ?? 0);

  return { items, totalCount: total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Busca livre por título, só publicados — usada pela busca global do header. */
export async function searchPublishedArticles(query: string, limit = 4) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const fuzzy = fuzzyMatch([newsArticles.title], trimmed);
  if (!fuzzy) return [];

  return db
    .select()
    .from(newsArticles)
    .where(and(eq(newsArticles.status, 'published'), fuzzy))
    .orderBy(desc(newsArticles.publishedAt))
    .limit(limit);
}

/** Artigo público por slug — só retorna se estiver publicado (draft/archived 404 pro público). */
export async function getArticleBySlug(slug: string) {
  const [article] = await db
    .select()
    .from(newsArticles)
    .where(and(eq(newsArticles.slug, slug), eq(newsArticles.status, 'published')))
    .limit(1);

  return article ?? null;
}

/** Nome real do autor (join simples) — pra assinatura da matéria, nunca um nome inventado. */
export async function getArticleAuthorName(authorId: string): Promise<string | null> {
  const [row] = await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, authorId)).limit(1);
  return row?.name ?? null;
}

/**
 * Matérias relacionadas por categoria ("Leia também") — mesma categoria da
 * atual, excluindo ela mesma, mais recentes primeiro. Retorna array vazio se
 * não houver outra matéria publicada na categoria (nunca preenche com item
 * de categoria diferente só pra completar um número redondo).
 */
export async function getRelatedArticles(
  category: ArticleCategory,
  excludeId: string,
  limit = 3
): Promise<(typeof newsArticles.$inferSelect)[]> {
  return db
    .select()
    .from(newsArticles)
    .where(and(eq(newsArticles.status, 'published'), eq(newsArticles.category, category), ne(newsArticles.id, excludeId)))
    .orderBy(desc(newsArticles.publishedAt))
    .limit(limit);
}

/**
 * Listagem admin — vê qualquer status. NUNCA importar isso numa página
 * pública, só em rotas atrás de requireAdmin().
 */
export async function getAdminArticles({
  status,
  page = 1,
  pageSize = 20,
}: {
  status?: ArticleStatus;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedArticles<typeof newsArticles.$inferSelect>> {
  const where = status ? eq(newsArticles.status, status) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(newsArticles)
      .where(where)
      .orderBy(desc(newsArticles.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(newsArticles).where(where),
  ]);

  return { items, totalCount: total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Artigo por ID pra pré-preencher o form de edição no admin (qualquer status). */
export async function getArticleByIdForAdmin(id: string) {
  const [article] = await db.select().from(newsArticles).where(eq(newsArticles.id, id)).limit(1);
  return article ?? null;
}
