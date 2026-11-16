// GATILHO ANTI-ISCA DE CUPOM (R-63, dono 2026-11-16). PURO.
// Caso fundador: "CUPOM ATIVO, Bambu Lab P1S Combo, R$ 5.999 -> R$ 5.799 (cupom de R$ 200)" do vendedor NIC.3D, link meli.la/1orvrZd. A leitura positiva única (01:01:43Z) vinha do
// texto "R$ 5.799 com Cupom" achado no TEXTO INTEIRO da página (a página de catálogo lista vários vendedores), SEM campaign_id, sem nome e sem validade. Treze minutos depois a
// página do anúncio não tinha cupom e o modal /cupons/pdp do mesmo item respondia "Você não tem cupons disponíveis". Nas 24 h anteriores, 38 mensagens CUPOM saíram, 0 com campaign_id.
//
// Regra (vale para TODAS as redes e itens novos; o critério não conhece loja nem produto): cupom lido na página de um ANÚNCIO só vira mensagem, card ou site com PROVA NO ITEM:
//  ML  : campaign_id lido no estado da página + o modal /cupons/pdp do MESMO item confirmou essa campanha (status `confirmado_modal`) + leitura de no máximo 10 min NA HORA DE USAR.
//  Amazon/Shopee: seguem as regras próprias (selo no bloco de compra do item, 2 leituras separadas, etc.), fora deste arquivo.
// Leitura sem prova = "sem cupom" (leitura divergente nunca é positiva).

export const STATUS_CONFIRMADO_MODAL = 'confirmado_modal';
/** Idade máxima da leitura que sustenta um cupom do ML na hora de detectar/enviar (releitura ao enviar). */
export const CUPOM_ML_FRESCOR_MIN = 10;

export function cupomMlExigeProva(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false)$/i.test((env.CUPOM_ML_PROVA ?? '').trim());
}
export function cupomMlFrescorMin(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CUPOM_ML_FRESCOR_MIN);
  return Number.isFinite(n) && n >= 1 && n <= 120 ? n : CUPOM_ML_FRESCOR_MIN;
}

export type MotivoSemProva = 'cupom_sem_campanha' | 'cupom_sem_confirmacao_do_modal' | 'cupom_leitura_antiga_para_enviar';

export interface FatosProvaCupom {
  campaignId: string | null;
  status: string | null;
  readAt: Date;
  now: Date;
}

/** O cupom lido do ML tem prova no item? ok=false traz o motivo (vira `trace` da agulha e fica na auditoria). */
export function provaCupomMl(f: FatosProvaCupom, ligada = true, maxAgeMin = CUPOM_ML_FRESCOR_MIN): { ok: true } | { ok: false; motivo: MotivoSemProva } {
  if (!ligada) return { ok: true };
  if (!f.campaignId || !/^\d{3,12}$/.test(f.campaignId)) return { ok: false, motivo: 'cupom_sem_campanha' };
  if (f.status !== STATUS_CONFIRMADO_MODAL) return { ok: false, motivo: 'cupom_sem_confirmacao_do_modal' };
  if ((f.now.getTime() - f.readAt.getTime()) / 60_000 > maxAgeMin) return { ok: false, motivo: 'cupom_leitura_antiga_para_enviar' };
  return { ok: true };
}

/**
 * R-68 (2026-11-16): "CUPOM ENCERRADO" só é publicado para cupom que TEVE prova vigente no cofre antes (provado e depois sumiu). Cupom NUNCA provado fecha em silêncio
 * (`nunca_provado`: sem card, sem mensagem; vai para o relatório de correção): anunciar o fim do que nunca existiu é uma segunda notícia falsa em cima da primeira.
 * Vale para aviso de ANÚNCIO (por item); campanha/loja seguem o fluxo próprio.
 */
export function motivoDeFim<T extends string>(motivo: T, kind: string, teveProvaNoCofre: boolean): T | 'nunca_provado' {
  if (kind !== 'anuncio') return motivo;
  if (motivo === 'sumiu_da_pagina' || motivo === 'venceu') return teveProvaNoCofre ? motivo : 'nunca_provado';
  return motivo;
}

/** Na gravação (ingest): só leitura positiva com prova fica positiva; o resto é gravado como leitura SEM cupom. */
export function leituraPositivaGravavel(c: { campaign: string | null; status: string }, ligada = true): boolean {
  if (!ligada) return true;
  return !!c.campaign && c.status === STATUS_CONFIRMADO_MODAL;
}

/**
 * QA F9: o desconto do rótulo ("R$ 5.799 com Cupom" sobre R$ 5.999 = R$ 200) tem de bater com o que o MODAL do mesmo item diz do cupom ("R$ 200 OFF em ...", "10% OFF ...").
 * `nome` é o título lido do modal. Sem valor legível no nome (só texto) não há como conferir: aceita. Valor em reais: diferença <= R$ 1,00. Percentual: desconto <= pct x preço (+1%) e
 * >= metade dele (teto/mínimo do cupom podem reduzir). Divergência = leitura divergente = sem cupom.
 */
export function descontoConfereComModal(modal: { nome: string | null | undefined }, precoCents: number, comCupomCents: number): { ok: true } | { ok: false; motivo: 'valor_do_rotulo_diverge_do_modal' } {
  const desc = precoCents - comCupomCents;
  const nome = String(modal.nome ?? '');
  const reais = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s*(?:OFF|de desconto|de cupom)/i.exec(nome);
  if (reais) {
    const v = Number(reais[1].replace(/\./g, '')) * 100 + (reais[2] ? Number(reais[2].padEnd(2, '0')) : 0);
    return Math.abs(v - desc) <= 100 ? { ok: true } : { ok: false, motivo: 'valor_do_rotulo_diverge_do_modal' };
  }
  const pct = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:OFF|de desconto)/i.exec(nome);
  if (pct) {
    const p = Number(pct[1].replace(',', '.')) / 100;
    const teto = precoCents * p * 1.01 + 100;
    return desc <= teto && desc >= (precoCents * p) / 2 - 100 ? { ok: true } : { ok: false, motivo: 'valor_do_rotulo_diverge_do_modal' };
  }
  return { ok: true };
}

/**
 * Ingest do ML (ponto único de decisão, testado por comportamento): das leituras com cupom, só entram como POSITIVAS as que têm campaign_id + `confirmado_modal` E cujo desconto do rótulo
 * confere com o valor do modal. O resto é gravado como leitura sem prova (derruba positivas anteriores).
 */
export function selecionarProvados<T extends { campaign: string | null; status: string; name?: unknown; cents: number }>(valid: readonly T[], precoCents: number, exigirProva = true): T[] {
  return valid.filter((c) => leituraPositivaGravavel({ campaign: c.campaign, status: c.status }, exigirProva) && (!exigirProva || descontoConfereComModal({ nome: typeof c.name === 'string' ? c.name : null }, precoCents, c.cents).ok));
}
