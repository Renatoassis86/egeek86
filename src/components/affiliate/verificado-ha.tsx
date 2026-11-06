'use client';

import { useEffect, useState } from 'react';
import { verificadoHaTexto } from '@/lib/pricing/verificado-ha';

const TZ = 'America/Sao_Paulo';

/** Texto fixo (verdadeiro sem JavaScript e idêntico no servidor e na hidratação): "verificado em DD/MM HH:mm". */
function fixo(iso: string): string {
  return `verificado em ${new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')}`;
}


/**
 * "verificado há X h" calculado no CLIENTE (a página fica em cache; calcular no servidor congelaria o texto).
 * Antes de hidratar (ou sem JS) mostra o instante fixo, que continua verdadeiro. Atualiza a cada minuto.
 */
export function VerificadoHa({ iso }: { iso: string }) {
  const [texto, setTexto] = useState(() => fixo(iso));
  useEffect(() => {
    const atualizar = () => setTexto(verificadoHaTexto(iso, Date.now()));
    atualizar();
    const id = setInterval(atualizar, 60_000);
    return () => clearInterval(id);
  }, [iso]);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {texto}
    </time>
  );
}
