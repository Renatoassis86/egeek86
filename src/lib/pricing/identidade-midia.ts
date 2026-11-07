import { GAME_FORMAT_LABELS, GAME_PLATFORM_GEN_LABELS, GAME_EDITION_TYPE_LABELS } from '@/lib/affiliate/labels';

/**
 * Identidade da mídia no cabeçalho da camada (ata 2026-11-06-indicadores-decisao-cliente, decisão 1).
 * Função pura: só traduz os campos JÁ classificados do master em linhas "rótulo: valor". Campo desconhecido vira
 * `valor: null` (a tela mostra "não informado"); NUNCA se afirma um valor sem dado (ex.: "Físico" sobre `unknown`).
 * "Conteúdo" (não "Edição"): o enum só distingue jogo completo, DLC, pacote e bundle; edição de colecionador, região
 * e lacre NÃO existem como dado e por isso não aparecem.
 */
export interface IdentidadeItem {
  rotulo: string;
  valor: string | null;
}

export interface IdentidadeMidia {
  itens: IdentidadeItem[];
  /** Regra de identidade aplicada às médias (uma linha, linguagem de comprador). */
  regra: string;
}

export interface IdentidadeFonte {
  productType: 'game' | 'console' | 'accessory';
  gameFormat: 'physical' | 'digital' | 'unknown';
  gamePlatformGen: keyof typeof GAME_PLATFORM_GEN_LABELS;
  gameEditionType: keyof typeof GAME_EDITION_TYPE_LABELS;
}

export const REGRA_IDENTIDADE =
  'Outra região, outra geração ou edição limitada ficam em produtos separados. Usado e Open Box não entram na média.';

export function buildIdentidadeMidia(f: IdentidadeFonte): IdentidadeMidia {
  const plataforma = f.gamePlatformGen === 'unknown' ? null : GAME_PLATFORM_GEN_LABELS[f.gamePlatformGen];
  if (f.productType !== 'game') {
    // Console: o campo diz QUAL console é. Acessório: sem classificação confiável, só a plataforma quando existe.
    return { itens: [{ rotulo: f.productType === 'console' ? 'Console' : 'Plataforma', valor: plataforma }], regra: REGRA_IDENTIDADE };
  }
  return {
    itens: [
      { rotulo: 'Formato', valor: f.gameFormat === 'unknown' ? null : GAME_FORMAT_LABELS[f.gameFormat] },
      { rotulo: 'Plataforma', valor: plataforma },
      { rotulo: 'Conteúdo', valor: f.gameEditionType === 'unknown' ? null : GAME_EDITION_TYPE_LABELS[f.gameEditionType] },
    ],
    regra: REGRA_IDENTIDADE,
  };
}
