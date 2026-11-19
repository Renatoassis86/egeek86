// HIERARQUIA DA VITRINE (dono, 2026-11-19: "criterio robusto de hierarquizacao dos produtos nos tipos de destaque do site; todos os produtos coletados vao para
// a vitrine, sem perder nenhum produto ATIVO, retirando so os inativos"). Modulo PURO (sem banco, sem rede): so ORDENA; nunca remove, nunca recalcula
// preco, media ou selo (usa o que as consultas ja devolvem). Regras internas: este arquivo e o Guia; nada daqui aparece no front.
//
// PONTUACAO (0..1), soma ponderada de componentes normalizados:
//   qualidade  0,40  queda real vs MEDIA (so veredito "abaixo", sem baixa confianca; satura em 40%) 65% + proximidade/igualdade ao MENOR registrado 35%.
//                    Sem historico elegivel = 0 (nao inventa desconto). Queda >= 60% = suspeita de preco-isca (R-61): vira isca.
//   popularidade 0,25 offer_popularity (mais vendidos/ranking), score 0..1 DENTRO da fonte (R-103); sem sinal = 0 (so fica atras de quem tem).
//   confianca  0,20  vendedor ok 1, sem dado 0,5, reputacao baixa 0; baixa confianca (preco muito disperso) multiplica por 0,3.
//   frescor    0,15  leitura recente 1 ate 60 min; depois 1/(1+(min-60)/720). Sem carimbo = 0,3. NAO expira item (R-90): so ordena.
//   ISCA: o score inteiro vira 5% (vai para o fim, continua na lista).
//
// DIVERSIDADE (guloso por deficit, round-robin de fato): a cada posicao escolhe o item de maior `score - penalidade`, onde
//   penalidade = 0,10 x (ja no topo do mesmo TIPO) + 0,05 x MARCA + 0,04 x LOJA + 0,08 x FAMILIA (3 primeiras palavras do nome),
//   mais teto de TIPO no top-N (35%, arredondado para cima): acima do teto so entra se nao houver outro candidato (sem prender: lista de tipo unico segue inteira).
// Ordenacao estavel e deterministica: empate por score, depois id (menor primeiro). Janela gulosa = JANELA itens; o resto segue por score.

export const PESOS = { qualidade: 0.4, popularidade: 0.25, confianca: 0.2, frescor: 0.15 } as const;
export const PENALIDADE = { tipo: 0.1, marca: 0.05, loja: 0.04, familia: 0.08 } as const;
export const TOPO_N = 20;
export const TETO_TIPO_PCT = 0.35;
export const JANELA = 100;
export const QUEDA_SATURA_PCT = 40;
export const ISCA_QUEDA_PCT = 60;
export const ISCA_FATOR = 0.05;
const TETO_ESTOURADO = 10; // penalidade "quase proibitiva": so cede se nao ha alternativa

export type TierVendedor = 'ok' | 'unverified' | 'low';

export interface ItemHierarquia {
  id: string;
  /** Tipo efetivo para diversidade (ex.: 'game:ps5', 'acc:controle', 'tecnologia:mouse'). null = neutro. */
  tipo: string | null;
  marca: string | null;
  loja: string | null;
  familia: string | null;
  /** 0..1 dentro da fonte (offer_popularity.score); 0 sem sinal. */
  popularidade: number;
  /** % abaixo da media unica (positivo), so quando o veredito e "abaixo" e sem baixa confianca; null caso contrario. */
  quedaMediaPct: number | null;
  /** menor registrado / preco atual (0..1, 1 = no menor), so com historico elegivel; null sem. */
  proximidadeMinimo: number | null;
  noMenorRegistrado: boolean;
  baixaConfianca: boolean;
  /** Queda bruta contra a media (positivo), mesmo rebaixada, para flagrar preco-isca. null sem media. */
  quedaBrutaPct: number | null;
  vendedor: TierVendedor | null;
  /** Idade da leitura do preco em minutos. null = sem carimbo. */
  idadeMin: number | null;
}

export interface Componentes {
  qualidade: number;
  popularidade: number;
  confianca: number;
  frescor: number;
  isca: boolean;
  score: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r4 = (x: number) => Math.round(x * 10000) / 10000;

export function ehIsca(i: ItemHierarquia): boolean {
  return i.quedaBrutaPct != null && i.quedaBrutaPct >= ISCA_QUEDA_PCT;
}

export function pontuar(i: ItemHierarquia): Componentes {
  const isca = ehIsca(i);
  const queda = i.quedaMediaPct != null && !i.baixaConfianca ? clamp01(i.quedaMediaPct / QUEDA_SATURA_PCT) : 0;
  const minimo = i.noMenorRegistrado ? 1 : i.proximidadeMinimo != null ? clamp01((i.proximidadeMinimo - 0.75) / 0.25) : 0;
  const qualidade = r4(0.65 * queda + 0.35 * minimo);
  const popularidade = r4(clamp01(i.popularidade));
  const base = i.vendedor === 'ok' ? 1 : i.vendedor === 'low' ? 0 : 0.5;
  const confianca = r4(base * (i.baixaConfianca ? 0.3 : 1));
  const frescor = r4(i.idadeMin == null || !Number.isFinite(i.idadeMin) ? 0.3 : 1 / (1 + Math.max(0, i.idadeMin - 60) / 720));
  let score = PESOS.qualidade * qualidade + PESOS.popularidade * popularidade + PESOS.confianca * confianca + PESOS.frescor * frescor;
  if (isca) score *= ISCA_FATOR;
  return { qualidade, popularidade, confianca, frescor, isca, score: r4(score) };
}

const inc = (m: Map<string, number>, k: string | null) => {
  if (k) m.set(k, (m.get(k) ?? 0) + 1);
};
const get = (m: Map<string, number>, k: string | null) => (k ? (m.get(k) ?? 0) : 0);

export interface OpcoesHierarquia {
  topoN?: number;
  janela?: number;
  tetoTipoPct?: number;
}

/**
 * Reordena SEM perder item: a saida e uma permutacao da entrada (garantido por construcao e conferido). `ler` extrai os sinais de cada item.
 * Deterministico: mesma entrada em qualquer ordem inicial produz a mesma saida (desempate por id).
 */
export function hierarquizar<T>(itens: readonly T[], ler: (t: T) => ItemHierarquia, opts: OpcoesHierarquia = {}): T[] {
  const topoN = opts.topoN ?? TOPO_N;
  const janela = Math.min(opts.janela ?? JANELA, itens.length);
  const teto = Math.max(1, Math.ceil(topoN * (opts.tetoTipoPct ?? TETO_TIPO_PCT)));
  const base = itens.map((t) => {
    const h = ler(t);
    return { t, h, s: pontuar(h).score };
  });
  base.sort((a, b) => b.s - a.s || (a.h.id < b.h.id ? -1 : a.h.id > b.h.id ? 1 : 0));
  const cT = new Map<string, number>();
  const cM = new Map<string, number>();
  const cL = new Map<string, number>();
  const cF = new Map<string, number>();
  const saida: T[] = [];
  const resto = base.slice();
  while (saida.length < janela && resto.length) {
    let bi = 0;
    let bv = -Infinity;
    for (let i = 0; i < resto.length; i++) {
      const { h, s } = resto[i];
      let pen = PENALIDADE.tipo * get(cT, h.tipo) + PENALIDADE.marca * get(cM, h.marca) + PENALIDADE.loja * get(cL, h.loja) + PENALIDADE.familia * get(cF, h.familia);
      if (saida.length < topoN && h.tipo && get(cT, h.tipo) >= teto) pen += TETO_ESTOURADO;
      const v = s - pen;
      if (v > bv) {
        bv = v;
        bi = i;
      } // empate de v: fica o primeiro (ja ordenado por score, id)
    }
    const [it] = resto.splice(bi, 1);
    saida.push(it.t);
    inc(cT, it.h.tipo);
    inc(cM, it.h.marca);
    inc(cL, it.h.loja);
    inc(cF, it.h.familia);
  }
  for (const r of resto) saida.push(r.t);
  if (saida.length !== itens.length) throw new Error('hierarquizar: perdeu ou duplicou item (violaria "nenhum ativo some")');
  return saida;
}

/** VITRINE_HIERARQUIA=off/0/false volta a ordem de antes (sem deploy). Padrao: ligado. */
export function hierarquiaLigada(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.VITRINE_HIERARQUIA ?? '').trim());
}

/** Quantos tipos / marcas / lojas distintos existem nos N primeiros (medidor da prova e de monitoramento). */
export function diversidadeNoTopo(itens: readonly ItemHierarquia[], n = TOPO_N): { n: number; tipos: number; marcas: number; lojas: number; topoTipoPct: number } {
  const top = itens.slice(0, n);
  const cnt = new Map<string, number>();
  for (const i of top) if (i.tipo) cnt.set(i.tipo, (cnt.get(i.tipo) ?? 0) + 1);
  const max = cnt.size ? Math.max(...cnt.values()) : 0;
  return {
    n: top.length,
    tipos: new Set(top.map((i) => i.tipo).filter(Boolean)).size,
    marcas: new Set(top.map((i) => i.marca).filter(Boolean)).size,
    lojas: new Set(top.map((i) => i.loja).filter(Boolean)).size,
    topoTipoPct: top.length ? Math.round((max / top.length) * 100) : 0,
  };
}
