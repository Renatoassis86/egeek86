/**
 * Aquecimento do cache da vitrine após subir o servidor (processo Node longo,
 * `next start`). Sem isso, a 1ª visita depois de um reinício paga o cálculo a
 * frio (~20 s) sozinha. Faz as mesmas requisições que um visitante faria, uma de
 * cada vez e em segundo plano (não atrasa o "Ready"); o resto do cache é por
 * item e se completa sozinho (src/lib/cache/swr.ts). Fora da Vercel/serverless.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production' || process.env.VERCEL) return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const port = process.env.PORT;
  if (!port) return;

  const paths = [
    '/',
    '/ofertas',
    '/ofertas?tipo=game',
    '/ofertas?tipo=console',
    '/ofertas?tipo=accessory',
    '/ofertas?fabricante=playstation',
    '/ofertas?fabricante=xbox',
    '/ofertas?fabricante=nintendo',
  ];
  const timer = setTimeout(async () => {
    for (const p of paths) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(120_000) });
        await res.arrayBuffer();
        console.log(`[warmup] ${p} ${res.status}`);
      } catch (err) {
        console.error(`[warmup] ${p} falhou:`, err instanceof Error ? err.message : err);
      }
    }
  }, 3000);
  timer.unref?.();
}
