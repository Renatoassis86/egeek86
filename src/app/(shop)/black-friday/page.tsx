import type { Metadata } from 'next';
import Link from 'next/link';
import { TrendingDown, Zap } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { GroupedOfferShelf } from '@/components/affiliate/grouped-offer-shelf';
import { FaixasPlusHome } from '@/components/plus/faixas-plus-home';
import { effectiveOfferType } from '@/components/affiliate/offer-card';
import { classifyCatalogItem, dimensionToProductType } from '@/lib/catalog/dimensions';
import { isHighlightEligibleSeller } from '@/lib/affiliate/price-verdict';
import { getOfferListingMetrics, listRankedOffers, type OfferWithRelations } from '@/server/queries/affiliate';
import type { ProductType } from '@/db/schema';
import { DEGRAUS, type Degrau } from '@/lib/messaging/regua';
import { ReguaLegenda, reguaDoFront } from '@/components/regua/regua-oferta';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Black Friday: quedas reais de preço',
  description: 'Os produtos que de fato caíram de preço em novembro, contra a média de todas as lojas monitoradas. Só preço lido na fonte, sem marca de promoção sem prova.',
};

/** Mesmas réguas de /ofertas (ata 2026-11-01): sem relaxar para encher seção. */
const MIN_SHELF = 3;
const MAX_PER_SHELF = 12;
/** Acima disso a queda contra a média é zona de suspeita (isca/erro), não destaque. */
const MAX_PLAUSIBLE_DROP_PERCENT = 60;
const TYPES: ProductType[] = ['game', 'console', 'accessory'];

const withinHours = (iso: string, hours: number) => Date.now() - new Date(iso).getTime() <= hours * 3_600_000;

export default async function BlackFridayPage() {
  const pools = await Promise.all(TYPES.map((t) => listRankedOffers({ productType: t, sortBy: 'price_asc', limit: 250 }).catch(() => [] as OfferWithRelations[])));
  const seen = new Set<string>();
  const candidates: OfferWithRelations[] = [];
  for (const list of pools) {
    for (const o of list) {
      if (dimensionToProductType(classifyCatalogItem(o.masterProduct.name, o.masterProduct.productType, o.masterProduct.gameFormat).dimension) === null) continue;
      if (classifyCatalogItem(o.masterProduct.name, o.masterProduct.productType, o.masterProduct.gameFormat).bundle === true) continue;
      if (seen.has(o.masterProduct.id)) continue;
      seen.add(o.masterProduct.id);
      candidates.push(o);
    }
  }
  const metricsMap = await getOfferListingMetrics(candidates.map((o) => o.id));
  const ok = (o: OfferWithRelations) => isHighlightEligibleSeller(o.seller) && metricsMap.has(o.id);

  // 1. Queda confirmada nas últimas 24 h, abaixo da média única (todas as lojas), com confiança.
  const hoje = candidates
    .filter((o) => {
      const m = metricsMap.get(o.id);
      return ok(o) && m?.priceDrop != null && withinHours(m.priceDrop.at, 24) && m.verdict.kind === 'below' && !m.verdict.lowConfidence && m.priceDrop.percent <= MAX_PLAUSIBLE_DROP_PERCENT;
    })
    .sort((a, b) => (metricsMap.get(b.id)?.priceDrop?.percent ?? 0) - (metricsMap.get(a.id)?.priceDrop?.percent ?? 0))
    .slice(0, MAX_PER_SHELF);
  const usados = new Set(hoje.map((o) => o.masterProduct.id));

  // 2. Maiores quedas contra a média única, por tipo (um tipo não engole os outros).
  const porTipo: Record<string, number> = {};
  const quedas: OfferWithRelations[] = [];
  const todas = candidates
    .filter((o) => {
      const m = metricsMap.get(o.id);
      const pct = m?.verdict.deltaPercent;
      return ok(o) && !usados.has(o.masterProduct.id) && m?.verdict.kind === 'below' && !m.verdict.lowConfidence && pct != null && pct >= -MAX_PLAUSIBLE_DROP_PERCENT;
    })
    .sort((a, b) => (metricsMap.get(a.id)?.verdict.deltaPercent ?? 0) - (metricsMap.get(b.id)?.verdict.deltaPercent ?? 0));
  for (const o of todas) {
    const t = effectiveOfferType(o);
    if ((porTipo[t] ?? 0) >= MAX_PER_SHELF / 2) continue;
    porTipo[t] = (porTipo[t] ?? 0) + 1;
    quedas.push(o);
    if (quedas.length >= MAX_PER_SHELF) break;
  }

  // Seções por degrau da régua (mesma régua das mensagens): o degrau vem da queda sobre a média única, com a elegibilidade do site.
  // Só produto com veredito (média elegível); do degrau mais alto de compra (4) ao de confirmação (5), depois 3, 2 e 1.
  const porDegrau = new Map<Degrau, OfferWithRelations[]>();
  for (const o of candidates) {
    const m = metricsMap.get(o.id);
    if (!ok(o) || !m || m.verdict.kind !== 'below') continue;
    const r = reguaDoFront(o.currentPriceCents, m);
    const d = r?.veredito?.degrau;
    if (!d) continue;
    const lista = porDegrau.get(d) ?? [];
    lista.push(o);
    porDegrau.set(d, lista);
  }
  for (const [d, lista] of porDegrau) {
    lista.sort((a, b) => (metricsMap.get(a.id)?.verdict.deltaPercent ?? 0) - (metricsMap.get(b.id)?.verdict.deltaPercent ?? 0));
    porDegrau.set(d, lista.slice(0, MAX_PER_SHELF));
  }
  const ordemDegraus: Degrau[] = [4, 3, 2, 1, 5];
  const degrausVisiveis = ordemDegraus.filter((d) => (porDegrau.get(d)?.length ?? 0) >= MIN_SHELF);

  const mostraHoje = hoje.length >= MIN_SHELF;
  const mostraQuedas = quedas.length >= MIN_SHELF;

  return (
    <>
      <section className="mx-auto flex max-w-7xl min-w-0 flex-col gap-8 px-4 py-8 lg:px-8 lg:py-12">
        <header className="flex max-w-[64ch] flex-col gap-2 border-l-2 border-[var(--color-accent-primary)] pl-4">
          <Text variant="label" color="tertiary">Black Friday · Novembro</Text>
          <Text as="h1" variant="display-md" className="font-black tracking-tight">Quedas reais de preço</Text>
          <Text variant="body-md" color="secondary">
            Só entra aqui o produto cujo preço de fato caiu contra a média de todas as lojas que monitoramos. Preço da última coleta, sem garantia de estoque. Onde a base de preços ainda é curta, mostramos apenas o menor preço do momento.
          </Text>
        </header>

        {mostraHoje && (
          <GroupedOfferShelf
            id="quedas-do-dia"
            title="Quedas confirmadas nas últimas 24 h"
            subtitle="Abaixo da média de todas as lojas, com histórico elegível."
            icon={<Zap className="size-5 text-[var(--color-accent-hype)]" aria-hidden />}
            offers={hoje}
            metricsMap={metricsMap}
            cardVariant="feature"
          />
        )}
        {mostraQuedas && (
          <GroupedOfferShelf
            id="maiores-quedas"
            title="Maiores quedas contra a média"
            subtitle="Games, consoles e acessórios com o preço mais abaixo da média única."
            icon={<TrendingDown className="size-5 text-[var(--color-accent-primary)]" aria-hidden />}
            offers={quedas}
            metricsMap={metricsMap}
          />
        )}
        {degrausVisiveis.length > 0 && (
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Text as="h2" variant="heading-lg" className="font-black tracking-tight">Por tamanho da queda</Text>
              <ReguaLegenda />
            </div>
            {degrausVisiveis.map((d) => (
              <GroupedOfferShelf
                key={d}
                id={`degrau-${d}`}
                title={`${DEGRAUS[d].marcas} ${DEGRAUS[d].rotulo}`}
                subtitle={d === 5 ? 'Preço muito abaixo da média: confirme o anúncio (modelo, vendedor e frete) antes de comprar.' : 'Queda sobre a média única de todas as lojas, com histórico elegível.'}
                icon={<span aria-hidden className="inline-block size-4" style={{ background: DEGRAUS[d].cor }} />}
                offers={porDegrau.get(d) ?? []}
                metricsMap={metricsMap}
              />
            ))}
          </div>
        )}
        {!mostraHoje && !mostraQuedas && degrausVisiveis.length === 0 && (
          <div className="flex flex-col gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
            <Text variant="body-md">Ainda não há quedas com prova suficiente em games.</Text>
            <Text variant="body-sm" color="secondary">Não completamos a vitrine com preço sem comprovação.</Text>
          </div>
        )}
        <p className="text-[14px]">
          <Link href="/ofertas" className="underline underline-offset-2">Ver todas as ofertas de games</Link>
        </p>
      </section>
      <FaixasPlusHome />
    </>
  );
}
