'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, Check, X, Vote, Sparkles, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import {
  createSurveyQuestionAction,
  updateSurveyQuestionAction,
  deleteSurveyQuestionAction,
} from '@/server/actions/surveys';
import type { GamerSurveyItem, SurveyOptionItem } from '@/db/schema';

export function AdminSurveysManager({
  initialSurveys,
}: {
  initialSurveys: GamerSurveyItem[];
}) {
  const [surveys, setSurveys] = useState<GamerSurveyItem[]>(initialSurveys);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Formulário State
  const [formQuestion, setFormQuestion] = useState('');
  const [formCategory, setFormCategory] = useState('Mercado Gamer');
  const [formOptionsText, setFormOptionsText] = useState(
    'Nintendo Switch 2\nPlayStation 5 Pro\nPC Gamer High-End\nXbox Series X'
  );

  function handleStartCreate() {
    setFormQuestion('');
    setFormCategory('Mercado Gamer');
    setFormOptionsText('Opção A\nOpção B\nOpção C');
    setIsCreating(true);
    setEditingId(null);
  }

  function handleStartEdit(survey: GamerSurveyItem) {
    setFormQuestion(survey.question);
    setFormCategory(survey.category);
    setFormOptionsText(survey.options.map((o) => o.label).join('\n'));
    setEditingId(survey.id);
    setIsCreating(false);
  }

  function handleCancelForm() {
    setIsCreating(false);
    setEditingId(null);
  }

  function parseOptionsInput(): SurveyOptionItem[] {
    const lines = formOptionsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.map((label, idx) => ({
      id: `opt_${Date.now()}_${idx}`,
      label,
      votes: 0,
    }));
  }

  function handleSaveCreate() {
    if (!formQuestion.trim()) {
      toast.error('Digite a pergunta da enquete.');
      return;
    }
    const options = parseOptionsInput();
    if (options.length < 2) {
      toast.error('Informe pelo menos 2 opções de resposta (uma por linha).');
      return;
    }

    startTransition(async () => {
      const res = await createSurveyQuestionAction({
        question: formQuestion,
        category: formCategory,
        options,
      });

      if (res.ok) {
        toast.success('Enquete cadastrada com sucesso!');
        setIsCreating(false);
        // Atualiza estado local
        const newSurveyItem: GamerSurveyItem = {
          id: `tmp_${Date.now()}`,
          question: formQuestion.trim(),
          category: formCategory.trim(),
          options,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setSurveys((prev) => [newSurveyItem, ...prev]);
      } else {
        toast.error(res.error ?? 'Falha ao cadastrar enquete.');
      }
    });
  }

  function handleSaveEdit(id: string) {
    if (!formQuestion.trim()) {
      toast.error('Digite a pergunta da enquete.');
      return;
    }
    const currentSurvey = surveys.find((s) => s.id === id);
    const existingOptions = currentSurvey?.options ?? [];
    
    // Mantém votos existentes se o texto da opção for mantido
    const lines = formOptionsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const updatedOptions: SurveyOptionItem[] = lines.map((label, idx) => {
      const match = existingOptions.find((o) => o.label.toLowerCase() === label.toLowerCase());
      return {
        id: match ? match.id : `opt_${Date.now()}_${idx}`,
        label,
        votes: match ? match.votes : 0,
      };
    });

    startTransition(async () => {
      const res = await updateSurveyQuestionAction({
        id,
        question: formQuestion,
        category: formCategory,
        options: updatedOptions,
      });

      if (res.ok) {
        toast.success('Enquete atualizada com sucesso!');
        setEditingId(null);
        setSurveys((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, question: formQuestion.trim(), category: formCategory.trim(), options: updatedOptions }
              : s
          )
        );
      } else {
        toast.error(res.error ?? 'Falha ao atualizar enquete.');
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteSurveyQuestionAction({ id });
      if (res.ok) {
        toast.success('Enquete excluída com sucesso!');
        setSurveys((prev) => prev.filter((s) => s.id !== id));
        setDeletingId(null);
      } else {
        toast.error(res.error ?? 'Falha ao excluir enquete.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Botão de Cadastro */}
      <div className="flex justify-between items-center">
        <div>
          <Text variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
            Gerenciador de Enquetes da Comunidade
          </Text>
          <Text variant="body-sm" color="secondary">
            Crie, edite e ative enquetes que aparecem na página de Pesquisa e na Home da plataforma.
          </Text>
        </div>

        {!isCreating && (
          <Button variant="hype" size="md" onClick={handleStartCreate} leftIcon={<Plus className="size-4" />}>
            Cadastrar Nova Enquete
          </Button>
        )}
      </div>

      {/* Formulário de Criação de Enquete */}
      {isCreating && (
        <Card className="border border-blue-500/40 bg-[var(--color-bg-inset)]/60 shadow-xl">
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-blue-500/20 pb-3">
              <Sparkles className="size-5 text-blue-400" />
              <Text variant="heading-sm" className="font-bold text-blue-400">
                Cadastrar Nova Enquete / Pergunta
              </Text>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 flex flex-col gap-1.5">
                <Text variant="label" className="text-xs font-bold text-[var(--color-text-primary)]">
                  Pergunta da Enquete *
                </Text>
                <input
                  type="text"
                  placeholder="Ex: Qual o lançamento mais aguardado de 2026?"
                  value={formQuestion}
                  onChange={(e) => setFormQuestion(e.target.value)}
                  className="rounded-[var(--radius-sm)] bg-[var(--color-bg-canvas)] border border-[var(--color-border-default)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Text variant="label" className="text-xs font-bold text-[var(--color-text-primary)]">
                  Categoria
                </Text>
                <input
                  type="text"
                  placeholder="Ex: Consoles, Jogos, Hardware"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="rounded-[var(--radius-sm)] bg-[var(--color-bg-canvas)] border border-[var(--color-border-default)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Text variant="label" className="text-xs font-bold text-[var(--color-text-primary)]">
                Opções de Resposta (Uma opção por linha) *
              </Text>
              <textarea
                rows={4}
                value={formOptionsText}
                onChange={(e) => setFormOptionsText(e.target.value)}
                placeholder="Nintendo Switch 2&#10;PlayStation 5 Pro&#10;PC Gamer High-End"
                className="w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-canvas)] border border-[var(--color-border-default)] p-3 text-sm text-[var(--color-text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={handleCancelForm} disabled={isPending}>
                Cancelar
              </Button>
              <Button variant="hype" size="sm" onClick={handleSaveCreate} disabled={isPending}>
                {isPending ? 'Cadastrando...' : 'Publicar Enquete'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Enquetes Cadastradas */}
      <div className="flex flex-col gap-4">
        {surveys.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Vote className="size-8 text-[var(--color-text-tertiary)] mx-auto mb-2" />
              <Text variant="body-md" color="secondary">
                Nenhuma enquete cadastrada ainda. Clique no botão acima para criar a primeira!
              </Text>
            </CardContent>
          </Card>
        ) : (
          surveys.map((survey) => {
            const isEditing = editingId === survey.id;
            const isDeleting = deletingId === survey.id;
            const totalVotes = survey.options.reduce((acc, curr) => acc + curr.votes, 0);

            return (
              <Card key={survey.id} className="relative overflow-hidden border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                <CardContent className="p-5 flex flex-col gap-4">
                  {/* Topo do Card da Enquete */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="hype" size="sm">
                        {survey.category}
                      </Badge>
                      <Badge variant="outline" size="sm">
                        {totalVotes} {totalVotes === 1 ? 'voto' : 'votos'} acumulados
                      </Badge>
                    </div>

                    {!isEditing && !isDeleting && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartEdit(survey)}
                          className="h-8 px-2.5"
                        >
                          <Pencil className="size-3.5 mr-1" /> Editar
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingId(survey.id)}
                          className="h-8 px-2.5 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="size-3.5 mr-1" /> Excluir
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Edição Form Inline */}
                  {isEditing ? (
                    <div className="flex flex-col gap-3 bg-[var(--color-bg-inset)] p-4 rounded-[var(--radius-md)] border border-blue-500/30">
                      <Text variant="label" className="text-blue-400 font-bold text-xs">
                        Editar Pergunta e Opções:
                      </Text>
                      <input
                        type="text"
                        value={formQuestion}
                        onChange={(e) => setFormQuestion(e.target.value)}
                        className="rounded-[var(--radius-sm)] bg-[var(--color-bg-canvas)] border border-[var(--color-border-default)] px-3 py-2 text-sm text-[var(--color-text-primary)] font-bold focus:outline-none"
                      />
                      <textarea
                        rows={4}
                        value={formOptionsText}
                        onChange={(e) => setFormOptionsText(e.target.value)}
                        className="w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-canvas)] border border-[var(--color-border-default)] p-3 text-sm text-[var(--color-text-primary)] font-mono focus:outline-none"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={handleCancelForm} disabled={isPending}>
                          Cancelar
                        </Button>
                        <Button variant="hype" size="sm" onClick={() => handleSaveEdit(survey.id)} disabled={isPending}>
                          {isPending ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                      </div>
                    </div>
                  ) : isDeleting ? (
                    /* Confirmar Exclusão */
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-red-950/40 border border-red-500/40 p-3.5 rounded-[var(--radius-md)] text-red-200">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <AlertTriangle className="size-4 text-red-400 shrink-0" />
                        <span>Excluir esta enquete permanentemente?</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)} disabled={isPending}>
                          Cancelar
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white font-bold"
                          onClick={() => handleDelete(survey.id)}
                          disabled={isPending}
                        >
                          {isPending ? 'Excluindo...' : 'Sim, Excluir'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Visualização da Enquete */
                    <div className="flex flex-col gap-3">
                      <Text variant="heading-sm" className="font-bold text-[var(--color-text-primary)]">
                        {survey.question}
                      </Text>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {survey.options.map((opt) => {
                          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                          return (
                            <div
                              key={opt.id}
                              className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] p-3 flex items-center justify-between"
                            >
                              <div
                                className="absolute left-0 top-0 bottom-0 bg-[var(--color-accent-primary)]/15 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                              <Text variant="body-sm" className="relative font-medium text-[var(--color-text-primary)] truncate z-10">
                                {opt.label}
                              </Text>
                              <Text variant="caption" className="relative font-bold text-blue-400 z-10 shrink-0 ml-2">
                                {opt.votes} ({pct}%)
                              </Text>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
