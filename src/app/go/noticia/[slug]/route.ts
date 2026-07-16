import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { newsArticles, analyticsEvents } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Cloaking link pro destaque de outro portal: nunca reproduz o texto da
 * matéria de terceiros, registra o clique como analytics_event (mesmo
 * padrão de src/app/go/[slug]/route.ts, mas evento 'news_click') e
 * redireciona pro portal de origem.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [article] = await db
    .select()
    .from(newsArticles)
    .where(and(eq(newsArticles.slug, slug), eq(newsArticles.status, 'published'), eq(newsArticles.kind, 'curated_link')))
    .limit(1);

  if (!article || !article.sourceUrl) {
    return NextResponse.redirect(new URL('/noticias', request.url), 302);
  }

  await db.insert(analyticsEvents).values({
    eventName: 'news_click',
    properties: {
      articleId: article.id,
      sourceName: article.sourceName,
      slug,
    },
    context: {
      referer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent'),
    },
  });

  return NextResponse.redirect(article.sourceUrl, 302);
}
