/**
 * TIPO DE PRECO DA AMAZON (Fluxo Mestre R-69, dono, 2026-11-16). PURO (sem banco, sem rede): usado pelo ingest, pelo medidor e pelos testes.
 *
 * Caso fundador (P2S Combo B0G87M7V8Z): "Queda de preco R$ 8.074,90 (era R$ 8.499,90, queda de 5%)". NAO foi queda: o card da Amazon mostra o
 * preco "a vista no Pix" (8.074,90 = 8.499,90 x 0,95) em destaque quando a promocao Pix aparece, e o preco CHEIO (8.499,90) quando nao aparece.
 * O leitor gravava os dois como "o preco" e o sistema chamava a diferenca de queda/alta.
 *
 * ANATOMIA DO CARD (lida na pagina real, 2026-11-16):
 *   com Pix : <a-price> R$ 9.499,05 </a-price> <a-price a-text-price> R$ 9.999,00 </a-price> "a vista no Pix e NuPay ..." "ou em ate 12x de" <a-text-price> R$ 933,24
 *             -> 1o = preco Pix (destaque); 2o (sem "De:") = preco CHEIO do qual o Pix e calculado (9.999 x 0,95 = 9.499,05); 3o = parcela.
 *   promocao: <a-price> R$ 8.459,10 </a-price> "De:" <a-text-price> R$ 9.999,00 </a-text-price> ... sem texto de Pix -> o destaque e o preco de venda
 *             (cheio, ja promocional); a lista e o preco "De".
 *   sem lista: <a-price> R$ 8.499,90 </a-price> "em ate 12x de" <a-text-price> R$ 793,32 -> a unica a-text-price e a PARCELA (sempre menor que o preco).
 *
 * DEFINICAO UNICA: o preco de referencia da Amazon (price_cents) e SEMPRE o preco CHEIO (o que vale sem a forma de pagamento Pix); o preco a vista
 * no Pix e ATRIBUTO (pix_cents), nunca o preco da serie. Assim a serie de uma oferta tem um unico tipo e mudanca de tipo nunca vira queda/alta.
 */

export type TipoPrecoAmazon = 'cheio' | 'a_vista_pix';

/** Faixa de desconto Pix aceita (razao pix/cheio). Fora dela a leitura nao e confiavel e NAO e gravada. */
export const PIX_RAZAO_MIN = 0.7;
export const PIX_RAZAO_MAX = 0.9995;
/** Tolerancia para dizer que um preco e "o mesmo" que outro (0,5%). */
export const MESMO_PRECO_TOL = 0.005;

export interface EntradaPrecoAmazon {
  /** Preco em destaque do card/pagina (centavos). */
  pCents: number;
  /** Segundo preco do card (a-text-price que nao e parcela), se houver. */
  lCents?: number | null;
  /** O texto do card/bloco diz "a vista no Pix" junto do preco: true/false; undefined = leitor antigo, que nao informa. */
  px?: boolean | null;
  /** Preco cheio vigente da oferta (ultima cotacao gravada). So usado para inferir o tipo quando o leitor e antigo (px indefinido). */
  cheioAnteriorCents?: number | null;
}

export type PrecoAmazonDefinido =
  | { ok: true; cheioCents: number; pixCents: number | null; listaCents: number | null; tipoLido: TipoPrecoAmazon; inferido: boolean }
  | { ok: false; motivo: 'pix_sem_cheio' | 'pix_razao_atipica' | 'preco_invalido' };

const mesmo = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * MESMO_PRECO_TOL;

export function razaoPixValida(pix: number, cheio: number): boolean {
  if (!(pix > 0) || !(cheio > pix)) return false;
  const r = pix / cheio;
  return r >= PIX_RAZAO_MIN && r <= PIX_RAZAO_MAX;
}

/** Decide preco cheio, preco Pix e lista a partir da leitura do card. Nunca inventa valor: Pix sem cheio legivel e recusado. */
export function definirPrecoAmazon(e: EntradaPrecoAmazon): PrecoAmazonDefinido {
  const p = e.pCents;
  if (!Number.isInteger(p) || p <= 0) return { ok: false, motivo: 'preco_invalido' };
  const l = e.lCents != null && Number.isInteger(e.lCents) && e.lCents > p ? e.lCents : null; // parcela e sempre menor que o preco: nunca e lista
  let pix: boolean | null = e.px === true ? true : e.px === false ? false : null;
  let inferido = false;
  if (pix == null) {
    // Leitor antigo (sem a marca): so se afirma Pix com PROVA da propria oferta: a lista do card e o preco cheio que a oferta ja tinha, e a razao e de Pix.
    if (l != null && e.cheioAnteriorCents && mesmo(l, e.cheioAnteriorCents) && razaoPixValida(p, l)) { pix = true; inferido = true; } else pix = false;
  }
  if (pix) {
    if (l == null) return { ok: false, motivo: 'pix_sem_cheio' };
    if (!razaoPixValida(p, l)) return { ok: false, motivo: 'pix_razao_atipica' };
    return { ok: true, cheioCents: l, pixCents: p, listaCents: null, tipoLido: 'a_vista_pix', inferido };
  }
  return { ok: true, cheioCents: p, pixCents: null, listaCents: l, tipoLido: 'cheio', inferido: false };
}

/**
 * Queda/alta so existe entre leituras do MESMO tipo de preco (e do mesmo anuncio). Como a serie da Amazon e sempre `cheio`, isto e
 * verdadeiro entre cotacoes novas; contra cotacao legada (sem tipo) so vale se a razao nao tem a assinatura de troca Pix x cheio.
 */
export function mesmaBaseDePreco(a: { tipo?: TipoPrecoAmazon | null; cents: number }, b: { tipo?: TipoPrecoAmazon | null; cents: number }): boolean {
  if (a.tipo && b.tipo) return a.tipo === b.tipo;
  return !assinaturaTrocaPixCheio(a.cents, b.cents);
}

/** Dois precos consecutivos com cara de troca Pix x cheio: razao entre 0,70 e 0,9995 e (0,95 ou 0,90 com tolerancia de 0,3 ponto) OU igual a lista do outro. */
export function assinaturaTrocaPixCheio(x: number, y: number, listaDoMenor?: number | null): boolean {
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  if (!(lo > 0)) return false;
  const r = lo / hi;
  if (r < PIX_RAZAO_MIN || r > PIX_RAZAO_MAX) return false;
  if (listaDoMenor != null && listaDoMenor > 0 && mesmo(listaDoMenor, hi)) return true;
  return [0.95, 0.9].some((k) => Math.abs(r - k) <= 0.003);
}

export function tipoPrecoAmazonLigado(env: Record<string, string | undefined> = process.env): boolean {
  return (env.AMAZON_TIPO_PRECO ?? '').toLowerCase() !== 'off';
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// HISTORICO: reconhecer, na serie ja gravada de UMA oferta, as cotacoes que eram preco "a vista no Pix" (o leitor antigo nao guardava o tipo).
// So se corrige com PROVA da propria serie; sem prova a cotacao fica como esta e entra no relatorio como ambigua.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export interface CotacaoSerie { id: number | string; p: number; l: number | null; at: number }
export interface ClassificacaoSerie {
  /** Cotacoes provadas "a vista no Pix": preco cheio = lista; o preco gravado vira pixCents. */
  provadas: { id: CotacaoSerie['id']; pixCents: number; cheioCents: number }[];
  /** Tem a forma de Pix (lista = preco anterior da oferta, razao de Pix) mas falta prova de alternancia (pode ser promocao real em curso). */
  ambiguas: CotacaoSerie['id'][];
}

/**
 * Prova (duas condicoes): (A) a cotacao tem lista > preco com razao de Pix (0,74 a 0,9501) e a cotacao ANTERIOR da oferta e igual a essa lista (o preco
 * cheio ja era o da oferta); (B) a cotacao SEGUINTE volta ao cheio (igual a lista) OU a oferta tem outra cotacao com a mesma assinatura (alternancia
 * repetida). Promocao real tem o mesmo desenho em (A) mas segue baixa (nao volta, nao alterna): fica "ambigua", nunca corrigida.
 */
export function classificarSerieAmazon(serie: CotacaoSerie[]): ClassificacaoSerie {
  const a = [...serie].sort((x, y) => x.at - y.at || Number(x.id) - Number(y.id));
  const forma: number[] = [];
  for (let i = 1; i < a.length; i++) {
    const x = a[i];
    if (x.l && x.l > x.p) {
      const r = x.p / x.l;
      if (r >= 0.74 && r <= 0.9501 && mesmo(a[i - 1].p, x.l)) forma.push(i);
    }
  }
  const provadas: ClassificacaoSerie['provadas'] = [];
  const ambiguas: CotacaoSerie['id'][] = [];
  for (const i of forma) {
    const x = a[i];
    const volta = a[i + 1] != null && mesmo(a[i + 1].p, x.l as number);
    if (volta || forma.length >= 2) provadas.push({ id: x.id, pixCents: x.p, cheioCents: x.l as number });
    else ambiguas.push(x.id);
  }
  // (C) Card com "De:" e Pix juntos: a lista e o preco antigo, nao o cheio. Prova por retorno exato: A -> X -> A com X = A x 0,95 ou x 0,90 (+-0,3 ponto).
  for (let i = 1; i < a.length - 1; i++) {
    const x = a[i];
    const y1 = a[i - 1];
    const y2 = a[i + 1];
    if (provadas.some((p) => p.id === x.id) || !(y1.p > x.p) || !mesmo(y1.p, y2.p)) continue;
    const r = x.p / y1.p;
    if (r >= 0.74 && r <= 0.9501 && [0.95, 0.9].some((k) => Math.abs(r - k) <= 0.003)) {
      provadas.push({ id: x.id, pixCents: x.p, cheioCents: y1.p });
      const k = ambiguas.indexOf(x.id);
      if (k >= 0) ambiguas.splice(k, 1);
    }
  }
  return { provadas, ambiguas };
}
