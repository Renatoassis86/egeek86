export default function OfertasLoading() {
  return (
    <div className="w-full min-h-[70vh] p-6 lg:p-12 max-w-7xl mx-auto space-y-8 animate-pulse">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-2">
          <div className="h-8 w-56 bg-zinc-800/80 rounded-md" />
          <div className="h-4 w-72 bg-zinc-800/40 rounded-md" />
        </div>
        <div className="h-10 w-full md:w-80 bg-zinc-800/60 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-80 bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-4 space-y-4">
            <div className="h-44 w-full bg-zinc-800/50 rounded-lg" />
            <div className="h-5 w-4/5 bg-zinc-800/70 rounded" />
            <div className="h-4 w-1/3 bg-zinc-800/40 rounded" />
            <div className="h-9 w-full bg-amber-500/20 border border-amber-500/30 rounded-lg mt-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
