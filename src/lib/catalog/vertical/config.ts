// Sem 'server-only': configuração pura (sem banco, sem rede), importável por coletor, scripts tsx e testes.
import type { Vertical } from '@/lib/catalog/verticais';

/**
 * CONFIGURAÇÃO POR DEPARTAMENTO (vertical) E SEGMENTO. ADR 0008 itens 4 e 5; ata 2026-11-08, Fase 2.
 * Base empírica: docs/medicao-cobertura-verticais-2026-11-08.md (medição real, 58 chamadas ao ML).
 *
 * - `domains`: domain_id do catálogo do ML aceitos. A busca por termo traz lixo (medição: "ssd" trouxe notebook, "bola"
 *   trouxe balão e mochila), então o domínio do CATÁLOGO decide, nunca o termo buscado.
 * - `terms`: whitelist de termos de busca (marca/linha). Todos PROVISÓRIOS até o dono/guardião curar (ver `TERMS_STATUS`).
 * - `profile`: como se forma a chave de identidade forte (ver identity.ts).
 * - `seedRank`: ordem de semeadura (1 = primeiro), conforme a medição: melhor sinal primeiro, pior por último.
 *
 * Os valores de domínio vêm de REGEX derivadas dos domain_id observados na medição; só `MLB-BOOKS` foi conferido
 * ao vivo neste trabalho (dry-run de livros). Os demais precisam ser conferidos no primeiro dry-run de cada segmento.
 */

export type NonGamesVertical = Exclude<Vertical, 'games'>;

/** Estratégia de identidade do segmento (ver identity.ts). */
export type IdentityStrategy =
  /** Livro: só ISBN-13 (GTIN com prefixo 978/979 e dígito verificador válido). Sem ISBN => revisão. */
  | 'isbn_only'
  /** GTIN válido primeiro; depois MPN+marca; depois marca+modelo(+extras) com atributos obrigatórios; senão revisão. */
  | 'gtin_then_attrs'
  /** Sem identificador confiável na API (tênis): nunca gera chave forte, sempre revisão humana. */
  | 'review_only';

export interface SegmentConfig {
  key: string;
  vertical: NonGamesVertical;
  label: string;
  /** domain_id aceitos (já normalizados pelo ML, ex.: "MLB-GRAPHICS_CARDS"). */
  domains: RegExp[];
  /** domain_id que NUNCA entram, mesmo que casem `domains` (ex.: impressora 3D dentro de impressora). */
  excludeDomains?: RegExp[];
  /** Whitelist de termos de busca em /products/search (provisória). */
  terms: string[];
  profile: {
    strategy: IdentityStrategy;
    /** Atributos OBRIGATÓRIOS da chave de fallback (sem GTIN/MPN). Ausente algum => revisão. */
    fallbackAttrs: string[];
    /** Atributos que, SE presentes, entram na chave (separam variantes: voltagem, capacidade...). Nunca juntam. */
    keyExtras: string[];
  };
  /** Frequência-alvo de recoleta em minutos (ata: TV/notebook 5-10 na BF, eletro 15-30, livros/esporte 60). */
  targetRefreshMin: number;
  /** Ordem de semeadura (1 = primeiro). */
  seedRank: number;
  /** Nota da medição que justifica a ordem. */
  rationale: string;
}

/** Estado de curadoria da whitelist de termos: 'provisorio' = proposta do engenheiro, NÃO aprovada pelo dono. */
export const TERMS_STATUS: 'provisorio' | 'aprovado' = 'provisorio';

/** Teto de recoleta imposto pelos termos do ML (5.3: conteúdo exibido atualizado ao menos a cada 6 h para anúncios). */
export const MAX_REFRESH_MIN = 360;

const BRAND_MODEL = ['BRAND', 'MODEL'];

export const SEGMENTS: SegmentConfig[] = [
  {
    key: 'livros',
    vertical: 'livros',
    label: 'Livros',
    domains: [/^MLB-BOOKS$/],
    terms: ['livro 9788535914849'],
    profile: { strategy: 'isbn_only', fallbackAttrs: [], keyExtras: [] },
    targetRefreshMin: 60,
    seedRank: 1,
    rationale: 'GTIN (ISBN) em 10/10 dos resultados; catálogo com 16 vendedores. Recorte (quais livros) pendente do dono.',
  },
  {
    key: 'placa-de-video',
    vertical: 'tecnologia',
    label: 'Placa de vídeo',
    domains: [/GRAPHICS_CARDS/],
    terms: ['placa de video rtx 4060', 'placa de video rtx 5060', 'placa de video rx 7600'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: ['BRAND', 'SERIES', 'MODEL', 'EDITION', 'MEMORY_SIZE'], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 30,
    seedRank: 2,
    rationale: 'Domínio 10/10, GTIN 10/10; só 6 ofertas no catálogo medido.',
  },
  {
    key: 'impressora',
    vertical: 'tecnologia',
    label: 'Impressora',
    domains: [/PRINTERS$/],
    excludeDomains: [/3D_PRINTERS/],
    terms: ['impressora multifuncional ecotank', 'impressora multifuncional smart tank', 'impressora laser brother'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VERSION', 'VOLTAGE'] },
    targetRefreshMin: 30,
    seedRank: 3,
    rationale: 'Domínio 10/10, GTIN 8/10; catálogo medido com 5 ofertas e original_price em 4.',
  },
  {
    key: 'soundbar',
    vertical: 'eletroeletronicos',
    label: 'Soundbar',
    domains: [/HOME_THEATERS|SOUNDBAR/],
    terms: ['soundbar samsung', 'soundbar jbl'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE'] },
    targetRefreshMin: 30,
    seedRank: 4,
    rationale: 'GTIN 8/10, 3 ofertas; atenção ao 206 (paging.total 4, 3 itens).',
  },
  {
    key: 'air-fryer',
    vertical: 'eletrodomesticos',
    label: 'Air fryer',
    domains: [/AIR_FRYERS/],
    terms: ['air fryer mondial', 'air fryer philips walita'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE', 'TOTAL_CAPACITY'] },
    targetRefreshMin: 30,
    seedRank: 5,
    rationale: 'Domínio 8/10, GTIN 7/10, 2 ofertas (média frágil com poucos vendedores).',
  },
  {
    key: 'bola',
    vertical: 'esporte',
    label: 'Bola de futebol',
    domains: [/FOOTBALL_BALLS/],
    terms: ['bola de futebol campo nike'],
    // COLOR fora da chave: regra do dono "cor junta" (exceto tênis). Cor segue como atributo do master, não como identidade.
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 60,
    seedRank: 6,
    rationale: 'Domínio 8/10 (balão e mochila na busca), GTIN 10/10, 4 ofertas.',
  },
  {
    key: 'notebook',
    vertical: 'tecnologia',
    label: 'Notebook',
    domains: [/NOTEBOOKS$/],
    terms: ['notebook acer aspire 5', 'notebook lenovo ideapad', 'notebook dell inspiron'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 30,
    seedRank: 7,
    rationale: 'GTIN 7/10, mas 2 de 2 catálogos medidos sem vendedor (404).',
  },
  {
    key: 'ssd',
    vertical: 'tecnologia',
    label: 'SSD',
    domains: [/HARD_DRIVES_AND_SSDS/],
    terms: ['ssd nvme 1tb kingston', 'ssd 1tb wd'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL, 'CAPACITY'], keyExtras: [] },
    targetRefreshMin: 30,
    seedRank: 8,
    rationale: 'GTIN 9/10, mas busca "ssd" trouxe notebook e 2 de 2 catálogos sem vendedor.',
  },
  {
    key: 'smart-tv',
    vertical: 'eletroeletronicos',
    label: 'Smart TV',
    domains: [/TELEVISIONS/],
    terms: ['smart tv 55 samsung', 'smart tv 50 lg'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE'] },
    targetRefreshMin: 30,
    seedRank: 9,
    rationale: 'Domínio 10/10, GTIN 8/10, mas 2 de 2 catálogos medidos sem vendedor.',
  },
  {
    key: 'geladeira',
    vertical: 'eletrodomesticos',
    label: 'Geladeira',
    domains: [/REFRIGERATORS/],
    terms: ['geladeira frost free electrolux'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE', 'TOTAL_CAPACITY'] },
    targetRefreshMin: 30,
    seedRank: 10,
    rationale: 'Domínio 10/10, GTIN 10/10, mas 2 de 2 catálogos sem vendedor; voltagem separa variantes.',
  },
  {
    key: 'maquina-de-lavar',
    vertical: 'eletrodomesticos',
    label: 'Máquina de lavar',
    domains: [/^MLB-WASHING_MACHINES/],
    terms: ['maquina de lavar 12kg brastemp'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE', 'TOTAL_CAPACITY'] },
    targetRefreshMin: 30,
    seedRank: 11,
    rationale: 'Pior sinal de eletro: catálogos mini/brinquedo sem MODEL, 2 de 2 sem vendedor.',
  },
  {
    key: 'impressora-3d',
    vertical: 'tecnologia',
    label: 'Impressora 3D',
    domains: [/3D_PRINTERS$/],
    terms: ['impressora 3d creality ender', 'impressora 3d bambu lab'],
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VERSION'] },
    targetRefreshMin: 60,
    seedRank: 12,
    rationale: 'Domínio misturado com filamento (3 de 10); catálogo medido com 1 vendedor.',
  },
  {
    key: 'tenis-de-corrida',
    vertical: 'esporte',
    label: 'Tênis de corrida',
    domains: [/SNEAKERS/],
    terms: ['tenis de corrida asics'],
    // Medição: GTIN 0/10. Sem identificador confiável: só revisão humana (tamanho é variante da oferta, nunca produto).
    profile: { strategy: 'review_only', fallbackAttrs: ['BRAND', 'MODEL', 'VERSION', 'GENDER', 'COLOR'], keyExtras: [] },
    targetRefreshMin: 60,
    seedRank: 13,
    rationale: 'Sem GTIN em 10/10 resultados; 0 catálogos com oferta em 2 tentativas. Só revisão.',
  },
];

export function segmentByKey(key: string): SegmentConfig | undefined {
  return SEGMENTS.find((s) => s.key === key);
}

/** Segmentos de um departamento, na ordem de semeadura. */
export function segmentsOf(vertical: NonGamesVertical): SegmentConfig[] {
  return SEGMENTS.filter((s) => s.vertical === vertical).sort((a, b) => a.seedRank - b.seedRank);
}

/** Todos os segmentos na ordem de semeadura recomendada pela medição. */
export function seedOrder(): SegmentConfig[] {
  return [...SEGMENTS].sort((a, b) => a.seedRank - b.seedRank);
}

/** domain_id está entre os aceitos do segmento (e fora dos excluídos). */
export function domainMatches(seg: SegmentConfig, domainId: string | null | undefined): boolean {
  if (!domainId) return false;
  if (seg.excludeDomains?.some((r) => r.test(domainId))) return false;
  return seg.domains.some((r) => r.test(domainId));
}

/** Nome da variável de ambiente do kill-switch: VERTICAL_<NOME>_ENABLED (desligado por padrão). */
export function killSwitchEnvName(vertical: string): string {
  return `VERTICAL_${vertical.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ENABLED`;
}

/** Kill-switch ligado SOMENTE com '1' ou 'true' (qualquer outra coisa, inclusive ausente, é desligado). */
export function isVerticalEnabled(vertical: string, env: Record<string, string | undefined> = process.env): boolean {
  const v = (env[killSwitchEnvName(vertical)] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** Intervalo de recoleta de um departamento: a menor frequência-alvo dos segmentos, limitada pelos termos do ML. */
export function refreshMinutesFor(vertical: NonGamesVertical, env: Record<string, string | undefined> = process.env): number {
  const override = Number(env[`VERTICAL_${vertical.toUpperCase()}_REFRESH_MIN`]);
  const base = segmentsOf(vertical).reduce((m, s) => Math.min(m, s.targetRefreshMin), Number.POSITIVE_INFINITY);
  const wanted = Number.isFinite(override) && override > 0 ? override : Number.isFinite(base) ? base : 30;
  return Math.min(Math.max(1, Math.floor(wanted)), MAX_REFRESH_MIN);
}
