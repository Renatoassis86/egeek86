// Sem 'server-only': tipos e regras PURAS das lojas (seções com canal próprio), importáveis por testes e scripts.
// Leitura do banco em src/server/stores.ts. Plano: docs/plano-lojas-secoes-canais-2026-11-11.md. INERTE: nada do envio lê isto ainda.
import { VERTICALS } from '@/lib/catalog/verticais';
import type { Vertical } from '@/lib/catalog/verticais';

export const LOJA_GAMES = 'games';

export const STORE_STAGES = [
  'rascunho',
  'aguardando_canal',
  'canal_verificado',
  'semeando',
  'catalogo_em_revisao',
  'links_prontos',
  'shadow',
  'ativa',
  'pausada',
] as const;
export type StoreStage = (typeof STORE_STAGES)[number];

/** Estado de envio (feature flag group_messages_auto:<slug>); loja sem linha = off. Só leitura nesta etapa. */
export type StoreAutoState = 'off' | 'shadow' | 'on';

export type MessageClassKey = 'alerta' | 'radar' | 'insight' | 'resumo' | 'cupom' | 'plataforma';

export interface StoreLimits {
  dailyCap: number;
  hourlyCap: number;
  soundCap: number;
  spacingDayMin: number;
  spacingNightMin: number;
  classCaps: Record<MessageClassKey, number>;
  productGapMin: number;
  cardDailyCap: number;
  night: { from: number; until: number };
  radarComposite: boolean;
  diversityBy: 'platform' | 'segment' | 'brand';
  classes: MessageClassKey[];
  blackFridayDailyCap: number | null;
}

/** Tetos duros de validação (plano 1.3): dia <= 400, hora <= 60, espaçamento >= 1 min. */
export const LIMITES_DUROS = { dailyCap: 400, hourlyCap: 60, minSpacing: 1 } as const;

/** Padrão sugerido para lojas NOVAS (decisão D2 do dono pendente): 60/dia, 12/hora, 3 min de dia, 5 de noite, 10 sonoras. */
export const DEFAULT_STORE_LIMITS: StoreLimits = {
  dailyCap: 60,
  hourlyCap: 12,
  soundCap: 10,
  spacingDayMin: 3,
  spacingNightMin: 5,
  classCaps: { alerta: 60, radar: 40, insight: 30, resumo: 4, cupom: 20, plataforma: 0 },
  productGapMin: 90,
  cardDailyCap: 4,
  night: { from: 22, until: 8 },
  radarComposite: false,
  diversityBy: 'segment',
  classes: ['alerta', 'insight', 'radar', 'resumo', 'cupom'],
  blackFridayDailyCap: null,
};

/**
 * Limites da loja GAMES = valores de HOJE em RULES (group-rules.ts). Usados como falha segura de getStores() e como alvo do teste de
 * paridade (o teste compara com RULES e com a linha gravada pela migração 0032).
 */
export const GAMES_STORE_LIMITS: StoreLimits = {
  dailyCap: 400,
  hourlyCap: 60,
  soundCap: 20,
  spacingDayMin: 1,
  spacingNightMin: 1,
  classCaps: { alerta: 400, radar: 400, insight: 400, resumo: 400, cupom: 400, plataforma: 400 },
  productGapMin: 90,
  cardDailyCap: 4,
  night: { from: 22, until: 8 },
  radarComposite: false,
  diversityBy: 'platform',
  classes: ['alerta', 'insight', 'radar', 'resumo', 'cupom', 'plataforma'],
  blackFridayDailyCap: 400,
};

export interface StoreSection {
  id: string;
  slug: string;
  name: string;
  stage: StoreStage;
  telegramChatId: string | null;
  telegramChatTitle: string | null;
  telegramVerifiedAt: Date | null;
  telegramBotCanPost: boolean;
  whatsappGroupUrl: string | null;
  limits: StoreLimits;
  adTag: string | null;
  brand: Record<string, unknown>;
  verticals: Vertical[];
  archivedAt: Date | null;
}

const num = (v: unknown, d: number, min: number, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : d;
  return Math.min(max, Math.max(min, n));
};

/** Mescla o jsonb `limits` da loja com os padrões (`base`) e aplica os tetos duros. Campo ausente ou inválido herda `base`. */
export function resolveLimits(raw: unknown, base: StoreLimits = DEFAULT_STORE_LIMITS): StoreLimits {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cc = (r.classCaps && typeof r.classCaps === 'object' ? r.classCaps : {}) as Record<string, unknown>;
  const classCaps = { ...base.classCaps };
  for (const k of Object.keys(classCaps) as MessageClassKey[]) classCaps[k] = num(cc[k], base.classCaps[k], 0, LIMITES_DUROS.dailyCap);
  const night = (r.night && typeof r.night === 'object' ? r.night : {}) as Record<string, unknown>;
  const classes = Array.isArray(r.classes)
    ? (r.classes.filter((c): c is MessageClassKey => typeof c === 'string' && c in base.classCaps) as MessageClassKey[])
    : base.classes;
  const div = r.diversityBy === 'platform' || r.diversityBy === 'segment' || r.diversityBy === 'brand' ? r.diversityBy : base.diversityBy;
  return {
    dailyCap: num(r.dailyCap, base.dailyCap, 0, LIMITES_DUROS.dailyCap),
    hourlyCap: num(r.hourlyCap, base.hourlyCap, 0, LIMITES_DUROS.hourlyCap),
    soundCap: num(r.soundCap, base.soundCap, 0, LIMITES_DUROS.dailyCap),
    spacingDayMin: num(r.spacingDayMin, base.spacingDayMin, LIMITES_DUROS.minSpacing, 24 * 60),
    spacingNightMin: num(r.spacingNightMin, base.spacingNightMin, LIMITES_DUROS.minSpacing, 24 * 60),
    classCaps,
    productGapMin: num(r.productGapMin, base.productGapMin, 0, 7 * 24 * 60),
    cardDailyCap: num(r.cardDailyCap, base.cardDailyCap, 0, 50),
    night: { from: num(night.from, base.night.from, 0, 23), until: num(night.until, base.night.until, 0, 23) },
    radarComposite: typeof r.radarComposite === 'boolean' ? r.radarComposite : base.radarComposite,
    diversityBy: div,
    classes: classes.length ? classes : base.classes,
    blackFridayDailyCap:
      r.blackFridayDailyCap === null || r.blackFridayDailyCap === undefined ? base.blackFridayDailyCap : num(r.blackFridayDailyCap, 0, 0, LIMITES_DUROS.dailyCap),
  };
}

/** Falha segura de getStores(): só a loja games (limites de hoje; chat vem do ambiente via chatForStore). */
export function lojaGamesPadrao(): StoreSection {
  return {
    id: 'fallback-games',
    slug: LOJA_GAMES,
    name: 'Games',
    stage: 'ativa',
    telegramChatId: null,
    telegramChatTitle: null,
    telegramVerifiedAt: null,
    telegramBotCanPost: false,
    whatsappGroupUrl: null,
    limits: GAMES_STORE_LIMITS,
    adTag: null,
    brand: { label: 'Games' },
    verticals: ['games'],
    archivedAt: null,
  };
}

/** Verticais que uma loja pode possuir (a mesma lista fixa do CHECK do banco). */
export const VERTICAIS = VERTICALS;
