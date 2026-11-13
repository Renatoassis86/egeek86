import Link from 'next/link';
import { ProductImage } from '@/components/ui/product-image';
import { formatBRL } from '@/lib/format';
import type { VitrineItem } from '@/lib/vitrines/tipos';

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DIA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

function lidoAs(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return DIA.format(d) === DIA.format(new Date()) ? HORA.format(d) : `${DIA.format(d)} ${HORA.format(d)}`;
}

/**
 * Invólucro SIMPLES de cartão para as sessões do FRONTEND-B (Plus, Menor registrado, Acessórios). Troca prevista pelo
 * `CartaoVitrine` do FRONTEND-A quando ele estiver no origin/main. Sem selo e sem média: só preço agora, loja, horário e,
 * quando o chamador passar, um detalhe real (ex.: menor registrado e data). `rotulo` (ex.: nome do departamento) vem do chamador.
 */
export function CartaoSimples({ item, href, rotulo, detalhe }: { item: VitrineItem; href?: string; rotulo?: string; detalhe?: string | null }) {
  const lido = lidoAs(item.lidoEm);
  return (
    <article className="h-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      <Link href={href ?? item.href} className="flex h-full min-h-11 flex-col gap-1.5 p-3 hover:bg-[var(--color-bg-inset)]">
        <ProductImage src={item.imagemUrl} alt={item.titulo} ratio="square" className="w-full shrink-0" />
        <span className="h-4 text-xs font-semibold uppercase leading-4 tracking-wider text-[var(--color-text-tertiary)]">{rotulo ?? ''}</span>
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[var(--color-text-primary)]">{item.titulo}</h3>
        <p className="text-xl font-black leading-6 tabular-nums text-[var(--color-text-primary)]">
          <span className="sr-only">Preço agora: </span>
          {formatBRL(item.precoCentavos)}
        </p>
        {detalhe ? <p className="text-xs leading-4 text-[var(--color-text-secondary)]">{detalhe}</p> : null}
        <p className="mt-auto text-xs leading-4 text-[var(--color-text-tertiary)]">
          {item.loja}
          {lido ? ` · preço lido às ${lido}` : ''}
        </p>
      </Link>
    </article>
  );
}

export function SessaoSimples({ id, titulo, subtitulo, children }: { id: string; titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-10">
      <div className="mb-4">
        <h2 id={`${id}-titulo`} className="text-2xl font-black tracking-tight text-[var(--color-text-primary)]">{titulo}</h2>
        {subtitulo ? <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{subtitulo}</p> : null}
      </div>
      {children}
    </section>
  );
}

export const GRADE_SIMPLES = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-6';
