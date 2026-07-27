import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  Sparkles,
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
  Zap,
  TrendingUp,
  Share2,
  ShoppingCart,
  BookOpen,
  Vote,
  Brain,
  Trophy,
  History,
  CheckCircle2,
  BarChart3,
  Flame,
} from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { SceneImage } from '@/components/motion/scene-image';
import { StatTile } from '@/components/ui/stat-tile';
import { getPlatformStats } from '@/server/queries/affiliate';

export const metadata: Metadata = {
  title: 'Manifesto & Arquitetura da Plataforma',
  description:
    'Conheça a história, missão, objetivos econométricos e o ecossistema completo de ferramentas do Espaço Geek 86.',
};

export const dynamic = 'force-dynamic';

export default async function SobrePage() {
  const stats = await getPlatformStats();

  return (
    <div className="flex flex-col w-full bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)]">
      {/* 1. Hero Manifesto & Identidade */}
      <HeroManifesto />

      {/* 2. Métrica e Números do Ecossistema */}
      <PlatformMetricsSection stats={stats} />

      {/* 3. Quem Somos (Nossa História & Origem) */}
      <QuemSomosSection />

      {/* 4. Missão, Visão e Valores */}
      <MissaoVisaoValoresSection />

      {/* 5. Objetivos da Plataforma & Justificativa Econométrica */}
      <ObjetivosJustificativaSection />

      {/* 6. Apresentação Completa de TODAS as Ferramentas da Plataforma */}
      <FerramentasShowcaseSection />

      {/* 7. Perfil do Idealizador & Direção Técnica */}
      <IdealizadorSection />
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. Hero Manifesto & Identidade
// ----------------------------------------------------------------------
function HeroManifesto() {
  return (
    <section data-theme="dark" className="relative w-full bg-[var(--color-bg-canvas)] mx-auto px-4 lg:px-8 pt-14 pb-12 lg:pt-20 lg:pb-16 overflow-hidden">
      <Glow color="hype" size="xl" intensity={0.15} className="-top-32 -left-32" />
      <div className="mx-auto max-w-7xl relative z-10 flex flex-col gap-8">
        <Reveal>
          <div className="flex flex-col gap-3">
            <Badge variant="hype" size="md" className="w-fit font-black tracking-wider uppercase">
              <Sparkles className="size-3.5 mr-1" /> Arkos Intelligence e Manifesto Geek 86
            </Badge>
            <Text as="h1" variant="display-xl" className="font-black text-white tracking-tight lg:text-display-2xl max-w-[22ch]">
              A Plataforma Inteligente de Econometria, Gestão e Decisão Gamer do Brasil.
            </Text>
            <Text variant="body-lg" className="mt-2 text-[var(--color-text-secondary)] font-medium max-w-[68ch] leading-relaxed">
              O Espaço Geek 86 unifica cultura pop, nostalgia da era 16/32-bit e ciência de dados econométrica avançada. Um ecossistema completo desenhado para transformar a experiência de compra do consumidor final e impulsionar a gestão de afiliados e vendedores de jogos no país.
            </Text>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="relative aspect-[16/7] sm:aspect-[21/9] w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] shadow-2xl bg-[#0F0C08]">
            <Image
              src="/images/sobre/hero-geracoes.png"
              alt="Duas gerações de consoles e jogos no Espaço Geek 86"
              fill
              priority
              className="object-cover object-center opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F0C08] via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between text-xs font-bold text-amber-400">
              <span className="uppercase tracking-widest font-mono">🕹️ Preservando a Cultura Gamer • Monitorando o Futuro do Mercado</span>
              <span className="hidden sm:inline text-zinc-400 font-mono text-[11px]">Fundado em Teresina-PI • Cobertura Nacional em 5 Marketplaces</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 2. Números em Tempo Real do Ecossistema
// ----------------------------------------------------------------------
function PlatformMetricsSection({ stats }: { stats: any }) {
  return (
    <section data-theme="light" className="w-full bg-[var(--color-bg-canvas)] border-y border-[var(--color-border-subtle)] py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatTile icon={<Package className="size-5" />} value={stats.totalProducts} label="Produtos Catalogados" />
          <StatTile icon={<Store className="size-5" />} value={stats.totalSellers} label="Lojas & Vendedores" />
          <StatTile icon={<Layers className="size-5" />} value={stats.totalNetworks} label="Plataformas Parceiras" />
          <StatTile icon={<LineChart className="size-5" />} value={stats.totalQuotes} label="Cotações de Preço em Tempo Real" />
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 3. Quem Somos (Nossa História & Origem)
// ----------------------------------------------------------------------
function QuemSomosSection() {
  return (
    <section data-theme="dark" className="w-full bg-[var(--color-bg-canvas)] py-16 lg:py-24 border-b border-[var(--color-border-subtle)]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 grid gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <div className="flex flex-col gap-4">
            <Badge variant="outline" size="sm" className="w-fit text-amber-400 border-amber-500/40">
              <History className="size-3.5 mr-1" /> Nossa História
            </Badge>
            <Text as="h2" variant="display-md" className="font-extrabold text-white">
              Da paixão pelas locadoras dos anos 80 e 90 a um cockpit econométrico de Big Data.
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed">
              O Espaço Geek 86 nasceu do fascínio pelas tardes passadas em locadoras de videogame, trocando cartuchos de Super Nintendo e Mega Drive, lendo revistas de dicas e vivenciando a ascensão dos consoles clássicos.
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed">
              O que começou como uma coleção pessoal rigorosamente catalogada evoluiu para planilhas estatísticas, rotinas de monitoramento e o hábito de ajudar amigos a encontrarem o menor preço justo sem cair em armadilhas de falsos descontos.
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed">
              Hoje, transformamos essa essência em uma plataforma completa de inteligência de mercado que varre os maiores marketplaces do Brasil a cada 5 minutos, preservando o afeto do colecionador com a precisão dos dados estatísticos.
            </Text>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[#0B0805] shadow-2xl">
            <Image
              src="/images/sobre/locadora.png"
              alt="Ilustração estilo anos 80 de locadora retro gamer"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-xs font-mono text-amber-400">
              🕹️ Nostalgia anos 80 e 90 combinada com Data Science de alta performance.
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
    <section data-theme="light" className="w-full bg-[var(--color-bg-canvas)] py-16 lg:py-24 border-b border-[var(--color-border-subtle)]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 flex flex-col gap-12">
        <Reveal>
          <div className="text-center flex flex-col items-center gap-3">
            <Badge variant="hype" size="md" className="w-fit uppercase">
              Pilares Fundamentais
            </Badge>
            <Text as="h2" variant="display-lg" className="font-black text-[var(--color-text-primary)]">
              Missão, Visão e Valores do Espaço Geek 86
            </Text>
            <Text variant="body-lg" color="secondary" className="max-w-[56ch]">
              Os princípios que norteiam o desenvolvimento dos nossos algoritmos, das nossas pesquisas e das nossas relações com a comunidade.
            </Text>
          </div>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Missão */}
          <Reveal delay={0.04}>
            <Card className="h-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:border-amber-500/50 transition-all">
              <CardContent className="p-6 flex flex-col gap-4">
                <div className="p-3 rounded-full bg-amber-500/10 text-amber-600 w-fit">
                  <Target className="size-6" />
                </div>
                <Text variant="heading-md" className="font-bold text-[var(--color-text-primary)]">
                  Nossa Missão
                </Text>
                <Text variant="body-sm" color="secondary" className="leading-relaxed">
                  Eliminar a assimetria de informação no mercado de jogos do Brasil. Oferecer transparência econométrica em tempo real para que qualquer gamer compre pelo preço justo e qualquer afiliado gerencie suas indicações com inteligência e ética.
                </Text>
              </CardContent>
            </Card>
          </Reveal>

          {/* Visão */}
          <Reveal delay={0.08}>
            <Card className="h-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:border-blue-500/50 transition-all">
              <CardContent className="p-6 flex flex-col gap-4">
                <div className="p-3 rounded-full bg-blue-500/10 text-blue-600 w-fit">
                  <Compass className="size-6" />
                </div>
                <Text variant="heading-md" className="font-bold text-[var(--color-text-primary)]">
                  Nossa Visão
                </Text>
                <Text variant="body-sm" color="secondary" className="leading-relaxed">
                  Ser o hub central definitivo de precificação histórica, curadoria retro e análise de tendências gamer da América Latina. Uma referência onde dados quantitativos e paixão pela cultura pop se encontram.
                </Text>
              </CardContent>
            </Card>
          </Reveal>

          {/* Valores */}
          <Reveal delay={0.12}>
            <Card className="h-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:border-emerald-500/50 transition-all">
              <CardContent className="p-6 flex flex-col gap-4">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-600 w-fit">
                  <Award className="size-6" />
                </div>
                <Text variant="heading-md" className="font-bold text-[var(--color-text-primary)]">
                  Nossos Valores
                </Text>
                <Text variant="body-sm" color="secondary" className="leading-relaxed">
                  100% Imparcialidade Econométrica, Preservação da Memória Retrogamer, Respeito à Comunidade, Rigor Científico na Coleta de Dados e Transparência Absoluta nos Links de Afiliados.
                </Text>
              </CardContent>
            </Card>
          </Reveal>
        </div>

        {/* Imagem Ilustrativa dos Valores & Fliperama */}
        <Reveal delay={0.16}>
          <div className="relative aspect-[21/9] w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-black">
            <Image
              src="/images/sobre/fliperama.png"
              alt="Fliperama e cultura gamer retro"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-6 right-6 text-xs text-amber-400 font-mono font-bold">
              🕹️ A mesma energia dos arcades clássicos impulsionando a maior comunidade de inteligência gamer.
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 5. Objetivos da Plataforma & Justificativa Econométrica
// ----------------------------------------------------------------------
function ObjetivosJustificativaSection() {
  return (
    <section data-theme="dark" className="w-full bg-[var(--color-bg-canvas)] py-16 lg:py-24 border-b border-[var(--color-border-subtle)]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 grid gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[#0B0805] shadow-2xl">
            <Image
              src="/images/sobre/aluguel-tv.png"
              alt="Ilustração sobre justificativa econométrica no mercado gamer"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-xs font-mono text-amber-400">
              📊 Eliminação de distorções e inflação artificial de preços no varejo.
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="flex flex-col gap-5">
            <Badge variant="outline" size="sm" className="w-fit text-amber-400 border-amber-500/40">
              <ShieldCheck className="size-3.5 mr-1" /> Justificativa & Propósito
            </Badge>
            <Text as="h2" variant="display-md" className="font-extrabold text-white">
              Por que uma plataforma de inteligência econométrica é indispensável?
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed">
              <strong>O Problema do Varejo Gamer:</strong> O mercado brasileiro de jogos sofre com grande fragmentação. O mesmo jogo pode custar R$ 349,00 em uma loja e R$ 499,00 em outra na mesma data. Além disso, em épocas promocionais, vendedores reajustam preços prévios para simular descontos inexistentes.
            </Text>
            <Text variant="body-md" color="secondary" className="leading-relaxed">
              <strong>A Solução Espaço Geek 86:</strong> Construímos rotinas automatizadas de raspagem e ingestão 24/7 que coletam dados a cada 5 minutos em Mercado Livre, Shopee, Magalu, Amazon e Via.
            </Text>
            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-amber-400 shrink-0" />
                <span>Limpeza estatística anti-outlier (purga preços errôneos &gt; 2x a média)</span>
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
// 6. Apresentação Completa de TODAS as Ferramentas da Plataforma
// ----------------------------------------------------------------------
function FerramentasShowcaseSection() {
  const tools = [
    {
      id: 'bolsa-gamer',
      badge: 'Motor Principal de Preço',
      title: '1. Bolsa Gamer & Monitoramento de Preços em Tempo Real',
      description:
        'Gráficos estatísticos interativos de 3 camadas (Linha do Menor Preço Ativo, Curva Média de Mercado de todas as lojas e Histograma de Frequência de Cotações). Suporta zoom dinâmico e exibe se o produto está no menor preço histórico.',
      imageSrc: '/images/sobre/ferramenta-bolsa-gamer.png',
      badgeColor: 'bg-amber-500 text-black',
      icon: LineChart,
      bullets: [
        'Curva suave da Média Geral entre todas as lojas e plataformas',
        'Área sombreada dinâmica do Menor Preço Ativo em cada varredura',
        'Histograma de volume de cotações raspadas na base do gráfico',
      ],
      reverse: false,
    },
    {
      id: 'gestao-afiliados',
      badge: 'Painel de Afiliados e Vendedores',
      title: '2. Instrumento de Gestão para Afiliados e Vendedores C2C',
      description:
        'Central completa para criadores de conteúdo e leiloeiros gerarem mensagens promocionais formatadas para WhatsApp/Telegram, inserirem links de afiliado com rastreamento único (matt_tool_id) e monitorarem cliques e receitas em tempo real.',
      imageSrc: '/images/sobre/ferramenta-gestao-afiliados.png',
      badgeColor: 'bg-orange-500 text-white',
      icon: Share2,
      bullets: [
        'Gerador automático de mensagens com formatação profissional',
        'Edição e exclusão de mensagens divulgadas no histórico',
        'Rastreamento inteligente de cliques e taxa de conversão',
      ],
      reverse: true,
    },
    {
      id: 'assistente-comprador',
      badge: 'Decisão do Consumidor',
      title: '3. Assistente Inteligente de Tomada de Decisão do Comprador',
      description:
        'Ferramenta para o comprador final identificar se o momento é ideal para compra. Exibe a variação percentual em relação ao preço médio, badges de oportunidade e links direcionando para a loja com o menor valor ativo.',
      imageSrc: '/images/home/painel-analitico-86.png',
      badgeColor: 'bg-emerald-500 text-black',
      icon: ShoppingCart,
      bullets: [
        'Indicador instantâneo "Comprar Agora no Menor Preço"',
        'Comparador de ofertas de diferentes vendedores no mesmo item',
        'Filtro de menor histórico vitalício sem pegadinhas',
      ],
      reverse: false,
    },
    {
      id: 'observatorio-noticias',
      badge: 'Pesquisas Secundárias e Editorial',
      title: '4. Observatório Gamer, Dossiês e Notícias de Mercado',
      description:
        'Portal jornalístico e analítico com reportagens originais, análises descritivas e relatórios teóricos integrando dados de pesquisas de mercado globais e nacionais (Newzoo, Statista e Pesquisa Game Brasil).',
      imageSrc: '/images/home/observatorio-gamer-hero.png',
      badgeColor: 'bg-blue-500 text-white',
      icon: BookOpen,
      bullets: [
        'Artigos teóricos sobre a economia do retrogaming e cultura pop',
        'Dossiês de mercado com estatísticas consolidadas da indústria',
        'Seções organizadas por sub-categorias filtráveis via menu',
      ],
      reverse: true,
    },
    {
      id: 'pesquisas-primarias',
      badge: 'Dados Primários e Voz do Público',
      title: '5. Pesquisas Primárias e Coleta de Voz da Comunidade',
      description:
        'Módulo de enquetes vivas onde a comunidade opina sobre hábitos de consumo, consoles favoritos e expectativas de lançamento. Permite cadastrar, editar e gerenciar pesquisas ativas diretamente no painel admin.',
      imageSrc: '/images/home/pesquisa-comunidade.png',
      badgeColor: 'bg-purple-500 text-white',
      icon: Vote,
      bullets: [
        'Coleta de respostas anônimas sem necessidade de login prévio',
        'Gerenciador administrativo para criar e editar enquetes',
        'Geração de estatísticas percentuais agregadas instantâneas',
      ],
      reverse: false,
    },
    {
      id: 'nlp-hype-index',
      badge: 'Inteligência Artificial e NLP',
      title: '6. Análise de Sentimento Social e Geek Hype Index™ (0-100)',
      description:
        'Motor estatístico que analisa o engajamento social e a percepção da comunidade sobre títulos e consoles, gerando a nota Geek Hype Index™ para direcionar estratégias de marcas, estoques e colecionadores.',
      imageSrc: '/images/home/observatorio-cards-bg.png',
      badgeColor: 'bg-rose-500 text-white',
      icon: Brain,
      bullets: [
        'Métrica de hype calculada com Processamento de Linguagem Natural',
        'Classificação de sentimento positivo, neutro ou negativo',
        'Direcionamento estratégico para aquisições de catálogo',
      ],
      reverse: true,
    },
    {
      id: 'hype-zone-leiloes',
      badge: 'Hype Zone e Leilões C2C',
      title: '7. Hype Zone, Drops Exclusivos e Leilões entre Colecionadores',
      description:
        'Área nobre dedicada a lançamentos de edições limitadas e leilões C2C de itens clássicos e raros, com contagem regressiva ao vivo, histórico de lances e score de confiança dos vendedores.',
      imageSrc: '/images/home/newsletter-vip-club.png',
      badgeColor: 'bg-amber-400 text-black',
      icon: Trophy,
      bullets: [
        'Sistema de leilões com arremate ao vivo e cronômetro em tempo real',
        'Drops exclusivos com restrição de acesso e cadastro prévio',
        'Score de reputação auditado para vendedores e colecionadores',
      ],
      reverse: false,
    },
  ];

  return (
    <section data-theme="light" className="w-full bg-[var(--color-bg-canvas)] py-20 lg:py-28 border-b border-[var(--color-border-subtle)]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 flex flex-col gap-16">
        <Reveal>
          <div className="text-center flex flex-col items-center gap-3">
            <Badge variant="hype" size="md" className="w-fit font-black tracking-wider uppercase">
              <Zap className="size-3.5 mr-1" /> Arquitetura de Ferramentas
            </Badge>
            <Text as="h2" variant="display-lg" className="font-black text-[var(--color-text-primary)]">
              Conheça Todas as Ferramentas do Espaço Geek 86
            </Text>
            <Text variant="body-lg" color="secondary" className="max-w-[62ch]">
              Um ecossistema robusto projetado com tecnologia de ponta, design nostálgico dos anos 80/90 e imagens exclusivas para cada módulo da plataforma.
            </Text>
          </div>
        </Reveal>

        {/* Renderização de Cada Ferramenta com Imagem ao Lado */}
        <div className="flex flex-col gap-16">
          {tools.map((tool) => {
            const IconComponent = tool.icon;
            return (
              <Reveal key={tool.id}>
                <Card className="overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-xl">
                  <CardContent className="p-6 lg:p-10">
                    <div className={`grid gap-8 lg:grid-cols-12 lg:items-center ${tool.reverse ? 'lg:flex-row-reverse' : ''}`}>
                      {/* Lado do Texto e Bullets */}
                      <div className={`flex flex-col gap-4 lg:col-span-6 ${tool.reverse ? 'lg:order-2' : 'lg:order-1'}`}>
                        <span className={`px-3 py-1 rounded-full text-xs font-extrabold w-fit ${tool.badgeColor}`}>
                          {tool.badge}
                        </span>
                        <Text variant="heading-lg" className="font-black text-[var(--color-text-primary)] leading-tight flex items-center gap-2">
                          <IconComponent className="size-6 text-amber-500 shrink-0" />
                          {tool.title}
                        </Text>
                        <Text variant="body-md" color="secondary" className="leading-relaxed">
                          {tool.description}
                        </Text>

                        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                          {tool.bullets.map((b, idx) => (
                            <div key={idx} className="flex items-center gap-2.5 text-xs font-semibold text-[var(--color-text-primary)]">
                              <CheckCircle2 className="size-4 text-amber-500 shrink-0" />
                              <span>{b}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Lado da Imagem Ilustrativa HD */}
                      <div className={`lg:col-span-6 ${tool.reverse ? 'lg:order-1' : 'lg:order-2'}`}>
                        <div className="relative aspect-[16/10] w-full rounded-[var(--radius-lg)] overflow-hidden border border-[var(--color-border-subtle)] bg-[#0A0704] shadow-2xl group">
                          <Image
                            src={tool.imageSrc}
                            alt={tool.title}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                          <div className="absolute bottom-3 left-4 right-4 text-[11px] font-mono text-amber-400 font-bold">
                            🕹️ Módulo Espaço Geek 86 • Design Nostálgico 80s/90s
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// 7. Perfil do Idealizador & Direção Técnica
// ----------------------------------------------------------------------
function IdealizadorSection() {
  return (
    <section data-theme="dark" className="w-full bg-[var(--color-bg-canvas)] py-16 lg:py-24 border-b border-[var(--color-border-subtle)]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <Reveal>
          <Card className="bg-gradient-to-r from-[#140E08] via-[#0F0A05] to-[#181109] border border-amber-500/30 overflow-hidden shadow-2xl">
            <CardContent className="p-8 lg:p-12 grid gap-8 lg:grid-cols-[240px_1fr] lg:items-center">
              <div className="relative aspect-square w-full max-w-[240px] mx-auto rounded-[var(--radius-xl)] overflow-hidden border-2 border-amber-500/40 shadow-2xl">
                <Image
                  src="/images/sobre/idealizador.png"
                  alt="Renato Silva de Assis — Fundador e Idealizador"
                  fill
                  className="object-cover object-top"
                />
              </div>

              <div className="flex flex-col gap-4">
                <Badge variant="hype" size="sm" className="w-fit">
                  Idealização & Liderança Técnica
                </Badge>
                <Text variant="heading-xl" className="font-extrabold text-white">
                  Renato Silva de Assis
                </Text>
                <Text variant="caption" className="text-amber-400 font-mono font-bold">
                  Fundador, Arquiteto de Software & Colecionador Gamer
                </Text>
                <Text variant="body-md" color="secondary" className="leading-relaxed text-zinc-300">
                  "O Espaço Geek 86 é a materialização do respeito pela cultura dos games combinada com o rigor matemático dos dados. Construímos uma plataforma onde o colecionador encontra nostalgia e o comprador encontra a verdade dos preços."
                </Text>
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <Link href="/ofertas">
                    <Button variant="hype" size="md" rightIcon={<ArrowRight className="size-4" />}>
                      Explorar a Plataforma
                    </Button>
                  </Link>
                  <Link href="/pesquisa">
                    <Button variant="outline" size="md">
                      Responder Pesquisa da Comunidade
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
