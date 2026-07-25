/**
 * Reagrupa um texto longo (ex: descrição de catálogo do Mercado Livre, que
 * às vezes chega como um bloco único misturando ficha técnica e narrativa)
 * em pedaços menores e legíveis — nunca reescreve, resume ou inventa
 * conteúdo, só reflui o MESMO texto real em parágrafos menores pra exibição
 * em cards alternados com imagem.
 */
export function splitIntoStoryChunks(text: string, targetChunks = 4): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1) Parágrafo real (quebra de linha dupla ou simples) já é o corte ideal.
  let paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length < 2) {
    paragraphs = trimmed
      .split(/\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  if (paragraphs.length >= 2) return paragraphs;

  // 2) Texto sem nenhuma quebra real — agrupa por sentença, várias por
  // pedaço, pra não virar 1 card gigante nem dezenas de cards minúsculos.
  const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)/g) ?? [trimmed];
  if (sentences.length < 2) return [trimmed];

  const perChunk = Math.max(1, Math.ceil(sentences.length / targetChunks));
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += perChunk) {
    chunks.push(
      sentences
        .slice(i, i + perChunk)
        .join(' ')
        .trim()
    );
  }
  return chunks.filter(Boolean);
}
