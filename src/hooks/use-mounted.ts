'use client';

import { useEffect, useState } from 'react';

/** Retorna true após o primeiro render no cliente. Útil para evitar hydration mismatch. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
