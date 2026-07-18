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

  let finalTitle = parsed.title;
  let finalCoverImage = parsed.coverImageUrl || null;
  let finalBodyMarkdown = parsed.bodyMarkdown || null;
  let finalKind = parsed.kind;

  // Se for curated_link, transcrevemos e persistimos como original
  if (parsed.kind === 'curated_link' && parsed.sourceUrl) {
    const scraped = await scrapeNewsArticle(parsed.sourceUrl, parsed.sourceName);
    finalKind = 'original';
    finalBodyMarkdown = scraped.bodyMarkdown;
    if (!finalCoverImage && scraped.coverImageUrl) {
      finalCoverImage = scraped.coverImageUrl;
    }
  }

  const slug = await uniqueArticleSlug(slugify(finalTitle));

  const [created] = await db
    .insert(newsArticles)
    .values({
      slug,
      title: finalTitle,
      excerpt: parsed.excerpt,
      coverImageUrl: finalCoverImage,
      kind: finalKind,
      bodyMarkdown: finalBodyMarkdown,
      category: parsed.category,
      sourceName: null,
      sourceUrl: null, // assegura conformidade com o check constraint do DB
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

  let finalTitle = parsed.title;
  let finalCoverImage = parsed.coverImageUrl || null;
  let finalBodyMarkdown = parsed.bodyMarkdown || null;
  let finalKind = parsed.kind;

  // Se for curated_link, transcrevemos e persistimos como original
  if (parsed.kind === 'curated_link' && parsed.sourceUrl) {
    const scraped = await scrapeNewsArticle(parsed.sourceUrl, parsed.sourceName);
    finalKind = 'original';
    finalBodyMarkdown = scraped.bodyMarkdown;
    if (!finalCoverImage && scraped.coverImageUrl) {
      finalCoverImage = scraped.coverImageUrl;
    }
  }

  await db
    .update(newsArticles)
    .set({
      title: finalTitle,
      excerpt: parsed.excerpt,
      coverImageUrl: finalCoverImage,
      kind: finalKind,
      bodyMarkdown: finalBodyMarkdown,
      category: parsed.category,
      sourceName: null,
      sourceUrl: null, // assegura conformidade com o check constraint do DB
      updatedAt: new Date(),
    })
    .where(eq(newsArticles.id, id));

  revalidatePath('/admin/noticias');
  revalidatePath(`/admin/noticias/${id}`);
  revalidatePath('/noticias');
  redirect(`/admin/noticias/${id}`);
}

/**
 * Raspador de notícias automático a partir de matérias de terceiros.
 */
async function scrapeNewsArticle(url: string, sourceName?: string): Promise<{ title?: string; coverImageUrl?: string; bodyMarkdown: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error('Não foi possível acessar a notícia original.');

    const html = await res.text();

    // 1. og:title
    const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    let scrapedTitle = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : undefined;

    // 2. og:image
    const imgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const scrapedCover = imgMatch ? imgMatch[1].trim() : undefined;

    // 3. Parágrafos
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs: string[] = [];
    let m;
    while ((m = pRegex.exec(html)) !== null) {
      const clean = m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (clean.length > 50 && 
          !clean.toLowerCase().includes('cookie') && 
          !clean.toLowerCase().includes('política de privacidade') &&
          !clean.toLowerCase().includes('inscreva-se') &&
          !clean.toLowerCase().includes('newsletter') &&
          !clean.toLowerCase().includes('assine')) {
        paragraphs.push(clean);
      }
    }

    const bodyContent = paragraphs.slice(0, 15).join('\n\n');
    const sourceLabel = sourceName || new URL(url).hostname.replace('www.', '');
    const footerCitation = `\n\n---\n*Matéria completa publicada originalmente em [${sourceLabel}](${url}). Transcrita automaticamente para o Espaço Geek 86.*`;

    return {
      title: scrapedTitle,
      coverImageUrl: scrapedCover,
      bodyMarkdown: bodyContent + footerCitation,
    };
  } catch (error) {
    console.error('Falha ao transcrever notícia:', error);
    return {
      bodyMarkdown: `## Transcrição Indisponível\n\nNão foi possível transcrever automaticamente os parágrafos deste link. Acesse a matéria na íntegra pelo link original: [Acesse aqui](${url}).`,
    };
  }
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
