// Puro (sem banco): critérios de aprovação de masters de nicho (ata 2026-11-10, E.2). Usado por
// scripts/aprovar-masters-nicho.ts (dry-run/apply) e testado em scripts/test-departamentos.ts.

export const CRITERIA_VERSION = 1;
/** Amplitude máxima (maior/menor preço) entre as ofertas clicáveis. */
export const AMPLITUDE_MAX = 2.5;
/** Fração máxima de ofertas ativas em quarentena (sinal de edição ou item misturado). */
export const QUARENTENA_MAX = 0.3;
/** Idade máxima do último check de uma oferta clicável. */
export const CLICAVEL_MAX_HORAS = 6;

const USADO = /\b(usado|usada|seminovo|semi-novo|recondicionad[oa]|open box|openbox|reembalad[oa]|vitrine|mostru[aá]rio|importad[oa]|lacre rompido)\b/i;
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
}

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
  if (palavras.length < 3 || NOMES_GENERICOS.has(nome)) motivos.push('nome_generico');
  // Marca+modelo só vale com o MODELO (ou part number): GTIN sozinho não basta para nome sem modelo (ata E.2).
  if (c.vertical !== 'livros' && !c.mpn && !c.catalogAttributes?.MODEL) motivos.push('identidade_fraca');
  // Eletrodoméstico: voltagem separa produto; sem ela no atributo nem no nome, fica em revisão.
  if (c.vertical === 'eletrodomesticos' && !c.catalogAttributes?.VOLTAGE && !/(110|127|220)\s?v|bivolt/i.test(c.name)) motivos.push('voltagem_ausente');
  if (c.nomeDuplicado) motivos.push('nome_duplicado');
  if (!c.hasImage) motivos.push('sem_foto');
  return { aprovavel: motivos.length === 0, motivos, amplitude };
}
