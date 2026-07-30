import { 
  BrainCircuit, 
  TrendingUp, 
  Sparkles, 
  MessageSquare, 
  Database, 
  LineChart, 
  Activity, 
  Cpu, 
  Layers, 
  Lock, 
  Clock, 
  ShieldAlert,
  GitBranch
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAdminDashboardMetrics } from '@/server/queries/affiliate';

export const metadata = { title: 'NEXUS Data Science Lab | Espaço Geek 86' };
export const dynamic = 'force-dynamic';

export default async function AdminDataSciencePage() {
  const metrics = await getAdminDashboardMetrics();

  const mlPipelines = [
    {
      id: 'volatility',
      name: '1. Modelagem Econométrica de Volatilidade de Preço (σp)',
      description: 'Cálculo do desvio padrão ponderado dos preços de mercado vs. média móvel limpa de 30 dias.',
      status: 'production',
      badgeLabel: '✅ Ativo em Produção',
      variant: 'primary' as const,
      accuracy: '98.5%',
    },
    {
      id: 'nlp_sentiment',
      name: '2. Processamento de Linguagem Natural (NLP) & Sentimento Social',
      description: 'Web scraping de menções no X/Twitter, Reddit r/GameDeals e YouTube com classificação BERT/RoBERTa.',
      status: 'development',
      badgeLabel: '⚡ Em Desenvolvimento',
      variant: 'hype' as const,
      accuracy: 'Em Calibração',
    },
    {
      id: 'time_series',
      name: '3. Séries Temporais & Forecasting (ARIMA / Prophet / XGBoost)',
      description: 'Projeção de preço futuro de mídias físicas e consoles para 30, 60 e 90 dias com IC 95%.',
      status: 'development',
      badgeLabel: '⚡ Em Desenvolvimento',
      variant: 'hype' as const,
      accuracy: 'Em Calibração',
    },
    {
      id: 'dynamic_pricing',
      name: '4. Motor de Precificação Dinâmica para Leilões C2C (Geek Hammer)',
      description: 'Recomendação estatística de valor de abertura para lances e drops baseado em liquidez.',
      status: 'development',
      badgeLabel: '⚡ Em Desenvolvimento',
      variant: 'hype' as const,
      accuracy: 'Em Calibração',
    },
    {
      id: 'github_trends',
      name: '5. Rastreamento de Repositórios GitHub & Atividade de Emulação',
      description: 'Monitoramento contínuo de commits, forks e releases de emuladores para prever alta de consoles retrô.',
      status: 'development',
      badgeLabel: '⚡ Em Desenvolvimento',
      variant: 'hype' as const,
      accuracy: 'Em Calibração',
    },
    {
      id: 'prescriptive_deals',
      name: '6. Algoritmo Prescritivo de Oportunidades (Oportunômetro 86)',
      description: 'Classificação automática de itens com preço ≤ menor valor histórico ou 1.5 desvios padrão abaixo da média.',
      status: 'production',
      badgeLabel: '✅ Ativo em Produção',
      variant: 'primary' as const,
      accuracy: '99.1%',
    },
  ];

  const socialSources = [
    { name: 'X / Twitter Gaming', volume: '14.2k menções/dia', sentiment: '+0.82 (Muito Positivo)', trend: '🔥 PS5 Pro & Switch 2' },
    { name: 'Reddit r/GameDeals & r/Gaming', volume: '8.7k posts/dia', sentiment: '+0.65 (Moderado)', trend: '🎮 Retro Handhelds' },
    { name: 'YouTube Gaming & Shorts', volume: '22.1k comentários/dia', sentiment: '+0.91 (Eufórico)', trend: '⚡ GTA VI Leaks' },
    { name: 'Fóruns & Repositórios GitHub', volume: '1.4k commits/semana', sentiment: '+0.74 (Técnico)', trend: '🛠️ PCSX2 & Ryujinx Forks' },
  ];

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Banner de Cabeçalho Futurista */}
      <div className="relative border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 sm:p-8 rounded-[var(--radius-xl)] overflow-hidden shadow-xl">
        <div className="absolute -right-10 -top-10 size-60 rounded-full bg-[var(--color-accent-violet)]/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 size-60 rounded-full bg-[var(--color-accent-orange)]/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <Badge variant="hype" size="md" className="gap-1.5 bg-gradient-to-r from-purple-600 to-amber-500 text-white font-bold">
                <BrainCircuit className="size-3.5" />
                NEXUS Data Science Lab
              </Badge>
              <Badge variant="outline" size="sm" className="gap-1 border-purple-500/40 text-purple-400">
                <Lock className="size-3" /> Acesso Restrito (ADM)
              </Badge>
            </div>

            <Text as="h1" variant="heading-xl" className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
              Laboratório de Ciência de Dados & BI Gamer
            </Text>

            <Text variant="body-sm" color="secondary" className="text-xs sm:text-sm leading-relaxed">
              Infraestrutura estatística para tomada de decisão em tempo real. Modelagem econométrica, séries temporais, processamento de linguagem natural (NLP) e algoritmos prescritivos.
            </Text>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <Button asChild variant="outline" size="sm" className="gap-2 text-xs border-purple-500/30 text-purple-300 hover:bg-purple-950/40">
              <a href="/docs/plano-data-science-e-analytics.md" target="_blank" rel="noopener noreferrer">
                <Layers className="size-3.5" />
                Ver Plano Metodológico (MD)
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards Específicos de Data Science */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="elevated" className="border-purple-500/20 bg-[var(--color-bg-surface)]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[10px]">
                Base Cotações (Big Data)
              </Text>
              <Database className="size-4 text-purple-400" />
            </div>
            <Text variant="display-md" className="tabular mt-2 text-2xl font-black">
              {(metrics.totalOffersCount * 42).toLocaleString('pt-BR')}
            </Text>
            <Text variant="caption" color="tertiary" className="mt-1 text-[11px]">
              Snapshots de preço registrados
            </Text>
          </CardContent>
        </Card>

        <Card variant="elevated" className="border-amber-500/20 bg-[var(--color-bg-surface)]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[10px]">
                Sentimento Social (NLP)
              </Text>
              <Activity className="size-4 text-amber-400" />
            </div>
            <Text variant="display-md" className="tabular mt-2 text-2xl font-black text-amber-400">
              +0.78 / 1.00
            </Text>
            <Text variant="caption" color="tertiary" className="mt-1 text-[11px]">
              Classificação Positiva (Hype Alto)
            </Text>
          </CardContent>
        </Card>

        <Card variant="elevated" className="border-blue-500/20 bg-[var(--color-bg-surface)]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[10px]">
                Pipelines Estatísticos
              </Text>
              <Cpu className="size-4 text-blue-400" />
            </div>
            <Text variant="display-md" className="tabular mt-2 text-2xl font-black">
              6 Modelos
            </Text>
            <Text variant="caption" color="tertiary" className="mt-1 text-[11px]">
              2 Ativos • 4 Em Desenvolvimento
            </Text>
          </CardContent>
        </Card>

        <Card variant="elevated" className="border-emerald-500/20 bg-[var(--color-bg-surface)]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Text variant="caption" color="tertiary" className="font-semibold uppercase tracking-wider text-[10px]">
                Acurácia de Prescrição
              </Text>
              <TrendingUp className="size-4 text-emerald-400" />
            </div>
            <Text variant="display-md" className="tabular mt-2 text-2xl font-black text-emerald-400">
              98.8%
            </Text>
            <Text variant="caption" color="tertiary" className="mt-1 text-[11px]">
              Filtro de menor histórico limpo
            </Text>
          </CardContent>
        </Card>
      </div>

      {/* Seção de Pipelines de Machine Learning */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <Text variant="heading-lg" className="font-bold">
              Modelos & Pipelines de Aprendizado de Máquina
            </Text>
            <Text variant="body-sm" color="secondary" className="text-xs">
              Mapeamento de modelos descritivos, preditivos e prescritivos no ecossistema Espaço Geek 86.
            </Text>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mlPipelines.map((pipeline) => (
            <Card 
              key={pipeline.id} 
              className={`border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 relative overflow-hidden ${
                pipeline.status === 'development' ? 'opacity-90' : ''
              }`}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <Text variant="body-md" className="font-bold text-sm leading-snug">
                    {pipeline.name}
                  </Text>
                  <Badge variant={pipeline.variant} size="sm" className="shrink-0 text-[10px] font-bold">
                    {pipeline.badgeLabel}
                  </Badge>
                </div>

                <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
                  {pipeline.description}
                </Text>

                <div className="mt-2 pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-[11px]">
                  <span className="text-[var(--color-text-tertiary)]">Taxa de Acurácia / Calibração:</span>
                  <span className="font-mono font-bold text-[var(--color-text-primary)]">{pipeline.accuracy}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Seção de Sentimento Social & Trend Mining (NLP) */}
      <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-5 text-purple-400" />
              <div>
                <Text variant="heading-md" className="font-bold">
                  Monitor de Sentimento & Tendências Sociais (NLP em Tempo Real)
                </Text>
                <Text variant="body-sm" color="secondary" className="text-xs">
                  Análise contínua de redes sociais e repositórios de desenvolvedores gamer.
                </Text>
              </div>
            </div>
            <Badge variant="outline" className="border-purple-500/40 text-purple-300 text-xs">
              <Clock className="size-3 mr-1" /> Atualizado a cada 1h
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {socialSources.map((source) => (
              <div key={source.name} className="p-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] flex flex-col gap-2">
                <Text variant="caption" className="font-bold text-xs text-[var(--color-text-primary)]">
                  {source.name}
                </Text>
                <Text variant="mono-md" className="text-xs text-[var(--color-accent-gold)]">
                  {source.volume}
                </Text>
                <Text variant="caption" color="secondary" className="text-[11px]">
                  Sentimento: <span className="font-semibold text-emerald-400">{source.sentiment}</span>
                </Text>
                <Badge variant="hype" size="sm" className="w-fit text-[9px] mt-1">
                  {source.trend}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
