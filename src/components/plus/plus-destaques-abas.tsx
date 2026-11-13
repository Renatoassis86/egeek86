'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { ProductImage } from '@/components/ui/product-image';
import { VerificadoHa } from '@/components/affiliate/verificado-ha';
import { formatBRL } from '@/lib/format';

export interface ItemPlusAba {
  id: string;
  slug: string;
  nome: string;
  imagem: string | null;
  menorCents: number;
  lojaMenor: string | null;
  verificadoEm: string;
}
export interface AbaPlus {
  dept: string;
  rotulo: string;
  itens: ItemPlusAba[];
}

/** Carrossel único com abas por departamento. Só preço e loja (Plus não mostra selo nem média, R-36). */
export function PlusDestaquesAbas({ abas }: { abas: AbaPlus[] }) {
  const [ativa, setAtiva] = useState(abas[0]?.dept ?? '');
  const atual = abas.find((a) => a.dept === ativa) ?? abas[0];
  if (!atual) return null;
  return (
    <div>
      <div role="tablist" aria-label="Departamentos do Plus" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        {abas.map((a) => {
          const sel = a.dept === atual.dept;
          return (
            <button
              key={a.dept}
              type="button"
              role="tab"
              id={`plus-aba-${a.dept}`}
              aria-selected={sel}
              aria-controls="plus-painel"
              onClick={() => setAtiva(a.dept)}
              className={`inline-flex min-h-11 shrink-0 items-center border px-4 text-[14px] font-bold focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] ${
                sel
                  ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
                  : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-primary)]'
              }`}
            >
              {a.rotulo}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id="plus-painel" aria-labelledby={`plus-aba-${atual.dept}`}>
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
          {atual.itens.map((m) => (
            <li key={m.id} className="w-[46vw] shrink-0 snap-start sm:w-44 lg:w-[calc((100%-4*0.75rem)/5)]">
              <Link
                href={`/mercado/${atual.dept}/${m.slug}`}
                className="flex h-full flex-col gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 hover:border-[var(--color-accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
              >
                <ProductImage src={m.imagem} alt={m.nome} ratio="square" className="w-full" />
                <Text as="h3" variant="body-sm" className="line-clamp-2 min-h-[2.5rem] font-bold leading-snug">{m.nome}</Text>
                <div className="mt-auto flex flex-col gap-0.5 pt-1">
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
        <Link href={`/mercado/${atual.dept}`} className="mt-2 inline-flex min-h-11 items-center gap-2 text-[14px] font-bold text-[var(--color-accent-primary)] hover:underline">
          Ver todos de {atual.rotulo} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
