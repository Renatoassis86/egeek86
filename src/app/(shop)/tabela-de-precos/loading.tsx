export default function TabelaDePrecosLoading() {
  return (
    <div className="w-full min-h-[75vh] p-6 lg:p-12 max-w-7xl mx-auto space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-64 bg-zinc-800/80 rounded-md" />
        <div className="h-4 w-96 bg-zinc-800/40 rounded-md" />
      </div>

      <div className="h-14 w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex gap-4">
        <div className="h-full w-full bg-zinc-800/50 rounded-md" />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 w-full bg-zinc-800/40 rounded-lg flex items-center px-4 justify-between">
            <div className="h-5 w-64 bg-zinc-700/60 rounded" />
            <div className="h-5 w-24 bg-zinc-700/40 rounded" />
            <div className="h-5 w-20 bg-blue-500/20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
