import { Suspense } from 'react';
import { getPublicMetrics } from '@/server/queries/public-metrics';
import { getSurveyAggregationForHome } from '@/server/queries/survey';
import { getHomeSearchData } from '@/server/queries/home-search';
import { WeeklyPromosSection } from '@/components/geek-deals/weekly-promos-section';
import { SalesHighlights } from '@/components/geek-deals/sales-highlights';
import { SecaoPlusHome } from '@/components/plus/secao-plus-home';
import { FaixasPlusHome } from '@/components/plus/faixas-plus-home';
import { Hero } from '@/components/home/secoes/hero';
import { StatementBand } from '@/components/home/secoes/faixa-declaracao';
import { CategoriesSection } from '@/components/home/secoes/categorias';
import { SurveySection } from '@/components/home/secoes/pesquisa';
import { IndicatorsSection } from '@/components/home/secoes/indicadores';
import { InteligenciaGamerTeaserSection } from '@/components/home/secoes/teaser-inteligencia';
import { HomeNewsSection } from '@/components/home/secoes/noticias-home';
import { Benefits } from '@/components/home/secoes/beneficios';
import { NewsletterCTA } from '@/components/home/secoes/newsletter';

// HOME: so compoe as secoes (cada uma em src/components/home/secoes/*).
// Cada secao com busca propria no banco fica isolada num Suspense para as
// buscas dispararem em paralelo (achado 2026-07-25: a soma sequencial, nao o
// pool de conexoes, travava a Home 25 s+).
// force-dynamic: mostra dado ao vivo sem searchParams; sem isso o build tenta
// pre-renderizar e trava buscando no banco.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [metrics, surveyData, searchData] = await Promise.all([
    getPublicMetrics(),
    getSurveyAggregationForHome(),
    getHomeSearchData(),
  ]);

  return (
    <>
      <Hero data={searchData} />
      <StatementBand products={metrics.products} stores={metrics.stores} quotes={metrics.quotes} />
      <Suspense fallback={null}>
        <WeeklyPromosSection />
      </Suspense>
      <CategoriesSection />
      <Suspense fallback={null}>
        <SalesHighlights />
      </Suspense>
      <Suspense fallback={null}>
        <SecaoPlusHome />
      </Suspense>
      <Suspense fallback={null}>
        <FaixasPlusHome />
      </Suspense>
      <SurveySection surveyData={surveyData} />
      <IndicatorsSection metrics={metrics} />
      <InteligenciaGamerTeaserSection />
      <Suspense fallback={null}>
        <HomeNewsSection />
      </Suspense>
      <Benefits />
      <NewsletterCTA />
    </>
  );
}
