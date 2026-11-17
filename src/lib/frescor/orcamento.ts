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
}

export function orcamentoFrescor(env: Record<string, string | undefined> = process.env): OrcamentoFrescor {
  return {
    amazonDizerMin: amazonFrescorMin(env),
    quedaMin: 60,
    listaMin: 360,
    cupomItemMin: 120,
    cupomListaMin: 120,
    cupomCampanhaMin: 24 * 60,
  };
}

/** Instância de módulo: valor do ambiente no start do processo (cron/serverless reinicia a cada deploy; AMAZON_FRESCOR_MIN é variável de ambiente). */
export const ORCAMENTO: OrcamentoFrescor = orcamentoFrescor();
