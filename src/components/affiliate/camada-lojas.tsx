'use client';

import * as React from 'react';
import { formatBRL } from '@/lib/format';
import { LOJAS_LINHAS_VISIVEIS, linhasReservadas, type LojaHojeLinha, type LojasHoje } from '@/lib/pricing/lojas-hoje-tipos';

/**
 * Lista do painel "Lojas de hoje" (Fase 3, painel 2): as ofertas elegíveis do dia, do menor para o maior preço, com preço,
 * vendedor e rede. Dados por `GET /api/produtos/[id]/lojas`, pedidos SÓ quando a camada abre (este componente só monta com ela aberta).
 * Só apresenta o que a rota devolveu (mesmas consultas e regras do "preço agora"); nada é inventado nem recalculado aqui.
 * Neutro: sem cor semântica, cantos retos. Cada linha tem altura FIXA (h-14): o skeleton reserva exatamente as linhas esperadas
 * (`ofertasEsperadas`, vindo do contrato) e a lista carregada ocupa o mesmo espaço, sem deslocar o resto da camada.
 */

const LINHA = 'flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border-subtle)] px-1';

function Linha({ l }: { l: LojaHojeLinha }) {
  const notas = [l.rede, l.baixaReputacao ? 'baixa reputação' : null, l.foraDaFaixa ? 'fora da faixa de preço plausível' : null].filter(Boolean).join(' · ');
  return (
    <li className={LINHA}>
      <span className="tabular w-24 shrink-0 sm:w-28 text-body-md font-semibold text-[var(--color-text-primary)]">{formatBRL(l.cents)}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm text-[var(--color-text-primary)]" title={l.vendedor ?? undefined}>
          {l.vendedor ?? 'Vendedor não identificado'}
        </span>
        <span className="truncate text-caption text-[var(--color-text-secondary)]">{notas}</span>
      </span>
    </li>
  );
}

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'ok'; dados: LojasHoje };

export function CamadaLojas({ produtoId, ofertasEsperadas }: { produtoId: string; ofertasEsperadas: number }) {
  const [estado, setEstado] = React.useState<Estado>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = React.useState(0);

  React.useEffect(() => {
    const ctl = new AbortController();
    setEstado({ tipo: 'carregando' });
    fetch(`/api/produtos/${produtoId}/lojas`, { signal: ctl.signal, headers: { Accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as LojasHoje;
      })
      .then((dados) => setEstado({ tipo: 'ok', dados }))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === 'AbortError') return;
        setEstado({ tipo: 'erro' });
      });
    return () => ctl.abort();
  }, [produtoId, tentativa]);

  if (estado.tipo === 'carregando') {
    const n = linhasReservadas(ofertasEsperadas);
    return (
      <div aria-busy="true" role="status" aria-label="Carregando as lojas de hoje" data-lojas="carregando">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className={`${LINHA} bg-[var(--color-bg-inset)]`} />
        ))}
      </div>
    );
  }

  if (estado.tipo === 'erro') {
    return (
      <div role="alert" className="flex min-h-14 flex-col items-start gap-2">
        <p className="text-body-md text-[var(--color-text-primary)]">Não foi possível carregar as lojas de hoje agora. Nada é estimado para preencher.</p>
        <button
          type="button"
          onClick={() => setTentativa((x) => x + 1)}
          className="inline-flex min-h-11 items-center border border-[var(--color-border-strong)] px-3 text-body-sm font-medium text-[var(--color-text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] light:focus-visible:outline-[var(--color-accent-cta)]"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { linhas } = estado.dados;
  if (!linhas.length) return <p className="text-body-md text-[var(--color-text-primary)]">Nenhuma oferta verificada nas últimas 48 h.</p>;
  const visiveis = linhas.slice(0, LOJAS_LINHAS_VISIVEIS);
  const resto = linhas.slice(LOJAS_LINHAS_VISIVEIS);
  return (
    <div data-lojas="pronto">
      <ol aria-label="Ofertas de hoje, do menor para o maior preço" className="flex flex-col">
        {visiveis.map((l, i) => (
          <Linha key={i} l={l} />
        ))}
      </ol>
      {resto.length > 0 && (
        <details className="group">
          <summary className={`${LINHA} cursor-pointer list-none text-body-sm font-medium text-[var(--color-text-primary)] outline-none marker:content-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-border-focus)] light:focus-visible:outline-[var(--color-accent-cta)] [&::-webkit-details-marker]:hidden`}>
            <span className="group-open:hidden">Ver as outras {resto.length} ofertas</span>
            <span className="hidden group-open:inline">Recolher as outras {resto.length} ofertas</span>
          </summary>
          <ol tabIndex={0} className="flex max-h-[28rem] flex-col overflow-y-auto outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-border-focus)] light:focus-visible:outline-[var(--color-accent-cta)]" aria-label="Demais ofertas de hoje">
            {resto.map((l, i) => (
              <Linha key={i} l={l} />
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
