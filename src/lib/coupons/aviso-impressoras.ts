// AVISO PRIVADO DO DONO: cupom ou desconto de cartão NOVO em P2S Combo / P1S Combo (#112, 2026-11-15). PURO: sem banco, sem rede.
// Vai SOMENTE para o chat privado do dono (TELEGRAM_ALERT_CHAT_ID); nunca aos canais públicos. Sem aviso de comissão. Combo primeiro: P2S Combo, depois P1S Combo.
import { escapeTelegramHtml } from '@/lib/messaging/group-messages';

export function avisoImpressoraLigado(env: Record<string, string | undefined> = process.env): boolean {
  return (env.PRINTER_COUPON_ALERT ?? '').toLowerCase() !== 'off';
}

/** Modelos que disparam o aviso, na ordem do dono (combo primeiro). */
export const MODELOS_AVISO = ['p2s-combo', 'p1s-combo'] as const;

export interface AvisoImpressora {
  tipo: 'cupom' | 'cartao';
  /** Chave única do evento (dedup): cupom = oferta|nome|preço final; cartão = oferta|dedup_key. */
  chave: string;
  modelo: string;
  rede: string;
  /** Nome do cupom ou "Itaú Mastercard 15%". */
  titulo: string;
  /** Regra legível: o que a página disse + o que falta confirmar. */
  regra: string;
  validade: string;
  link: string | null;
  anuncioCents: number;
  /** Preço com cupom lido, ou preço derivado do % lido (cartão). null = sem preço final. */
  finalCents: number | null;
  confirmar: boolean;
}

const brl = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function textoAvisoImpressora(a: AvisoImpressora): string {
  const e = escapeTelegramHtml;
  const cab = a.tipo === 'cupom' ? 'Cupom novo' : 'Desconto no cartão novo';
  const linhas = [
    `<b>${cab}: ${e(a.modelo)}</b> (${e(a.rede)})`,
    `${a.tipo === 'cupom' ? 'Cupom' : 'Cartão'}: ${e(a.titulo)}`,
    `Regra: ${e(a.regra)}`,
    `Anúncio: ${brl(a.anuncioCents)}${a.finalCents != null ? ` · ${a.tipo === 'cupom' ? 'com cupom' : 'com o desconto'}: ${brl(a.finalCents)}${a.confirmar ? ' (a confirmar no carrinho)' : ''}` : ''}`,
    `Validade: ${e(a.validade)}`,
    ...(a.link && /^https:\/\/[^\s<>"]+$/.test(a.link) ? [`Link: ${e(a.link)}`] : []),
  ];
  return linhas.join('\n');
}
