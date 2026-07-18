'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ShieldCheck, Gavel, Image as ImageIcon, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { createCollectorAuction } from '@/server/actions/auction';

export function CreateAuctionForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minBidStr, setMinBidStr] = useState('');
  const [reservePriceStr, setReservePriceStr] = useState('');
  const [buyoutPriceStr, setBuyoutPriceStr] = useState('');
  const [startsAtStr, setStartsAtStr] = useState('');
  const [endsAtStr, setEndsAtStr] = useState('');
  const [imageUrlInputs, setImageUrlInputs] = useState<string[]>(['']);
  const [urlMode, setUrlMode] = useState<Record<number, boolean>>({});

  const handleFileUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem é muito grande. O limite máximo é de 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleImageInputChange(index, reader.result);
        toast.success(`Imagem #${index + 1} carregada com sucesso!`);
      }
    };
    reader.onerror = () => {
      toast.error('Erro ao ler a imagem.');
    };
    reader.readAsDataURL(file);
  };

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
      setUrlMode((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });
      return;
    }
    setImageUrlInputs((prev) => prev.filter((_, idx) => idx !== index));
    setUrlMode((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
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

    if (!title.trim() || !description.trim()) {
      toast.error('Preencha o título e descrição do lote.');
      return;
    }

    const minBidVal = parseFloat(minBidStr.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (isNaN(minBidVal) || minBidVal <= 0) {
      toast.error('Informe um lance mínimo inicial válido.');
      return;
    }

    const reserveVal = reservePriceStr ? parseFloat(reservePriceStr.replace(/[^\d.,]/g, '').replace(',', '.')) : 0;
    const buyoutVal = buyoutPriceStr ? parseFloat(buyoutPriceStr.replace(/[^\d.,]/g, '').replace(',', '.')) : 0;

    if (!startsAtStr || !endsAtStr) {
      toast.error('Informe os horários de início e encerramento do leilão.');
      return;
    }

    const images = imageUrlInputs.filter(Boolean);
    if (images.length === 0) {
      toast.error('Insira pelo menos 1 imagem válida para o item.');
      return;
    }

    startTransition(async () => {
      const res = await createCollectorAuction({
        title,
        description,
        images,
        startsAt: startsAtStr,
        endsAt: endsAtStr,
        minBidCents: Math.round(minBidVal * 100),
        reservePriceCents: reserveVal ? Math.round(reserveVal * 100) : undefined,
        buyoutPriceCents: buyoutVal ? Math.round(buyoutVal * 100) : undefined,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message || 'Leilão enviado para moderação.');
        router.push('/hype-zone/leiloes');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <Card className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/30">
        <CardContent className="p-6 md:p-8 flex flex-col gap-5">
          
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)]">
              <Gavel className="size-5" />
            </div>
            <div>
              <Text variant="heading-md">Criar Novo Leilão de Raridade (Geek Hammer)</Text>
              <Text variant="caption" color="tertiary">
                Cadastre seu lote, defina regras de lances e envie para a curadoria da comunidade.
              </Text>
            </div>
          </div>

          <div className="border-t border-[var(--color-border-subtle)] pt-4 flex flex-col gap-4">
            
            {/* Título */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="title" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                Título do Item/Lote
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Cartucho Chrono Trigger Super Nintendo original na caixa (Grade 8.5)"
                required
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors"
              />
            </div>

            {/* Descrição e História do Item */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="description" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                Descrição dos Detalhes & Estado Físico
              </label>
              <textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Especifique o estado de conservação, detalhes da embalagem, manuais inclusos e o histórico de aquisição..."
                required
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2 text-body-sm text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors resize-none"
              />
            </div>

            {/* Preços e Valores */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="minBid" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                  Lance Mínimo Inicial
                </label>
                <input
                  id="minBid"
                  type="text"
                  value={minBidStr}
                  onChange={(e) => setMinBidStr(e.target.value)}
                  placeholder="R$ 100,00"
                  required
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reserve" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                  Preço de Reserva (Opcional)
                </label>
                <input
                  id="reserve"
                  type="text"
                  value={reservePriceStr}
                  onChange={(e) => setReservePriceStr(e.target.value)}
                  placeholder="R$ 1.500,00"
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="buyout" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                  Compra Imediata (Opcional)
                </label>
                <input
                  id="buyout"
                  type="text"
                  value={buyoutPriceStr}
                  onChange={(e) => setBuyoutPriceStr(e.target.value)}
                  placeholder="R$ 3.000,00"
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] font-mono"
                />
              </div>
            </div>

            {/* Agendamentos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="startsAt" className="text-body-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <Calendar className="size-4" /> Data/Hora de Início
                </label>
                <input
                  id="startsAt"
                  type="datetime-local"
                  value={startsAtStr}
                  onChange={(e) => setStartsAtStr(e.target.value)}
                  required
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="endsAt" className="text-body-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <Calendar className="size-4" /> Data/Hora de Fechamento
                </label>
                <input
                  id="endsAt"
                  type="datetime-local"
                  value={endsAtStr}
                  onChange={(e) => setEndsAtStr(e.target.value)}
                  required
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 h-10 text-body-sm text-[var(--color-text-primary)] font-mono"
                />
              </div>
            </div>

            {/* Upload de Imagens */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-body-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <ImageIcon className="size-4" />
                  Fotos do Lote (Máximo 10)
                </label>
                <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
                  {imageUrlInputs.filter(Boolean).length} / 10 adicionadas
                </span>
              </div>

              <div className="flex flex-col gap-3 max-h-80 overflow-y-auto border border-[var(--color-border-subtle)] rounded-[var(--radius-sm)] p-3 bg-[var(--color-bg-surface)]">
                {imageUrlInputs.map((url, idx) => {
                  const isUrlMode = !!urlMode[idx];
                  return (
                    <div key={idx} className="flex flex-col gap-2 p-3 border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)]/50 rounded-[var(--radius-sm)] relative">
                      <div className="flex justify-between items-center text-[10px] font-mono text-[var(--color-text-tertiary)]">
                        <span>Foto #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveImageInput(idx)}
                          className="hover:text-[var(--color-accent-danger)] transition-colors text-[10px]"
                        >
                          Remover Slot
                        </button>
                      </div>

                      <div className="flex gap-3 items-center">
                        <div className="relative size-12 rounded border border-[var(--color-border-subtle)] overflow-hidden bg-[var(--color-bg-inset)] shrink-0 flex items-center justify-center">
                          {url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt="Preview" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="size-5 text-[var(--color-text-tertiary)]" />
                          )}
                        </div>

                        <div className="flex-1 flex flex-col gap-1">
                          {!isUrlMode ? (
                            <div>
                              <label
                                htmlFor={`auction-file-input-${idx}`}
                                className="h-9 border border-dashed border-[var(--color-border-strong)] hover:border-[var(--color-accent-primary)] rounded bg-[var(--color-bg-surface)] flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-xs text-[var(--color-text-primary)] font-semibold"
                              >
                                <Plus className="size-3.5 text-[var(--color-accent-primary)]" />
                                Escolher ou Tirar Foto (Celular/PC)
                              </label>
                              <input
                                type="file"
                                id={`auction-file-input-${idx}`}
                                accept="image/*"
                                onChange={(e) => handleFileUpload(idx, e)}
                                className="hidden"
                              />
                              <button
                                type="button"
                                onClick={() => setUrlMode((prev) => ({ ...prev, [idx]: true }))}
                                className="text-[9px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-primary)] transition-colors mt-1 text-left block"
                              >
                                Ou cole um link da internet...
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 w-full">
                              <input
                                type="url"
                                value={url}
                                onChange={(e) => handleImageInputChange(idx, e.target.value)}
                                placeholder="Cole a URL da foto (ex: http://...)"
                                className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-2.5 h-8 text-xs text-[var(--color-text-primary)] focus:outline-none transition-colors"
                              />
                              <button
                                type="button"
                                onClick={() => setUrlMode((prev) => ({ ...prev, [idx]: false }))}
                                className="text-[9px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-primary)] transition-colors text-left block"
                              >
                                Voltar para upload de arquivos
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
            {isPending ? 'Enviando Lote...' : 'Publicar Lote e Solicitar Curadoria'}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
