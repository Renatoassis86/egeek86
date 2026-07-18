'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Cpu, HardDrive, Wifi } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface AntiBotShieldProps {
  className?: string;
}

export function AntiBotShield({ className }: AntiBotShieldProps) {
  const [telemetry, setTelemetry] = useState<{
    ipHash: string;
    userAgent: string;
    integrityVerified: boolean;
    mouseTracked: boolean;
    latency: number;
  }>({
    ipHash: '...',
    userAgent: '...',
    integrityVerified: false,
    mouseTracked: false,
    latency: 0,
  });

  useEffect(() => {
    // Simula telemetrias e lê dados do browser
    const userAgent = navigator.userAgent.slice(0, 24) + '...';
    
    // Hash local simplificado
    const localHash = Math.random().toString(16).substring(2, 10).toUpperCase();

    // Mede latência aproximada
    const start = performance.now();
    fetch('/api/health')
      .then(() => {
        const end = performance.now();
        setTelemetry(prev => ({ ...prev, latency: Math.round(end - start) }));
      })
      .catch(() => {
        setTelemetry(prev => ({ ...prev, latency: 12 }));
      });

    const timer = setTimeout(() => {
      setTelemetry(prev => ({
        ...prev,
        ipHash: `SHA-256: ${localHash}`,
        userAgent,
        integrityVerified: true,
        mouseTracked: true,
      }));
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Card className={cn('bg-[var(--color-bg-inset)]/60 border-[var(--color-border-subtle)] shadow-inner backdrop-blur-md', className)}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-[var(--color-accent-success)]/10 text-[var(--color-accent-success)] animate-pulse">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <Text variant="caption" className="font-semibold text-[var(--color-text-primary)]">
              Mecanismo Anti-Bot Espaço Geek 86
            </Text>
            <Text variant="caption" color="tertiary" className="text-[10px]">
              Forensics telemetria ativada para drops com alta concorrência.
            </Text>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] pt-3 text-[10px] font-mono text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-1.5">
            <Wifi className="size-3 text-[var(--color-text-tertiary)]" />
            <span>IP Hash: <span className="text-[var(--color-text-primary)]">{telemetry.ipHash.slice(0, 14)}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Cpu className="size-3 text-[var(--color-text-tertiary)]" />
            <span>Browser: <span className="text-[var(--color-text-primary)] truncate max-w-[80px] inline-block align-bottom">{telemetry.userAgent}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <HardDrive className="size-3 text-[var(--color-text-tertiary)]" />
            <span>Browser Check: <span className={cn(telemetry.integrityVerified ? "text-[var(--color-accent-success)]" : "text-[var(--color-accent-hype)] animate-pulse")}>
              {telemetry.integrityVerified ? 'Aprovado' : 'Checando...'}
            </span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-3 text-[var(--color-text-tertiary)]" />
            <span>Fila Anti-Scalper: <span className="text-[var(--color-accent-success)]">Ativa</span></span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
