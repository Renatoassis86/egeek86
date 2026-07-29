'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Newspaper, FileText, TrendingUp, Sparkles, BookOpen, Layers, Filter, Search, ArrowRight, ChevronLeft, ChevronRight, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';

// Definição de tipos de dados para os itens da Inteligência Gamer
interface IntelItem {
  id: string;
  title: string;
  excerpt: string;
  category: 'artigos' | 'teoricas' | 'empiricas' | 'descritivas';
  categoryLabel: string;
  author: string;
  date: string;
  readTime: string;
  imageUrl: string;
  isMainHighlight?: boolean;
  isSecondaryHighlight?: boolean;
}

const INTEL_ITEMS: IntelItem[] = [
  {
    id: '1',
    title: 'A valorização dos consoles retrô e mídias físicas raras no mercado brasileiro',
    excerpt: 'Levantamento revela a alta de preços de cartuchos raros e consoles 16-bit e 32-bit em feiras e leilões C2C no Brasil.',
    category: 'teoricas',
    categoryLabel: 'Games & Colecionismo',
    author: 'Renato Silva de Assis',
    date: '27 Jul 2026',
    readTime: '8 min',
    imageUrl: '/images/sobre/hero-geracoes.png',
    isMainHighlight: true,
  },
  {
    id: '2',
    title: 'Análise de Impacto Econômico das Plataformas de Jogos Digitais no Brasil',
    excerpt: 'Um estudo de mercado baseado em dados de consumo que analisa a expansão das vendas digitais e a consolidação do mercado nacional de games.',
    category: 'empiricas',
    categoryLabel: 'Radar de Preços e Dados',
    author: 'Renato Silva de Assis',
    date: '25 Jul 2026',
    readTime: '12 min',
    imageUrl: '/images/noticias-hub/data-analysis.png',
    isMainHighlight: true,
  },
  {
    id: '3',
    title: 'Mercado de Consoles no Brasil: Custo-Benefício e Tendências para 2026/2027',
    excerpt: 'Relatório descritivo sobre o volume de vendas de consoles e a variação média de preços no varejo físico e digital brasileiro.',
    category: 'descritivas',
    categoryLabel: 'Panorama e Tendências',
    author: 'Arkos Intelligence',
    date: '23 Jul 2026',
    readTime: '6 min',
    imageUrl: '/images/home/statement-band.png',
    isMainHighlight: true,
  },
  {
    id: '4',
    title: 'Guia de setups e periféricos para alta performance no e-sports',
    excerpt: 'Avaliação técnica sobre taxa de atualização, tempo de resposta e durabilidade dos melhores periféricos do mercado.',
    category: 'artigos',
    categoryLabel: 'Tecnologia & Periféricos',
    author: 'Felipe Santos',
    date: '25 Jul 2026',
    readTime: '5 min',
    imageUrl: '/images/noticias-hub/gamer-setup.png',
  },
  {
    id: '5',
    title: 'O crescimento dos campeonatos de E-sports e TCG regionais',
    excerpt: 'Torneios locais de fighting games e TCG expandem o público jovem e impulsionam o comércio especializado.',
    category: 'descritivas',
    categoryLabel: 'Pesquisas de Mercado',
    author: 'Mariana Costa',
    date: '24 Jul 2026',
    readTime: '6 min',
    imageUrl: '/images/noticias-hub/esports-event.png',
  },
  {
    id: '6',
    title: 'O Fenômeno Retro e os Espaços de Convivência Gamer nas Capitais',
    excerpt: 'Um artigo reflexivo abordando a ressurreição dos fliperamas e locadoras como centros sociais urbanos de entretenimento.',
    category: 'artigos',
    categoryLabel: 'Artigos e Opinião',
    author: 'Mariana Costa',
    date: '24 Jul 2026',
    readTime: '5 min',
    imageUrl: '/images/sobre/fliperama.png',
  },
  {
    id: '7',
    title: 'Modelagem Estatística de Flutuação de Preços de Jogos Usados',
    excerpt: 'Análise de mercado para entender a depreciação e valorização de jogos físicos seminovos.',
    category: 'empiricas',
    categoryLabel: 'Radar de Preços e Dados',
    author: 'Renato Silva de Assis',
    date: '20 Jul 2026',
    readTime: '15 min',
    imageUrl: '/images/home/por-que-geek86.png',
  },
  {
    id: '8',
    title: 'Precificação Dinâmica e Algoritmos Preditivos no Varejo de Retrogaming',
    excerpt: 'Como modelos de redes neurais e regressão estatística auxiliam vendedores a definir a melhor janela de oportunidade de venda.',
    category: 'empiricas',
    categoryLabel: 'Radar de Preços e Dados',
    author: 'Renato Silva de Assis',
    date: '19 Jul 2026',
    readTime: '14 min',
    imageUrl: '/images/home/painel-analitico-86-light.png',
  },
];

import { useSearchParams } from 'next/navigation';

// Componente do Carrossel Automático (2 em 2 segundos)
function HeroIntelCarousel({ items }: { items: IntelItem[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  // Rotação automática de 2 em 2 segundos (2000ms)
  useEffect(() => {
    if (isHovered || items.length <= 1) return;
    const timer = setInterval(() => {
      nextSlide();
    }, 2000);
    return () => clearInterval(timer);
  }, [isHovered, items.length, nextSlide]);

  const currentItem = items[currentIndex];

  if (!currentItem) return null;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative w-full rounded-[var(--radius-xl)] border-2 border-amber-500/40 bg-[#0d0d12] text-white overflow-hidden shadow-2xl p-4 sm:p-6 lg:p-8 mb-10 group"
    >
      <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
        {/* Imagem do lado esquerdo */}
        <div className="lg:col-span-6 relative aspect-[16/10] w-full rounded-[var(--radius-lg)] overflow-hidden bg-black shadow-lg">
          <Image
            src={currentItem.imageUrl}
            alt={currentItem.title}
            fill
            priority
            className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
          {/* Botões prev/next sobre a imagem */}
          <button
            onClick={prevSlide}
            aria-label="Slide anterior"
            className="absolute left-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/70 hover:bg-amber-500 hover:text-black text-white flex items-center justify-center transition-all shadow-md"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={nextSlide}
            aria-label="Próximo slide"
            className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/70 hover:bg-amber-500 hover:text-black text-white flex items-center justify-center transition-all shadow-md"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Informações do lado direito (Título, Excerpt completo e "Ler mais →") */}
        <div className="lg:col-span-6 flex flex-col gap-3 justify-center">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 w-fit">
              {currentItem.categoryLabel}
            </span>
            <span className="text-[11px] font-mono text-zinc-400">⚡ Carrossel 2s</span>
          </div>

          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white leading-tight">
            {currentItem.title}
          </h2>

          {/* Texto descritivo completo */}
          <p className="text-sm sm:text-base text-zinc-200 leading-relaxed font-medium">
            {currentItem.excerpt}
          </p>

          <div className="flex items-center gap-3 text-xs text-zinc-400 pt-2 font-mono">
            <span>Por <strong className="text-amber-400">{currentItem.author}</strong></span>
            <span>•</span>
            <span>{currentItem.date}</span>
            <span>•</span>
            <span>{currentItem.readTime} de leitura</span>
          </div>

          {/* Botão de ação explícito: Ler mais → */}
          <div className="pt-3">
            <Link
              href="/noticias"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-lg hover:translate-x-1"
            >
              <span>Ler mais</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Indicadores de bolinhas na parte inferior */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {items.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Ir para slide ${idx + 1}`}
            className={
              'h-2 rounded-full transition-all duration-300 ' +
              (currentIndex === idx ? 'w-8 bg-amber-400' : 'w-2 bg-zinc-600 hover:bg-zinc-400')
            }
          />
        ))}
      </div>
    </div>
  );
}

function InteligenciaGamerPageContent() {
  const searchParams = useSearchParams();
  const categoriaFromUrl = searchParams.get('categoria');

  const [selectedCategory, setSelectedCategory] = useState<string>(categoriaFromUrl || 'todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (categoriaFromUrl) {
      setSelectedCategory(categoriaFromUrl);
    }
  }, [categoriaFromUrl]);

  const categories = useMemo(
    () => [
      { value: 'todos', label: 'Tudo', icon: Layers },
      { value: 'artigos', label: 'Artigos e Opinião', icon: BookOpen },
      { value: 'teoricas', label: 'Dossiês de Mercado', icon: FileText },
      { value: 'empiricas', label: 'Radar de Preços', icon: TrendingUp },
      { value: 'descritivas', label: 'Panorama e Tendências', icon: Sparkles },
    ],
    []
  );

  const filteredItems = useMemo(() => {
    return INTEL_ITEMS.filter((item) => {
      const matchesCategory = selectedCategory === 'todos' || item.category === selectedCategory;
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.author.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)]">
      {/* Faixa Superior */}
      <div className="w-full bg-[#0c0906] border-b border-amber-900/30 py-3 px-4 lg:px-8 text-center">
        <span className="text-xs tracking-[0.25em] font-black text-amber-400 uppercase">
          Arkos Intelligence — Portal de Informação e Decisão Gamer
        </span>
      </div>

      <div className="mx-auto max-w-7xl px-4 lg:px-8 py-8">
        <div className="flex flex-col gap-2 mb-8 border-b border-[var(--color-border-subtle)] pb-6">
          <h1 className="text-3xl font-black lg:text-4xl tracking-tight text-[var(--color-text-primary)]">
            Observatório Gamer
          </h1>
          <p className="text-body-md text-[var(--color-text-secondary)] max-w-3xl font-medium">
            O hub central de análise acadêmica e pesquisas do Espaço Geek 86. Dados teóricos, descritivos e empíricos aplicados ao mercado e cultura dos jogos.
          </p>
        </div>

        {/* 1. CARROSSEL AUTOMÁTICO DE DESTAQUES (ROTAÇÃO 2 SEGUNDOS) */}
        {selectedCategory === 'todos' && searchQuery === '' && (
          <HeroIntelCarousel items={INTEL_ITEMS.slice(0, 3)} />
        )}

        {/* 2. Barra de Filtros e Busca */}
        <div data-theme="light" className="flex flex-col gap-4 md:flex-row md:items-center justify-between bg-[#faf7f2] border border-amber-900/10 rounded-[var(--radius-lg)] p-4 mb-8">
          <div className="flex gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={
                    'flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all ' +
                    (isSelected
                      ? 'bg-amber-500 text-black shadow-md'
                      : 'bg-white border border-zinc-300 text-zinc-700 hover:border-amber-400')
                  }
                >
                  <Icon className="size-3.5" />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Pesquisar artigos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-full border border-zinc-300 bg-white text-xs font-medium focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* 3. Grid Principal com Artigos (Esquerda) e Sidebar Animada (Direita) */}
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* Coluna da Esquerda: Lista de Artigos */}
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-black tracking-tight text-[var(--color-text-primary)] border-b border-[var(--color-border-subtle)] pb-2 mb-2 flex items-center gap-2">
              <BookOpen className="size-5 text-amber-500" />
              Artigos de Inteligência e Pesquisas
            </h2>

            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-text-secondary)] font-medium">
                Nenhum artigo encontrado para a seleção atual.
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                {filteredItems.map((item) => (
                  <Card key={item.id} className="group overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0e0c14] hover:border-amber-400 transition-all duration-300 shadow-sm hover:shadow-xl flex flex-col justify-between">
                    <CardContent className="p-4 sm:p-5 flex flex-col gap-3 h-full">
                      <div className="relative aspect-[16/10] w-full rounded-md overflow-hidden bg-black shrink-0">
                        <Image
                          src={item.imageUrl}
                          alt={item.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>

                      <div className="flex flex-col gap-2 flex-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20 w-fit">
                          {item.categoryLabel}
                        </span>
                        <h3 className="text-base font-black tracking-tight leading-snug text-zinc-900 dark:text-white group-hover:text-amber-500 transition-colors">
                          <Link href="/noticias">{item.title}</Link>
                        </h3>

                        {/* Texto descritivo obrigatorio em todos os cards */}
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium line-clamp-3">
                          {item.excerpt}
                        </p>
                      </div>

                      {/* Link obrigatorio "Ler mais →" e rodapé */}
                      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                          <span>{item.date}</span>
                          <span>•</span>
                          <span>{item.readTime}</span>
                        </div>
                        <Link
                          href="/noticias"
                          className="inline-flex items-center gap-1 text-xs font-black text-amber-600 dark:text-amber-400 hover:text-amber-500 transition-all group-hover:translate-x-1"
                        >
                          <span>Ler mais</span>
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Coluna da Direita: Sidebar Animada de Cores Vibrantes */}
          <div className="flex flex-col gap-6">
            {/* Widget 1: Divisão de Inteligência (Vibrante Animado) */}
            <div className="rounded-[var(--radius-xl)] border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-purple-500/5 to-emerald-500/10 p-5 shadow-lg hover:shadow-2xl transition-all duration-300 hover:border-amber-400 group">
              <div className="flex items-center gap-2 border-b border-amber-500/30 pb-3 mb-4">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 group-hover:rotate-12 transition-transform">
                  <Filter className="size-4" />
                </div>
                <h3 className="text-base font-black tracking-tight text-zinc-900 dark:text-white">
                  Divisão de Inteligência
                </h3>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col p-3 rounded-lg bg-white/80 dark:bg-black/40 border border-amber-500/20 hover:border-amber-400 transition-colors">
                  <span className="text-xs font-black text-amber-700 dark:text-amber-400">Artigos e Ensaios</span>
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium mt-0.5">
                    Análises corporativas e colunas opinativas sobre a cultura gamer.
                  </span>
                </div>

                <div className="flex flex-col p-3 rounded-lg bg-white/80 dark:bg-black/40 border border-purple-500/20 hover:border-purple-400 transition-colors">
                  <span className="text-xs font-black text-purple-700 dark:text-purple-400">Pesquisas Teóricas</span>
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium mt-0.5">
                    Ensaios conceituais e acadêmicos sobre gamificação e comportamento.
                  </span>
                </div>

                <div className="flex flex-col p-3 rounded-lg bg-white/80 dark:bg-black/40 border border-emerald-500/20 hover:border-emerald-400 transition-colors">
                  <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">Pesquisas Empíricas</span>
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium mt-0.5">
                    Estudos estatísticos utilizando dados consolidados de precificação.
                  </span>
                </div>

                <div className="flex flex-col p-3 rounded-lg bg-white/80 dark:bg-black/40 border border-cyan-500/20 hover:border-cyan-400 transition-colors">
                  <span className="text-xs font-black text-cyan-700 dark:text-cyan-400">Pesquisas Descritivas</span>
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium mt-0.5">
                    Estatísticas de mercado e hábitos regionais do público brasileiro.
                  </span>
                </div>
              </div>
            </div>

            {/* Widget 2: Arkos Insight (Vibrante Animado Roxo/Esmeralda/Gold) */}
            <div className="rounded-[var(--radius-xl)] border-2 border-purple-500/40 bg-gradient-to-b from-[#1c0c32] via-[#140a24] to-[#04261c] text-white p-6 shadow-2xl relative overflow-hidden group hover:border-amber-400 transition-all duration-300">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />

              <div className="relative z-10 flex flex-col gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500 text-black w-fit">
                  <Brain className="size-3.5" /> Arkos Insight
                </span>

                <h3 className="text-lg font-black text-white leading-tight">
                  Oportunidades de Arbitragem no Mercado Gamer
                </h3>

                <p className="text-xs text-zinc-200 leading-relaxed font-medium italic border-l-2 border-amber-400 pl-3">
                  &quot;A flutuação de preços em diferentes vendedores de catálogo no Brasil abre janelas diárias de arbitragem para consoles e mídias físicas raras.&quot;
                </p>

                <div className="flex items-center gap-3 pt-3 border-t border-purple-900/40 mt-1">
                  <div className="flex size-9 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400/10 text-amber-400 shrink-0">
                    <Brain className="size-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-white">Renato Silva de Assis</span>
                    <span className="text-[10px] text-amber-400 font-mono">Direção de Inteligência</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InteligenciaGamerPage() {
  return (
    <Suspense fallback={null}>
      <InteligenciaGamerPageContent />
    </Suspense>
  );
}
