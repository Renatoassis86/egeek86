import { Suspense } from 'react';
import { getHomeSearchData } from '@/server/queries/home-search';
import { Hero } from '@/components/home/secoes/hero';
import { HomeNewsSection } from '@/components/home/secoes/noticias-home';
import { NewsletterCTA } from '@/components/home/secoes/newsletter';
import { SalesHighlights } from '@/components/geek-deals/sales-highlights';
import { SecaoPlusHome } from '@/components/plus/secao-plus-home';
import { FaixasPlusHome } from '@/components/plus/faixas-plus-home';
import { FaixaBlackFriday } from '@/components/black-friday/faixa-black-friday';

/**
 * Nova landing (checklist #10 a #14), atras da flag REDESENHO_HOME.
 * Estado atual: ESQUELETO em construcao. Reaproveita secoes ja existentes e a faixa da Black Friday; as vitrines novas
 * (quadro de destaques, mudancas do menor preco, faixas por plataforma) entram aqui nos itens #10 a #13.
 * Nao ligar a flag acima de 0% (exceto ?v=2 de admin) antes do QA do item #23.
 */
export async function HomeV2() {
  const searchData = await getHomeSearchData();
  return (
    <>
      <Hero data={searchData} />
      <FaixaBlackFriday />
      <Suspense fallback={null}>
        <SalesHighlights />
      </Suspense>
      <Suspense fallback={null}>
        <SecaoPlusHome />
      </Suspense>
      <Suspense fallback={null}>
        <FaixasPlusHome />
      </Suspense>
      <Suspense fallback={null}>
        <HomeNewsSection />
      </Suspense>
      <NewsletterCTA />
    </>
  );
}
