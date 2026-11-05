import { LineChart, Flame, Info } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import { DATA_BASE_LABEL, JUDGEMENT_LABEL, lastEventSentence, periodsCoincide, thresholdExplanation } from '@/lib/pricing/price-verdict-v2';
import type { PeriodRef } from '@/lib/pricing/chart-model';
import type { LowRecord, PriceMetricsV2 } from '@/server/pricing/price-metrics-v2';

/**
 * Bloco V2 do topo da página de produto (atrás de PRICE_METRICS_V2). Server component, só apresentação:
 * recebe o DTO de `getPriceMetricsV2` e não calcula nada de negócio. Cantos retos. Nunca usa o termo de rede de parceria;
 * a loja aparece pelo nome do vendedor/marketplace. Lacuna fica lacuna (sem dado = texto de ausência, nunca valor).
 * Topo = fatos (preço agora, mediana das lojas hoje, cobertura). O rótulo de juízo só aparece com VERDICT_JUDGEMENT_ENABLED.
 * Jargão (oferta-dia, mediana, cobre N de M dias) só dentro de "i".
 */

const TZ = 'America/Sao_Paulo';
const dateTimeBR = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dayBR = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const dayShort = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `há ${Math.max(1, mins)} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** "i" de explicação: abre uma linha de texto (funciona no toque, sem biblioteca). */
function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group inline align-baseline">
      <summary
        aria-label={label}
        className="ml-1 inline-flex size-4 cursor-pointer list-none items-center justify-center border border-[var(--color-border-default)] align-middle text-[10px] font-semibold leading-none text-[var(--color-text-tertiary)] marker:content-none [&::-webkit-details-marker]:hidden"
      >
        i
      </summary>
      <span className="mt-1 block border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] p-2 text-caption text-[var(--color-text-secondary)]">{children}</span>
    </details>
  );
}

/** Título do período pelo que foi REALMENTE medido, nunca pela janela nominal. */
function periodTitle(p: PeriodRef | null, firstDay: string | null, windowDays: number | null): string {
  if (!p || p.coveredDays <= 0) return windowDays ? `${windowDays} dias` : 'Desde o início';
  if (windowDays && p.coveredDays >= windowDays) return `Últimos ${windowDays} dias`;
  return `${p.coveredDays} ${plural(p.coveredDays, 'dia medido', 'dias medidos')}${firstDay ? ` (desde ${dayShort(firstDay)})` : ''}`;
}

function LowLine({ low }: { low: LowRecord | null }) {
  return (
    <div>
      <dt className="text-caption text-[var(--color-text-tertiary)]">Menor preço</dt>
      <dd className="tabular text-body-sm text-[var(--color-text-primary)]">
        {low ? (
          <>
            {formatBRL(low.cents)}
            <span className="block text-caption text-[var(--color-text-tertiary)]">
              {dayBR(low.day)} · {low.store}
            </span>
            <span className="block text-caption text-[var(--color-text-tertiary)]">
              em {low.coverageDays} {plural(low.coverageDays, 'dia coberto', 'dias cobertos')}
            </span>
          </>
        ) : (
          <span className="text-[var(--color-text-tertiary)]">sem dado</span>
        )}
      </dd>
    </div>
  );
}

function PeriodColumn({ title, p, low, firstDay, windowDays }: { title: string; p: PeriodRef | null; low: LowRecord | null; firstDay: string | null; windowDays: number | null }) {
  const ok = p && p.showable && p.avgCents != null;
  return (
    <div className="flex flex-col gap-2 border border-[var(--color-border-subtle)] p-2.5">
      <Text variant="label" color="tertiary">
        {title === '' ? periodTitle(p, firstDay, windowDays) : title}
      </Text>
      <dl className="flex flex-col gap-2">
        <div>
          <dt className="text-caption text-[var(--color-text-tertiary)]">Média histórica do período</dt>
          <dd className="tabular text-body-sm text-[var(--color-text-primary)]">
            {ok ? formatBRL(p.avgCents as number) : <span className="text-[var(--color-text-tertiary)]">sem dado{p && p.distinctOffers > 0 ? ' (menos de 3 ofertas)' : ''}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-[var(--color-text-tertiary)]">Mediana histórica do período</dt>
          <dd className="tabular text-body-sm text-[var(--color-text-primary)]">
            {ok && p.medianCents != null ? formatBRL(p.medianCents) : <span className="text-[var(--color-text-tertiary)]">sem dado</span>}
          </dd>
        </div>
        <LowLine low={low} />
      </dl>
    </div>
  );
}

export function PriceMetricsV2Block({ data, sealTransition = false }: { data: PriceMetricsV2; sealTransition?: boolean }) {
  const { now, judgement } = data;
  const cmp = data.storesComparison;
  const cmpTone = cmp?.direction === 'below' ? 'success' : 'primary';
  const base = data.dataBase;
  const coincide = periodsCoincide(data.averages);

  return (
    <div className="flex flex-col gap-3">
      <Text variant="label" color="tertiary" className="inline-flex items-center gap-1.5">
        <LineChart className="size-3.5" aria-hidden />
        Menor preço agora entre as lojas
      </Text>

      {now ? (
        <div className="flex flex-col gap-1">
          <Text variant="heading-lg" className="tabular leading-none">
            {formatBRL(now.cents)}
          </Text>
          <Text variant="body-md" color={cmpTone} className="font-semibold">
            {data.decision}
          </Text>
          {data.stores.medianCents != null && (
            <Text variant="caption" color="tertiary">
              Mediana das lojas hoje: <span className="tabular">{formatBRL(data.stores.medianCents)}</span> (menor preço de cada uma das {data.stores.count} lojas).
            </Text>
          )}
          <Text variant="caption" color="tertiary">
            {now.store ?? `${now.tiedOffers} ofertas com este mesmo preço`} · verificado {agoLabel(now.checkedAt)} · {data.stores.count} {plural(data.stores.count, 'loja distinta hoje', 'lojas distintas hoje')}
          </Text>
          {data.lastEvent?.matchesNow && now.lastChangeAt ? (
            <Text variant="caption" color="tertiary">
              Detectado em {dateTimeBR(now.lastChangeAt)}
              {now.prevCents != null ? ` (antes ${formatBRL(now.prevCents)})` : ' (primeiro registro)'}
            </Text>
          ) : data.lastEvent ? (
            // O último evento gravado não é da oferta que detém o preço agora: mostramos só os fatos do evento (valor, horário, loja, valor anterior).
            <Text variant="caption" color="tertiary">
              {lastEventSentence(data.lastEvent, dateTimeBR(data.lastEvent.at), formatBRL)}
            </Text>
          ) : null}
          {now.weakSeller && !data.weakSellerInLows && (
            <Text variant="caption" color="tertiary">
              Vendedor de baixa reputação: confira a reputação antes de comprar.
            </Text>
          )}
        </div>
      ) : (
        <Text variant="body-sm" color="tertiary">
          Nenhuma oferta verificada nas últimas 48 h. O preço agora não é exibido para não mostrar dado velho.
        </Text>
      )}

      {/* Juízo: só existe com VERDICT_JUDGEMENT_ENABLED e histórico suficiente. */}
      {judgement?.ready && judgement.kind && judgement.deltaPercent != null && judgement.thresholdPercent != null && (
        <div className="flex flex-col gap-1 border-l-2 border-[var(--color-border-default)] pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <Text variant="heading-sm" color={JUDGEMENT_LABEL[judgement.kind].tone === 'success' ? 'success' : JUDGEMENT_LABEL[judgement.kind].tone === 'warn' ? 'danger' : 'primary'}>
              {judgement.label}
            </Text>
            {judgement.lowestPeriod && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-none bg-[var(--color-accent-hype)] px-2 py-1">
                <Flame className="size-3.5 text-[var(--color-text-inverse)]" aria-hidden />
                <Text variant="caption" color="inverse" className="font-semibold">
                  Menor preço do período
                </Text>
              </span>
            )}
          </div>
          <Text variant="body-sm" color="secondary">
            {judgement.deltaPercent === 0 ? 'Igual' : `${Math.abs(judgement.deltaPercent)}% ${judgement.deltaPercent < 0 ? 'abaixo' : 'acima'}`} da mediana dos menores preços diários dos últimos {judgement.seriesDays} dias
            {judgement.medianMinsCents != null ? ` (${formatBRL(judgement.medianMinsCents)})` : ''}.
            {judgement.cheaperThanPercent != null ? ` Mais barato que ${judgement.cheaperThanPercent}% desses dias.` : judgement.lowestOfDays != null ? ` O menor preço de ${judgement.lowestOfDays} dias.` : ''}
          </Text>
          <Text variant="caption" color="tertiary">
            {thresholdExplanation(judgement.thresholdPercent)}
          </Text>
        </div>
      )}

      {data.weakNotice === 'prominent' && now && data.lows.d30 && (
        <div role="note" className="flex items-start gap-2 border border-[var(--color-accent-primary)] bg-[var(--color-bg-inset)] p-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--color-accent-primary)]" aria-hidden />
          <Text variant="caption" color="secondary">
            Abaixo do menor dos últimos 30 dias ({formatBRL(data.lows.d30.cents)}) porque esse menor ignora vendedor de baixa reputação.
          </Text>
        </div>
      )}

      {sealTransition && (
        <Text variant="caption" color="tertiary">
          Método atualizado: cada oferta vale 1 por dia. O selo pode diferir do que você viu antes.
        </Text>
      )}

      {/* Histórico curto vira estado útil: o que já se sabe e quando o veredito sai. */}
      {data.shortHistory && (
        <div className="flex flex-col gap-1.5 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] p-3" data-state="historico-curto">
          <Text variant="heading-sm" color="secondary">
            Ainda juntando histórico
          </Text>
          <ul className="flex flex-col gap-1 text-body-sm text-[var(--color-text-secondary)]">
            <li>
              {data.trackingDays} {plural(data.trackingDays, 'dia', 'dias')} de acompanhamento
              {data.firstDay ? ` (desde ${dayBR(data.firstDay)})` : ''}.
            </li>
            <li>
              Menor já visto:{' '}
              {data.lows.all ? (
                <span className="tabular font-semibold text-[var(--color-text-primary)]">
                  {formatBRL(data.lows.all.cents)} <span className="font-normal text-[var(--color-text-tertiary)]">em {dayBR(data.lows.all.day)} · {data.lows.all.store}</span>
                </span>
              ) : (
                <span className="text-[var(--color-text-tertiary)]">sem dado</span>
              )}
              .
            </li>
            <li>
              Faixa observada:{' '}
              {data.observed ? (
                <span className="tabular">
                  {formatBRL(data.observed.minCents)} a {formatBRL(data.observed.maxCents)}
                </span>
              ) : (
                <span className="text-[var(--color-text-tertiary)]">sem dado</span>
              )}
              .
            </li>
            <li>
              {data.judgementEnabled ? (
                <>
                  O veredito de preço sai com {data.measuredDaysNeeded} dias medidos em 3 ou mais lojas (hoje: {data.measuredDays}).
                  {data.unlockDay ? ` Previsão: ${dayBR(data.unlockDay)}.` : ' Sem data estimada ainda.'}
                </>
              ) : (
                <>Sem veredito por enquanto: o método está em validação. Mostramos só os fatos acima.</>
              )}
            </li>
          </ul>
          {/* Reservado ao futuro alerta de preço ("avise quando cair a R$ X"); sem funcionalidade nesta fase. */}
          <div data-slot="alerta-preco" className="hidden" aria-hidden />
        </div>
      )}

      <Text as="div" variant="caption" color="tertiary">
        Base de dados {DATA_BASE_LABEL[base.level].toLowerCase()}
        <InfoTip label="O que é a base de dados">
          Quanto histórico sustenta a comparação: pequena (menos de 3 lojas ou menos de 7 dias medidos), média ou ampla (20 dias ou mais, 3 ou mais lojas e 5 ou mais ofertas).
        </InfoTip>
        {base.level !== 'none' ? ` · ${base.measuredDays30} ${plural(base.measuredDays30, 'dia', 'dias')} com 3+ lojas, ${base.stores} ${plural(base.stores, 'loja distinta', 'lojas distintas')} hoje` : ''}
        {base.range ? ` · faixa ${formatBRL(base.range.minCents)} a ${formatBRL(base.range.maxCents)}` : ''}
      </Text>

      <details className="group border border-[var(--color-border-subtle)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-body-sm font-medium text-[var(--color-text-secondary)] marker:content-none [&::-webkit-details-marker]:hidden">
          <span>Detalhes</span>
          <span aria-hidden className="text-caption text-[var(--color-text-tertiary)] group-open:hidden">
            ver
          </span>
          <span aria-hidden className="hidden text-caption text-[var(--color-text-tertiary)] group-open:inline">
            recolher
          </span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] p-3">
          <Text as="div" variant="caption" color="tertiary">
            Média e mediana históricas de todas as lojas
            <InfoTip label="Como são calculadas">
              Cada oferta vale 1 por dia (preço da oferta no dia = mediana das cotações dela no dia), então a oferta coletada mais vezes não pesa mais. A mediana é o valor do meio: metade dos preços fica abaixo, metade acima. Os períodos mostram os dias realmente medidos, não a janela nominal.
            </InfoTip>
          </Text>
          {!data.averages.all || data.averages.all.coveredDays <= 0 ? (
            <Text variant="body-sm" color="tertiary">
              Período medido (0 dias): sem dado
            </Text>
          ) : coincide && data.averages.all ? (
            // Histórico mais curto que a menor janela: 30d, 90d e tudo seriam idênticos; uma coluna só, com o nome do que foi medido.
            <div className="grid grid-cols-1 gap-3">
              <PeriodColumn
                title={`Período medido (${data.averages.all.coveredDays} ${plural(data.averages.all.coveredDays, 'dia', 'dias')})`}
                p={data.averages.all}
                low={data.lows.all}
                firstDay={data.firstDay}
                windowDays={null}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PeriodColumn title="" p={data.averages.d30} low={data.lows.d30} firstDay={data.firstDay} windowDays={30} />
              <PeriodColumn title="" p={data.averages.d90} low={data.lows.d90} firstDay={data.firstDay} windowDays={90} />
              <PeriodColumn title={data.firstDay ? `Desde ${dayShort(data.firstDay)} (tudo medido)` : 'Desde 31/10'} p={data.averages.all} low={data.lows.all} firstDay={data.firstDay} windowDays={null} />
            </div>
          )}
          <Text as="div" variant="caption" color="tertiary">
            Mediana das lojas hoje (no topo) é o valor do meio entre o menor preço de cada loja neste momento e muda a cada coleta. Mediana histórica do período é o valor do meio de todos os preços oferta-dia do período medido. São medidas diferentes e podem divergir.
          </Text>
          <Text variant="caption" color="tertiary">
            {data.weakNotice !== 'none' ? 'Os menores preços ignoram vendedor de baixa reputação. ' : ''}
            Dados anteriores a 31/10/2026 ficam fora de todas as medidas.
          </Text>
          {data.legacyDays > 0 && (
            <div className="flex items-start gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] p-2.5">
              <Info className="mt-0.5 size-3.5 shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
              <Text variant="caption" color="tertiary">
                Histórico antigo: {data.legacyDays} {plural(data.legacyDays, 'dia anterior', 'dias anteriores')} a 31/10/2026, coletados em outro regime, não comparáveis.
              </Text>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
