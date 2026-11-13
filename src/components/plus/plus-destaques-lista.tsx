import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { ProductImage } from '@/components/ui/product-image';
import { VerificadoHa } from '@/components/affiliate/verificado-ha';
import { formatBRL } from '@/lib/format';

export interface ItemPlus {
  id: string;
  slug: string;
  nome: string;
  imagem: string | null;
  menorCents: number;
  lojaMenor: string | null;
  verificadoEm: string;
}
export interface FaixaPlus {
  dept: string;
  rotulo: string;
  itens: ItemPlus[];
}

/** Faixas compactas, uma abaixo da outra (todas as lojas do Plus visíveis sem clique). Só preço e loja (R-36: sem selo nem média). */
export function PlusDestaquesLista({ faixas }: { faixas: FaixaPlus[] }) {
  return (
    <div className="flex flex-col">
      {faixas.map((f, i) => {
        const id = `plus-faixa-${f.dept}`;
        return (
          <section key={f.dept} aria-labelledby={id} className={`py-4 ${i > 0 ? 'border-t border-[var(--color-border-subtle)]' : ''}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <Text as="h3" id={id} variant="heading-md" className="font-black tracking-tight">{f.rotulo}</Text>
              <Link href={`/mercado/${f.dept}`} className="inline-flex min-h-11 items-center gap-2 text-[14px] font-bold text-[var(--color-accent-primary)] hover:underline">
                Ver todos de {f.rotulo} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
              {f.itens.map((m) => (
                <li key={m.id} className="w-[46vw] shrink-0 snap-start sm:w-44 lg:w-[calc((100%-4*0.75rem)/5)]">
                  <Link
                    href={`/mercado/${f.dept}/${m.slug}`}
                    className="flex h-full flex-col gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 hover:border-[var(--color-accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
                  >
                    <ProductImage src={m.imagem} alt={m.nome} ratio="square" className="w-full" />
                    <Text as="h4" variant="body-sm" className="line-clamp-2 min-h-[2.5rem] font-bold leading-snug">{m.nome}</Text>
                    <div className="mt-auto flex flex-col gap-0.5">
                      <Text variant="mono-lg" className="font-black text-[var(--color-accent-primary)]">{formatBRL(m.menorCents)}</Text>
                      <Text variant="caption" color="tertiary">
                        {m.lojaMenor ? `em ${m.lojaMenor} · ` : ''}
                        <VerificadoHa iso={m.verificadoEm} />
                      </Text>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
