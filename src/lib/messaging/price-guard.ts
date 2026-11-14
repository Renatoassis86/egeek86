// Porta de segurança de PREÇO da mensagem (2026-11-14). PURO: sem banco, sem rede.
//
// Origem: docs/investigacao-preco-mensagem-vs-site-2026-11-14.md. A mensagem do Telegram saiu com R$ 8.513,22 e o anúncio do link
// mostrava R$ 9.399: a oferta (sem `external_item_id`, casada só por vendedor + catálogo) alternava de preço a cada ~16 s porque
// recebia o preço de um anúncio IRMÃO do mesmo vendedor em outro catálogo, e a reconferência ao vivo foi "pulada" porque o preço
// gravado era fresco (vinha do irmão).
//
// Duas regras, ambas com motivo fechado:
//  1. `preco_oscilando`: oferta que troca de preço 3 vezes ou mais em 24 h entre poucos valores (voltando a um valor já visto) não
//     vai em mensagem até estabilizar (as trocas saírem da janela de 24 h).
//  2. `link_sem_conferencia`: oferta do Mercado Livre sem identificação confiável do anúncio (sem `external_item_id` e sem id MLB na
//     URL) nunca tem a reconferência ao vivo pulada; sem a conferência ao vivo agora e batendo com o preço detectado, não sai.

export type MotivoGuarda = 'preco_oscilando' | 'link_sem_conferencia';

export interface PricePoint {
  at: Date;
  priceCents: number;
}

export const GUARD = {
  /** Janela em que se contam as trocas de preço. */
  OSC_WINDOW_HOURS: 24,
  /** Trocas mínimas na janela (cada mudança de preço entre snapshots consecutivos conta uma). */
  OSC_MIN_CHANGES: 3,
  /** Amplitude mínima (máx sobre mín) para ser oscilação e não ruído. */
  OSC_MIN_AMPLITUDE_PCT: 5,
  /** "Poucos valores": no máximo isto de preços distintos na janela (queda em degraus não é oscilação). */
  OSC_MAX_DISTINCT_PRICES: 4,
} as const;

export interface OscilacaoResult {
  oscilando: boolean;
  /** Trocas de preço dentro da janela. */
  trocas: number;
  distintos: number;
  amplitudePct: number;
}

/**
 * Oscilação = 3 ou mais trocas na janela, amplitude >= 5%, no máximo 4 preços distintos E retorno a um preço já visto (A→B→A).
 * O retorno distingue "vai e volta" de uma queda ou alta em degraus (A→B→C→D), que é variação real de mercado.
 * `points` em qualquer ordem; snapshots só nascem quando o preço muda (e no batimento de 24 h), então repetidos consecutivos
 * (batimento) são descartados. O ponto de base (último snapshot ANTES da janela) pode vir na lista: define o preço de partida.
 */
export function avaliarOscilacao(points: PricePoint[], now: Date, opts: { windowHours?: number } = {}): OscilacaoResult {
  const windowMs = (opts.windowHours ?? GUARD.OSC_WINDOW_HOURS) * 3_600_000;
  const since = now.getTime() - windowMs;
  const ordered = points
    .filter((p) => Number.isFinite(p.priceCents) && p.priceCents > 0 && p.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  // Base: o último ponto anterior à janela (se houver) abre a sequência; os demais anteriores são ignorados.
  const before = ordered.filter((p) => p.at.getTime() < since);
  const inside = ordered.filter((p) => p.at.getTime() >= since);
  const seqRaw = [...(before.length ? [before[before.length - 1]!] : []), ...inside];
  const seq: number[] = [];
  for (const p of seqRaw) if (seq.length === 0 || seq[seq.length - 1] !== p.priceCents) seq.push(p.priceCents);
  const trocas = Math.max(0, seq.length - 1);
  const distintos = new Set(seq).size;
  const min = seq.length ? Math.min(...seq) : 0;
  const max = seq.length ? Math.max(...seq) : 0;
  const amplitudePct = min > 0 ? Math.round(((max - min) / min) * 10_000) / 100 : 0;
  const voltouAValorJaVisto = seq.length > distintos;
  const oscilando =
    trocas >= GUARD.OSC_MIN_CHANGES &&
    amplitudePct >= GUARD.OSC_MIN_AMPLITUDE_PCT &&
    distintos <= GUARD.OSC_MAX_DISTINCT_PRICES &&
    voltouAValorJaVisto;
  return { oscilando, trocas, distintos, amplitudePct };
}

/** Texto do motivo de bloqueio por oscilação (entra no `live_note`/`reason` da fila). */
export function motivoOscilacao(o: OscilacaoResult): string {
  return `preco_oscilando: ${o.trocas} trocas em ${GUARD.OSC_WINDOW_HOURS} h entre ${o.distintos} preços (amplitude ${o.amplitudePct}%)`;
}

/**
 * O anúncio da oferta está identificado de forma confiável? `external_item_id` gravado, ou id MLB de ANÚNCIO na URL
 * (link de catálogo /p/MLB... e link curto meli.la não identificam o anúncio). Quem chama passa o id já extraído.
 */
export function anuncioIdentificado(t: { externalItemId?: string | null; itemIdFromUrl?: string | null }): boolean {
  return !!(t.externalItemId && t.externalItemId.trim()) || !!(t.itemIdFromUrl && t.itemIdFromUrl.trim());
}
