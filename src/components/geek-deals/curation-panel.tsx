'use client';

import { useState, useTransition } from 'react';
import { Star, ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Award, UserCheck, MessageSquare, ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { HypeMediaCarousel } from '@/components/geek-deals/hype-media-carousel';
import { submitDropCuration, resolveDropCuration, submitReviewCuration, resolveReviewCuration } from '@/server/actions/curation';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DropWithRelations } from '@/server/queries/hype';

export interface PendingReview {
  id: string;
  productId: string;
  productTitle: string;
  buyerName: string;
  sellerName: string;
  rating: number;
  comment: string;
  images: string[];
  createdAt: string;
}

interface CurationPanelProps {
  pendingDrops: DropWithRelations[];
  userCurationVotes: Record<string, { verdict: string; confidence: number; notes: string }>;
  pendingReviews?: PendingReview[];
  userReviewVotes?: Record<string, { verdict: string; notes: string }>;
  isAdmin: boolean;
  isAuthenticated: boolean;
  userGeekPoints: number;
}

export function CurationPanel({
  pendingDrops,
  userCurationVotes,
  pendingReviews = [],
  userReviewVotes = {},
  isAdmin,
  isAuthenticated,
  userGeekPoints,
}: CurationPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [activeSubTab, setActiveSubTab] = useState<'drops' | 'reviews'>('drops');
  
  // Votos de Drops
  const [dropVotes, setDropVotes] = useState<Record<string, { verdict: 'authentic' | 'fake' | 'suspicious'; confidence: number; notes: string }>>(
    (userCurationVotes as any) || {}
  );
  const [formDropVerdict, setFormDropVerdict] = useState<Record<string, 'authentic' | 'fake' | 'suspicious'>>({});
  const [formDropConfidence, setFormDropConfidence] = useState<Record<string, number>>({});
  const [formDropNotes, setFormDropNotes] = useState<Record<string, string>>({});

  // Votos de Reviews (Auditoria)
  const [reviewVotes, setReviewVotes] = useState<Record<string, { verdict: 'approve' | 'reject'; notes: string }>>(
    (userReviewVotes as any) || {}
  );
  const [formReviewVerdict, setFormReviewVerdict] = useState<Record<string, 'approve' | 'reject'>>({});
  const [formReviewNotes, setFormReviewNotes] = useState<Record<string, string>>({});

  // Mock de avaliações pendentes caso venha vazio da API/banco
  const fallbackReviews: PendingReview[] = [
    {
      id: 'rev-mock-1',
      productId: 'p1',
      productTitle: 'PlayStation 5 Pro - Edição Limitada 30 Anos',
      buyerName: 'Carlos G. (Comprador)',
      sellerName: 'Renato Assis (Renato86)',
      rating: 1,
      comment: 'O console veio com cabo de força preto comum em vez do cabo comemorativo clássico cinza. Propaganda enganosa!',
      images: ['/images/hero/tile-accent.png'],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'rev-mock-2',
      productId: 'p2',
      productTitle: 'Vaporwave Custom Keyboard mechanical (65%)',
      buyerName: 'Julia M. (Compradora)',
      sellerName: 'Aline Tech & Craft',
      rating: 2,
      comment: 'O teclado faz muito barulho ao digitar. Comprei achando que switches lubrificados fossem totalmente silenciosos. Não recomendo.',
      images: [],
      createdAt: new Date().toISOString(),
    }
  ];

  const targetReviews = pendingReviews.length > 0 ? pendingReviews : fallbackReviews;

  const handleDropVoteSubmit = (dropId: string) => {
    if (!isAuthenticated) {
      toast.error('Faça login para poder votar.');
      return;
    }

    const verdict = formDropVerdict[dropId];
    const confidence = formDropConfidence[dropId] || 3;
    const notes = formDropNotes[dropId] || '';

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
        setDropVotes((prev) => ({
          ...prev,
          [dropId]: { verdict, confidence, notes },
        }));
      }
    });
  };

  const handleResolveDrop = (dropId: string, correctVerdict: 'authentic' | 'fake') => {
    startTransition(async () => {
      const res = await resolveDropCuration(dropId, correctVerdict);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
      }
    });
  };

  // Voto de Auditoria de Avaliação C2C
  const handleReviewVoteSubmit = (reviewId: string) => {
    if (!isAuthenticated) {
      toast.error('Faça login para poder votar.');
      return;
    }

    const verdict = formReviewVerdict[reviewId];
    const notes = formReviewNotes[reviewId] || '';

    if (!verdict) {
      toast.error('Selecione se aprova ou rejeita a avaliação.');
      return;
    }

    if (!notes.trim() || notes.length < 10) {
      toast.error('Escreva uma justificativa com pelo menos 10 caracteres.');
      return;
    }

    startTransition(async () => {
      const res = await submitReviewCuration({ reviewId, verdict, notes });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
        setReviewVotes((prev) => ({
          ...prev,
          [reviewId]: { verdict, notes },
        }));
      }
    });
  };

  const handleResolveReview = (reviewId: string, correctVerdict: 'approve' | 'reject') => {
    startTransition(async () => {
      const res = await resolveReviewCuration(reviewId, correctVerdict);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
      }
    });
  };

  const isQualified = userGeekPoints >= 200 || isAdmin;

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] pb-4">
        <div className="flex size-9 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)]">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <Text variant="heading-md">Conselho de Curadores EG86</Text>
          <Text variant="caption" color="tertiary">
            Consenso descentralizado de colecionadores. Avalie produtos e denuncie reviews falsos.
          </Text>
        </div>
      </div>

      {/* Sub-Abas do Painel */}
      <div className="flex border-b border-[var(--color-border-subtle)] pb-px gap-4">
        <button
          onClick={() => setActiveSubTab('drops')}
          className={cn(
            'pb-3 text-xs font-bold transition-all border-b-2 border-transparent focus:outline-none',
            activeSubTab === 'drops'
              ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          Curadoria de Drops ({pendingDrops.length})
        </button>
        <button
          onClick={() => setActiveSubTab('reviews')}
          className={cn(
            'pb-3 text-xs font-bold transition-all border-b-2 border-transparent focus:outline-none',
            activeSubTab === 'reviews'
              ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          Auditoria de Avaliações ({targetReviews.length})
        </button>
      </div>

      {!isQualified && (
        <div className="bg-[var(--color-accent-hype)]/5 border border-[var(--color-accent-hype)]/20 text-[var(--color-text-secondary)] rounded-[var(--radius-md)] p-4 text-xs leading-relaxed">
          <AlertTriangle className="size-4 text-[var(--color-accent-hype)] inline-block align-middle mr-1.5" />
          <span className="font-semibold text-[var(--color-text-primary)]">Restrição de Nível</span>: 
          Você precisa de pelo menos <strong className="text-[var(--color-text-primary)] font-bold">200 Geek Points (Nível Explorador)</strong> para votar de forma oficial. Seus votos acumulam XP de participação, mas não contam para o consenso final até atingir o nível.
        </div>
      )}

      {/* TAB 1: CURADORIA DE DROPS */}
      {activeSubTab === 'drops' && (
        pendingDrops.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--color-border-subtle)] rounded-[var(--radius-xl)] bg-[var(--color-bg-inset)]/20">
            <Text variant="body-sm" color="tertiary">Não há nenhum drop pendente de curadoria comunitária.</Text>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {pendingDrops.map((drop) => {
              const hasVoted = !!dropVotes[drop.id];
              const currentVote = dropVotes[drop.id];
              const story = (drop.metadata as any)?.story || '';
              const selectedVerdict = formDropVerdict[drop.id];
              const confidenceVal = formDropConfidence[drop.id] || 3;
              const notesText = formDropNotes[drop.id] || '';

              return (
                <Card key={drop.id} className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/20">
                  <CardContent className="p-6 flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-56 shrink-0">
                      <HypeMediaCarousel images={drop.images} alt={drop.title} />
                      <div className="mt-3 text-[10px] text-[var(--color-text-secondary)] font-mono flex flex-col gap-1">
                        <div>Vendedor: <span className="text-[var(--color-text-primary)]">{drop.collector?.displayName || 'Colecionador'}</span></div>
                        <div>Lançamento: <span>{new Date(drop.startsAt).toLocaleString('pt-BR')}</span></div>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col gap-3">
                      <div>
                        <Text variant="heading-sm" className="font-bold">{drop.title}</Text>
                        <Text variant="caption" className="text-[var(--color-accent-primary)] font-bold font-mono">
                          Preço: {formatBRL(drop.priceCents || 0)}
                        </Text>
                      </div>
                      
                      <Text color="secondary" className="text-[11px] leading-relaxed">{drop.description}</Text>

                      {story && (
                        <div className="bg-[var(--color-bg-surface)] p-2.5 rounded border border-[var(--color-border-subtle)] text-[10px] italic text-[var(--color-text-secondary)]">
                          &ldquo;{story}&rdquo;
                        </div>
                      )}

                      {/* Caixa de Voto */}
                      <div className="border-t border-[var(--color-border-subtle)] pt-3 flex flex-col gap-3">
                        {hasVoted ? (
                          <div className="bg-[var(--color-bg-surface)] p-3 rounded border border-[var(--color-border-default)] text-xs flex flex-col gap-1.5">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] uppercase font-bold text-[var(--color-text-tertiary)] flex items-center gap-1"><CheckCircle2 className="size-3 text-green-500" /> Seu veredicto</span>
                              <Badge className={cn(
                                'text-[9px] font-bold',
                                currentVote.verdict === 'authentic' && 'bg-green-500/10 text-green-500',
                                currentVote.verdict === 'fake' && 'bg-red-500/10 text-red-500',
                                currentVote.verdict === 'suspicious' && 'bg-yellow-500/10 text-yellow-500'
                              )}>
                                {currentVote.verdict === 'authentic' ? 'Original' : currentVote.verdict === 'fake' ? 'Falso' : 'Suspeito'}
                              </Badge>
                            </div>
                            <Text color="secondary" className="italic bg-[var(--color-bg-inset)]/30 p-2 rounded text-[11px]">&ldquo;{currentVote.notes}&rdquo;</Text>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-3 gap-2">
                              {(['authentic', 'suspicious', 'fake'] as const).map((verdict) => (
                                <button
                                  key={verdict}
                                  type="button"
                                  onClick={() => setFormDropVerdict((prev) => ({ ...prev, [drop.id]: verdict }))}
                                  className={cn(
                                    'py-1.5 text-center border rounded-[var(--radius-sm)] text-[10px] font-bold transition-all focus:outline-none',
                                    selectedVerdict === verdict
                                      ? verdict === 'authentic' ? 'border-green-500 bg-green-500/5 text-green-500'
                                      : verdict === 'fake' ? 'border-red-500 bg-red-500/5 text-red-500'
                                      : 'border-yellow-500 bg-yellow-500/5 text-yellow-500'
                                      : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
                                  )}
                                >
                                  {verdict === 'authentic' ? 'Original' : verdict === 'fake' ? 'Falso' : 'Suspeito'}
                                </button>
                              ))}
                            </div>

                            {selectedVerdict && (
                              <div className="flex flex-col gap-2.5 bg-[var(--color-bg-surface)] p-3 border border-[var(--color-border-subtle)] rounded-[var(--radius-sm)]">
                                <div className="flex justify-between items-center text-[9px] font-mono">
                                  <span>Grau de Confiança</span>
                                  <span>{confidenceVal}/5</span>
                                </div>
                                <input
                                  type="range"
                                  min={1}
                                  max={5}
                                  value={confidenceVal}
                                  onChange={(e) => setFormDropConfidence((prev) => ({ ...prev, [drop.id]: parseInt(e.target.value) || 3 }))}
                                  className="w-full accent-[var(--color-accent-primary)]"
                                />
                                <textarea
                                  rows={2}
                                  value={notesText}
                                  onChange={(e) => setFormDropNotes((prev) => ({ ...prev, [drop.id]: e.target.value }))}
                                  placeholder="Justifique seu voto com base nos detalhes das fotos e descrição..."
                                  className="w-full rounded bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] px-2 py-1 text-xs focus:outline-none text-[var(--color-text-primary)]"
                                />
                                <Button
                                  onClick={() => handleDropVoteSubmit(drop.id)}
                                  disabled={isPending || !isAuthenticated}
                                  size="sm"
                                  className="w-full text-xs font-bold"
                                >
                                  {isPending ? 'Enviando...' : 'Enviar Voto de Curadoria (+10 XP)'}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Admin Controls */}
                        {isAdmin && (
                          <div className="border-t border-dashed border-[var(--color-border-subtle)] pt-2.5 flex justify-between items-center text-[10px] font-mono">
                            <span className="text-[var(--color-accent-hype)] font-bold">Moderação</span>
                            <div className="flex gap-1.5">
                              <Button onClick={() => handleResolveDrop(drop.id, 'authentic')} size="sm" variant="outline" className="h-6 text-[10px] border-green-500/20 text-green-500">Aprovar e Agendar</Button>
                              <Button onClick={() => handleResolveDrop(drop.id, 'fake')} size="sm" variant="outline" className="h-6 text-[10px] border-red-500/20 text-red-500">Reprovar Drop</Button>
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
        )
      )}

      {/* TAB 2: AUDITORIA DE AVALIAÇÕES */}
      {activeSubTab === 'reviews' && (
        <div className="flex flex-col gap-6">
          {targetReviews.map((rev) => {
            const hasVoted = !!reviewVotes[rev.id];
            const currentVote = reviewVotes[rev.id];
            const selectedVerdict = formReviewVerdict[rev.id];
            const notesText = formReviewNotes[rev.id] || '';

            return (
              <Card key={rev.id} className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/20">
                <CardContent className="p-6 flex flex-col md:flex-row gap-6">
                  
                  {/* Foto da reclamação carregada pelo cliente */}
                  <div className="w-full md:w-48 shrink-0 flex flex-col gap-2">
                    {rev.images.length > 0 ? (
                      <div className="relative aspect-[4/3] w-full overflow-hidden rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={rev.images[0]} alt="Provas do comprador" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-[4/3] w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] flex flex-col items-center justify-center text-center p-3">
                        <ShieldAlert className="size-6 text-[var(--color-text-tertiary)] mb-1" />
                        <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">Sem fotos anexadas pelo comprador</span>
                      </div>
                    )}
                    
                    <div className="text-[9px] text-[var(--color-text-secondary)] font-mono flex flex-col gap-0.5 border-t border-[var(--color-border-subtle)] pt-2 mt-1">
                      <div>De: <span className="text-[var(--color-text-primary)] font-bold">{rev.buyerName}</span></div>
                      <div>Para: <span className="text-[var(--color-text-primary)]">{rev.sellerName}</span></div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-2.5">
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] truncate max-w-[200px]">{rev.productTitle}</span>
                        <div className="flex text-amber-400">
                          {Array.from({ length: rev.rating }).map((_, i) => (
                            <Star key={i} className="size-3 fill-current" />
                          ))}
                          {Array.from({ length: 5 - rev.rating }).map((_, i) => (
                            <Star key={i} className="size-3 text-zinc-600" />
                          ))}
                        </div>
                      </div>
                      <Text variant="body-sm" className="font-bold text-[var(--color-text-primary)] mt-1">
                        Avaliação do Comprador:
                      </Text>
                      <Text color="secondary" className="text-[11px] italic bg-[var(--color-bg-surface)] p-2.5 rounded border border-[var(--color-border-subtle)] mt-1.5 leading-relaxed">
                        &ldquo;{rev.comment}&rdquo;
                      </Text>
                    </div>

                    {/* Voto de Auditoria */}
                    <div className="border-t border-[var(--color-border-subtle)] pt-3 flex flex-col gap-3">
                      {hasVoted ? (
                        <div className="bg-[var(--color-bg-surface)] p-3 rounded border border-[var(--color-border-default)] text-xs flex flex-col gap-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] uppercase font-bold text-[var(--color-text-tertiary)] flex items-center gap-1"><CheckCircle2 className="size-3 text-green-500" /> Seu voto de Auditoria</span>
                            <Badge className={cn(
                              'text-[9px] font-bold',
                              currentVote.verdict === 'approve' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                            )}>
                              {currentVote.verdict === 'approve' ? 'Reclamação Real' : 'Erro / Má-fé'}
                            </Badge>
                          </div>
                          <Text color="secondary" className="italic bg-[var(--color-bg-inset)]/30 p-2 rounded text-[11px]">&ldquo;{currentVote.notes}&rdquo;</Text>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setFormReviewVerdict((prev) => ({ ...prev, [rev.id]: 'approve' }))}
                              className={cn(
                                'py-1.5 text-center border rounded-[var(--radius-sm)] text-[10px] font-bold transition-all focus:outline-none',
                                selectedVerdict === 'approve'
                                  ? 'border-green-500 bg-green-500/5 text-green-500'
                                  : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
                              )}
                            >
                              ✅ Reclamação Real
                            </button>
                            <button
                              onClick={() => setFormReviewVerdict((prev) => ({ ...prev, [rev.id]: 'reject' }))}
                              className={cn(
                                'py-1.5 text-center border rounded-[var(--radius-sm)] text-[10px] font-bold transition-all focus:outline-none',
                                selectedVerdict === 'reject'
                                  ? 'border-red-500 bg-red-500/5 text-red-500'
                                  : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
                              )}
                            >
                              ❌ Erro do Comprador / Má-fé
                            </button>
                          </div>

                          {selectedVerdict && (
                            <div className="flex flex-col gap-2 bg-[var(--color-bg-surface)] p-3 border border-[var(--color-border-subtle)] rounded-[var(--radius-sm)]">
                              <textarea
                                rows={2}
                                value={notesText}
                                onChange={(e) => setFormReviewNotes((prev) => ({ ...prev, [rev.id]: e.target.value }))}
                                placeholder={
                                  selectedVerdict === 'approve'
                                    ? 'Explique por que as provas mostram que o comprador está certo (ex: item de fato quebrado/diferente)...'
                                    : 'Justifique por que o comprador errou (ex: manual já explicava esse comportamento do teclado)...'
                                }
                                className="w-full rounded bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] px-2 py-1 text-xs focus:outline-none text-[var(--color-text-primary)]"
                              />
                              <Button
                                onClick={() => handleReviewVoteSubmit(rev.id)}
                                disabled={isPending || !isAuthenticated}
                                size="sm"
                                className="w-full text-xs font-bold"
                              >
                                {isPending ? 'Enviando...' : 'Enviar Auditoria (+10 XP)'}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Admin Controls */}
                      {isAdmin && (
                        <div className="border-t border-dashed border-[var(--color-border-subtle)] pt-2.5 flex justify-between items-center text-[10px] font-mono">
                          <span className="text-[var(--color-accent-hype)] font-bold">Moderação</span>
                          <div className="flex gap-1.5">
                            <Button onClick={() => handleResolveReview(rev.id, 'approve')} size="sm" variant="outline" className="h-6 text-[10px] border-green-500/20 text-green-500">Aprovar Avaliação (No Ar)</Button>
                            <Button onClick={() => handleResolveReview(rev.id, 'reject')} size="sm" variant="outline" className="h-6 text-[10px] border-red-500/20 text-red-500">Rejeitar (Arquivar)</Button>
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
