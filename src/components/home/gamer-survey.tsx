'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Vote, RefreshCw } from 'lucide-react';
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

export function GamerSurvey({
  initialOptions,
}: {
  initialOptions: SurveyOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [options, setOptions] = useState<SurveyOption[]>(initialOptions);

  useEffect(() => {
    setOptions(initialOptions);
  }, [initialOptions]);

  useEffect(() => {
    const savedVote = localStorage.getItem('eg86_gamer_survey_vote');
    if (savedVote) {
      setHasVoted(true);
      setSelectedOption(savedVote);
    }
  }, []);

  function handleVote(optionId: string) {
    if (hasVoted || isPending) return;

    localStorage.setItem('eg86_gamer_survey_vote', optionId);
    setSelectedOption(optionId);
    setHasVoted(true);

    // Atualização otimista
    setOptions((prev) =>
      prev.map((opt) => (opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt))
    );

    startTransition(async () => {
      const res = await submitSurveyResponse({ answers: { platform: optionId } });
      if (!res.ok) {
        localStorage.removeItem('eg86_gamer_survey_vote');
        setSelectedOption(null);
        setHasVoted(false);
        setOptions(initialOptions);
        toast.error(res.error ?? 'Erro ao registrar voto. Tente novamente.');
      } else {
        toast.success('Voto registrado! Obrigado por participar.');
        router.refresh();
      }
    });
  }

  function handleReset() {
    localStorage.removeItem('eg86_gamer_survey_vote');
    setHasVoted(false);
    setSelectedOption(null);
    setOptions(initialOptions);
  }


  const totalVotes = options.reduce((sum, opt) => sum + opt.votes, 0);

  return (
    <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-md)]">
      <CardContent className="p-6 md:p-8 flex flex-col gap-6">
        {/* Cabeçalho da Enquete */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-4">
          <div className="flex flex-col gap-1">
            <Text variant="body-sm" color="tertiary" className="font-mono uppercase tracking-wider text-[10px] inline-flex items-center gap-1.5">
              <Vote className="size-3.5 text-[var(--color-accent-primary)]" />
              Pesquisa com a Comunidade
            </Text>
            <Text as="h3" variant="heading-md" className="font-bold leading-tight mt-1">
              Qual é a sua plataforma principal de jogo hoje?
            </Text>
          </div>
          
          {hasVoted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-[10px] font-mono h-7 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] gap-1 shrink-0"
              title="Resetar voto (teste)"
            >
              <RefreshCw className="size-3" />
              Limpar Voto
            </Button>
          )}
        </div>

        {/* Listagem de Opções */}
        <div className="flex flex-col gap-3">
          {options.map((opt) => {
            const percent = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
            const isSelected = opt.id === selectedOption;

            return (
              <div key={opt.id} className="relative group">
                {hasVoted ? (
                  /* Modo Resultados */
                  <div className="relative overflow-hidden rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/10 p-3.5 flex items-center justify-between gap-4 transition-all">
                    {/* Barra de progresso interna em background */}
                    <div
                      className={cn(
                        'absolute left-0 top-0 bottom-0 transition-all duration-1000 ease-out z-0',
                        isSelected ? 'bg-[var(--color-accent-primary)]/10' : 'bg-[var(--color-bg-inset)]/30'
                      )}
                      style={{ width: `${percent}%` }}
                    />
                    
                    <div className="relative z-10 flex items-center gap-2 min-w-0">
                      {isSelected && <Check className="size-4 text-[var(--color-accent-primary)] shrink-0" />}
                      <Text
                        variant="body-sm"
                        className={cn(
                          'truncate',
                          isSelected ? 'font-bold text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
                        )}
                      >
                        {opt.label}
                      </Text>
                    </div>
                    
                    <div className="relative z-10 flex items-center gap-2 shrink-0 font-mono">
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">({opt.votes.toLocaleString()} votos)</span>
                      <Text
                        variant="body-sm"
                        className={cn(
                          'font-bold',
                          isSelected ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-secondary)]'
                        )}
                      >
                        {percent}%
                      </Text>
                    </div>
                  </div>
                ) : (
                  /* Modo Votação */
                  <button
                    onClick={() => handleVote(opt.id)}
                    className="w-full text-left rounded border border-[var(--color-border-default)] hover:border-[var(--color-accent-primary)] bg-[var(--color-bg-surface)] p-3.5 text-body-sm font-semibold transition-all hover:bg-[var(--color-bg-inset)]/30 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                  >
                    {opt.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé informativo */}
        <div className="flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)] border-t border-[var(--color-border-subtle)] pt-4">
          <span>Enquete anônima de mercado gamer</span>
          <span className="font-mono">Total de {totalVotes.toLocaleString()} participações</span>
        </div>
      </CardContent>
    </Card>
  );
}
