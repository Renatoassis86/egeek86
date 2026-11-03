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
 * Erros de digitação comuns do nome PlayStation ("Playstatio 2", "Play station",
 * "Playstaion"): o PS2 legado escapava das regexes de plataforma e o jogo caía
 * em revisão por "sem plataforma". Recebe texto já sem acento e em minúsculas.
 */
export function fixPlatformTypos(text: string): string {
  return text.replace(
    /\bplay ?station\b|\bplaystatio\b|\bplaystaion\b|\bplaystaton\b|\bplaystion\b|\bplaystatoin\b|\bplaystaiton\b|\bplaystatin\b|\bplaystatio n\b/g,
    'playstation'
  );
}

/**
 * "Compatível com PS5", "roda no PS5", "retrocompatível com Xbox One X": o
 * console citado é só a compatibilidade, não o disco. Remove essas menções para
 * que a geração do DISCO seja a única que sobra. Texto já sem acento/minúsculo.
 */
const COMPAT_MENTION =
  /\b(?:retro ?)?compativel(?:\s+(?:com|c|no|na|em|para|p))?\s+(?:o\s+|a\s+)?(?:nintendo\s+)?(?:playstation\s*\d|ps\s*\d|xbox\s*(?:series\s*[xs]?|serie|one(?:\s*[xs])?|360)|series\s*[xs]|switch\s*2?)\b|\b(?:roda|rodando|jogavel|funciona|executa)\s+(?:no|na|em)\s+(?:o\s+|a\s+)?(?:playstation\s*\d|ps\s*\d|xbox\s*(?:series\s*[xs]?|serie|one(?:\s*[xs])?|360))\b/g;

export function stripCompatMentions(text: string): string {
  return text.replace(COMPAT_MENTION, ' ');
}

/**
 * Versão larga, SÓ para decidir a(s) geração(ões) do disco: remove a cláusula inteira depois de
 * "compatível com", "retrocompatível com", "roda no", até o próximo separador. "Battlefield 3 Xbox 360
 * Roda no Xbox One e Series X" cita o 360 como disco. Se tirar a cláusula apagar TODA menção de
 * plataforma ("Controle Compatível PS5"), vale o texto original (o alvo de compatibilidade é a plataforma).
 */
const COMPAT_CLAUSE = /\b(?:retro ?)?compativel\b[^()\-+|;,]*|\b(?:roda|rodando|jogavel|funciona|executa)\s+(?:no|na|em)\b[^()\-+|;,]*/g;
const ANY_PLATFORM = /\bps\s*[1-5]\b|\bplaystation\b|\bxbox\b|\bswitch\b|\bnsw\b|\bns2\b|\bseries\s*[xs]\b|\bxsx\b|\bwii\b|\b3ds\b/;

export function stripCompatClauses(text: string): string {
  const stripped = text.replace(COMPAT_CLAUSE, ' ');
  return ANY_PLATFORM.test(stripped) ? stripped : text;
}

/** Famílias de console e as gerações (discos) que o título cita, já descontada a "compatibilidade". */
export function generationsMentioned(title: string | null | undefined): string[] {
  const t = stripCompatClauses(
    fixPlatformTypos(
      (title ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
    )
  );
  const out: string[] = [];
  if (/\b(playstation\s*4|ps\s*4)\b/.test(t)) out.push('ps4');
  if (/\b(playstation\s*5|ps\s*5)\b/.test(t)) out.push('ps5');
  // "Xbox One / Series" (Series sem X/S, depois de One e um separador) também é a geração Series;
  // "A Telltale Game Series - Xbox One" não (Series ali é nome de coleção).
  const oneThenSeries = /\bone\s*(?:[/|,&+-]|\be\b|\band\b|\bou\b)\s*(?:xbox\s*)?series\b/;
  if (/xbox\s*series|xbox\s*serie\b|\b(?:series\s*[xs]|serie\s+[xs])\b|\bxsx\b/.test(t) || oneThenSeries.test(t)) out.push('xbox_series');
  if (/xbox\s*one|\bxone\b|\bxb1\b/.test(t)) out.push('xbox_one');
  if (/xbox\s*360|\bx360\b/.test(t)) out.push('xbox_360');
  const sw2 = /\b(nintendo\s+)?switch\s*2\b|\bns2\b/;
  if (sw2.test(t)) out.push('switch_2');
  if (/\bswitch\b|\bnsw\b/.test(t.replace(new RegExp(sw2.source, 'g'), ' '))) out.push('switch_1');
  return out.sort();
}

/**
 * O título cita mais de uma geração da MESMA família (PS4+PS5, Xbox One+Series,
 * Switch 1+2)? Decisão do dono (2026-11-03): cross-gen são jogos diferentes, um
 * por geração; anúncio que cita duas sem deixar claro o disco fica "em revisão".
 */
export function mentionsMultipleGenerations(title: string | null | undefined): boolean {
  const g = generationsMentioned(title);
  const ps = g.filter((x) => x === 'ps4' || x === 'ps5').length;
  const xbox = g.filter((x) => x.startsWith('xbox')).length;
  const sw = g.filter((x) => x.startsWith('switch')).length;
  return ps >= 2 || xbox >= 2 || sw >= 2;
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
  let text = (title ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/switch\s+sports/g, 'switchsports');
  if (!text.trim()) return 'unknown';
  text = stripCompatClauses(fixPlatformTypos(text));

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

/**
 * Plataformas legadas (fora do enum game_platform_gen) citadas no título:
 * "GTA V Xbox X" com oferta "GTA 5 PS3" só é pego se o PS3 for reconhecido.
 * Wii U e Wii são plataformas diferentes (a oferta de Wii U não entra no master de Wii).
 */
export function legacyPlatformsMentioned(title: string | null | undefined): string[] {
  const t = fixPlatformTypos(
    (title ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  );
  const out: string[] = [];
  const noWiiU = t.replace(/\bwii ?u\b/g, ' ');
  if (/\bwii ?u\b/.test(t)) out.push('wii_u');
  if (/\bwii\b/.test(noWiiU)) out.push('wii');
  if (/\bps ?3\b|\bplaystation ?3\b/.test(t)) out.push('ps3');
  if (/\bps ?2\b|\bplaystation ?2\b/.test(t)) out.push('ps2');
  if (/\bps ?1\b|\bpsone\b|\bplaystation ?1\b/.test(t)) out.push('ps1');
  if (/\bpsp\b/.test(t)) out.push('psp');
  if (/\bvita\b|\bps ?vita\b/.test(t)) out.push('vita');
  if (/\b3ds\b/.test(t)) out.push('3ds');
  if (/\b2ds\b/.test(t)) out.push('2ds');
  if (/\bnintendo ds\b|\bnds\b/.test(t)) out.push('ds');
  if (/\bgame ?cube\b/.test(t)) out.push('gamecube');
  if (/\bn64\b|\bnintendo 64\b/.test(t)) out.push('n64');
  if (/\bsnes\b|\bsuper nintendo\b/.test(t)) out.push('snes');
  if (/\bgba\b|\bgame ?boy\b/.test(t)) out.push('gba');
  if (/\bmega ?drive\b|\bmaster system\b|\bsaturn\b|\bdreamcast\b|\batari\b/.test(t)) out.push('sega_atari');
  return out.sort();
}
