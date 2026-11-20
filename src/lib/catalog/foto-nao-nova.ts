// R-108: modelo de leitura de foto para "jogo/console nao novo" (mao na foto, jogo em pilha). PURO (sem rede, sem banco, sem sharp):
// recebe pixels RGB ja reduzidos (N x N) e devolve variaveis; pontua por regressao logistica + regras duras; classifica em faixas.
// O modelo NUNCA apaga nem desbloqueia: so sugere marca (alto) ou lista para o dono (medio). Ver docs/modelo-foto-nao-nova.md.

export const FOTO_NAO_NOVA_VERSAO = 1;
export const LADO_PADRAO = 96;

export interface FotoFeatures {
  /** Fracao de pixels cor de pele (YCbCr) na imagem toda. */
  pele: number;
  /** Fracao de pele no centro (50% central). */
  peleCentro: number;
  /** Maior mancha conexa de pele / total de pixels. */
  peleMancha: number;
  /** Fracao da borda (anel externo) quase branca e sem cor: foto de loja/estudio. */
  bordaBranca: number;
  /** Desvio-padrao medio da luminancia na borda (fundo uniforme = baixo). */
  bordaDesvio: number;
  /** Densidade de bordas (gradiente medio normalizado): cena cheia/bagunca = alto. */
  densidadeBordas: number;
  /** Saturacao media 0..1. */
  saturacao: number;
  /** Entropia (0..1) do histograma 4x4x4: cena variada (varias capas/ambiente) = alto. */
  entropiaCor: number;
  /** Razao largura/altura original (1 = quadrada). */
  aspecto: number;
  /** Lado menor original em pixels / 1000, limitado a 2. */
  resolucao: number;
}

export const NOMES_FEATURES: (keyof FotoFeatures)[] = ['pele', 'peleCentro', 'peleMancha', 'bordaBranca', 'bordaDesvio', 'densidadeBordas', 'saturacao', 'entropiaCor', 'aspecto', 'resolucao'];

function lum(r: number, g: number, b: number): number { return 0.299 * r + 0.587 * g + 0.114 * b; }

/** Pixel de pele pela regra clássica em YCbCr (Chai e Ngan): 77<=Cb<=127, 133<=Cr<=173, com piso de luminancia. */
export function ehPele(r: number, g: number, b: number): boolean {
  const y = lum(r, g, b);
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > g && r > b;
}

/** `rgb` = lado*lado*3 bytes (RGB, linha a linha). `orig` = dimensoes da imagem original. */
export function extrairFeatures(rgb: Uint8Array | number[], lado: number, orig: { w: number; h: number }): FotoFeatures {
  const n = lado * lado;
  if (rgb.length < n * 3) throw new Error('buffer menor que lado*lado*3');
  const pele = new Uint8Array(n);
  const L = new Float64Array(n);
  let peleTot = 0, peleCen = 0, nCen = 0, satSoma = 0;
  const hist = new Array<number>(64).fill(0);
  const c0 = Math.floor(lado * 0.25), c1 = Math.ceil(lado * 0.75);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const i = y * lado + x, o = i * 3;
      const r = rgb[o]!, g = rgb[o + 1]!, b = rgb[o + 2]!;
      L[i] = lum(r, g, b);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      satSoma += mx === 0 ? 0 : (mx - mn) / mx;
      hist[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)]!++;
      const p = ehPele(r, g, b) ? 1 : 0;
      pele[i] = p;
      peleTot += p;
      if (x >= c0 && x < c1 && y >= c0 && y < c1) { nCen++; peleCen += p; }
    }
  }
  // maior mancha conexa de pele (4-vizinhos, pilha iterativa)
  const vis = new Uint8Array(n);
  let maior = 0;
  const pilha: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!pele[s] || vis[s]) continue;
    let tam = 0;
    pilha.push(s); vis[s] = 1;
    while (pilha.length) {
      const i = pilha.pop()!;
      tam++;
      const x = i % lado, y = (i / lado) | 0;
      if (x > 0 && pele[i - 1] && !vis[i - 1]) { vis[i - 1] = 1; pilha.push(i - 1); }
      if (x < lado - 1 && pele[i + 1] && !vis[i + 1]) { vis[i + 1] = 1; pilha.push(i + 1); }
      if (y > 0 && pele[i - lado] && !vis[i - lado]) { vis[i - lado] = 1; pilha.push(i - lado); }
      if (y < lado - 1 && pele[i + lado] && !vis[i + lado]) { vis[i + lado] = 1; pilha.push(i + lado); }
    }
    if (tam > maior) maior = tam;
  }
  // borda: anel de 4 px
  const anel = Math.max(2, Math.round(lado / 24));
  let nb = 0, brancos = 0, somaL = 0, somaL2 = 0;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if (x >= anel && x < lado - anel && y >= anel && y < lado - anel) continue;
      const o = (y * lado + x) * 3;
      const r = rgb[o]!, g = rgb[o + 1]!, b = rgb[o + 2]!;
      const l = L[y * lado + x]!;
      nb++; somaL += l; somaL2 += l * l;
      if (l > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 28) brancos++;
    }
  }
  const mL = somaL / nb;
  const dp = Math.sqrt(Math.max(0, somaL2 / nb - mL * mL));
  // densidade de bordas (gradiente horizontal+vertical)
  let g = 0, ng = 0;
  for (let y = 0; y < lado - 1; y++) for (let x = 0; x < lado - 1; x++) {
    const i = y * lado + x;
    g += Math.abs(L[i]! - L[i + 1]!) + Math.abs(L[i]! - L[i + lado]!);
    ng++;
  }
  let ent = 0;
  for (const h of hist) if (h > 0) { const p = h / n; ent -= p * Math.log2(p); }
  const menor = Math.min(orig.w, orig.h);
  return {
    pele: peleTot / n,
    peleCentro: nCen ? peleCen / nCen : 0,
    peleMancha: maior / n,
    bordaBranca: brancos / nb,
    bordaDesvio: dp / 128,
    densidadeBordas: g / ng / 255,
    saturacao: satSoma / n,
    entropiaCor: ent / 6,
    aspecto: orig.h > 0 ? orig.w / orig.h : 1,
    resolucao: Math.min(2, menor / 1000),
  };
}

/** dHash de 64 bits (9x8 em luminancia) a partir de um RGB 9x8; devolve string hex de 16 chars. */
export function dHash(rgb9x8: Uint8Array | number[]): string {
  if (rgb9x8.length < 9 * 8 * 3) throw new Error('dHash espera 9x8 RGB');
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const a = (y * 9 + x) * 3, b = (y * 9 + x + 1) * 3;
    bits += lum(rgb9x8[a]!, rgb9x8[a + 1]!, rgb9x8[a + 2]!) > lum(rgb9x8[b]!, rgb9x8[b + 1]!, rgb9x8[b + 2]!) ? '1' : '0';
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function distanciaHash(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}

// ---------------------------------------------------------------------------------------------------------------- texto
export interface SinaisTexto { usado: boolean; lote: boolean; revendedor: boolean }

/** Sinais do titulo/vendedor. `usado` e `lote` sao duros; `revendedor` so soma ponto. */
export function sinaisTexto(titulo: string, vendedor = ''): SinaisTexto {
  const t = ` ${titulo} `.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const v = vendedor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return {
    usado: /\b(usado|usada|seminovo|semi novo|semi-novo|recondicionad|open box|retirada de pecas|com marcas de uso)\b/.test(t),
    lote: /\b(lote|colecao de jogos|kit com \d+ jogos|\d+ jogos|combo de jogos|pacote de jogos)\b/.test(t),
    revendedor: /\b(usados|games usados|seminovos|troca|sebo)\b/.test(v),
  };
}

// ------------------------------------------------------------------------------------------------------------- modelo
/** Regressao logistica sobre um vetor (embedding CLIP normalizado de 512 dimensoes). */
export interface ModeloLogistico {
  versao: number;
  encoder: string;
  dim: number;
  media: number[];
  desvio: number[];
  pesos: number[];
  vies: number;
  /** Limiares de pontuacao 0..1. */
  limiarAlto: number;
  limiarMedio: number;
  /** Metricas reais de validacao cruzada (informativo; gravadas no treino). */
  metricas?: Record<string, unknown>;
}

const sigmoide = (z: number) => 1 / (1 + Math.exp(-z));

export function normalizarVetor(v: ArrayLike<number>): number[] {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  n = Math.sqrt(n) || 1;
  return Array.from({ length: v.length }, (_, i) => v[i]! / n);
}

export function pontuarVetor(m: ModeloLogistico, v: number[]): number {
  if (v.length !== m.dim) throw new Error(`vetor com ${v.length} dimensoes; o modelo espera ${m.dim}`);
  let z = m.vies;
  for (let i = 0; i < m.dim; i++) z += m.pesos[i]! * ((v[i]! - m.media[i]!) / (m.desvio[i]! || 1));
  return sigmoide(z);
}

/** Regressao logistica com L2, gradiente em lote, entradas padronizadas. y: 1 = nao novo (mao). Determinista. */
export function treinarLogistico(X: number[][], y: number[], opts: { l2?: number; passos?: number; lr?: number } = {}): Pick<ModeloLogistico, 'media' | 'desvio' | 'pesos' | 'vies'> {
  const n = X.length, d = X[0]!.length;
  const l2 = opts.l2 ?? 0.1, passos = opts.passos ?? 800, lr = opts.lr ?? 0.5;
  const media = Array.from({ length: d }, (_, j) => X.reduce((s, r) => s + r[j]!, 0) / n);
  const desvio = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j]! - media[j]!) ** 2, 0) / n) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - media[j]!) / desvio[j]!));
  const pesos = new Array<number>(d).fill(0);
  let vies = 0;
  for (let p = 0; p < passos; p++) {
    const gw = new Array<number>(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = vies;
      for (let j = 0; j < d; j++) z += pesos[j]! * Z[i]![j]!;
      const e = sigmoide(z) - y[i]!;
      gb += e;
      for (let j = 0; j < d; j++) gw[j]! += e * Z[i]![j]!;
    }
    vies -= (lr * gb) / n;
    for (let j = 0; j < d; j++) pesos[j]! -= lr * (gw[j]! / n + l2 * pesos[j]!);
  }
  return { media, desvio, pesos, vies };
}

// --------------------------------------------------------------------------------------------------------- decisao final
export type Faixa = 'alto' | 'medio' | 'baixo';
export type MotivoFoto = 'foto_com_mao' | 'foto_com_varios_jogos';

export interface EntradaDecisao {
  /** Embedding CLIP da foto (normalizado ou nao); null = nao foi possivel ler a imagem (nunca marca). */
  embedding: ArrayLike<number> | null;
  /** Variaveis de imagem (regras auxiliares: fundo branco de estudio, mancha de pele). */
  features?: FotoFeatures;
  texto?: SinaisTexto;
  /** Distancia de Hamming (0..64) ate a capa oficial/foto de loja grande do mesmo produto; null = desconhecida. */
  distCapaOficial?: number | null;
  /** Numero de capas/caixas contadas na cena por classificador de visao opcional (null = nao medido). */
  capasNaCena?: number | null;
  /** Mao real vista por classificador de visao opcional (null = nao medido). */
  maoVisao?: boolean | null;
}

export interface SaidaFotoNaoNova {
  versao: number;
  pontuacao: number; // 0..1
  faixa: Faixa;
  motivo: MotivoFoto | null;
  /** Razoes legiveis, para o painel e o log. */
  razoes: string[];
  /** Regra dura acionada (se houver). */
  regraDura: string | null;
}

const CAPA_OFICIAL_MAX_BITS = 8;

/**
 * Ordem: (1) a foto igual a capa oficial/loja grande NUNCA marca (padrao seguro: arte de caixa tem mao ilustrada e e nova);
 * (2) regra dura de visao (mao real = alto; >=3 capas na cena = alto, motivo varios_jogos); 
 * (4) modelo logistico sobre o embedding CLIP; (5) faixas por limiar. Pilha de jogos so entra por `capasNaCena` (visao opcional): sem rotulos de pilha, nao ha como validar por foto. Texto 'usado' nao marca por foto: o porteiro de usado ja cuida (R-10).
 */
export function decidirFotoNaoNova(m: ModeloLogistico, e: EntradaDecisao): SaidaFotoNaoNova {
  const razoes: string[] = [];
  const base = { versao: FOTO_NAO_NOVA_VERSAO };
  if (e.distCapaOficial != null && e.distCapaOficial <= CAPA_OFICIAL_MAX_BITS) {
    return { ...base, pontuacao: 0, faixa: 'baixo', motivo: null, razoes: [`foto igual a imagem de catalogo (${e.distCapaOficial} bits)`], regraDura: 'capa_oficial' };
  }
  if (e.capasNaCena != null && e.capasNaCena >= 3) {
    return { ...base, pontuacao: 1, faixa: 'alto', motivo: 'foto_com_varios_jogos', razoes: [`${e.capasNaCena} capas na cena`], regraDura: 'varias_capas' };
  }
  if (e.maoVisao === true) {
    return { ...base, pontuacao: 1, faixa: 'alto', motivo: 'foto_com_mao', razoes: ['mao real vista pelo classificador de visao'], regraDura: 'mao_visao' };
  }
  if (!e.embedding) return { ...base, pontuacao: 0, faixa: 'baixo', motivo: null, razoes: ['imagem ilegivel: nao marca'], regraDura: 'sem_imagem' };
  let p = pontuarVetor(m, normalizarVetor(e.embedding));
  if (e.texto?.revendedor) { p = Math.min(1, p + 0.03); razoes.push('vendedor de usados'); }
  const f = e.features;
  if (f && f.peleMancha >= 0.06) razoes.push(`mancha de pele ${(f.peleMancha * 100).toFixed(1)}%`);
  // fundo branco uniforme de estudio com pouca pele: foto de loja; o modelo ja o aprende, aqui so protege o limite do 'alto'
  if (f && f.bordaBranca >= 0.9 && f.pele < 0.02 && p < 0.97) { p = Math.min(p, m.limiarAlto - 0.001); razoes.push('fundo branco de estudio: no maximo medio'); }
  const faixa: Faixa = p >= m.limiarAlto ? 'alto' : p >= m.limiarMedio ? 'medio' : 'baixo';
  const motivo: MotivoFoto | null = faixa === 'baixo' ? null : 'foto_com_mao';
  return { ...base, pontuacao: Math.round(p * 1000) / 1000, faixa, motivo, razoes, regraDura: null };
}

/** Decide se um master/oferta ja decidido pelo dono pode ser tocado. Padrao negado: so toca quem nao tem decisao humana nem marca anterior. */
export function podeMarcar(estado: { manual?: string | null; verdict?: string | null; motivoAtual?: string | null }): boolean {
  if (estado.manual) return false; // decisao humana (aprovou ou rejeitou) e do dono
  if (estado.verdict === 'rejected') return false; // ja fora; nada a marcar
  return true;
}

/** Estatisticas de validacao: precisao, revocacao e matriz de confusao para limiar dado. y: 1 = nao novo. */
export function metricas(y: number[], p: number[], limiar: number) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < y.length; i++) {
    const pred = p[i]! >= limiar ? 1 : 0;
    if (pred && y[i]) tp++; else if (pred) fp++; else if (y[i]) fn++; else tn++;
  }
  return { tp, fp, tn, fn, precisao: tp + fp ? tp / (tp + fp) : null, revocacao: tp + fn ? tp / (tp + fn) : null };
}
