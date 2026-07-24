/**
 * Geração assistida de mensagem — monta texto pronto para copiar/colar em
 * grupos de WhatsApp. NÃO envia nada automaticamente (decisão de escopo:
 * bots/APIs de envio automático ficam para uma fase futura).
 */

import { formatBRL, formatDiscountLabel } from '@/lib/format';

const BRAND_NAME = 'Espaço Geek 86';
const BRAND_SLOGAN = 'o cofre da cultura geek';

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
  /** Preço "de" manual (campo opcional do form de registro de preço) — quando presente, tem prioridade sobre a média calculada. */
  listPriceCents?: number | null;
  /** Preço médio real entre todas as lojas/plataformas desde o cadastro do produto até hoje (não é só desse vendedor). */
  avgPriceCents?: number | null;
  /** Menor preço já visto em QUALQUER loja/plataforma rastreada pra esse jogo (não só nessa oferta). */
  lowestEverCents: number;
  lowestEverAt: Date;
  coupon?: { code: string; discountType: string; discountValue: string } | null;
  shortLink: string;
  siteUrl: string;
  /** true = ainda não tem link de afiliado real cadastrado — nunca gera mensagem promocional pra compartilhar nesse estado. */
  affiliateLinkPending: boolean;
}

/**
 * Enquanto a oferta não tem link de afiliado real (só o placeholder/link
 * pendente), a mensagem gerada é um LEMBRETE PRO ADMIN, não uma promoção pra
 * compartilhar — compartilhar agora mandaria gente pro Mercado Livre sem
 * nenhum rastreio de comissão. Texto claro o bastante pra nunca ser colado
 * num grupo por engano.
 */
function buildPendingLinkReminder(input: WhatsappMessageInput): string {
  return [
    '⚠️ *Link de afiliado pendente*',
    '',
    `Essa oferta (*${input.title}*) ainda não tem o link de afiliado real cadastrado.`,
    '',
    'Cole o link de afiliado antes de gerar a mensagem — sem isso, quem clicar não gera comissão nenhuma.',
    '',
    '👉 Role até "Atualizar link de afiliado" nesta página, cole o link e volte aqui.',
  ].join('\n');
}

export function buildWhatsappMessage(input: WhatsappMessageInput): string {
  if (input.affiliateLinkPending) {
    return buildPendingLinkReminder(input);
  }

  const isLowestEver = input.currentPriceCents <= input.lowestEverCents;

  // Prioridade: preço "de" manual (o vendedor anunciou de/por explicitamente)
  // > média histórica calculada (todas as lojas, desde o cadastro) — só
  // mostra "de X por Y" quando o preço de referência é de fato maior que o
  // atual, senão soa estranho ("de R$100 por R$100").
  const referenceCents = input.listPriceCents || input.avgPriceCents || null;
  const referenceLabel = input.listPriceCents ? null : 'média';
  const showReference = referenceCents != null && referenceCents > input.currentPriceCents;
  const discountPercent = showReference && referenceCents ? Math.round(((referenceCents - input.currentPriceCents) / referenceCents) * 100) : null;

  const priceLine = showReference
    ? `De ~${formatBRL(referenceCents!)}${referenceLabel ? ` (${referenceLabel})` : ''}~ por *${formatBRL(input.currentPriceCents)}* 🏷️${discountPercent && discountPercent > 0 ? ` (${discountPercent}% OFF)` : ''}`
    : `Por *${formatBRL(input.currentPriceCents)}*`;

  const historyLine = isLowestEver
    ? '🏆 *MENOR PREÇO JÁ REGISTRADO* — em todas as lojas que acompanhamos!'
    : `📊 Já vimos mais barato: ${formatBRL(input.lowestEverCents)} (em ${formatDate(input.lowestEverAt)}) — mas hoje ainda vale a pena.`;

  const couponLine = input.coupon
    ? `🎟️ Use o cupom *${input.coupon.code}* — ${formatDiscountLabel(input.coupon.discountType, input.coupon.discountValue)}`
    : null;

  const lines = [
    `🔥 *${input.title}*`,
    '',
    priceLine,
    historyLine,
    couponLine,
    '',
    `👉 Garanta o seu: ${input.shortLink}`,
    '',
    '━━━━━━━━━━━━━━',
    `🎮 *${BRAND_NAME}* — ${BRAND_SLOGAN}`,
    'Comparamos o preço em várias lojas pra você nunca pagar mais caro por um jogo.',
    `🔗 ${input.siteUrl}`,
  ];

  return lines.filter((line): line is string => line != null).join('\n');
}
