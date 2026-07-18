'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ShieldCheck, Flame, Image as ImageIcon, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { createCollectorDrop } from '@/server/actions/collector';

export function CreateDropForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [story, setStory] = useState('');
  const [priceBRL, setPriceBRL] = useState('');
  const [startsAtStr, setStartsAtStr] = useState('');
  const [stockLimit, setStockLimit] = useState(1);
  const [imageUrlInputs, setImageUrlInputs] = useState<string[]>(['']);

  const handleAddImageInput = () => {
    if (imageUrlInputs.length >= 10) {
      toast.error('O limite máximo é de 10 fotos.');
      return;
    }
    setImageUrlInputs((prev) => [...prev, '']);
  };

  const handleRemoveImageInput = (index: number) => {
    if (imageUrlInputs.length === 1) {
      setImageUrlInputs(['']);
      return;
    }
    setImageUrlInputs((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleImageInputChange = (index: number, value: string) => {
    setImageUrlInputs((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Preencha o título do produto.');
      return;
    }

    if (!description.trim()) {
      toast.error('Preencha a descrição do produto.');
      return;
    }

    if (!story.trim()) {
      toast.error('Preencha o storytelling / história do item.');
      return;
    }

    if (story.length < 15) {
      toast.error('Escreva uma história um pouco maior (mínimo 15 caracteres) para atrair compradores!');
      return;
    }

    const priceNum = parseFloat(priceBRL.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error('Preencha um preço de venda válido.');
      return;
    }

    if (!startsAtStr) {
      toast.error('Preencha a data e hora do lançamento do Drop.');
      return;
    }

    const images = imageUrlInputs.filter(Boolean);
    if (images.length === 0) {
      toast.error('Insira pelo menos 1 imagem válida para o item.');
      return;
    }

    if (images.length > 10) {
      toast.error('O limite máximo é de 10 fotos.');
      return;
    }

    const priceCents = Math.round(priceNum * 100);

    startTransition(async () => {
      const res = await createCollectorDrop({
        title,
        description,
        story,
        priceCents,
        startsAtStr,
        stockLimit,
        images,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
        router.push('/hype-zone');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <Card className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/30">
        <CardContent className="p-6 md:p-8 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)]">
              <Flame className="size-5" />
            </div>
            <div>
              <Text variant="heading-md">Agendar Novo Drop C2C</Text>
              <Text variant="caption" color="tertiary">
                Publique seu item colecionável e agende o cronômetro na Hype Zone.
              </Text>
            </div>
          </div>

          <div className="border-t border-[var(--color-border-subtle)] pt-4 flex flex-col gap-4">
            
            {/* Título do Produto */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="title" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                Título do Item Colecionável
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Nintendo Switch OLED Splatoon 3 Edition (Lacrado)"
                required
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors"
              />
            </div>

            {/* História da Peça (Storytelling - Foco em valorização) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="story" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                  História da Peça (Storytelling)
                </label>
                <span className="text-[10px] text-[var(--color-accent-hype)] font-semibold">Valorize seu item!</span>
              </div>
              <textarea
                id="story"
                rows={3}
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder="Conte de onde veio a peça, por que ela é especial e qual a história dela no seu acervo..."
                required
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2 text-body-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors resize-none"
              />
            </div>

            {/* Descrição Detalhada */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="description" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                Descrição Completa (Estado de conservação, detalhes técnicos, etc.)
              </label>
              <textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes sobre riscos, caixa inclusa, cabos, manuais, etc..."
                required
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2 text-body-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors resize-none"
              />
            </div>

            {/* Preço e Estoque */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="price" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                  Preço de Venda (R$)
                </label>
                <input
                  id="price"
                  type="text"
                  value={priceBRL}
                  onChange={(e) => setPriceBRL(e.target.value)}
                  placeholder="Ex: 2.450,00"
                  required
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="stock" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                  Limite de Estoque do Drop
                </label>
                <input
                  id="stock"
                  type="number"
                  min={1}
                  max={100}
                  value={stockLimit}
                  onChange={(e) => setStockLimit(parseInt(e.target.value) || 1)}
                  required
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors font-mono"
                />
              </div>
            </div>

            {/* Data e Hora de Lançamento */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="startsAt" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                Agendamento de Data e Hora de Lançamento (Drop)
              </label>
              <div className="relative">
                <input
                  id="startsAt"
                  type="datetime-local"
                  value={startsAtStr}
                  onChange={(e) => setStartsAtStr(e.target.value)}
                  required
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors font-mono"
                />
              </div>
            </div>

            {/* Upload de Imagens (Limite de 10) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-body-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <ImageIcon className="size-4" />
                  Imagens do Colecionável (Máximo 10)
                </label>
                <span className={cn(
                  "text-[10px] font-mono",
                  imageUrlInputs.length >= 10 ? "text-[var(--color-accent-danger)] font-bold" : "text-[var(--color-text-tertiary)]"
                )}>
                  {imageUrlInputs.filter(Boolean).length} / 10 adicionadas
                </span>
              </div>

              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto border border-[var(--color-border-subtle)] rounded-[var(--radius-sm)] p-3 bg-[var(--color-bg-surface)]">
                {imageUrlInputs.map((url, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <div className="text-[10px] font-mono text-[var(--color-text-tertiary)] w-5 text-right">
                      #{idx + 1}
                    </div>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => handleImageInputChange(idx, e.target.value)}
                      placeholder="Cole a URL da foto do seu item (ex: http://...)"
                      className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-3 h-8 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors"
                    />
                    
                    {/* Thumbnail Preview */}
                    {url && (
                      <div className="relative size-8 rounded border border-[var(--color-border-subtle)] overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="preview" className="h-full w-full object-cover" onError={(e) => { (e.target as any).src = '/images/emblem/6-collectibles.png'; }} />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveImageInput(idx)}
                      className="text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-danger)] transition-colors p-1"
                      aria-label="Remover imagem"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>

              {imageUrlInputs.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddImageInput}
                  className="w-full h-8 mt-1 border-dashed flex items-center justify-center gap-1.5"
                >
                  <Plus className="size-3.5" /> Adicionar Outra Foto
                </Button>
              )}
            </div>

          </div>

          <Button
            type="submit"
            disabled={isPending}
            variant="hype"
            size="lg"
            className="w-full mt-2 font-bold"
            leftIcon={<ShieldCheck className="size-5" />}
          >
            {isPending ? 'Cadastrando e Agendando Drop...' : 'Concluir e Agendar na Hype Zone'}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
