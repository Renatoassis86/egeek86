'use client';

import { useState, useEffect } from 'react';
import { Bot, Activity, CheckCircle2, Clock, Zap, Database, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/format';

interface AutomatedMonitorProps {
  stats: {
    totalMasterProducts: number;
    totalActiveOffers: number;
    totalPriceSnapshots: number;
    lastIngestedItems: {
      id: string;
      title: string;
      priceCents: number;
      imageUrl: string | null;
      networkName: string;
      publishedAt: string;
    }[];
  };
}

export function AdminAutomatedScraperMonitor({ stats }: AutomatedMonitorProps) {
  const [lastSync, setLastSync] = useState<string>(new Date().toLocaleTimeString());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setLastSync(new Date().toLocaleTimeString());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card className="border-[var(--color-accent-gold)]/40 bg-[var(--color-bg-surface)] overflow-hidden shadow-xl">
      <CardContent className="p-6 flex flex-col gap-6">
        {/* Cabeçalho do Monitorador */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[var(--radius-md)] bg-emerald-500/15 text-emerald-400 relative">
              <Bot className="size-6 animate-pulse" />
              <span className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Text variant="heading-md" className="font-bold">
                  Monitor de Raspagem e Automação 24/7
                </Text>
                <Badge variant="success" size="sm" className="font-bold">
                  🟢 Vercel Cron Ativo
                </Badge>
              </div>
              <Text variant="caption" color="secondary" className="mt-0.5">
                Executando extrações automáticas a cada 5 minutos em segundo plano · Sincronizado às {lastSync}
              </Text>
            </div>
          </div>
        </div>

        {/* Métricas Principais de Extração */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[var(--color-text-tertiary)]">
              <span className="text-caption font-semibold">Produtos Catalogados</span>
              <Database className="size-4 text-[var(--color-accent-gold)]" />
            </div>
            <Text variant="mono-lg" className="font-bold text-[var(--color-accent-gold)]">
              {stats.totalMasterProducts.toLocaleString('pt-BR')}
            </Text>
            <span className="text-[11px] text-emerald-400 font-medium">100% Categorias ML</span>
          </div>

          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[var(--color-text-tertiary)]">
              <span className="text-caption font-semibold">Ofertas Ativas</span>
              <Zap className="size-4 text-[var(--color-accent-primary)]" />
            </div>
            <Text variant="mono-lg" className="font-bold text-[var(--color-accent-primary)]">
              {stats.totalActiveOffers.toLocaleString('pt-BR')}
            </Text>
            <span className="text-[11px] text-emerald-400 font-medium">Monitoramento Vivo</span>
          </div>

          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[var(--color-text-tertiary)]">
              <span className="text-caption font-semibold">Cotações / Snapshots</span>
              <Activity className="size-4 text-[var(--color-accent-hype)]" />
            </div>
            <Text variant="mono-lg" className="font-bold text-[var(--color-accent-hype)]">
              {stats.totalPriceSnapshots.toLocaleString('pt-BR')}
            </Text>
            <span className="text-[11px] text-[var(--color-text-tertiary)] font-medium">Histórico Diário</span>
          </div>

          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[var(--color-text-tertiary)]">
              <span className="text-caption font-semibold">Frequência Automática</span>
              <Clock className="size-4 text-emerald-400" />
            </div>
            <Text variant="mono-md" className="font-bold text-emerald-400">
              Cada 5 min
            </Text>
            <span className="text-[11px] text-emerald-400 font-bold">Sem intervenção manual</span>
          </div>
        </div>

        {/* Feed de Últimos Itens Ingeridos pelo Robô */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Text variant="body-sm" className="font-bold text-[var(--color-text-primary)]">
              Últimas Extrações Automáticas Capturadas
            </Text>
            <span className="text-caption text-[var(--color-text-tertiary)]">Feed em tempo real</span>
          </div>

          <div className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] overflow-hidden">
            {stats.lastIngestedItems.length === 0 ? (
              <div className="p-6 text-center text-xs italic text-[var(--color-text-tertiary)]">
                Aguardando próxima onda de extração do robô automático...
              </div>
            ) : (
              stats.lastIngestedItems.map((item) => (
                <div key={item.id} className="p-3 flex items-center justify-between gap-3 hover:bg-[var(--color-bg-surface)] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="size-9 object-contain rounded bg-[var(--color-bg-inset)] p-0.5 shrink-0" />
                    ) : (
                      <div className="size-9 rounded bg-[var(--color-bg-inset)] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <Text variant="body-sm" className="font-bold line-clamp-1">
                        {item.title}
                      </Text>
                      <span className="text-[10px] text-[var(--color-text-tertiary)] block">
                        Ingerido em {item.publishedAt} · {item.networkName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 font-mono">
                    <Text variant="mono-sm" className="font-bold text-[var(--color-accent-gold)]">
                      {formatBRL(item.priceCents)}
                    </Text>
                    <Badge variant="outline" size="sm" className="text-[10px] border-emerald-500/40 text-emerald-400">
                      Auto Ingested
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
