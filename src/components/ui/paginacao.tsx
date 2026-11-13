import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Paginação do site (dono, 2026-11-13): sempre mostra QUANTAS páginas existem. Anterior, números das páginas (com reticências quando são
 * muitas), "Página X de N" e Próxima, que fica sempre no final. Cantos retos, alvos de 44 px, só links reais (nada de botão sem destino).
 */
const BASE = 'inline-flex min-h-11 min-w-11 items-center justify-center border px-3 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';
const OFF = 'border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]';
const ON = 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-muted)] text-[var(--color-accent-primary)]';
const DESLIGADO = 'pointer-events-none opacity-40';

/** Janela de números: 1, vizinhas da atual e a última, com 0 marcando as reticências. */
export function numerosDePagina(pagina: number, total: number): number[] {
  const conjunto = new Set<number>([1, total, pagina - 1, pagina, pagina + 1]);
  if (pagina <= 3) [2, 3, 4].forEach((n) => conjunto.add(n));
  if (pagina >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => conjunto.add(n));
  const ordenados = [...conjunto].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const saida: number[] = [];
  ordenados.forEach((n, i) => {
    if (i > 0 && n - ordenados[i - 1] > 1) saida.push(0);
    saida.push(n);
  });
  return saida;
}

export function Paginacao({ pagina, totalPaginas, href, className }: { pagina: number; totalPaginas: number; href: (pagina: number) => string; className?: string }) {
  if (totalPaginas <= 1) return null;
  const numeros = numerosDePagina(pagina, totalPaginas);
  return (
    <nav aria-label="Paginação" className={cn('mt-8 flex flex-col items-center gap-3', className)}>
      <p className="text-[14px] tabular-nums text-[var(--color-text-secondary)]">
        Página {pagina} de {totalPaginas}
      </p>
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>
          {pagina > 1 ? (
            <Link rel="prev" href={href(pagina - 1)} className={cn(BASE, OFF)}>Anterior</Link>
          ) : (
            <span aria-hidden className={cn(BASE, OFF, DESLIGADO)}>Anterior</span>
          )}
        </li>
        {numeros.map((n, i) =>
          n === 0 ? (
            <li key={`e${i}`} aria-hidden className="px-1 text-[var(--color-text-tertiary)]">…</li>
          ) : (
            <li key={n}>
              <Link href={href(n)} aria-label={`Página ${n}`} aria-current={n === pagina ? 'page' : undefined} className={cn(BASE, n === pagina ? ON : OFF)}>
                {n}
              </Link>
            </li>
          ),
        )}
        <li>
          {pagina < totalPaginas ? (
            <Link rel="next" href={href(pagina + 1)} className={cn(BASE, OFF)}>Próxima</Link>
          ) : (
            <span aria-hidden className={cn(BASE, OFF, DESLIGADO)}>Próxima</span>
          )}
        </li>
      </ul>
    </nav>
  );
}
