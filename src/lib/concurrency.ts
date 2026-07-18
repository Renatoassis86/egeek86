/**
 * Roda `fn` pra cada item de `items`, no máximo `concurrency` de cada vez —
 * pool de workers simples, sem dependência externa. Pensado pra trabalho
 * I/O-bound (chamada de API externa, query de banco): itens independentes
 * rodam de verdade em paralelo (o event loop intercala as esperas de rede),
 * em vez de esperar cada um terminar antes de começar o próximo.
 *
 * Mutação de estado compartilhado (ex: um objeto de resumo) dentro de `fn` é
 * segura desde que cada mutação em si seja síncrona (sem `await` no meio) —
 * JS não troca de worker no meio de uma instrução só.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
