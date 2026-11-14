// Modelo em MODO SOMBRA do preço da mensagem (2026-11-14). PURO: sem banco, sem rede, sem 'server-only'.
//
// Pergunta que o modelo responde: "esta mensagem tem risco de NÃO sobreviver à checagem de preço" (preço da mensagem diferente do
// do anúncio, preço velho, anúncio que sumiu ou mudou)? Origem: docs/investigacao-preco-mensagem-vs-site-2026-11-14.md e o treino em
// scripts/ml-preco-mensagem/treinar.ts (relatório com os números reais em docs/ml/preco-mensagem-2026-11-14.md).
//
// REGRA DE OURO: o score só é REGISTRADO (candidate.mlSombra). NUNCA bloqueia, reordena nem altera mensagem. Flag GROUP_ML_SOMBRA=on/off.
//
// As mesmas funções montam os atributos no treino (a partir do banco) e na produção (a partir da fila): só dependem das entradas abaixo.

import { avaliarOscilacao, type PricePoint } from '@/lib/messaging/price-guard';
import modeloJson from '@/lib/messaging/ml-preco-modelo.json';

export interface EntradaML {
  /** Preço da mensagem (centavos). */
  priceCents: number;
  /** Média de referência (centavos) ou null. */
  avgCents: number | null;
  networkSlug: string;
  trigger: string;
  /** Instante da decisão (criação da mensagem no treino; agora na produção). */
  at: Date;
  /** Snapshots de preço da oferta (qualquer ordem); só os com `at` <= instante da decisão contam. Ideal: últimas 48 h + o anterior. */
  points: PricePoint[];
  /** Preço de lista do último snapshot (centavos) ou null. */
  listPriceCents: number | null;
  /** Anúncio identificado de forma confiável (external_item_id ou id MLB na URL). */
  listingIdTrusted: boolean;
  /** Vendas totais do vendedor ou null. */
  sellerTotalSales: number | null;
  /** Reputação verde do vendedor (nível máximo) ou null se desconhecida. */
  sellerRepVerde: boolean | null;
}

export const FEATURE_NAMES = [
  'trocas6h',
  'trocas24h',
  'trocas48h',
  'amplitude24h_pct',
  'distintos24h',
  'oscilando',
  'ml_sem_id_anuncio',
  'idade_ultimo_snapshot_log',
  'tem_lista',
  'razao_preco_lista',
  'sem_media',
  'desconto_media_pct',
  'ticket_log10',
  'rede_ml',
  'rede_shopee',
  'rede_amazon',
  'hora_sin',
  'hora_cos',
  'gatilho_g2',
  'gatilho_ac',
  'vendas_log',
  'rep_verde',
  'rep_desconhecida',
] as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Vetor de atributos na ordem de FEATURE_NAMES. Determinístico: mesma entrada, mesma saída. */
export function extrairFeatures(e: EntradaML): number[] {
  const t = e.at.getTime();
  const pts = e.points.filter((p) => p.at.getTime() <= t);
  const o6 = avaliarOscilacao(pts, e.at, { windowHours: 6 });
  const o24 = avaliarOscilacao(pts, e.at, { windowHours: 24 });
  const o48 = avaliarOscilacao(pts, e.at, { windowHours: 48 });
  const ultimo = pts.length ? Math.max(...pts.map((p) => p.at.getTime())) : null;
  const idadeMin = ultimo == null ? 7 * 24 * 60 : clamp((t - ultimo) / 60_000, 0, 7 * 24 * 60);
  const net = e.networkSlug.toLowerCase();
  const ml = /mercado/.test(net);
  const shopee = /shopee/.test(net);
  const amazon = /amazon/.test(net);
  const temLista = e.listPriceCents != null && e.listPriceCents > 0 && e.priceCents > 0;
  const semMedia = e.avgCents == null || e.avgCents <= 0;
  const hora = e.at.getUTCHours() + e.at.getUTCMinutes() / 60;
  return [
    o6.trocas,
    o24.trocas,
    o48.trocas,
    clamp(o24.amplitudePct, 0, 100),
    o24.distintos,
    o24.oscilando ? 1 : 0,
    ml && !e.listingIdTrusted ? 1 : 0,
    Math.log1p(idadeMin),
    temLista ? 1 : 0,
    temLista ? clamp(e.priceCents / (e.listPriceCents as number), 0, 2) : 0,
    semMedia ? 1 : 0,
    semMedia ? 0 : clamp(((e.avgCents as number) - e.priceCents) / (e.avgCents as number) * 100, -50, 90),
    Math.log10(Math.max(1, e.priceCents / 100)),
    ml ? 1 : 0,
    shopee ? 1 : 0,
    amazon ? 1 : 0,
    Math.sin((2 * Math.PI * hora) / 24),
    Math.cos((2 * Math.PI * hora) / 24),
    e.trigger === 'G2' ? 1 : 0,
    e.trigger === 'AC' ? 1 : 0,
    e.sellerTotalSales != null && e.sellerTotalSales > 0 ? Math.log10(e.sellerTotalSales) : 0,
    e.sellerRepVerde === true ? 1 : 0,
    e.sellerRepVerde == null ? 1 : 0,
  ];
}

export interface MetricasModelo {
  tipoRotulo: string;
  treino: number;
  teste: number;
  positivosTreino: number;
  positivosTeste: number;
  apTeste: number | null;
  aucTeste: number | null;
  precisaoNoLimiar: number | null;
  recallNoLimiar: number | null;
}

export type Modelo =
  | {
      versao: string;
      tipo: 'logistica';
      nomes: string[];
      media: number[];
      desvio: number[];
      pesos: number[];
      vies: number;
      limiar: number;
      treinadoEm: string | null;
      metricas: MetricasModelo | null;
    }
  | {
      versao: string;
      tipo: 'stumps';
      nomes: string[];
      base: number;
      taxa: number;
      arvores: Array<{ f: number; t: number; esq: number; dir: number }>;
      limiar: number;
      treinadoEm: string | null;
      metricas: MetricasModelo | null;
    }
  | { versao: string; tipo: 'nenhum'; treinadoEm: null };

const sigmoid = (z: number) => 1 / (1 + Math.exp(-clamp(z, -30, 30)));

/** Probabilidade [0,1] de a mensagem não sobreviver à checagem de preço. null = sem modelo treinado ou vetor incompatível. */
export function pontuar(m: Modelo, x: number[]): number | null {
  if (m.tipo === 'nenhum') return null;
  if (x.length !== m.nomes.length) return null;
  if (m.tipo === 'logistica') {
    let z = m.vies;
    for (let i = 0; i < x.length; i++) z += ((x[i]! - m.media[i]!) / (m.desvio[i]! || 1)) * m.pesos[i]!;
    return sigmoid(z);
  }
  let z = m.base;
  for (const a of m.arvores) z += m.taxa * (x[a.f]! <= a.t ? a.esq : a.dir);
  return sigmoid(z);
}

export const MODELO: Modelo = modeloJson as unknown as Modelo;

export interface ScoreSombra {
  /** Versão do modelo que pontuou. */
  v: string;
  /** Probabilidade (0 a 1) de a mensagem não sobreviver à checagem de preço. */
  p: number;
  /** p >= limiar do modelo (apenas informativo; nada é bloqueado). */
  alto: boolean;
  /** Quando foi pontuado. */
  em: string;
}

/** Flag GROUP_ML_SOMBRA (padrão desligada). */
export function mlSombraAtivo(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GROUP_ML_SOMBRA ?? 'off').trim().toLowerCase() === 'on';
}

/** Pontua a entrada com o modelo carregado e devolve o registro de sombra; null se não houver modelo. Nunca lança. */
export function scoreSombra(e: EntradaML, modelo: Modelo = MODELO, agora: Date = new Date()): ScoreSombra | null {
  try {
    const p = pontuar(modelo, extrairFeatures(e));
    if (p == null || modelo.tipo === 'nenhum') return null;
    return { v: modelo.versao, p: Math.round(p * 10_000) / 10_000, alto: p >= modelo.limiar, em: agora.toISOString() };
  } catch {
    return null;
  }
}
