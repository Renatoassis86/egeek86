'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { buildChartModel, type ChartInput } from '@/lib/pricing/chart-model';
import { resumoGrafico, type ChartLiveProps } from '@/lib/pricing/chart-props';

/**
 * Painel "Histórico do menor preço" da camada (Fase 3, painel 1). Dados e gráfico SÓ AO ABRIR a camada: a rota
 * /api/produtos/[id]/grafico e o chunk do gráfico V2 são pedidos em paralelo quando este painel monta. Reaproveita o
 * `PriceChartV2` existente (degraus, mediana/média históricas, marcadores de queda, trechos sem cotação tracejados, banda do
 * vendedor fraco, botão Camadas) em modo `neutro` (sem verde/vermelho). Nada interpolado. A caixa tem altura mínima reservada
 * O painel é o ÚLTIMO da camada: não há nada abaixo dele para deslocar quando o gráfico termina de carregar (a altura real do gráfico
 * varia de 760 a 1.250 px conforme legenda, notas e eventos), e a caixa da camada tem altura fixa no desktop. A caixa só reserva o
 * mínimo (24 rem) para o skeleton, o erro e a mensagem de dado insuficiente.
 */

const carregarGrafico = () => import('@/components/monitoring/price-chart-v2').then((m) => m.PriceChartV2);
const PriceChartV2 = dynamic(carregarGrafico, { ssr: false, loading: () => null });

interface Resposta extends ChartLiveProps {
  input: ChartInput | null;
  /** Mediana das lojas hoje (centavos): a linha pontilhada de referência da camada. null com menos de 3 lojas. */
  storesMedianCents: number | null;
  nowIso: string;
}

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'ok'; dados: Resposta };

const CAIXA = 'min-h-[24rem]';

export function CamadaGrafico({ produtoId }: { produtoId: string }) {
  const [estado, setEstado] = React.useState<Estado>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = React.useState(0);

  React.useEffect(() => {
    const ctl = new AbortController();
    setEstado({ tipo: 'carregando' });
    void carregarGrafico(); // chunk do gráfico em paralelo com os dados
    fetch(`/api/produtos/${produtoId}/grafico`, { signal: ctl.signal, headers: { Accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Resposta;
      })
      .then((dados) => setEstado({ tipo: 'ok', dados }))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === 'AbortError') return;
        setEstado({ tipo: 'erro' });
      });
    return () => ctl.abort();
  }, [produtoId, tentativa]);

  if (estado.tipo === 'carregando') {
    return (
      <div className={`${CAIXA} flex flex-col gap-3`} aria-busy="true" role="status">
        <p className="text-body-sm text-[var(--color-text-secondary)]">Carregando o histórico medido…</p>
        <div className="h-8 w-48 bg-[var(--color-bg-inset)]" />
        <div className="h-[260px] w-full bg-[var(--color-bg-inset)] md:h-[320px]" />
        <div className="h-[116px] w-full bg-[var(--color-bg-inset)] sm:h-[76px]" />
      </div>
    );
  }

  if (estado.tipo === 'erro') {
    return (
      <div className={`${CAIXA} flex flex-col items-start gap-3`} role="alert">
        <p className="text-body-md text-[var(--color-text-primary)]">Não foi possível carregar o histórico medido agora. Nada é estimado para preencher.</p>
        <button
          type="button"
          onClick={() => setTentativa((n) => n + 1)}
          className="inline-flex min-h-11 items-center border border-[var(--color-border-strong)] px-3 text-body-sm font-medium text-[var(--color-text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] light:focus-visible:outline-[var(--color-accent-cta)]"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { dados } = estado;
  const nowMs = new Date(dados.nowIso).getTime();
  const nivel = dados.input ? buildChartModel(dados.input, '1M', nowMs, { avgDay: false, avgHistorical: false }).level : 'none';
  if (!dados.input || nivel === 'none' || nivel === 'single') {
    return (
      <div className={CAIXA}>
        <p className="text-body-md text-[var(--color-text-primary)]">
          {dados.input && nivel === 'single' ? 'Só 1 dia medido: ainda não há o que desenhar.' : 'Este produto ainda não tem dias medidos suficientes no método atual.'} Nada é estimado para preencher.
        </p>
      </div>
    );
  }
  const resumo = resumoGrafico(dados.input);
  return (
    <div className={CAIXA} data-grafico="pronto">
      {resumo && <p className="sr-only">{resumo}</p>}
      <PriceChartV2 input={dados.input} nowIso={dados.nowIso} current={dados.current} lowAll={dados.lowAll} weakNotice={dados.weakNotice} medianaLojasHoje={dados.storesMedianCents} neutro />
    </div>
  );
}
