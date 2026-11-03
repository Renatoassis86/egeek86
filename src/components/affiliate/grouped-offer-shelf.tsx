import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { OfferCard } from './offer-card';
import { cn } from '@/lib/cn';
import type { OfferWithRelations, OfferListingMetrics } from '@/server/queries/affiliate';

interface GroupedOfferShelfProps {
  /** Âncora da seção (navegação por chips). */
  id?: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badgeLabel?: string;
  offers: OfferWithRelations[];
  metricsMap: Map<string, OfferListingMetrics>;
  cardVariant?: 'grid' | 'feature';
  /** "Ver todos" (já filtrado). */
  seeAllHref?: string;
  /** Total real da seleção quando a prateleira mostra só uma parte. */
  totalCount?: number;
}

/**
 * Prateleira de ofertas. No celular é um carrossel horizontal com snap (card
 * ~72vw, o próximo aparece parcialmente); a partir de md vira grade.
 * Pressupõe um ancestral com `px-4` (a trilha sangra -mx-4 até a borda).
 */
export function GroupedOfferShelf({
  id,
  title,
  subtitle,
  icon,
  badgeLabel,
  offers,
  metricsMap,
  cardVariant = 'grid',
  seeAllHref,
  totalCount,
}: GroupedOfferShelfProps) {
  if (!offers || offers.length === 0) return null;

  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-titulo` : undefined}
      className="flex min-w-0 scroll-mt-[calc(var(--header-mobile)+72px)] flex-col gap-3 lg:scroll-mt-[calc(var(--header-desktop)+84px)]"
    >
      <Reveal>
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {icon ? <span className="mt-1 shrink-0">{icon}</span> : null}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Text as="h2" id={id ? `${id}-titulo` : undefined} variant="heading-md" className="min-w-0 break-words font-bold tracking-tight">
                  {title}
                </Text>
                <Badge variant="outline" size="sm" className="font-mono text-[12px]">
                  {totalCount && totalCount > offers.length ? `${offers.length} de ${totalCount}` : offers.length}
                </Badge>
                {badgeLabel && (
                  <Badge variant="hype" size="sm" className="text-[12px] font-bold uppercase tracking-wider">
                    {badgeLabel}
                  </Badge>
                )}
              </div>
              {subtitle && (
                <Text variant="caption" color="secondary" className="mt-0.5 break-words font-medium text-[12px]">
                  {subtitle}
                </Text>
              )}
            </div>
          </div>
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-[13px] font-semibold text-[var(--color-accent-primary)] hover:underline"
            >
              Ver todos
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </Reveal>

      <div
        className={cn(
          'no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-2',
          'md:mx-0 md:grid md:snap-none md:overflow-visible md:px-0 md:pb-0',
          cardVariant === 'feature'
            ? 'md:grid-cols-2 lg:grid-cols-3 md:gap-4'
            : 'md:grid-cols-3 lg:grid-cols-4 lg:gap-4'
        )}
      >
        {offers.map((offer, i) => (
          <div key={offer.id} className="w-[72vw] max-w-[280px] shrink-0 snap-start md:w-auto md:max-w-none">
            <Reveal inView={false} delay={Math.min(i * 0.03, 0.25)} className="h-full">
              <OfferCard offer={offer} metrics={metricsMap.get(offer.id)} variant={cardVariant} />
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}
