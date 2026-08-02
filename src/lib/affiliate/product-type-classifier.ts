// Sem 'server-only': é lógica pura (tokenização + Naive Bayes) sem segredo
// nenhum, e precisa ser importável tanto pelo runtime do Next (discover-
// products.ts) quanto pelo script de treino standalone (rodado via tsx fora
// do Next — 'server-only' derruba fora do contexto do build do Next).
import type { ProductType } from '@/db/schema';

/**
 * Classificador Naive Bayes multinomial (bag-of-words) pra jogo/console/
 * acessório a partir do TÍTULO do anúncio — sinal de reforço quando a
 * categoria real do Mercado Livre (`resolveMeliCategoryProductType`, sempre
 * o sinal primário) não resolve. Implementado à mão em vez de usar uma lib
 * (`natural` foi testada e tem uma dependência transitiva ESM-only quebrada
 * — `afinn-165` — que derruba `require()`; risco demais pra rodar em
 * produção na Vercel) — Naive Bayes multinomial é um algoritmo simples o
 * bastante pra valer a pena ter sob controle total em ~100 linhas.
 *
 * Achado real que motivou isso (2026-07-31): "Facas Ka-bar 7511 Jarosz Camp
 * Turok" (faca de merchandising) entrou no catálogo como productType='game'
 * porque veio de um termo de busca de franquia e a categoria do Mercado
 * Livre não resolveu pra nada reconhecido — não havia NENHUM sinal textual
 * sendo consultado nesse caminho. Esse classificador é esse sinal.
 */

export interface ProductTypeClassifierModel {
  /** contagem de cada palavra por classe (bag-of-words) */
  wordCounts: Record<ProductType, Record<string, number>>;
  /** total de ocorrências de palavra por classe (denominador da verossimilhança) */
  classTotals: Record<ProductType, number>;
  /** quantos documentos de treino por classe (pra prior) */
  classDocCounts: Record<ProductType, number>;
  vocabularySize: number;
  totalDocs: number;
  trainedAt: string;
  /** acurácia real medida em holdout (20% dos dados, nunca visto no treino) — nunca inventado */
  holdoutAccuracy: number;
  holdoutSize: number;
}

export interface ClassifierPrediction {
  label: ProductType;
  probability: number;
}

/**
 * Lista curta de palavras de baixíssimo valor discriminativo entre
 * jogo/console/acessório (artigos, formato de mídia, condição de venda) —
 * mantida pequena de propósito: o Naive Bayes já desconta sozinho palavras
 * que aparecem igualmente nas 3 classes, isso aqui só corta ruído óbvio.
 */
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'em', 'no', 'na', 'a', 'o', 'e',
  'novo', 'nova', 'original', 'lacrado', 'lacrada', 'oficial', 'br', 'nacional',
  'edicao', 'edition', 'standard', 'pronta', 'entrega', 'promocao', 'oferta',
]);

export function tokenize(text: string): string[] {
  const normalized = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ');
  return normalized
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function trainNaiveBayes(
  docs: { text: string; label: ProductType }[],
  labels: ProductType[]
): ProductTypeClassifierModel {
  const wordCounts = Object.fromEntries(labels.map((l) => [l, {} as Record<string, number>])) as Record<ProductType, Record<string, number>>;
  const classTotals = Object.fromEntries(labels.map((l) => [l, 0])) as Record<ProductType, number>;
  const classDocCounts = Object.fromEntries(labels.map((l) => [l, 0])) as Record<ProductType, number>;
  const vocabulary = new Set<string>();

  for (const doc of docs) {
    classDocCounts[doc.label]++;
    for (const token of tokenize(doc.text)) {
      vocabulary.add(token);
      wordCounts[doc.label][token] = (wordCounts[doc.label][token] ?? 0) + 1;
      classTotals[doc.label]++;
    }
  }

  return {
    wordCounts,
    classTotals,
    classDocCounts,
    vocabularySize: vocabulary.size,
    totalDocs: docs.length,
    trainedAt: new Date().toISOString(),
    holdoutAccuracy: 0,
    holdoutSize: 0,
  };
}

/** Log-verossimilhança de um documento já tokenizado pra uma classe (suavização de Laplace / add-1). */
function classLogLikelihood(tokens: string[], label: ProductType, model: ProductTypeClassifierModel): number {
  const prior = Math.log(model.classDocCounts[label] / model.totalDocs);
  const denom = model.classTotals[label] + model.vocabularySize;
  let logLikelihood = prior;
  for (const token of tokens) {
    const count = model.wordCounts[label][token] ?? 0;
    logLikelihood += Math.log((count + 1) / denom);
  }
  return logLikelihood;
}

export function classify(text: string, model: ProductTypeClassifierModel): ClassifierPrediction[] {
  const tokens = tokenize(text);
  const labels = Object.keys(model.classDocCounts) as ProductType[];
  const logScores = labels.map((label) => ({ label, score: classLogLikelihood(tokens, label, model) }));

  // Softmax numericamente estável (subtrai o máximo antes de exponenciar)
  // só pra converter log-verossimilhança em probabilidade normalizada
  // legível — não muda a ordem/decisão, só a escala de exibição.
  const maxScore = Math.max(...logScores.map((s) => s.score));
  const expScores = logScores.map((s) => ({ label: s.label, exp: Math.exp(s.score - maxScore) }));
  const sumExp = expScores.reduce((sum, s) => sum + s.exp, 0);

  return expScores
    .map((s) => ({ label: s.label, probability: s.exp / sumExp }))
    .sort((a, b) => b.probability - a.probability);
}

let cachedModel: ProductTypeClassifierModel | null = null;

/** Carrega o modelo treinado (gerado por `npm run train:classifier`) — cacheado em memória do processo. */
export async function getProductTypeClassifierModel(): Promise<ProductTypeClassifierModel> {
  if (cachedModel) return cachedModel;
  const mod = await import('./product-type-classifier-model.json');
  cachedModel = (mod.default ?? mod) as unknown as ProductTypeClassifierModel;
  return cachedModel;
}

/** Confiança mínima do classificador pra aceitar a previsão quando não há
 * nenhum outro sinal (categoria real de marketplace) disponível — ver
 * `resolveProductTypeFromTitle` abaixo. */
const MIN_CONFIDENCE_TEXT_ONLY = 0.6;

/**
 * Achado real (2026-08-02): discover-shopee-products.ts e discover-magalu-
 * products.ts nunca determinavam productType nenhum — `classifyFromAttributes`
 * só devolve plataforma/formato/edição, nunca productType, e a coluna tem
 * DEFAULT 'game' no schema. Resultado: TODO produto novo descoberto via
 * Shopee/Magalu virava 'game' automaticamente, mesmo joystick, bateria de
 * controle, carregador, mousepad — sem nenhuma classificação real acontecer.
 *
 * Shopee/Magalu não expõem uma árvore de categoria real como a do Mercado
 * Livre (`resolveMeliCategoryProductType`), então o único sinal disponível
 * aqui é o título — por isso o padrão de confiança é mais rigoroso
 * (MIN_CONFIDENCE_TEXT_ONLY) e não cataloga nada abaixo dele, em vez de
 * arriscar herdar o default errado.
 */
export async function resolveProductTypeFromTitle(title: string): Promise<ProductType | null> {
  const model = await getProductTypeClassifierModel();
  const [top] = classify(title, model);
  if (top && top.probability >= MIN_CONFIDENCE_TEXT_ONLY) {
    return top.label;
  }
  return null;
}
