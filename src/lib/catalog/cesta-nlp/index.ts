// Sem 'server-only': NLP leve e determinístico (sem API, sem custo) para decidir se dois títulos são o MESMO produto.
// R-115 (cesta por modelo). Veja docs/03-metodologia/FLUXO_MESTRE.md e docs/evidencias/cestas-nlp-sugestoes-2026-11-22.md.
export { extrairAtributos, montarLexicoMarcas, dobrar, type Atributos, type LexicoMarcas } from './atributos';
export {
  IndiceTfidf, julgarAtributos, julgarTitulos, conflitosEntre, similaridade, distintivos, ps5Console,
  LIMIAR_APLICAR, LIMIAR_SUGERIR, type Conflito, type Julgamento, type Veredito,
} from './comparar';
export {
  Motor, analisarCesta, sugerirJuncoes,
  type MasterCesta, type OfertaCesta, type OfertaAvaliada, type ResultadoCesta, type SugestaoJuncao,
} from './cesta';

/** Modo de operação (variável CESTA_NLP): 'sugerir' (padrão) só lista; 'aplicar' deixa os scripts gravarem (lotes pequenos, backup e log); 'off' desliga tudo. */
export type ModoCestaNlp = 'off' | 'sugerir' | 'aplicar';

export function cestaNlpModo(env: Record<string, string | undefined> = process.env): ModoCestaNlp {
  const v = (env.CESTA_NLP ?? '').trim().toLowerCase();
  if (v === 'off' || v === '0' || v === 'false') return 'off';
  if (v === 'aplicar' || v === 'apply' || v === 'on') return 'aplicar';
  return 'sugerir';
}

/** Motivo gravado na quarentena reversível das ofertas fora da cesta (some de média, selo, menor preço, vitrine e mensagens). */
export const MOTIVO_CESTA_NLP = 'cesta_nlp_conflito_duro';
