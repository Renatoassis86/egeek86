/** Resposta imediata ao toque: o departamento é dinâmico (lê o banco) e levava segundos sem mostrar nada. */
export default function DepartamentoLoading() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:px-8" role="status" aria-live="polite">
      <div className="h-8 w-48 animate-pulse bg-[var(--color-bg-surface)]" />
      <div className="h-4 w-72 max-w-full animate-pulse bg-[var(--color-bg-surface)]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]" />
        ))}
      </div>
      <span className="sr-only">Carregando produtos…</span>
    </div>
  );
}
