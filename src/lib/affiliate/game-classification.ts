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
  if (value === 'playstation 5' || value === 'ps5') return 'ps5';
  if (value === 'playstation 4' || value === 'ps4') return 'ps4';
  if (/xbox series/.test(value ?? '')) return 'xbox_series';
  if (value === 'xbox one') return 'xbox_one';
  if (value === 'xbox 360') return 'xbox_360';

  return derivePlatformFromTitle(fallbackText);
}

/**
 * Deriva a plataforma a partir do texto livre do título. Regra de negócio:
 * nunca desistir para 'unknown' se o título indica a plataforma (31 jogos
 * 'unknown' no banco, 2026-10-31, já traziam a plataforma no nome).
 *
 * Achado real (2026-08-03): "Organizador de Jogos Playstation XBOX
 * Nintendo..." caía em switch_1 porque a cascata parava na PRIMEIRA
 * plataforma que batesse. Antes de escolher UMA plataforma, conta quantas
 * famílias de console o título menciona: 2 ou mais é acessório universal e
 * devolve 'unknown'. Pelo mesmo motivo, "PS4 / PS5" no mesmo título é
 * ambíguo (o disco é de uma geração só) e também devolve 'unknown', para
 * revisão manual em vez de fundir no master errado.
 * "Xbox One / Series X|S" (cross-gen) mantém o comportamento histórico:
 * xbox_series.
 */
export function derivePlatformFromTitle(title: string | null | undefined): GamePlatformGen {
  const text = (title ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/switch\s+sports/g, 'switchsports');
  if (!text.trim()) return 'unknown';

  const switch2 = /\b(nintendo\s+)?switch\s*2\b|\bns2\b/;
  const hasSwitch2 = switch2.test(text);
  const textNoSwitch2 = text.replace(new RegExp(switch2.source, 'g'), ' ');
  const hasSwitch1 = /\bswitch\b|\bnsw\b|switchsports/.test(textNoSwitch2);
  const hasPs5 = /\b(playstation\s*5|ps\s*5)\b/.test(text);
  const hasPs4 = /\b(playstation\s*4|ps\s*4)\b/.test(text);
  const hasPsGeneric = /\bplaystation\b|\bps[23]\b/.test(text);
  const hasXboxSeries = /xbox\s*series|xbox\s*serie\b|\bseries\s*[xs]\b|\bxsx\b/.test(text);
  const hasXbox360 = /xbox\s*360|\bx360\b/.test(text);
  const hasXboxOne = /xbox\s*one|\bxb1\b|\bxone\b/.test(text);
  const hasXboxGeneric = /\bxbox\b/.test(text);

  const families = [
    hasSwitch2 || hasSwitch1,
    hasPs5 || hasPs4 || hasPsGeneric,
    hasXboxSeries || hasXbox360 || hasXboxOne || hasXboxGeneric,
  ].filter(Boolean).length;
  if (families >= 2) return 'unknown';

  if (hasSwitch2 && hasSwitch1) return 'unknown'; // "Switch 1 e Switch 2": ambíguo
  if (hasSwitch2) return 'switch_2';
  if (hasSwitch1) return 'switch_1';
  if (hasPs5 && hasPs4) return 'unknown';
  if (hasPs5) return 'ps5';
  if (hasPs4) return 'ps4';
  if (hasXboxSeries) return 'xbox_series';
  // "xbox 360" antes de "xbox one": "Xbox 360 / One" não pode cair só em one.
  if (hasXbox360) return 'xbox_360';
  if (hasXboxOne) return 'xbox_one';

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
