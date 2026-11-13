import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import { horaDaLeitura, rotuloPlataforma } from '@/components/vitrines/cartao-vitrine';
import { VITRINE_REGRAS } from '@/lib/vitrines/regras';
import type { VitrineItem } from '@/lib/vitrines/tipos';

/** Altura mínima de cada linha (alvo de toque >= 44 px). O esqueleto usa o mesmo valor. */
export const ALTURA_LINHA_MUDANCA_PX = 56;

/**
 * Mudanças do menor preço (checklist #10): lista densa, uma linha por evento com horário, valor novo, valor anterior,
 * queda e loja. Só mostra o que o evento traz; `loja` nula (evento antigo sem oferta) não é preenchida com palpite.
 * No celular as 5 primeiras ficam visíveis; as demais aparecem de md para cima (todas ficam no DOM).
 */
export function ListaMudancas({ itens, hrefVerTudo = '/ofertas' }: { itens: readonly VitrineItem[]; hrefVerTudo?: string }) {
  const lista = itens.filter((i) => i.evento).slice(0, VITRINE_REGRAS.MUDANCAS);
  if (lista.length < VITRINE_REGRAS.MIN_ITENS) return null;
  return (
    <section id="mudancas-menor-preco" aria-labelledby="mudancas-menor-preco-titulo" className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-10">
      <div className="mb-4 flex min-h-[52px] items-end justify-between gap-3">
        <div className="min-w-0">
          <Text as="h2" id="mudancas-menor-preco-titulo" variant="heading-lg" className="font-black tracking-tight">
            Mudanças do menor preço
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-0.5">
            Quedas de pelo menos {VITRINE_REGRAS.MUDANCA_QUEDA_MIN_PCT}% sobre o menor preço anterior, nas últimas {VITRINE_REGRAS.MUDANCA_JANELA_HORAS} horas.
          </Text>
        </div>
        <Link href={hrefVerTudo} className="inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-sm font-semibold text-[var(--color-accent-primary)] hover:underline">
          Ver tudo <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ol className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
        {lista.map((item, i) => {
          const ev = item.evento!;
          const plat = rotuloPlataforma(item.plataforma);
          const sub = [plat, ev.loja].filter(Boolean).join(' · ');
          return (
            <li key={`${item.masterProductId}-${ev.em}`} className={i >= 5 ? 'hidden md:block' : undefined}>
              <Link
                href={item.href}
                className="grid items-center gap-x-3 px-3 py-2 hover:bg-[var(--color-bg-inset)] grid-cols-[3.25rem_1fr_auto] md:grid-cols-[4.5rem_1fr_auto_10rem]"
                style={{ minHeight: ALTURA_LINHA_MUDANCA_PX }}
              >
                <time dateTime={ev.em} className="text-xs font-semibold tabular-nums text-[var(--color-text-secondary)]">
                  {horaDaLeitura(ev.em)}
                </time>
                <span className="min-w-0">
                  <span className="line-clamp-1 text-sm font-semibold text-[var(--color-text-primary)]">{item.titulo}</span>
                  <span className="block truncate text-xs text-[var(--color-text-tertiary)] md:hidden">{sub}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-black tabular-nums text-[var(--color-text-primary)]">{formatBRL(ev.centavos)}</span>
                  <span className="block text-xs tabular-nums text-[var(--color-text-secondary)]">
                    antes {formatBRL(ev.antesCentavos)} (-{Math.round(ev.quedaPct)}%)
                  </span>
                </span>
                <span className="hidden truncate text-xs text-[var(--color-text-secondary)] md:block">{sub}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Esqueleto de altura fixa da lista (cabeçalho de 52 px mais 5 linhas, as visíveis no celular). */
export function ListaMudancasEsqueleto() {
  return (
    <section aria-hidden className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-10">
      <div className="mb-4 h-[52px]" />
      <div className="bg-[var(--color-bg-inset)]" style={{ height: ALTURA_LINHA_MUDANCA_PX * 5 }} />
    </section>
  );
}
