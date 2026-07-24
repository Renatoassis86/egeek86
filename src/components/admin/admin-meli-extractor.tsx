'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, RefreshCw, Zap, CheckCircle2, AlertCircle, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBRL } from '@/lib/format';
import { triggerManualMeliExtraction, triggerFullDiscoveryRun } from '@/server/actions/collector';
import type { AdminOfferSearchResult } from '@/server/queries/affiliate';

export function AdminMeliExtractor() {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [autoPilot, setAutoPilot] = useState(false);
  const [lastResult, setLastResult] = useState<{
    message: string;
    created?: number;
    updated?: number;
  } | null>(null);

  // Autocomplete: mostra o que já está catalogado enquanto digita (ex:
  // "turok" já lista os Turok existentes), sem esperar apertar "Extrair".
  const [suggestions, setSuggestions] = useState<AdminOfferSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const term = queryInput.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoadingSuggestions(true);
    const requestId = ++requestIdRef.current;
    // Debounce de 250ms — não dispara uma busca a cada tecla.
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search-offers?q=${encodeURIComponent(term)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: AdminOfferSearchResult[] };
        if (requestId !== requestIdRef.current) return; // resposta antiga, descarta
        setSuggestions(data.items);
      } catch {
        // silencioso — autocomplete é só conveniência, não crítico
      } finally {
        if (requestId === requestIdRef.current) setLoadingSuggestions(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

    setShowSuggestions(false);
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
          <div className="relative flex-1" ref={containerRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-text-tertiary)] z-10" />
            <Input
              value={queryInput}
              onChange={(e) => {
                setQueryInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualExtract()}
              placeholder="Ex: Turok Nintendo Switch, Zelda, ou cole o link do produto no Mercado Livre..."
              className="pl-9 bg-[var(--color-bg-elevated)]"
              disabled={isExtracting || isScanningAll}
              autoComplete="off"
            />

            {/* Dropdown de autocomplete — o que já está catalogado pra esse termo */}
            {showSuggestions && queryInput.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-20 max-h-80 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]">
                {loadingSuggestions ? (
                  <div className="p-3 text-xs text-[var(--color-text-tertiary)]">Buscando...</div>
                ) : suggestions.length === 0 ? (
                  <div className="p-3 text-xs text-[var(--color-text-tertiary)]">
                    Nada catalogado ainda pra &ldquo;{queryInput.trim()}&rdquo; — use &ldquo;Extrair do Mercado Livre&rdquo; pra buscar direto na plataforma.
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)]">
                      Já catalogado ({suggestions.length})
                    </div>
                    {suggestions.map((s) => (
                      <button
                        key={s.offerId}
                        type="button"
                        onClick={() => {
                          setShowSuggestions(false);
                          router.push(`/admin/ofertas/${s.offerId}`);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-bg-surface)] transition-colors border-b border-[var(--color-border-subtle)] last:border-b-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {s.imageUrl && (
                          <img src={s.imageUrl} alt="" className="size-8 shrink-0 rounded object-cover bg-[var(--color-bg-inset)]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <Text variant="body-sm" className="line-clamp-1">
                            {s.title}
                          </Text>
                          <Text variant="caption" color="tertiary">
                            {s.networkName}
                          </Text>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          <Text variant="mono-md" className="tabular">
                            {formatBRL(s.currentPriceCents)}
                          </Text>
                          {s.affiliateLinkPending && (
                            <Badge variant="danger" size="sm">
                              Link pendente
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
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
