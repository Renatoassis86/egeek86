import Link from 'next/link';
import { Vote, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface SurveyOption {
  id: string;
  label: string;
  votes: number;
}

/**
 * Resultado da pergunta "plataforma que você mais usa", com a contagem real
 * de respostas gravadas (vem de getSurveyAggregation). Sem votos de exemplo:
 * enquanto ninguém respondeu, o cartão diz isso. A resposta em si é enviada
 * pelo formulário completo em /pesquisa, que valida todas as perguntas
 * obrigatórias antes de gravar.
 */
export function GamerSurvey({ initialOptions = [] }: { initialOptions?: SurveyOption[] }) {
  const total = initialOptions.reduce((acc, o) => acc + o.votes, 0);

  return (
    <Card className="border-2 border-[var(--color-accent-gold)]/40 bg-[var(--color-bg-surface)] shadow-[var(--shadow-lg)] overflow-hidden">
      <CardContent className="p-6 md:p-8 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5 border-b border-[var(--color-border-subtle)] pb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[var(--color-accent-gold)]/15 text-[var(--color-accent-gold)] border border-[var(--color-accent-gold)]/30 w-fit">
            <Vote className="size-3.5" aria-hidden />
            Pesquisa de mercado gamer
          </span>
          <h3 className="text-xl md:text-2xl font-black tracking-tight text-[var(--color-text-primary)] mt-1">
            Qual plataforma a comunidade mais usa?
          </h3>
        </div>

        {total === 0 ? (
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            Ainda não há respostas gravadas. Seja a primeira pessoa a responder.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {initialOptions.map((opt) => {
              const percent = Math.round((opt.votes / total) * 100);
              return (
                <li key={opt.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[var(--color-text-primary)]">{opt.label}</span>
                    <span className="font-mono text-[var(--color-text-secondary)]">
                      {opt.votes} {opt.votes === 1 ? 'resposta' : 'respostas'} ({percent}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-inset)]">
                    <div className="h-full rounded-full bg-[var(--color-accent-gold)]" style={{ width: `${percent}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-4">
          <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
            {total.toLocaleString('pt-BR')} {total === 1 ? 'resposta gravada' : 'respostas gravadas'} nesta pergunta
          </span>
          <Button asChild size="md" rightIcon={<ArrowRight className="size-4" />}>
            <Link href="/pesquisa">Responder a pesquisa</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
