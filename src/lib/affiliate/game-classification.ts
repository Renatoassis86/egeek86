import type { GameFormat, GamePlatformGen, GameEditionType, GameEditionSource } from '@/db/schema';

/**
 * Normaliza o atributo estruturado FORMAT do Mercado Livre. Isso é dado
 * estruturado da API (não texto livre) — não precisa de heurística.
 */
export function normalizeGameFormat(raw: string | null): GameFormat {
  const value = raw?.trim().toLowerCase();
  if (value === 'físico' || value === 'fisico') return 'physical';
  if (value === 'digital') return 'digital';
  return 'unknown';
}

/**
 * Normaliza o atributo estruturado CONSOLE_VERSION do Mercado Livre. Achado
 * ao testar ao vivo (2026-07-13, catálogos de "Mario Kart World"): esse
 * atributo às vezes NÃO existe (catálogo novo/incompleto) — nesses casos
 * caímos num fallback textual sobre outros campos (ex: EDITION às vezes
 * traz "Nintendo Switch 2 (capa japonesa)" em texto livre).
 */
export function normalizeGamePlatformGen(consoleVersion: string | null, fallbackText?: string | null): GamePlatformGen {
  const value = consoleVersion?.trim().toLowerCase();
  if (value === 'switch 2') return 'switch_2';
  if (value === 'switch') return 'switch_1';

  const text = fallbackText?.toLowerCase() ?? '';
  if (/switch\s*2/.test(text)) return 'switch_2';
  if (/\bswitch\b/.test(text)) return 'switch_1';

  return 'unknown';
}

const UPGRADE_KEYWORDS = [
  /pacote de melhoria/i,
  /upgrade pack/i,
  /\bupgrade\b/i,
  /pacote de atualiza[cç][aã]o/i,
];

const DLC_KEYWORDS = [
  /\bdlc\b/i,
  /expans[aã]o/i,
  /season pass/i,
  /passe de temporada/i,
  /conte[uú]do adicional/i,
  /booster course pass/i,
];

const BUNDLE_SEPARATOR = / \+ /;

export interface EditionClassificationInput {
  title: string | null;
}

export interface EditionClassificationResult {
  gameEditionType: GameEditionType;
  source: GameEditionSource;
}

/**
 * Única parte da classificação que exige heurística sobre texto — o
 * Mercado Livre não estrutura "jogo completo vs. DLC/upgrade/bundle" como
 * atributo. Ordem importa: um título como "Pacote de melhoria X + Y" precisa
 * cair em upgrade_pack, não em bundle — por isso upgrade/DLC são checados
 * ANTES do separador " + ".
 */
export function classifyGameEdition(input: EditionClassificationInput): EditionClassificationResult {
  const title = input.title?.trim() ?? '';
  if (!title) return { gameEditionType: 'unknown', source: 'keyword_rule' };

  if (UPGRADE_KEYWORDS.some((pattern) => pattern.test(title))) {
    return { gameEditionType: 'upgrade_pack', source: 'keyword_rule' };
  }
  if (DLC_KEYWORDS.some((pattern) => pattern.test(title))) {
    return { gameEditionType: 'dlc', source: 'keyword_rule' };
  }
  if (BUNDLE_SEPARATOR.test(title)) {
    return { gameEditionType: 'bundle', source: 'keyword_rule' };
  }

  return { gameEditionType: 'full_game', source: 'keyword_rule' };
}
