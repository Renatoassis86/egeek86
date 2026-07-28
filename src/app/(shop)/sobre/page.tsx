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
    <section data-theme="dark" className="relative w-full bg-[#0c0906] text-white px-4 lg:px-8 pt-14 pb-12 lg:pt-20 lg:pb-16 overflow-hidden border-b border-amber-900/30">
      <Glow color="gold" size="xl" intensity={0.25} className="-top-32 -left-32" />
      <Glow color="hype" size="md" intensity={0.15} className="top-20 -right-20" />

      <div className="mx-auto max-w-7xl relative z-10 flex flex-col gap-8">
        <Reveal>
          <div className="flex flex-col gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40 w-fit">
              Arkos Intelligence e Espaço Geek 86
            </span>
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
              className="object-cover object-center opacity-95"
            />
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
    <section data-theme="light" className="w-full bg-[#faf7f2] text-zinc-900 border-b border-amber-900/10 py-12 lg:py-16">
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
    <section id="quem-somos" data-theme="dark" className="w-full bg-gradient-to-b from-[#1c0c32] via-[#160928] to-[#10061e] text-white py-16 lg:py-24 border-b border-purple-900/40 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 grid gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 w-fit">
              <History className="size-3.5 mr-1" /> Nossa História
            </span>
            <Text as="h2" variant="display-lg" className="font-black text-white text-3xl sm:text-4xl lg:text-5xl leading-tight drop-shadow-md">
              Da paixão pelas locadoras dos anos 80 e 90 a um cockpit de Inteligência de Dados.
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200 font-medium">
              O Espaço Geek 86 nasceu do fascínio pelas tardes passadas em locadoras de videogame, trocando cartuchos de Super Nintendo e Mega Drive, lendo revistas de dicas e vivenciando a ascensão dos consoles clássicos.
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200 font-medium">
              O que começou como uma coleção pessoal rigorosamente catalogada evoluiu para análises quantitativas, rotinas de monitoramento e o hábito de ajudar amigos a encontrarem o preço justo sem cair em armadilhas de falsos descontos.
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200 font-medium">
              Hoje, transformamos essa essência em uma plataforma completa de inteligência de dados que varre os maiores marketplaces do Brasil a cada 5 minutos, preservando a paixão do colecionador com a precisão dos modelos analíticos.
            </Text>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-purple-500/30 bg-[#0B0805] shadow-2xl">
            <Image
              src="/images/sobre/locadora.png"
              alt="Ilustração de locadora retro gamer"
              fill
              className="object-cover object-center"
            />
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
    <section id="missao-visao-valores" data-theme="light" className="relative w-full bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-amber-600/10 text-zinc-900 py-20 lg:py-28 border-b border-amber-300/40 scroll-mt-20 overflow-hidden">
      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8 flex flex-col gap-14">
        <Reveal>
          <div className="text-center flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-amber-500/20 text-amber-900 border border-amber-500/40 w-fit">
              Propósito &amp; Fronteira Tecnológica
            </span>
            <Text as="h2" variant="display-lg" className="font-black text-zinc-900 text-3xl sm:text-5xl tracking-tight">
              Nossa Missão &amp; Nossa Visão
            </Text>
            <Text variant="body-lg" className="text-zinc-700 max-w-[66ch] leading-relaxed font-medium">
              Muito além de exibir preços, construímos uma arquitetura de inteligência, paixão e entretenimento que redefine o mercado de jogos no Brasil.
            </Text>
          </div>
        </Reveal>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Card 1: NOSSA MISSÃO */}
          <Reveal delay={0.04}>
            <div className="group h-full rounded-[var(--radius-xl)] border-2 border-amber-500/40 bg-white p-8 lg:p-10 flex flex-col gap-6 transition-all duration-300 hover:border-amber-500 hover:shadow-2xl relative overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="p-3.5 rounded-2xl bg-amber-500/20 text-amber-700 w-fit group-hover:scale-110 transition-transform duration-300">
                  <Target className="size-8" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-amber-800 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30">
                  Nossa Missão
                </span>
              </div>

              <blockquote className="text-xl sm:text-2xl font-black text-zinc-900 leading-snug border-l-4 border-amber-500 pl-5 my-1 tracking-tight">
                &quot;Entregar a verdade de mercado, a melhor economia e a alegria do entretenimento gamer para toda a comunidade geek.&quot;
              </blockquote>

              <p className="text-sm text-zinc-600 leading-relaxed font-medium">
                Inspirados pelos maiores cases de sucesso do mundo, nossa missão é simples e inegociável: proteger o bolso do consumidor com dados reais em tempo real, celebrando a paixão e a cultura dos videogames em cada decisão.
              </p>
            </div>
          </Reveal>

          {/* Card 2: NOSSA VISÃO */}
          <Reveal delay={0.08}>
            <div className="group h-full rounded-[var(--radius-xl)] border-2 border-emerald-500/40 bg-white p-8 lg:p-10 flex flex-col gap-6 transition-all duration-300 hover:border-emerald-500 hover:shadow-2xl relative overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="p-3.5 rounded-2xl bg-emerald-500/20 text-emerald-700 w-fit group-hover:scale-110 transition-transform duration-300">
                  <Compass className="size-8" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-800 bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-500/30">
                  Nossa Visão
                </span>
              </div>

              <blockquote className="text-xl sm:text-2xl font-black text-zinc-900 leading-snug border-l-4 border-emerald-500 pl-5 my-1 tracking-tight">
                &quot;Ser a plataforma de inteligência, acervo e economia gamer mais confiável e inspiradora do mundo.&quot;
              </blockquote>

              <p className="text-sm text-zinc-600 leading-relaxed font-medium">
                Ser o destino definitivo onde qualquer pessoa descobre, compara e compra com 100% de confiança, fundindo a memória histórica dos consoles ao futuro da tecnologia de dados.
              </p>
            </div>
          </Reveal>
        </div>

        {/* Banner Ilustrativo */}
        <Reveal delay={0.12}>
          <div className="relative aspect-[21/9] sm:aspect-[24/9] w-full overflow-hidden rounded-[var(--radius-xl)] border border-amber-500/40 bg-[#0B0805] shadow-2xl group">
            <Image
              src="/images/sobre/fliperama.png"
              alt="Fliperama e cultura gamer retro"
              fill
              className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
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
    <section id="objetivos-justificativa" data-theme="dark" className="w-full bg-gradient-to-b from-[#053024] via-[#03241b] to-[#021812] text-white py-16 lg:py-24 border-b border-emerald-900/40 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 grid gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-emerald-500/30 bg-[#0B0805] shadow-2xl">
            <Image
              src="/images/sobre/aluguel-tv.png"
              alt="Justificativa e inteligência de dados no mercado gamer"
              fill
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-xs font-mono text-emerald-400 font-bold">
              Eliminação de distorções e inflação artificial de preços no varejo.
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="flex flex-col gap-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 w-fit">
              <ShieldCheck className="size-3.5 mr-1" /> Justificativa e Propósito
            </span>
            <Text as="h2" variant="display-md" className="font-extrabold text-white">
              Por que uma plataforma de inteligência de dados é indispensável?
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200">
              <strong>O Problema do Varejo Gamer:</strong> O mercado brasileiro de jogos sofre com grande fragmentação. O mesmo jogo pode custar R$ 349,00 em uma loja e R$ 499,00 em outra na mesma data. Além disso, em épocas promocionais, vendedores reajustam preços prévios para simular descontos inexistentes.
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200">
              <strong>A Solução Espaço Geek 86:</strong> Construímos rotinas automatizadas de ingestão 24/7 que coletam dados a cada 5 minutos em Mercado Livre, Shopee, Magalu, Amazon e Via.
            </Text>
            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                <span>Limpeza estatística anti-outlier para expurgar distorções de preço</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                <span>Cálculo de preço médio real de mercado vs. menor preço ativo</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
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
      borderHover: 'hover:border-amber-500 hover:shadow-xl',
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
      borderHover: 'hover:border-orange-500 hover:shadow-xl',
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
      imageSrc: '/images/sobre/assistente-decisao-comprador.png',
      badgeColor: 'bg-emerald-600 text-white',
      borderHover: 'hover:border-emerald-500 hover:shadow-xl',
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
      badgeColor: 'bg-cyan-600 text-white',
      borderHover: 'hover:border-cyan-500 hover:shadow-xl',
      bullets: [
        'Artigos teóricos sobre a economia do retrogaming e cultura pop',
        'Dossiês de mercado com estatísticas consolidadas da indústria',
        'Seções organizadas por sub-categorias filtráveis via menu',
      ],
      reverse: true,
    },
    {
      id: 'ferramenta-pesquisas-primarias',
      badge: 'Pesquisas de Mercado e Voz do Consumidor',
      title: '5. Pesquisas de Mercado, Qualitativas e Lançamento de Marcas',
      description:
        'Infraestrutura de inteligência de dados desenvolvida para realizar pesquisas de marketing de mercado, testes de aceitação no lançamento de marcas e pesquisas qualitativas gerais aplicadas diretamente a consumidores gerais e público gamer.',
      imageSrc: '/images/home/pesquisa-comunidade.png',
      badgeColor: 'bg-purple-600 text-white',
      borderHover: 'hover:border-purple-500 hover:shadow-xl',
      bullets: [
        'Pesquisas qualitativas e quantitativas aplicadas a consumidores gerais',
        'Estudos de posicionamento estratégicos para lançamento de marcas',
        'Relatórios de hábitos de consumo e percepção de marca em tempo real',
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
      badgeColor: 'bg-rose-600 text-white',
      borderHover: 'hover:border-rose-500 hover:shadow-xl',
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
      badgeColor: 'bg-amber-500 text-black',
      borderHover: 'hover:border-amber-500 hover:shadow-xl',
      bullets: [
        'Sistema de leilões com arremate ao vivo e cronômetro em tempo real',
        'Drops exclusivos com restrição de acesso e cadastro prévio',
        'Score de reputação auditado para vendedores e colecionadores',
      ],
      reverse: false,
    },
  ];

  return (
    <section id="ferramentas" data-theme="light" className="relative w-full bg-[#fcfaf7] text-zinc-900 py-20 lg:py-28 border-b border-amber-900/10 scroll-mt-20 overflow-hidden">
      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8 flex flex-col gap-16">
        <Reveal>
          <div className="text-center flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-orange-500/15 text-orange-700 border border-orange-500/30 w-fit">
              Arquitetura de Ferramentas
            </span>
            <Text as="h2" variant="display-lg" className="font-black text-zinc-900 tracking-tight">
              Conheça Nossas Ferramentas de Inteligência de Dados
            </Text>
            <Text variant="body-lg" className="text-zinc-700 max-w-[64ch] leading-relaxed font-medium">
              Um ecossistema de inteligência de dados projetado com tecnologia de ponta, design nostálgico e módulos especializados para compradores, afiliados e colecionadores.
            </Text>
          </div>
        </Reveal>

        {/* Renderização de Cada Ferramenta com Imagem sem Corte */}
        <div className="flex flex-col gap-12">
          {tools.map((tool) => (
            <Reveal key={tool.id}>
              <div
                className={`group rounded-[var(--radius-xl)] border border-amber-200/80 bg-white p-6 lg:p-10 transition-all duration-300 shadow-md ${tool.borderHover}`}
              >
                <div className={`grid gap-8 lg:grid-cols-12 lg:items-center ${tool.reverse ? 'lg:flex-row-reverse' : ''}`}>
                  {/* Conteúdo Técnico */}
                  <div className={`flex flex-col gap-4 lg:col-span-6 ${tool.reverse ? 'lg:order-2' : 'lg:order-1'}`}>
                    <span className={`px-3.5 py-1 rounded-full text-xs font-black w-fit tracking-wider uppercase ${tool.badgeColor}`}>
                      {tool.badge}
                    </span>
                    <Text variant="heading-lg" className="font-black text-zinc-900 leading-tight">
                      {tool.title}
                    </Text>
                    <Text variant="body-md" className="text-zinc-700 leading-relaxed font-medium">
                      {tool.description}
                    </Text>

                    <div className="flex flex-col gap-2.5 pt-3 border-t border-amber-100">
                      {tool.bullets.map((b, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 text-xs font-bold text-zinc-800">
                          <CheckCircle2 className="size-4 text-amber-600 shrink-0" />
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Imagem em Moldura sem Corte */}
                  <div className={`lg:col-span-6 ${tool.reverse ? 'lg:order-1' : 'lg:order-2'}`}>
                    <div className="relative aspect-[16/10] w-full rounded-[var(--radius-lg)] overflow-hidden border border-amber-200 bg-zinc-100 shadow-lg">
                      <Image
                        src={tool.imageSrc}
                        alt={tool.title}
                        fill
                        className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                      />
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
    <section id="idealizador" data-theme="dark" className="w-full bg-[#0a0a0d] text-white py-16 lg:py-24 border-b border-amber-500/30">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <Reveal>
          <div className="rounded-[var(--radius-xl)] bg-gradient-to-r from-[#140E08] via-[#0F0A05] to-[#181109] border border-amber-500/30 overflow-hidden shadow-2xl p-6 sm:p-8 lg:p-12 grid gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5 relative aspect-[4/3] w-full rounded-[var(--radius-xl)] overflow-hidden border-2 border-amber-500/40 shadow-2xl bg-[#0B0805] group">
              <Image
                src="/images/sobre/idealizador.png"
                alt="Renato Silva de Assis — Fundador e Idealizador"
                fill
                priority
                className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-3.5 left-4 right-4 text-xs font-mono text-amber-400 font-bold flex items-center justify-between">
                <span>Renato Silva de Assis</span>
                <span className="text-[10px] text-zinc-400">Arkos Intelligence</span>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40 w-fit">
                  Idealização e Liderança Técnica
                </span>
                <Text variant="heading-xl" className="font-black text-white text-3xl sm:text-4xl">
                  Renato Silva de Assis
                </Text>
                <Text variant="caption" className="text-amber-400 font-mono font-bold text-xs sm:text-sm leading-relaxed">
                  Economista • Mestre em Economia Regional • Arquiteto de Software • Cientista de Dados • Pesquisador • Colecionador Gamer
                </Text>
              </div>

              <div className="flex flex-col gap-4 text-zinc-300 font-medium leading-relaxed text-sm sm:text-base">
                <p>
                  O Espaço Geek 86 nasceu da união entre duas paixões que acompanham <strong>Renato Silva de Assis</strong> desde a infância: o universo dos videogames e a construção de soluções tecnológicas capazes de transformar mercados.
                </p>
                <p>
                  Economista pela Universidade Federal da Paraíba (UFPB), Mestre em Economia Regional pela Universidade Federal do Rio Grande do Norte (UFRN) e especialista em Ciência de Dados aplicada aos negócios, Renato construiu sua carreira desenvolvendo plataformas, modelos analíticos e sistemas de inteligência para tomada de decisão. Ao longo de sua trajetória, sempre acreditou que dados bem utilizados têm o poder de reduzir incertezas, aumentar a transparência e gerar valor para as pessoas.
                </p>
                <p>
                  Paralelamente à vida profissional, cultivou por décadas outra grande paixão: o colecionismo gamer. Desde os consoles clássicos até as gerações atuais, acompanhou de perto a evolução da indústria, do mercado de colecionáveis e da cultura geek, vivenciando também as dificuldades enfrentadas diariamente por milhares de consumidores: preços inconsistentes, falsas promoções, pouca transparência e escassez de informação confiável para decidir uma compra.
                </p>
                <p className="font-semibold text-white">
                  Foi dessa realidade que surgiu o Espaço Geek 86.
                </p>
                <p>
                  Mais do que um marketplace, o Espaço Geek 86 está sendo construído como uma plataforma de inteligência para o consumidor geek. O objetivo é reunir, em um único ambiente, monitoramento de preços em tempo real, histórico de valores, reputação de vendedores, pesquisas com a comunidade, conteúdo especializado e algoritmos próprios capazes de ajudar cada usuário a comprar melhor, pagar menos e colecionar com mais segurança.
                </p>
                <blockquote className="p-4 rounded-xl bg-amber-500/10 border-l-4 border-amber-500 italic text-amber-200 text-sm leading-relaxed">
                  &quot;Por trás da plataforma existe uma filosofia simples: tecnologia deve servir às pessoas. A missão do Espaço Geek 86 não é vender produtos a qualquer custo, mas oferecer conhecimento, transparência e inteligência para que cada decisão de compra seja baseada em informações reais e não apenas em publicidade.&quot;
                </blockquote>
              </div>

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
