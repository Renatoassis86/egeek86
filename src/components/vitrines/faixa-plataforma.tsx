'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FaixaVitrine } from '@/components/vitrines/faixa-vitrine';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import type { PlataformaVitrine, VitrineItem } from '@/lib/vitrines/tipos';

export interface SubabaPlataforma {
  plataforma: PlataformaVitrine;
  rotulo: string;
  /** Já filtradas pelo servidor: vazio = a linha some (menos de 4 itens elegíveis). */
  jogos: VitrineItem[];
  consoles: VitrineItem[];
}

/**
 * Faixa de uma plataforma (checklist #11): cabeçalho, sub-abas (PS5/PS4, Switch 2/Switch) e duas linhas (jogos e consoles),
 * cada uma só se tiver itens. Recebe só dado real; a faixa inteira some quando nenhuma sub-aba tem linha.
 * Só a sub-aba ativa monta cartões (o DOM não dobra).
 */
export function FaixaPlataforma({ id, rotulo, hrefVerTudo, subabas }: { id: string; rotulo: string; hrefVerTudo: string; subabas: SubabaPlataforma[] }) {
  const validas = subabas.filter((s) => s.jogos.length > 0 || s.consoles.length > 0);
  const [ativa, setAtiva] = useState(0);
  if (validas.length === 0) return null;
  const atual = validas[Math.min(ativa, validas.length - 1)];

  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-10">
      <div className="mb-4 flex min-h-[52px] flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2">
          <Text as="h2" id={`${id}-titulo`} variant="heading-lg" className="font-black tracking-tight">
            {rotulo}
          </Text>
          {validas.length > 1 ? (
            <div role="tablist" aria-label={`${rotulo}: plataforma`} className="flex">
              {validas.map((s, i) => (
                <button
                  key={s.plataforma}
                  type="button"
                  role="tab"
                  id={`${id}-aba-${s.plataforma}`}
                  aria-selected={s === atual}
                  aria-controls={`${id}-painel`}
                  onClick={() => setAtiva(i)}
                  className={cn(
                    'min-h-11 min-w-11 border px-4 text-sm font-semibold',
                    s === atual
                      ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-muted)] text-[var(--color-accent-primary)]'
                      : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-inset)]',
                  )}
                >
                  {s.rotulo}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Link href={hrefVerTudo} className="inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-sm font-semibold text-[var(--color-accent-primary)] hover:underline">
          Ver tudo <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-aba-${atual.plataforma}`} className="flex flex-col gap-6">
        {atual.jogos.length > 0 ? (
          <div>
            <Text as="h3" variant="label" color="tertiary" className="mb-2">Jogos</Text>
            <FaixaVitrine key={`${atual.plataforma}-jogos`} itens={atual.jogos} rotulo={`${atual.rotulo}: jogos`} />
          </div>
        ) : null}
        {atual.consoles.length > 0 ? (
          <div>
            <Text as="h3" variant="label" color="tertiary" className="mb-2">Consoles</Text>
            <FaixaVitrine key={`${atual.plataforma}-consoles`} itens={atual.consoles} rotulo={`${atual.rotulo}: consoles`} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
