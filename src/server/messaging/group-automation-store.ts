import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  AUTOMATION_CACHE_TTL_MS,
  AUTOMATION_FLAG_KEY,
  automationRowValues,
  parseAutomation,
  type AutomationConfig,
  type AutomationState,
  type FlagRow,
} from '@/lib/messaging/group-automation';

/**
 * Estado da automação das mensagens: UMA linha de `feature_flags` (key 'group_messages_auto').
 * Leitura com cache de 30 s por instância (o kill-switch pela linha vale em até 30 s, sem deploy).
 * Linha ausente = 'off'. Qualquer erro de leitura = 'off' (falha fechada).
 */
let cache: { at: number; value: AutomationConfig } | null = null;

export function invalidateAutomationCache(): void {
  cache = null;
}

export async function getAutomation(opts: { fresh?: boolean; now?: number } = {}): Promise<AutomationConfig> {
  const t = opts.now ?? Date.now();
  if (!opts.fresh && cache && t - cache.at < AUTOMATION_CACHE_TTL_MS) return cache.value;
  let value: AutomationConfig;
  try {
    const rows = await db.execute<{ enabled: boolean; rules: unknown; updated_at: string | Date }>(sql`
      SELECT enabled, rules, updated_at FROM feature_flags WHERE key = ${AUTOMATION_FLAG_KEY} LIMIT 1
    `);
    value = parseAutomation((rows[0] as FlagRow | undefined) ?? null);
  } catch {
    value = parseAutomation({ enabled: false, rules: {} });
  }
  cache = { at: t, value };
  return value;
}

/** Grava o estado (ação do admin, ou pausa automática em falha definitiva). Preserva o limite de saída de inscritos já configurado. */
export async function setAutomationState(state: AutomationState, note?: string): Promise<AutomationConfig> {
  const current = await getAutomation({ fresh: true });
  const v = automationRowValues(state, current.maxMemberDropPct);
  const rules = note ? { ...v.rules, note: note.slice(0, 200), changedAt: new Date().toISOString() } : { ...v.rules, changedAt: new Date().toISOString() };
  await db.execute(sql`
    INSERT INTO feature_flags (key, description, enabled, rules, updated_at)
    VALUES (${AUTOMATION_FLAG_KEY}, 'Automação das mensagens para grupos: off | shadow | on (rules.state)', ${v.enabled}, ${JSON.stringify(rules)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, rules = EXCLUDED.rules, updated_at = now()
  `);
  invalidateAutomationCache();
  return getAutomation({ fresh: true });
}
