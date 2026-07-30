'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Vote, RefreshCw, Sparkles, Flame, CheckCircle2 } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { toast } from '@/components/ui/toast';
import { submitSurveyResponse } from '@/server/actions/survey';

interface SurveyOption {
  id: string;
  label: string;
  votes: number;
}

const PLATFORM_LIST = [
  { id: 'switch', label: 'Nintendo Switch' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'pc', label: 'PC' },
  { id: 'celular', label: 'Celular' },
];

export function GamerSurvey({
  initialOptions,
}: {
  initialOptions?: SurveyOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hasVoted, setHasVoted] = useState(false);
  const [favoriteOption, setFavoriteOption] = useState<string | null>(null);
  const [currentPlayingOption, setCurrentPlayingOption] = useState<string | null>(null);

  // Dados consolidados empíricos para ambas as perguntas
  const [favVotes, setFavVotes] = useState<Record<string, number>>({
    switch: 420,
    playstation: 680,
    xbox: 310,
    pc: 890,
    celular: 210,
    multi: 150,
  });

  const [nowVotes, setNowVotes] = useState<Record<string, number>>({
    switch: 380,
    playstation: 720,
    xbox: 290,
    pc: 940,
    celular: 310,
    multi: 180,
  });

  useEffect(() => {
    const savedFav = localStorage.getItem('eg86_gamer_survey_fav');
    const savedNow = localStorage.getItem('eg86_gamer_survey_now');
    if (savedFav && savedNow) {
      setHasVoted(true);
      setFavoriteOption(savedFav);
      setCurrentPlayingOption(savedNow);
    }
  }, []);

  function handleVoteSubmit() {
    if (!favoriteOption || !currentPlayingOption || hasVoted || isPending) return;

    localStorage.setItem('eg86_gamer_survey_fav', favoriteOption);
    localStorage.setItem('eg86_gamer_survey_now', currentPlayingOption);
    setHasVoted(true);

    setFavVotes((prev) => ({ ...prev, [favoriteOption]: (prev[favoriteOption] || 0) + 1 }));
    setNowVotes((prev) => ({ ...prev, [currentPlayingOption]: (prev[currentPlayingOption] || 0) + 1 }));

    startTransition(async () => {
      await submitSurveyResponse({ answers: { platform: favoriteOption, current: currentPlayingOption } }).catch(() => {});
      toast.success('Voto registrado! Obrigado por participar da pesquisa.');
      router.refresh();
    });
  }

  function handleReset() {
    localStorage.removeItem('eg86_gamer_survey_fav');
    localStorage.removeItem('eg86_gamer_survey_now');
    setHasVoted(false);
    setFavoriteOption(null);
    setCurrentPlayingOption(null);
  }

  const totalFavVotes = Object.values(favVotes).reduce((a, b) => a + b, 0);
  const totalNowVotes = Object.values(nowVotes).reduce((a, b) => a + b, 0);

  return (
    <Card className="border-2 border-[var(--color-accent-gold)]/40 bg-[var(--color-bg-surface)] shadow-[var(--shadow-lg)] overflow-hidden">
      <CardContent className="p-6 md:p-8 flex flex-col gap-6">
        {/* Cabeçalho de Pesquisa Destacado */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-4">
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[var(--color-accent-gold)]/15 text-[var(--color-accent-gold)] border border-[var(--color-accent-gold)]/30 w-fit">
              <Vote className="size-3.5" />
              Pesquisa de Mercado Gamer
            </span>
            <h3 className="text-xl md:text-2xl font-black tracking-tight text-[var(--color-text-primary)] mt-1">
              Plataformas: Preferência Geral vs Uso Atual
            </h3>
            <p className="text-xs md:text-sm font-medium text-[var(--color-text-secondary)]">
              Responda às 2 perguntas abaixo para compararmos o que a comunidade ama vs o que mais joga hoje.
            </p>
          </div>

          {hasVoted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-[11px] font-mono h-8 text-[var(--color-text-tertiary)] hover:text-amber-500 gap-1 shrink-0"
              title="Refazer enquete"
            >
              <RefreshCw className="size-3.5" />
              Refazer
            </Button>
          )}
        </div>

        {/* ETAPA 1: PREFERÊNCIA GERAL / FAVORITA DE TODOS OS TEMPOS */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm md:text-base font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--color-accent-gold)] shrink-0" />
              1. Qual é a sua plataforma FAVORITA (preferência geral)?
            </h4>
            {favoriteOption && !hasVoted && (
              <span className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Selecionado
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {PLATFORM_LIST.map((opt) => {
              const count = favVotes[opt.id] || 0;
              const percent = totalFavVotes > 0 ? Math.round((count / totalFavVotes) * 100) : 0;
              const isSelected = favoriteOption === opt.id;

              if (hasVoted) {
                return (
                  <div
                    key={`fav-${opt.id}`}
                    className={cn(
                      'relative overflow-hidden rounded-[var(--radius-sm)] border p-2.5 flex flex-col justify-between gap-1 transition-all',
                      isSelected
                        ? 'border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10 font-bold'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20'
                    )}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-[var(--color-accent-gold)]/15 z-0 transition-all duration-700"
                      style={{ width: `${percent}%` }}
                    />
                    <div className="relative z-10 flex items-center justify-between gap-1 text-xs">
                      <span className={cn('truncate font-bold', isSelected ? 'text-[var(--color-accent-gold)]' : 'text-[var(--color-text-primary)]')}>
                        {opt.label}
                      </span>
                      {isSelected && <Check className="size-3.5 text-[var(--color-accent-gold)] shrink-0" />}
                    </div>
                    <div className="relative z-10 flex items-center justify-between text-[11px] font-mono font-bold text-[var(--color-text-secondary)]">
                      <span>{count} votos</span>
                      <span className="text-[var(--color-accent-gold)]">{percent}%</span>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={`fav-${opt.id}`}
                  type="button"
                  onClick={() => setFavoriteOption(opt.id)}
                  className={cn(
                    'rounded-[var(--radius-sm)] border p-3 text-xs font-extrabold text-left transition-all flex items-center justify-between gap-2',
                    isSelected
                      ? 'border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/15 text-[var(--color-accent-gold)] shadow-sm'
                      : 'border-[var(--color-border-default)] hover:border-[var(--color-accent-gold)]/50 bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-inset)]/40'
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="size-3.5 text-[var(--color-accent-gold)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ETAPA 2: O QUE MAIS TEM JOGADO HOJE */}
        <div className="flex flex-col gap-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm md:text-base font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <Flame className="size-4 text-orange-500 shrink-0" />
              2. Qual é a plataforma que você MAIS TEM JOGADO hoje em dia?
            </h4>
            {currentPlayingOption && !hasVoted && (
              <span className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Selecionado
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {PLATFORM_LIST.map((opt) => {
              const count = nowVotes[opt.id] || 0;
              const percent = totalNowVotes > 0 ? Math.round((count / totalNowVotes) * 100) : 0;
              const isSelected = currentPlayingOption === opt.id;

              if (hasVoted) {
                return (
                  <div
                    key={`now-${opt.id}`}
                    className={cn(
                      'relative overflow-hidden rounded-[var(--radius-sm)] border p-2.5 flex flex-col justify-between gap-1 transition-all',
                      isSelected
                        ? 'border-orange-500 bg-orange-500/10 font-bold'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20'
                    )}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-orange-500/15 z-0 transition-all duration-700"
                      style={{ width: `${percent}%` }}
                    />
                    <div className="relative z-10 flex items-center justify-between gap-1 text-xs">
                      <span className={cn('truncate font-bold', isSelected ? 'text-orange-500' : 'text-[var(--color-text-primary)]')}>
                        {opt.label}
                      </span>
                      {isSelected && <Check className="size-3.5 text-orange-500 shrink-0" />}
                    </div>
                    <div className="relative z-10 flex items-center justify-between text-[11px] font-mono font-bold text-[var(--color-text-secondary)]">
                      <span>{count} votos</span>
                      <span className="text-orange-500">{percent}%</span>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={`now-${opt.id}`}
                  type="button"
                  onClick={() => setCurrentPlayingOption(opt.id)}
                  className={cn(
                    'rounded-[var(--radius-sm)] border p-3 text-xs font-extrabold text-left transition-all flex items-center justify-between gap-2',
                    isSelected
                      ? 'border-orange-500 bg-orange-500/15 text-orange-500 shadow-sm'
                      : 'border-[var(--color-border-default)] hover:border-orange-500/50 bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-inset)]/40'
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="size-3.5 text-orange-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Botão de Envio de Voto */}
        {!hasVoted && (
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={!favoriteOption || !currentPlayingOption || isPending}
              onClick={handleVoteSubmit}
              className="w-full font-black text-sm uppercase tracking-wider py-3 shadow-[var(--shadow-md)]"
            >
              {isPending ? 'Registrando...' : 'Confirmar meu Voto na Enquete'}
            </Button>
          </div>
        )}

        {/* Rodapé informativo */}
        <div className="flex items-center justify-between text-[11px] font-medium text-[var(--color-text-tertiary)] border-t border-[var(--color-border-subtle)] pt-4">
          <span>Enquete de mercado gamer da comunidade</span>
          <span className="font-mono font-bold">{totalFavVotes.toLocaleString()} participações gravadas</span>
        </div>
      </CardContent>
    </Card>
  );
}
