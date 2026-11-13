import Link from 'next/link';
import Image from 'next/image';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sellers } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { MARKETPLACE_PUBLIC } from '@/lib/features';
import { Glow } from '@/components/motion/glow';
import { Reveal } from '@/components/motion/reveal';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getUserWatches } from '@/server/queries/price-watches';
import { ProfileHubTabs } from '@/components/conta/profile-hub-tabs';
import { ShieldCheck, User, Sparkles, Bell, ArrowRight, Gavel } from 'lucide-react';

export const metadata = { title: 'Minha conta' };
export const dynamic = 'force-dynamic';

export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await searchParams;
  const profile = await getCurrentProfile();
  const watches = profile ? await getUserWatches(profile.id) : [];

  let seller = null;
  if (profile) {
    try {
      const [existingSeller] = await db
        .select()
        .from(sellers)
        .where(eq(sellers.userId, profile.id))
        .limit(1);
      seller = existingSeller;
    } catch (e) {
      console.error('Erro ao buscar perfil de seller:', e);
    }
  }

  return (
    <section className="relative mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16 overflow-hidden">
      {/* Background Glows */}
      <Glow color="gold" size="lg" className="-top-36 -right-24" intensity={0.12} />
      <Glow color="hype" size="md" className="-bottom-28 -left-16" intensity={0.08} />

      {/* Hero Header do Perfil do Colecionador com Arte Retro-Geek */}
      <div className="relative border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/40 rounded-[var(--radius-xl)] p-6 md:p-10 lg:p-12 overflow-hidden mb-10 z-10 backdrop-blur-md">
        {/* Arte Ilustrada Retro-Geek em destaque no lado direito */}
        <div className="absolute right-0 top-0 bottom-0 w-full md:w-[48%] hidden md:block z-0 overflow-hidden select-none pointer-events-none rounded-r-[var(--radius-xl)]">
          <div className="relative w-full h-full">
            <Image
              src="/images/conta/profile-hero.webp"
              alt=""
              fill
              className="object-cover object-center"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-inset)] via-[var(--color-bg-inset)]/30 to-transparent opacity-90 pointer-events-none" />
          </div>
        </div>

        <div className="flex flex-col gap-4 relative z-10 max-w-2xl">
          <Reveal>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="legend" size="lg">
                <Sparkles className="size-3.5" />
                Minha conta
              </Badge>
              {profile?.role === 'admin' || profile?.role === 'super_admin' ? (
                <Badge variant="hype" size="lg">
                  Administrador
                </Badge>
              ) : MARKETPLACE_PUBLIC && seller?.status === 'active' ? (
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-400">
                  <ShieldCheck className="size-3 mr-1" /> Colecionador verificado
                </Badge>
              ) : MARKETPLACE_PUBLIC && seller ? (
                <Badge variant="outline" className="border-amber-500/50 text-amber-400">
                  Cadastro de colecionador em análise
                </Badge>
              ) : null}
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <Text as="h1" variant="display-md" className="text-[32px] md:text-[44px] font-black leading-none tracking-tight">
              {profile ? profile.name : 'Minha conta'}
            </Text>
          </Reveal>

          <Reveal delay={0.1}>
            <Text variant="body-md" color="secondary" className="max-w-[52ch] leading-relaxed text-xs md:text-sm">
              Gerencie seus dados cadastrais, os jogos que você acompanha, {MARKETPLACE_PUBLIC ? 'seus drops e leilões.' : 'seus alertas de preço.'}
            </Text>
          </Reveal>

          {/* Botões de Ação do Topo do Perfil */}
          <Reveal delay={0.12}>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {!profile ? (
                <>
                  <Button asChild size="md" variant="primary" className="font-bold" rightIcon={<ArrowRight className="size-4" />}>
                    <Link href="/entrar">Criar Minha Conta / Entrar</Link>
                  </Button>
                  {MARKETPLACE_PUBLIC && (
                  <Button asChild size="md" variant="hype" className="font-bold">
                    <Link href="/entrar?role=colecionador">Cadastrar como Colecionador</Link>
                  </Button>
                  )}
                </>
              ) : MARKETPLACE_PUBLIC ? (
                <>
                  <Button asChild size="sm" variant="hype">
                    <Link href="/conta/vendedor/novo-drop">
                      <Sparkles className="size-3.5" />
                      Cadastrar Novo Drop
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="primary">
                    <Link href="/hype-zone/leiloes?aba=novo">
                      <Gavel className="size-3.5" />
                      Novo Lote de Leilão
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
          </Reveal>
        </div>
      </div>

      {/* Abas Interativas do Perfil */}
      <ProfileHubTabs
        initialTab={aba || 'visao_geral'}
        profile={
          profile
            ? {
                id: profile.id,
                name: profile.name,
                email: profile.email,
                phone: profile.phone,
                role: profile.role,
                geekPoints: profile.geekPoints,
              }
            : null
        }
        seller={seller ? { status: seller.status } : null}
        watches={watches}
      />
    </section>
  );
}
