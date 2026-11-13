import type { Metadata } from 'next';
import { ehConsoleDeVideoGame } from '@/lib/catalog/console-videogame';
import { Suspense } from 'react';
import Link from 'next/link';
import { Flame, TrendingDown, Zap, Gamepad2, Cpu, Headphones, Package } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { SearchResultsView, isSearchRequest } from '@/components/search/search-results-view';
import { SearchBox } from '@/components/search/search-box';
import { OfferFilters } from '@/components/affiliate/offer-filters';
import { MarketplaceHeroBanner } from '@/components/affiliate/marketplace-hero-banner';
import { GroupedOfferShelf } from '@/components/affiliate/grouped-offer-shelf';
import { effectiveOfferType } from '@/components/affiliate/offer-card';
import { OfferSectionNav, type FilterChip, type SectionNavItem } from '@/components/affiliate/offer-section-nav';
import { classifyCatalogItem, dimensionToProductType } from '@/lib/catalog/dimensions';
import {
  listRankedOffers,
  countRankedOffers,
  listNetworks,
  getOfferListingMetrics,
  getFeaturedOffers,
  getActiveCouponsForDisplay,
  type OfferWithRelations,
  type OfferListingMetrics,
} from '@/server/queries/affiliate';
import { isHighlightEligibleSeller } from '@/lib/affiliate/price-verdict';
import { getPublicMetrics } from '@/server/queries/public-metrics';
import type { GameFormat, GamePlatformGen, ProductType } from '@/db/schema';

type SP = { [key: string]: string | string[] | undefined };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 80) : '';
  if (isSearchRequest(sp)) {
    return {
      title: q ? `Preços de ${q}` : 'Menores preços por plataforma',
      description: 'Compare o menor preço de jogos e consoles nas lojas monitoradas, com histórico real.',
      robots: { index: false, follow: true },
    };
  }
  // Variantes filtradas não competem com a vitrine principal.
  const filtered = ['tipo', 'fabricante', 'geracao', 'formato', 'rede', 'ordenar', 'menor'].some((k) => sp[k] != null);
  return {
    title: 'Ofertas & Preços Monitorados',
    description: 'Os melhores preços em cultura geek nos principais marketplaces, com histórico autêntico e cupons do dia.',
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

const FORMAT_VALUES: readonly GameFormat[] = ['physical', 'digital', 'unknown'];
const GEN_VALUES: readonly GamePlatformGen[] = [
  'switch_1',
  'switch_2',
  'ps4',
  'ps5',
  'xbox_one',
  'xbox_series',
  'xbox_360',
  'unknown',
];
const TYPE_VALUES: readonly ProductType[] = ['game', 'console', 'accessory'];

/** Fabricante derivado da plataforma (fonte única; não existe coluna). */
const MAKERS = {
  nintendo: { label: 'Nintendo', gens: ['switch_2', 'switch_1'] as GamePlatformGen[] },
  playstation: { label: 'PlayStation', gens: ['ps5', 'ps4'] as GamePlatformGen[] },
  xbox: { label: 'Xbox', gens: ['xbox_series', 'xbox_one', 'xbox_360'] as GamePlatformGen[] },
} as const;
type MakerKey = keyof typeof MAKERS;
const MAKER_KEYS = Object.keys(MAKERS) as MakerKey[];

function makerOfGen(g: GamePlatformGen): MakerKey | null {
  return MAKER_KEYS.find((k) => (MAKERS[k].gens as GamePlatformGen[]).includes(g)) ?? null;
}

const GEN_SHORT: Partial<Record<GamePlatformGen, string>> = {
  switch_2: 'Switch 2',
  switch_1: 'Switch',
  ps5: 'PS5',
  ps4: 'PS4',
  xbox_series: 'Xbox Series X|S',
  xbox_one: 'Xbox One',
  xbox_360: 'Xbox 360',
};

const TYPE_ANCHOR: Record<ProductType, string> = { game: 'jogos', console: 'consoles', accessory: 'acessorios' };
const TYPE_LABEL: Record<ProductType, string> = { game: 'Jogos', console: 'Consoles', accessory: 'Acessórios' };

/** Limiares da ata (2026-11-01): sem relaxar para encher seção. */
const MIN_EDITORIAL = 3;
const MIN_SHELF = 4;
const MAX_PER_SHELF = 8;
/** Acima disso a queda contra a média é zona de suspeita (isca/erro), não destaque. */
const MAX_PLAUSIBLE_DROP_PERCENT = 60;

function parseEnumParam<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function parseEnumListParam<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T[] | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (v == null) return undefined;
  const parsed = v.split(',').filter((item): item is T => (allowed as readonly string[]).includes(item));
  return parsed.length > 0 ? parsed : undefined;
}

function withinHours(iso: string, hours: number): boolean {
  return Date.now() - new Date(iso).getTime() <= hours * 3_600_000;
}

function isBundleOffer(o: OfferWithRelations): boolean {
  const mp = o.masterProduct;
  return classifyCatalogItem(mp.name, mp.productType, mp.gameFormat).bundle === true;
}

type Metrics = Map<string, OfferListingMetrics>;

/** Ordem dentro da prateleira: abaixo do normal primeiro (maior queda), depois preço. */
function rankForShelf(a: OfferWithRelations, b: OfferWithRelations, m: Metrics, desc: boolean): number {
  const da = m.get(a.id)?.verdict;
  const db = m.get(b.id)?.verdict;
  const ka = da?.kind === 'below' ? (da.deltaPercent ?? 0) : 1000;
  const kb = db?.kind === 'below' ? (db.deltaPercent ?? 0) : 1000;
  if (ka !== kb) return ka - kb;
  return desc ? b.currentPriceCents - a.currentPriceCents : a.currentPriceCents - b.currentPriceCents;
}

export default async function OffersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const gameFormat = parseEnumParam(sp.formato, FORMAT_VALUES);
  const geracao = parseEnumListParam(sp.geracao, GEN_VALUES);
  const productType = parseEnumParam(sp.tipo, TYPE_VALUES);
  const maker = parseEnumParam(sp.fabricante, MAKER_KEYS);
  const networkId = typeof sp.rede === 'string' && sp.rede ? sp.rede : undefined;
  const explicitSort = sp.ordenar === 'price_desc' || sp.ordenar === 'price_asc';
  const sortBy = sp.ordenar === 'price_desc' ? 'price_desc' : 'price_asc';
  const lowestTab = parseEnumParam(sp.menor, TYPE_VALUES);

  // Busca (termo ou plataforma): motor novo de busca de produtos, cartão por jogo.
  if (isSearchRequest(sp)) {
    return <SearchResultsView searchParams={sp} />;
  }

  // Plataformas pedidas = interseção de ?geracao e ?fabricante (interseção vazia = vazio honesto).
  let gens: GamePlatformGen[] | undefined = geracao;
  if (maker) {
    const allowed = MAKERS[maker].gens;
    gens = geracao ? geracao.filter((g) => allowed.includes(g)) : [...allowed];
  }
  const impossible = gens != null && gens.length === 0;

  const anyFilter = Boolean(gameFormat || geracao || productType || maker || networkId);
  const types: ProductType[] = productType ? [productType] : ['game', 'console', 'accessory'];
  const limitByType: Record<ProductType, number> = anyFilter
    ? { game: 600, console: 200, accessory: 300 }
    : { game: 250, console: 120, accessory: 120 };

  const [networks, coupons, publicMetrics] = await Promise.all([listNetworks().catch((e) => { console.error('[ofertas] listNetworks falhou, segue sem o filtro de rede', e); return [] as Awaited<ReturnType<typeof listNetworks>>; }), getActiveCouponsForDisplay(), getPublicMetrics()]);

  const baseFilter = { gameFormat, networkId, sortBy: sortBy as 'price_asc' | 'price_desc', gamePlatformGen: gens };

  // Contagem REAL por tipo (e por geração): mesma lista completa em cache (SWR) de listRankedOffers, mesmo
  // porteiro e mesmos filtros; o `limit` só recorta os itens exibidos, nunca o número mostrado nos chips.
  type RealCounts = Awaited<ReturnType<typeof countRankedOffers>>;
  const emptyCounts: RealCounts = { total: 0, byGen: {} };
  const [poolsRaw, featuredRaw, countsRaw] = impossible
    ? [[] as OfferWithRelations[][], [] as OfferWithRelations[], types.map(() => emptyCounts)]
    : await Promise.all([
        Promise.all(types.map((t) => listRankedOffers({ ...baseFilter, productType: t, limit: limitByType[t] }))),
        // Extras da vitrine: se o cálculo a frio estourar o tempo, segue sem eles (cache enche por trás).
        getFeaturedOffers({ ...baseFilter, productType }, 12).catch(() => [] as OfferWithRelations[]),
        Promise.all(types.map((t) => countRankedOffers({ ...baseFilter, productType: t }))),
      ]);
  const countsByType = new Map<ProductType, RealCounts>(types.map((t, i) => [t, countsRaw[i]]));
  const realTotal = countsRaw.reduce((acc, c) => acc + c.total, 0);
  const genTotal = (t: ProductType, g: GamePlatformGen) => countsByType.get(t)?.byGen[g] ?? 0;

  // Tipo EFETIVO (cartela): a consulta já filtra por aba, mas a prateleira nunca confia no tipo cru do banco.
  const pool: OfferWithRelations[] = [];
  const seenMasters = new Set<string>();
  poolsRaw.forEach((list) => {
    for (const o of list) {
      if (dimensionToProductType(classifyCatalogItem(o.masterProduct.name, o.masterProduct.productType, o.masterProduct.gameFormat).dimension) === null) continue;
      if (seenMasters.has(o.masterProduct.id)) continue;
      seenMasters.add(o.masterProduct.id);
      pool.push(o);
    }
  });
  const featuredExtra = featuredRaw.filter((o) => !seenMasters.has(o.masterProduct.id));
  const candidates = [...pool, ...featuredExtra];
  const metricsMap = await getOfferListingMetrics(candidates.map((o) => o.id));

  const typeOf = (o: OfferWithRelations) => effectiveOfferType(o);
  const ordinary = (o: OfferWithRelations) => !isBundleOffer(o);
  const gen = (o: OfferWithRelations) => o.masterProduct.gamePlatformGen;

  // ---- Seções editoriais (cascata: Dia > Menor preço > Destaques; cada produto uma vez) ----
  const used = new Set<string>();
  const take = (list: OfferWithRelations[]) => list.forEach((o) => used.add(o.masterProduct.id));
  const editorialOk = (o: OfferWithRelations) =>
    ordinary(o) && isHighlightEligibleSeller(o.seller) && metricsMap.has(o.id);

  // 1. Ofertas do dia: queda confirmada nas últimas 24 h, histórico elegível, veredito "abaixo".
  const todayAll = candidates
    .filter((o) => {
      const m = metricsMap.get(o.id);
      return (
        editorialOk(o) &&
        m?.priceDrop != null &&
        withinHours(m.priceDrop.at, 24) &&
        m.verdict.kind === 'below' &&
        !m.verdict.lowConfidence &&
        m.priceDrop.percent <= MAX_PLAUSIBLE_DROP_PERCENT
      );
    })
    .sort((a, b) => (metricsMap.get(b.id)?.priceDrop?.percent ?? 0) - (metricsMap.get(a.id)?.priceDrop?.percent ?? 0));
  const today = todayAll.length >= MIN_EDITORIAL ? todayAll.slice(0, MAX_PER_SHELF) : [];
  take(today);

  // 3 (calculada antes por causa da cascata). Menor preço já visto, por aba de tipo.
  const lowestAll = candidates
    .filter((o) => editorialOk(o) && metricsMap.get(o.id)?.isLowestEver === true && !used.has(o.masterProduct.id))
    .sort((a, b) => (metricsMap.get(a.id)?.verdict.deltaPercent ?? 0) - (metricsMap.get(b.id)?.verdict.deltaPercent ?? 0));
  const lowestByType = (t: ProductType) => lowestAll.filter((o) => typeOf(o) === t);
  const lowestTabs = types.filter((t) => lowestByType(t).length >= MIN_EDITORIAL);
  const activeLowestTab = lowestTab && lowestTabs.includes(lowestTab) ? lowestTab : lowestTabs[0];
  const lowest = activeLowestTab ? lowestByType(activeLowestTab).slice(0, MAX_PER_SHELF) : [];
  take(lowest);

  // 2. Destaques da semana: maiores quedas contra a média única (todas as lojas). Sem dado de venda: nome honesto.
  const dropsAll = candidates
    .filter((o) => {
      const m = metricsMap.get(o.id);
      const pct = m?.verdict.deltaPercent;
      return (
        editorialOk(o) &&
        !used.has(o.masterProduct.id) &&
        m?.verdict.kind === 'below' &&
        !m.verdict.lowConfidence &&
        pct != null &&
        pct >= -MAX_PLAUSIBLE_DROP_PERCENT
      );
    })
    .sort((a, b) => (metricsMap.get(a.id)?.verdict.deltaPercent ?? 0) - (metricsMap.get(b.id)?.verdict.deltaPercent ?? 0));
  // Teto de 50% por tipo (acessório barato não engole jogo/console)
  const perType: Record<string, number> = {};
  const drops: OfferWithRelations[] = [];
  for (const o of dropsAll) {
    const t = typeOf(o);
    if ((perType[t] ?? 0) >= MAX_PER_SHELF / 2) continue;
    perType[t] = (perType[t] ?? 0) + 1;
    drops.push(o);
    if (drops.length >= MAX_PER_SHELF) break;
  }
  const weekly = drops.length >= MIN_EDITORIAL ? drops : [];
  take(weekly);

  // ---- Prateleiras de catálogo: tipo efetivo x plataforma/família ----
  const desc = explicitSort && sortBy === 'price_desc';
  const sorted = (list: OfferWithRelations[]) => [...list].sort((a, b) => rankForShelf(a, b, metricsMap, desc));
  const ordinaryPool = pool.filter(ordinary);

  interface Shelf {
    id: string;
    title: string;
    subtitle?: string;
    offers: OfferWithRelations[];
    total: number;
    href: string;
  }
  const hrefWith = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val && !['menor'].includes(k)) p.set(k, val);
    }
    for (const [k, v] of Object.entries(over)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    return `/ofertas${qs ? `?${qs}` : ''}`;
  };

  const platformShelves = (t: ProductType, label: string): Shelf[] => {
    const list = ordinaryPool.filter((o) => typeOf(o) === t);
    return MAKER_KEYS.flatMap((mk) =>
      MAKERS[mk].gens.map((g): Shelf | null => {
        const items = list.filter((o) => gen(o) === g);
        if (items.length < MIN_SHELF) return null;
        return {
          id: `${TYPE_ANCHOR[t]}-${g.replace('_', '')}`,
          title: `${label} · ${GEN_SHORT[g] ?? g}`,
          offers: sorted(items).slice(0, MAX_PER_SHELF),
          total: Math.max(genTotal(t, g), items.length),
          href: hrefWith({ tipo: t, geracao: g, fabricante: null }),
        };
      })
    ).filter((x): x is Shelf => x !== null);
  };

  const gameShelves = types.includes('game') ? platformShelves('game', 'Jogos') : [];
  const accessoryShelves = types.includes('accessory') ? platformShelves('accessory', 'Acessórios') : [];
  // Consoles por família (fabricante)
  const consoleShelves: Shelf[] = types.includes('console')
    ? MAKER_KEYS.map((mk): Shelf | null => {
        const items = ordinaryPool.filter((o) => typeOf(o) === 'console' && ehConsoleDeVideoGame(o.masterProduct.name, o.currentPriceCents) && makerOfGen(gen(o)) === mk);
        if (items.length < MIN_SHELF) return null;
        return {
          id: `consoles-${mk}`,
          title: `Consoles · ${MAKERS[mk].label}`,
          offers: sorted(items).slice(0, MAX_PER_SHELF),
          total: Math.max(MAKERS[mk].gens.reduce((acc, g) => acc + genTotal('console', g), 0), items.length),
          href: hrefWith({ tipo: 'console', fabricante: mk, geracao: null }),
        };
      }).filter((x): x is Shelf => x !== null)
    : [];

  // Kits e bundles: fora das prateleiras comuns (média própria), com selo de kit
  const bundleItems = pool.filter(isBundleOffer);
  const bundleShelf = bundleItems.length >= MIN_SHELF ? sorted(bundleItems).slice(0, MAX_PER_SHELF) : [];

  const groups: Array<{ type: ProductType; anchor: string; label: string; shelves: Shelf[] }> = [
    { type: 'game', anchor: 'jogos', label: 'Jogos por plataforma', shelves: gameShelves },
    { type: 'console', anchor: 'consoles', label: 'Consoles por família', shelves: consoleShelves },
    { type: 'accessory', anchor: 'acessorios', label: 'Acessórios por plataforma', shelves: accessoryShelves },
  ];

  // ---- Navegação ----
  const sections: SectionNavItem[] = [];
  if (today.length) sections.push({ id: 'ofertas-do-dia', label: 'Ofertas do dia', count: today.length });
  if (weekly.length) sections.push({ id: 'destaques-da-semana', label: 'Destaques da semana', count: weekly.length });
  if (lowest.length) sections.push({ id: 'menor-preco', label: 'Menor preço já visto', count: lowest.length });
  for (const g of groups) {
    // Total real do tipo no conjunto filtrado (o mesmo "N itens" de ?tipo=...), não a soma do que coube no recorte.
    const n = countsByType.get(g.type)?.total ?? 0;
    if (g.shelves.length > 0 && n > 0) sections.push({ id: g.anchor, label: TYPE_LABEL[g.type], count: n });
  }
  // Kits só são identificáveis pelo título, nas linhas carregadas: sem total real, sem número no chip.
  if (bundleShelf.length) sections.push({ id: 'kits', label: 'Kits e bundles' });

  const typeChips: FilterChip[] = [
    { key: 'all', label: 'Tudo', href: hrefWith({ tipo: null }), active: !productType },
    ...TYPE_VALUES.map((t) => ({ key: t, label: TYPE_LABEL[t], href: hrefWith({ tipo: t }), active: productType === t })),
  ];
  const makerCounts = new Map<MakerKey, number>();
  if (!maker) {
    for (const c of countsRaw) {
      for (const [g, n] of Object.entries(c.byGen) as Array<[GamePlatformGen, number]>) {
        const mk = makerOfGen(g);
        if (mk) makerCounts.set(mk, (makerCounts.get(mk) ?? 0) + n);
      }
    }
  }
  const makerChips: FilterChip[] = [
    { key: 'all', label: 'Todos', href: hrefWith({ fabricante: null }), active: !maker },
    ...MAKER_KEYS.map((mk) => ({
      key: mk,
      label: MAKERS[mk].label,
      href: hrefWith({ fabricante: mk }),
      active: maker === mk,
      count: maker ? undefined : makerCounts.get(mk),
    })),
  ];

  const selectionCount = anyFilter ? realTotal : null;
  const hasContent = sections.length > 0;

  return (
    <section className="mx-auto flex max-w-7xl min-w-0 flex-col gap-6 px-4 py-6 lg:gap-8 lg:px-8 lg:py-10">
      <div className="max-w-3xl min-w-0">
        <SearchBox variant="compact" placeholder="Busque um jogo ou console" />
      </div>

      <MarketplaceHeroBanner
        title="Vitrine de Ofertas"
        subtitle="Preços monitorados nos principais marketplaces, histórico de cotações autêntico e cupons ativos para você comprar na hora certa."
        categoryTag="Geek Deals · Comparador de preços"
        showSearch={false}
        stats={{
          // Sem filtro: mesmos números de todas as telas (getPublicMetrics). Com filtro: só N itens da seleção.
          monitoredProducts: publicMetrics.products,
          lowestPriceCount: publicMetrics.lowestEverCount ?? undefined,
          partnerStores: publicMetrics.stores,
          selectionCount: selectionCount,
        }}
        coupons={coupons}
      />

      <OfferSectionNav sections={sections} typeChips={typeChips} makerChips={makerChips} />

      {/* Filtros: linha rolável, alvos de 44 px */}
      <div className="sticky top-[calc(var(--header-mobile)+8px)] z-20 min-w-0 lg:top-[calc(var(--header-desktop)+12px)]">
        <Suspense fallback={null}>
          <OfferFilters
            networks={networks.map(({ id, name, slug, colorHex }) => ({ id, name, slug, colorHex }))}
            resultCount={anyFilter ? realTotal : undefined} />
        </Suspense>
      </div>

      {!hasContent ? (
        <div className="flex flex-col gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
          <Text variant="body-md">Nenhuma oferta atende aos critérios agora com esses filtros.</Text>
          <Text variant="body-sm" color="secondary">
            As seções só aparecem com histórico elegível e itens suficientes; não completamos com preço sem comprovação.{' '}
            <Link href="/tabela-de-precos" className="font-semibold text-[var(--color-accent-primary)] underline">
              Ver a tabela de preços completa
            </Link>
          </Text>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-10">
          {today.length > 0 && (
            <GroupedOfferShelf
              id="ofertas-do-dia"
              title="Ofertas do dia"
              subtitle="Queda confirmada nas últimas 24 h, abaixo da média de todas as lojas. Preço da última coleta, sem garantia de estoque."
              icon={<Zap className="size-5 text-[var(--color-accent-hype)]" aria-hidden />}
              offers={today}
              metricsMap={metricsMap}
              totalCount={todayAll.length}
            />
          )}

          {weekly.length > 0 && (
            <GroupedOfferShelf
              id="destaques-da-semana"
              title="Destaques da semana"
              subtitle="Maiores quedas contra a média de todas as lojas. Não é ranking de vendas."
              icon={<Flame className="size-5 text-[var(--color-accent-hype)]" aria-hidden />}
              offers={weekly}
              metricsMap={metricsMap}
              totalCount={dropsAll.length}
            />
          )}

          {lowest.length > 0 && (
            <div className="flex min-w-0 flex-col gap-3">
              {lowestTabs.length > 1 && (
                <div className="no-scrollbar flex items-center gap-2 overflow-x-auto" role="tablist" aria-label="Menor preço já visto por tipo">
                  {lowestTabs.map((t) => (
                    <Link
                      key={t}
                      role="tab"
                      aria-selected={t === activeLowestTab}
                      href={`${hrefWith({ menor: t })}#menor-preco`}
                      scroll={false}
                      className={`inline-flex min-h-11 shrink-0 items-center border px-3.5 text-[13px] font-semibold ${
                        t === activeLowestTab
                          ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-muted)] text-[var(--color-text-primary)]'
                          : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {TYPE_LABEL[t]} ({lowestByType(t).length})
                    </Link>
                  ))}
                </div>
              )}
              <GroupedOfferShelf
                id="menor-preco"
                title="Menor preço já visto"
                subtitle="Menor preço registrado pelo Espaço Geek 86 desde 13/07/2026, com histórico elegível e vendedor confiável."
                icon={<TrendingDown className="size-5 text-[var(--color-accent-success)]" aria-hidden />}
                offers={lowest}
                metricsMap={metricsMap}
                totalCount={activeLowestTab ? lowestByType(activeLowestTab).length : undefined}
              />
            </div>
          )}

          {groups.map((g) =>
            g.shelves.length > 0 ? (
              <div key={g.anchor} id={g.anchor} className="flex min-w-0 scroll-mt-[calc(var(--header-mobile)+72px)] flex-col gap-8 border-t border-[var(--color-border-subtle)] pt-6">
                <Text variant="label" color="tertiary" className="flex items-center gap-2 text-[12px]">
                  {g.type === 'game' ? <Gamepad2 className="size-4" aria-hidden /> : g.type === 'console' ? <Cpu className="size-4" aria-hidden /> : <Headphones className="size-4" aria-hidden />}
                  {g.label}
                </Text>
                {g.shelves.map((s) => (
                  <GroupedOfferShelf
                    key={s.id}
                    id={s.id}
                    title={s.title}
                    offers={s.offers}
                    metricsMap={metricsMap}
                    totalCount={s.total}
                    seeAllHref={s.href}
                  />
                ))}
              </div>
            ) : null
          )}

          {bundleShelf.length > 0 && (
            <div className="border-t border-[var(--color-border-subtle)] pt-6">
              <GroupedOfferShelf
                id="kits"
                title="Kits e bundles"
                subtitle="Kits têm composição própria e ficam fora da média do produto avulso."
                icon={<Package className="size-5 text-[var(--color-accent-primary)]" aria-hidden />}
                offers={bundleShelf}
                metricsMap={metricsMap}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
