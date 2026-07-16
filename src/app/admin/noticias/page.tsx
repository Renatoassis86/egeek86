import Link from 'next/link';
import { ChevronRight, Newspaper } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { getAdminArticles } from '@/server/queries/news';
import type { ArticleStatus, ArticleKind } from '@/db/schema';

// Sem searchParams — força dinâmica (ver nota em src/app/admin/page.tsx).
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};

const STATUS_VARIANT: Record<ArticleStatus, 'default' | 'primary' | 'danger'> = {
  draft: 'default',
  published: 'primary',
  archived: 'danger',
};

const KIND_LABEL: Record<ArticleKind, string> = {
  original: 'Artigo',
  curated_link: 'Destaque',
};

export default async function AdminNoticiasPage() {
  const { items } = await getAdminArticles({});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Text as="h1" variant="heading-xl">
            Notícias
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-1">
            {items.length} {items.length === 1 ? 'matéria' : 'matérias'}
          </Text>
        </div>
        <Button asChild fullWidth className="sm:w-fit">
          <Link href="/admin/noticias/novo">Nova matéria</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Newspaper className="size-8 text-[var(--color-text-tertiary)]" aria-hidden />
            <Text variant="body-md">Nenhuma matéria cadastrada.</Text>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                  <th className="px-4 py-3 text-caption font-medium text-[var(--color-text-tertiary)]">Matéria</th>
                  <th className="px-4 py-3 text-caption font-medium text-[var(--color-text-tertiary)]">Tipo</th>
                  <th className="px-4 py-3 text-caption font-medium text-[var(--color-text-tertiary)]">Categoria</th>
                  <th className="px-4 py-3 text-caption font-medium text-[var(--color-text-tertiary)]">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((article) => (
                  <tr
                    key={article.id}
                    className="border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-bg-surface)] transition-colors duration-[var(--duration-fast)]"
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <Link href={`/admin/noticias/${article.id}`} className="hover:underline">
                        <Text variant="body-sm" className="line-clamp-1">
                          {article.title}
                        </Text>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" size="sm">
                        {KIND_LABEL[article.kind]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Text variant="body-sm" color="secondary">
                        {article.category}
                      </Text>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[article.status]} size="sm">
                        {STATUS_LABEL[article.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-1 text-right">
                      <Button asChild variant="ghost" size="icon-sm" aria-label="Ver detalhes da matéria">
                        <Link href={`/admin/noticias/${article.id}`}>
                          <ChevronRight className="size-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 lg:hidden">
            {items.map((article) => (
              <Link key={article.id} href={`/admin/noticias/${article.id}`}>
                <Card interactive>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Text variant="body-md" className="line-clamp-1">
                        {article.title}
                      </Text>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Badge variant={STATUS_VARIANT[article.status]} size="sm">
                          {STATUS_LABEL[article.status]}
                        </Badge>
                        <Badge variant="outline" size="sm">
                          {KIND_LABEL[article.kind]}
                        </Badge>
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-[var(--color-text-tertiary)]" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
