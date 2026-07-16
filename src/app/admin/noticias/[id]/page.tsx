import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldGroupTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { ArticleKindFields } from '@/components/admin/article-kind-fields';
import { getArticleByIdForAdmin } from '@/server/queries/news';
import { updateArticle, publishArticle, archiveArticle } from '@/server/actions/news';

export default async function AdminArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getArticleByIdForAdmin(id);
  if (!article) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Button asChild variant="ghost" size="sm" className="w-fit -ml-2 text-[var(--color-text-secondary)]">
          <Link href="/admin/noticias">
            <ArrowLeft className="size-4" />
            Notícias
          </Link>
        </Button>
        <Text as="h1" variant="heading-xl" className="break-words">
          {article.title}
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          /noticias/{article.slug}
        </Text>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <Text variant="body-sm" color="secondary">
            Status:
          </Text>
          <Badge variant={article.status === 'published' ? 'primary' : 'default'} size="sm">
            {article.status}
          </Badge>

          <form action={publishArticle}>
            <input type="hidden" name="id" value={article.id} />
            <Button type="submit" size="sm" variant={article.status === 'published' ? 'primary' : 'secondary'}>
              Publicar
            </Button>
          </form>
          <form action={archiveArticle}>
            <input type="hidden" name="id" value={article.id} />
            <Button type="submit" size="sm" variant={article.status === 'archived' ? 'primary' : 'secondary'}>
              Arquivar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardContent className="p-4 sm:p-6">
          <form action={updateArticle} className="flex flex-col gap-6">
            <input type="hidden" name="id" value={article.id} />

            <div className="flex flex-col gap-4">
              <FieldGroupTitle>Conteúdo</FieldGroupTitle>
              <Field label="Título" htmlFor="title" required>
                <Input id="title" name="title" defaultValue={article.title} required />
              </Field>
              <Field label="Resumo" htmlFor="excerpt" required>
                <Textarea id="excerpt" name="excerpt" rows={3} defaultValue={article.excerpt} required />
              </Field>
              <Field label="Imagem de capa (URL, opcional)" htmlFor="coverImageUrl">
                <Input id="coverImageUrl" name="coverImageUrl" type="url" defaultValue={article.coverImageUrl ?? ''} />
              </Field>
              <Field label="Categoria" htmlFor="category" required>
                <Select name="category" required defaultValue={article.category}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cultura_pop">Cultura pop</SelectItem>
                    <SelectItem value="sinopse_jogo">Sinopse de jogo</SelectItem>
                    <SelectItem value="tecnologia">Tecnologia</SelectItem>
                    <SelectItem value="lancamentos">Lançamentos</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Separator />

            <ArticleKindFields
              defaultKind={article.kind}
              defaultBodyMarkdown={article.bodyMarkdown}
              defaultSourceName={article.sourceName}
              defaultSourceUrl={article.sourceUrl}
            />

            <Button type="submit" size="lg" fullWidth className="sm:w-fit">
              Salvar alterações
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
