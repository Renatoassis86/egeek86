'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { newsArticles } from '@/db/schema';
import { requireAdmin } from '@/lib/auth/require-admin';
import { slugify } from '@/lib/slugify';

const articleSchema = z
  .object({
    title: z.string().min(2),
    excerpt: z.string().min(2),
    coverImageUrl: z.string().url().optional().or(z.literal('')),
    kind: z.enum(['original', 'curated_link']),
    bodyMarkdown: z.string().optional(),
    category: z.enum(['cultura_pop', 'sinopse_jogo', 'tecnologia', 'lancamentos']),
    sourceName: z.string().optional(),
    sourceUrl: z.string().url().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'original' && !data.bodyMarkdown?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Corpo do artigo é obrigatório pra matéria original', path: ['bodyMarkdown'] });
    }
    if (data.kind === 'curated_link' && !data.sourceUrl?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Link de origem é obrigatório pra destaque de outro portal', path: ['sourceUrl'] });
    }
  });

function parseArticleForm(formData: FormData) {
  return articleSchema.parse({
    title: formData.get('title'),
    excerpt: formData.get('excerpt'),
    coverImageUrl: formData.get('coverImageUrl') || undefined,
    kind: formData.get('kind'),
    bodyMarkdown: formData.get('bodyMarkdown') || undefined,
    category: formData.get('category'),
    sourceName: formData.get('sourceName') || undefined,
    sourceUrl: formData.get('sourceUrl') || undefined,
  });
}

/** Sufixo aleatório evita colisão do índice único de slug, mesmo padrão de createOffer. */
async function uniqueArticleSlug(base: string): Promise<string> {
  const [existing] = await db.select({ id: newsArticles.id }).from(newsArticles).where(eq(newsArticles.slug, base)).limit(1);
  if (!existing) return base;
  return `${base}-${randomUUID().slice(0, 6)}`;
}

export async function createArticle(formData: FormData) {
  const profile = await requireAdmin();
  const parsed = parseArticleForm(formData);
  const status = formData.get('status') === 'published' ? 'published' : 'draft';
  const slug = await uniqueArticleSlug(slugify(parsed.title));

  const [created] = await db
    .insert(newsArticles)
    .values({
      slug,
      title: parsed.title,
      excerpt: parsed.excerpt,
      coverImageUrl: parsed.coverImageUrl || null,
      kind: parsed.kind,
      bodyMarkdown: parsed.kind === 'original' ? (parsed.bodyMarkdown ?? null) : null,
      category: parsed.category,
      sourceName: parsed.kind === 'curated_link' ? parsed.sourceName || null : null,
      sourceUrl: parsed.kind === 'curated_link' ? (parsed.sourceUrl ?? null) : null,
      status,
      authorId: profile.id,
      publishedAt: status === 'published' ? new Date() : null,
    })
    .returning();

  revalidatePath('/admin/noticias');
  revalidatePath('/noticias');
  redirect(`/admin/noticias/${created.id}`);
}

/** Slug é imutável após criado (mesmo princípio de affiliate_offers.slug). */
export async function updateArticle(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id'));
  const parsed = parseArticleForm(formData);

  await db
    .update(newsArticles)
    .set({
      title: parsed.title,
      excerpt: parsed.excerpt,
      coverImageUrl: parsed.coverImageUrl || null,
      kind: parsed.kind,
      bodyMarkdown: parsed.kind === 'original' ? (parsed.bodyMarkdown ?? null) : null,
      category: parsed.category,
      sourceName: parsed.kind === 'curated_link' ? parsed.sourceName || null : null,
      sourceUrl: parsed.kind === 'curated_link' ? (parsed.sourceUrl ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(newsArticles.id, id));

  revalidatePath('/admin/noticias');
  revalidatePath(`/admin/noticias/${id}`);
  revalidatePath('/noticias');
  redirect(`/admin/noticias/${id}`);
}

/** Preserva o publishedAt original se já existia (republicar não conta como nova publicação). */
export async function publishArticle(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id'));

  const [existing] = await db
    .select({ publishedAt: newsArticles.publishedAt })
    .from(newsArticles)
    .where(eq(newsArticles.id, id))
    .limit(1);
  if (!existing) throw new Error('Artigo não encontrado');

  await db
    .update(newsArticles)
    .set({ status: 'published', publishedAt: existing.publishedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(newsArticles.id, id));

  revalidatePath('/admin/noticias');
  revalidatePath(`/admin/noticias/${id}`);
  revalidatePath('/noticias');
}

export async function archiveArticle(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id'));

  await db.update(newsArticles).set({ status: 'archived', updatedAt: new Date() }).where(eq(newsArticles.id, id));

  revalidatePath('/admin/noticias');
  revalidatePath(`/admin/noticias/${id}`);
  revalidatePath('/noticias');
}
