'use client';

import type { ReactNode } from 'react';
import { Reveal } from '@/components/motion/reveal';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { OfferCard } from './offer-card';
import { cn } from '@/lib/cn';
import type { OfferWithRelations, OfferListingMetrics } from '@/server/queries/affiliate';

interface GroupedOfferShelfProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badgeLabel?: string;
  offers: OfferWithRelations[];
  metricsMap: Map<string, OfferListingMetrics>;
  cardVariant?: 'grid' | 'feature';
}

export function GroupedOfferShelf({
  title,
  subtitle,
  icon,
  badgeLabel,
  offers,
  metricsMap,
  cardVariant = 'grid',
}: GroupedOfferShelfProps) {
  if (!offers || offers.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-3">
          <div className="flex items-center gap-2.5 min-w-0 w-full">
            {icon}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <Text as="h2" variant="heading-lg" className="font-bold tracking-tight break-words">
                  {title}
                </Text>
                <Badge variant="outline" size="sm" className="font-mono">
                  {offers.length}
                </Badge>
                {badgeLabel && (
                  <Badge variant="hype" size="sm" className="font-bold uppercase tracking-wider text-[10px]">
                    {badgeLabel}
                  </Badge>
                )}
              </div>
              {subtitle && (
                <Text variant="caption" color="secondary" className="mt-0.5 font-medium break-words">
                  {subtitle}
                </Text>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      <div
        className={cn(
          cardVariant === 'feature'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4'
        )}
      >
        {offers.map((offer, i) => (
          <Reveal key={offer.id} delay={Math.min(i * 0.03, 0.25)}>
            <OfferCard offer={offer} metrics={metricsMap.get(offer.id)} variant={cardVariant} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}
