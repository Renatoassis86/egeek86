import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getUserWatches } from '@/server/queries/price-watches';
import { getMasterProductPriceHistory, getMasterProductChangePercent } from '@/server/queries/price-history';
import { MonitoringBoard } from '@/components/monitoring/monitoring-board';

// Ilustração decorativa do estado vazio (deslogado ou sem watchlist) — ver
// docs/banco-mestre-prompts-imagens.md item 1.2. O dashboard com dado real
// não leva imagem nenhuma (100% interface de dado, de propósito).
function EmptyStateIllustration() {
  return (
    <div className="relative mx-auto mb-8 aspect-[8/5] w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)]">
      <Image
        src="/images/monitoramento/empty-state.png"
        alt=""
        fill
        sizes="(min-width: 1024px) 448px, 90vw"
        className="object-cover"
      />
    </div>
  );
}

export const metadata = { title: 'Monitoramento de Preços | Espaço Geek 86' };
export const dynamic = 'force-dynamic';

/**
 * Dashboard estilo tela de bolsa pros jogos que o usuário acompanha. O preço
 * rastreado é sempre o MENOR entre todos os vendedores/plataformas ativos do
 * produto (Mercado Livre, Shopee, Amazon etc quando existirem), nunca de um
 * vendedor específico — clicar no preço abre a comparação entre vendedores.
 * Gate suave (getCurrentProfile, não requireCustomer) — mesmo padrão de
 * /conta: deslogado ou sem watchlist vê um CTA, nunca um redirect forçado.
 */
export default async function MonitoramentoPage({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>;
}) {
  const { jogo } = await searchParams;
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <section className="mx-auto max-w-3xl px-4 lg:px-8 py-16 text-center">
        <EmptyStateIllustration />
        <Text as="h1" variant="heading-xl">
          Monitoramento de preço
        </Text>
        <Text variant="body-md" color="secondary" className="mt-3">
          Entre na sua conta pra montar seu painel de acompanhamento, como uma tela de bolsa, só que pros seus jogos.
        </Text>
        <Button asChild className="mt-6">
          <Link href="/entrar?next=/monitoramento">Entrar</Link>
        </Button>
      </section>
    );
  }

  const watches = await getUserWatches(profile.id);

  if (watches.length === 0) {
    return (
      <section className="mx-auto max-w-3xl px-4 lg:px-8 py-16 text-center">
        <EmptyStateIllustration />
        <Text as="h1" variant="heading-xl">
          Monitoramento de preço
        </Text>
        <Text variant="body-md" color="secondary" className="mt-3">
          Você ainda não está acompanhando nenhum jogo. Encontre um na vitrine e clique em &quot;Acompanhar
          preço&quot; pra ele aparecer aqui.
        </Text>
        <Button asChild className="mt-6">
          <Link href="/ofertas">Explorar ofertas</Link>
        </Button>
      </section>
    );
  }

  const selected = watches.find((w) => w.masterProductId === jogo) ?? watches[0];
  const [initialHistory, changeMap] = await Promise.all([
    getMasterProductPriceHistory(selected.masterProductId, '1M'),
    getMasterProductChangePercent(watches.map((w) => w.masterProductId)),
  ]);

  const watchlistItems = watches.map((w) => ({
    masterProductId: w.masterProductId,
    slug: w.offerSlug,
    title: w.title,
    imageUrl: w.imageUrl,
    networkName: w.networkName,
    currentPriceCents: w.currentPriceCents,
    changePercent: changeMap.get(w.masterProductId)?.changePercent ?? null,
  }));

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-14">
      <div className="mb-8">
        <Text as="h1" variant="heading-xl">
          Monitoramento de preço
        </Text>
        <Text variant="body-md" color="secondary" className="mt-1">
          Acompanhe o menor preço entre todos os vendedores dos jogos que você monitora, do dia a dia até o
          histórico completo.
        </Text>
      </div>

      <MonitoringBoard
        watchlistItems={watchlistItems}
        initialSelectedId={selected.masterProductId}
        initialHistory={initialHistory}
      />
    </section>
  );
}
