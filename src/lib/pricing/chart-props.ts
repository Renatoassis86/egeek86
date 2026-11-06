// Mapeamento ÚNICO do DTO de `getPriceMetricsV2` para as props "vivas" do gráfico V2 (preço agora, menor já visto, aviso do vendedor fraco).
// Usado pela seção da página E pela rota de dados da camada: o gráfico da camada e o da página recebem exatamente os mesmos números
// (paridade por construção; teste em scripts/test-parecer-produto.ts). Puro: sem banco, sem server-only.
import type { PriceChartV2Current, PriceChartV2Low } from '@/components/monitoring/price-chart-v2';
import type { ChartInput } from '@/lib/pricing/chart-model';
import type { WeakSellerNotice } from '@/lib/pricing/price-verdict-v2';
import type { PriceMetricsV2 } from '@/server/pricing/price-metrics-v2';

export interface ChartLiveProps {
  current: PriceChartV2Current | null;
  lowAll: PriceChartV2Low | null;
  weakNotice: WeakSellerNotice;
}

export function chartLiveProps(v2: Pick<PriceMetricsV2, 'now' | 'lows' | 'weakNotice'> | null): ChartLiveProps {
  return {
    current: v2?.now ? { cents: v2.now.cents, checkedAt: v2.now.checkedAt, quotedAt: v2.now.quotedAt, store: v2.now.store } : null,
    lowAll: v2?.lows.all ? { cents: v2.lows.all.cents, day: v2.lows.all.day, store: v2.lows.all.store } : null,
    weakNotice: v2?.weakNotice ?? 'none',
  };
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/**
 * Resumo textual do gráfico para leitor de tela (só o que foi medido; nada estimado). null sem dia medido.
 * Os eventos em si ficam na lista "Última mudança do menor preço" do próprio gráfico.
 */
export function resumoGrafico(input: ChartInput): string | null {
  const medidos = input.days.filter((d) => (d.quality === 'complete' || d.quality === 'partial') && d.minCents != null);
  if (!medidos.length) return null;
  const mins = medidos.map((d) => d.minCents as number);
  const lo = Math.min(...mins);
  const hi = Math.max(...mins);
  const n = medidos.length;
  const ev = input.events.length;
  return `Histórico do menor preço: ${n} ${n === 1 ? 'dia medido' : 'dias medidos'}, de ${dm(medidos[0].day)} a ${dm(medidos[n - 1].day)}. Menor preço diário entre ${brl(lo)} e ${brl(hi)}. ${ev} ${ev === 1 ? 'mudança registrada' : 'mudanças registradas'} do menor preço.`;
}
