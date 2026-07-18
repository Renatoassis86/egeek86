'use client';

import { useState, useTransition } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Award, UserCheck, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { HypeMediaCarousel } from '@/components/geek-deals/hype-media-carousel';
import { CollectorCard } from '@/components/geek-deals/collector-card';
import { submitDropCuration, resolveDropCuration } from '@/server/actions/curation';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DropWithRelations } from '@/server/queries/hype';

interface CurationPanelProps {
  pendingDrops: DropWithRelations[];
  userCurationVotes: Record<string, { verdict: string; confidence: number; notes: string }>;
  isAdmin: boolean;
  isAuthenticated: boolean;
  userGeekPoints: number;
}

export function CurationPanel({
  pendingDrops,
  userCurationVotes,
  isAdmin,
  isAuthenticated,
  userGeekPoints,
}: CurationPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [votes, setVotes] = useState<Record<string, { verdict: 'authentic' | 'fake' | 'suspicious'; confidence: number; notes: string }>>(
    (userCurationVotes as any) || {}
  );
  
  // Votos locais de formulário ativos
  const [formVerdict, setFormVerdict] = useState<Record<string, 'authentic' | 'fake' | 'suspicious'>>({});
  const [formConfidence, setFormConfidence] = useState<Record<string, number>>({});
  const [formNotes, setFormNotes] = useState<Record<string, string>>({});

  const handleVoteSubmit = (dropId: string) => {
    if (!isAuthenticated) {
      toast.error('Faça login para poder votar.');
      return;
    }

    const verdict = formVerdict[dropId];
    const confidence = formConfidence[dropId] || 3;
    const notes = formNotes[dropId] || '';

    if (!verdict) {
      toast.error('Selecione um veredicto para o item.');
      return;
    }

    if (!notes.trim() || notes.length < 10) {
      toast.error('Escreva uma justificativa com pelo menos 10 caracteres.');
      return;
    }

    startTransition(async () => {
      const res = await submitDropCuration({ dropId, verdict, confidence, notes });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
        setVotes((prev) => ({
          ...prev,
          [dropId]: { verdict, confidence, notes },
        }));
      }
    });
  };

  // Resolução do Administrador
  const handleResolve = (dropId: string, correctVerdict: 'authentic' | 'fake') => {
    startTransition(async () => {
      const res = await resolveDropCuration(dropId, correctVerdict);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
      }
    });
  };

  const isQualified = userGeekPoints >= 200 || isAdmin;

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] pb-4">
        <div className="flex size-9 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)]">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <Text variant="heading-md">Conselho de Curadores EG86</Text>
          <Text variant="caption" color="tertiary">
            Avalie itens postados pela comunidade de colecionadores. Acertos garantem milhas de desconto!
          </Text>
        </div>
      </div>

      {!isQualified && (
        <div className="bg-[var(--color-accent-hype)]/5 border border-[var(--color-accent-hype)]/20 text-[var(--color-text-secondary)] rounded-[var(--radius-md)] p-4 text-xs leading-relaxed">
          <AlertTriangle className="size-4 text-[var(--color-accent-hype)] inline-block align-middle mr-1.5" />
          <span className="font-semibold text-[var(--color-text-primary)]">Restrição de Nível</span>: 
          Você precisa de pelo menos **200 Geek Points (Nível Explorador)** para que seus votos tenham peso oficial no julgamento de autenticidade dos produtos da Hype Zone. Continue comprando, participando e avaliando compras anteriores para acumular XP!
        </div>
      )}

      {pendingDrops.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--color-border-subtle)] rounded-[var(--radius-xl)] bg-[var(--color-bg-inset)]/20">
          <Text variant="body-md" color="tertiary">
            Não há nenhum drop pendente de curadoria da comunidade no momento.
          </Text>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {pendingDrops.map((drop) => {
            const hasVoted = !!votes[drop.id];
            const currentVote = votes[drop.id];
            const story = (drop.metadata as any)?.story || '';
            const specs = (drop.metadata as any)?.specs || [];

            // Valor do form local ou padrão
            const selectedVerdict = formVerdict[drop.id];
            const confidenceVal = formConfidence[drop.id] || 3;
            const notesText = formNotes[drop.id] || '';

            return (
              <Card key={drop.id} className="relative overflow-hidden border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/40">
                <CardContent className="p-6 md:p-8 flex flex-col lg:flex-row gap-8 items-start">
                  
                  {/* Coluna 1: Imagens do Lançamento */}
                  <div className="w-full lg:w-[380px] shrink-0">
                    <HypeMediaCarousel images={drop.images} alt={drop.title} />
                    
                    <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-3 text-xs">
                      <Text variant="caption" color="tertiary">Vendedor</Text>
                      <span className="font-semibold text-[var(--color-text-primary)]">{drop.collector?.displayName || 'Colecionador'}</span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs">
                      <Text variant="caption" color="tertiary">Agendado Para</Text>
                      <span className="font-mono text-[var(--color-text-secondary)]">
                        {new Date(drop.startsAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Coluna 2: Informações Técnicas e Formulário de Voto */}
                  <div className="flex-1 flex flex-col gap-4 w-full">
                    <div>
                      <Text as="h3" variant="heading-md" className="text-xl font-bold">
                        {drop.title}
                      </Text>
                      {drop.priceCents && (
                        <Text variant="mono-lg" className="text-base text-[var(--color-accent-primary)] mt-0.5 font-bold">
                          Valor Solicitado: {formatBRL(drop.priceCents)}
                        </Text>
                      )}
                    </div>

                    <Text variant="body-sm" color="secondary" className="leading-relaxed text-xs">
                      {drop.description}
                    </Text>

                    {/* Storytelling */}
                    {story && (
                      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-sm)] p-3 text-xs">
                        <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[8px] block mb-1">
                          Storytelling do Vendedor:
                        </Text>
                        <Text color="secondary" className="italic leading-relaxed">
                          &ldquo;{story}&rdquo;
                        </Text>
                      </div>
                    )}

                    {/* Votos dos Curadores */}
                    <div className="border-t border-[var(--color-border-subtle)] pt-4 flex flex-col gap-3">
                      
                      {hasVoted ? (
                        /* VOTO ENVIADO / MOSTRAR RESUMO DO VOTO */
                        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] p-4 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                              <CheckCircle2 className="size-3.5 text-[var(--color-accent-success)]" />
                              Seu Veredicto de Curadoria
                            </span>
                            <Badge
                              variant={
                                currentVote.verdict === 'authentic' ? 'hype' :
                                currentVote.verdict === 'fake' ? 'outline' : 'outline'
                              }
                              className={cn(
                                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                                currentVote.verdict === 'authentic' && 'bg-[var(--color-accent-success)]/10 text-[var(--color-accent-success)] border-[var(--color-accent-success)]/20',
                                currentVote.verdict === 'fake' && 'bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)] border-[var(--color-accent-hype)]/20',
                                currentVote.verdict === 'suspicious' && 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20'
                              )}
                            >
                              {currentVote.verdict === 'authentic' ? 'Original / Autêntico' :
                               currentVote.verdict === 'fake' ? 'Item Falso / Cópia' : 'Suspeito'}
                            </Badge>
                          </div>

                          <Text variant="caption" color="secondary" className="text-xs leading-relaxed bg-[var(--color-bg-inset)]/50 p-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] font-mono">
                            &ldquo;{currentVote.notes}&rdquo;
                          </Text>

                          <div className="text-[9px] text-[var(--color-text-tertiary)] font-mono flex justify-between items-center mt-1">
                            <span>Confiança técnica: {currentVote.confidence}/5</span>
                            <span className="text-[var(--color-accent-success)] font-semibold">Análise em moderação...</span>
                          </div>
                        </div>
                      ) : (
                        /* FORMULÁRIO DE VOTAÇÃO */
                        <div className="flex flex-col gap-4">
                          <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[9px] block">
                            Submeter Voto de Curadoria
                          </Text>

                          <div className="grid grid-cols-3 gap-2">
                            {(['authentic', 'suspicious', 'fake'] as const).map((verdict) => (
                              <button
                                key={verdict}
                                type="button"
                                disabled={!isAuthenticated}
                                onClick={() => setFormVerdict((prev) => ({ ...prev, [drop.id]: verdict }))}
                                className={cn(
                                  'py-2 px-3 text-center border rounded-[var(--radius-sm)] text-[10px] font-bold transition-all focus:outline-none flex items-center justify-center gap-1.5',
                                  selectedVerdict === verdict
                                    ? verdict === 'authentic'
                                      ? 'border-[var(--color-accent-success)] bg-[var(--color-accent-success)]/5 text-[var(--color-accent-success)]'
                                      : verdict === 'fake'
                                        ? 'border-[var(--color-accent-hype)] bg-[var(--color-accent-hype)]/5 text-[var(--color-accent-hype)]'
                                        : 'border-yellow-400 bg-yellow-400/5 text-yellow-400'
                                    : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                                )}
                              >
                                {verdict === 'authentic' ? (
                                  <><CheckCircle2 className="size-3" /> Original</>
                                ) : verdict === 'fake' ? (
                                  <><XCircle className="size-3" /> Falso</>
                                ) : (
                                  <><AlertTriangle className="size-3" /> Suspeito</>
                                )}
                              </button>
                            ))}
                          </div>

                          {/* Justificativa e Confiança */}
                          {selectedVerdict && (
                            <div className="flex flex-col gap-3 bg-[var(--color-bg-surface)] p-3 border border-[var(--color-border-subtle)] rounded-[var(--radius-md)]">
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] flex justify-between">
                                  <span>Grau de Confiança na Análise</span>
                                  <span className="text-[var(--color-text-primary)] font-bold">{confidenceVal}/5</span>
                                </label>
                                <input
                                  type="range"
                                  min={1}
                                  max={5}
                                  value={confidenceVal}
                                  onChange={(e) => setFormConfidence((prev) => ({ ...prev, [drop.id]: parseInt(e.target.value) || 3 }))}
                                  className="w-full h-1 bg-[var(--color-bg-inset)] accent-[var(--color-accent-primary)] cursor-pointer"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                                  Justificativa Técnica (Notas de Conservação / Autenticidade)
                                </label>
                                <textarea
                                  rows={2}
                                  value={notesText}
                                  onChange={(e) => setFormNotes((prev) => ({ ...prev, [drop.id]: e.target.value }))}
                                  placeholder="Escreva quais detalhes das fotos e história sustentam seu veredicto..."
                                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors resize-none"
                                />
                              </div>

                              <Button
                                onClick={() => handleVoteSubmit(drop.id)}
                                disabled={isPending || !isAuthenticated}
                                variant="primary"
                                size="sm"
                                className="w-full font-bold text-xs"
                              >
                                {isPending ? 'Gravando Voto...' : 'Enviar Voto de Curadoria (+10 XP)'}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Ações Administrativas (Exclusivo do Admin) */}
                      {isAdmin && (
                        <div className="border-t border-dashed border-[var(--color-border-subtle)] pt-3 flex items-center justify-between gap-3">
                          <span className="text-[9px] font-mono text-[var(--color-accent-hype)] font-bold">🛠️ Painel Moderador (Admin)</span>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleResolve(drop.id, 'authentic')}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 border-[var(--color-accent-success)]/40 hover:bg-[var(--color-accent-success)]/10 text-[var(--color-accent-success)]"
                            >
                              Julgar Original (Agendar)
                            </Button>
                            <Button
                              onClick={() => handleResolve(drop.id, 'fake')}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 border-[var(--color-accent-hype)]/40 hover:bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)]"
                            >
                              Reprovar / Banir Drop
                            </Button>
                          </div>
                        </div>
                      )}

                    </div>

                  </div>

                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
