// Sem 'server-only': registro e regras PURAS (sem banco, sem rede), importáveis por testes e scripts.
// A leitura da chave no banco fica em src/server/departamentos.ts.
import { VERTICALS, type Vertical } from '@/lib/catalog/verticais';

/**
 * REGISTRO DE DEPARTAMENTOS PÚBLICOS (ata 2026-11-10, emenda; ADR 0008).
 *
 * Games NÃO está aqui de propósito: é o site principal e nunca passa por este registro nem por estas chaves.
 * Cada departamento tem uma chave própria na tabela `feature_flags` (`dept_<slug>`). Reverter = `enabled=false`.
 * A trava mestra é a variável de ambiente `MERCADO_UI` (desligada = tudo 404, sem ler o banco).
 */

export type DepartamentoSlug = Exclude<Vertical, 'games'>;
export type TipoCartao = 'livro' | 'tecnologia' | 'eletro' | 'esporte';

export interface Departamento {
  slug: DepartamentoSlug;
  rotulo: string;
  /** Texto curto da página do departamento (descritivo, sem número). */
  descricao: string;
  tipoCartao: TipoCartao;
  /** Chave na tabela feature_flags. */
  flag: string;
}

/** Mínimo de masters aprovados e visíveis para o departamento existir (abaixo disso: 404). */
export const MIN_MASTERS_DEPARTAMENTO = 3;
/** Cache em memória da leitura de flags e contagens (segundos). Reversão por UPDATE vale em até este tempo. */
export const CACHE_FLAGS_SEGUNDOS = 30;
/** Cartões por página. */
export const POR_PAGINA = 24;
/** Idade máxima do último check de uma oferta clicável (ata E.1 item 2: 6 h; termos do ML pedem atualização a cada 6 h). */
export const OFERTA_CLICAVEL_MAX_HORAS = 6;
/** Mediana de preço só com este mínimo de vendedores distintos. */
export const MIN_VENDEDORES_MEDIANA = 3;
/** Redes que podem aparecer em departamento (Amazon fora). */
export const REDES_DEPARTAMENTO = ['mercado-livre', 'shopee'] as const;

export const DEPARTAMENTOS: readonly Departamento[] = [
  { slug: 'tecnologia', rotulo: 'Tecnologia', descricao: 'Hardware, armazenamento, impressoras e periféricos.', tipoCartao: 'tecnologia', flag: 'dept_tecnologia' },
  { slug: 'eletroeletronicos', rotulo: 'Eletrônicos', descricao: 'TVs, áudio e vídeo.', tipoCartao: 'eletro', flag: 'dept_eletroeletronicos' },
  { slug: 'livros', rotulo: 'Livros', descricao: 'Livros identificados por ISBN.', tipoCartao: 'livro', flag: 'dept_livros' },
  { slug: 'eletrodomesticos', rotulo: 'Casa', descricao: 'Eletrodomésticos para a casa.', tipoCartao: 'eletro', flag: 'dept_eletrodomesticos' },
  { slug: 'esporte', rotulo: 'Esporte', descricao: 'Artigos esportivos.', tipoCartao: 'esporte', flag: 'dept_esporte' },
  // Fechado ao público: não existe linha dept_impressao3d em feature_flags e MERCADO_UI segue desligada (ata 2026-11-11).
  { slug: 'impressao3d', rotulo: 'Impressão 3D', descricao: 'Impressoras 3D, filamentos e resinas.', tipoCartao: 'tecnologia', flag: 'dept_impressao3d' },
];

export function departamentoPorSlug(slug: string): Departamento | null {
  return DEPARTAMENTOS.find((d) => d.slug === slug) ?? null;
}

export const FLAG_KEYS: readonly string[] = DEPARTAMENTOS.map((d) => d.flag);

// Garantia em tempo de execução: todo slug do registro é uma vertical válida (e nenhuma é games).
for (const d of DEPARTAMENTOS) {
  if (!(VERTICALS as readonly string[]).includes(d.slug) || d.slug === ('games' as string)) throw new Error(`departamento inválido: ${d.slug}`);
}

export type EstadoDepartamento = 'fechado' | 'admin' | 'publico';

export interface FlagRow {
  key: string;
  enabled: boolean;
  rules: unknown;
}

/** `rules` com `{"audience":"admin"}` (ou a string "admin") = aberto só para administradores (janela de 24 h do dono). */
export function regrasSoAdmin(rules: unknown): boolean {
  if (!Array.isArray(rules)) return false;
  return rules.some((r) => r === 'admin' || (r && typeof r === 'object' && (r as { audience?: unknown }).audience === 'admin'));
}

/** Trava mestra: só o valor '1' (ou 'true') liga. Ausente/qualquer outro = desligada (tudo 404). */
export function travaMestraLigada(env: string | undefined | null): boolean {
  const v = (env ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/**
 * Função pura: decide o estado de um departamento.
 * Fechado se: trava mestra desligada, flag ausente/desligada, ou menos de MIN_MASTERS_DEPARTAMENTO masters visíveis.
 */
export function decidirEstado(input: { masterEnv: string | undefined | null; flag: FlagRow | null | undefined; mastersVisiveis: number }): EstadoDepartamento {
  if (!travaMestraLigada(input.masterEnv)) return 'fechado';
  if (!input.flag || input.flag.enabled !== true) return 'fechado';
  if (!(input.mastersVisiveis >= MIN_MASTERS_DEPARTAMENTO)) return 'fechado';
  return regrasSoAdmin(input.flag.rules) ? 'admin' : 'publico';
}

/** O espectador pode ver o departamento neste estado? */
export function estadoPermiteVer(estado: EstadoDepartamento, ehAdmin: boolean): boolean {
  return estado === 'publico' || (estado === 'admin' && ehAdmin);
}

// ---------------------------------------------------------------------------------------------
// Linha de identidade por tipo de cartão: só mostra o que o master TEM (nada estimado).
// ---------------------------------------------------------------------------------------------

export interface MasterIdentidadeInput {
  gtin: string | null;
  mpn: string | null;
  manufacturer: string | null;
  /** attributes.vertical.catalogAttributes (chaves do catálogo do ML, ex.: BRAND, MODEL). */
  catalogAttributes: Record<string, unknown> | null;
}
export interface LinhaIdentidade {
  rotulo: string;
  valor: string;
}

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function linhaIdentidade(tipo: TipoCartao, m: MasterIdentidadeInput): LinhaIdentidade[] {
  const a = m.catalogAttributes ?? {};
  const out: LinhaIdentidade[] = [];
  const add = (rotulo: string, valor: string | null) => {
    if (valor) out.push({ rotulo, valor });
  };
  const marca = txt(a.BRAND) ?? txt(m.manufacturer);
  const modelo = txt(a.ALPHANUMERIC_MODEL) ?? txt(a.MODEL);
  if (tipo === 'livro') {
    add('ISBN', txt(m.gtin) ?? txt(a.GTIN));
    add('Edição', txt(a.BOOK_EDITION));
    add('Editora', txt(a.BOOK_PUBLISHER) ?? txt(m.manufacturer));
    add('Autor', txt(a.AUTHOR));
  } else if (tipo === 'tecnologia') {
    add('Marca', marca);
    add('Part number', txt(m.mpn) ?? txt(a.MPN));
    add('GTIN', txt(m.gtin));
    add('Modelo', modelo);
  } else if (tipo === 'eletro') {
    add('Marca', marca);
    add('Modelo', modelo);
    add('Voltagem', txt(a.VOLTAGE));
  } else {
    add('Marca', marca);
    add('Modelo', modelo);
  }
  return out;
}

/** Texto do preço mediano: só com vendedores suficientes; sempre rotulado. */
export function rotuloMediana(vendedores: number): string | null {
  return vendedores >= MIN_VENDEDORES_MEDIANA ? `Mediana de ${vendedores} vendedores, apenas Mercado Livre` : null;
}

/** Valores da busca: escapa curingas do LIKE e limita tamanho. */
export function termosBusca(q: string | null | undefined): string[] {
  return (q ?? '')
    .slice(0, 80)
    .split(/\s+/)
    .map((t) => t.trim().replace(/[\\%_]/g, (c) => `\\${c}`))
    .filter((t) => t.length >= 2)
    .slice(0, 6);
}
