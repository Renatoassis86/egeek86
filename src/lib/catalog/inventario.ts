// Sem 'server-only': regras PURAS do inventário do catálogo (agregação, filtros, CSV). Sem banco, sem rede.
// Consultas ficam em src/server/queries/catalogo-inventario.ts. Decisão do dono em 2026-11-11: catálogo por loja,
// sempre atualizado (página /admin/catalogo + docs/inventario-catalogo/).
import { VERTICALS, isVertical, type Vertical } from '@/lib/catalog/verticais';

/** Loja = departamento (vertical). Ordem de exibição das abas. */
export const LOJAS: ReadonlyArray<{ slug: Vertical; rotulo: string }> = [
  { slug: 'games', rotulo: 'Games' },
  { slug: 'impressao3d', rotulo: 'Impressão 3D' },
  { slug: 'tecnologia', rotulo: 'Tecnologia' },
  { slug: 'livros', rotulo: 'Livros' },
  { slug: 'eletrodomesticos', rotulo: 'Casa e eletrodomésticos' },
  { slug: 'eletroeletronicos', rotulo: 'Eletrônicos' },
  { slug: 'esporte', rotulo: 'Esporte' },
];

export function rotuloLoja(v: string): string {
  return LOJAS.find((l) => l.slug === v)?.rotulo ?? v;
}

export type StatusPorteiro = 'approved' | 'review' | 'rejected';
export const STATUS_PORTEIRO: readonly StatusPorteiro[] = ['approved', 'review', 'rejected'];
export const ROTULO_STATUS: Record<StatusPorteiro, string> = { approved: 'Aprovado', review: 'Em revisão', rejected: 'Rejeitado' };

/** Sem veredito gravado = visível (aprovado), igual ao filtro público (catalogGateVisibleSql). */
export function statusDoVeredito(v: string | null | undefined): StatusPorteiro {
  return v === 'review' || v === 'rejected' ? v : 'approved';
}

export type RedeBucket = 'ml' | 'shopee' | 'amazon' | 'outras';
export const REDES_FILTRO = ['mercado-livre', 'shopee', 'amazon'] as const;
export const ROTULO_REDE: Record<string, string> = { 'mercado-livre': 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon' };

export function redeBucket(slug: string | null | undefined): RedeBucket {
  if (slug === 'mercado-livre') return 'ml';
  if (slug === 'shopee') return 'shopee';
  if (slug === 'amazon') return 'amazon';
  return 'outras';
}

/** Percentual com 1 casa; null quando não há denominador (nunca inventa 0 %). */
export function pct(n: number, d: number): number | null {
  if (!(d > 0)) return null;
  return Math.round((n / d) * 1000) / 10;
}

// ---------------------------------------------------------------- agregação de totais por loja

export interface MasterStatusRow { vertical: string; status: string; n: number }
export interface OfferAggRow {
  vertical: string;
  rede: string | null;
  ativas: number;
  oficiais: number;
  min_cents: number | string | null;
  max_cents: number | string | null;
  ultima_coleta: string | Date | null;
}
export interface AvgRow { vertical: string; n: number }

export interface LojaTotais {
  vertical: Vertical;
  mastersAprovados: number;
  mastersRevisao: number;
  mastersRejeitados: number;
  mastersTotal: number;
  mastersComMedia: number;
  pctComMedia: number | null;
  ofertasMl: number;
  ofertasShopee: number;
  ofertasAmazon: number;
  ofertasOutras: number;
  ofertasAtivas: number;
  ofertasOficiais: number;
  pctLinkOficial: number | null;
  menorPrecoCents: number | null;
  maiorPrecoCents: number | null;
  ultimaColeta: string | null;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toIso(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function totaisVazios(vertical: Vertical): LojaTotais {
  return {
    vertical, mastersAprovados: 0, mastersRevisao: 0, mastersRejeitados: 0, mastersTotal: 0, mastersComMedia: 0, pctComMedia: null,
    ofertasMl: 0, ofertasShopee: 0, ofertasAmazon: 0, ofertasOutras: 0, ofertasAtivas: 0, ofertasOficiais: 0, pctLinkOficial: null,
    menorPrecoCents: null, maiorPrecoCents: null, ultimaColeta: null,
  };
}

/** Dobra as linhas agregadas do banco em um objeto por loja. Toda loja de VERTICALS aparece (zerada se vazia). */
export function foldTotais(masters: MasterStatusRow[], offers: OfferAggRow[], avgs: AvgRow[]): Record<Vertical, LojaTotais> {
  const out = {} as Record<Vertical, LojaTotais>;
  for (const v of VERTICALS) out[v] = totaisVazios(v);
  for (const r of masters) {
    if (!isVertical(r.vertical)) continue;
    const t = out[r.vertical];
    const s = statusDoVeredito(r.status);
    const n = Number(r.n) || 0;
    if (s === 'approved') t.mastersAprovados += n;
    else if (s === 'review') t.mastersRevisao += n;
    else t.mastersRejeitados += n;
    t.mastersTotal += n;
  }
  for (const r of offers) {
    if (!isVertical(r.vertical)) continue;
    const t = out[r.vertical];
    const n = Number(r.ativas) || 0;
    const b = redeBucket(r.rede);
    if (b === 'ml') t.ofertasMl += n;
    else if (b === 'shopee') t.ofertasShopee += n;
    else if (b === 'amazon') t.ofertasAmazon += n;
    else t.ofertasOutras += n;
    t.ofertasAtivas += n;
    t.ofertasOficiais += Number(r.oficiais) || 0;
    const mn = toNum(r.min_cents);
    const mx = toNum(r.max_cents);
    if (mn != null && (t.menorPrecoCents == null || mn < t.menorPrecoCents)) t.menorPrecoCents = mn;
    if (mx != null && (t.maiorPrecoCents == null || mx > t.maiorPrecoCents)) t.maiorPrecoCents = mx;
    const iso = toIso(r.ultima_coleta);
    if (iso && (t.ultimaColeta == null || iso > t.ultimaColeta)) t.ultimaColeta = iso;
  }
  for (const r of avgs) {
    if (!isVertical(r.vertical)) continue;
    out[r.vertical].mastersComMedia += Number(r.n) || 0;
  }
  for (const v of VERTICALS) {
    const t = out[v];
    t.pctLinkOficial = pct(t.ofertasOficiais, t.ofertasAtivas);
    t.pctComMedia = pct(t.mastersComMedia, t.mastersAprovados);
  }
  return out;
}

// ---------------------------------------------------------------- filtros da listagem

export const PAGE_SIZE = 50;
/** Teto de páginas navegáveis (50 linhas por página x 200 = 10 mil, acima da base atual de ~7,5 mil masters). */
export const MAX_PAGES = 200;
export const SORTS = ['nome', 'ofertas', 'preco'] as const;
export type Sort = (typeof SORTS)[number];
export type FiltroLink = 'com' | 'sem' | '';

export interface Filtros {
  q: string;
  marca: string;
  rede: '' | (typeof REDES_FILTRO)[number];
  status: '' | StatusPorteiro;
  link: FiltroLink;
  sort: Sort;
  page: number;
}

type SP = Record<string, string | string[] | undefined>;
function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** Normaliza o que vem da URL: nada fora da lista fixa passa; texto livre é aparado e limitado. */
export function parseFiltros(sp: SP): Filtros {
  const rede = one(sp.rede);
  const status = one(sp.status);
  const link = one(sp.link);
  const sort = one(sp.sort);
  const page = Math.floor(Number(one(sp.page)));
  return {
    q: one(sp.q).trim().slice(0, 80),
    marca: one(sp.marca).trim().slice(0, 60),
    rede: (REDES_FILTRO as readonly string[]).includes(rede) ? (rede as Filtros['rede']) : '',
    status: (STATUS_PORTEIRO as readonly string[]).includes(status) ? (status as StatusPorteiro) : '',
    link: link === 'com' || link === 'sem' ? link : '',
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Sort) : 'nome',
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGES) : 1,
  };
}

/** Escapa `%`, `_` e `\` para uso em ILIKE (a busca do dono é literal, não padrão). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------- linha do catálogo e CSV

export interface CatalogoLinha {
  id: string;
  slug: string;
  vertical: string;
  nome: string;
  marca: string | null;
  modelo: string | null;
  plataforma: string | null;
  tipo: string | null;
  chave: string | null;
  status: StatusPorteiro;
  ofertasMl: number;
  ofertasShopee: number;
  ofertasAmazon: number;
  ofertasOutras: number;
  ofertasTotal: number;
  ofertasOficiais: number;
  menorPrecoCents: number | null;
  redeMenorPreco: string | null;
  mediaCents: number | null;
  mediaDia: string | null;
  ultimaColeta: string | null;
  ofertaBaratoId: string | null;
  ofertaBaratoSlug: string | null;
  ofertaBaratoUrl: string | null;
}

/** Caminho da página do produto no site: games usa /ofertas/<slug da oferta>; demais lojas, /mercado/<loja>/<slug do master>. */
export function caminhoProduto(l: Pick<CatalogoLinha, 'vertical' | 'slug' | 'ofertaBaratoSlug'>): string | null {
  if (l.vertical === 'games') return l.ofertaBaratoSlug ? `/ofertas/${l.ofertaBaratoSlug}` : null;
  return l.slug ? `/mercado/${l.vertical}/${l.slug}` : null;
}

export const CSV_BOM = '﻿';

export const CSV_COLUMNS = [
  'id', 'loja', 'nome', 'marca', 'modelo', 'plataforma', 'tipo', 'chave_identidade', 'status_porteiro',
  'ofertas_mercado_livre', 'ofertas_shopee', 'ofertas_amazon', 'ofertas_outras', 'ofertas_ativas', 'ofertas_link_oficial',
  'menor_preco', 'rede_menor_preco', 'media_unica', 'media_dia', 'ultima_coleta',
  'url_produto', 'id_oferta_mais_barata', 'url_oferta_mais_barata',
] as const;

/** Escapa um campo CSV (RFC 4180): aspas, vírgulas, ponto e vírgula, quebras de linha e CR viram campo entre aspas. */
export function csvEscape(v: string | number | null | undefined, delim = ','): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(delim) ||s.includes('\n') || s.includes('\r')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvLine(values: Array<string | number | null | undefined>, delim = ','): string {
  return values.map((v) => csvEscape(v, delim)).join(delim) + '\r\n';
}

/** Preço em reais com 2 casas; `virgula` troca o ponto decimal (Excel pt-BR). null fica vazio (nunca 0 inventado). */
export function centsParaReais(cents: number | null | undefined, virgula = false): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  const s = (cents / 100).toFixed(2);
  return virgula ? s.replace('.', ',') : s;
}

export interface CsvOpts {
  /** 'pt' = separador `;` e decimal `,` (abre direto no Excel em português). Padrão: vírgula e ponto. */
  formato?: 'padrao' | 'pt';
  /** Origem absoluta do site para montar url_produto (ex.: https://espacogeek86.com.br). Vazio = caminho relativo. */
  origem?: string;
  /** Deixa url_oferta_mais_barata vazia (arquivos versionados no repositório não devem carregar link de afiliado). */
  omitirUrlOferta?: boolean;
}

export function cabecalhoCsv(opts: CsvOpts = {}): string {
  return csvLine([...CSV_COLUMNS], opts.formato === 'pt' ? ';' : ',');
}

export function linhaParaCsv(l: CatalogoLinha, opts: CsvOpts = {}): string {
  const pt = opts.formato === 'pt';
  const caminho = caminhoProduto(l);
  return csvLine(
    [
      l.id, rotuloLoja(l.vertical), l.nome, l.marca, l.modelo, l.plataforma, l.tipo, l.chave, l.status,
      l.ofertasMl, l.ofertasShopee, l.ofertasAmazon, l.ofertasOutras, l.ofertasTotal, l.ofertasOficiais,
      centsParaReais(l.menorPrecoCents, pt), l.redeMenorPreco, centsParaReais(l.mediaCents, pt), l.mediaDia, l.ultimaColeta,
      caminho ? `${opts.origem ?? ''}${caminho}` : '', l.ofertaBaratoId, opts.omitirUrlOferta ? '' : l.ofertaBaratoUrl,
    ],
    pt ? ';' : ','
  );
}

// ---------------------------------------------------------------- evolução diária (snapshots)

export interface SnapshotDia {
  day: string;
  mastersAprovados: number;
  mastersRevisao: number;
  mastersRejeitados: number;
  ofertasMl: number;
  ofertasShopee: number;
  ofertasAmazon: number;
  ofertasOutras: number;
  ofertasOficiais: number;
  pctOficial: number | null;
}

/** Diferença entre o dia mais recente e o mais antigo da série (null com menos de 2 pontos). */
export function deltaSerie(serie: SnapshotDia[], campo: 'mastersAprovados' | 'ofertasMl' | 'ofertasShopee' | 'ofertasAmazon'): number | null {
  if (serie.length < 2) return null;
  const ord = [...serie].sort((a, b) => a.day.localeCompare(b.day));
  return ord[ord.length - 1][campo] - ord[0][campo];
}
