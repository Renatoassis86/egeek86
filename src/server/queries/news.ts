import 'server-only';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { newsArticles, type ArticleCategory, type ArticleStatus } from '@/db/schema';

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

/** Artigo público por slug — só retorna se estiver publicado (draft/archived 404 pro público). */
export async function getArticleBySlug(slug: string) {
  const [article] = await db
    .select()
    .from(newsArticles)
    .where(and(eq(newsArticles.slug, slug), eq(newsArticles.status, 'published')))
    .limit(1);

  return article ?? null;
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
