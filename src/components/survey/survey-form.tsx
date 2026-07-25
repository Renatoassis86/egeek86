'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { SURVEY_QUESTIONS } from '@/lib/survey/questions';
import { submitSurveyResponse } from '@/server/actions/survey';

export function SurveyForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function setAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (const q of SURVEY_QUESTIONS) {
      if (q.required && !answers[q.key]?.trim()) {
        toast.error(`Responda: "${q.label}"`);
        return;
      }
    }

    startTransition(async () => {
      const res = await submitSurveyResponse({ answers });
      if (!res.ok) {
        toast.error(res.error ?? 'Erro ao enviar sua resposta. Tente de novo.');
        return;
      }
      setSubmitted(true);
      toast.success('Obrigado! Sua resposta foi registrada.');
      router.refresh();
    });
  }

  if (submitted) {
    return (
      <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 className="size-10 text-[var(--color-accent-primary)]" />
          <Text variant="heading-md" className="font-bold">
            Resposta registrada!
          </Text>
          <Text variant="body-sm" color="secondary" className="max-w-[46ch]">
            Obrigado por ajudar a gente a entender melhor o mercado gamer. Seus dados entram na
            pesquisa de forma agregada, nunca identificados publicamente.
          </Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {SURVEY_QUESTIONS.map((q) => (
        <Card key={q.key} className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
          <CardContent className="flex flex-col gap-3 p-5">
            <Text variant="body-md" className="font-semibold">
              {q.label}
              {!q.required && (
                <span className="ml-1.5 text-[10px] font-normal text-[var(--color-text-tertiary)]">(opcional)</span>
              )}
            </Text>

            {q.type === 'text' ? (
              <Textarea
                rows={3}
                value={answers[q.key] ?? ''}
                onChange={(e) => setAnswer(q.key, e.target.value)}
                placeholder="Escreva aqui..."
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {q.options?.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAnswer(q.key, opt.value)}
                    className={cn(
                      'rounded-[var(--radius-full)] border px-3.5 py-1.5 text-body-sm font-medium transition-colors',
                      answers[q.key] === opt.value
                        ? 'border-transparent bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]'
                        : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Button type="submit" size="lg" variant="hype" disabled={isPending} className="w-full sm:w-fit" rightIcon={<Send className="size-4" />}>
        {isPending ? 'Enviando...' : 'Enviar respostas'}
      </Button>
    </form>
  );
}
