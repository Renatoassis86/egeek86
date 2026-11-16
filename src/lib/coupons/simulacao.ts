// Regras PURAS do gancho de simulação de checkout (/api/ingest/cofre-simulacao). Testadas por comportamento em scripts/test-cofre-cupons-122.ts.

export const PISO_VALOR_FINAL_PCT = 0.3;

export type MotivoRecusaSimulacao = 'resultado_invalido' | 'valor_final_invalido' | 'cupom_inexistente_na_oferta' | 'oferta_de_outra_rede';

export interface LinhaSimulacao {
  resultado: unknown;
  valorFinalCents?: unknown;
  couponRef: string;
  /** Rede da oferta e rede da aba que enviou (origem). */
  redeOferta: string;
  redeAba: string | null;
  precoOfertaCents: number;
  /** Existe leitura com essa campanha (24 h) ou linha do cofre para (oferta, cupom)? */
  refExiste: boolean;
}

/** Só `aplicado`/`nao_aplicado` existem: "comprado" ou qualquer outro valor é recusado (a simulação nunca compra). */
export const resultadoValido = (r: unknown): r is 'aplicado' | 'nao_aplicado' => r === 'aplicado' || r === 'nao_aplicado';

export function avaliarLinhaSimulacao(l: LinhaSimulacao): { ok: true } | { ok: false; motivo: MotivoRecusaSimulacao } {
  if (!resultadoValido(l.resultado)) return { ok: false, motivo: 'resultado_invalido' };
  if (l.redeAba && l.redeOferta !== l.redeAba) return { ok: false, motivo: 'oferta_de_outra_rede' };
  if (l.resultado === 'aplicado') {
    const v = l.valorFinalCents;
    if (!(typeof v === 'number' && Number.isInteger(v) && v > 0 && v < l.precoOfertaCents && v >= l.precoOfertaCents * PISO_VALOR_FINAL_PCT)) return { ok: false, motivo: 'valor_final_invalido' };
  }
  const refOk = (l.couponRef === 'sem_campanha' && l.redeOferta !== 'mercado-livre') || l.refExiste;
  if (!refOk) return { ok: false, motivo: 'cupom_inexistente_na_oferta' };
  return { ok: true };
}

/** Limite por hora (atômico no servidor): usadas + novas acima do limite = 429. */
export const excedeLimite = (usadas: number, novas: number, limite: number): boolean => usadas + novas > limite;
