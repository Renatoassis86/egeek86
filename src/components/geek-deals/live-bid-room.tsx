'use client';

import { useState, useEffect, useTransition } from 'react';
import { Gavel, Clock, ShieldCheck, ArrowUpRight, Trophy, Sparkles, UserCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { HypeMediaCarousel } from '@/components/geek-deals/hype-media-carousel';
import { submitAuctionBid } from '@/server/actions/auction';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';

interface Bid {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  amountCents: number;
  isWinning: boolean;
  createdAt: string;
}

interface LiveBidRoomProps {
  auction: {
    id: string;
    title: string;
    description: string;
    images: string[];
    startsAt: string;
    endsAt: string;
    minBidCents: number;
    currentBidCents: number;
    buyoutPriceCents: number | null;
    status: string;
    sellerName: string;
  };
  initialBids?: Bid[];
  currentUserProfile?: {
    id: string;
    name: string;
    geekPoints: number;
    role: string;
  } | null;
}

export function LiveBidRoom({
  auction,
  initialBids = [],
  currentUserProfile,
}: LiveBidRoomProps) {
  const [isPending, startTransition] = useTransition();
  const [bids, setBids] = useState<Bid[]>(initialBids);
  const [currentBidPrice, setCurrentBidPrice] = useState(auction.currentBidCents);
  const [endsAtDate, setEndsAtDate] = useState(new Date(auction.endsAt));
  const [timeRemainingStr, setTimeRemainingStr] = useState('');
  
  // Opções rápidas de incremento
  const currentPrice = currentBidPrice || auction.minBidCents;
  const minIncrement = Math.max(1000, Math.round(currentPrice * 0.05)); // 5% do lance atual ou R$ 10,00
  const recommendedBid = currentPrice + minIncrement;
  
  const [customBidAmount, setCustomBidAmount] = useState(recommendedBid / 100);

  // Mocks de lances anteriores para visualização se a lista estiver vazia
  const fallbackBids: Bid[] = [
    {
      id: 'b1',
      userId: 'u1',
      userName: 'Arthur Pendragon',
      userAvatarUrl: null,
      amountCents: currentPrice - minIncrement,
      isWinning: false,
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: 'b2',
      userId: 'u2',
      userName: 'Julia M. (Vencedor Temporário)',
      userAvatarUrl: null,
      amountCents: currentPrice,
      isWinning: true,
      createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    }
  ];

  const activeBids = bids.length > 0 ? bids : fallbackBids;

  // Atualização em tempo real do temporizador
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const distance = endsAtDate.getTime() - now.getTime();

      if (distance < 0) {
        clearInterval(timer);
        setTimeRemainingStr('ENCERRADO');
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      const dStr = days > 0 ? `${days}d ` : '';
      const hStr = hours.toString().padStart(2, '0');
      const mStr = minutes.toString().padStart(2, '0');
      const sStr = seconds.toString().padStart(2, '0');

      setTimeRemainingStr(`${dStr}${hStr}:${mStr}:${sStr}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [endsAtDate]);

  const handlePlaceBid = (cents: number) => {
    if (!currentUserProfile) {
      toast.error('Você precisa estar logado para dar um lance.');
      return;
    }

    if (cents < recommendedBid) {
      toast.error(`O lance mínimo é de R$ ${(recommendedBid / 100).toFixed(2)}.`);
      return;
    }

    startTransition(async () => {
      const res = await submitAuctionBid({ auctionId: auction.id, amountCents: cents });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
        setCurrentBidPrice(cents);
        
        // Simula atualização do lance vencedor localmente
        const newBid: Bid = {
          id: Math.random().toString(),
          userId: currentUserProfile.id,
          userName: currentUserProfile.name || 'Você',
          userAvatarUrl: null,
          amountCents: cents,
          isWinning: true,
          createdAt: new Date().toISOString(),
        };

        setBids((prev) => [
          newBid,
          ...prev.map((b) => ({ ...b, isWinning: false })),
        ]);
        
        // Se disparou prorrogação, recalcula data de fim localmente (+2m)
        const timeRemaining = endsAtDate.getTime() - Date.now();
        if (timeRemaining > 0 && timeRemaining <= 2 * 60 * 1000) {
          setEndsAtDate(new Date(Date.now() + 2 * 60 * 1000));
        }

        // Reseta custom input
        setCustomBidAmount((cents + Math.max(1000, Math.round(cents * 0.05))) / 100);
      }
    });
  };

  const timeRemainingMs = endsAtDate.getTime() - Date.now();
  const isNearEnd = timeRemainingMs > 0 && timeRemainingMs <= 5 * 60 * 1000; // 5 minutos do fim

  return (
    <Card className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/15">
      <CardContent className="p-6 lg:p-8 flex flex-col lg:flex-row gap-8">
        
        {/* Lado Esquerdo: Imagem e Descrição */}
        <div className="w-full lg:w-[45%] shrink-0 flex flex-col gap-4">
          <HypeMediaCarousel images={auction.images} alt={auction.title} className="aspect-[4/3] rounded-lg border border-[var(--color-border-subtle)]" />
          
          <div className="flex flex-col gap-2">
            <Text variant="heading-sm" className="font-bold">{auction.title}</Text>
            <div className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
              Leiloeiro: <span className="text-[var(--color-text-primary)] font-bold">{auction.sellerName}</span>
            </div>
            <Text color="secondary" className="text-xs leading-relaxed mt-1">
              {auction.description}
            </Text>
          </div>
        </div>

        {/* Lado Direito: Dashboard de Lances e Console */}
        <div className="flex-1 flex flex-col gap-6">
          
          {/* Painel Superior: Cronômetro & Maior Lance */}
          <div className="grid grid-cols-2 gap-4 border-b border-[var(--color-border-subtle)] pb-5">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider flex items-center gap-1">
                <Clock className={cn("size-3", isNearEnd && "text-red-500 animate-pulse")} /> Tempo Restante
              </span>
              <Text variant="mono-lg" className={cn(
                "text-2xl font-black leading-none",
                isNearEnd ? "text-red-500" : "text-[var(--color-text-primary)]"
              )}>
                {timeRemainingStr}
              </Text>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider flex items-center gap-1">
                <Gavel className="size-3 text-[var(--color-accent-primary)]" /> Maior Lance Atual
              </span>
              <Text variant="mono-lg" className="text-2xl font-black text-[var(--color-accent-primary)] leading-none">
                {formatBRL(currentPrice)}
              </Text>
            </div>
          </div>

          {isNearEnd && (
            <div className="bg-red-500/5 border border-red-500/20 rounded p-3 text-[10px] text-red-400 flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="size-3.5 shrink-0 text-red-500" />
              <span>
                <strong>Soft Close Ativado</strong>: Lances nos últimos 2 minutos estendem o leilão por mais 2 minutos, evitando sniping e bots.
              </span>
            </div>
          )}

          {/* Console de Lances */}
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg p-5 flex flex-col gap-4">
            <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[9px] block">
              Console de Arremate
            </Text>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handlePlaceBid(recommendedBid)}
                disabled={isPending || timeRemainingMs < 0}
                variant="hype"
                size="sm"
                className="flex-1 font-bold text-xs"
              >
                + Lance Mínimo (+ {formatBRL(minIncrement)})
              </Button>

              <Button
                onClick={() => handlePlaceBid(currentPrice + Math.max(10000, minIncrement))}
                disabled={isPending || timeRemainingMs < 0}
                variant="outline"
                size="sm"
                className="font-bold text-xs"
              >
                + R$ 100,00
              </Button>
            </div>

            {/* Lance Customizado */}
            <div className="flex flex-col gap-1.5 border-t border-[var(--color-border-subtle)] pt-3">
              <label className="text-[10px] text-[var(--color-text-tertiary)] font-semibold uppercase tracking-wider flex justify-between">
                <span>Lance Personalizado (R$)</span>
                <span>Mínimo: {formatBRL(recommendedBid)}</span>
              </label>

              <div className="flex gap-2">
                <input
                  type="number"
                  min={recommendedBid / 100}
                  step={5}
                  value={customBidAmount}
                  onChange={(e) => setCustomBidAmount(parseFloat(e.target.value) || (recommendedBid / 100))}
                  disabled={timeRemainingMs < 0}
                  className="flex-1 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent-primary)] font-mono"
                />
                <Button
                  onClick={() => handlePlaceBid(Math.round(customBidAmount * 100))}
                  disabled={isPending || timeRemainingMs < 0}
                  size="sm"
                  className="font-bold"
                >
                  Confirmar Lance
                </Button>
              </div>
            </div>

            <div className="text-[9px] text-[var(--color-text-tertiary)] flex items-center gap-1 justify-center mt-1 select-none">
              <ShieldCheck className="size-3 text-green-500" />
              <span>Garantia de caução ativa. Desistências geram perda de 500 XP.</span>
            </div>
          </div>

          {/* Histórico Recente de Lances (Estilo Ledger/Blockchain) */}
          <div className="flex flex-col gap-3">
            <span className="text-[9px] font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Histórico de Lances (Trust Ledger)
            </span>

            <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
              {activeBids.map((bid, i) => (
                <div
                  key={bid.id}
                  className={cn(
                    "flex items-center justify-between border p-2.5 rounded text-xs font-mono transition-all",
                    bid.isWinning
                      ? "border-green-500/20 bg-green-500/5 text-[var(--color-text-primary)]"
                      : "border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] text-[var(--color-text-secondary)]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "size-2 rounded-full",
                      bid.isWinning ? "bg-green-500 animate-pulse" : "bg-zinc-600"
                    )} />
                    <div>
                      <span className="font-bold font-sans">{bid.userName}</span>
                      <span className="text-[9px] text-[var(--color-text-tertiary)] block">
                        {new Date(bid.createdAt).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 font-bold">
                    <span>{formatBRL(bid.amountCents)}</span>
                    {bid.isWinning && (
                      <Badge variant="outline" size="sm" className="text-[8px] border-green-500/20 bg-green-500/10 text-green-500 h-4">
                        Maior Lance
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </CardContent>
    </Card>
  );
}
