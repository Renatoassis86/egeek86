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

const CATEGORIES = [
  { value: 'cultura_pop', label: 'Cultura pop' },
  { value: 'sinopse_jogo', label: 'Sinopse de jogo' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'lancamentos', label: 'Lançamentos' },
  { value: 'filmes', label: 'Filmes' },
  { value: 'series_tv', label: 'Séries e TV' },
  { value: 'animes', label: 'Animes' },
  { value: 'games', label: 'Games' },
  { value: 'korea', label: 'Korea' },
  { value: 'criticas', label: 'Críticas' },
  { value: 'listas', label: 'Listas' },
  { value: 'colunistas', label: 'Colunistas' },
] as const;

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
              <FieldGroupTitle>Conteúdo</FieldGroupTitle>
              <Field label="Título" htmlFor="title" required>
                <Input id="title" name="title" placeholder="Novo jogo anunciado pra Switch 2" required />
              </Field>
              <Field
                label="Resumo"
                htmlFor="excerpt"
                required
                hint="Aparece no card da listagem. Pra destaque de outro portal, é o texto próprio que descreve a matéria (nunca copiar o texto original)."
              >
                <Textarea id="excerpt" name="excerpt" rows={3} placeholder="Um resumo curto e direto..." required />
              </Field>
              <Field label="Imagem de capa (URL, opcional)" htmlFor="coverImageUrl">
                <Input id="coverImageUrl" name="coverImageUrl" type="url" placeholder="https://..." />
              </Field>
              <Field label="Categoria" htmlFor="category" required>
                <Select name="category" required defaultValue="cultura_pop">
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
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
