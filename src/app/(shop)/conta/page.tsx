import Link from 'next/link';
import Image from 'next/image';
import { TrendingDown, TrendingUp, Minus, Flame, Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { PriceRangeBar } from '@/components/geek-deals/price-range-bar';
import { formatBRL } from '@/lib/format';
import { GAME_FORMAT_LABELS, GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getUserWatches } from '@/server/queries/price-watches';

const TREND_META = {
  down: { label: 'Caindo', Icon: TrendingDown, color: 'success' as const },
  up: { label: 'Subindo', Icon: TrendingUp, color: 'danger' as const },
  stable: { label: 'Estável', Icon: Minus, color: 'default' as const },
};

export const metadata = { title: 'Meus jogos' };
// Sem searchParams — força dinâmica (ver nota em src/app/admin/page.tsx).
export const dynamic = 'force-dynamic';

export default async function ContaPage() {
  const profile = await getCurrentProfile();
  const watches = profile ? await getUserWatches(profile.id) : [];

  return (
    <section className="mx-auto max-w-6xl px-4 lg:px-8 py-10 lg:py-14">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Text as="h1" variant="heading-xl">
              Meus jogos
            </Text>
            <Text variant="body-md" color="secondary" className="mt-1 max-w-[60ch]">
              Preço agora, menor histórico e média de 30 dias, pra você saber na hora se vale
              comprar. Avisamos por e-mail e Telegram quando algum desses jogos ficar abaixo do
              normal.
            </Text>
          </div>
          <Button asChild variant="outline" size="md">
            <Link href="/conta/notificacoes">
              <Bell className="size-4" />
              Notificações
            </Link>
          </Button>
        </div>
      </Reveal>

      {watches.length === 0 ? (
        <Reveal delay={0.05}>
          <Card className="mt-8">
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <div className="relative mb-2 aspect-[8/5] w-full max-w-sm overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
                <Image
                  src="/images/conta/empty-state.png"
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 384px, 90vw"
                  className="object-cover"
                />
              </div>
              <Text variant="heading-sm">Você ainda não está acompanhando nenhum jogo</Text>
              <Text variant="body-sm" color="secondary" className="max-w-[46ch]">
                Encontre um jogo na vitrine e clique em &quot;Acompanhar preço&quot;. A partir daí
                a gente cuida de avisar você quando o preço cair de verdade.
              </Text>
              <Button asChild className="mt-2">
                <Link href="/ofertas">Explorar ofertas</Link>
              </Button>
            </CardContent>
          </Card>
        </Reveal>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {watches.map((item, i) => {
            const trend = item.metrics ? TREND_META[item.metrics.trend] : null;
            const isLowest = item.metrics ? item.currentPriceCents <= item.metrics.lowestPriceCents : false;

            return (
              <Reveal key={item.watchId} delay={Math.min(i * 0.04, 0.3)}>
                <Link href={`/ofertas/${item.offerSlug}`}>
                  <Card interactive className="h-full">
                    <CardContent className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" size="sm">
                            {item.networkName}
                          </Badge>
                          {item.gamePlatformGen !== 'unknown' && (
                            <Badge variant="outline" size="sm">
                              {GAME_PLATFORM_GEN_LABELS[item.gamePlatformGen]}
                            </Badge>
                          )}
                        </div>
                        {trend && (
                          <Badge variant={trend.color === 'default' ? 'default' : trend.color} size="sm">
                            <trend.Icon className="size-3" />
                            {trend.label}
                          </Badge>
                        )}
                      </div>

                      <Text variant="body-md" className="line-clamp-2 font-medium">
                        {item.title}
                      </Text>

                      {isLowest && (
                        <Badge variant="hype" size="sm" className="w-fit">
                          <Flame className="size-3" />
                          Menor preço já visto
                        </Badge>
                      )}

                      <Text variant="heading-md" className="tabular mt-auto">
                        {formatBRL(item.currentPriceCents)}
                      </Text>

                      {item.metrics && (
                        <PriceRangeBar currentPriceCents={item.currentPriceCents} metrics={item.metrics} />
                      )}

                      {item.gameFormat !== 'unknown' && (
                        <Text variant="caption" color="tertiary">
                          {GAME_FORMAT_LABELS[item.gameFormat]}
                        </Text>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </Reveal>
            );
          })}
        </div>
      )}
    </section>
  );
}
