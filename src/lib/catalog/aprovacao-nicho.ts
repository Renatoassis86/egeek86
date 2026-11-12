// Puro (sem banco): critérios de aprovação de masters de nicho (ata 2026-11-10, E.2). Usado por
// scripts/aprovar-masters-nicho.ts (dry-run/apply) e testado em scripts/test-departamentos.ts.

import { SEGMENTOS_ESPORTE_COM_GENERO } from './vertical/esporte-shopee';

/**
 * Critérios v3 (dono, 2026-11-12: "aumentar a aprovação das lojas Plus", sem quebrar as regras inegociáveis).
 * FLAG/CONSTANTE: `APROVACAO_RELAXADA` liga os relaxamentos abaixo; desligar = volta exatamente aos critérios v2
 * (variável de ambiente `PLUS_APROVACAO_RELAXADA=0`, ou `opts.relaxado=false` por chamada). Nada aqui toca o porteiro gamer.
 * Relaxamentos (todos reversíveis, cada um com teste em scripts/test-aprovacao-relaxada.ts):
 *   R1 amplitude medida no NÚCLEO de preços (0,35x a 3x da mediana, como a média de formação já faz); anúncio fora da faixa não reprova o
 *      produto, mas se mais de 25% das ofertas estão fora da faixa o produto continua em revisão (indício de edição/variante misturada);
 *   R2 livro com ISBN (gtin 978/979) tolera até 60% de quarentena desde que haja 2+ ofertas clicáveis (a identidade é o ISBN; a quarentena é preço);
 *   R3 voltagem lida também nos títulos das ofertas (todos os que citam concordam); fogão/cooktop a gás não têm voltagem;
 *   R4 gênero não se aplica a item unissex de uso (manguito, caneleira, joelheira, munhequeira...).
 * O que NÃO relaxa: usado/novo, evidência positiva do porteiro, identidade fraca, nome duplicado, sem foto, sem oferta clicável.
 */
export const CRITERIA_VERSION_V2 = 2;
export const CRITERIA_VERSION_V3 = 3;
export const APROVACAO_RELAXADA = process.env.PLUS_APROVACAO_RELAXADA !== '0';
export const CRITERIA_VERSION = APROVACAO_RELAXADA ? CRITERIA_VERSION_V3 : CRITERIA_VERSION_V2;
/** Faixa do núcleo de preço em torno da mediana (mesma da média de formação e da aprovação de Impressão 3D). */
export const NUCLEO_MIN = 0.35;
export const NUCLEO_MAX = 3;
/** Fração máxima de ofertas fora do núcleo para o produto ainda ser aprovável (R1). */
export const FORA_NUCLEO_MAX = 0.25;
/** Mínimo de ofertas clicáveis para a amplitude usar o núcleo (abaixo disso vale o max/min estrito). */
export const NUCLEO_MIN_OFERTAS = 4;
/** Quarentena tolerada para livro com ISBN (R2) e mínimo de ofertas clicáveis. */
export const QUARENTENA_MAX_ISBN = 0.6;
export const QUARENTENA_ISBN_MIN_CLICAVEIS = 2;
/** Amplitude TOTAL (max/min de todas as ofertas clicáveis) acima da qual nem o núcleo salva: mais de 6x é quase sempre variante/kit/usado misturado. */
export const AMPLITUDE_TOTAL_MAX = 6;
/** Primeira palavra de "marca" que é só o nome da categoria (clone sem marca: "TWS", "Fone de Ouvido"): a identidade não é forte de verdade. */
const MARCA_GENERICA = new Set(['fone', 'fones', 'tws', 'bluetooth', 'generico', 'generica', 'headset', 'carregador', 'cabo', 'mouse', 'teclado', 'caixa', 'relogio', 'smartwatch', 'camera', 'lampada', 'adaptador', 'suporte', 'bola', 'raquete']);
/** Amplitude máxima (maior/menor preço) entre as ofertas clicáveis. */
export const AMPLITUDE_MAX = 2.5;
/** Fração máxima de ofertas ativas em quarentena (sinal de edição ou item misturado). */
export const QUARENTENA_MAX = 0.3;
/** Idade máxima do último check de uma oferta clicável. */
export const CLICAVEL_MAX_HORAS = 6;

const USADO = /\b(sebo|modelo antigo|geracao anterior|fora de linha|descontinuad[oa]|edicao esgotada|colecionador|vintage|retro|usado|usada|seminovo|semi-novo|recondicionad[oa]|open box|openbox|reembalad[oa]|vitrine|mostru[aá]rio|importad[oa]|lacre rompido)\b/i;
const UNISSEX_USO = /\b(manguito|caneleira|joelheira|cotoveleira|munhequeira|tornozeleira|protetor bucal|faixa|corda|bandagem)\b/i;
const VOLT_RE = /\b(110|127|220)\s?v\b|bivolt/gi;
const SEGMENTOS_A_GAS = new Set(['fogao', 'cooktop']);
const ELETRICO = /\b(inducao|indução|eletric[oa]|elétric[oa]|vitroceramic[oa])\b/i;
/** Guarda de segurança (vale com a flag ligada ou não): brinquedo/miniatura nunca é produto de loja Plus (o veredito sugerido gravado na semeadura pode ser anterior ao léxico). */
const BRINQUEDO = /\b(brinquedos?|miniaturas?|toys?|de mentirinha)\b/i;
const NOMES_GENERICOS = new Set(['manga', 'livro', 'smart tv', 'tv', 'notebook', 'ssd', 'impressora', 'air fryer', 'fone', 'bola']);

export interface CandidatoMaster {
  id: string;
  name: string;
  vertical: string;
  gtin: string | null;
  mpn: string | null;
  hasImage: boolean;
  gate: { verdict?: string; suggested?: string; manual?: string; category?: string } | null;
  catalogAttributes: Record<string, unknown> | null;
  /** Preços (centavos) das ofertas clicáveis (ativas, link não pendente, sem quarentena, checadas < 6 h, ML/Shopee). */
  precosClicaveis: number[];
  ofertasAtivas: number;
  ofertasQuarentena: number;
  titulosOfertas: string[];
  /** true se outro master do mesmo departamento tem o mesmo nome normalizado. */
  nomeDuplicado: boolean;
  /** Segmento de semeadura (config.ts); ausente nos masters antigos. */
  segment?: string | null;
  /** manufacturer do master (marca/editora quando a API devolve). */
  manufacturer?: string | null;
}

/** Segmentos de calçado/vestuário: a identidade é marca+modelo+GÊNERO (tamanho e cor não separam master). */
// Inclui os segmentos da descoberta Shopee de esporte (2026-11-11: regata, short, legging, agasalho, compressão), que exigem gênero.
const SEGMENTOS_COM_GENERO = new Set(['tenis', 'chuteira', 'camisa-de-time', 'roupa-de-ciclismo', ...SEGMENTOS_ESPORTE_COM_GENERO]);
const GENERO_NO_NOME = /\b(masculin[oa]s?|feminin[oa]s?|infantil|juvenil|unissex|menin[oa]s?|homem|mulher|kids)\b/i;

export interface Avaliacao {
  aprovavel: boolean;
  motivos: string[];
  amplitude: number | null;
  /** Observações que NÃO reprovam (ex.: ofertas fora do núcleo de preço). */
  avisos: string[];
  /** true = não aprovável hoje, mas só falta um atributo/julgamento humano: vai para a FILA DE CLASSIFICAÇÃO (continua em 'review', fora da média e da vitrine). */
  fila: boolean;
}

/** Motivos que uma resposta humana resolve (voltagem, gênero, editora, identidade, preço disperso). Os demais são técnicos ou definitivos. */
export const MOTIVOS_DA_FILA = new Set(['voltagem_ausente', 'voltagem_mista', 'genero_ausente', 'editora_ausente', 'identidade_fraca', 'amplitude_acima_de_2.5', 'outliers_acima_de_25pct', 'quarentena_acima_de_30pct', 'amplitude_total_acima_de_6', 'marca_generica']);

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/**
 * R1: amplitude do NÚCLEO (sem as pontas). Menos de 4 ofertas clicáveis: max/min estrito, como na v2. foraDoNucleo = ofertas fora da faixa
 * 0,35x a 3x da mediana (a mesma que a média de formação já exclui); passando de 25% o produto continua em revisão.
 */
export function amplitudeNucleo(precos: number[]): { amplitude: number | null; foraDoNucleo: number; n: number } {
  const p = precos.filter((x) => x > 0).sort((a, b) => a - b);
  if (p.length < 2) return { amplitude: null, foraDoNucleo: 0, n: p.length };
  if (p.length < NUCLEO_MIN_OFERTAS) return { amplitude: p[p.length - 1] / p[0], foraDoNucleo: 0, n: p.length };
  const med = mediana(p);
  // Descarta as pontas: 1 de cada lado (4 a 7 ofertas) ou 10% de cada lado (8+). O miolo é o preço de mercado do produto.
  const k = p.length >= 8 ? Math.ceil(p.length * 0.1) : 1;
  const miolo = p.slice(k, p.length - k);
  const fora = p.filter((x) => x < med * NUCLEO_MIN || x > med * NUCLEO_MAX).length;
  return { amplitude: miolo.length >= 2 ? miolo[miolo.length - 1] / miolo[0] : 1, foraDoNucleo: fora, n: p.length };
}

export function normalizarNome(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function avaliarCandidato(c: CandidatoMaster, opts: { relaxado?: boolean; confirmadoDono?: boolean } = {}): Avaliacao {
  const relaxado = opts.relaxado ?? APROVACAO_RELAXADA;
  const avisos: string[] = [];
  const motivos: string[] = [];
  const v = c.gate?.verdict;
  if (v === 'rejected' || c.gate?.manual === 'rejected') motivos.push('rejeitado_pelo_dono');
  else if (v === 'approved') motivos.push('ja_aprovado');
  if (c.gate?.suggested !== 'approved') motivos.push('sem_evidencia_positiva_do_porteiro');
  if (USADO.test(c.name) || c.titulosOfertas.some((t) => USADO.test(t))) motivos.push('nao_e_produto_novo');
  if (BRINQUEDO.test(c.name) || c.titulosOfertas.some((t) => BRINQUEDO.test(t))) motivos.push('brinquedo_ou_miniatura');
  if (c.precosClicaveis.length < 1) motivos.push('sem_oferta_clicavel');
  let amplitude: number | null = null;
  if (c.precosClicaveis.length >= 2) {
    if (relaxado) {
      const nu = amplitudeNucleo(c.precosClicaveis);
      amplitude = nu.amplitude;
      if (amplitude === null || amplitude > AMPLITUDE_MAX) motivos.push(`amplitude_acima_de_${AMPLITUDE_MAX}`);
      else if (nu.foraDoNucleo / nu.n > FORA_NUCLEO_MAX) motivos.push('outliers_acima_de_25pct');
      else if (Math.max(...c.precosClicaveis) / Math.min(...c.precosClicaveis) > AMPLITUDE_TOTAL_MAX) motivos.push('amplitude_total_acima_de_6');
      else if (nu.foraDoNucleo > 0) avisos.push(`ofertas_fora_do_nucleo_de_preco:${nu.foraDoNucleo}`);
    } else {
      const min = Math.min(...c.precosClicaveis);
      const max = Math.max(...c.precosClicaveis);
      amplitude = min > 0 ? max / min : null;
      if (amplitude === null || amplitude > AMPLITUDE_MAX) motivos.push(`amplitude_acima_de_${AMPLITUDE_MAX}`);
    }
  }
  if (c.ofertasAtivas > 0) {
    const fracQ = c.ofertasQuarentena / (c.ofertasAtivas + c.ofertasQuarentena);
    const isbnForte = relaxado && c.vertical === 'livros' && !!c.gtin && /^97[89]\d{10}$/.test(c.gtin) && c.precosClicaveis.length >= QUARENTENA_ISBN_MIN_CLICAVEIS;
    if (fracQ >= (isbnForte ? QUARENTENA_MAX_ISBN : QUARENTENA_MAX)) motivos.push('quarentena_acima_de_30pct');
    else if (isbnForte && fracQ >= QUARENTENA_MAX) avisos.push('quarentena_tolerada_por_isbn');
  }
  const nome = normalizarNome(c.name);
  const palavras = nome.split(' ').filter(Boolean);
  // Livro: título curto é legítimo ("Duna", "Persuasão") quando há ISBN forte + editora; o resto exige nome específico (3+ palavras).
  const minPalavras = c.vertical === 'livros' ? 1 : 3;
  if (palavras.length < minPalavras || NOMES_GENERICOS.has(nome)) motivos.push('nome_generico');
  // Marca+modelo só vale com o MODELO (ou part number): GTIN sozinho não basta para nome sem modelo (ata E.2).
  // Esporte (ampliação 2026-11-11): aceita também a LINHA do fabricante (Air Max, Predator) quando não há modelo.
  const attrs = c.catalogAttributes;
  const marcaTxt = String(attrs?.BRAND ?? c.manufacturer ?? '');
  if (marcaTxt && c.vertical !== 'livros' && MARCA_GENERICA.has(normalizarNome(marcaTxt).split(' ')[0] ?? '')) motivos.push('marca_generica');
  if (c.vertical === 'livros') {
    // Mínimo de marca/editora: sem editora (nem marca) o livro fica em revisão.
    if (!attrs?.BOOK_PUBLISHER && !attrs?.BRAND && !c.manufacturer) motivos.push('editora_ausente');
  } else if (c.vertical === 'esporte') {
    if (!c.mpn && !attrs?.MODEL && !attrs?.LINE) motivos.push('identidade_fraca');
  } else if (!c.mpn && !attrs?.MODEL) motivos.push('identidade_fraca');
  // Tênis/chuteira/camisa: marca+modelo+gênero (gênero no atributo ou no nome).
  if (c.segment && SEGMENTOS_COM_GENERO.has(c.segment) && !attrs?.GENDER && !GENERO_NO_NOME.test(c.name) && !(relaxado && UNISSEX_USO.test(c.name))) motivos.push('genero_ausente');
  // Eletrodoméstico: voltagem separa produto; sem ela no atributo nem no nome, fica em revisão.
  if (c.vertical === 'eletrodomesticos' && !c.catalogAttributes?.VOLTAGE && !/\b(110|127|220)\s?v\b|bivolt/i.test(c.name)) {
    if (!relaxado) motivos.push('voltagem_ausente');
    else if (c.segment && SEGMENTOS_A_GAS.has(c.segment) && !ELETRICO.test(c.name) && !c.titulosOfertas.some((t) => ELETRICO.test(t))) avisos.push('voltagem_nao_se_aplica_a_gas');
    else {
      // R3: voltagem escrita nos anúncios; todos os que citam concordam (1 valor) => vale. 2+ valores => produto misto, continua em revisão.
      const vistas = new Set<string>();
      for (const t of c.titulosOfertas) for (const m of t.matchAll(VOLT_RE)) vistas.add(/bivolt/i.test(m[0]) ? 'bivolt' : m[1]);
      if (vistas.size === 1) avisos.push(`voltagem_lida_nos_anuncios:${[...vistas][0]}`);
      else motivos.push(vistas.size > 1 ? 'voltagem_mista' : 'voltagem_ausente');
    }
  }
  if (c.nomeDuplicado) motivos.push('nome_duplicado');
  if (!c.hasImage) motivos.push('sem_foto');
  // Resposta 'sim' do dono na fila de classificação (identidade) resolve só os motivos de julgamento (MOTIVOS_DA_FILA); usado, duplicado, sem foto, sem oferta clicável etc. continuam valendo.
  if (opts.confirmadoDono) for (let i = motivos.length - 1; i >= 0; i--) if (MOTIVOS_DA_FILA.has(motivos[i])) motivos.splice(i, 1);
  const aprovavel = motivos.length === 0;
  // Fila: só entra quem falha EXCLUSIVAMENTE por motivos que uma resposta humana resolve (nunca usado, duplicado, sem foto, sem oferta clicável ou sem evidência do porteiro).
  const fila = !aprovavel && motivos.every((m) => MOTIVOS_DA_FILA.has(m));
  return { aprovavel, motivos, amplitude, avisos, fila };
}
