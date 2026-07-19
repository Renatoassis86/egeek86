'use client';

import { useState } from 'react';
import { Field, FieldGroupTitle } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { ArticleKind } from '@/db/schema';

export function ArticleKindFields({
  defaultKind = 'original',
  defaultTitle = '',
  defaultExcerpt = '',
  defaultCoverImageUrl = '',
  defaultBodyMarkdown = '',
  defaultSourceName = '',
  defaultSourceUrl = '',
  defaultKeywords = '',
}: {
  defaultKind?: ArticleKind;
  defaultTitle?: string;
  defaultExcerpt?: string;
  defaultCoverImageUrl?: string | null;
  defaultBodyMarkdown?: string | null;
  defaultSourceName?: string | null;
  defaultSourceUrl?: string | null;
  defaultKeywords?: string | null;
}) {
  const [kind, setKind] = useState<ArticleKind>(defaultKind);
  const [coverPreview, setCoverPreview] = useState<string>(defaultCoverImageUrl || '');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem é muito grande. O limite máximo é de 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCoverPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="coverImageBase64" value={coverPreview} />

      <FieldGroupTitle>Origem do Conteúdo</FieldGroupTitle>
      <Field label="Método de Publicação" htmlFor="kind" required>
        <Select name="kind" value={kind} onValueChange={(v) => setKind(v as ArticleKind)}>
          <SelectTrigger id="kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="original">Conteúdo Autoral (Manual)</SelectItem>
            <SelectItem value="curated_link">Importar via Link (Raspagem Automática)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {kind === 'original' ? (
        <>
          <Field label="Título" htmlFor="title" required>
            <Input id="title" name="title" defaultValue={defaultTitle} placeholder="Título da matéria..." required />
          </Field>
          <Field label="Resumo" htmlFor="excerpt" required>
            <Textarea id="excerpt" name="excerpt" rows={3} defaultValue={defaultExcerpt} placeholder="Resumo da matéria..." required />
          </Field>
          
          <Field label="Imagem de capa (URL ou upload local)" htmlFor="coverImageUrl">
            <div className="flex flex-col gap-3">
              <Input
                id="coverImageUrl"
                name="coverImageUrl"
                type="url"
                value={coverPreview.startsWith('data:') ? '' : coverPreview}
                onChange={(e) => setCoverPreview(e.target.value)}
                placeholder="https://..."
              />
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  id="coverImageFile"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('coverImageFile')?.click()}
                >
                  Upload de Arquivo Local
                </Button>
                {coverPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-text-secondary)] hover:text-red-500"
                    onClick={() => setCoverPreview('')}
                  >
                    Remover imagem
                  </Button>
                )}
              </div>
              {coverPreview && (
                <div className="relative aspect-[16/9] w-full max-w-sm overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverPreview} alt="Preview da capa" className="h-full w-full object-cover" />
                </div>
              )}
            </div>
          </Field>

          <Field label="Palavras-chave (separadas por vírgula, opcional)" htmlFor="keywords">
            <Input id="keywords" name="keywords" defaultValue={defaultKeywords || ''} placeholder="jogos, lançamento, switch 2" />
          </Field>

          <Field
            label="Corpo do artigo (Markdown)"
            htmlFor="bodyMarkdown"
            required
            hint="Suporta títulos (##), negrito, listas, links e imagens em Markdown."
          >
            <Textarea
              id="bodyMarkdown"
              name="bodyMarkdown"
              rows={16}
              defaultValue={defaultBodyMarkdown ?? ''}
              placeholder={'## Um título\n\nO corpo da matéria...'}
              required
            />
          </Field>
        </>
      ) : (
        <>
          <Field
            label="Link da matéria original"
            htmlFor="sourceUrl"
            required
            hint="Cole o link. Faremos a raspagem automática do título, corpo de texto, imagem e adicionaremos a citação."
          >
            <Input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              defaultValue={defaultSourceUrl ?? ''}
              placeholder="https://..."
              required
            />
          </Field>
          <Field label="Nome do portal de origem (opcional)" htmlFor="sourceName">
            <Input id="sourceName" name="sourceName" defaultValue={defaultSourceName ?? ''} placeholder="IGN Brasil, Tecnoblog, etc." />
          </Field>

          <Field label="Palavras-chave (separadas por vírgula, opcional - se vazio, tenta obter do link)" htmlFor="keywordsImport">
            <Input id="keywordsImport" name="keywords" defaultValue={defaultKeywords || ''} placeholder="jogos, lançamento, switch 2" />
          </Field>

          <Field label="Imagem de capa local (opcional - substitui a raspada)" htmlFor="coverImageFileImport">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  id="coverImageFileImport"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('coverImageFileImport')?.click()}
                >
                  Upload de Arquivo Local
                </Button>
                {coverPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-text-secondary)] hover:text-red-500"
                    onClick={() => setCoverPreview('')}
                  >
                    Remover imagem
                  </Button>
                )}
              </div>
              {coverPreview && (
                <div className="relative aspect-[16/9] w-full max-w-sm overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverPreview} alt="Preview da capa" className="h-full w-full object-cover" />
                </div>
              )}
            </div>
          </Field>
        </>
      )}
    </div>
  );
}
