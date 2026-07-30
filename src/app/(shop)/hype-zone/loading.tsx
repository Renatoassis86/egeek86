export default function HypeZoneLoading() {
  return (
    <div className="w-full min-h-[40vh] flex flex-col items-center justify-center p-8 text-center transition-opacity duration-300">
      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-mono animate-pulse">
        <span className="size-2 rounded-full bg-amber-500 animate-ping" />
        <span>Carregando Hype Zone &amp; Drops...</span>
      </div>
    </div>
  );
}
