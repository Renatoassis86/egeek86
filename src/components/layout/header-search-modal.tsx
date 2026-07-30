'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X, Gamepad2, Newspaper, Flame, Gavel, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { formatBRL } from '@/lib/format';
import type { GlobalSearchResult } from '@/app/api/search/route';

const SEARCH_DEBOUNCE_MS = 300;

// Hype Zone e Leilões ainda não entram na busca real (outro processo está
// construindo esses módulos em paralelo) — essas abas só redirecionam no
// Enter, sem prévia inline fabricada.
const LIVE_SEARCH_TYPES: ReadonlySet<string> = new Set(['jogo', 'noticia']);

export function HeaderSearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'todos' | 'jogo' | 'noticia' | 'hype' | 'leilao'>('todos');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Busca real no banco (ofertas + notícias) — nunca mais um array fixo de
  // exemplo, que fazia qualquer termo fora dos 8 itens de demonstração
  // sempre voltar "nenhum resultado", mesmo pra produto já catalogado.
  useEffect(() => {
    const isLiveFilter = filter === 'todos' || LIVE_SEARCH_TYPES.has(filter);
    if (!isOpen || query.trim().length < 2 || !isLiveFilter) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) return;
        const json = (await res.json()) as { items: GlobalSearchResult[] };
        setResults(json.items ?? []);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, isOpen, filter]);

  // Tecla de atalho Ctrl+K ou Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const filteredResults = filter === 'todos' ? results : results.filter((item) => item.type === filter);
  const isLiveCategory = filter === 'todos' || LIVE_SEARCH_TYPES.has(filter);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsOpen(false);
    if (filter === 'noticia') {
      router.push(`/noticias?q=${encodeURIComponent(query.trim())}`);
    } else if (filter === 'hype') {
      router.push(`/hype-zone?q=${encodeURIComponent(query.trim())}`);
    } else if (filter === 'leilao') {
      router.push(`/leiloes?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push(`/ofertas?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <>
      {/* Botão de Busca no Header */}
      <Button 
        variant="ghost" 
        size="icon" 
        aria-label="Pesquisar jogos e notícias" 
        onClick={() => setIsOpen(true)}
        className="relative group"
        title="Pesquisar (Ctrl + K)"
      >
        <Search className="size-5 transition-transform group-hover:scale-110" />
      </Button>

      {/* Modal / Overlay de Busca */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 md:pt-24 px-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div 
            className="relative w-full max-w-2xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-xl)] shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Campo de Busca Principal */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/50">
              <Search className="size-5 text-[var(--color-accent-primary)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar por jogos, notícias, leilões ou consoles..."
                className="w-full bg-transparent text-sm md:text-base text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
                  <X className="size-4" />
                </button>
              )}
              <Button type="button" variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Fechar busca">
                <X className="size-5" />
              </Button>
            </form>

            {/* Filtros Rápidos */}
            <div className="flex items-center gap-2 p-3 bg-[var(--color-bg-surface)] border-b border-[var(--color-border-subtle)] overflow-x-auto text-xs">
              <button
                type="button"
                onClick={() => setFilter('todos')}
                className={`px-3 py-1 rounded-full font-bold transition-all ${filter === 'todos' ? 'bg-[var(--color-accent-primary)] text-black' : 'bg-[var(--color-bg-inset)] text-[var(--color-text-secondary)] hover:text-white'}`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setFilter('jogo')}
                className={`px-3 py-1 rounded-full font-bold transition-all flex items-center gap-1.5 ${filter === 'jogo' ? 'bg-[var(--color-accent-primary)] text-black' : 'bg-[var(--color-bg-inset)] text-[var(--color-text-secondary)] hover:text-white'}`}
              >
                <Gamepad2 className="size-3.5" /> Jogos & Ofertas
              </button>
              <button
                type="button"
                onClick={() => setFilter('noticia')}
                className={`px-3 py-1 rounded-full font-bold transition-all flex items-center gap-1.5 ${filter === 'noticia' ? 'bg-[var(--color-accent-hype)] text-black' : 'bg-[var(--color-bg-inset)] text-[var(--color-text-secondary)] hover:text-white'}`}
              >
                <Newspaper className="size-3.5" /> Notícias
              </button>
              <button
                type="button"
                onClick={() => setFilter('hype')}
                className={`px-3 py-1 rounded-full font-bold transition-all flex items-center gap-1.5 ${filter === 'hype' ? 'bg-blue-400 text-black' : 'bg-[var(--color-bg-inset)] text-[var(--color-text-secondary)] hover:text-white'}`}
              >
                <Flame className="size-3.5" /> Hype Zone
              </button>
              <button
                type="button"
                onClick={() => setFilter('leilao')}
                className={`px-3 py-1 rounded-full font-bold transition-all flex items-center gap-1.5 ${filter === 'leilao' ? 'bg-[var(--color-accent-gold)] text-black' : 'bg-[var(--color-bg-inset)] text-[var(--color-text-secondary)] hover:text-white'}`}
              >
                <Gavel className="size-3.5" /> Leilões
              </button>
            </div>

            {/* Lista de Resultados */}
            <div className="max-h-80 overflow-y-auto p-2 flex flex-col gap-1">
              {!isLiveCategory ? (
                <div className="p-8 text-center text-xs text-[var(--color-text-tertiary)]">
                  Busca de {filter === 'hype' ? 'Hype Zone' : 'Leilões'} ainda não tem prévia aqui — pressione Enter pra buscar direto na seção.
                </div>
              ) : loading ? (
                <div className="p-8 text-center text-xs text-[var(--color-text-tertiary)]">Buscando...</div>
              ) : query.trim().length >= 2 && filteredResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--color-text-tertiary)]">
                  Nenhum resultado encontrado para &quot;{query}&quot;. Pressione Enter para buscar em todas as categorias.
                </div>
              ) : (
                filteredResults.map((item) => (
                  <Link
                    key={item.id}
                    href={item.url}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)]/60 hover:bg-[var(--color-bg-surface)] border border-transparent hover:border-[var(--color-border-subtle)] transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-[var(--color-bg-inset)] text-[var(--color-accent-primary)] shrink-0">
                        {item.type === 'jogo' && <Gamepad2 className="size-4" />}
                        {item.type === 'noticia' && <Newspaper className="size-4 text-[var(--color-accent-hype)]" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-primary)] transition-colors line-clamp-1">
                          {item.title}
                        </span>
                        {item.category && (
                          <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">
                            {item.category}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {item.priceCents && (
                        <span className="text-xs font-mono font-bold text-[var(--color-text-primary)]">
                          {formatBRL(item.priceCents)}
                        </span>
                      )}
                      <ArrowRight className="size-4 text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent-primary)] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-3 bg-[var(--color-bg-inset)]/80 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)]">
              <span>Dica: Use <strong>ESC</strong> para fechar ou <strong>Ctrl + K</strong> para abrir.</span>
              <button 
                type="button"
                onClick={handleSearchSubmit} 
                className="font-bold text-[var(--color-accent-primary)] hover:underline flex items-center gap-1"
              >
                Ver todos os resultados <ArrowRight className="size-3" />
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
