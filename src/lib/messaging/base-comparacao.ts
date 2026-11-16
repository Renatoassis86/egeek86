// R-71 (AUD-01): UMA base de comparação para tudo o que uma mensagem diz sobre preço ("hoje", "menor registrado", série).
// PURO. A base de uma mensagem = as ofertas que a própria mensagem PODE mostrar. Com a contenção da Amazon ligada
// (`amazonForaDasMensagens`, #120), a Amazon não sai em mensagem; então "hoje" e a série ("menor registrado", "menor em dd/mm")
// também excluem a Amazon. E, se existe oferta Amazon elegível e fresca MAIS BARATA que o "hoje" dito, o site mostra outro "Menor
// preço agora": a mensagem de histórico (P1/P3/P5) não sai (o leitor veria dois números), em vez de afirmar um preço contraditório.
// Invariante: o "hoje" dito nunca é maior que a menor oferta elegível do mesmo conjunto (ver `hojeContradizBase`).

/** A base da mensagem inclui a Amazon? (só quando a contenção #120 está desligada.) */
export function baseIncluiAmazon(amazonForaDasMensagens: boolean): boolean {
  return !amazonForaDasMensagens;
}

/**
 * O "hoje" dito contradiz a base? `amazonMinCents` = menor preço de oferta Amazon elegível e confirmada em até 24 h que a base
 * da mensagem deixou de fora (null quando a Amazon já está na base ou não há oferta). Contradiz quando é estritamente mais barata.
 */
export function hojeContradizBase(hojeCents: number, amazonMinCents: number | null | undefined): boolean {
  return amazonMinCents != null && amazonMinCents > 0 && amazonMinCents < hojeCents;
}
