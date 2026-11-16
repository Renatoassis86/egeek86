/**
 * GATILHO PERMANENTE DE PRECO-ISCA (dono, 2026-11-16; Fluxo Mestre R-61). Pura (sem banco, sem server-only): serve ao coletor, as consultas SQL
 * (via o mesmo limiar), aos testes, ao medidor e ao dry-run historico. Vale para TODA rede e TODO item (nada aqui conhece rede, loja ou produto).
 *
 * Preco-isca = cotacao de um anuncio muito abaixo do preco dos OUTROS anuncios do MESMO produto (master). Nao e queda do mesmo anuncio (essa
 * comparacao nao tem teto de 50%; aqui se compara com os demais anuncios). Caso fundador: PS5 Slim Digital, anuncio isca a R$ 1.999,99 contra
 * mediana de mercado ~R$ 4.900; placeholders do catalogo herdaram o menor preco e gravaram 102 cotacoes falsas.
 *
 * Criterio: preco < RAZAO_MAX x mediana (por vendedor) dos precos dos outros anuncios do master COM vendedor identificado, vigentes e fora de
 * quarentena, desde que haja pelo menos MIN_VENDEDORES vendedores distintos como referencia. Placeholders (sem seller_id) nunca servem de
 * referencia, mas SAO julgados (herdam o menor preco). Sem referencia suficiente, nao julga (media provisoria aceita; nao rebaixa rotulo).
 * Flag GATILHO_PRECO_ISCA: '0' desliga; qualquer outro valor (padrao) liga.
 */

/** Limiar e minimo de vendedores (medidos em 2026-11-16, ver docs; ajustar so com nova medicao). */
export const ISCA_RAZAO_MAX = 0.5;
export const ISCA_MIN_VENDEDORES = 3;
/** 2o degrau (desligado por padrao): abaixo de RAZAO_ALTA x mediana E mais de (1 - FOLGA_MIN) abaixo do MENOR dos outros vendedores (isola a isca sem pegar promocao em linha com o mercado). */
export const ISCA_RAZAO_ALTA = 0.5; // = RAZAO_MAX: degrau DESLIGADO. Medido 2026-11-16: ligar em 0.6 acrescenta 538 oferta-dias, a maioria com cara de promocao real de jogo (ex.: Dead Space PS5 R$ 199,99 vs mediana R$ 362 e menor outro R$ 260)
export const ISCA_FOLGA_MIN = 0.8;
/** Janela (dias) de referencia: cotacao de outro anuncio so serve se foi vista ate N dias antes do preco julgado. */
export const ISCA_JANELA_REF_DIAS = 3;
export const ISCA_MOTIVO = 'preco_isca_abaixo_dos_outros_anuncios';

export const gatilhoIscaLigado = (env: Record<string, string | undefined> = process.env): boolean => env.GATILHO_PRECO_ISCA !== '0';

export interface ReferenciaIsca {
  priceCents: number;
  /** Identidade do vendedor do anuncio de referencia: seller_id ou, em rede sem vendedor cadastrado, 'loja:<rede>:<nome>' (R-73); null = placeholder de catalogo (ignorado). */
  sellerId: string | null;
}

export interface VereditoIsca {
  isca: boolean;
  /** 'forte' = abaixo de RAZAO_MAX x mediana; 'isolada' = 2o degrau (abaixo de RAZAO_ALTA e bem abaixo do menor dos outros). */
  degrau: 'forte' | 'isolada' | null;
  medianaCents: number | null;
  menorOutroCents: number | null;
  vendedores: number;
  /** preco / mediana (null sem referencia suficiente). */
  razao: number | null;
}

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Mediana dos precos por vendedor (cada vendedor vale um voto, pela mediana dos seus proprios anuncios). */
export function medianaPorVendedor(refs: ReferenciaIsca[]): { medianaCents: number | null; menorCents: number | null; vendedores: number } {
  const por = new Map<string, number[]>();
  for (const r of refs) {
    if (!r.sellerId || !Number.isFinite(r.priceCents) || r.priceCents <= 0) continue;
    (por.get(r.sellerId) ?? por.set(r.sellerId, []).get(r.sellerId)!).push(r.priceCents);
  }
  if (!por.size) return { medianaCents: null, menorCents: null, vendedores: 0 };
  const precos = [...por.values()].map(mediana);
  return { medianaCents: mediana(precos), menorCents: Math.min(...precos), vendedores: por.size };
}

export function avaliarIsca(priceCents: number, refs: ReferenciaIsca[], cfg: { razaoMax?: number; minVendedores?: number; razaoAlta?: number; folgaMin?: number } = {}): VereditoIsca {
  const razaoMax = cfg.razaoMax ?? ISCA_RAZAO_MAX;
  const razaoAlta = cfg.razaoAlta ?? ISCA_RAZAO_ALTA;
  const folga = cfg.folgaMin ?? ISCA_FOLGA_MIN;
  const minV = cfg.minVendedores ?? ISCA_MIN_VENDEDORES;
  const { medianaCents, menorCents, vendedores } = medianaPorVendedor(refs);
  const vazio = { isca: false, degrau: null, medianaCents, menorOutroCents: menorCents, vendedores, razao: null } as VereditoIsca;
  if (!Number.isFinite(priceCents) || priceCents <= 0 || medianaCents == null || menorCents == null || vendedores < minV) return vazio;
  const razao = priceCents / medianaCents;
  const degrau = razao < razaoMax ? 'forte' : razao < razaoAlta && priceCents < menorCents * folga ? 'isolada' : null;
  return { isca: degrau != null, degrau, medianaCents, menorOutroCents: menorCents, vendedores, razao };
}
