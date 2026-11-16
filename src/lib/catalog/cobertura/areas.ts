// Sem 'server-only': REGISTRO ÚNICO de ÁREAS da cobertura total (2026-11-16). Departamento -> segmentos -> fontes por rede.
// Área nova ou rede nova entra por CONFIGURAÇÃO aqui (e segmentos em config*.ts), sem código novo no coletor. Ver docs/cobertura-total-2026-11-16/02-arquitetura.md.
import { SEGMENTS, type NonGamesVertical } from '@/lib/catalog/vertical/config';

export type Rede = 'ml' | 'amazon' | 'shopee';
export type DepartamentoCobertura = NonGamesVertical | 'games';

/** Fonte do Mercado Livre: raízes da árvore de categorias, destaques (mais vendidos) e tendências por categoria. */
export interface FonteML {
  raizes: string[];
  /** Níveis abaixo da raiz para pedir destaques (1 = filhos diretos). */
  profundidade: number;
  /** Ignora categoria com menos anúncios que isto (ruído de cauda). */
  minAnuncios: number;
  destaques: boolean;
  tendencias: boolean;
}
/** Fonte da Amazon (leitor assistido na aba logada do dono): nós de navegação e rankings. NÃO medida ao vivo nesta fase. */
export interface FonteAmazon {
  nos: string[];
  rankings: Array<'bestsellers' | 'new-releases' | 'movers-shakers'>;
  /** Teto de páginas de ranking por ciclo (RAM baixa do Chrome e ritmo da conta logada). */
  paginasPorCiclo: number;
}
/** Fonte da Shopee (API de afiliados productOfferV2): categorias productCatId, mais vendidos primeiro. */
export interface FonteShopee {
  categorias: number[];
  /** O servidor da Shopee responde System Error 10000 em páginas fundas (medido: páginas 10 a 32 por categoria). */
  paginasMax: number;
}

export interface AreaConfig {
  departamento: DepartamentoCobertura;
  rotulo: string;
  /** Prioridade (0 = primeiro): valor comercial na Black Friday (cliques, ticket, margem de oferta). */
  prioridade: number;
  fontes: { ml?: FonteML; amazon?: FonteAmazon; shopee?: FonteShopee };
  /** Cobertura mínima aceitável de destaques (fração dos mais vendidos que já estão no banco) antes do alerta. */
  coberturaMinima: number;
}

export const AREAS: AreaConfig[] = [
  { departamento: 'games', rotulo: 'Games', prioridade: 0, coberturaMinima: 0.8, fontes: { ml: { raizes: ['MLB1144'], profundidade: 2, minAnuncios: 2000, destaques: true, tendencias: true }, amazon: { nos: ['videogames'], rankings: ['bestsellers', 'new-releases'], paginasPorCiclo: 8 }, shopee: { categorias: [], paginasMax: 30 } } },
  { departamento: 'eletrodomesticos', rotulo: 'Casa', prioridade: 1, coberturaMinima: 0.6, fontes: { ml: { raizes: ['MLB5726'], profundidade: 2, minAnuncios: 3000, destaques: true, tendencias: true }, amazon: { nos: ['appliances'], rankings: ['bestsellers', 'new-releases'], paginasPorCiclo: 6 }, shopee: { categorias: [], paginasMax: 10 } } },
  { departamento: 'eletroeletronicos', rotulo: 'Eletrônicos', prioridade: 2, coberturaMinima: 0.6, fontes: { ml: { raizes: ['MLB1000'], profundidade: 2, minAnuncios: 3000, destaques: true, tendencias: true }, amazon: { nos: ['electronics'], rankings: ['bestsellers', 'new-releases'], paginasPorCiclo: 6 } } },
  { departamento: 'tecnologia', rotulo: 'Tecnologia', prioridade: 3, coberturaMinima: 0.6, fontes: { ml: { raizes: ['MLB1648', 'MLB1051'], profundidade: 2, minAnuncios: 3000, destaques: true, tendencias: true }, amazon: { nos: ['computers'], rankings: ['bestsellers', 'new-releases'], paginasPorCiclo: 6 } } },
  { departamento: 'esporte', rotulo: 'Esporte', prioridade: 4, coberturaMinima: 0.5, fontes: { ml: { raizes: ['MLB1276'], profundidade: 2, minAnuncios: 5000, destaques: true, tendencias: true }, amazon: { nos: ['sports'], rankings: ['bestsellers'], paginasPorCiclo: 4 }, shopee: { categorias: [], paginasMax: 10 } } },
  { departamento: 'livros', rotulo: 'Livros', prioridade: 5, coberturaMinima: 0.5, fontes: { ml: { raizes: ['MLB437616'], profundidade: 1, minAnuncios: 1000, destaques: true, tendencias: true }, amazon: { nos: ['books'], rankings: ['bestsellers', 'new-releases'], paginasPorCiclo: 4 } } },
  { departamento: 'impressao3d', rotulo: 'Impressão 3D', prioridade: 6, coberturaMinima: 0.7, fontes: { ml: { raizes: [], profundidade: 1, minAnuncios: 100, destaques: false, tendencias: false } } },
];

export const areaDe = (d: string): AreaConfig | undefined => AREAS.find((a) => a.departamento === d);

/** Segmentos (tipos de produto) de uma área, derivados da configuração de semeadura: não se escreve a lista duas vezes. */
export const segmentosDaArea = (d: string): string[] => SEGMENTS.filter((s) => s.vertical === d).map((s) => s.key);

/** Problemas de configuração do registro (vazio = ok). Roda no teste: área sem fonte, prioridade repetida, raiz inválida. */
export function validarAreas(areas: AreaConfig[] = AREAS): string[] {
  const erros: string[] = [];
  const prios = new Set<number>();
  for (const a of areas) {
    if (prios.has(a.prioridade)) erros.push(`prioridade repetida: ${a.departamento}`);
    prios.add(a.prioridade);
    if (!a.fontes.ml && !a.fontes.amazon && !a.fontes.shopee) erros.push(`${a.departamento}: sem nenhuma fonte`);
    for (const r of a.fontes.ml?.raizes ?? []) if (!/^MLB\d+$/.test(r)) erros.push(`${a.departamento}: raiz ML inválida ${r}`);
    if (a.coberturaMinima <= 0 || a.coberturaMinima > 1) erros.push(`${a.departamento}: coberturaMinima fora de (0,1]`);
    if (a.departamento !== 'games' && segmentosDaArea(a.departamento).length === 0) erros.push(`${a.departamento}: nenhum segmento de semeadura`);
  }
  return erros;
}
