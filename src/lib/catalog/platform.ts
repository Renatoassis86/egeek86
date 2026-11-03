// Sem 'server-only': lógica pura (regex), importável por queries, scripts e testes.
import type { GamePlatformGen } from '@/db/schema';
import { derivePlatformFromTitle, generationsMentioned } from '@/lib/affiliate/game-classification';

/**
 * Plataforma na CAMADA DE LEITURA (F-16, auditoria 2026-11-01). Não grava nada.
 *
 *  1. Plataforma estruturada do banco (CONSOLE_VERSION do marketplace) manda.
 *  2. Se for 'unknown', deriva do título (`derivePlatformFromTitle`), mais o
 *     atalho "Xbox X"/"Xbox S" que a derivação padrão não reconhece.
 *  3. Se ainda for 'unknown' mas o título cita uma plataforma legada que o enum
 *     `game_platform_gen` não tem (Wii, Wii U, 3DS, DS, PS2, PS3, PSP, Vita,
 *     SNES, N64, GBA...), devolve o rótulo legado só para EXIBIÇÃO. Filtrar por
 *     essas plataformas exige migration (ver docs/segmentacao-plataformas-legadas.md).
 */

/** Ordem importa: a mais específica primeiro (Wii U antes de Wii, 3DS antes de DS). */
const LEGACY_PLATFORMS: Array<{ label: string; re: RegExp }> = [
  { label: 'Wii U', re: /\bwii ?u\b/ },
  { label: 'Wii', re: /\bwii\b/ },
  { label: '3DS', re: /\b3ds\b|\b2ds\b|\bnew 3ds\b/ },
  { label: 'DS', re: /\bnintendo ds\b|\bnds\b|\bdsi\b|\bds lite\b|\bds\b/ },
  { label: 'PS3', re: /\bps ?3\b|\bplaystation ?3\b/ },
  { label: 'PS2', re: /\bps ?2\b|\bplaystation ?2\b/ },
  { label: 'PS1', re: /\bps ?1\b|\bpsone\b|\bplaystation ?1\b|\bps ?one\b/ },
  { label: 'PSP', re: /\bpsp\b/ },
  { label: 'PS Vita', re: /\bps ?vita\b|\bplaystation vita\b/ },
  { label: 'SNES', re: /\bsnes\b|\bsuper nintendo\b|\bsuper nes\b/ },
  { label: 'NES', re: /\bnes\b/ },
  { label: 'N64', re: /\bn64\b|\bnintendo 64\b/ },
  { label: 'GameCube', re: /\bgame ?cube\b|\bgcn\b/ },
  { label: 'Game Boy', re: /\bgame ?boy\b|\bgba\b/ },
  { label: 'Mega Drive', re: /\bmega ?drive\b/ },
  { label: 'Dreamcast', re: /\bdreamcast\b/ },
];

function fold(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Plataforma do enum derivada do título; inclui "Xbox X|S" (sem "One"). */
export function derivePlatformFromTitleExtended(title: string | null | undefined): GamePlatformGen {
  const base = derivePlatformFromTitle(title);
  if (base !== 'unknown') return base;
  const t = fold(title ?? '');
  if (/\bxbox ?(?:x|s)\b/.test(t) && !/\bxbox ?one\b|\bone\b/.test(t)) return 'xbox_series';
  return 'unknown';
}

/** Rótulo de plataforma legada (fora do enum) citada no título, ou null. */
export function legacyPlatformLabel(title: string | null | undefined): string | null {
  const t = fold(title ?? '');
  if (!t) return null;
  for (const p of LEGACY_PLATFORMS) if (p.re.test(t)) return p.label;
  return null;
}

export interface ReadPlatform {
  /** Valor do enum (filtro/facet). 'unknown' quando nem o título resolve. */
  platform: GamePlatformGen;
  /** Só quando platform = 'unknown' e o título cita plataforma legada: exibição. */
  legacyLabel: string | null;
  /** true = veio do título, não do banco. */
  derived: boolean;
}

export function readPlatform(dbPlatform: GamePlatformGen, title: string | null | undefined): ReadPlatform {
  const reconciled = reconcilePlatform(dbPlatform, title);
  if (reconciled !== dbPlatform) {
    return reconciled === 'unknown'
      ? { platform: 'unknown', legacyLabel: legacyPlatformLabel(title), derived: true }
      : { platform: reconciled, legacyLabel: null, derived: true };
  }
  if (dbPlatform !== 'unknown') return { platform: dbPlatform, legacyLabel: null, derived: false };
  const derived = derivePlatformFromTitleExtended(title);
  if (derived !== 'unknown') return { platform: derived, legacyLabel: null, derived: true };
  return { platform: 'unknown', legacyLabel: legacyPlatformLabel(title), derived: false };
}

/** Qualquer menção a console de geração moderna (as que o enum `game_platform_gen` cobre). */
const MODERN_MENTION = /\b(?:ps ?[45]|playstation ?[45]|switch|nsw|ns2|x ?box|xone|xsx|series ?[xs])\b/;

/**
 * Plataforma reconciliada com o título (QA rodada 4, P1-A, 2026-11-03). O atributo estruturado do
 * marketplace manda, EXCETO quando o título PROVA outra plataforma:
 *  - o título cita só plataforma legada fora do enum (Wii, PS2, PS3, 3DS...) e nenhuma moderna
 *    ("Jogo Nintendo Wii: Sonic" gravado switch_1; "Memory Card PS2" gravado ps4): devolve 'unknown',
 *    único valor válido do enum para legado (o rótulo vem de `legacyPlatformLabel`);
 *  - o título cita UMA só geração moderna e ela difere da gravada ("... PS5" gravado ps4): devolve a do título.
 * Título ambíguo (cross-gen, duas famílias, compatibilidade) nunca troca nada.
 */
export function reconcilePlatform(dbPlatform: GamePlatformGen, title: string | null | undefined): GamePlatformGen {
  const t = fold(title ?? '');
  if (!t) return dbPlatform;
  if (!MODERN_MENTION.test(t) && legacyPlatformLabel(title)) return 'unknown';
  const derived = derivePlatformFromTitleExtended(title);
  if (derived !== 'unknown' && derived !== dbPlatform && generationsMentioned(title).length === 1) return derived;
  return dbPlatform;
}

/** true = o título só cita plataforma(s) legada(s) fora do enum (PS2, Wii, PSP...) e nenhuma geração moderna. */
export function titleIsLegacyPlatformOnly(title: string | null | undefined): boolean {
  const t = fold(title ?? '');
  return !!t && !MODERN_MENTION.test(t) && legacyPlatformLabel(title) !== null;
}
