import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldGroupTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { ArticleKindFields } from '@/components/admin/article-kind-fields';
import { createArticle } from '@/server/actions/news';
import { ARTICLE_CATEGORY_OPTIONS } from '@/lib/news/labels';

export default function NewArticlePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Button asChild variant="ghost" size="sm" className="w-fit -ml-2 text-[var(--color-text-secondary)]">
          <Link href="/admin/noticias">
            <ArrowLeft className="size-4" />
            Notícias
          </Link>
        </Button>
        <Text as="h1" variant="heading-xl">
          Nova matéria
        </Text>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="p-4 sm:p-6">
          <form action={createArticle} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <FieldGroupTitle>Informações Gerais</FieldGroupTitle>
              <Field label="Categoria" htmlFor="category" required>
                <Select name="category" required defaultValue="cultura_pop">
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ARTICLE_CATEGORY_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Separator />

            <ArticleKindFields />

            <Separator />

            <div className="flex flex-col gap-4">
              <FieldGroupTitle>Publicação</FieldGroupTitle>
              <Field label="Status" htmlFor="status">
                <Select name="status" defaultValue="draft">
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="published">Publicado (aparece em /noticias)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Button type="submit" size="lg" fullWidth className="sm:w-fit">
              Criar matéria
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
