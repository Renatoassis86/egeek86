import { ClipboardList, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { AnimatedStatBars, type StatBarItem } from '@/components/motion/animated-stat-bars';
import { getSurveyAggregation, getGamerSurveysForAdmin } from '@/server/queries/survey';
import { AdminSurveysManager } from '@/components/admin/admin-surveys-manager';

// Sem searchParams — força dinâmica (ver nota em src/app/admin/page.tsx).
export const dynamic = 'force-dynamic';

export default async function AdminPesquisaPage() {
  const { totalResponses, questions } = await getSurveyAggregation();
  const gamerSurveys = await getGamerSurveysForAdmin();

  return (
    <div className="flex flex-col gap-10">
      {/* Gerenciador de Enquetes da Comunidade (Criar, Editar, Excluir) */}
      <AdminSurveysManager initialSurveys={gamerSurveys} />

      <div className="border-t border-[var(--color-border-subtle)] pt-8 flex flex-col gap-6">
        <div>
          <Text as="h2" variant="heading-lg" className="font-bold">
            Respostas da Pesquisa de Satisfação
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-1">
            {totalResponses} {totalResponses === 1 ? 'resposta registrada' : 'respostas registradas'}
          </Text>
        </div>

      {totalResponses === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ClipboardList className="size-8 text-[var(--color-text-tertiary)]" aria-hidden />
            <Text variant="body-md">Nenhuma resposta ainda.</Text>
            <Text variant="body-sm" color="secondary">
              Divulgue o link <span className="font-mono">/pesquisa</span> pros seus canais.
            </Text>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {questions.map((q) => {
            if (q.type === 'text') {
              return (
                <Card key={q.key} className="lg:col-span-2">
                  <CardContent className="flex flex-col gap-3 p-5">
                    <Text variant="heading-sm" className="flex items-center gap-2 font-bold">
                      <MessageSquare className="size-4 text-[var(--color-accent-primary)]" aria-hidden />
                      {q.label}
                    </Text>
                    {q.comments && q.comments.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {q.comments.map((comment, i) => (
                          <div
                            key={i}
                            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3"
                          >
                            <Text variant="body-sm" color="secondary">
                              &ldquo;{comment}&rdquo;
                            </Text>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Text variant="body-sm" color="tertiary">
                        Ninguém deixou comentário ainda.
                      </Text>
                    )}
                  </CardContent>
                </Card>
              );
            }

            const bars: StatBarItem[] = q.options.map((opt) => ({
              label: opt.label,
              fillPercent: opt.percent,
              displayValue: `${opt.count} (${opt.percent}%)`,
              source: 'Pesquisa interna do Espaço Geek 86',
            }));

            return (
              <Card key={q.key}>
                <CardContent className="p-5">
                  <Text variant="heading-sm" className="mb-4 font-bold">
                    {q.label}
                  </Text>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
