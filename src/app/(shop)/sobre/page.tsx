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
import { getPublicTotals } from '@/server/queries/home-search';

export const metadata: Metadata = {
  title: 'História e Ferramentas',
  description:
    'Conheça a história, a missão e as ferramentas do Espaço Geek 86.',
};

export const dynamic = 'force-dynamic';

export default async function SobrePage() {
  const [stats, totals] = await Promise.all([getPlatformStats(), getPublicTotals()]);

  return (
    <div className="flex flex-col w-full bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)]">
      {/* 1. Hero e Identidade */}
      <HeroSection />

      {/* 2. Métricas do ecossistema (produtos/lojas: mesma fonte da home, getPublicTotals) */}
      <PlatformMetricsSection stats={stats} totals={totals} />

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
              Preço real de games, com histórico.
            </Text>
            <Text variant="body-lg" className="mt-2 text-zinc-300 font-medium max-w-[68ch] leading-relaxed">
              O Espaço Geek 86 compara preços de jogos, consoles e acessórios nos marketplaces do Brasil. Do 8-bit aos consoles atuais, a ideia é ajudar você a comprar sabendo quanto o produto custa nas lojas e quanto já custou.
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
function PlatformMetricsSection({
  stats,
  totals,
}: {
  stats: any;
  totals: { products: number; stores: number };
}) {
  return (
    <section data-theme="light" className="w-full bg-[#faf7f2] text-zinc-900 border-b border-amber-900/10 py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatTile icon={<Package className="size-5" />} value={totals.products} label="Produtos com preço atual" />
          <StatTile icon={<Store className="size-5" />} value={stats.totalSellers} label="Vendedores identificados" />
          <StatTile icon={<Layers className="size-5" />} value={totals.stores} label="Lojas monitoradas" />
          <StatTile icon={<LineChart className="size-5" />} value={stats.totalQuotes} label="Cotações registradas" />
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
              Das locadoras dos anos 80 e 90 a um comparador de preços.
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200 font-medium">
              O Espaço Geek 86 nasceu das tardes em locadoras de videogame, trocando cartuchos de Super Nintendo e Mega Drive e lendo revistas de dicas.
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200 font-medium">
              Começou como uma coleção pessoal catalogada e virou o hábito de ajudar amigos a achar um preço justo sem cair em falso desconto.
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200 font-medium">
              Hoje o site consulta os maiores marketplaces do Brasil a cada 5 minutos e guarda o histórico de preço de cada produto.
            </Text>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative col-span-2 aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-lg)] border border-purple-500/30 bg-[#0B0805] shadow-2xl">
              <Image
                src="/images/sobre/fliperama.png"
                alt="Fliperama lotado nos anos 80 e 90"
                fill
                className="object-cover object-center"
              />
            </div>
            <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] border border-purple-500/30 bg-[#0B0805] shadow-xl">
              <Image
                src="/images/sobre/aluguel-tv.png"
                alt="Crianças jogando videogame numa TV de tubo"
                fill
                className="object-cover object-center"
              />
            </div>
            <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] border border-purple-500/30 bg-[#0B0805] shadow-xl">
              <Image
                src="/images/sobre/arcade-anos-90-noite.png"
                alt="Garotos jogando videogame numa locadora nos anos 90"
                fill
                className="object-cover object-center"
              />
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
  const pilares = [
    {
      id: 'missao',
      label: 'Nossa Missão',
      Icon: Target,
      quote:
        'Mostrar o preço real dos jogos para a comunidade geek economizar na hora de comprar.',
      text:
        'Mostramos o preço real de cada jogo, sem estimativa, para você decidir com informação. Cada número vem de uma cotação coletada direto das lojas e atualizada a cada coleta.',
      accent: 'text-amber-300',
      bar: 'bg-amber-400',
      border: 'border-amber-400/40 hover:border-amber-400',
      chip: 'bg-amber-400 text-zinc-950',
    },
    {
      id: 'visao',
      label: 'Nossa Visão',
      Icon: Compass,
      quote: 'Ser a referência de comparação de preços de games no Brasil.',
      text:
        'Queremos que o gamer brasileiro encontre aqui o menor preço do jogo que procura e saiba se vale a pena comprar agora.',
      accent: 'text-emerald-300',
      bar: 'bg-emerald-400',
      border: 'border-emerald-400/40 hover:border-emerald-400',
      chip: 'bg-emerald-400 text-zinc-950',
    },
  ];

  return (
    <section
      id="missao-visao-valores"
      data-theme="dark"
      className="relative w-full bg-gradient-to-b from-[#1a1033] via-[#120b26] to-[#0c0719] text-white py-20 lg:py-28 border-b border-purple-500/20 scroll-mt-20 overflow-hidden"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8 flex flex-col gap-14">
        <Reveal>
          <div className="text-center flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black uppercase tracking-widest bg-amber-400 text-zinc-950 w-fit">
              Propósito
            </span>
            <Text as="h2" variant="display-lg" className="font-black !text-white text-3xl sm:text-5xl tracking-tight">
              Nossa Missão &amp; Nossa Visão
            </Text>
            <Text variant="body-lg" className="!text-zinc-200 max-w-[66ch] leading-relaxed font-medium">
              O que queremos entregar e aonde queremos chegar.
            </Text>
          </div>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-2">
          {pilares.map(({ id, label, Icon, quote, text, accent, bar, border, chip }, i) => (
            <Reveal key={id} delay={0.04 + i * 0.04}>
              <article className={`h-full border-2 ${border} bg-[#1f1540] p-8 lg:p-10 flex flex-col gap-6 transition-colors duration-300`}>
                <header className="flex items-center gap-4">
                  <span className={`inline-flex size-14 items-center justify-center ${chip}`}>
                    <Icon className="size-7" aria-hidden />
                  </span>
                  <span className={`text-sm font-black uppercase tracking-widest ${accent}`}>{label}</span>
                </header>

                <blockquote className="flex gap-4">
                  <span className={`w-1.5 shrink-0 ${bar}`} aria-hidden />
                  <p className="text-xl sm:text-2xl font-black text-white leading-snug tracking-tight">&ldquo;{quote}&rdquo;</p>
                </blockquote>

                <p className="text-base text-zinc-200 leading-relaxed">{text}</p>
              </article>
            </Reveal>
          ))}
        </div>

        {/* Banner Ilustrativo */}
        <Reveal delay={0.12}>
          <div className="relative aspect-[21/9] sm:aspect-[24/9] w-full overflow-hidden border border-amber-400/40 bg-[#0B0805] shadow-2xl group">
            <Image
              src="/images/sobre/arcade-anos-80.png"
              alt="Fliperama e cultura gamer retro"
              fill
              className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
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
              src="/images/sobre/quarto-retro.png"
              alt="Justificativa e inteligência de dados no mercado gamer"
              fill
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-xs font-mono text-emerald-400 font-bold">
              Preços que variam muito de uma loja para outra.
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="flex flex-col gap-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 w-fit">
              <ShieldCheck className="size-3.5 mr-1" /> Justificativa e Propósito
            </span>
            <Text as="h2" variant="display-md" className="font-extrabold text-white">
              Por que comparar preços de games
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200">
              <strong>O Problema do Varejo Gamer:</strong> O mesmo jogo pode custar muito mais em uma loja do que em outra no mesmo dia. Em época de promoção, alguns vendedores aumentam o preço antes para simular um desconto.
            </Text>
            <Text variant="body-md" className="leading-relaxed text-zinc-200">
              <strong>A Solução Espaço Geek 86:</strong> Coletamos preços automaticamente a cada 5 minutos no Mercado Livre, nossa principal fonte hoje. Novos marketplaces entram conforme a integração de cada um fica pronta.
            </Text>
            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                <span>Preços fora do normal são descartados do cálculo da média</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                <span>Preço médio de mercado comparado ao menor preço ativo</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                <span>Histórico que mostra se a oferta é boa de verdade</span>
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
      badge: 'Preço e histórico',
      title: '1. Monitoramento de preços',
      description:
        'Gráfico com duas linhas: o menor preço ativo e a média entre todas as lojas. Dá para escolher o período e ver se o produto está no menor preço já registrado.',
      imageSrc: '/images/sobre/ferramenta-bolsa-gamer.png',
      badgeColor: 'bg-amber-500 text-black',
      borderHover: 'hover:border-amber-500 hover:shadow-xl',
      bullets: [
        'Média geral entre todas as lojas',
        'Menor preço ativo em cada coleta',
        'Número de cotações e de lojas monitoradas no período escolhido',
      ],
      reverse: false,
    },
    {
      id: 'ferramenta-gestao-afiliados',
      badge: 'Divulgadores e vendedores',
      title: '2. Painel para divulgadores e vendedores',
      description:
        'Para quem divulga ofertas: gere mensagens para WhatsApp e Telegram, use links com rastreamento e acompanhe cliques e resultados.',
      imageSrc: '/images/sobre/ferramenta-gestao-afiliados.png',
      badgeColor: 'bg-orange-500 text-white',
      borderHover: 'hover:border-orange-500 hover:shadow-xl',
      bullets: [
        'Gerador de mensagens para WhatsApp e Telegram',
        'Histórico de mensagens, com edição e exclusão',
        'Contagem de cliques e taxa de conversão',
      ],
      reverse: true,
    },
    {
      id: 'ferramenta-assistente-comprador',
      badge: 'Decisão do Consumidor',
      title: '3. Ajuda na hora de comprar',
      description:
        'Mostra se vale comprar agora: a variação percentual em relação ao preço médio, selos de oportunidade e o link da loja com o menor preço ativo.',
      imageSrc: '/images/sobre/assistente-decisao-comprador.png',
      badgeColor: 'bg-emerald-600 text-white',
      borderHover: 'hover:border-emerald-500 hover:shadow-xl',
      bullets: [
        'Indicador de menor preço ativo',
        'Ofertas de vários vendedores para o mesmo item',
        'Filtro pelo menor preço já registrado',
      ],
      reverse: false,
    },
    {
      id: 'ferramenta-observatorio-noticias',
      badge: 'Pesquisas Secundárias e Editorial',
      title: '4. Observatório Gamer e notícias',
      description:
        'Reportagens originais, análises e relatórios com dados de pesquisas de mercado do Brasil e do mundo (Newzoo, Statista e Pesquisa Game Brasil).',
      imageSrc: '/images/sobre/vitrine-colecionaveis.png',
      badgeColor: 'bg-cyan-600 text-white',
      borderHover: 'hover:border-cyan-500 hover:shadow-xl',
      bullets: [
        'Artigos sobre a economia do retrogaming e a cultura pop',
        'Dossiês de mercado com estatísticas da indústria',
        'Seções organizadas por categoria',
      ],
      reverse: true,
    },
    {
      id: 'ferramenta-pesquisas-primarias',
      badge: 'Pesquisas de Mercado e Voz do Consumidor',
      title: '5. Pesquisas de mercado',
      description:
        'Pesquisas com consumidores e com o público gamer, como testes de aceitação no lançamento de marcas.',
      imageSrc: '/images/noticias-hub/data-analysis.png',
      badgeColor: 'bg-purple-600 text-white',
      borderHover: 'hover:border-purple-500 hover:shadow-xl',
      bullets: [
        'Pesquisas qualitativas e quantitativas com consumidores',
        'Estudos de posicionamento para lançamento de marcas',
        'Relatórios de hábitos de consumo e percepção de marca',
      ],
      reverse: false,
    },
    {
      id: 'ferramenta-nlp-hype-index',
      badge: 'Hype Index',
      title: '6. Geek Hype Index (0-100)',
      description:
        'Nota de 0 a 100 que mede o engajamento e a percepção da comunidade sobre títulos e consoles.',
      imageSrc: '/images/sobre/snes-colecao.png',
      badgeColor: 'bg-rose-600 text-white',
      borderHover: 'hover:border-rose-500 hover:shadow-xl',
      bullets: [
        'Nota de hype calculada a partir de comentários da comunidade',
        'Classificação de sentimento positivo, neutro ou negativo',
        'Apoio para decidir quais títulos adquirir',
      ],
      reverse: true,
    },
    {
      id: 'ferramenta-hype-zone-leiloes',
      badge: 'Hype Zone e Leilões C2C',
      title: '7. Hype Zone, drops e leilões entre colecionadores',
      description:
        'Lançamentos de edições limitadas e leilões entre colecionadores de itens clássicos e raros, com contagem regressiva, histórico de lances e nota de confiança dos vendedores.',
      imageSrc: '/images/sobre/loja-retro.png',
      badgeColor: 'bg-amber-500 text-black',
      borderHover: 'hover:border-amber-500 hover:shadow-xl',
      bullets: [
        'Leilões com cronômetro regressivo',
        'Drops com acesso restrito e cadastro prévio',
        'Nota de reputação de vendedores e colecionadores',
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
              Ferramentas
            </span>
            <Text as="h2" variant="display-lg" className="font-black text-zinc-900 tracking-tight">
              Ferramentas do Espaço Geek 86
            </Text>
            <Text variant="body-lg" className="text-zinc-700 max-w-[64ch] leading-relaxed font-medium">
              O que o site oferece para compradores, divulgadores e colecionadores.
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
                alt="Renato Silva de Assis, fundador e Idealizador"
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
                  O Espaço Geek 86 nasceu da união entre duas paixões que acompanham <strong>Renato Silva de Assis</strong> desde a infância: os videogames e a tecnologia.
                </p>
                <p>
                  Economista pela Universidade Federal da Paraíba (UFPB), Mestre em Economia Regional pela Universidade Federal do Rio Grande do Norte (UFRN) e especialista em Ciência de Dados aplicada aos negócios, Renato trabalha há anos desenvolvendo plataformas e modelos de análise de dados para apoiar decisões.
                </p>
                <p>
                  Há décadas ele coleciona games. Dos consoles clássicos aos atuais, acompanhou a indústria, o mercado de colecionáveis e a cultura geek, e viu de perto os problemas de quem compra: preço que muda de loja para loja, falsa promoção e pouca informação confiável.
                </p>
                <p className="font-semibold text-white">
                  Daí surgiu o Espaço Geek 86.
                </p>
                <p>
                  O Espaço Geek 86 está sendo construído para reunir num só lugar o monitoramento de preços atualizado a cada coleta, o histórico de valores, a reputação de vendedores, pesquisas com a comunidade e conteúdo sobre games.
                </p>
                <blockquote className="p-4 rounded-xl bg-amber-500/10 border-l-4 border-amber-500 italic text-amber-200 text-sm leading-relaxed">
                  &quot;A tecnologia deve servir às pessoas. Queremos que cada compra seja decidida com informação real sobre o preço, e não só com base em publicidade.&quot;
                </blockquote>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link href="/ofertas">
                  <Button variant="hype" size="md" rightIcon={<ArrowRight className="size-4" />}>
                    Ver ofertas
                  </Button>
                </Link>
                <Link href="/pesquisa">
                  <Button variant="outline" size="md" className="text-white border-amber-500/40 hover:bg-amber-500/10">
                    Responder à pesquisa
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
