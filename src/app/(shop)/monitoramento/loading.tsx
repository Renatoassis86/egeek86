export default function MonitoramentoLoading() {
  return (
    <div className="w-full min-h-[75vh] p-6 lg:p-10 max-w-7xl mx-auto space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-64 bg-zinc-800/80 rounded-md" />
        <div className="h-4 w-96 bg-zinc-800/40 rounded-md" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 h-96 bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-5 space-y-4">
          <div className="h-6 w-1/2 bg-zinc-800/70 rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 w-full bg-zinc-800/40 rounded-lg" />
          ))}
        </div>

        <div className="lg:col-span-8 h-96 bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-6 space-y-6">
          <div className="h-10 w-full bg-zinc-800/50 rounded-lg flex justify-between items-center px-4">
            <div className="h-5 w-48 bg-zinc-700/60 rounded" />
            <div className="h-6 w-24 bg-amber-500/20 rounded" />
          </div>
          <div className="h-64 w-full bg-zinc-800/30 rounded-lg flex items-center justify-center">
            <div className="h-4 w-40 bg-zinc-700/50 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
