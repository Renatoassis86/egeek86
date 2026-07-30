export default function NoticiasLoading() {
  return (
    <div className="w-full min-h-[75vh] p-6 lg:p-12 max-w-7xl mx-auto space-y-8 animate-pulse">
      <div className="h-64 w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-4">
        <div className="h-6 w-32 bg-blue-500/20 rounded-md" />
        <div className="h-10 w-2/3 bg-zinc-800/80 rounded-md" />
        <div className="h-4 w-1/2 bg-zinc-800/40 rounded-md" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-72 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="h-36 w-full bg-zinc-800/50 rounded-lg" />
            <div className="h-5 w-4/5 bg-zinc-800/70 rounded" />
            <div className="h-4 w-1/2 bg-zinc-800/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
