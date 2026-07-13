/**
 * Geração assistida de mensagem — monta texto pronto para copiar/colar em
 * grupos de WhatsApp. NÃO envia nada automaticamente (decisão de escopo:
 * bots/APIs de envio automático ficam para uma fase futura).
 */

import { formatBRL, formatDiscountLabel } from '@/lib/format';

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function isLowestPrice(currentPriceCents: number, lowestPriceCents: number): boolean {
  return currentPriceCents <= lowestPriceCents;
}

export interface WhatsappMessageInput {
  title: string;
  networkName: string;
  currentPriceCents: number;
  listPriceCents?: number | null;
  lowestPriceCents: number;
  lowestPriceAt: Date;
  coupon?: { code: string; discountType: string; discountValue: string } | null;
  shortLink: string;
}

export function buildWhatsappMessage(input: WhatsappMessageInput): string {
  const lowest = isLowestPrice(input.currentPriceCents, input.lowestPriceCents);

  const priceLine = input.listPriceCents
    ? `De ~${formatBRL(input.listPriceCents)}~ por *${formatBRL(input.currentPriceCents)}*`
    : `Por *${formatBRL(input.currentPriceCents)}*`;

  const historyLine = lowest
    ? '📉 *Menor preço já registrado até agora!*'
    : `📉 Menor histórico: ${formatBRL(input.lowestPriceCents)} (em ${formatDate(input.lowestPriceAt)})`;

  const couponLine = input.coupon
    ? `🏷️ Cupom *${input.coupon.code}* (${formatDiscountLabel(input.coupon.discountType, input.coupon.discountValue)})`
    : null;

  const lines = [
    `🔥 *${input.title}*`,
    priceLine,
    historyLine,
    couponLine,
    `🛒 ${input.shortLink}`,
    `_${input.networkName} — confira disponibilidade antes de comprar._`,
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}
