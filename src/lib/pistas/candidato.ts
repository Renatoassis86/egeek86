// Sem 'server-only': PURO. Monta a entrada da admissao a partir da linha de group_messages (candidate jsonb) e da oferta.
import { classificarTipo } from '@/lib/catalog/tipos-produto';
import { marcaDoItem } from '@/lib/messaging/marcas-lojas';
import { normalizaNome } from '@/lib/messaging/cota-item';
import type { Candidate } from '@/lib/messaging/group-rules';
import type { MasterPista } from './admissao';

export interface FatosOferta { url: string | null; pend: boolean; viva: boolean }

/** Tipo gravado no candidato ou derivado do nome; games nao tem taxonomia (null). */
export function tipoDoCandidato(vertical: string, c: Record<string, unknown>): string | null {
  if (vertical === 'games') return null;
  const t = c.tipo as string | null | undefined;
  if (t) return t;
  const nome = c.name as string | undefined;
  return nome ? classificarTipo(vertical, nome) : null;
}

export function marcaDoCandidato(vertical: string, c: Record<string, unknown>): string | null {
  return marcaDoItem(vertical, normalizaNome(String(c.name ?? '')).replace(/\s+/g, ' ').trim());
}

export function masterDeLinha(p: { vertical: string; master_product_id: string | null; price_cents_detected: string | number | null; candidate: Record<string, unknown> }, of?: FatosOferta): MasterPista {
  const c = p.candidate as unknown as Candidate;
  return {
    masterProductId: p.master_product_id ?? c.masterProductId, vertical: p.vertical, name: String(c.name ?? ''), priceCents: Number(p.price_cents_detected ?? c.priceCents ?? 0),
    trigger: c.trigger, offerIds: c.offerIds ?? [], networkSlug: c.networkSlug, held: !!c.held, dropPct: c.dropPct ?? null, belowAvgPct: c.belowAvgPct ?? null,
    sendable: c.sendable !== false, notSendableReason: c.notSendableReason ?? null, status: c.status ?? 'auto', confirmedAt: c.confirmedAt, cls: c.cls,
    couponRef: c.couponRef, regua: c.regua, platformLabel: c.platformLabel ?? null,
    ofertaViva: of ? of.viva : null, affiliateUrl: of?.url ?? null, affiliateLinkPending: of?.pend ?? false,
  };
}
