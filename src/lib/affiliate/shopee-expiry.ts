// Sem 'server-only': funções puras (sem banco, sem rede), testadas em scripts/test-shopee-expiracao.ts.

/**
 * REGRA DE EXPIRAÇÃO DAS OFERTAS SHOPEE (dono, 2026-11-12): só expira depois de 3 respostas VÁLIDAS da API sem preço aproveitável
 * (item não devolvido / sem preço), colhidas em HORAS DIFERENTES. Falha de consulta (10030, rede, 10000...) nunca conta como falta.
 *
 * - Estado: `consecutive_miss_count` (já existe) + `last_checked_at`. Contador > 0 implica que a última checagem foi uma falta
 *   (toda checagem com preço zera o contador), então `last_checked_at` é o instante da falta anterior: não precisa de coluna nova.
 * - Duas faltas na mesma hora cheia contam UMA. Oferta ativa com falta pendente é reconsultada só depois de 1 h (SHOPEE_MISS_RECHECK_MS),
 *   o que garante horas diferentes e, no mínimo, 2 h entre a 1ª e a 3ª falta.
 * - VARIAÇÃO DE PREÇO (dono, 2026-11-12: "em nenhuma loja recusar item por variação"): o item com faixa de preço entre variações (priceMax/
 *   priceMin amplo) está DISPONÍVEL. A coleta usa o menor preço (priceMin, "a partir de"), confirma preço, zera faltas e REATIVA a
 *   oferta expirada como qualquer outra. `ambiguous_price` não é mais produzido pelo parser; o motivo continua aceito aqui (nunca conta
 *   como falta) só por compatibilidade com registros e chamadores antigos.
 * - Oferta já expirada nunca "expira de novo"; é reconsultada 1x por dia e reativada se a API devolver preço válido.
 */
export const SHOPEE_MAX_MISSES = 3;
export const SHOPEE_MISS_RECHECK_MS = 60 * 60 * 1000;
export const SHOPEE_EXPIRED_RECHECK_MS = 24 * 60 * 60 * 1000;
export const SHOPEE_ACTIVE_RECHECK_MS = 30 * 60 * 1000;
/** Fatia fixa por rodada para reconsultar ofertas expiradas (vencem a cada 24 h; ~15 por tick de 5 min cobrem ~4.300/dia). */
export const SHOPEE_EXPIRED_SLICE_PER_RUN = 15;

/** A resposta da API para o item (com ou sem variação ampla de preço) conta como DISPONÍVEL quando traz um preço mínimo válido. */
export function itemDisponivel(r: { status: 'ok' | 'unavailable'; variantAmbigua?: boolean }): boolean {
  return r.status === 'ok';
}

export type ShopeeMissReason = 'not_returned' | 'no_price' | 'no_name' | 'ambiguous_price' | 'implausible_price';

export interface MissInput {
  status: string;
  missCount: number;
  lastCheckedAt: Date | null;
  now: Date;
  reason: ShopeeMissReason;
}

export interface MissDecision {
  /** Novo valor de consecutive_miss_count. */
  missCount: number;
  /** Esta checagem foi contada como uma falta nova. */
  counted: boolean;
  /** A oferta deve passar a 'expired' agora. */
  expire: boolean;
}

export const hourBucket = (d: Date): number => Math.floor(d.getTime() / 3_600_000);

export function decideMiss(i: MissInput): MissDecision {
  if (i.status === 'expired') return { missCount: i.missCount, counted: false, expire: false };
  if (i.reason === 'ambiguous_price') return { missCount: i.missCount, counted: false, expire: false };
  const mesmaHoraDaFaltaAnterior = i.missCount > 0 && i.lastCheckedAt != null && hourBucket(i.lastCheckedAt) === hourBucket(i.now);
  if (mesmaHoraDaFaltaAnterior) return { missCount: i.missCount, counted: false, expire: false };
  const missCount = i.missCount + 1;
  return { missCount, counted: true, expire: missCount >= SHOPEE_MAX_MISSES };
}

/**
 * A reativação (expired -> active) só vale se NÃO houver pergunta pendente na fila de classificação para a oferta: oferta nascida de
 * dúvida de identidade (rascunho que depois expirou) não pode voltar à média por ter reaparecido na API.
 */
export function podeReativar(i: { status: string; temPerguntaPendente: boolean; bloqueadaPeloDono: boolean }): boolean {
  return i.status === 'expired' && !i.temPerguntaPendente && !i.bloqueadaPeloDono;
}
