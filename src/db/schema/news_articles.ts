import { pgTable, uuid, text, timestamp, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { citext } from './_types';
import { articleKind, articleCategory, articleStatus } from './_enums';
import { profiles } from './profiles';

/**
 * news_articles — módulo de Notícias. Duas naturezas de conteúdo na mesma
 * tabela (aparecem juntas na listagem, ordenadas por data):
 * - 'original': matéria escrita pela editoria, lida inteira em /noticias/[slug]
 *   (bodyMarkdown obrigatório, sourceUrl vazio).
 * - 'curated_link': destaque de matéria de outro portal — só um resumo
 *   original (campo `excerpt`, sempre obrigatório) + link de saída pro
 *   portal de origem via /go/noticia/[slug]. Nunca reproduz o texto de
 *   terceiros (bodyMarkdown vazio, sourceUrl obrigatório).
 */
export const newsArticles = pgTable(
  'news_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: citext('slug').notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull(),
    coverImageUrl: text('cover_image_url'),
    kind: articleKind('kind').notNull(),
    bodyMarkdown: text('body_markdown'),
    category: articleCategory('category').notNull(),
    sourceName: text('source_name'),
    sourceUrl: text('source_url'),
    keywords: text('keywords'),
    status: articleStatus('status').notNull().default('draft'),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('news_articles_slug_uq').on(t.slug),
    index('news_articles_status_published_idx')
      .on(t.status, t.publishedAt)
      .where(sql`status = 'published'`),
    index('news_articles_category_idx').on(t.category),
    check(
      'news_articles_kind_consistency_chk',
      sql`(${t.kind} = 'original' AND ${t.bodyMarkdown} IS NOT NULL AND ${t.sourceUrl} IS NULL)
        OR (${t.kind} = 'curated_link' AND ${t.sourceUrl} IS NOT NULL AND ${t.bodyMarkdown} IS NULL)`
    ),
  ]
);

export type NewsArticle = typeof newsArticles.$inferSelect;
export type NewNewsArticle = typeof newsArticles.$inferInsert;
export type ArticleKind = (typeof articleKind.enumValues)[number];
export type ArticleCategory = (typeof articleCategory.enumValues)[number];
export type ArticleStatus = (typeof articleStatus.enumValues)[number];
