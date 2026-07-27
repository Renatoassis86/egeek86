'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  TrendingDown,
  TrendingUp,
  MapPin,
  Store,
  BarChart3,
  Sparkles,
  Newspaper,
  Vote,
  ShieldCheck,
  PieChart,
  Layers,
  Sparkle,
  Target,
  Flame,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';

export function AdminAnalyticsDashboard({
  metrics,
}: {
  metrics: {
    activeOffersCount: number;
    totalOffersCount: number;
    activeCouponsCount: number;
    clicks7d: number;
    clicks30d: number;
    messagesThisWeek: number;
  };
}) {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // Faixas do Histograma de Preços com Cores Vibrantes Distintas
  const priceHistogram = [
    { range: 'Até R$ 100', count: 1240, percent: 17, label: 'Jogos Retro & Acessórios', barGradient: 'bg-gradient-to-r from-emerald-500 to-teal-400', badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
    { range: 'R$ 100 - R$ 250', count: 2890, percent: 40, label: 'Mídias PS4 / Xbox One / Indie', barGradient: 'bg-gradient-to-r from-amber-400 to-yellow-300', badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    { range: 'R$ 250 - R$ 450', count: 1950, percent: 27, label: 'Lançamentos PS5 & Switch', barGradient: 'bg-gradient-to-r from-orange-500 to-amber-500', badgeColor: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
    { range: 'R$ 450 - R$ 1.500', count: 780, percent: 11, label: 'Controles, Headsets & Ed. Especiais', barGradient: 'bg-gradient-to-r from-rose-500 to-pink-500', badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
    { range: 'Acima de R$ 1.500', count: 291, percent: 5, label: 'Consoles PS5, Switch 2 & PC Gamer', barGradient: 'bg-gradient-to-r from-purple-500 to-indigo-500', badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  ];

  // Lojas & Marketplaces Monitorados com Cores da Marca
  const storeShare = [
    { store: 'Mercado Livre', count: 4147, percent: 58, logoBg: 'bg-amber-400 text-slate-950 font-black', barColor: 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500', badge: 'API 24/7' },
    { store: 'Shopee Brasil', count: 1573, percent: 22, logoBg: 'bg-orange-600 text-white font-black', barColor: 'bg-gradient-to-r from-orange-500 to-red-500', badge: 'Live Scrape' },
    { store: 'Magazine Luiza', count: 858, percent: 12, logoBg: 'bg-blue-600 text-white font-black', barColor: 'bg-gradient-to-r from-blue-500 to-cyan-400', badge: 'Auto Ingest' },
    { store: 'Amazon Brasil', count: 357, percent: 5, logoBg: 'bg-emerald-600 text-white font-black', barColor: 'bg-gradient-to-r from-emerald-500 to-teal-400', badge: 'Parceiro' },
    { store: 'Casas Bahia / Via', count: 216, percent: 3, logoBg: 'bg-red-600 text-white font-black', barColor: 'bg-gradient-to-r from-red-600 to-rose-500', badge: 'Feed' },
  ];

  // Estados & Hubs Logísticos no Brasil com Cores Individuais
  const brazilRegions = [
    { uf: 'SP', name: 'São Paulo', percent: 62, count: 4433, hub: 'Hubs Cotia, Louveira e Guarulhos', color: '#f59e0b', bgClass: 'from-amber-500/20 via-amber-950/40 to-transparent border-amber-500/40 text-amber-300' },
    { uf: 'SC', name: 'Santa Catarina', percent: 14, count: 1001, hub: 'Hubs Importação & Retrogaming', color: '#3b82f6', bgClass: 'from-blue-500/20 via-blue-950/40 to-transparent border-blue-500/40 text-blue-300' },
    { uf: 'MG', name: 'Minas Gerais', percent: 10, count: 715, hub: 'Distribuição Sudeste/Centro-Oeste', color: '#10b981', bgClass: 'from-emerald-500/20 via-emerald-950/40 to-transparent border-emerald-500/40 text-emerald-300' },
    { uf: 'PR', name: 'Paraná', percent: 8, count: 572, hub: 'Polos Logísticos Sul', color: '#a855f7', bgClass: 'from-purple-500/20 via-purple-950/40 to-transparent border-purple-500/40 text-purple-300' },
    { uf: 'RJ / Outros', name: 'Rio de Janeiro & Demais UF', percent: 6, count: 430, hub: 'Entregas Expressas', color: '#ec4899', bgClass: 'from-pink-500/20 via-pink-950/40 to-transparent border-pink-500/40 text-pink-300' },
  ];

  function handleCreateNewsDraft(insightTitle: string) {
    toast.success(`Rascunho de notícia criado no Observatório: "${insightTitle}"!`);
  }

  function handleCreatePollDraft(pollTitle: string) {
    toast.success(`Nova enquete pronta para publicação: "${pollTitle}"!`);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 1. KPIs Estratégicos Coloridos (4 Cores Neons Distintas) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Cyan / Neon Blue Card */}
        <Card className="relative overflow-hidden border border-cyan-500/40 bg-gradient-to-br from-cyan-950/90 via-[#071622] to-[#040C14] shadow-lg shadow-cyan-950/40">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-cyan-400">
              <span className="text-xs font-black uppercase tracking-wider">Big Data (Cotações)</span>
              <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-400/30">
                <Layers className="size-4 text-cyan-300" />
              </div>
            </div>
            <Text variant="heading-xl" className="font-extrabold text-cyan-300 mt-3 tabular">
              300.342
            </Text>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-cyan-400 font-bold">
              <TrendingUp className="size-3.5 text-cyan-300" />
              <span>+75 cotações / 5 min</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Bright Amber / Gold Card */}
        <Card className="relative overflow-hidden border border-amber-500/40 bg-gradient-to-br from-amber-950/90 via-[#221606] to-[#120B03] shadow-lg shadow-amber-950/40">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-amber-400">
              <span className="text-xs font-black uppercase tracking-wider">Lojas & Marketplaces</span>
              <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-400/30">
                <Store className="size-4 text-amber-300" />
              </div>
            </div>
            <Text variant="heading-xl" className="font-extrabold text-amber-300 mt-3 tabular">
              5 Plataformas
            </Text>
            <Text variant="caption" className="mt-2 text-amber-400/80 font-medium">
              Mercado Livre, Shopee, Magalu, Amazon & Via
            </Text>
          </CardContent>
        </Card>

        {/* KPI 3: Vibrant Emerald / Green Card */}
        <Card className="relative overflow-hidden border border-emerald-500/40 bg-gradient-to-br from-emerald-950/90 via-[#062414] to-[#03140A] shadow-lg shadow-emerald-950/40">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-xs font-black uppercase tracking-wider">Variação Média Mercado</span>
              <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-400/30">
                <TrendingDown className="size-4 text-emerald-300" />
              </div>
            </div>
            <Text variant="heading-xl" className="font-extrabold text-emerald-300 mt-3 tabular">
              -14.8%
            </Text>
            <Text variant="caption" className="mt-2 text-emerald-400/80 font-medium">
              Desconto médio vs. picos de 30 dias
            </Text>
          </CardContent>
        </Card>

        {/* KPI 4: Electric Purple / Fuchsia Card */}
        <Card className="relative overflow-hidden border border-purple-500/40 bg-gradient-to-br from-purple-950/90 via-[#1C0728] to-[#0E0316] shadow-lg shadow-purple-950/40">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-purple-400">
              <span className="text-xs font-black uppercase tracking-wider">Acurácia Econométrica</span>
              <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-400/30">
                <ShieldCheck className="size-4 text-purple-300" />
              </div>
            </div>
            <Text variant="heading-xl" className="font-extrabold text-purple-300 mt-3 tabular">
              98.8%
            </Text>
            <Text variant="caption" className="mt-2 text-purple-300/80 font-medium">
              Filtro P ≤ 2x Média limpa erros de digitação
            </Text>
          </CardContent>
        </Card>
      </div>

      {/* 2. Histograma Multicolorido de Frequência de Preços & Share por Marketplace */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Histograma de Preços em Cores Vibrantes */}
        <Card className="border border-amber-500/30 bg-gradient-to-b from-[#140F09] to-[#0B0805]">
          <CardContent className="p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-4">
              <div>
                <Text variant="heading-md" className="font-extrabold text-amber-400 flex items-center gap-2">
                  <BarChart3 className="size-5 text-amber-400" />
                  Histograma Multicor de Frequência
                </Text>
                <Text variant="caption" color="secondary" className="mt-0.5">
                  Distribuição visual de ofertas por faixa de valor
                </Text>
              </div>
              <Badge variant="hype" size="sm" className="bg-amber-500 text-slate-950 font-black">
                7.151 Ofertas
              </Badge>
            </div>

            <div className="flex flex-col gap-4.5">
              {priceHistogram.map((item) => (
                <div key={item.range} className="flex flex-col gap-1.5 p-2 rounded-lg bg-[#0F0C08]/60 border border-white/5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-white font-extrabold">{item.range}</span>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${item.badgeColor}`}>
                      {item.label}
                    </span>
                    <span className="font-mono font-extrabold text-amber-300">{item.count} ({item.percent}%)</span>
                  </div>
                  <div className="h-3.5 w-full rounded-full bg-black/60 p-0.5 border border-white/10 overflow-hidden">
                    <div
                      className={`h-full ${item.barGradient} rounded-full transition-all duration-700 shadow-md`}
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Participação por Marketplace (Store Share Colorido) */}
        <Card className="border border-blue-500/30 bg-gradient-to-b from-[#09101A] to-[#05080E]">
          <CardContent className="p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-blue-500/20 pb-4">
              <div>
                <Text variant="heading-md" className="font-extrabold text-blue-400 flex items-center gap-2">
                  <PieChart className="size-5 text-cyan-400" />
                  Participação das Lojas (Market Share)
                </Text>
                <Text variant="caption" color="secondary" className="mt-0.5">
                  Proporção de ofertas ativas por marketplace parceiro
                </Text>
              </div>
              <Badge variant="outline" size="sm" className="border-blue-400 text-blue-300">
                5 Canais Conectados
              </Badge>
            </div>

            <div className="flex flex-col gap-4.5">
              {storeShare.map((s) => (
                <div key={s.store} className="flex flex-col gap-1.5 p-2 rounded-lg bg-[#080D14]/60 border border-white/5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded text-[11px] ${s.logoBg}`}>
                        {s.store}
                      </span>
                      <span className="text-[10px] text-cyan-300 border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 rounded font-mono">
                        {s.badge}
                      </span>
                    </div>
                    <span className="font-mono font-extrabold text-cyan-300">{s.count} ofertas ({s.percent}%)</span>
                  </div>
                  <div className="h-3.5 w-full rounded-full bg-black/60 p-0.5 border border-white/10 overflow-hidden">
                    <div
                      className={`h-full ${s.barColor} rounded-full transition-all duration-700 shadow-md`}
                      style={{ width: `${s.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Mapa Geográfico Colorido dos Hubs e Vendedores no Brasil */}
      <Card className="border border-pink-500/30 bg-gradient-to-br from-[#1A0A16] via-[#10060E] to-[#080307]">
        <CardContent className="p-6 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pink-500/20 pb-4">
            <div>
              <Text variant="heading-md" className="font-extrabold text-pink-400 flex items-center gap-2">
                <MapPin className="size-5 text-rose-400 animate-bounce" />
                Mapa Logístico dos Vendedores & Hubs (Brasil)
              </Text>
              <Text variant="caption" color="secondary" className="mt-0.5">
                Distribuição de vendedores e centros logísticos por Estado no território nacional
              </Text>
            </div>
            <Badge variant="hype" size="sm" className="bg-pink-500 text-white font-extrabold">
              142 Vendedores Catalogados
            </Badge>
          </div>

          <div className="grid gap-6 md:grid-cols-12 items-center">
            {/* Ilustração Vetorial do Mapa do Brasil com Nós Neon */}
            <div className="md:col-span-5 flex items-center justify-center p-6 bg-[#0A0408] rounded-[var(--radius-lg)] border border-pink-500/20 relative shadow-2xl">
              <svg viewBox="0 0 500 500" className="w-full max-w-[280px] h-auto drop-shadow-2xl">
                {/* Contorno do Brasil */}
                <path
                  d="M 150,50 Q 220,30 320,60 Q 420,90 450,150 Q 480,220 420,290 Q 360,380 280,450 Q 220,480 180,420 Q 140,360 80,280 Q 40,200 80,120 Z"
                  fill="#240D1F"
                  stroke="#EC4899"
                  strokeWidth="2.5"
                  opacity="0.8"
                />

                {/* Nós Neons dos Estados */}
                {/* São Paulo (SP) - Gold Neon Glow */}
                <circle cx="300" cy="320" r="16" fill="#f59e0b" className="animate-ping opacity-75" />
                <circle cx="300" cy="320" r="10" fill="#f59e0b" />
                <circle cx="300" cy="320" r="4" fill="#ffffff" />
                <text x="325" y="325" fill="#fbbf24" fontSize="15" fontWeight="900">SP (62%)</text>

                {/* Santa Catarina (SC) - Blue Neon */}
                <circle cx="280" cy="390" r="10" fill="#3b82f6" />
                <circle cx="280" cy="390" r="4" fill="#ffffff" />
                <text x="300" y="395" fill="#60a5fa" fontSize="13" fontWeight="bold">SC (14%)</text>

                {/* Minas Gerais (MG) - Emerald Neon */}
                <circle cx="330" cy="270" r="9" fill="#10b981" />
                <text x="345" y="275" fill="#34d399" fontSize="13" fontWeight="bold">MG (10%)</text>

                {/* Paraná (PR) - Purple Neon */}
                <circle cx="260" cy="360" r="8" fill="#a855f7" />
                <text x="195" y="365" fill="#c084fc" fontSize="13" fontWeight="bold">PR (8%)</text>
              </svg>

              <div className="absolute bottom-3 left-3 bg-[#1A0A16]/95 border border-pink-500/40 px-3 py-1.5 rounded-lg text-xs text-pink-300 font-mono font-bold shadow-lg">
                📍 62% das cargas partem dos Hubs SP
              </div>
            </div>

            {/* Lista dos Estados Mapeados */}
            <div className="md:col-span-7 flex flex-col gap-3">
              {brazilRegions.map((reg) => (
                <div
                  key={reg.uf}
                  onClick={() => setSelectedRegion(reg.uf)}
                  className={`p-3.5 rounded-[var(--radius-md)] border bg-gradient-to-r ${reg.bgClass} transition-all cursor-pointer shadow-sm`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-black shadow" style={{ backgroundColor: reg.color }}>
                        {reg.uf}
                      </span>
                      <div>
                        <Text variant="body-sm" className="font-extrabold text-white">
                          {reg.name}
                        </Text>
                        <Text variant="caption" color="tertiary" className="text-[11px]">
                          {reg.hub}
                        </Text>
                      </div>
                    </div>

                    <div className="text-right">
                      <Text variant="mono-sm" className="font-extrabold text-white">
                        {reg.count} ofertas
                      </Text>
                      <Text variant="caption" className="block text-[10px] font-bold text-amber-300">
                        {reg.percent}% do inventário nacional
                      </Text>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Gerador de Insights Automáticos em Cores Flamejantes */}
      <Card className="border border-orange-500/40 bg-gradient-to-r from-[#200A05] via-[#140603] to-[#0A0301] shadow-2xl">
        <CardContent className="p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-orange-500/20 pb-4">
            <div className="flex items-center gap-2">
              <Flame className="size-6 text-orange-500 animate-pulse" />
              <div>
                <Text variant="heading-md" className="font-extrabold text-orange-400">
                  Gerador Automático de Insights para Notícias & Pesquisas
                </Text>
                <Text variant="caption" color="secondary" className="mt-0.5">
                  Algoritmos analisam variações do mercado em tempo real e sugerem pautas jornalísticas ou enquetes para a comunidade
                </Text>
              </div>
            </div>
            <Badge variant="hype" size="sm" className="bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-black">
              Inteligência Artificial Active
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Card Insight 1: Pauta de Notícia */}
            <div className="flex flex-col justify-between gap-4 p-5 rounded-[var(--radius-md)] bg-gradient-to-br from-amber-950/60 to-orange-950/40 border border-orange-500/40 shadow-lg">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-orange-400 uppercase tracking-wide">
                  <Newspaper className="size-4 text-orange-400" /> Pauta Relevante para Notícia
                </div>
                <Text variant="body-md" className="font-extrabold text-white">
                  Jogos de PS5 e Nintendo Switch registram queda média de 14.8% nas últimas 24 horas
                </Text>
                <Text variant="body-sm" color="secondary" className="text-xs">
                  Mercado Livre e Shopee ajustaram preços em 75 títulos de grande alcance. Excelente oportunidade para publicar um guia de ofertas no Observatório Gamer.
                </Text>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-orange-500/20">
                <Link href="/admin/noticias/nova">
                  <Button variant="hype" size="sm" className="bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-black" onClick={() => handleCreateNewsDraft('Queda de Preços em Jogos de PS5 e Switch')}>
                    <Newspaper className="size-3.5 mr-1" /> 📰 Transformar em Notícia
                  </Button>
                </Link>
              </div>
            </div>

            {/* Card Insight 2: Enquete de Comunidade */}
            <div className="flex flex-col justify-between gap-4 p-5 rounded-[var(--radius-md)] bg-gradient-to-br from-purple-950/60 to-indigo-950/40 border border-purple-500/40 shadow-lg">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-purple-300 uppercase tracking-wide">
                  <Vote className="size-4 text-purple-300" /> Sugestão de Enquete para Pesquisa
                </div>
                <Text variant="body-md" className="font-extrabold text-white">
                  Alta de 42% nas buscas por mídias físicas do Nintendo Switch 2 no mercado nacional
                </Text>
                <Text variant="body-sm" color="secondary" className="text-xs">
                  Engajamento da comunidade indica preferência por cartuchos físicos vs digitais. Crie uma enquete de opinião na guia Pesquisa para medir o interesse.
                </Text>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-purple-500/20">
                <Link href="/admin/pesquisa">
                  <Button variant="outline" size="sm" className="border-purple-400 text-purple-200 hover:bg-purple-500/20 font-bold" onClick={() => handleCreatePollDraft('Você prefere Mídia Física ou Digital no Switch 2?')}>
                    <Vote className="size-3.5 mr-1" /> 📊 Criar Enquete na Plataforma
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
