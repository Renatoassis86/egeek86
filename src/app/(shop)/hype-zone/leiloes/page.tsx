import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auctions, profiles } from '@/db/schema';
import { LiveBidRoom } from '@/components/geek-deals/live-bid-room';
import { CreateAuctionForm } from '@/components/geek-deals/create-auction-form';
import { Glow } from '@/components/motion/glow';
import { Reveal } from '@/components/motion/reveal';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Gavel, Clock, ArrowRight, ShieldCheck, Plus } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Geek Hammer - Leilões de Raridades',
  description: 'Leilões síncronos e assíncronos de colecionáveis do Espaço Geek 86. Dispute com segurança.',
};

export const dynamic = 'force-dynamic';

export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const profile = await getCurrentProfile();
  const isAuthenticated = !!profile;
  const activeTab = (await searchParams).aba || 'ativos';

  // 1. Carrega leilões do banco
  let list: any[] = [];
  try {
    list = await db
      .select({
        id: auctions.id,
        title: auctions.title,
        description: auctions.description,
        images: auctions.images,
        startsAt: auctions.startsAt,
        endsAt: auctions.endsAt,
        minBidCents: auctions.minBidCents,
        currentBidCents: auctions.currentBidCents,
        buyoutPriceCents: auctions.buyoutPriceCents,
        status: auctions.status,
        sellerName: profiles.name,
      })
      .from(auctions)
      .leftJoin(profiles, eq(auctions.sellerId, profiles.id))
      .orderBy(desc(auctions.createdAt));
  } catch (err) {
    console.error('Erro ao carregar leilões do banco:', err);
  }

  // 2. Mocks de demonstração se o banco estiver vazio
  const now = new Date();
  const mockList = [
    {
      id: 'auc-mock-1',
      title: 'Nintendo Virtual Boy CIB (Completo na Caixa)',
      description: 'O console 3D da Nintendo de 1995. Estado de conservação impecável (Grade 9/10), com caixa original, manuais, suporte e controle sem rachaduras. Item de museu!',
      images: ['/images/hero/tile-back.png', '/images/hero/tile-main.png'],
      startsAt: new Date(now.getTime() - 1000 * 60 * 120).toISOString(), // começou há 2h
      endsAt: new Date(now.getTime() + 1000 * 60 * 60 * 5).toISOString(), // acaba em 5h
      minBidCents: 200000,
      currentBidCents: 245000,
      buyoutPriceCents: 450000,
      status: 'active',
      sellerName: 'Renato Assis (Renato86)',
    },
    {
      id: 'auc-mock-2',
      title: 'Placa Arcade CPS2 Marvel Super Heroes',
      description: 'Placa CPS2 original japonesa, placa-mãe A+B. Testada e funcionando perfeitamente, sem bateria de suicídio (instalado mod Infinitum para preservação a longo prazo).',
      images: ['/images/hero/tile-main.png'],
      startsAt: new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString(), // amanhã
      endsAt: new Date(now.getTime() + 1000 * 60 * 60 * 48).toISOString(),
      minBidCents: 180000,
      currentBidCents: 180000,
      buyoutPriceCents: 280000,
      status: 'scheduled',
      sellerName: 'Capcom Collector SP',
    }
  ];

  const targetList = list.length > 0 ? list : mockList;

  // Filtragem conforme aba
  const activeAuctions = targetList.filter((a) => {
    const isLive = a.status === 'active' || (new Date(a.startsAt) <= now && new Date(a.endsAt) > now && a.status === 'scheduled');
    return activeTab === 'ativos' && isLive;
  });

  const upcomingAuctions = targetList.filter((a) => {
    const isScheduled = a.status === 'scheduled' && new Date(a.startsAt) > now;
    return activeTab === 'agendados' && isScheduled;
  });

  const endedAuctions = targetList.filter((a) => {
    const isEnded = a.status === 'completed' || a.status === 'failed_reserve' || a.status === 'defaulted' || new Date(a.endsAt) <= now;
    return activeTab === 'encerrados' && isEnded;
  });

  const countActive = targetList.filter((a) => a.status === 'active' || (new Date(a.startsAt) <= now && new Date(a.endsAt) > now)).length;
  const countUpcoming = targetList.filter((a) => a.status === 'scheduled' && new Date(a.startsAt) > now).length;
  const countEnded = targetList.filter((a) => a.status === 'completed' || a.status === 'failed_reserve' || a.status === 'defaulted' || new Date(a.endsAt) <= now).length;

  return (
    <section className="relative mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16 overflow-hidden">
      
      {/* Background Glows */}
      <Glow color="gold" size="lg" className="-top-36 -right-24" intensity={0.12} />
      <Glow color="hype" size="md" className="-bottom-28 -left-16" intensity={0.08} />

      {/* Header Banner Visual */}
      <div className="relative border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/30 rounded-[var(--radius-xl)] p-6 md:p-10 lg:p-14 overflow-hidden mb-10 z-10">
        
        {/* Imagem do banner inteira com recorte diagonal na direita (igual Hype Zone/Ofertas) */}
        <div className="absolute right-0 top-0 bottom-0 w-full md:w-[48%] hidden md:block z-0 overflow-hidden select-none pointer-events-none rounded-r-[var(--radius-xl)]">
          <div 
            className="relative w-full h-full"
            style={{
              clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 0% 100%)',
            }}
          >
            <Image
              src="/images/hype-zone/geek-hammer.png"
              alt="Geek Hammer Banner"
              fill
              className="object-cover object-center"
              priority
            />
            {/* Gradiente sutil de fade na junção do corte diagonal */}
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-inset)] via-transparent to-transparent opacity-80 pointer-events-none" />
          </div>
        </div>

        <div className="flex flex-col gap-3 relative z-10 max-w-2xl">
          <Reveal>
            <Badge variant="hype" size="md">
              Geek Hammer Leilões
            </Badge>
          </Reveal>
          <Reveal delay={0.05}>
            <Text as="h1" variant="display-md" className="text-[32px] md:text-[40px] font-black leading-none tracking-tight">
              Lances & Martelo Hype
            </Text>
          </Reveal>
          <Reveal delay={0.1}>
            <Text variant="body-sm" color="secondary" className="max-w-[50ch] leading-relaxed text-xs md:text-sm">
              Participe de leilões ao vivo conduzidos pela comunidade. Lances protegidos com garantia 
              de caução contra inadimplência, prorrogação inteligente de tempo e integridade auditada.
            </Text>
          </Reveal>
        </div>
      </div>

      {/* Sub-Abas do Painel */}
      <div className="flex flex-wrap border-b border-[var(--color-border-subtle)] pb-px gap-4 mb-8">
        <Link
          href="/hype-zone/leiloes?aba=ativos"
          className={cn(
            'pb-3 text-xs font-bold transition-all border-b-2 border-transparent focus:outline-none flex items-center gap-1.5',
            activeTab === 'ativos'
              ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          Leilões Ativos ({countActive})
        </Link>
        <Link
          href="/hype-zone/leiloes?aba=agendados"
          className={cn(
            'pb-3 text-xs font-bold transition-all border-b-2 border-transparent focus:outline-none flex items-center gap-1.5',
            activeTab === 'agendados'
              ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          Próximos Lotes ({countUpcoming})
        </Link>
        <Link
          href="/hype-zone/leiloes?aba=encerrados"
          className={cn(
            'pb-3 text-xs font-bold transition-all border-b-2 border-transparent focus:outline-none flex items-center gap-1.5',
            activeTab === 'encerrados'
              ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          Encerrados ({countEnded})
        </Link>
        <Link
          href="/hype-zone/leiloes?aba=novo"
          className={cn(
            'pb-3 text-xs font-bold transition-all border-b-2 border-transparent focus:outline-none flex items-center gap-1.5 ml-auto text-[var(--color-accent-primary)] hover:text-[var(--color-text-primary)]',
            activeTab === 'novo' ? 'border-[var(--color-accent-primary)]' : ''
          )}
        >
          <Plus className="size-3.5" /> Cadastrar Lote
        </Link>
      </div>

      {/* RENDERIZAR ABAS DE LISTAGEM */}
      {activeTab === 'ativos' && (
        <div className="flex flex-col gap-8">
          {activeAuctions.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-[var(--color-border-subtle)] rounded-[var(--radius-xl)] bg-[var(--color-bg-inset)]/20">
              <Text variant="body-sm" color="tertiary">Não há leilões ativos no momento.</Text>
            </div>
          ) : (
            activeAuctions.map((auc) => (
              <LiveBidRoom
                key={auc.id}
                auction={auc}
                currentUserProfile={profile}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'agendados' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {upcomingAuctions.length === 0 ? (
            <div className="col-span-2 text-center py-16 border border-dashed border-[var(--color-border-subtle)] rounded-[var(--radius-xl)] bg-[var(--color-bg-inset)]/20">
              <Text variant="body-sm" color="tertiary">Nenhum leilão agendado para os próximos dias.</Text>
            </div>
          ) : (
            upcomingAuctions.map((auc) => (
              <Card key={auc.id} className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/10">
                <CardContent className="p-5 flex flex-col gap-3 justify-between h-full">
                  <div>
                    <Badge variant="outline" size="sm" className="mb-2">Abertura: {new Date(auc.startsAt).toLocaleString('pt-BR')}</Badge>
                    <Text variant="heading-sm" className="font-bold">{auc.title}</Text>
                    <Text color="secondary" className="text-xs leading-relaxed mt-2 line-clamp-2">{auc.description}</Text>
                  </div>
                  
                  <div className="border-t border-[var(--color-border-subtle)] pt-3 flex justify-between items-center mt-2">
                    <div>
                      <span className="text-[8px] font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider block">Lance Mínimo</span>
                      <span className="text-sm font-bold font-mono text-[var(--color-accent-primary)]">{formatBRL(auc.minBidCents)}</span>
                    </div>
                    <Button disabled size="sm" className="text-xs">Aguardando Abertura</Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'encerrados' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {endedAuctions.length === 0 ? (
            <div className="col-span-2 text-center py-16 border border-dashed border-[var(--color-border-subtle)] rounded-[var(--radius-xl)] bg-[var(--color-bg-inset)]/20">
              <Text variant="body-sm" color="tertiary">Nenhum leilão encerrado para listar.</Text>
            </div>
          ) : (
            endedAuctions.map((auc) => (
              <Card key={auc.id} className="border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] opacity-85">
                <CardContent className="p-5 flex flex-col gap-3 justify-between h-full">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <Badge variant="secondary" size="sm">Encerrado</Badge>
                      <Badge variant={auc.status === 'completed' ? 'success' : 'danger'} size="sm">
                        {auc.status === 'completed' ? 'Vendido' : auc.status === 'failed_reserve' ? 'Reserva não Atingida' : 'Inadimplente'}
                      </Badge>
                    </div>
                    <Text variant="heading-sm" className="font-bold text-[var(--color-text-secondary)]">{auc.title}</Text>
                  </div>
                  
                  <div className="border-t border-[var(--color-border-subtle)] pt-3 flex justify-between items-center mt-2">
                    <div>
                      <span className="text-[8px] font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider block">Valor de Arremate</span>
                      <span className="text-sm font-bold font-mono text-[var(--color-text-primary)]">{formatBRL(auc.currentBidCents)}</span>
                    </div>
                    <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">Leiloeiro: {auc.sellerName}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'novo' && (
        <div className="z-10 relative">
          <CreateAuctionForm />
        </div>
      )}

    </section>
  );
}
