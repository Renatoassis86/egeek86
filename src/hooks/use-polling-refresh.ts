'use client';

import { useEffect, useRef } from 'react';

/**
 * Polling genérico: chama `callback` a cada `intervalMs`, pausa quando a aba
 * fica em background (visibilitychange) e faz um refresh imediato ao voltar
 * o foco, pra nunca mostrar dado visivelmente parado. `callback` é lido via
 * ref pra nunca ficar preso a uma versão antiga sem precisar recriar o
 * interval a cada render.
 */
export function usePollingRefresh(callback: () => void, intervalMs: number, enabled = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      callbackRef.current();
    };

    const interval = setInterval(tick, intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') callbackRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
