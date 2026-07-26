export default function GlobalShopLoading() {
  return (
    <div className="w-full min-h-[70vh] p-6 lg:p-12 max-w-7xl mx-auto space-y-8 animate-pulse">
      <div className="h-10 w-64 bg-zinc-800/60 rounded-md" />
      <div className="h-4 w-96 bg-zinc-800/40 rounded-md" />
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 pt-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-72 bg-zinc-900/80 border border-zinc-800/50 rounded-xl p-4 space-y-4">
            <div className="h-40 w-full bg-zinc-800/50 rounded-lg" />
            <div className="h-5 w-3/4 bg-zinc-800/60 rounded" />
            <div className="h-4 w-1/2 bg-zinc-800/40 rounded" />
            <div className="h-8 w-full bg-zinc-800/70 rounded-lg mt-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
