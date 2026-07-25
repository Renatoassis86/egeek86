'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Laptop, Smartphone, Gamepad2, Info, Calendar } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

interface ChartStat {
  label: string;
  value: string;
  desc: string;
}

export function PriceChartsShowcase() {
  const [activeTab, setActiveTab] = useState<'global' | 'brasil' | 'consoles'>('global');

  return (
    <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] overflow-hidden shadow-[var(--shadow-xl)] relative">
      <CardContent className="p-0">
        {/* Header de Abas Interno */}
        <div className="flex border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/30">
          <button
            onClick={() => setActiveTab('global')}
            className={cn(
              'flex-1 py-4 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 text-center focus:outline-none relative z-10',
              activeTab === 'global'
                ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)] font-bold'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            )}
          >
            Mercado Global
          </button>
          <button
            onClick={() => setActiveTab('brasil')}
            className={cn(
              'flex-1 py-4 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 text-center focus:outline-none relative z-10',
              activeTab === 'brasil'
                ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)] font-bold'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            )}
          >
            Mercado Brasil
          </button>
          <button
            onClick={() => setActiveTab('consoles')}
            className={cn(
              'flex-1 py-4 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 text-center focus:outline-none relative z-10',
              activeTab === 'consoles'
                ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)] font-bold'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            )}
          >
            Gerações de Hardware
          </button>
        </div>

        <div className="p-6 md:p-8 min-h-[360px] flex flex-col justify-between">
          <div>
            {activeTab === 'global' && <GlobalMetrics />}
            {activeTab === 'brasil' && <BrasilMetrics />}
            {activeTab === 'consoles' && <ConsoleMetrics />}
          </div>

          {/* Rodapé das Fontes */}
          <div className="mt-8 pt-4 border-t border-[var(--color-border-subtle)] flex flex-wrap gap-x-4 gap-y-2 justify-between items-center text-[10px] text-[var(--color-text-tertiary)] font-mono">
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              Atualizado em Tempo Real (Julho/2026)
            </span>
            <span>
              {activeTab === 'global' && 'Fonte: Newzoo Global Games Market Report & BCG Analysis'}
              {activeTab === 'brasil' && 'Fonte: 11ª Pesquisa Game Brasil (PGB) & Censo Abragames'}
              {activeTab === 'consoles' && 'Fonte: Sony & Nintendo Investor Relations Reports'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GlobalMetrics() {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  const platformShare = [
    { name: 'Mobile', percent: 49, val: '$92B', color: 'bg-amber-500', icon: Smartphone, desc: 'Fatia dominante puxada por microtransações e acessibilidade móvel.' },
    { name: 'Consoles', percent: 28, val: '$51B', color: 'bg-[var(--color-accent-primary)]', icon: Gamepad2, desc: 'Hardware dedicado e lançamentos físicos/digitais AAA.' },
    { name: 'PC', percent: 23, val: '$43B', color: 'bg-emerald-500', icon: Laptop, desc: 'Maior taxa de crescimento relativo entre todos os grandes segmentos (+10.4%).' },
  ];

  return (
    <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] items-center">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <Badge variant="primary" size="sm">Métricas de Faturamento</Badge>
          <Text variant="caption" color="tertiary">Projeção Global</Text>
        </div>
        <div>
          <Text as="h3" variant="heading-lg" className="font-bold">
            US$ 205-207 Bilhões de Faturamento
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-2 leading-relaxed">
            O mercado global gamer encerrou o último ciclo anual consolidado e projeta ultrapassar os 207 bilhões de dólares em faturamento anual. A indústria é maior, em receita, do que o mercado de cinema e de música somados.
          </Text>
        </div>

        <div className="flex flex-col gap-3 mt-2">
          {platformShare.map((p) => (
            <div
              key={p.name}
              onMouseEnter={() => setHoveredSlice(p.name)}
              onMouseLeave={() => setHoveredSlice(null)}
              className={cn(
                'p-3 rounded border border-transparent transition-all cursor-default',
                hoveredSlice === p.name ? 'bg-[var(--color-bg-inset)]/40 border-[var(--color-border-subtle)]' : ''
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={cn('size-2.5 rounded-full', p.color)} />
                  <p.icon className="size-4 text-[var(--color-text-secondary)]" />
                  <Text variant="body-sm" className="font-semibold">{p.name}</Text>
                </div>
                <Text variant="body-sm" className="font-mono font-bold text-[var(--color-accent-primary)]">
                  {p.percent}% ({p.val})
                </Text>
              </div>
              
              {/* Barra Animada com Framer Motion ao rolar na tela */}
              <div className="relative h-2 w-full bg-[var(--color-bg-inset)] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${p.percent}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                  className={cn('h-full rounded-full transition-colors', p.color)}
                />
              </div>
              
              {hoveredSlice === p.name && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1.5"
                >
                  <Text variant="caption" color="secondary" className="text-[11px] leading-normal">
                    {p.desc}
                  </Text>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-[var(--color-border-subtle)] pt-6 md:pt-0 md:pl-8 gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
          <TrendingUp className="size-7" />
        </div>
        <div>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <Text variant="mono-lg" className="text-[32px] font-bold text-[var(--color-accent-primary)]">
              ~3.68 Bi
            </Text>
          </motion.div>
          <Text variant="caption" color="tertiary" className="uppercase tracking-wider font-mono text-[10px] mt-1">
            Jogadores no Mundo
          </Text>
        </div>
        <Text variant="caption" color="secondary" className="max-w-[28ch] leading-relaxed">
          Com projeção de mais de 1.66 bilhão de jogadores pagantes ativos em consoles, PCs e smartphones.
        </Text>
      </div>
    </div>
  );
}

function BrasilMetrics() {
  const stats = [
    { label: 'Jogadores Ativos', value: '100M+', desc: 'Equivale a 73.9% da população brasileira jogando algum tipo de mídia digital.', delay: 0 },
    { label: 'Mercado Nacional', value: 'R$ 12.7 Bi', desc: 'Faturamento anual no país, registrando alta de 8% nos gastos de consumo de software de jogos.', delay: 0.1 },
    { label: 'Estúdios Ativos', value: '1.042', desc: 'Crescimento de +683.4% nos estúdios desenvolvedores de jogos digitais no Brasil nos últimos 10 anos.', delay: 0.2 },
    { label: 'Profissionais no Setor', value: '13.225', desc: 'Alta de 6.3% de empregos formais gerados diretamente no desenvolvimento de jogos no país.', delay: 0.3 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Badge variant="hype" size="sm">Censo Gamer Nacional</Badge>
        <Text variant="caption" color="tertiary">Recorte Brasil</Text>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: s.delay }}
            className="p-4 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20 hover:border-[var(--color-accent-primary)]/30 transition-all flex flex-col gap-1.5"
          >
            <Text variant="caption" color="tertiary" className="font-mono uppercase tracking-wider text-[10px]">
              {s.label}
            </Text>
            <Text variant="mono-lg" className="text-xl font-bold text-[var(--color-text-primary)]">
              {s.value}
            </Text>
            <Text variant="caption" color="secondary" className="leading-relaxed text-[11px]">
              {s.desc}
            </Text>
          </motion.div>
        ))}
      </div>

      <div className="flex items-start gap-3 bg-[var(--color-bg-inset)]/35 p-4 rounded border border-[var(--color-border-subtle)]">
        <Info className="size-5 text-[var(--color-accent-primary)] shrink-0 mt-0.5" />
        <Text variant="caption" color="secondary" className="leading-relaxed">
          <strong>Insight Regional:</strong> O Brasil lidera o mercado de jogos digitais na América Latina em termos de volume de jogadores. O canal móvel (smartphones) continua sendo o meio de maior inclusão digital de novos consumidores.
        </Text>
      </div>
    </div>
  );
}

function ConsoleMetrics() {
  const units = [
    { name: 'Sony PlayStation 5', value: '93.7 Milhões', max: 160, current: 93.7, color: 'bg-blue-600', desc: 'Unidades vitalícias vendidas globalmente até março de 2026. Liderança disparada na geração de consoles domésticos de alta performance.' },
    { name: 'Nintendo Switch', value: '155.92 Milhões', max: 160, current: 155.92, color: 'bg-red-600', desc: 'Consolidado como o segundo console de mesa mais vendido de todos os tempos da indústria global, prestes a quebrar o recorde histórico do PS2.' },
    { name: 'Nintendo Switch 2', value: '19.86 Milhões', max: 160, current: 19.86, color: 'bg-orange-500', desc: 'Vendas iniciais globais estimadas no ciclo de estreia comercial do console de nova geração híbrido da Nintendo.' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Badge variant="outline" size="sm" className="bg-[var(--color-bg-inset)]">Instalação de Hardware</Badge>
        <Text variant="caption" color="tertiary">Relatórios Oficiais de Hardware</Text>
      </div>

      <div className="flex flex-col gap-5">
        {units.map((u, i) => {
          const widthPercent = (u.current / u.max) * 100;
          return (
            <motion.div
              key={u.name}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="flex flex-col gap-2 p-4 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/10 rounded hover:border-[var(--color-border-strong)] transition-all"
            >
              <div className="flex justify-between items-center gap-2">
                <Text variant="body-sm" className="font-bold text-[var(--color-text-primary)]">{u.name}</Text>
                <Text variant="body-sm" className="font-mono text-[var(--color-accent-primary)] font-bold">{u.value}</Text>
              </div>

              {/* Barra de comparação de unidades vendidas */}
              <div className="relative h-2 w-full bg-[var(--color-bg-inset)] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${widthPercent}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                  className={cn('h-full rounded-full transition-colors', u.color)}
                />
              </div>

              <Text variant="caption" color="secondary" className="text-[11px] leading-relaxed mt-1">
                {u.desc}
              </Text>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
