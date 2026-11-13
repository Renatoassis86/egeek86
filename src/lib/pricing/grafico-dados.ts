// Módulo PURO (sem banco, sem server-only): contrato de dados do gráfico de preço V2 evoluído (checklist #27, GRAFICO_PRECOS.md seção 5).
// Entrada = linhas já gravadas em price_daily_state / price_min_events (dado medido). Nada aqui inventa, interpola ou preenche dia sem leitura:
// `dias` só contém dias MEDIDOS (qualidade complete/partial com menor preço); o dia sem leitura simplesmente não existe na lista
// (os buracos ficam em `diasSemMedicao`, para o componente desenhar a lacuna). A média é UMA só: oferta-dia (R-17, ADR 0004).
import { MIN_OFFERS_FOR_AVG, PRICE_DAILY_REGIME_START, addDays, inBand, plausibleBand, spDay, type PeriodDay } from '@/lib/pricing/daily-state';
import { CHART_TFS, TF_DAYS, computePeriodRef, isChartMeasuredDay, type ChartTf, type PeriodRef } from '@/lib/pricing/chart-model';

export const GRAFICO_ESCOPO = 'menor-preco-entre-lojas-novo' as const;

export interface GraficoDia {
  /** 'YYYY-MM-DD' (America/Sao_Paulo). */
  dia: string;
  qualidade: 'complete' | 'partial';
  /** Menor preço do dia (bruto elegível), sempre presente num dia medido. */
  minCents: number;
  /** Loja que deteve o menor do dia ('apelido (rede)'); null quando a oferta não é identificável. */
  minLoja: string | null;
  /** Média oferta-dia do dia: só com `MIN_OFFERS_FOR_AVG` (3) ou mais ofertas. Mesma coluna que alimenta o selo. */
  mediaOfertaDiaCents: number | null;
  medianaOfertaDiaCents: number | null;
  /** Maior preço oferta-dia dentro da faixa plausível (topo da faixa do dia). */
  faixaAltaCents: number | null;
  nOfertas: number;
  nOfertasNaFaixa: number;
  /** Efeito composição > 50% da variação da média (ofertas que entram e saem). null = não calculado. */
  composicao: boolean | null;
  /** Variação (%) da média nas MESMAS ofertas vs. dia anterior. */
  variacaoMesmasOfertasPct: number | null;
  /** Instante da última cotação da oferta que detém o menor do dia. */
  ancoraEm: string | null;
}

export interface GraficoEvento {
  /** Instante da detecção (ISO). */
  em: string;
  minCents: number;
  menorAnteriorCents: number | null;
  /** 'apelido (rede)'. */
  loja: string;
  rede: string;
  /** Amazon: instante da última confirmação do preço da oferta ("confirmada há X h"). Outras redes: null. */
  confirmadoEm: string | null;
  /** Vendedor de baixa reputação. */
  fraco: boolean;
  /** Outro evento no MESMO instante (milissegundo): o par deve ser listado, o líquido é o último. */
  mesmoInstante: boolean;
}

export interface GraficoMinimo {
  cents: number;
  dia: string;
  loja: string | null;
}

export interface GraficoDados {
  escopo: typeof GRAFICO_ESCOPO;
  inicioRegime: string;
  geradoEm: string;
  /** Dias MEDIDOS em ordem crescente. Dia sem leitura não aparece (sem ponto, sem interpolação). */
  dias: GraficoDia[];
  /** Dias entre o primeiro e o último medido que ficaram SEM medição (buracos reais). */
  diasSemMedicao: string[];
  eventos: GraficoEvento[];
  /** Média/mediana históricas por janela, em OFERTA-DIAS (a mesma base do cabeçalho e do selo); `showable` = 3+ ofertas distintas. */
  media: Record<ChartTf, PeriodRef>;
  /** Menor preço realmente medido (dia a dia), de sempre e por janela. */
  minimos: Record<'tudo' | '1D' | '1S' | '1M' | '3M', GraficoMinimo | null>;
  /** Cotação mais recente de oferta ativa elegível (ISO). */
  ultimaCotacaoEm: string | null;
  /** Dias do produto anteriores ao regime atual (fora de todas as medidas). */
  diasLegado: number;
}

export interface LinhaEstado {
  day: string;
  min_cents: number | null;
  avg_cents: number | null;
  median_offer_day_cents: number | null;
  n_offers: number | null;
  quality: string;
  members: Record<string, number> | null;
  composition_flag: boolean | null;
  matched_change_pct: number | null;
  anchor_at: string | null;
  min_loja: string | null;
}

export interface LinhaEvento {
  at: string;
  min_cents: number;
  prev_min_cents: number | null;
  loja: string;
  rede: string;
  confirmed_at: string | null;
  weak: boolean;
}

/** Monta o contrato a partir das linhas cruas. Pura e determinística (o relógio entra por `agora`). */
export function montarGraficoDados(estado: LinhaEstado[], eventos: LinhaEvento[], ultimaCotacaoEm: string | null, agora: Date): GraficoDados {
  const dias: GraficoDia[] = [];
  const periodDays: PeriodDay[] = [];
  let diasLegado = 0;
  for (const r of estado) {
    if (r.quality === 'legacy') diasLegado++;
    const medido = isChartMeasuredDay({ quality: r.quality, minCents: r.min_cents });
    if (!medido || r.day < PRICE_DAILY_REGIME_START) continue;
    const members = r.members ?? {};
    const valores = Object.values(members).map(Number);
    const banda = plausibleBand(valores);
    const naFaixa = valores.filter((v) => inBand(v, banda));
    const nOfertas = Number(r.n_offers ?? 0);
    dias.push({
      dia: r.day,
      qualidade: r.quality as 'complete' | 'partial',
      minCents: Number(r.min_cents),
      minLoja: r.min_loja,
      // A regra das 3 ofertas vale aqui também: mesmo que a coluna venha preenchida, a média de 1 ou 2 ofertas não existe.
      mediaOfertaDiaCents: nOfertas >= MIN_OFFERS_FOR_AVG && r.avg_cents != null ? Math.round(Number(r.avg_cents)) : null,
      medianaOfertaDiaCents: r.median_offer_day_cents == null ? null : Number(r.median_offer_day_cents),
      faixaAltaCents: naFaixa.length ? Math.max(...naFaixa) : null,
      nOfertas,
      nOfertasNaFaixa: naFaixa.length,
      composicao: r.composition_flag,
      variacaoMesmasOfertasPct: r.matched_change_pct == null ? null : Number(r.matched_change_pct),
      ancoraEm: r.anchor_at,
    });
    if (valores.length) periodDays.push({ day: r.day, members, minCents: Number(r.min_cents) });
  }
  dias.sort((a, b) => (a.dia < b.dia ? -1 : 1));

  const medidos = new Set(dias.map((d) => d.dia));
  const diasSemMedicao: string[] = [];
  if (dias.length > 1) {
    for (let d = addDays(dias[0].dia, 1); d < dias[dias.length - 1].dia; d = addDays(d, 1)) if (!medidos.has(d)) diasSemMedicao.push(d);
  }

  const ms = (iso: string) => new Date(iso).getTime();
  const ordenados = [...eventos].sort((a, b) => ms(a.at) - ms(b.at));
  const evs: GraficoEvento[] = ordenados.map((e, i) => ({
    em: new Date(e.at).toISOString(),
    minCents: Number(e.min_cents),
    menorAnteriorCents: e.prev_min_cents == null ? null : Number(e.prev_min_cents),
    loja: e.loja,
    rede: e.rede,
    confirmadoEm: e.confirmed_at ? new Date(e.confirmed_at).toISOString() : null,
    fraco: e.weak === true,
    mesmoInstante: (i > 0 && ms(ordenados[i - 1].at) === ms(e.at)) || (i < ordenados.length - 1 && ms(ordenados[i + 1].at) === ms(e.at)),
  }));

  const hoje = spDay(agora);
  const media = {} as Record<ChartTf, PeriodRef>;
  for (const tf of CHART_TFS) {
    const n = TF_DAYS[tf];
    const de = n == null ? null : addDays(hoje, -(n - 1));
    media[tf] = computePeriodRef(de ? periodDays.filter((d) => d.day >= de) : periodDays, n);
  }

  const minDe = (de: string | null): GraficoMinimo | null => {
    let m: GraficoDia | null = null;
    for (const d of dias) if ((de == null || d.dia >= de) && (m == null || d.minCents < m.minCents)) m = d;
    return m ? { cents: m.minCents, dia: m.dia, loja: m.minLoja } : null;
  };
  const minimos: GraficoDados['minimos'] = {
    tudo: minDe(null),
    '1D': minDe(hoje),
    '1S': minDe(addDays(hoje, -6)),
    '1M': minDe(addDays(hoje, -29)),
    '3M': minDe(addDays(hoje, -89)),
  };

  return {
    escopo: GRAFICO_ESCOPO,
    inicioRegime: PRICE_DAILY_REGIME_START,
    geradoEm: agora.toISOString(),
    dias,
    diasSemMedicao,
    eventos: evs,
    media,
    minimos,
    ultimaCotacaoEm,
    diasLegado,
  };
}
