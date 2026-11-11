/**
 * Geração assistida de mensagem de UMA oferta (botão "Gerar mensagem WhatsApp" e carrinho do admin) —
 * texto pronto para copiar/colar. NÃO envia nada.
 * CORRIGIDO em 2026-11-10 (ata das mensagens para grupos): sem "De/por", sem "% OFF" de marketplace (o preço "de" do
 * marketplace NÃO é desconto; `listPriceCents` é ignorado), sem a palavra "afiliado", sem afirmar "menor preço" sem a
 * janela de registro e com o carimbo "Conferido em". As mensagens automáticas para grupos usam
 * `src/lib/messaging/group-messages.ts` (6 modelos).
 * ATENÇÃO: `avgPriceCents` deste fluxo ainda vem de `getMasterProductPriceHistory` (base legada); a média única por
 * oferta-dia (ADR 0004) está em `src/server/messaging/group-offers.ts`. Migrar os chamadores é pendência registrada.
 */

import { fmtBRL as formatBRL } from '@/lib/messaging/group-messages';

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
  /** IGNORADO (preço "de" manual): "de/por" não é desconto. Mantido só por compatibilidade de chamadores. */
  listPriceCents?: number | null;
  /** Preço médio real entre todas as lojas/plataformas desde o cadastro do produto até hoje (não é só desse vendedor). */
  avgPriceCents?: number | null;
  /** Menor preço já visto em QUALQUER loja/plataforma rastreada pra esse jogo (não só nessa oferta). */
  lowestEverCents: number;
  lowestEverAt: Date;
  /** Desde quando registramos preço deste produto (início da série). Sem isso a frase de recorde não diz a janela. */
  trackingSince?: Date | null;
  /** Instante em que o preço foi conferido (last_price_confirmed_at). Sem isso a linha "Conferido em" some. */
  checkedAt?: Date | null;
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
    '⚠️ *Link pendente (não compartilhar)*',
    '',
    `Essa oferta (*${input.title}*) ainda não tem o link real cadastrado.`,
    '',
    'Cole o link real antes de gerar a mensagem — sem isso, o clique não é rastreado.',
    '',
    '👉 Role até "Atualizar link" nesta página, cole o link e volte aqui.',
  ].join('\n');
}

function stampLine(d: Date): string {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `Conferido em ${g('day')}/${g('month')} às ${g('hour')}:${g('minute')} (Brasília).`;
}

/** Bloco de um item só (título + preço + média + recorde + cupom) — sem o fechamento de marca, reaproveitado tanto pela mensagem de 1 item quanto pela do carrinho (N itens). */
function buildOfferBlock(input: WhatsappMessageInput): string[] {
  const isLowestEver = input.currentPriceCents <= input.lowestEverCents;

  // Só fatos: o preço de hoje e, se existir média real abaixo do preço de referência, a distância dela.
  // Nunca "de/por" nem "% OFF" do marketplace.
  const priceLine = `*${formatBRL(input.currentPriceCents)}* ${input.networkName ? `em ${input.networkName}` : ''}`.trim();
  const hasAvg = input.avgPriceCents != null && input.avgPriceCents > input.currentPriceCents;
  const avgLine = hasAvg
    ? `${Math.round(((input.avgPriceCents! - input.currentPriceCents) / input.avgPriceCents!) * 100)}% abaixo da média de ${formatBRL(input.avgPriceCents!)}.`
    : null;

  const since = input.trackingSince ? input.trackingSince.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : null;
  const historyLine = isLowestEver
    ? since
      ? `Menor preço que registramos desde ${since}.`
      : 'Menor preço que registramos até agora.'
    : `Já registramos mais barato: ${formatBRL(input.lowestEverCents)} (em ${formatDate(input.lowestEverAt)}).`;

  const couponLine = input.coupon ? `Cupom *${input.coupon.code}* (${couponLabel(input.coupon.discountType, input.coupon.discountValue)})` : null;
  const checkedLine = input.checkedAt ? stampLine(input.checkedAt) : null;

  return [`*${input.title}*`, priceLine, avgLine, historyLine, couponLine, checkedLine, `Ver a oferta: ${input.shortLink}`].filter(
    (line): line is string => !!line
  );
}

function couponLabel(discountType: string, discountValue: string): string {
  switch (discountType) {
    case 'percentage':
      return `desconto de ${discountValue}%`;
    case 'fixed':
      return `desconto de R$ ${discountValue}`;
    case 'free_shipping':
      return 'frete grátis';
    default:
      return 'ver condições no cupom';
  }
}

const BRAND_CLOSING = [`*${BRAND_NAME}* — ${BRAND_SLOGAN}`];

export function buildWhatsappMessage(input: WhatsappMessageInput): string {
  if (input.affiliateLinkPending) {
    return buildPendingLinkReminder(input);
  }

  return [...buildOfferBlock(input), '', ...BRAND_CLOSING, `🔗 ${input.siteUrl}`].join('\n');
}

/**
 * Mensagem única cobrindo TODOS os itens do carrinho de um comprador — um
 * bloco por item (mesmo formato de buildOfferBlock) + um fechamento de marca
 * só no final. Assume que todo item já tem link de afiliado real (quem chama
 * já filtrou por affiliateLinkPending=false antes de montar a lista).
 */
export function buildCartWhatsappMessage(
  buyerName: string,
  items: Omit<WhatsappMessageInput, 'affiliateLinkPending' | 'siteUrl'>[],
  siteUrl: string
): string {
  const intro = [`Oi, ${buyerName}! 👋`, '', `Os links dos ${items.length} ${items.length === 1 ? 'item' : 'itens'} do seu carrinho estão prontos:`];

  const itemBlocks = items.flatMap((item, i) => [
    ...buildOfferBlock({ ...item, affiliateLinkPending: false, siteUrl }),
    ...(i < items.length - 1 ? ['', '· · ·', ''] : []),
  ]);

  return [...intro, '', ...itemBlocks, '', ...BRAND_CLOSING, `🔗 ${siteUrl}`].join('\n');
}
