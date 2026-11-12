import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { ProductImage } from '@/components/ui/product-image';
import { VerificadoHa } from '@/components/affiliate/verificado-ha';
import { formatBRL } from '@/lib/format';
import { getLojasPlus } from '@/server/plus';
import { getDestaquesPlus } from '@/server/plus-destaques';
import { getTiposPrincipaisPlus } from '@/server/plus-tipos';
import { getCurrentProfile } from '@/lib/auth/require-admin';

/**
 * Faixas de destaque da home, uma por loja Plus: os menores preços do momento, confirmados nas últimas horas.
 * Mesma fonte e filtros de /mercado/<dept> (porteiro aprovado + oferta clicável). Sem selo, sem média, sem histórico.
 * Loja fechada para quem vê, ou com menos de 4 produtos, não mostra faixa.
 */
export async function FaixasPlusHome() {
  const perfil = await getCurrentProfile().catch(() => null);
  const lojas = (await getLojasPlus(perfil?.role)).filter((l) => l.aberta);
  if (lojas.length === 0) return null;
  const [destaques, tipos] = await Promise.all([getDestaquesPlus(lojas.map((l) => l.dept)), getTiposPrincipaisPlus(lojas.map((l) => l.dept))]);
  const visiveis = lojas.filter((l) => (destaques[l.dept] ?? []).length > 0);
  if (visiveis.length === 0) return null;

  return (
    <>
      {visiveis.map((l) => {
        const itens = destaques[l.dept];
        const tituloId = `faixa-${l.dept}`;
        return (
          <section key={l.dept} aria-labelledby={tituloId} className="w-full border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] py-8 lg:py-12">
            <div className="mx-auto max-w-7xl px-4 lg:px-8">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex max-w-[60ch] flex-col gap-1 border-l-2 border-[var(--color-accent-primary)] pl-4">
                  <Text variant="label" color="tertiary">Espaço Geek Plus</Text>
                  <Text as="h2" id={tituloId} variant="heading-lg" className="font-black tracking-tight">{l.rotulo}</Text>
                  <Text variant="body-sm" color="secondary">
                    {l.chamada} Os menores preços do momento, com anúncio confirmado nas últimas horas.
                  </Text>
                </div>
                <Link href={`/mercado/${l.dept}`} className="inline-flex min-h-11 items-center gap-2 text-[14px] font-bold text-[var(--color-accent-primary)] hover:underline">
                  Ver todos de {l.rotulo} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
              {(tipos[l.dept] ?? []).length > 0 ? (
                <ul className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" aria-label={`Tipos em ${l.rotulo}`}>
                  {tipos[l.dept].map((t) => (
                    <li key={t.slug} className="shrink-0">
                      <Link href={`/mercado/${l.dept}?tipo=${t.slug}`} className="inline-flex min-h-11 items-center gap-2 border border-[var(--color-border-default)] px-3 text-[13px] font-bold text-[var(--color-text-secondary)] hover:border-[var(--color-accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]">
                        {t.rotulo} <span className="font-mono text-[12px] font-normal text-[var(--color-text-tertiary)]">{t.n}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
                {itens.map((m) => (
                  <li key={m.id} className="w-[62vw] shrink-0 snap-start sm:w-56 lg:w-[calc((100%-3*0.75rem)/4)] xl:w-[calc((100%-4*0.75rem)/5)]">
                    <Link
                      href={`/mercado/${l.dept}/${m.slug}`}
                      className="flex h-full flex-col gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3 hover:border-[var(--color-accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
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
            </div>
          </section>
        );
      })}
    </>
  );
}
