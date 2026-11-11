import type { StoredCoupon } from './types';

/**
 * Linha de cupom para a mensagem (ata 2026-11-10, secao 3.5). So usa dado LIDO; chame so com cupom que passou em
 * isUsableForMessage (findVerifiedCoupons ja filtra). Sem prazo lido ou sem carimbo de leitura = devolve '' (a linha some).
 * Nunca diz "garantido", nunca promete que funciona no carrinho de cada conta, nunca usa a palavra "afiliado".
 */

export type CouponChannel = 'telegram' | 'whatsapp';

const TZ = 'America/Sao_Paulo';
const CONDITION_MAX = 140;

/** Telegram parse_mode HTML: so &, < e > precisam de escape. (Mesma regra de src/lib/messaging/group-messages.ts; copiada para nao acoplar.) */
export function escapeTelegramHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** WhatsApp: *, _, ~ e ` formatam o texto; texto vindo de loja nao pode quebrar a formatacao. */
export function escapeWhatsappText(s: string): string {
  return s.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100).replace(/ /g, ' ');
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
}

/** "dd/mm as hhHmm" no fuso de Sao Paulo. */
export function formatStamp(iso: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('day')}/${g('month')} às ${g('hour')}h${g('minute')}`;
}

/** Condicao resumida: o texto lido, recortado em fronteira de palavra. Nao reescreve nem parafraseia. */
export function summarizeCondition(raw: string, max = CONDITION_MAX): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

const AUDIENCE_LABEL: Record<string, string> = {
  assinantes: 'para assinantes',
  primeira_compra: 'na primeira compra',
  cartao: 'com cartão específico',
  conta: 'conforme a conta',
  outro: 'com condição de público',
};

function benefit(c: StoredCoupon): string {
  const v = c.valueNum;
  const unit = c.valueUnit;
  const val = v === null ? null : unit === 'reais' ? formatBRL(Math.round(v * 100)) : `${fmtNumber(v)}%`;
  switch (c.kind) {
    case 'percentual': return `${val} de desconto`;
    case 'valor_fixo': return `${val} de desconto`;
    case 'frete': return val ? `${val} no frete` : 'benefício no frete';
    case 'cashback': return `cashback de ${val}`;
    case 'vale': return val ? `vale de ${val}` : 'vale';
  }
}

/**
 * Monta a linha. Exemplo (Telegram):
 *   Cupom <code>CODIGO</code>: 10% de desconto (mínimo R$ 100,00, teto R$ 30,00; condição lida…). Válido até 12/11 às 23h59 segundo a loja. Visto em 11/11 às 10h05.
 * Retorna '' se faltar prazo lido ou carimbo de verificacao (a linha nao existe).
 */
export function formatCouponLine(c: StoredCoupon, channel: CouponChannel = 'telegram'): string {
  if (!c.validUntil || !c.verifiedAt) return '';
  if ((c.kind === 'percentual' || c.kind === 'valor_fixo' || c.kind === 'cashback') && (c.valueNum === null || !c.valueUnit)) return '';
  const esc = channel === 'telegram' ? escapeTelegramHtmlText : escapeWhatsappText;
  const head = c.code
    ? channel === 'telegram'
      ? `Cupom <code>${escapeTelegramHtmlText(c.code)}</code>`
      : `Cupom ${escapeWhatsappText(c.code)}`
    : 'Cupom (ativar na página da loja)';

  const bits: string[] = [];
  if (c.minOrderCents !== null) bits.push(`mínimo ${formatBRL(c.minOrderCents)}`);
  if (c.maxDiscountCents !== null) bits.push(`teto ${formatBRL(c.maxDiscountCents)}`);
  if (c.audience !== 'todos') bits.push(esc(c.audienceText ? summarizeCondition(c.audienceText, 60) : AUDIENCE_LABEL[c.audience] ?? ''));
  const cond = summarizeCondition(c.conditionsRaw);
  if (cond) bits.push(esc(cond));

  const detail = bits.filter(Boolean).join(', ');
  return `${head}: ${esc(benefit(c))}${detail ? ` (${detail})` : ''}. Válido até ${formatStamp(c.validUntil)} segundo a loja. Visto em ${formatStamp(c.verifiedAt)}; pode variar por conta.`;
}
