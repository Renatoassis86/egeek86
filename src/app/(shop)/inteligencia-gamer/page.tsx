'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Newspaper, FileText, TrendingUp, Sparkles, BookOpen, Layers, Filter, Search } from 'lucide-react';
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
    title: 'Análise de Impacto Econômico das Plataformas de Jogos Digitais no Brasil',
    excerpt: 'Um estudo empírico baseado em dados de mercado que analisa a expansão das vendas digitais e a consolidação do mercado nacional de games.',
    category: 'empiricas',
    categoryLabel: 'Pesquisa Empírica',
    author: 'Renato Silva de Assis',
    date: '25 Jul 2026',
    readTime: '12 min',
    imageUrl: '/images/noticias-hub/data-analysis.png',
    isMainHighlight: true,
  },
  {
    id: '2',
    title: 'A Economia da Nostalgia: O Retorno das Mídias Físicas e Consoles Clássicos',
    excerpt: 'Como o desejo por colecionismo e a nostalgia dos consoles de 16-bit e 32-bit estão moldando os novos modelos de negócios locais.',
    category: 'teoricas',
    categoryLabel: 'Pesquisa Teórica',
    author: 'Equipe Arkos',
    date: '24 Jul 2026',
    readTime: '8 min',
    imageUrl: '/images/sobre/hero-geracoes.png',
    isSecondaryHighlight: true,
  },
  {
    id: '3',
    title: 'Mercado de Consoles no Brasil: Custo-Benefício e Tendências para 2026/2027',
    excerpt: 'Relatório descritivo sobre o volume de vendas de consoles e a variação média de preços no varejo físico e digital brasileiro.',
    category: 'descritivas',
    categoryLabel: 'Pesquisa Descritiva',
    author: 'Arkos Intelligence',
    date: '23 Jul 2026',
    readTime: '6 min',
    imageUrl: '/images/home/statement-band.png',
    isSecondaryHighlight: true,
  },
  {
    id: '4',
    title: 'Fusões no Setor de Games: O que Muda no Acesso a Títulos Exclusivos?',
    excerpt: 'Análise aprofundada sobre as aquisições corporativas internacionais e seu impacto na distribuição de jogos digitais.',
    category: 'artigos',
    categoryLabel: 'Artigos',
    author: 'Felipe Santos',
    date: '25 Jul 2026',
    readTime: '4 min',
    imageUrl: '/images/noticias-hub/esports-event.png',
  },
  {
    id: '5',
    title: 'O Fenômeno Retro e os Espaços de Convivência Gamer nas Capitais',
    excerpt: 'Um artigo reflexivo abordando a ressurreição dos fliperamas e locadoras como centros sociais urbanos de entretenimento.',
    category: 'artigos',
    categoryLabel: 'Artigos',
    author: 'Mariana Costa',
    date: '24 Jul 2026',
    readTime: '5 min',
    imageUrl: '/images/sobre/fliperama.png',
  },
  {
    id: '6',
    title: 'Comportamento do Consumidor de TCG e Jogos de Mesa no Nordeste',
    excerpt: 'Uma pesquisa descritiva baseada em questionários locais de satisfação coletados com colecionadores de trading card games.',
    category: 'descritivas',
    categoryLabel: 'Pesquisa Descritiva',
    author: 'Renato Silva de Assis',
    date: '22 Jul 2026',
    readTime: '10 min',
    imageUrl: '/images/sobre/aluguel-tv.png',
  },
  {
    id: '7',
    title: 'Modelagem Estatística de Flutuação de Preços de Jogos Usados',
    excerpt: 'Estudo empírico usando regressões de preço de mercado para entender a depreciação e valorização de jogos físicos seminovos.',
    category: 'empiricas',
    categoryLabel: 'Pesquisa Empírica',
    author: 'Renato Silva de Assis',
    date: '20 Jul 2026',
    readTime: '15 min',
    imageUrl: '/images/noticias-hub/gamer-setup.png',
  }
];

export default function InteligenciaGamerPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = useMemo(() => [
    { value: 'todos', label: 'Tudo', icon: Layers },
    { value: 'artigos', label: 'Artigos', icon: BookOpen },
    { value: 'teoricas', label: 'P. Teóricas', icon: FileText },
    { value: 'empiricas', label: 'P. Empíricas', icon: TrendingUp },
    { value: 'descritivas', label: 'P. Descritivas', icon: Sparkles }
  ], []);

  // Filtragem dos itens de inteligência
  const filteredItems = useMemo(() => {
    return INTEL_ITEMS.filter(item => {
      const matchesCategory = selectedCategory === 'todos' || item.category === selectedCategory;
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.author.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  // Destaques principais do topo
  const mainHighlight = useMemo(() => {
    return INTEL_ITEMS.find(item => item.isMainHighlight);
  }, []);

  const secondaryHighlights = useMemo(() => {
    return INTEL_ITEMS.filter(item => item.isSecondaryHighlight);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)]">
      {/* Faixa Superior - Arkos Intelligence */}
      <div className="w-full bg-zinc-950 border-b border-zinc-900 py-3 px-4 lg:px-8 text-center">
        <span className="text-[10px] tracking-[0.25em] font-bold text-zinc-400 uppercase">
          Arkos Intelligence - Portal de Informação e Decisão Gamer
        </span>
      </div>

      <div className="mx-auto max-w-7xl px-4 lg:px-8 py-8">
        <div className="flex flex-col gap-2 mb-8 border-b border-[var(--color-border-subtle)] pb-6">
          <h1 className="text-3xl font-extrabold lg:text-4xl tracking-tight text-[var(--color-text-primary)]">
            Inteligência Gamer
          </h1>
          <p className="text-body-md text-[var(--color-text-secondary)] max-w-3xl">
            O hub central de análise acadêmica e pesquisas do Espaço Geek 86. Dados teóricos, descritivos e empíricos aplicados ao mercado e cultura dos jogos.
          </p>
        </div>

        {/* 1. Mosaico de Destaques Estilo Globo.com */}
        {selectedCategory === 'todos' && searchQuery === '' && (
          <div className="grid gap-6 lg:grid-cols-3 mb-12">
            {/* Destaque Principal (Lado Esquerdo - 2 colunas no desktop) */}
            {mainHighlight && (
              <Link 
                href="/noticias" 
                className="group relative flex flex-col justify-end overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-black lg:col-span-2 aspect-[16/10] lg:aspect-auto"
              >
                <div className="absolute inset-0 z-0">
                  <Image 
                    src={mainHighlight.imageUrl} 
                    alt={mainHighlight.title}
                    fill
                    className="object-cover opacity-60 transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                </div>
                <div className="relative z-10 p-6 lg:p-8 flex flex-col gap-2 max-w-2xl text-white">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                    {mainHighlight.categoryLabel}
                  </span>
                  <h2 className="text-xl lg:text-3xl font-extrabold tracking-tight group-hover:underline text-white leading-tight">
                    {mainHighlight.title}
                  </h2>
                  <p className="text-sm text-zinc-300 line-clamp-2">
                    {mainHighlight.excerpt}
                  </p>
                  <div className="flex gap-3 text-xs text-zinc-400 mt-2">
                    <span>Por {mainHighlight.author}</span>
                    <span>•</span>
                    <span>{mainHighlight.readTime} de leitura</span>
                  </div>
                </div>
              </Link>
            )}

            {/* Destaques Secundários (Lado Direito - 1 coluna com 2 cards verticais) */}
            <div className="flex flex-col gap-6">
              {secondaryHighlights.map((item) => (
                <Link
                  key={item.id}
                  href="/noticias"
                  className="group relative flex-1 flex flex-col justify-end overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-black min-h-[180px]"
                >
                  <div className="absolute inset-0 z-0">
                    <Image 
                      src={item.imageUrl} 
                      alt={item.title}
                      fill
                      className="object-cover opacity-50 transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                  </div>
                  <div className="relative z-10 p-5 flex flex-col gap-1.5 text-white">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-amber-400">
                      {item.categoryLabel}
                    </span>
                    <h3 className="text-base font-bold group-hover:underline text-white leading-snug line-clamp-2">
                      {item.title}
                    </h3>
                    <div className="flex gap-2 text-[10px] text-zinc-400">
                      <span>{item.date}</span>
                      <span>•</span>
                      <span>{item.readTime}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 2. Barra de Filtros e Busca */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between border-y border-[var(--color-border-subtle)] py-4 mb-8">
          <div className="flex gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={"flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors " + (
                    selectedCategory === cat.value
                      ? "bg-[var(--color-accent-primary)] text-white"
                      : "bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  )}
                >
                  <Icon className="size-3.5" />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="Pesquisar artigos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-xs focus:outline-none focus:border-[var(--color-accent-primary)]"
            />
          </div>
        </div>

        {/* 3. Grid Principal com Notícias Gerais (Esquerda) e Barra Lateral (Direita) */}
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Coluna da Esquerda: Lista Geral de Notícias e Estudos */}
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] border-b border-[var(--color-border-subtle)] pb-2 mb-2 flex items-center gap-2">
              <BookOpen className="size-5 text-[var(--color-accent-primary)]" />
              Artigos de Inteligência e Pesquisas
            </h2>

            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-text-secondary)]">
                Nenhum artigo encontrado para a seleção atual.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredItems.map((item) => (
                  <Card key={item.id} className="overflow-hidden hover:border-[var(--color-border-strong)] transition-all">
                    <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row gap-5">
                      <div className="relative aspect-[16/10] w-full sm:w-44 shrink-0 rounded overflow-hidden bg-black">
                        <Image 
                          src={item.imageUrl} 
                          alt={item.title}
                          fill
                          className="object-cover transition-transform hover:scale-105"
                        />
                      </div>
                      <div className="flex flex-col justify-between flex-1 min-w-0">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                            {item.categoryLabel}
                          </span>
                          <h3 className="text-base font-extrabold tracking-tight leading-snug hover:text-[var(--color-accent-primary)] transition-colors">
                            <Link href="/noticias">{item.title}</Link>
                          </h3>
                          <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">
                            {item.excerpt}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)] mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                          <span>Por <strong className="text-[var(--color-text-secondary)]">{item.author}</strong></span>
                          <span>•</span>
                          <span>{item.date}</span>
                          <span>•</span>
                          <span>{item.readTime}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Coluna da Direita: Sidebar Lateral de Filtros e Destaques Estatísticos */}
          <div className="flex flex-col gap-6">
            {/* Widget 1: Categorias de Inteligência */}
            <Card>
              <CardContent className="p-5 flex flex-col gap-4">
                <Text variant="heading-sm" className="border-b border-[var(--color-border-subtle)] pb-2 flex items-center gap-2">
                  <Filter className="size-4 text-[var(--color-accent-primary)]" />
                  Divisão de Inteligência
                </Text>
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">Artigos e Ensaios</span>
                    <span className="text-xs text-[var(--color-text-tertiary)] mt-0.5 leading-relaxed">
                      Ensaios críticos, análises corporativas aprofundadas e colunas opinativas sobre a cultura gamer.
                    </span>
                  </div>
                  <hr className="border-[var(--color-border-subtle)]" />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">Pesquisas Teóricas</span>
                    <span className="text-xs text-[var(--color-text-tertiary)] mt-0.5 leading-relaxed">
                      Ensaios conceituais e acadêmicos sobre gamificação, comportamento social e história das mídias.
                    </span>
                  </div>
                  <hr className="border-[var(--color-border-subtle)]" />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">Pesquisas Empíricas</span>
                    <span className="text-xs text-[var(--color-text-tertiary)] mt-0.5 leading-relaxed">
                      Estudos estatísticos e quantitativos utilizando dados consolidados de precificação e comportamento de consumo.
                    </span>
                  </div>
                  <hr className="border-[var(--color-border-subtle)]" />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">Pesquisas Descritivas</span>
                    <span className="text-xs text-[var(--color-text-tertiary)] mt-0.5 leading-relaxed">
                      Mapeamentos e relatórios demográficos contendo estatísticas de mercado e hábitos regionais do público brasileiro.
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Widget 2: Destaque de Economia Gamer por Renato Silva de Assis */}
            <Card className="bg-zinc-950 border-zinc-900 text-white relative overflow-hidden">
              <CardContent className="p-5 flex flex-col gap-3 relative z-10">
                <Badge variant="primary" className="w-fit bg-amber-500 hover:bg-amber-600 text-black font-bold">
                  Arkos Insight
                </Badge>
                <Text variant="heading-sm" className="text-white">
                  Oportunidades de Arbitragem no Mercado de Jogos
                </Text>
                <Text variant="caption" className="text-zinc-300 leading-relaxed">
                  "A flutuação de preços em diferentes vendedores de catálogo no Brasil abre janelas diárias de arbitragem para consoles e mídias físicas raras."
                </Text>
                <div className="flex items-center gap-3 mt-2 border-t border-zinc-900 pt-3">
                  <div className="relative size-8 rounded-full overflow-hidden border border-zinc-800">
                    <Image 
                      src="/images/sobre/idealizador.png" 
                      alt="Renato Silva de Assis"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">Renato Silva de Assis</span>
                    <span className="text-[10px] text-zinc-400">Diretor de Análise</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
