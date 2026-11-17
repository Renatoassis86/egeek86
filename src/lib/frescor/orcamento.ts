// E2 (R-89/R-90, fila #143): ORÇAMENTO ÚNICO DE FRESCOR. PURO. Fonte única das idades máximas do que é DITO (mensagem, fila de recentes).
// R-90: idade NUNCA expira item da vitrine/banco (só pausa, sem estoque ou deixou de ser vendido); a vitrine mostra "coletado há X".
// Estes limites valem para ENVIO de mensagem a cada rodada e para a fila de "recentes" do site.
import { amazonFrescorMin } from '../messaging/confirmacao-preco';

export interface OrcamentoFrescor {
  /** Amazon: preço dito (mensagem, lista, card, detecção e envio) só com leitura de até isto (min). Governado por AMAZON_FRESCOR_MIN (R-81). */
  amazonDizerMin: number;
  /** ML/Shopee: preço de queda confirmado há no máximo isto (min). */
  quedaMin: number;
  /** Lista do privado (ML/Shopee): confirmado há no máximo isto (min). */
  listaMin: number;
  /** Cupom de item lido há no máximo isto (min). */
  cupomItemMin: number;
  /** Cupom de lista oficial lido há no máximo isto (min). */
  cupomListaMin: number;
  /** Cupom de campanha confirmado há no máximo isto (min). */
  cupomCampanhaMin: number;
  /** Aviso "Em monitoramento" (gatilho AC) na fila: vale isto (min) e expira COM motivo; as demais propostas seguem 6 h. */
  avisoMonitoramentoTtlMin: number;
}

export function orcamentoFrescor(env: Record<string, string | undefined> = process.env): OrcamentoFrescor {
  return {
    amazonDizerMin: amazonFrescorMin(env),
    quedaMin: 60,
    listaMin: 360,
    cupomItemMin: 120,
    cupomListaMin: 120,
    cupomCampanhaMin: 24 * 60,
    avisoMonitoramentoTtlMin: ((n) => (Number.isFinite(n) && n >= 15 && n <= 360 ? Math.round(n) : 90))(Number((env.GROUP_AC_TTL_MIN ?? '').trim())),
  };
}

/** Instância de módulo: valor do ambiente no start do processo (cron/serverless reinicia a cada deploy; AMAZON_FRESCOR_MIN é variável de ambiente). */
export const ORCAMENTO: OrcamentoFrescor = orcamentoFrescor();

/**
 * R-90 (dono, 2026-11-16): vitrine e banco NÃO expiram item por idade da coleta; só pausa, sem estoque ou deixou de ser vendido (status da oferta)
 * tiram o item. O cartão mostra "verificado há X". Ligada por padrão; VITRINE_EXPIRA_POR_TEMPO=1|on|true devolve o filtro antigo (24 h clicável).
 * Não mexe nos indicadores (média, selo, série) nem na janela pública de 7 dias de `publicOffersCtes`.
 */
export function vitrineSemExpiracaoPorTempo(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(1|on|true|sim)$/i.test((env.VITRINE_EXPIRA_POR_TEMPO ?? '').trim());
}
