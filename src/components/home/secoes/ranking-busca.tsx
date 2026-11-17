'use client';

// Seção da home (dono, 2026-11-17): busca no molde do Buscapé. Digita, escolhe o produto e vê todas as ofertas do menor ao maior preço, com o link de cada uma
// (/go/<slug>, o redirecionamento do site), a classificação do produto e os indicadores quando existirem. Só dado real da API; nada inventado.
import { useEffect, useRef, useState } from 'react';
import { Search, ExternalLink, Loader2 } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import type { ProdutoRanking, RankingProduto } from '@/server/queries/ranking-busca';

const DEBOUNCE_MS = 260;

export function RankingBuscaSection() {
  const [q, setQ] = useState('');
  const [produtos, setProdutos] = useState<ProdutoRanking[]>([]);
  const [ranking, setRanking] = useState<RankingProduto | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) {
      setProdutos([]);
      setBuscou(false);
      return;
    }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setCarregando(true);
      try {
        const r = await fetch(`/api/ranking-busca?q=${encodeURIComponent(termo)}`, { signal: c.signal });
        const j = (await r.json()) as { produtos?: ProdutoRanking[] };
        setProdutos(j.produtos ?? []);
        setBuscou(true);
      } catch {
        /* requisição cancelada ou rede: mantém a lista anterior */
      } finally {
        if (ctrl.current === c) setCarregando(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  async function abrir(id: string) {
    setCarregando(true);
    try {
      const r = await fetch(`/api/ranking-busca?produto=${encodeURIComponent(id)}`);
      const j = (await r.json()) as { ranking?: RankingProduto | null };
      setRanking(j.ranking ?? null);
    } catch {
      setRanking(null);
    } finally {
      setCarregando(false);
    }
  }

  const ind = ranking?.indicadores;
  return (
    <section id="compare-precos" className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-16 lg:py-24" aria-labelledby="compare-titulo">
      <div className="mb-6 max-w-[48ch]">
        <Text variant="label" color="tertiary">Compare preços</Text>
        <Text as="h2" variant="display-lg" className="mt-2" id="compare-titulo">Busque um produto e veja do menor ao maior preço.</Text>
        <Text variant="body-md" color="secondary" className="mt-3">Todas as lojas que monitoramos, com o link de cada oferta ativa.</Text>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative max-w-2xl">
        <label htmlFor="compare-q" className="sr-only">Buscar produto</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--color-text-tertiary)]" aria-hidden />
        <input
          id="compare-q"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setRanking(null);
          }}
          autoComplete="off"
          placeholder="Ex.: air fryer, PlayStation 5, Kindle, impressora 3D"
          className="h-12 w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] pl-10 pr-10 text-base text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]"
        />
        {carregando && <Loader2 className="absolute right-3 top-1/2 size-5 -translate-y-1/2 animate-spin text-[var(--color-text-tertiary)]" aria-hidden />}
      </form>

      {!ranking && produtos.length > 0 && (
        <ul className="mt-4 grid max-w-2xl gap-2" aria-label="Produtos encontrados">
          {produtos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => abrir(p.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--color-border-subtle)] px-4 py-3 text-left hover:border-[var(--color-accent-primary)]"
              >
                <span className="min-w-0 truncate text-[var(--color-text-primary)]">{p.titulo}</span>
                <span className="shrink-0 text-sm tabular-nums text-[var(--color-text-secondary)]">
                  a partir de {formatBRL(p.menorCentavos)} · {p.ofertas} {p.ofertas === 1 ? 'oferta' : 'ofertas'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!ranking && buscou && !carregando && produtos.length === 0 && (
        <Text variant="body-sm" color="secondary" className="mt-4">Nenhum produto com oferta ativa para essa busca. Tente outro termo.</Text>
      )}

      {ranking && (
        <div className="mt-6 max-w-3xl">
          <button type="button" onClick={() => setRanking(null)} className="text-sm font-semibold underline">Voltar aos resultados</button>
          <h3 className="mt-3 text-xl font-bold text-[var(--color-text-primary)]">{ranking.produto.titulo}</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            <span className="font-semibold">{ranking.classificacao.rotulo}</span>
            {ind?.mediaCentavos ? <> · média {formatBRL(ind.mediaCentavos)}</> : null}
            {ind?.menorRegistradoCentavos ? <> · menor preço registrado {formatBRL(ind.menorRegistradoCentavos)}</> : null}
            {ind?.noMenorPreco ? <> · no menor preço já registrado</> : null}
          </p>
          <ol className="mt-4 grid gap-2" aria-label="Ofertas do menor ao maior preço">
            {ranking.ofertas.map((o, i) => (
              <li key={o.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border-subtle)] px-4 py-3">
                <div className="min-w-0">
                  <span className="text-sm text-[var(--color-text-tertiary)]">{i + 1}º</span>{' '}
                  <span className="font-semibold text-[var(--color-text-primary)]">{o.loja}</span>
                  {o.vendedor ? <span className="text-sm text-[var(--color-text-secondary)]"> · {o.vendedor}</span> : null}
                  <div className="text-xs text-[var(--color-text-tertiary)]">
                    preço conferido em {new Date(o.conferidoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold tabular-nums text-[var(--color-text-primary)]">{formatBRL(o.precoCentavos)}</span>
                  <a
                    href={`/go/${o.slug}`}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-bg-base)]"
                  >
                    Ir à oferta <ExternalLink className="size-4" aria-hidden />
                  </a>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">O preço pode mudar na loja. Diagnóstico de compra só aparece quando há histórico suficiente.</p>
        </div>
      )}
    </section>
  );
}
