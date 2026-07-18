'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Flame, Clock, Calendar, CheckCircle2, ShieldCheck, Heart, User, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { HypeCountdown } from '@/components/geek-deals/hype-countdown';
import { HypeStockBar } from '@/components/geek-deals/hype-stock-bar';
import { AntiBotShield } from '@/components/geek-deals/antibot-shield';
import { CollectorCard } from '@/components/geek-deals/collector-card';
import { HypeMediaCarousel } from '@/components/geek-deals/hype-media-carousel';
import { joinDropWaitlist } from '@/server/actions/hype';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DropWithRelations } from '@/server/queries/hype';

interface HypeZoneTabsProps {
  liveDrops: DropWithRelations[];
  upcomingDrops: DropWithRelations[];
  pastDrops: DropWithRelations[];
  userWaitlistIds: string[];
  isAuthenticated: boolean;
}

export function HypeZoneTabs({
  liveDrops,
  upcomingDrops,
  pastDrops,
  userWaitlistIds,
  isAuthenticated,
}: HypeZoneTabsProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming' | 'past'>('live');
  const [isPending, startTransition] = useTransition();
  const [waitlistIds, setWaitlistIds] = useState<string[]>(userWaitlistIds);
  
  // Controle do modal de simulação de compra anti-bot
  const [isBuying, setIsBuying] = useState(false);
  const [buyStep, setBuyStep] = useState<'checking' | 'queue' | 'success'>('checking');
  const [activeDropTitle, setActiveDropTitle] = useState('');

  const handleJoinWaitlist = (dropId: string) => {
    if (!isAuthenticated) {
      toast.error('Faça login para entrar na lista de espera.');
      // O Next.js redireciona via Link/href
      return;
    }

    startTransition(async () => {
      const res = await joinDropWaitlist(dropId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
        setWaitlistIds((prev) => [...prev, dropId]);
      }
    });
  };

  const handleStartPurchase = (dropTitle: string) => {
    if (!isAuthenticated) {
      toast.error('Faça login para comprar.');
      return;
    }
    setActiveDropTitle(dropTitle);
    setIsBuying(true);
    setBuyStep('checking');

    // Simula as etapas do cockpit anti-bot
    setTimeout(() => {
      setBuyStep('queue');
      setTimeout(() => {
        setBuyStep('success');
      }, 1800);
    }, 1200);
  };

  const tabsConfig = [
    { id: 'live', label: 'Drops Ativos', count: liveDrops.length, icon: Flame },
    { id: 'upcoming', label: 'Próximos Lançamentos', count: upcomingDrops.length, icon: Clock },
    { id: 'past', label: 'Cofre Histórico', count: pastDrops.length, icon: Calendar },
  ] as const;

  const currentDrops = 
    activeTab === 'live' ? liveDrops : 
    activeTab === 'upcoming' ? upcomingDrops : pastDrops;

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Abas Estilizadas */}
      <div className="flex border-b border-[var(--color-border-subtle)] pb-px overflow-x-auto gap-4">
        {tabsConfig.map((tab) => {
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative pb-4 text-body-sm font-semibold transition-all flex items-center gap-2 px-1 focus-visible:outline-none shrink-0 border-b-2 border-transparent',
                isActive
                  ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              )}
            >
              <TabIcon className={cn('size-4', isActive && 'text-[var(--color-accent-primary)]')} />
              <span>{tab.label}</span>
              <Badge variant="outline" size="sm" className="ml-1 text-[10px]">
                {tab.count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Conteúdo das Abas */}
      {currentDrops.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--color-border-subtle)] rounded-[var(--radius-xl)] bg-[var(--color-bg-inset)]/20">
          <Text variant="body-md" color="tertiary">
            Nenhum drop disponível nesta categoria no momento.
          </Text>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {currentDrops.map((drop) => {
            const hasJoinedWaitlist = waitlistIds.includes(drop.id);
            const specs = (drop.metadata as any)?.specs || [];
            const story = (drop.metadata as any)?.story || '';
            const collectorsViewing = (drop.metadata as any)?.collectorsViewing || 0;
            const collectorsWatching = (drop.metadata as any)?.collectorsWatching || 0;
            const velocityMessage = (drop.metadata as any)?.velocityMessage || '';
            const rarityGrade = (drop.metadata as any)?.rarityGrade || '';

            return (
              <Card key={drop.id} className="relative overflow-hidden border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/40 hover:bg-[var(--color-bg-inset)]/85 transition-all">
                {activeTab === 'live' && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-hype)] animate-pulse" />
                )}

                <CardContent className="p-6 md:p-8 flex flex-col lg:flex-row gap-8 items-start">
                  
                  {/* Coluna 1: Imagens do Lançamento */}
                  <div className="w-full lg:w-[420px] shrink-0">
                    <HypeMediaCarousel images={drop.images} alt={drop.title} />
                    
                    {/* Telemetria Anti-Bot */}
                    {activeTab === 'live' && (
                      <AntiBotShield className="mt-4" />
                    )}

                    {/* Rótulo de Raridade */}
                    {rarityGrade && (
                      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-3">
                        <Text variant="caption" color="tertiary">Raridade / Categoria</Text>
                        <Badge variant="hype" size="sm" className="font-semibold">{rarityGrade}</Badge>
                      </div>
                    )}
                  </div>

                  {/* Coluna 2: Informações Principais & Ações */}
                  <div className="flex-1 flex flex-col gap-4 w-full">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {activeTab === 'live' && (
                          <Badge variant="hype" size="md" className="animate-pulse">
                            <Flame className="size-3" /> LIVE NOW
                          </Badge>
                        )}
                        <Badge variant="outline" size="md">
                          {drop.accessType === 'public' ? 'Acesso Público' : 
                           drop.accessType === 'tier_locked' ? 'Geek Level Restrito' : 'Waitlist Exclusiva'}
                        </Badge>
                      </div>

                      {/* Contador de Visualizadores */}
                      {activeTab === 'live' && collectorsViewing > 0 && (
                        <Text variant="caption" className="text-[10px] font-mono text-[var(--color-accent-hype)] bg-[var(--color-accent-hype)]/5 border border-[var(--color-accent-hype)]/20 px-2 py-0.5 rounded-full">
                          🔥 {collectorsViewing} colecionadores assistindo agora
                        </Text>
                      )}

                      {activeTab === 'upcoming' && collectorsWatching > 0 && (
                        <Text variant="caption" className="text-[10px] font-mono text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5 border border-[var(--color-accent-primary)]/20 px-2 py-0.5 rounded-full">
                          ⭐ {collectorsWatching} na lista de desejos
                        </Text>
                      )}
                    </div>

                    <div>
                      <Text as="h2" variant="heading-xl" className="text-[22px] md:text-[26px]">
                        {drop.title}
                      </Text>
                      {drop.priceCents && (
                        <Text variant="mono-lg" className="text-xl text-[var(--color-accent-primary)] mt-1 tracking-tight">
                          {formatBRL(drop.priceCents)}
                        </Text>
                      )}
                    </div>

                    <Text variant="body-sm" color="secondary" className="leading-relaxed">
                      {drop.description}
                    </Text>

                    {/* Storytelling do Colecionador */}
                    {story && (
                      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] p-4 relative overflow-hidden">
                        <div className="absolute top-2 right-2 text-[var(--color-text-tertiary)] opacity-30 select-none">
                          <Sparkles className="size-6" />
                        </div>
                        <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[8px] block mb-1">
                          História da Peça pelo Colecionador
                        </Text>
                        <Text variant="body-sm" color="secondary" className="italic text-xs font-serif leading-relaxed">
                          &ldquo;{story}&rdquo;
                        </Text>
                      </div>
                    )}

                    {/* Especificações Técnicas */}
                    {specs.length > 0 && (
                      <div>
                        <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[9px] mb-2 block">
                          O que está incluso no item:
                        </Text>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-[var(--color-text-secondary)]">
                          {specs.map((spec: string, idx: number) => (
                            <li key={idx} className="flex items-center gap-2">
                              <span className="h-1 w-1 rounded-full bg-[var(--color-accent-primary)] shrink-0" />
                              <span>{spec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Barra de Progresso do Estoque (Somente Ativos ou Passados) */}
                    {(activeTab === 'live' || drop.status === 'sold_out') && (
                      <HypeStockBar stockLimit={drop.stockLimit} stockSold={drop.stockSold} className="mt-2" />
                    )}

                    {/* Velocidade de venda (Cofre Histórico) */}
                    {activeTab === 'past' && velocityMessage && (
                      <div className="bg-[var(--color-accent-success)]/5 border border-[var(--color-accent-success)]/20 text-[var(--color-accent-success)] rounded-[var(--radius-sm)] p-2.5 text-xs font-mono">
                        ⚡ {velocityMessage}
                      </div>
                    )}

                    {/* Caixa de Ações / CTA */}
                    <div className="mt-4 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between border-t border-[var(--color-border-subtle)] pt-5">
                      
                      {/* Cartão de Colecionador Vendedor */}
                      <CollectorCard collector={drop.collector} className="flex-1 w-full" />

                      {/* Botões / CTAs de Compra */}
                      <div className="shrink-0 flex flex-col gap-2">
                        {activeTab === 'live' && (
                          <Button
                            onClick={() => handleStartPurchase(drop.title)}
                            disabled={drop.stockSold >= drop.stockLimit}
                            variant={drop.stockSold >= drop.stockLimit ? 'secondary' : 'hype'}
                            size="lg"
                            className="w-full sm:w-48 font-bold"
                          >
                            {drop.stockSold >= drop.stockLimit ? 'Esgotado' : 'Comprar Agora'}
                          </Button>
                        )}

                        {activeTab === 'upcoming' && (
                          <>
                            {hasJoinedWaitlist ? (
                              <Button disabled variant="outline" size="lg" className="w-full sm:w-48 flex items-center gap-1.5">
                                <CheckCircle2 className="size-4 text-[var(--color-accent-success)]" />
                                Inscrito na Fila
                              </Button>
                            ) : (
                              isAuthenticated ? (
                                <Button
                                  onClick={() => handleJoinWaitlist(drop.id)}
                                  disabled={isPending}
                                  variant="primary"
                                  size="lg"
                                  className="w-full sm:w-48 font-semibold"
                                >
                                  {isPending ? 'Entrando...' : 'Entrar na Waitlist'}
                                </Button>
                              ) : (
                                <Button asChild variant="primary" size="lg" className="w-full sm:w-48 font-semibold">
                                  <Link href={`/entrar?next=/hype-zone`}>Fazer Login</Link>
                                </Button>
                              )
                            )}
                            <div className="text-center">
                              <HypeCountdown targetDate={drop.startsAt} className="items-center" />
                            </div>
                          </>
                        )}

                        {activeTab === 'past' && (
                          <Button disabled variant="outline" size="lg" className="w-full sm:w-48">
                            Drop Finalizado
                          </Button>
                        )}
                      </div>

                    </div>

                  </div>

                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal / Dialog de Compra Anti-Bot */}
      <Dialog open={isBuying} onOpenChange={setIsBuying}>
        <DialogContent className="sm:max-w-md bg-[var(--color-bg-elevated)] border-[var(--color-border-default)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-[var(--color-accent-primary)]" />
              Cockpit Anti-Bot & Fila Justa
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--color-text-secondary)]">
              Verificando sua integridade para garantir que o item {activeDropTitle} vá para um colecionador real.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center p-6 text-center gap-4">
            {buyStep === 'checking' && (
              <>
                <div className="relative flex size-12 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] animate-spin">
                  <span className="size-8 rounded-full border-2 border-t-transparent border-[var(--color-accent-primary)]" />
                </div>
                <div>
                  <Text variant="body-sm" className="font-semibold">Verificando Telemetrias do Navegador...</Text>
                  <Text variant="caption" color="tertiary" className="mt-1 font-mono text-[10px]">
                    IP Hash, Canvas Fingerprint e velocidade de clique em validação.
                  </Text>
                </div>
              </>
            )}

            {buyStep === 'queue' && (
              <>
                <div className="relative flex size-12 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)] animate-pulse">
                  <Clock className="size-6 text-[var(--color-accent-hype)]" />
                </div>
                <div>
                  <Text variant="body-sm" className="font-semibold">Fila Anti-Scalper Acessada</Text>
                  <Text variant="caption" color="tertiary" className="mt-1">
                    Sua posição estimada na fila: <span className="text-[var(--color-text-primary)] font-mono font-bold">#3</span>
                  </Text>
                  <Text variant="caption" color="tertiary" className="text-[9px] block mt-1 font-mono">
                    Aguardando liberação de token do banco...
                  </Text>
                </div>
              </>
            )}

            {buyStep === 'success' && (
              <>
                <div className="flex size-14 items-center justify-center rounded-full bg-[var(--color-accent-success)]/10 text-[var(--color-accent-success)]">
                  <CheckCircle2 className="size-8" />
                </div>
                <div>
                  <Text variant="body-md" className="font-bold text-[var(--color-accent-success)]">Compra Aprovada com Sucesso!</Text>
                  <Text variant="body-sm" color="secondary" className="mt-1.5">
                    Parabéns! Você garantiu o drop do item. O colecionador foi notificado para preparar o envio.
                  </Text>
                  <Text variant="caption" color="tertiary" className="mt-2 text-[10px] block font-mono">
                    ID da transação: {Math.random().toString(36).substring(2, 10).toUpperCase()}
                  </Text>
                </div>
                <Button onClick={() => setIsBuying(false)} variant="primary" className="mt-2 w-full">
                  Ver meus pedidos
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
