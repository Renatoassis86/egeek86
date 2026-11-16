// R-82 (dono, 2026-11-16): "implementar as formas da melhor para a pior, cada uma na sua fase como validacao da outra; uma nao funcionando, cai a outra".
// Camadas de fonte do preco da Amazon (da melhor para a pior): 1) creators_api (oficial, quando a conta liberar), 2) keepa (servico de precos de terceiros),
// 3) chrome (leitura da pagina pela aba logada do dono). Este modulo e PURO: decide se o par (preco cheio, Pix) conhecido da oferta pode ser dito AGORA.
//
// Regras (padrao negado):
//  - So o Chrome conhece o PAR (cheio, Pix) com o TIPO de cada preco (R-69). Fonte externa nunca escreve preco: ela CONFIRMA ou VETA o par conhecido.
//  - Sem fonte externa fresca: vale o Chrome fresco (45 min), como antes (R-81).
//  - Com fonte externa fresca que CONCORDA (algum preco dela bate com o cheio ou com o Pix, tolerancia 1,5%): a oferta e dita, mesmo com o Chrome parado
//    (a confirmacao externa estende o frescor). E a queda de camada: o Chrome cai, a outra segura.
//  - Com fonte externa fresca que DISCORDA do par conhecido: BLOQUEIA ("divergente"); o preco mudou e o Chrome precisa reler. Nunca se escolhe um lado as cegas.
//  - Fonte externa sem par conhecido (oferta sem leitura do Chrome): nao diz nada ("sem_par_conhecido").
export type FonteExterna = 'creators_api' | 'keepa';
export type FonteId = FonteExterna | 'chrome';
export const NIVEL: Record<FonteId, number> = { creators_api: 3, keepa: 2, chrome: 1 };

export interface Par { precoCents: number | null; pixCents: number | null; lidoEm: Date | null }
export interface LeituraExterna { fonte: FonteExterna; precoCents: number | null; pixCents: number | null; lidoEm: Date; disponivel?: boolean }
export interface CfgFontes { frescorMin: Record<FonteId, number>; tolerancia: number }
export const CFG_PADRAO: CfgFontes = { frescorMin: { creators_api: 45, keepa: 60, chrome: 45 }, tolerancia: 0.015 };

export type Decisao =
  | { ok: true; fonte: FonteId; validoEm: Date; validadaPor: FonteId[]; unicaFonte: boolean; chromeVelhoConfirmadoPorExterna: boolean }
  | { ok: false; motivo: 'sem_leitura_fresca' | 'divergente' | 'sem_par_conhecido' | 'indisponivel_na_fonte'; frescas: FonteId[]; detalhe?: string };

const idadeMin = (d: Date, now: Date) => (now.getTime() - d.getTime()) / 60_000;

/** Algum preco de `a` (cheio ou Pix) bate com algum de `b` dentro da tolerancia relativa. */
export function concordam(a: { precoCents: number | null; pixCents: number | null }, b: { precoCents: number | null; pixCents: number | null }, tol: number): boolean {
  const xs = [a.precoCents, a.pixCents].filter((v): v is number => typeof v === 'number' && v > 0);
  const ys = [b.precoCents, b.pixCents].filter((v): v is number => typeof v === 'number' && v > 0);
  return xs.some((x) => ys.some((y) => Math.abs(x - y) / Math.max(x, y) <= tol));
}

export function decidirPrecoAmazon(chrome: Par | null, externas: LeituraExterna[], now: Date, cfg: CfgFontes = CFG_PADRAO): Decisao {
  const chromeFresco = !!chrome && !!chrome.lidoEm && idadeMin(chrome.lidoEm, now) <= cfg.frescorMin.chrome;
  const frescas = externas.filter((e) => idadeMin(e.lidoEm, now) <= cfg.frescorMin[e.fonte]).sort((a, b) => NIVEL[b.fonte] - NIVEL[a.fonte] || b.lidoEm.getTime() - a.lidoEm.getTime());
  const ids: FonteId[] = [...frescas.map((f) => f.fonte), ...(chromeFresco ? (['chrome'] as FonteId[]) : [])];
  if (!frescas.length) {
    return chromeFresco && chrome?.lidoEm
      ? { ok: true, fonte: 'chrome', validoEm: chrome.lidoEm, validadaPor: ['chrome'], unicaFonte: true, chromeVelhoConfirmadoPorExterna: false }
      : { ok: false, motivo: 'sem_leitura_fresca', frescas: [] };
  }
  if (frescas.some((f) => f.disponivel === false)) return { ok: false, motivo: 'indisponivel_na_fonte', frescas: ids, detalhe: frescas.find((f) => f.disponivel === false)!.fonte };
  if (!chrome || (chrome.precoCents == null && chrome.pixCents == null)) return { ok: false, motivo: 'sem_par_conhecido', frescas: ids };
  const par = { precoCents: chrome.precoCents, pixCents: chrome.pixCents };
  const dis = frescas.filter((f) => !concordam(f, par, cfg.tolerancia));
  if (dis.length) return { ok: false, motivo: 'divergente', frescas: ids, detalhe: dis.map((d) => `${d.fonte}:${d.precoCents ?? '-'}/${d.pixCents ?? '-'} x par ${par.precoCents ?? '-'}/${par.pixCents ?? '-'}`).join('; ') };
  const validoEm = new Date(Math.max(...frescas.map((f) => f.lidoEm.getTime()), chromeFresco && chrome.lidoEm ? chrome.lidoEm.getTime() : 0));
  return { ok: true, fonte: frescas[0].fonte, validoEm, validadaPor: ids, unicaFonte: ids.length === 1, chromeVelhoConfirmadoPorExterna: !chromeFresco };
}

/** ASIN da URL de produto da Amazon (/dp/ASIN ou /gp/product/ASIN), ou null. */
export function asinDaUrl(url: string | null | undefined): string | null {
  const m = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i.exec(url ?? '');
  return m ? m[1].toUpperCase() : null;
}
