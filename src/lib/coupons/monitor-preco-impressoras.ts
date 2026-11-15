// MONITOR DE PREÇO das impressoras 3D (#114, 2026-11-15). PURO: sem banco, sem rede.
// Aviso SOMENTE ao chat privado do dono (TELEGRAM_ALERT_CHAT_ID); nunca aos canais públicos. Combo primeiro. Não afirma prazo de entrega.
import { escapeTelegramHtml, GROUP_LINK_BASE } from '@/lib/messaging/group-messages';
import { MODELOS_GUIA_3D } from '@/lib/messaging/prioridade-3d';

export function monitorPrecoLigado(env: Record<string, string | undefined> = process.env): boolean {
  return (env.PRINTER_PRICE_ALERT ?? '').toLowerCase() !== 'off';
}

/** Queda mínima: 2% do último preço avisado ou R$ 50, o que for MAIOR. */
export const QUEDA_MIN_PCT = 0.02;
export const QUEDA_MIN_CENTS = 5000;
/** No máximo 1 aviso por modelo a cada 2 h. */
export const INTERVALO_MIN_MS = 2 * 3600_000;
export const JANELA_MINIMO_DIAS = 14;

/** Chave do modelo na ordem do dono: 8 modelos (combo primeiro) e depois Kobra (um por produto). Menor = mais importante. */
export function posicaoModelo(chave: string): number {
  const i = MODELOS_GUIA_3D.findIndex((m) => m.slug === chave);
  return i >= 0 ? i : 100;
}

export interface MenorPreco { chave: string; rotulo: string; cents: number; rede: string; loja: string | null; slug: string }
export interface BaseAvisada { cents: number; rede: string }
export type Acao = 'baseline' | 'queda' | 'minimo' | 'rede-nova' | 'nada';

export interface EntradaDecisao {
  atual: MenorPreco;
  /** Último valor já avisado (ou linha de base). null = primeira execução do modelo. */
  base: BaseAvisada | null;
  /** Menor preço registrado nos últimos 14 dias (exclui a leitura atual). */
  min14: number | null;
  ultimoAvisoEm: Date | null;
  now: Date;
}

export function quedaMinimaCents(baseCents: number): number {
  return Math.max(Math.round(baseCents * QUEDA_MIN_PCT), QUEDA_MIN_CENTS);
}

export function decidir(e: EntradaDecisao): Acao {
  if (!e.base) return 'baseline';
  if (e.ultimoAvisoEm && e.now.getTime() - e.ultimoAvisoEm.getTime() < INTERVALO_MIN_MS) return 'nada';
  const { cents } = e.atual;
  if (e.base.cents - cents >= quedaMinimaCents(e.base.cents)) return 'queda';
  if (cents < e.base.cents && e.min14 != null && cents < e.min14) return 'minimo';
  if (cents < e.base.cents && e.atual.rede !== e.base.rede) return 'rede-nova';
  return 'nada';
}

const brl0 = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const REDE_NOME: Record<string, string> = { 'mercado-livre': 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee' };

export function textoAvisoPreco(acao: Exclude<Acao, 'baseline' | 'nada'>, m: MenorPreco, baseCents: number): string {
  const e = escapeTelegramHtml;
  const nome = m.rotulo.replace(/^Bambu Lab\s+/i, '');
  const verbo = acao === 'minimo' ? 'novo mínimo de 14 dias' : acao === 'rede-nova' ? 'mais barato em outra rede' : 'caiu';
  const loja = m.loja ? ` (${e(m.loja)})` : '';
  const link = `${GROUP_LINK_BASE}/go/${encodeURIComponent(m.slug)}`;
  return `🖨️ <b>${e(nome)}</b> ${verbo}: ${brl0(baseCents)} → <b>${brl0(m.cents)}</b> no ${e(REDE_NOME[m.rede] ?? m.rede)}${loja}\n${e(link)}`;
}
