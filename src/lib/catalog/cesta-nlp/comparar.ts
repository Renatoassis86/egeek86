// Sem 'server-only': função pura. Compara dois títulos pela "chave de modelo" (atributos.ts) com RESTRIÇÕES DURAS
// (nunca juntar), conflitos suaves (dúvida) e similaridade (n-gramas de caracteres + TF-IDF de tokens).
import { extrairAtributos, RUIDO, CORES, DESCRITORES, type Atributos, type LexicoMarcas } from './atributos';

export type Veredito = 'igual' | 'diferente' | 'duvida';

export interface Conflito {
  eixo: string;
  detalhe: string;
  /** Duro = nunca juntar (decisão do dono ou diferença provada nos dois lados). Suave = só informação de um lado ou sufixo. */
  duro: boolean;
}

export interface Julgamento {
  veredito: Veredito;
  /** 0..1. Para 'igual' é a confiança de serem o MESMO produto; para 'diferente' é a confiança de serem produtos distintos. */
  confianca: number;
  conflitos: Conflito[];
  evidencias: string[];
  similaridade: number;
}

/** Limiar do dono para aplicar sozinho. */
export const LIMIAR_APLICAR = 0.97;
/** Abaixo disso o par nem vira sugestão. */
export const LIMIAR_SUGERIR = 0.9;

// ---------------------------------------------------------------------------
// Similaridade: n-gramas de caracteres + TF-IDF de tokens
// ---------------------------------------------------------------------------

export class IndiceTfidf {
  private df = new Map<string, number>();
  private n = 0;

  constructor(documentos: string[][] = []) {
    for (const d of documentos) this.adicionar(d);
  }

  adicionar(tokens: string[]): void {
    this.n++;
    for (const t of new Set(tokens)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  /** Fração de documentos que contêm o token. */
  dfRel(t: string): number {
    return (this.df.get(t) ?? 0) / Math.max(1, this.n);
  }

  idf(t: string): number {
    return Math.log(1 + (this.n + 1) / ((this.df.get(t) ?? 0) + 1));
  }

  /** Cosseno TF-IDF sobre os tokens do núcleo. */
  cosseno(a: string[], b: string[]): number {
    const va = this.vetor(a);
    const vb = this.vetor(b);
    return cos(va, vb);
  }

  private vetor(tokens: string[]): Map<string, number> {
    const v = new Map<string, number>();
    for (const t of tokens) v.set(t, (v.get(t) ?? 0) + 1);
    for (const [t, f] of v) v.set(t, (1 + Math.log(f)) * this.idf(t));
    return v;
  }
}

function cos(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [, x] of a) na += x * x;
  for (const [, x] of b) nb += x * x;
  for (const [k, x] of a) { const y = b.get(k); if (y) dot += x * y; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Trigramas de caracteres de cada token, com borda (tolera "playstation"/"play station", "airfryer"/"air fryer"). */
export function trigramas(tokens: string[]): Map<string, number> {
  const v = new Map<string, number>();
  const s = ' ' + tokens.join('') + ' ';
  for (let i = 0; i + 3 <= s.length; i++) {
    const g = s.slice(i, i + 3);
    v.set(g, (v.get(g) ?? 0) + 1);
  }
  return v;
}

export function similaridade(a: Atributos, b: Atributos, idx?: IndiceTfidf): number {
  if (!a.nucleo.length || !b.nucleo.length) return 0;
  const tok = idx ? idx.cosseno(a.nucleo, b.nucleo) : jaccard(a.nucleo, b.nucleo);
  const carac = cos(trigramas([...a.nucleo].sort()), trigramas([...b.nucleo].sort()));
  return 0.6 * tok + 0.4 * carac;
}

export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a), sb = new Set(b);
  if (!sa.size || !sb.size) return 0;
  let i = 0;
  for (const t of sa) if (sb.has(t)) i++;
  return i / (sa.size + sb.size - i);
}

// ---------------------------------------------------------------------------
// Conflitos por eixo
// ---------------------------------------------------------------------------

const ALIAS_MARCA: Record<string, string> = { redmi: 'xiaomi', poco: 'xiaomi', 'logitech g': 'logitech', bambu: 'bambu lab', 'tp link': 'tp-link', tplink: 'tp-link', 'harman kardon': 'jbl', 'black decker': 'black+decker' };
const canonMarca = (m: string | null): string | null => (m ? (ALIAS_MARCA[m] ?? m) : null);

/** Tipos que se confundem no título do anúncio. */
const FAMILIA_TIPO: Record<string, string> = { headset: 'fone', fone: 'fone' };
const familiaTipo = (t: string | null): string | null => (t ? (FAMILIA_TIPO[t] ?? t) : null);

const inter = <T,>(a: T[], b: T[]): T[] => a.filter((x) => b.includes(x));
const igualConj = <T,>(a: T[], b: T[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** Códigos compatíveis: iguais, ou um é o outro mais um sufixo curto (regional/revisão): "55ur8750" x "55ur8750psa". */
/** Um código contido no outro ("50du7700" em "un50du7700gxzd"): mesma família com prefixo/sufixo regional. */
/** Mesmo prefixo (5+) e restos só de letras (cor/região): AFON12LBIN x AFON12LGI. */
function prefixoComumLetras(a: string, b: string): boolean {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 5 && /^[a-z]{0,4}$/.test(a.slice(i)) && /^[a-z]{0,4}$/.test(b.slice(i)) && /\d/.test(a.slice(0, i));
}

/** Erro de digitação de 1 caractere (HL1232W x HLL1232W). */
function quase(a: string, b: string): boolean {
  if (a === b || a.length < 6 || b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ra = a.slice(i + (a.length >= b.length ? 1 : 0)), rb = b.slice(i + (b.length >= a.length ? 1 : 0));
  return ra === rb;
}

/** Mesmo modelo com sufixo de cor/região diferente e prefixo de marca (AT-LP70X-BZ x LP70X-BG). */
function semSufixoContido(a: string, b: string): boolean {
  const [c, l] = a.length <= b.length ? [a, b] : [b, a];
  return c.length >= 6 && /[a-z]{2}$/.test(c) && l.includes(c.slice(0, -2)) && c.slice(0, -2).length >= 4;
}

function contido(a: string, b: string): boolean {
  const [c, l] = a.length <= b.length ? [a, b] : [b, a];
  return c !== l && c.length >= 5 && l.includes(c);
}

function prefixoCurto(a: string, b: string): boolean {
  const [c, l] = a.length <= b.length ? [a, b] : [b, a];
  return c !== l && l.startsWith(c) && l.length - c.length <= 4 && c.length >= 4;
}

/** Mesmo código, só os 1-2 últimos caracteres (LETRAS nos dois) mudam: cor ou região (AFON-12L-WI x GI, SM-S921B x U). */
function sufixoLetras(a: string, b: string): boolean {
  if (a.length !== b.length || a.length < 6) return false;
  for (let k = 1; k <= 2; k++) {
    const ca = a.slice(a.length - k), cb = b.slice(b.length - k);
    if (a.slice(0, a.length - k) === b.slice(0, b.length - k) && /^[a-z]+$/.test(ca) && /^[a-z]+$/.test(cb)) return true;
  }
  return false;
}

function compararCodigos(a: string[], b: string[], eixo: string, out: Conflito[], ev: string[]): void {
  if (!a.length && !b.length) return;
  // código só de um lado: o título do outro não diz qual é o modelo (não prova igualdade)
  if (!a.length || !b.length) {
    const lado = a.length ? a : b;
    if (lado.some((x) => x.length >= 2)) out.push({ eixo: `${eixo}_ausente`, detalhe: `${lado.slice(0, 2).join('/')} só de um lado`, duro: false });
    return;
  }
  const comum = inter(a, b);
  if (comum.length) ev.push(`${eixo}:${comum[0]}`);
  let ra = a.filter((x) => !b.includes(x));
  let rb = b.filter((x) => !a.includes(x));
  // parentes (sufixo regional/cor, código contido no outro): casam como "mesmo código com variação"
  let suave = false;
  for (const x of [...ra]) {
    const y = rb.find((z) => prefixoCurto(x, z) || sufixoLetras(x, z) || contido(x, z) || prefixoComumLetras(x, z) || quase(x, z) || semSufixoContido(x, z));
    if (y) { ra = ra.filter((q) => q !== x); rb = rb.filter((q) => q !== y); suave = true; }
  }
  if (suave) out.push({ eixo: `${eixo}_sufixo`, detalhe: 'mesmo código com sufixo/prefixo diferente', duro: false });
  // lista de modelos compatíveis (PT100/PT92/PT59s...): 2+ em comum = o resto é lista, não identidade
  if (comum.length >= 2 && ra.length && rb.length) { out.push({ eixo: `${eixo}_lista`, detalhe: `${ra.slice(0, 2).join('/')} x ${rb.slice(0, 2).join('/')}`, duro: false }); return; }
  if (ra.length && rb.length) out.push({ eixo, detalhe: `${ra.slice(0, 3).join('/')} x ${rb.slice(0, 3).join('/')}`, duro: true });
}

export interface OpcoesComparacao {
  /** Capacidade não separa o console PS5 (825GB = 1TB, decisão do dono 2026-11-03). */
  capacidadeIgnoradaPs5?: boolean;
}

/** Todos os conflitos e evidências entre dois conjuntos de atributos. Não decide: `julgar` decide. */
export function conflitosEntre(a: Atributos, b: Atributos, opts: OpcoesComparacao = {}): { conflitos: Conflito[]; evidencias: string[] } {
  const c: Conflito[] = [];
  const ev: string[] = [];

  // condição
  if (a.naoNovo !== b.naoNovo) c.push({ eixo: 'condicao', detalhe: 'novo x não novo', duro: true });

  // papel e tipo
  if (a.acessorio !== b.acessorio) c.push({ eixo: 'papel', detalhe: `${a.tipo ?? '?'} x ${b.tipo ?? '?'} (acessório/peça x principal)`, duro: true });
  else if (a.tipo && b.tipo && familiaTipo(a.tipo) !== familiaTipo(b.tipo)) c.push({ eixo: a.acessorio && b.acessorio ? 'tipo_acessorio' : a.tipoInferido || b.tipoInferido ? 'tipo_inferido' : 'tipo', detalhe: `${a.tipo} x ${b.tipo}`, duro: !(a.acessorio && b.acessorio) && !(a.tipoInferido || b.tipoInferido) });
  else if (!a.tipo || !b.tipo) c.push({ eixo: 'tipo_desconhecido', detalhe: `${a.tipo ?? '?'} x ${b.tipo ?? '?'}`, duro: false });

  // marca
  const ma = canonMarca(a.marca), mb = canonMarca(b.marca);
  const jogoAmbos = a.tipo === 'jogo' && b.tipo === 'jogo';
  if (jogoAmbos) { /* marca de jogo é plataforma/franquia: a plataforma é comparada à parte */ }
  else if (ma && mb && ma !== mb && !ma.includes(mb) && !mb.includes(ma) && !a.marcas.some((x) => b.marcas.some((y) => canonMarca(x) === canonMarca(y) || x.includes(y) || y.includes(x)))) c.push({ eixo: a.marcaFraca || b.marcaFraca ? 'marca_fraca' : 'marca', detalhe: `${ma} x ${mb}`, duro: !(a.marcaFraca || b.marcaFraca) });
  else if (ma && mb) ev.push(`marca:${ma}`);
  else c.push({ eixo: 'marca_desconhecida', detalhe: `${ma ?? '?'} x ${mb ?? '?'}`, duro: false });

  // identificadores fortes
  if (a.isbn && b.isbn) { if (a.isbn !== b.isbn) c.push({ eixo: 'isbn', detalhe: `${a.isbn} x ${b.isbn}`, duro: true }); else ev.push('isbn'); }
  if (a.ean && b.ean) { if (a.ean !== b.ean) c.push({ eixo: 'ean', detalhe: `${a.ean} x ${b.ean}`, duro: true }); else ev.push('ean'); }

  // modelo
  {
    const squash = (x: Atributos) => x.texto.replace(/[\s\-/.]/g, '');
    const ca = [...new Set([...a.mpn, ...a.codigos])], cb = [...new Set([...b.mpn, ...b.codigos])];
    const sa = squash(a), sb = squash(b);
    // "VHL 1220 B" e "1220b": o código está no outro título, só escrito com espaços
    const ca2 = ca.filter((x) => cb.includes(x) || !sb.includes(x)), cb2 = cb.filter((x) => ca.includes(x) || !sa.includes(x));
    compararCodigos(ca2.length || !ca.length ? ca2 : [], cb2.length || !cb.length ? cb2 : [], 'modelo', c, ev);
  }
  compararCodigos(a.cpuGpu, b.cpuGpu, 'cpu_gpu', c, ev);

  // linha/modelo por nome (JBL Tune Buds x Tune Flex; Wave Beam x Wave Buds): só onde o modelo é palavra, não código
  if (['fone', 'headset'].includes(a.tipo ?? '') && ma && mb && ma === mb && !inter([...a.mpn, ...a.codigos], [...b.mpn, ...b.codigos]).length && a.linha.join('') !== b.linha.join('') && a.linha.length >= 1 && b.linha.length >= 1 && (!a.linha.some((x) => b.linha.includes(x)) || (a.linha.length >= 2 && b.linha.length >= 2 && a.linha.some((x) => !b.linha.includes(x)) && b.linha.some((x) => !a.linha.includes(x))))) {
    c.push({ eixo: 'linha', detalhe: `${a.linha.join(' ')} x ${b.linha.join(' ')}`, duro: true });
  }

  // capacidade: armazenamento (rotulado, ou sem rótulo quando a RAM já veio rotulada) e RAM comparados à parte
  if (!opts.capacidadeIgnoradaPs5) {
    const stA = a.armazenamento.length ? a.armazenamento : a.ram.length || a.capSemRotulo.length > 1 ? a.capSemRotulo : [];
    const stB = b.armazenamento.length ? b.armazenamento : b.ram.length || b.capSemRotulo.length > 1 ? b.capSemRotulo : [];
    const capA = [...new Set([...a.armazenamento, ...a.ram, ...a.capSemRotulo])], capB = [...new Set([...b.armazenamento, ...b.ram, ...b.capSemRotulo])];
    if (stA.length && stB.length && !inter(stA, stB).length) c.push({ eixo: 'armazenamento', detalhe: `${stA.join('/')}GB x ${stB.join('/')}GB`, duro: true });
    else if (a.ram.length && b.ram.length && !inter(a.ram, b.ram).length) c.push({ eixo: 'ram', detalhe: `${a.ram.join('/')}GB x ${b.ram.join('/')}GB`, duro: true });
    else if (capA.length && capB.length) {
      if (!inter(capA, capB).length) c.push({ eixo: 'capacidade', detalhe: `${capA.join('/')}GB x ${capB.join('/')}GB`, duro: true });
      else if (!igualConj(capA, capB)) c.push({ eixo: 'capacidade_parcial', detalhe: `${capA.join('/')} x ${capB.join('/')}`, duro: false });
    } else if (capA.length !== capB.length && (capA.length === 0 || capB.length === 0)) c.push({ eixo: 'capacidade_ausente', detalhe: `${capA.join('/') || 'sem'} x ${capB.join('/') || 'sem'}`, duro: false });
  }

  // especificações numéricas por unidade (L, W, mAh, Hz, MP, Ah, Wh)
  for (const u of new Set([...Object.keys(a.specs), ...Object.keys(b.specs)])) {
    const x = a.specs[u] ?? [], y = b.specs[u] ?? [];
    if (x.length && y.length) {
      if (!inter(x, y).length) c.push({ eixo: `spec_${u}`, detalhe: `${x.join('/')}${u} x ${y.join('/')}${u}`, duro: true });
    } else if (x.length !== y.length) c.push({ eixo: `spec_${u}_ausente`, detalhe: `${u} só de um lado`, duro: false });
  }

  // resolução (impressora de resina 12K x 16K; TV 4K x 8K)
  if (a.resolucoes.length && b.resolucoes.length && !inter(a.resolucoes, b.resolucoes).length && ['impressora3d', 'tv', 'monitor', 'camera'].includes(a.tipo ?? '')) {
    c.push({ eixo: 'resolucao', detalhe: `${a.resolucoes.join('/')} x ${b.resolucoes.join('/')}`, duro: true });
  }

  if (a.resolucoes.length !== b.resolucoes.length && (a.resolucoes.length === 0 || b.resolucoes.length === 0) && ['impressora3d', 'resina', 'tv', 'monitor', 'camera'].includes(a.tipo ?? b.tipo ?? '')) {
    c.push({ eixo: 'resolucao_ausente', detalhe: 'resolução só de um lado', duro: false });
  }

  // peso/volume
  const tipoMedida = (t: string | null) => t === 'filamento' || t === 'resina' || t === 'perfume';
  if (a.medidas.length && b.medidas.length && (tipoMedida(a.tipo) || tipoMedida(b.tipo))) {
    if (!inter(a.medidas, b.medidas).length) c.push({ eixo: 'medida', detalhe: `${a.medidas.join('/')} x ${b.medidas.join('/')}`, duro: true });
  } else if (a.medidas.length !== b.medidas.length && (a.tipo === 'filamento' || a.tipo === 'resina' || b.tipo === 'filamento' || b.tipo === 'resina')) {
    c.push({ eixo: 'medida_ausente', detalhe: 'peso/volume só de um lado', duro: false });
  }

  // tamanho
  if (a.polegadas.length && b.polegadas.length) {
    if (!inter(a.polegadas, b.polegadas).length) c.push({ eixo: 'polegadas', detalhe: `${a.polegadas.map((x) => x / 10).join('/')}" x ${b.polegadas.map((x) => x / 10).join('/')}"`, duro: true });
  } else if (a.polegadas.length !== b.polegadas.length) c.push({ eixo: 'polegadas_ausente', detalhe: 'tamanho só de um lado', duro: false });

  // voltagem (110 x 220 separa; bivolt é caso próprio)
  if (a.voltagens.length && b.voltagens.length) {
    if (!inter(a.voltagens, b.voltagens).length) {
      const biv = a.voltagens.includes('bivolt') || b.voltagens.includes('bivolt');
      c.push({ eixo: biv ? 'voltagem_bivolt' : 'voltagem', detalhe: `${a.voltagens.join('/')} x ${b.voltagens.join('/')}`, duro: !biv });
    }
  } else if (a.voltagens.length !== b.voltagens.length) c.push({ eixo: 'voltagem_ausente', detalhe: 'voltagem só de um lado', duro: false });

  // pack e bundle
  if (a.pack !== b.pack) c.push({ eixo: 'pack', detalhe: `${a.pack} x ${b.pack}`, duro: true });
  if (a.bundle !== b.bundle) c.push({ eixo: 'composicao', detalhe: 'combo/kit x avulso', duro: true });
  else if (a.componentes.length && b.componentes.length && !igualConj(a.componentes, b.componentes)) {
    // lista truncada (um lado tem itens a mais): dúvida; itens diferentes nos DOIS lados: pacote diferente
    const so = (x: string[], y: string[]) => x.filter((i) => !y.includes(i)).length;
    c.push({ eixo: so(a.componentes, b.componentes) && so(b.componentes, a.componentes) ? 'componentes' : 'componentes_parcial', detalhe: `[${a.componentes.join(',')}] x [${b.componentes.join(',')}]`, duro: !!(so(a.componentes, b.componentes) && so(b.componentes, a.componentes)) });
  }

  // edição, região, variante, plataforma, geração
  const edA = a.edicoes.filter((e) => !(e.startsWith('ed_') && new RegExp(`\\b${e.slice(3)}\\b`).test(b.texto)));
  const edB = b.edicoes.filter((e) => !(e.startsWith('ed_') && new RegExp(`\\b${e.slice(3)}\\b`).test(a.texto)));
  if (!igualConj(edA, edB)) c.push({ eixo: 'edicao', detalhe: `[${edA.join(',')}] x [${edB.join(',')}]`, duro: true });
  if (a.importado !== b.importado) c.push({ eixo: 'regiao', detalhe: 'importado x nacional', duro: true });
  if (!igualConj(a.variantes, b.variantes)) c.push({ eixo: 'variante', detalhe: `[${a.variantes.join(',')}] x [${b.variantes.join(',')}]`, duro: a.tipoComVariante && b.tipoComVariante });
  if (a.plataformas.length && b.plataformas.length) {
    const ambosJogo = a.tipo === 'jogo' && b.tipo === 'jogo';
    const pa = a.plataformas.filter((x) => x !== 'pc'), pb = b.plataformas.filter((x) => x !== 'pc');
    if (ambosJogo ? !igualConj(a.plataformas, b.plataformas) : pa.length && pb.length && !inter(pa, pb).length) c.push({ eixo: 'plataforma', detalhe: `[${a.plataformas.join(',')}] x [${b.plataformas.join(',')}]`, duro: true });
    else if (!igualConj(a.plataformas, b.plataformas)) c.push({ eixo: 'plataforma_parcial', detalhe: `[${a.plataformas.join(',')}] x [${b.plataformas.join(',')}]`, duro: false });
  } else if (a.plataformas.length !== b.plataformas.length) c.push({ eixo: 'plataforma_ausente', detalhe: 'plataforma só de um lado', duro: false });
  if (a.numeros.length && b.numeros.length && !igualConj(a.numeros, b.numeros)) c.push({ eixo: 'geracao', detalhe: `${a.numeros.join(',')} x ${b.numeros.join(',')}`, duro: true });

  // sequência numérica do nome (Mario Kart 8, Fogão 4 bocas)
  const na = a.seq, nb = b.seq;
  if (na.length && nb.length) {
    const sobraA = na.filter((x) => !nb.includes(x)), sobraB = nb.filter((x) => !na.includes(x));
    if (sobraA.length && sobraB.length) c.push({ eixo: 'numeral', detalhe: `${na.join(',')} x ${nb.join(',')}`, duro: !!(a.tipo && b.tipo) });
    else if (sobraA.length || sobraB.length) c.push({ eixo: 'numeral_parcial', detalhe: `${na.join(',')} x ${nb.join(',')}`, duro: (a.tipo === 'jogo' && b.tipo === 'jogo') || ['fone', 'headset', 'caixa_som'].includes(a.tipo ?? '') });
  } else if (na.length !== nb.length) c.push({ eixo: 'numeral_ausente', detalhe: `${na.join(',') || 'sem'} x ${nb.join(',') || 'sem'}`, duro: a.tipo === 'jogo' && b.tipo === 'jogo' });

  return { conflitos: c, evidencias: ev };
}

/** Palavras de NOME (alfabéticas, raras, fora dos léxicos de descrição/cor/ruído e dos códigos já comparados). */
export function distintivos(a: Atributos, idx?: IndiceTfidf): string[] {
  const marca = new Set((a.marca ?? '').split(' '));
  const out = a.nucleo.filter((t) => /^[a-z]{3,}$/.test(t) && !RUIDO.has(t) && !CORES.has(t) && !DESCRITORES.has(t) && !marca.has(t) && (!idx || idx.dfRel(t) <= 0.03));
  return [...new Set(out)].sort();
}

/** Console PS5: a capacidade não separa (decisão do dono). */
export function ps5Console(a: Atributos): boolean {
  return a.tipo === 'console' && a.plataformas.includes('ps5');
}

/**
 * Julga se dois TÍTULOS são o mesmo produto. Hierarquia: conflito duro => 'diferente'; evidência forte (ISBN, EAN, MPN igual) ou
 * núcleo praticamente idêntico, sem conflito suave => 'igual' com confiança alta; o resto é 'duvida'.
 */
export function julgarAtributos(a: Atributos, b: Atributos, idx?: IndiceTfidf): Julgamento {
  const { conflitos, evidencias } = conflitosEntre(a, b, { capacidadeIgnoradaPs5: ps5Console(a) && ps5Console(b) });
  const sim = similaridade(a, b, idx);
  const da = distintivos(a, idx), db = distintivos(b, idx);
  const extraA = da.filter((t) => !db.includes(t)), extraB = db.filter((t) => !da.includes(t));
  const nomeIgual = da.length >= 1 && !extraA.length && !extraB.length;
  if (da.length && db.length && (extraA.length || extraB.length)) {
    conflitos.push({ eixo: extraA.length && extraB.length ? 'tokens_distintivos_diferentes' : 'token_distintivo_extra', detalhe: `+${extraA.join(',')} / +${extraB.join(',')}`, duro: false });
  }
  const duros = conflitos.filter((x) => x.duro);
  const suaves = conflitos.filter((x) => !x.duro);
  if (duros.length) {
    return { veredito: 'diferente', confianca: Math.min(0.99, 0.9 + 0.03 * duros.length), conflitos, evidencias, similaridade: sim };
  }
  // Conflitos suaves que NÃO impedem o 'igual' porque só dizem "o título não cita": cor, tipo omitido, marca omitida pesam à parte.
  const bloqueantes = suaves.filter((x) => !/^(?:tipo_desconhecido|marca_desconhecida)$/.test(x.eixo));
  let conf: number;
  const forte = evidencias.some((e) => e === 'isbn' || e === 'ean');
  const mpnIgual = evidencias.some((e) => e.startsWith('mpn:'));
  if (forte) conf = 0.995;
  else if (mpnIgual && sim >= 0.5) conf = 0.985;
  else if (nomeIgual && sim >= 0.5) conf = da.length >= 2 ? 0.975 : 0.96;
  else if (sim >= 0.93) conf = 0.95;
  else if (sim >= 0.85) conf = 0.93;
  else if (sim >= 0.7) conf = 0.8;
  else conf = 0.5 * sim + 0.3;
  // sem marca ou sem tipo reconhecido nos dois lados não se chega a 0,97 só por texto
  if (!a.marca || !b.marca) conf = Math.min(conf, forte ? conf : 0.95);
  if (!a.tipo || !b.tipo) conf = Math.min(conf, forte ? conf : 0.94);
  if (a.nucleo.length < 2 || b.nucleo.length < 2) conf = Math.min(conf, forte ? conf : 0.9);
  // nenhuma informação discriminante (sem código, capacidade, tamanho, plataforma) e só texto: teto
  if (bloqueantes.length) conf = Math.min(conf * Math.pow(0.97, bloqueantes.length), 0.95);
  conf = Math.round(conf * 1000) / 1000;
  const veredito: Veredito = conf >= LIMIAR_SUGERIR ? 'igual' : 'duvida';
  return { veredito, confianca: conf, conflitos, evidencias, similaridade: sim };
}

export function julgarTitulos(tituloA: string, tituloB: string, idx?: IndiceTfidf, lexico?: LexicoMarcas): Julgamento {
  return julgarAtributos(extrairAtributos(tituloA, lexico), extrairAtributos(tituloB, lexico), idx);
}

/** Frequência de documento (para tokens "raros" = nome de modelo, não descrição). */
export function dfRelativa(idx: IndiceTfidf | undefined, t: string): number {
  return idx ? idx.dfRel(t) : 0;
}
