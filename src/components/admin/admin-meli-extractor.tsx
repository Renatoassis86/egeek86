'use client';

import { useState, useEffect } from 'react';
import { Search, RefreshCw, Zap, CheckCircle2, AlertCircle, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { triggerManualMeliExtraction, triggerFullDiscoveryRun } from '@/server/actions/collector';

export function AdminMeliExtractor() {
  const [queryInput, setQueryInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [autoPilot, setAutoPilot] = useState(false);
  const [lastResult, setLastResult] = useState<{
    message: string;
    created?: number;
    updated?: number;
  } | null>(null);

  useEffect(() => {
    if (!autoPilot) return;
    const interval = setInterval(() => {
      handleFullScan();
    }, 60000);
    return () => clearInterval(interval);
  }, [autoPilot]);

  async function handleManualExtract() {
    if (!queryInput.trim()) {
      toast.error('Digite um termo de busca ou cole o link do Mercado Livre.');
      return;
    }

    setIsExtracting(true);
    setLastResult(null);

    try {
      const result = await triggerManualMeliExtraction(queryInput);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message || 'Extração concluída com sucesso!');
        setLastResult({
          message: result.message || 'Extração concluída com sucesso!',
          created: result.discoverySummary?.created,
          updated: result.priceSummary?.updated,
        });
        setQueryInput('');
      }
    } catch {
      toast.error('Erro ao conectar com a API do Mercado Livre.');
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleFullScan() {
    setIsScanningAll(true);
    setLastResult(null);

    try {
      const result = await triggerFullDiscoveryRun();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message || 'Varredura geral concluída com sucesso!');
        setLastResult({
          message: result.message || 'Varredura geral concluída com sucesso!',
          created: result.discoverySummary?.created,
          updated: result.priceSummary?.updated,
        });
      }
    } catch {
      toast.error('Erro ao executar varredura geral do Mercado Livre.');
    } finally {
      setIsScanningAll(false);
    }
  }

  return (
    <Card className="border-[var(--color-accent-gold)]/40 bg-[var(--color-bg-surface)] overflow-hidden shadow-lg">
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[var(--radius-sm)] bg-[var(--color-accent-gold)]/15 text-[var(--color-accent-gold)]">
              <Zap className="size-5" />
            </div>
            <div>
              <Text variant="heading-sm" className="font-bold">
                Painel de Extração e Raspagem Mercado Livre
              </Text>
              <Text variant="caption" color="secondary">
                Monitore e extraia novos jogos, consoles e variações de preço sob demanda.
              </Text>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={autoPilot ? 'hype' : 'outline'}
              size="sm"
              onClick={() => {
                setAutoPilot(!autoPilot);
                toast(autoPilot ? 'Piloto Automático desativado.' : 'Piloto Automático ativado! Atualizando dados a cada 60s.');
              }}
              className="gap-2 text-xs font-bold"
            >
              <Bot className={`size-4 ${autoPilot ? 'animate-bounce text-emerald-400' : ''}`} />
              <span>{autoPilot ? 'Piloto Automático: LIGADO (60s)' : 'Ativar Piloto Automático'}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleFullScan}
              disabled={isScanningAll || isExtracting}
              className="shrink-0 gap-2 border-[var(--color-border-strong)] hover:border-[var(--color-accent-gold)]"
            >
              <RefreshCw className={`size-3.5 ${isScanningAll ? 'animate-spin' : ''}`} />
              <span>{isScanningAll ? 'Executando Varredura...' : 'Varredura Geral Agora'}</span>
            </Button>
          </div>
        </div>

        {/* Input de Busca / Link Manual */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-text-tertiary)]" />
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualExtract()}
              placeholder="Ex: Turok Nintendo Switch, Zelda, ou cole o link do produto no Mercado Livre..."
              className="pl-9 bg-[var(--color-bg-elevated)]"
              disabled={isExtracting || isScanningAll}
            />
          </div>

          <Button
            onClick={handleManualExtract}
            disabled={isExtracting || isScanningAll || !queryInput.trim()}
            className="gap-2 bg-[var(--color-accent-gold)] text-black font-bold hover:bg-[var(--color-accent-gold)]/90 shrink-0"
          >
            <Zap className={`size-4 ${isExtracting ? 'animate-pulse' : ''}`} />
            <span>{isExtracting ? 'Extraindo do ML...' : 'Extrair do Mercado Livre'}</span>
          </Button>
        </div>

        {/* Feedback visual do resultado da extração */}
        {lastResult && (
          <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/30 flex items-center justify-between gap-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-primary)]">
              <CheckCircle2 className="size-4 text-[var(--color-accent-gold)] shrink-0" />
              <span>{lastResult.message}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono">
              {lastResult.created != null && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                  +{lastResult.created} novos jogos
                </span>
              )}
              {lastResult.updated != null && (
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
                  {lastResult.updated} preços atualizados
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
