import type { Metadata } from 'next';
import Image from 'next/image';
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
    <section className="relative mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16 overflow-hidden">
      {/* Circuitos e Linhas Decorativas de Fundo (Brushes de Tecnologia) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.04] dark:opacity-[0.08] z-0" aria-hidden="true">
        {/* Circuito Superior Direito (Accent Primary) */}
        <svg className="absolute top-0 right-0 w-[500px] h-[500px] text-[var(--color-accent-primary)]" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.3">
          <path d="M 100,10 L 75,10 L 60,25 L 60,50 L 45,65 L 15,65" strokeDasharray="2 1" />
          <circle cx="15" cy="65" r="1" fill="currentColor" />
          <path d="M 100,30 L 85,30 L 75,40 L 75,70 L 65,80" />
          <circle cx="65" cy="80" r="0.8" fill="currentColor" />
          <path d="M 60,25 L 50,15 L 20,15" />
          <circle cx="20" cy="15" r="1" fill="currentColor" />
          <line x1="75" y1="40" x2="40" y2="40" strokeWidth="0.1" strokeDasharray="1 2" />
        </svg>

        {/* Circuito Central Esquerdo (Accent Hype) */}
        <svg className="absolute top-1/3 left-0 w-[450px] h-[450px] text-[var(--color-accent-hype)]" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.3">
          <path d="M 0,50 L 25,50 L 40,35 L 40,15 L 55,0" />
          <circle cx="40" cy="15" r="1.2" />
          <path d="M 0,30 L 15,30 L 25,20 L 25,5 L 30,0" strokeDasharray="3 1" />
          <path d="M 25,50 L 35,60 L 65,60 L 75,70" />
          <circle cx="75" cy="70" r="0.8" fill="currentColor" />
        </svg>

        {/* Circuito Inferior Direito (Accent Primary) */}
        <svg className="absolute bottom-0 right-10 w-[600px] h-[600px] text-[var(--color-accent-primary)]" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.25">
          <path d="M 100,90 L 70,90 L 50,70 L 50,40 L 30,20 L 0,20" />
          <circle cx="30" cy="20" r="1" fill="currentColor" />
          <path d="M 50,55 L 25,55 L 15,45 L 15,10" strokeDasharray="1 1" />
          <circle cx="15" cy="10" r="0.8" fill="currentColor" />
        </svg>
      </div>

      {/* Header / Hero de Lançamento */}
      <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/30 px-6 py-10 lg:py-16 mb-8 z-10">
        <Glow color="hype" size="lg" className="-top-36 -right-24" intensity={0.28} />
        <Glow color="gold" size="md" className="-bottom-28 -left-16" intensity={0.14} />

        {/* Imagem do banner inteira com recorte diagonal na esquerda */}
        <div className="absolute right-0 top-0 bottom-0 w-full md:w-[48%] hidden md:block z-0 overflow-hidden select-none pointer-events-none rounded-r-[var(--radius-xl)]">
          <div 
            className="relative w-full h-full"
            style={{
              clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 0% 100%)',
            }}
          >
            <Image
              src="/images/hype-zone/banner.png"
              alt="Hype Zone Banner"
              fill
              className="object-cover object-center"
              priority
            />
            {/* Gradiente sutil de fade na junção do corte diagonal */}
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-inset)] via-transparent to-transparent opacity-80 pointer-events-none" />
          </div>
        </div>

        <div className="relative md:max-w-[52%] lg:max-w-[58%] flex flex-col items-start gap-4 z-10">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 z-10 relative">
          {/* Card: Para Comprar */}
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/90 hover:border-[var(--color-border-default)] transition-all backdrop-blur-md">
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
                você disputa <strong className="text-[var(--color-text-primary)] font-bold">itens originais e inspecionados</strong> diretamente de outros colecionadores. 
                Os lançamentos têm hora marcada e são protegidos por nosso escudo anti-bot.
              </Text>
            </CardContent>
          </Card>

          {/* Card: Para Vender */}
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/90 hover:border-[var(--color-border-default)] transition-all backdrop-blur-md">
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
                sua peça, envie até <strong className="text-[var(--color-text-primary)] font-bold">10 fotos detalhadas</strong> e crie uma disputa saudável que atrai centenas 
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
        <div className="z-10 relative">
          <HypeZoneTabs
            liveDrops={liveDrops}
            upcomingDrops={upcomingDrops}
            pastDrops={pastDrops}
            userWaitlistIds={userWaitlistIds}
            isAuthenticated={isAuthenticated}
          />
        </div>
      </Reveal>
    </section>
  );
}
