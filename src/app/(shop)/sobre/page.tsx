import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  Users,
  LineChart,
  Layers,
  Store,
  Package,
  ArrowRight,
  ShieldCheck,
  Target,
  Compass,
  Award,
  TrendingUp,
  Share2,
  ShoppingCart,
  BookOpen,
  Vote,
  Brain,
  Trophy,
  History,
  CheckCircle2,
} from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { StatTile } from '@/components/ui/stat-tile';
import { getPlatformStats } from '@/server/queries/affiliate';

export const metadata: Metadata = {
  title: 'História e Arquitetura da Plataforma',
  description:
    'Conheça a história, missão, objetivos de inteligência de dados e o ecossistema completo de ferramentas do Espaço Geek 86.',
};

export const dynamic = 'force-dynamic';

export default async function SobrePage() {
  const stats = await getPlatformStats();

  return (
    <div className="flex flex-col w-full bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)]">
      {/* 1. Hero e Identidade */}
      <HeroSection />

      {/* 2. Métricas do Ecossistema em Tempo Real */}
      <PlatformMetricsSection stats={stats} />

      {/* 3. Quem Somos (Nossa História e Origem) */}
      <QuemSomosSection />

      {/* 4. Missão, Visão e Valores */}
      <MissaoVisaoValoresSection />

      {/* 5. Objetivos da Plataforma e Propósito */}
      <ObjetivosJustificativaSection />

      {/* 6. Apresentação Completa das Ferramentas de Inteligência de Dados */}
      <FerramentasShowcaseSection />

      {/* 7. Perfil do Idealizador e Direção Técnica */}
      <IdealizadorSection />
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. Hero e Identidade
// ----------------------------------------------------------------------
function HeroSection() {
  return (
    <section data-theme="dark" className="relative w-full bg-[#0F0C08] mx-auto px-4 lg:px-8 pt-14 pb-12 lg:pt-20 lg:pb-16 overflow-hidden border-b border-[var(--color-border-subtle)]">
      <Glow color="gold" size="xl" intensity={0.2} className="-top-32 -left-32" />
      <Glow color="hype" size="md" intensity={0.15} className="top-20 -right-20" />

      <div className="mx-auto max-w-7xl relative z-10 flex flex-col gap-8">
        <Reveal>
          <div className="flex flex-col gap-3">
            <Badge variant="hype" size="md" className="w-fit font-black tracking-wider uppercase bg-amber-500 text-black">
              Arkos Intelligence e Espaço Geek 86
            </Badge>
            <Text as="h1" variant="display-xl" className="font-black text-white tracking-tight lg:text-display-2xl max-w-[22ch]">
              Inteligência de Dados e Decisão para o Mercado Gamer.
            </Text>
            <Text variant="body-lg" className="mt-2 text-zinc-300 font-medium max-w-[68ch] leading-relaxed">
              O Espaço Geek 86 unifica toda a história dos videogames — da nostalgia da era 8, 16 e 32-bit aos consoles de última geração — com os mais modernos modelos de inteligência de dados e tomada de decisão. Um ecossistema completo desenhado para transformar a experiência de compra do consumidor final e impulsionar a gestão de afiliados e vendedores no Brasil.
            </Text>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="relative aspect-[16/7] sm:aspect-[21/9] w-full overflow-hidden rounded-[var(--radius-xl)] border border-amber-500/30 shadow-2xl bg-[#0B0805]">
            <Image
              src="/images/sobre/hero-geracoes.png"
              alt="Duas gerações de consoles e jogos no Espaço Geek 86"
              fill
              priority
              className="object-contain object-center p-2 opacity-95"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0805] via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between text-xs font-bold text-amber-400">
              <span className="uppercase tracking-widest font-mono">Preservando a Cultura Gamer • Monitorando o Futuro do Mercado</span>
              <span className="hidden sm:inline text-zinc-400 font-mono text-[11px]">Fundado em Teresina-PI • Cobertura Nacional em 5 Marketplaces</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 2. Métricas do Ecossistema
// ----------------------------------------------------------------------
function PlatformMetricsSection({ stats }: { stats: any }) {
  return (
    <section data-theme="dark" className="w-full bg-[#120E09] border-b border-[var(--color-border-subtle)] py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatTile icon={<Package className="size-5" />} value={stats.totalProducts} label="Produtos Catalogados" />
          <StatTile icon={<Store className="size-5" />} value={stats.totalSellers} label="Lojas e Vendedores" />
          <StatTile icon={<Layers className="size-5" />} value={stats.totalNetworks} label="Plataformas Parceiras" />
          <StatTile icon={<LineChart className="size-5" />} value={stats.totalQuotes} label="Cotações em Tempo Real" />
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 3. Quem Somos (Nossa História e Origem)
// ----------------------------------------------------------------------
function QuemSomosSection() {
  return (
    <section id="quem-somos" data-theme="dark" className="w-full bg-[#0A0704] py-16 lg:py-24 border-b border-[var(--color-border-subtle)] scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 grid gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <div className="flex flex-col gap-4">
            <Badge variant="outline" size="sm" className="w-fit text-amber-400 border-amber-500/40">
              <History className="size-3.5 mr-1" /> Nossa História
            </Badge>
            <Text as="h2" variant="display-md" className="font-extrabold text-white">
              Da paixão pelas locadoras dos anos 80 e 90 a um cockpit de Inteligência de Dados.
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed text-zinc-300">
              O Espaço Geek 86 nasceu do fascínio pelas tardes passadas em locadoras de videogame, trocando cartuchos de Super Nintendo e Mega Drive, lendo revistas de dicas e vivenciando a ascensão dos consoles clássicos.
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed text-zinc-300">
              O que começou como uma coleção pessoal rigorosamente catalogada evoluiu para análises quantitativas, rotinas de monitoramento e o hábito de ajudar amigos a encontrarem o preço justo sem cair em armadilhas de falsos descontos.
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed text-zinc-300">
              Hoje, transformamos essa essência em uma plataforma completa de inteligência de dados que varre os maiores marketplaces do Brasil a cada 5 minutos, preservando a paixão do colecionador com a precisão dos modelos analíticos.
            </Text>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-amber-500/30 bg-[#0B0805] shadow-2xl">
            <Image
              src="/images/sobre/locadora.png"
              alt="Ilustração de locadora retro gamer"
              fill
              className="object-contain object-center p-2"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-xs font-mono text-amber-400 font-bold">
              Nostalgia anos 80 e 90 combinada com Inteligência de Dados de alta performance.
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 4. Missão, Visão e Valores
// ----------------------------------------------------------------------
function MissaoVisaoValoresSection() {
  return (
    <section id="missao-visao-valores" data-theme="dark" className="relative w-full bg-gradient-to-b from-[#0F0C08] via-[#15100A] to-[#0A0704] py-20 lg:py-28 border-b border-[var(--color-border-subtle)] scroll-mt-20 overflow-hidden">
      <Glow color="gold" size="xl" intensity={0.15} className="-top-32 right-0" />
      <Glow color="hype" size="md" intensity={0.12} className="bottom-0 left-10" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8 flex flex-col gap-14">
        <Reveal>
          <div className="text-center flex flex-col items-center gap-3">
            <Badge variant="hype" size="md" className="w-fit uppercase font-black tracking-widest bg-amber-500 text-black">
              Pilares Fundamentais
            </Badge>
            <Text as="h2" variant="display-lg" className="font-black text-white tracking-tight">
              Missão, Visão e Valores do Espaço Geek 86
            </Text>
            <Text variant="body-lg" className="text-zinc-300 max-w-[60ch] leading-relaxed">
              Os princípios de inteligência de dados e integridade que norteiam nossos algoritmos e o nosso compromisso com a comunidade gamer.
            </Text>
          </div>
        </Reveal>

        <div className="grid gap-8 md:grid-cols-3">
          {/* Missão */}
          <Reveal delay={0.04}>
            <div className="group h-full rounded-[var(--radius-xl)] border border-amber-500/30 bg-gradient-to-b from-[#1C150B] to-[#120E07] p-7 flex flex-col gap-5 transition-all duration-500 transform hover:-translate-y-2 hover:border-amber-400 hover:shadow-[0_0_35px_rgba(245,158,11,0.25)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/25 transition-all" />
              <div className="p-3.5 rounded-2xl bg-amber-500/20 text-amber-400 w-fit group-hover:scale-110 transition-transform duration-300">
                <Target className="size-7" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">Objetivo Maior</span>
                <h3 className="text-2xl font-black text-white tracking-tight">Nossa Missão</h3>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                Eliminar a assimetria de informação no mercado de jogos do Brasil. Oferecer inteligência de dados transparente em tempo real para que qualquer gamer compre pelo preço justo e qualquer afiliado gerencie suas indicações com ética.
              </p>
              <div className="mt-auto pt-4 border-t border-amber-500/20 flex items-center gap-2 text-xs font-bold text-amber-400">
                <span>Inteligência de Dados 100% Transparente</span>
              </div>
            </div>
          </Reveal>

          {/* Visão */}
          <Reveal delay={0.08}>
            <div className="group h-full rounded-[var(--radius-xl)] border border-cyan-500/30 bg-gradient-to-b from-[#0A1926] to-[#061019] p-7 flex flex-col gap-5 transition-all duration-500 transform hover:-translate-y-2 hover:border-cyan-400 hover:shadow-[0_0_35px_rgba(6,182,212,0.25)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/25 transition-all" />
              <div className="p-3.5 rounded-2xl bg-cyan-500/20 text-cyan-400 w-fit group-hover:scale-110 transition-transform duration-300">
                <Compass className="size-7" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400">Horizonte Futuro</span>
                <h3 className="text-2xl font-black text-white tracking-tight">Nossa Visão</h3>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                Ser o hub central definitivo de precificação histórica, curadoria retro e análise de tendências gamer da América Latina. Uma referência onde dados quantitativos e paixão pela cultura pop se encontram.
              </p>
              <div className="mt-auto pt-4 border-t border-cyan-500/20 flex items-center gap-2 text-xs font-bold text-cyan-400">
                <span>Autoridade em Dados Gamer</span>
              </div>
            </div>
          </Reveal>

          {/* Valores */}
          <Reveal delay={0.12}>
            <div className="group h-full rounded-[var(--radius-xl)] border border-emerald-500/30 bg-gradient-to-b from-[#0B1D14] to-[#06120D] p-7 flex flex-col gap-5 transition-all duration-500 transform hover:-translate-y-2 hover:border-emerald-400 hover:shadow-[0_0_35px_rgba(16,185,129,0.25)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/25 transition-all" />
              <div className="p-3.5 rounded-2xl bg-emerald-500/20 text-emerald-400 w-fit group-hover:scale-110 transition-transform duration-300">
                <Award className="size-7" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">Código de Ética</span>
                <h3 className="text-2xl font-black text-white tracking-tight">Nossos Valores</h3>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                100% Imparcialidade em Inteligência de Dados, Preservação da Memória Retrogamer, Respeito à Comunidade, Rigor na Coleta de Dados e Transparência Absoluta nos Links de Afiliados.
              </p>
              <div className="mt-auto pt-4 border-t border-emerald-500/20 flex items-center gap-2 text-xs font-bold text-emerald-400">
                <span>Compromisso com o Colecionador</span>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Banner Ilustrativo com Brilho Neon */}
        <Reveal delay={0.16}>
          <div className="relative aspect-[21/9] sm:aspect-[24/9] w-full overflow-hidden rounded-[var(--radius-xl)] border border-amber-500/40 bg-[#0B0805] shadow-2xl group">
            <Image
              src="/images/sobre/fliperama.png"
              alt="Fliperama e cultura gamer retro"
              fill
              className="object-contain object-center p-3 transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute bottom-5 left-6 right-6 flex items-center justify-between text-xs text-amber-400 font-mono font-bold">
              <span>A mesma energia dos arcades clássicos impulsionando a maior comunidade de inteligência de dados gamer.</span>
              <span className="hidden sm:inline text-zinc-400">Arquitetura 100% Auditada</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 5. Objetivos da Plataforma e Propósito
// ----------------------------------------------------------------------
function ObjetivosJustificativaSection() {
  return (
    <section id="objetivos-justificativa" data-theme="dark" className="w-full bg-[#0A0704] py-16 lg:py-24 border-b border-[var(--color-border-subtle)] scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 grid gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-amber-500/30 bg-[#0B0805] shadow-2xl">
            <Image
              src="/images/sobre/aluguel-tv.png"
              alt="Justificativa e inteligência de dados no mercado gamer"
              fill
              className="object-contain object-center p-2"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-xs font-mono text-amber-400 font-bold">
              Eliminação de distorções e inflação artificial de preços no varejo.
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="flex flex-col gap-5">
            <Badge variant="outline" size="sm" className="w-fit text-amber-400 border-amber-500/40">
              <ShieldCheck className="size-3.5 mr-1" /> Justificativa e Propósito
            </Badge>
            <Text as="h2" variant="display-md" className="font-extrabold text-white">
              Por que uma plataforma de inteligência de dados é indispensável?
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed text-zinc-300">
              <strong>O Problema do Varejo Gamer:</strong> O mercado brasileiro de jogos sofre com grande fragmentação. O mesmo jogo pode custar R$ 349,00 em uma loja e R$ 499,00 em outra na mesma data. Além disso, em épocas promocionais, vendedores reajustam preços prévios para simular descontos inexistentes.
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed text-zinc-300">
              <strong>A Solução Espaço Geek 86:</strong> Construímos rotinas automatizadas de ingestão 24/7 que coletam dados a cada 5 minutos em Mercado Livre, Shopee, Magalu, Amazon e Via.
            </Text>
            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-amber-400 shrink-0" />
                <span>Limpeza estatística anti-outlier para expurgar distorções de preço</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-amber-400 shrink-0" />
                <span>Cálculo de preço médio real de mercado vs. menor preço ativo</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-amber-400 shrink-0" />
                <span>Histórico auditável que prova se a oferta é oportunidade de verdade</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 6. Apresentação Completa das Ferramentas de Inteligência de Dados
// ----------------------------------------------------------------------
function FerramentasShowcaseSection() {
  const tools = [
    {
      id: 'ferramenta-bolsa-gamer',
      badge: 'Motor Principal de Preço',
      title: '1. Bolsa Gamer e Monitoramento de Preços em Tempo Real',
      description:
        'Gráficos estatísticos interativos de 3 camadas (Linha do Menor Preço Ativo, Curva Média de Mercado de todas as lojas e Histograma de Frequência de Cotações). Suporta zoom dinâmico e exibe se o produto está no menor preço histórico.',
      imageSrc: '/images/sobre/ferramenta-bolsa-gamer.png',
      badgeColor: 'bg-amber-500 text-black',
      borderHover: 'hover:border-amber-400 hover:shadow-[0_0_35px_rgba(245,158,11,0.25)]',
      bullets: [
        'Curva suave da Média Geral entre todas as lojas e plataformas',
        'Área sombreada dinâmica do Menor Preço Ativo em cada varredura',
        'Histograma de volume de cotações na base do gráfico',
      ],
      reverse: false,
    },
    {
      id: 'ferramenta-gestao-afiliados',
      badge: 'Painel de Afiliados e Vendedores',
      title: '2. Instrumento de Gestão para Afiliados e Vendedores',
      description:
        'Central estratégica para criadores de conteúdo, afiliados e leiloeiros gerarem mensagens promocionais de alta conversão para WhatsApp e Telegram, aplicarem links de afiliado com rastreamento inteligente exclusivo e acompanharem cliques, métricas e receitas em tempo real.',
      imageSrc: '/images/sobre/ferramenta-gestao-afiliados.png',
      badgeColor: 'bg-orange-500 text-white',
      borderHover: 'hover:border-orange-400 hover:shadow-[0_0_35px_rgba(249,115,22,0.25)]',
      bullets: [
        'Gerador automático de mensagens com formatação profissional',
        'Edição e exclusão de mensagens divulgadas no histórico',
        'Rastreamento inteligente de cliques e taxa de conversão',
      ],
      reverse: true,
    },
    {
      id: 'ferramenta-assistente-comprador',
      badge: 'Decisão do Consumidor',
      title: '3. Assistente Inteligente de Tomada de Decisão do Comprador',
      description:
        'Ferramenta para o comprador final identificar se o momento é ideal para compra. Exibe a variação percentual em relação ao preço médio, badges de oportunidade e links direcionando para a loja com o menor valor ativo.',
      imageSrc: '/images/home/painel-analitico-86.png',
      badgeColor: 'bg-emerald-500 text-black',
      borderHover: 'hover:border-emerald-400 hover:shadow-[0_0_35px_rgba(16,185,129,0.25)]',
      bullets: [
        'Indicador instantâneo "Comprar Agora no Menor Preço"',
        'Comparador de ofertas de diferentes vendedores no mesmo item',
        'Filtro de menor histórico vitalício sem pegadinhas',
      ],
      reverse: false,
    },
    {
      id: 'ferramenta-observatorio-noticias',
      badge: 'Pesquisas Secundárias e Editorial',
      title: '4. Observatório Gamer, Dossiês e Notícias de Mercado',
      description:
        'Portal jornalístico e analítico com reportagens originais, análises descritivas e relatórios teóricos integrando dados de pesquisas de mercado globais e nacionais (Newzoo, Statista e Pesquisa Game Brasil).',
      imageSrc: '/images/home/observatorio-gamer-hero.png',
      badgeColor: 'bg-cyan-500 text-black',
      borderHover: 'hover:border-cyan-400 hover:shadow-[0_0_35px_rgba(6,182,212,0.25)]',
      bullets: [
        'Artigos teóricos sobre a economia do retrogaming e cultura pop',
        'Dossiês de mercado com estatísticas consolidadas da indústria',
        'Seções organizadas por sub-categorias filtráveis via menu',
      ],
      reverse: true,
    },
    {
      id: 'ferramenta-pesquisas-primarias',
      badge: 'Dados Primários e Voz do Público',
      title: '5. Pesquisas Primárias e Coleta de Voz da Comunidade',
      description:
        'Módulo de enquetes vivas onde a comunidade opina sobre hábitos de consumo, consoles favoritos e expectativas de lançamento. Permite cadastrar, editar e gerenciar pesquisas ativas diretamente no painel admin.',
      imageSrc: '/images/home/pesquisa-comunidade.png',
      badgeColor: 'bg-purple-500 text-white',
      borderHover: 'hover:border-purple-400 hover:shadow-[0_0_35px_rgba(168,85,247,0.25)]',
      bullets: [
        'Coleta de respostas anônimas sem necessidade de login prévio',
        'Gerenciador administrativo para criar e editar enquetes',
        'Geração de estatísticas percentuais agregadas instantâneas',
      ],
      reverse: false,
    },
    {
      id: 'ferramenta-nlp-hype-index',
      badge: 'Inteligência Artificial e NLP',
      title: '6. Análise de Sentimento Social e Geek Hype Index (0-100)',
      description:
        'Motor de inteligência de dados que analisa o engajamento social e a percepção da comunidade sobre títulos e consoles, gerando a nota Geek Hype Index para direcionar estratégias de marcas e colecionadores.',
      imageSrc: '/images/home/observatorio-cards-bg.png',
      badgeColor: 'bg-rose-500 text-white',
      borderHover: 'hover:border-rose-400 hover:shadow-[0_0_35px_rgba(244,63,94,0.25)]',
      bullets: [
        'Métrica de hype calculada com Processamento de Linguagem Natural',
        'Classificação de sentimento positivo, neutro ou negativo',
        'Direcionamento estratégico para aquisições de catálogo',
      ],
      reverse: true,
    },
    {
      id: 'ferramenta-hype-zone-leiloes',
      badge: 'Hype Zone e Leilões C2C',
      title: '7. Hype Zone, Drops Exclusivos e Leilões entre Colecionadores',
      description:
        'Área nobre dedicada a lançamentos de edições limitadas e leilões C2C de itens clássicos e raros, com contagem regressiva ao vivo, histórico de lances e score de confiança dos vendedores.',
      imageSrc: '/images/home/newsletter-vip-club.png',
      badgeColor: 'bg-amber-400 text-black',
      borderHover: 'hover:border-amber-300 hover:shadow-[0_0_35px_rgba(251,191,36,0.25)]',
      bullets: [
        'Sistema de leilões com arremate ao vivo e cronômetro em tempo real',
        'Drops exclusivos com restrição de acesso e cadastro prévio',
        'Score de reputação auditado para vendedores e colecionadores',
      ],
      reverse: false,
    },
  ];

  return (
    <section id="ferramentas" data-theme="dark" className="relative w-full bg-gradient-to-b from-[#0A0704] via-[#140E08] to-[#0A0704] py-20 lg:py-28 border-b border-[var(--color-border-subtle)] scroll-mt-20 overflow-hidden">
      <Glow color="gold" size="xl" intensity={0.15} className="top-10 left-10" />
      <Glow color="hype" size="md" intensity={0.12} className="bottom-10 right-10" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8 flex flex-col gap-16">
        <Reveal>
          <div className="text-center flex flex-col items-center gap-3">
            <Badge variant="hype" size="md" className="w-fit uppercase font-black tracking-widest bg-amber-500 text-black">
              Arquitetura de Ferramentas
            </Badge>
            <Text as="h2" variant="display-lg" className="font-black text-white tracking-tight">
              Conheça Nossas Ferramentas de Inteligência de Dados
            </Text>
            <Text variant="body-lg" className="text-zinc-300 max-w-[64ch] leading-relaxed">
              Um ecossistema de inteligência de dados projetado com tecnologia de ponta, design nostálgico e módulos especializados para compradores, afiliados e colecionadores.
            </Text>
          </div>
        </Reveal>

        {/* Renderização de Cada Ferramenta com Imagem sem Corte */}
        <div className="flex flex-col gap-12">
          {tools.map((tool) => (
            <Reveal key={tool.id}>
              <div
                className={`group rounded-[var(--radius-xl)] border border-amber-500/30 bg-gradient-to-b from-[#181109] to-[#0D0904] p-6 lg:p-10 transition-all duration-500 ${tool.borderHover}`}
              >
                <div className={`grid gap-8 lg:grid-cols-12 lg:items-center ${tool.reverse ? 'lg:flex-row-reverse' : ''}`}>
                  {/* Conteúdo Técnico */}
                  <div className={`flex flex-col gap-4 lg:col-span-6 ${tool.reverse ? 'lg:order-2' : 'lg:order-1'}`}>
                    <span className={`px-3.5 py-1 rounded-full text-xs font-black w-fit tracking-wider uppercase ${tool.badgeColor}`}>
                      {tool.badge}
                    </span>
                    <Text variant="heading-lg" className="font-black text-white leading-tight">
                      {tool.title}
                    </Text>
                    <Text variant="body-md" className="text-zinc-300 leading-relaxed font-medium">
                      {tool.description}
                    </Text>

                    <div className="flex flex-col gap-2.5 pt-3 border-t border-amber-500/20">
                      {tool.bullets.map((b, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 text-xs font-semibold text-zinc-200">
                          <CheckCircle2 className="size-4 text-amber-400 shrink-0" />
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Imagem em Moldura sem Corte */}
                  <div className={`lg:col-span-6 ${tool.reverse ? 'lg:order-1' : 'lg:order-2'}`}>
                    <div className="relative aspect-[16/10] w-full rounded-[var(--radius-lg)] overflow-hidden border border-amber-500/30 bg-black shadow-2xl">
                      <Image
                        src={tool.imageSrc}
                        alt={tool.title}
                        fill
                        className="object-contain object-center p-3 transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                      <div className="absolute bottom-3 left-4 right-4 text-[11px] font-mono text-amber-400 font-bold flex justify-between">
                        <span>Módulo Espaço Geek 86</span>
                        <span className="text-zinc-400">Inteligência de Dados Gamer</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 7. Perfil do Idealizador e Direção Técnica
// ----------------------------------------------------------------------
function IdealizadorSection() {
  return (
    <section id="idealizador" data-theme="dark" className="w-full bg-[#0F0C08] py-16 lg:py-24 border-b border-[var(--color-border-subtle)]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <Reveal>
          <div className="rounded-[var(--radius-xl)] bg-gradient-to-r from-[#140E08] via-[#0F0A05] to-[#181109] border border-amber-500/30 overflow-hidden shadow-2xl p-8 lg:p-12 grid gap-8 lg:grid-cols-[240px_1fr] lg:items-center">
            <div className="relative aspect-square w-full max-w-[240px] mx-auto rounded-[var(--radius-xl)] overflow-hidden border-2 border-amber-500/40 shadow-2xl bg-black">
              <Image
                src="/images/sobre/idealizador.png"
                alt="Renato Silva de Assis — Fundador e Idealizador"
                fill
                className="object-contain object-top p-1"
              />
            </div>

            <div className="flex flex-col gap-4">
              <Badge variant="hype" size="sm" className="w-fit uppercase bg-amber-500 text-black font-extrabold">
                Idealização e Liderança Técnica
              </Badge>
              <Text variant="heading-xl" className="font-extrabold text-white">
                Renato Silva de Assis
              </Text>
              <Text variant="caption" className="text-amber-400 font-mono font-bold">
                Fundador, Arquiteto de Software e Colecionador Gamer
              </Text>
              <Text variant="body-md" className="leading-relaxed text-zinc-300 font-medium">
                "O Espaço Geek 86 é a materialização do respeito pela cultura dos games combinada com a inteligência de dados. Construímos uma plataforma onde o colecionador encontra nostalgia e o comprador encontra a verdade dos preços."
              </Text>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link href="/ofertas">
                  <Button variant="hype" size="md" rightIcon={<ArrowRight className="size-4" />}>
                    Explorar a Plataforma
                  </Button>
                </Link>
                <Link href="/pesquisa">
                  <Button variant="outline" size="md" className="text-white border-amber-500/40 hover:bg-amber-500/10">
                    Responder Pesquisa da Comunidade
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
