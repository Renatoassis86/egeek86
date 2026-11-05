// Modulo PURO: status final de uma execucao registrada em collector_runs.
export type RunStatus = 'ok' | 'partial' | 'error';

export function deriveRunStatus(c: {
  queries: number; // consultas feitas a fonte (grupos/ofertas)
  checked: number; // com resposta valida
  errors: number;
  stoppedBecause: string | null;
  budgetExhausted: boolean;
  fatal?: boolean;
}): RunStatus {
  if (c.fatal) return 'error';
  // Nada deu certo e houve falha: o tick inteiro foi perdido.
  if (c.queries > 0 && c.checked === 0 && c.errors > 0) return 'error';
  if (c.stoppedBecause || c.budgetExhausted) return 'partial';
  return 'ok';
}

/** Limita o meta a ~4 KB para nunca estourar a linha: acima disso guarda so as chaves e o tamanho. */
export function capMeta(meta: Record<string, unknown> | undefined, maxChars = 4000): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    const s = JSON.stringify(meta);
    if (s.length <= maxChars) return meta;
    return { truncated: true, size: s.length, keys: Object.keys(meta) };
  } catch {
    return { unserializable: true };
  }
}
