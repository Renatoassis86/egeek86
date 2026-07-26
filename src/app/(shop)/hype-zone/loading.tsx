export default function HypeZoneLoading() {
  return (
    <div className="w-full min-h-[75vh] p-6 lg:p-12 max-w-7xl mx-auto space-y-8 animate-pulse">
      <div className="h-48 w-full bg-gradient-to-r from-purple-950/40 to-amber-950/40 border border-purple-800/30 rounded-3xl p-8 space-y-4">
        <div className="h-6 w-36 bg-purple-500/20 rounded-md" />
        <div className="h-10 w-1/2 bg-zinc-800/80 rounded-md" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-80 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
            <div className="h-44 w-full bg-zinc-800/50 rounded-lg" />
            <div className="h-5 w-3/4 bg-zinc-800/70 rounded" />
            <div className="h-8 w-full bg-purple-500/20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
