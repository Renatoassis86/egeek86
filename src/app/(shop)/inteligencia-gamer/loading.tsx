export default function ObservatorioGamerLoading() {
  return (
    <div className="w-full min-h-[40vh] flex flex-col items-center justify-center p-8 text-center transition-opacity duration-300">
      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-xs font-mono animate-pulse">
        <span className="size-2 rounded-full bg-blue-500 animate-ping" />
        <span>Carregando Observatório Gamer &amp; Pesquisas...</span>
      </div>
    </div>
  );
}
