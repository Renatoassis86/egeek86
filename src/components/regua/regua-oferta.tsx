import { DEGRAUS, REGUA, reguaFront, type Degrau, type ReguaFront } from '@/lib/messaging/regua';
import { formatBRL } from '@/lib/format';
import type { OfferListingMetrics } from '@/server/queries/affiliate';

/**
 * RÉGUA DE DESTAQUE no front (dono, 2026-11-12): os MESMOS degraus, cores, marcas e veredito das mensagens (src/lib/messaging/regua.ts).
 * A cor nunca fica sozinha: sempre o rótulo do veredito em texto e as marcas ▼ (daltonismo). Cantos RETOS. Só valores reais:
 * sem média elegível não há veredito. "Espere" só existe aqui no site (preço acima da média), nunca no grupo.
 * Base: as métricas de listagem (média única do produto com a elegibilidade do site: >= 5 cotações e >= 14 dias). A mínima mostrada é o
 * "menor já visto" (histórico completo), rotulado assim, sem afirmar janela de 90 dias.
 */
export function reguaDoFront(precoCents: number, metrics: OfferListingMetrics | undefined): ReguaFront | null {
  if (!metrics || metrics.avgPriceCents == null || metrics.avgPriceCents <= 0 || !metrics.eligibility.eligible || metrics.verdict.lowConfidence) return null;
  return reguaFront({
    precoCents,
    mediaCents: metrics.avgPriceCents,
    minCents: metrics.lowestPriceCents > 0 ? metrics.lowestPriceCents : null,
    maxCents: metrics.highestPriceCents,
    diasHistorico: metrics.historyDays,
    nOfertas: metrics.quoteCount,
  });
}

const pt1 = (x: number) => x.toFixed(1).replace('.', ',');

/** Etiqueta do degrau: faixa da cor + marcas ▼ + veredito em texto + percentual. */
export function ReguaEtiqueta({ regua, className = '' }: { regua: ReguaFront; className?: string }) {
  const v = regua.veredito;
  if (!v) return null;
  const d = DEGRAUS[v.degrau];
  return (
    // Visual premium (dono, 2026-11-13): em vez de um bloco chapado e saturado, painel escuro com filete lateral na cor do degrau, fundo
    // com 10% da cor, moldura interna fina, rótulo em creme (contraste alto) e o PERCENTUAL como número grande na cor do degrau.
    // A cor nunca fica sozinha: marcas ▼ + rótulo em texto + percentual. Cantos retos. Nunca corta nem sobrepõe texto: o rótulo quebra
    // em linhas, as marcas têm espaçamento normal e nada é truncado. Vale para os 5 degraus (azul, verde, amarelo, laranja, vermelho).
    <span
      className={`flex w-full flex-col gap-1 border-l-[3px] py-1.5 pl-2.5 pr-2 leading-snug ${className}`}
      style={{ background: `${d.cor}1A`, borderColor: d.cor, boxShadow: `inset 0 0 0 1px ${d.cor}33` }}
      data-degrau={v.degrau}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--color-text-primary)]">
        <span aria-hidden className="shrink-0 whitespace-nowrap leading-none tracking-normal" style={{ color: d.cor }}>{d.marcas}</span>
        <span className="min-w-0 break-words">{v.rotulo}</span>
      </span>
      {v.mostrarPct ? (
        <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="tabular shrink-0 whitespace-nowrap text-xl font-bold leading-none" style={{ color: d.cor }}>−{pt1(v.pct)}%</span>
          <span className="whitespace-nowrap text-xs leading-tight text-[var(--color-text-secondary)]">abaixo da média</span>
        </span>
      ) : null}
      <span className="sr-only">{`Degrau ${v.degrau} de 5 pela queda sobre a média das lojas.`}</span>
    </span>
  );
}

/** Régua mínima / agora / média, com os valores reais escritos (nenhum marcador sem dado). */
export function ReguaMarcadores({ regua }: { regua: ReguaFront }) {
  const pontos = [
    regua.mini != null ? { k: 'Menor já visto', v: regua.mini } : null,
    { k: 'Agora', v: regua.agora },
    regua.media != null ? { k: 'Média', v: regua.media } : null,
    regua.maxi != null ? { k: 'Maior já visto', v: regua.maxi } : null,
  ].filter((p): p is { k: string; v: number } => p != null);
  if (pontos.length < 2) return null;
  const lo = Math.min(...pontos.map((p) => p.v));
  const hi = Math.max(...pontos.map((p) => p.v));
  const span = Math.max(1, hi - lo);
  const cor = regua.veredito ? DEGRAUS[regua.veredito.degrau].cor : 'currentColor';
  return (
    <div className="flex flex-col gap-1.5" aria-label="Régua de preço: menor já visto, preço agora, média e maior já visto">
      <div className="relative h-1.5 w-full bg-[var(--color-border-subtle)]">
        {pontos.map((p) => (
          <span
            key={p.k}
            aria-hidden
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${((p.v - lo) / span) * 100}%`, background: p.k === 'Agora' ? cor : 'var(--color-text-secondary)' }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap justify-between gap-x-3 text-[12px] text-[var(--color-text-secondary)]">
        {pontos.map((p) => (
          <li key={p.k}>
            <span className="font-semibold">{p.k}</span> {formatBRL(p.v)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legenda dos 5 degraus (cor + marcas + veredito + faixa), para /black-friday. */
export function ReguaLegenda() {
  const faixas: Array<[Degrau, string]> = [
    [1, `${REGUA.LIMITES[0]}% a menos de ${REGUA.LIMITES[1]}%`],
    [2, `${REGUA.LIMITES[1]}% a menos de ${REGUA.LIMITES[2]}%`],
    [3, `${REGUA.LIMITES[2]}% a menos de ${REGUA.LIMITES[3]}%`],
    [4, `${REGUA.LIMITES[3]}% a ${REGUA.LIMITES[4]}%`],
    [5, `mais de ${REGUA.LIMITES[4]}%`],
  ];
  return (
    <div className="flex flex-col gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3">
      <p className="text-[13px] text-[var(--color-text-secondary)]">
        Cada etiqueta mostra o tamanho da queda sobre a média de todas as lojas. A cor é só um apoio: o veredito e as marcas ▼ dizem o mesmo em texto.
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
        {faixas.map(([d, faixa]) => (
          <li key={d} className="flex flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-1.5 px-2 py-1 text-[12px] font-black leading-none" style={{ background: DEGRAUS[d].cor, color: DEGRAUS[d].corTexto }}>
              <span aria-hidden className="whitespace-nowrap tracking-normal">{DEGRAUS[d].marcas}</span>
              {DEGRAUS[d].rotulo}
            </span>
            <span className="text-[12px] text-[var(--color-text-tertiary)]">{faixa} abaixo da média</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
