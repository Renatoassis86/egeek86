// Puro (sem banco): critérios de aprovação de masters de nicho (ata 2026-11-10, E.2). Usado por
// scripts/aprovar-masters-nicho.ts (dry-run/apply) e testado em scripts/test-departamentos.ts.

export const CRITERIA_VERSION = 2;
/** Amplitude máxima (maior/menor preço) entre as ofertas clicáveis. */
export const AMPLITUDE_MAX = 2.5;
/** Fração máxima de ofertas ativas em quarentena (sinal de edição ou item misturado). */
export const QUARENTENA_MAX = 0.3;
/** Idade máxima do último check de uma oferta clicável. */
export const CLICAVEL_MAX_HORAS = 6;

const USADO = /\b(sebo|modelo antigo|geracao anterior|fora de linha|descontinuad[oa]|edicao esgotada|colecionador|vintage|retro|usado|usada|seminovo|semi-novo|recondicionad[oa]|open box|openbox|reembalad[oa]|vitrine|mostru[aá]rio|importad[oa]|lacre rompido)\b/i;
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
const SEGMENTOS_COM_GENERO = new Set(['tenis', 'chuteira', 'camisa-de-time', 'roupa-de-ciclismo']);
const GENERO_NO_NOME = /\b(masculin[oa]s?|feminin[oa]s?|infantil|juvenil|unissex|menin[oa]s?|homem|mulher|kids)\b/i;

export interface Avaliacao {
  aprovavel: boolean;
  motivos: string[];
  amplitude: number | null;
}

export function normalizarNome(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function avaliarCandidato(c: CandidatoMaster): Avaliacao {
  const motivos: string[] = [];
  const v = c.gate?.verdict;
  if (v === 'rejected' || c.gate?.manual === 'rejected') motivos.push('rejeitado_pelo_dono');
  else if (v === 'approved') motivos.push('ja_aprovado');
  if (c.gate?.suggested !== 'approved') motivos.push('sem_evidencia_positiva_do_porteiro');
  if (USADO.test(c.name) || c.titulosOfertas.some((t) => USADO.test(t))) motivos.push('nao_e_produto_novo');
  if (c.precosClicaveis.length < 1) motivos.push('sem_oferta_clicavel');
  let amplitude: number | null = null;
  if (c.precosClicaveis.length >= 2) {
    const min = Math.min(...c.precosClicaveis);
    const max = Math.max(...c.precosClicaveis);
    amplitude = min > 0 ? max / min : null;
    if (amplitude === null || amplitude > AMPLITUDE_MAX) motivos.push(`amplitude_acima_de_${AMPLITUDE_MAX}`);
  }
  if (c.ofertasAtivas > 0 && c.ofertasQuarentena / (c.ofertasAtivas + c.ofertasQuarentena) >= QUARENTENA_MAX) motivos.push('quarentena_acima_de_30pct');
  const nome = normalizarNome(c.name);
  const palavras = nome.split(' ').filter(Boolean);
  // Livro: título curto é legítimo ("Duna", "Persuasão") quando há ISBN forte + editora; o resto exige nome específico (3+ palavras).
  const minPalavras = c.vertical === 'livros' ? 1 : 3;
  if (palavras.length < minPalavras || NOMES_GENERICOS.has(nome)) motivos.push('nome_generico');
  // Marca+modelo só vale com o MODELO (ou part number): GTIN sozinho não basta para nome sem modelo (ata E.2).
  // Esporte (ampliação 2026-11-11): aceita também a LINHA do fabricante (Air Max, Predator) quando não há modelo.
  const attrs = c.catalogAttributes;
  if (c.vertical === 'livros') {
    // Mínimo de marca/editora: sem editora (nem marca) o livro fica em revisão.
    if (!attrs?.BOOK_PUBLISHER && !attrs?.BRAND && !c.manufacturer) motivos.push('editora_ausente');
  } else if (c.vertical === 'esporte') {
    if (!c.mpn && !attrs?.MODEL && !attrs?.LINE) motivos.push('identidade_fraca');
  } else if (!c.mpn && !attrs?.MODEL) motivos.push('identidade_fraca');
  // Tênis/chuteira/camisa: marca+modelo+gênero (gênero no atributo ou no nome).
  if (c.segment && SEGMENTOS_COM_GENERO.has(c.segment) && !attrs?.GENDER && !GENERO_NO_NOME.test(c.name)) motivos.push('genero_ausente');
  // Eletrodoméstico: voltagem separa produto; sem ela no atributo nem no nome, fica em revisão.
  if (c.vertical === 'eletrodomesticos' && !c.catalogAttributes?.VOLTAGE && !/\b(110|127|220)\s?v\b|bivolt/i.test(c.name)) motivos.push('voltagem_ausente');
  if (c.nomeDuplicado) motivos.push('nome_duplicado');
  if (!c.hasImage) motivos.push('sem_foto');
  return { aprovavel: motivos.length === 0, motivos, amplitude };
}
