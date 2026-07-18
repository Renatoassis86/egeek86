import type { Metadata } from 'next';
import Link from 'next/link';
import { Flame, ShieldCheck, ShoppingBag, Users, Award, ChevronRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Glow } from '@/components/motion/glow';
import { Reveal } from '@/components/motion/reveal';
import { TextImageMask } from '@/components/motion/text-image-mask';
import { HypeZoneTabs } from '@/components/hype/hype-zone-tabs';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getLiveDrops, getUpcomingDrops, getPastDrops, getUserWaitlist } from '@/server/queries/hype';

export const metadata: Metadata = {
  title: 'Hype Zone',
  description: 'Drops de colecionadores. O portal de lançamentos de itens raros e edições limitadas do Espaço Geek 86.',
};

export const dynamic = 'force-dynamic';

export default async function HypeZonePage() {
  const profile = await getCurrentProfile();
  const isAuthenticated = !!profile;

  const [liveDrops, upcomingDrops, pastDrops, userWaitlistIds] = await Promise.all([
    getLiveDrops(),
    getUpcomingDrops(),
    getPastDrops(),
    profile ? getUserWaitlist(profile.id) : [],
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16">
      
      {/* Header / Hero de Lançamento */}
      <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/30 px-6 py-10 lg:py-16 mb-8">
        <Glow color="hype" size="lg" className="-top-36 -right-24" intensity={0.28} />
        <Glow color="gold" size="md" className="-bottom-28 -left-16" intensity={0.14} />

        {/* Letras EG86 vazadas com textura de colagem editorial */}
        <div className="pointer-events-none absolute -right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 xl:flex">
          {['E', 'G', '8', '6'].map((letter) => (
            <TextImageMask
              key={letter}
              text={letter}
              src="/images/hype-zone/banner.png"
              className="text-[120px] font-black"
            />
          ))}
        </div>

        <div className="relative xl:max-w-[65%] flex flex-col items-start gap-4">
          <Reveal>
            <Badge variant="hype" size="lg" className="animate-pulse">
              <Flame className="size-3.5" />
              Hype Zone C2C
            </Badge>
          </Reveal>

          <Reveal delay={0.05}>
            <Text as="h1" variant="display-md" className="max-w-2xl text-[32px] md:text-[48px] tracking-tight font-black leading-none">
              Drops de Colecionador
            </Text>
          </Reveal>

          <Reveal delay={0.1}>
            <Text variant="body-md" color="secondary" className="max-w-[56ch] leading-relaxed">
              O espaço onde os maiores colecionadores do país agendam e lançam seus itens mais raros. 
              Lançamentos com hora marcada, disputas justas e proteção total contra robôs e cambistas.
            </Text>
          </Reveal>
        </div>
      </div>

      {/* Manifesto Comercial Explicativo (Fácil & Direto) */}
      <Reveal delay={0.12}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Card: Para Comprar */}
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-default)] transition-all">
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
                  <ShoppingBag className="size-5" />
                </div>
                <div>
                  <Text variant="heading-sm">Quero Comprar Raridades</Text>
                  <Text variant="caption" color="tertiary">Para Colecionadores e Caçadores de Drops</Text>
                </div>
              </div>
              <Text variant="body-sm" color="secondary" className="leading-relaxed">
                Chega de comprar no escuro ou pagar fortunas para robôs revendedores. Na Hype Zone, 
                você disputa **itens originais e inspecionados** diretamente de outros colecionadores. 
                Os lançamentos têm hora marcada e são protegidos por nosso escudo anti-bot.
              </Text>
              <div className="flex flex-col gap-2 text-xs text-[var(--color-text-secondary)] font-mono border-t border-[var(--color-border-subtle)] pt-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-[var(--color-accent-success)]" />
                  <span>Garantia de originalidade e integridade física.</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-[var(--color-accent-success)]" />
                  <span>Fila justa anti-bot para todos os compradores.</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Para Vender */}
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-default)] transition-all">
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)]">
                  <Users className="size-5" />
                </div>
                <div>
                  <Text variant="heading-sm">Quero Vender do Meu Acervo</Text>
                  <Text variant="caption" color="tertiary">Para Vendedores e Criadores de Hype</Text>
                </div>
              </div>
              <Text variant="body-sm" color="secondary" className="leading-relaxed">
                Transforme seu colecionável em um evento de lançamento com hora marcada! Conte a história da 
                sua peça, envie até **10 fotos detalhadas** e crie uma disputa saudável que atrai centenas 
                de interessados em minutos.
              </Text>
              <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)] font-mono">
                  <div className="flex items-center gap-2">
                    <Award className="size-3.5 text-[var(--color-accent-primary)]" />
                    <span>Ganhe +150 Geek Points no onboarding!</span>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline" className="w-full sm:w-auto text-xs" rightIcon={<ChevronRight className="size-3" />}>
                  <Link href="/conta/vendedor/onboarding">Seja um Vendedor</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Reveal>

      {/* Tabs com os Drops e Lógica de negócio interativa */}
      <Reveal delay={0.15}>
        <HypeZoneTabs
          liveDrops={liveDrops}
          upcomingDrops={upcomingDrops}
          pastDrops={pastDrops}
          userWaitlistIds={userWaitlistIds}
          isAuthenticated={isAuthenticated}
        />
      </Reveal>
    </section>
  );
}
