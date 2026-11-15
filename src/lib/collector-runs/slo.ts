// PROPOSTA de SLOs e limiares de alerta do coletor (ata 2026-11-05, plano item 3). Valores iniciais, a CALIBRAR com 3 a 5 dias
// de collector_runs reais (sombra). Nada aqui envia alerta: so constantes lidas por health-eval.ts.

export interface DeadManRule {
  job: string;
  network: string;
  /** Cadencia esperada do cron em minutos (vercel.json) e silencio maximo antes de alertar (~4 ticks). */
  everyMinutes: number;
  maxSilenceMin: number;
  /** Janela de duracao maxima (maxDuration do route + folga): 'running' acima disso = execucao abandonada. */
  abandonedAfterMin: number;
}

export interface ChromeLoopRule {
  job: string;
  label: string;
  maxSilenceMin: number;
}

export const SLO = {
  /** Dead-man switch por rede: nenhuma execucao FINALIZADA (ok/partial) dentro do silencio maximo. */
  deadMan: [
    { job: 'collect-prices', network: 'mercado-livre', everyMinutes: 5, maxSilenceMin: 20, abandonedAfterMin: 5 },
    { job: 'collect-shopee', network: 'shopee', everyMinutes: 10, maxSilenceMin: 40, abandonedAfterMin: 6 },
    // Amazon assistida (aba logada do dono envia lotes de ~75 s durante ~85 min a cada 2 h; ata 2026-11-10). Silencio maximo de 3 h = aba parada.
    { job: 'amazon-assistida', network: 'amazon', everyMinutes: 120, maxSilenceMin: 180, abandonedAfterMin: 5 },
  ] satisfies DeadManRule[],

  /**
   * Loops do Chrome (abas do dono, #113 passo 7). Limiar = silencio maximo sem gravar (ok/partial). Medido em collector_runs (24 h, 2026-11-15):
   * batimento p95 20 min, picos normais ate 32; ml-links picos normais ate 31; amazon-assistida roda ~85 min a cada 2 h, pausa normal
   * de 58 a 60 min. Acima disso (quedas reais medidas: 80, 132, 139, 234 min) o dono e avisado. Cron: a cada 30 min, entao o aviso
   * chega em ate limiar + 30 min.
   */
  chromeLoops: [
    { job: 'cupons-batimento', label: 'Batimento de cupons (aba __cup)', maxSilenceMin: 40 },
    { job: 'ml-links-assistida', label: 'Links do Mercado Livre (aba __mll)', maxSilenceMin: 45 },
    { job: 'amazon-assistida', label: 'Amazon assistida (aba __amza)', maxSilenceMin: 75 },
  ] satisfies ChromeLoopRule[],
  /** Lembrete enquanto o loop continuar caido (o aviso inicial e 1 por queda; nunca menos de 30 min entre avisos). */
  chromeLoopRepeatMin: 120,

  /** Idade da oferta DEVIDA mais velha (no inicio da execucao). Acima disso = backlog crescendo / cobertura caindo. */
  oldestDueAgeMaxS: 6 * 3600,

  /** Janela de taxas e minimo de tentativas para a taxa valer (evita alertar com 3 consultas). */
  rateWindowMin: 60,
  rateMinAttempts: 30,
  /** Historico para a linha de base (horas) e minimo de horas com dado para usa-la. */
  baselineHours: 7 * 24,
  baselineMinHours: 24,
  /** Alerta quando taxa > max(multiplo x base, base + folga absoluta). */
  errorRate: { multiple: 2, slackAbs: 0.05, fallbackAbs: 0.2 },
  rate429: { multiple: 2, slackAbs: 0.01, fallbackAbs: 0.05, minCount: 3 },
  missRate: { multiple: 2, slackAbs: 0.1, fallbackAbs: 0.5 },

  /** Queda de volume: soma das ultimas N h < (1 - dropPct) x mediana das mesmas N h nos 7 dias anteriores. */
  volume: { windowHours: 6, dropPct: 0.3, baselineDays: 7, minBaseline: 100 },

  /** Fechamento do dia (price_daily_state do dia anterior com closed=true) ate esta hora de Sao Paulo. */
  dayCloseByHourSp: 1,

  /** Metas (SLO) para acompanhamento; so as de cima viram alerta. */
  targets: {
    heartbeatTicksOkPct30d: 99,
    errorRateMaxPct: 2,
    rate429MaxPct: 0.5,
    fresh95PctWithin: '6 h (hoje) -> 2 h (T1) -> 15 min (T0 vigiados) apos medir a cota',
    dayCloseOnTimePct: 99,
    volumeVsMedian7dMinPct: 70,
  },
} as const;
