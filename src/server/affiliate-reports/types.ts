export type ConversionSource = 'shopee_api' | 'ml_csv';
export type ConversionStatus = 'pending' | 'completed' | 'cancelled' | 'refunded' | 'unpaid' | 'unknown';

/** Linha de conversão já normalizada, pronta para o upsert em affiliate_conversions. */
export interface NormalizedConversion {
  source: ConversionSource;
  networkSlug: 'shopee' | 'mercadolivre';
  /** Chave de idempotência (única junto com `source`). */
  externalId: string;
  orderId: string | null;
  orderStatus: ConversionStatus;
  rawStatus: string | null;
  clickAt: Date | null;
  purchaseAt: Date | null;
  /** external_ref de affiliate_offers quando o dado traz o item (ex.: `shopee-123`, `MLB123`). */
  itemRef: string | null;
  itemName: string | null;
  quantity: number | null;
  itemPriceCents: number | null;
  commissionCents: number | null;
  netCommissionCents: number | null;
  refundCents: number | null;
  /** subId / utm_content (Shopee) ou tag/campanha (ML). Só guardado, nunca inferido. */
  subId: string | null;
  attributionType: string | null;
  raw: Record<string, unknown>;
}

export interface RejectedRow {
  /** Linha 1-based no arquivo original (0 = aviso geral). */
  line: number;
  reason: string;
  raw: string[];
}

export interface ImportSummary {
  source: ConversionSource;
  batch: string;
  received: number;
  valid: number;
  rejected: RejectedRow[];
  inserted: number;
  updated: number;
  attributedToOffer: number;
  unattributed: number;
}
