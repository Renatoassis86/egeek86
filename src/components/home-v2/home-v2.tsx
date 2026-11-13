import { Suspense } from 'react';
import { getHomeSearchData } from '@/server/queries/home-search';
import { HeroCompacto } from '@/components/home-v2/secoes/hero-compacto';
import { SecaoDestaques } from '@/components/home-v2/secoes/secao-destaques';
import { SecaoMudancas } from '@/components/home-v2/secoes/secao-mudancas';
import { SecaoPlataformas } from '@/components/home-v2/secoes/secao-plataformas';
import { VitrineEsqueleto } from '@/components/vitrines/vitrine-ofertas';
import { ListaMudancasEsqueleto } from '@/components/vitrines/lista-mudancas';
import { MenorRegistrado } from '@/components/home/secoes-v2/menor-registrado';
import { AcessoriosColecionaveis } from '@/components/home/secoes-v2/acessorios-colecionaveis';
import { FaixaPlus } from '@/components/home/secoes-v2/faixa-plus';
import { NoticiasV2 } from '@/components/home/secoes-v2/noticias-v2';
import { Contatos } from '@/components/home/secoes/contatos';
import { NewsletterCTA } from '@/components/home/secoes/newsletter';

/**
 * Nova landing (checklist #10 a #14), atras da flag REDESENHO_HOME. Ordem da PROPOSTA_NOVA_VERSAO, secao 3:
 *  1 Hero compacto, 2 Destaques, 3 Mudancas do menor preco, 4 Faixas de plataforma (FRONTEND-A, feitos);
 *  5 Menor preco registrado, 6 Acessorios e colecionaveis, 7 Geek Plus, 8 Noticias, 9 Comunidade (FRONTEND-B).
 * Cada secao com leitura propria fica no seu Suspense (as leituras correm em paralelo); vitrine oculta = secao some.
 * Nao ligar a flag acima de 0% (exceto ?v=2 de admin) antes do QA do item #23.
 */
export async function HomeV2() {
  const searchData = await getHomeSearchData();
  return (
    <>
      <HeroCompacto data={searchData} />
      <Suspense fallback={<VitrineEsqueleto variante="grade" quantidade={4} />}>
        <SecaoDestaques />
      </Suspense>
      <Suspense fallback={<ListaMudancasEsqueleto />}>
        <SecaoMudancas />
      </Suspense>
      <Suspense fallback={<VitrineEsqueleto variante="faixa" quantidade={4} />}>
        <SecaoPlataformas />
      </Suspense>

      {/* FRONTEND-B, 5 a 8: cada sessao some sozinha quando nao ha dado elegivel (checklist #12 a #14). */}
      <Suspense fallback={null}>
        <MenorRegistrado />
      </Suspense>
      <Suspense fallback={null}>
        <AcessoriosColecionaveis />
      </Suspense>
      <Suspense fallback={null}>
        <FaixaPlus />
      </Suspense>
      <Suspense fallback={null}>
        <NoticiasV2 />
      </Suspense>

      {/* ENCAIXE FRONTEND-B, 9: Comunidade = Contatos e canais (Telegram, WhatsApp, e-mail) + cadastro da newsletter. */}
      <Suspense fallback={null}>
        <Contatos />
      </Suspense>
      <NewsletterCTA />
    </>
  );
}
