'use client';

import type { CatalogDimension } from '@/lib/catalog/dimensions';
import { ProductImage } from '@/components/ui/product-image';

/** Miniatura de produto: delega ao quadro padrão `ProductImage`. */
export function ProductThumb({
  src,
  alt,
  fallbackLabel,
  dimension,
  bundle,
  className,
}: {
  src: string | null;
  alt: string;
  fallbackLabel: string;
  dimension?: CatalogDimension | null;
  bundle?: boolean;
  className?: string;
}) {
  return <ProductImage src={src} alt={alt} fallbackLabel={fallbackLabel} dimension={dimension} bundle={bundle} padding="sm" className={className} />;
}
