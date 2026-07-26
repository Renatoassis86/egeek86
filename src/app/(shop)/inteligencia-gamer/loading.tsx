export default function ObservatorioGamerLoading() {
  return (
    <div className="w-full min-h-[75vh] p-6 lg:p-12 max-w-7xl mx-auto space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-9 w-72 bg-zinc-800/80 rounded-md" />
        <div className="h-4 w-full max-w-lg bg-zinc-800/40 rounded-md" />
      </div>

      <div className="h-12 w-full bg-zinc-900 border border-zinc-800 rounded-xl flex gap-3 p-1.5 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-full w-32 bg-zinc-800/60 rounded-lg" />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 h-96 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="h-48 w-full bg-zinc-800/50 rounded-xl" />
          <div className="h-7 w-4/5 bg-zinc-800/70 rounded" />
          <div className="h-4 w-full bg-zinc-800/40 rounded" />
        </div>
        <div className="h-96 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="h-6 w-1/2 bg-zinc-800/70 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 w-full bg-zinc-800/40 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
