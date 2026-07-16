'use client';

import { useState } from 'react';
import { Field, FieldGroupTitle } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ArticleKind } from '@/db/schema';

/**
 * Toggle entre 'original' (corpo em Markdown) e 'curated_link' (nome + link
 * do portal de origem) — os dois submetem pelo mesmo <form action={...}>
 * nativo do pai (Select/Input/Textarea participam de form via `name`, não
 * precisam de um wrapper de estado no pai).
 */
export function ArticleKindFields({
  defaultKind = 'original',
  defaultBodyMarkdown,
  defaultSourceName,
  defaultSourceUrl,
}: {
  defaultKind?: ArticleKind;
  defaultBodyMarkdown?: string | null;
  defaultSourceName?: string | null;
  defaultSourceUrl?: string | null;
}) {
  const [kind, setKind] = useState<ArticleKind>(defaultKind);

  return (
    <div className="flex flex-col gap-4">
      <FieldGroupTitle>Tipo de conteúdo</FieldGroupTitle>
      <Field label="Tipo" htmlFor="kind" required>
        <Select name="kind" value={kind} onValueChange={(v) => setKind(v as ArticleKind)}>
          <SelectTrigger id="kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="original">Artigo próprio (escrito por nós)</SelectItem>
            <SelectItem value="curated_link">Destaque de outro portal (link de saída)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {kind === 'original' ? (
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
      ) : (
        <>
          <Field label="Nome do portal de origem" htmlFor="sourceName">
            <Input id="sourceName" name="sourceName" defaultValue={defaultSourceName ?? ''} placeholder="IGN Brasil" />
          </Field>
          <Field
            label="Link da matéria original"
            htmlFor="sourceUrl"
            required
            hint="O clique no card leva direto pra esse link (via /go/noticia), nunca reproduzimos o texto da matéria."
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
        </>
      )}
    </div>
  );
}
