import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sellers, products, drops, auctions, sellerMetrics } from '@/db/schema';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Reveal } from '@/components/motion/reveal';
import { formatBRL } from '@/lib/format';
import { Flame, Gavel, Plus, ShieldCheck, Clock, Sparkles, AlertCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Painel do Colecionador | Espaço Geek 86',
  description: 'Gerencie seus itens de coleção, agende drops e abra leilões de raridades.',
};

export const dynamic = 'force-dynamic';

export default async function CollectorDashboardPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/entrar?next=/conta/vendedor');
  }

  // Busca o registro de vendedor/colecionador do usuário
  const [seller] = await db
    .select()
    .from(sellers)
    .where(eq(sellers.userId, profile.id))
    .limit(1);

  // 1. Caso não tenha registro de vendedor
  if (!seller) {
    return (
      <section className="mx-auto max-w-4xl px-4 lg:px-8 py-12">
        <Reveal>
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/40 p-8 text-center flex flex-col items-center gap-6">
            <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)]">
              <Sparkles className="size-8" />
            </div>
            <div className="flex flex-col gap-2 max-w-md">
              <Text variant="heading-lg">Seja um Colecionador Credenciado</Text>
              <Text variant="body-sm" color="secondary">
                Sua conta atual é de Comprador. Para vender itens raros, agendar drops e abrir leilões, é necessário credenciar sua coleção.
              </Text>
            </div>
            <Button asChild size="lg" variant="hype">
              <Link href="/conta/vendedor/onboarding">Credenciar Minha Coleção</Link>
            </Button>
          </Card>
        </Reveal>
      </section>
    );
  }

  // 2. Caso o cadastro esteja em análise (pending_kyc)
  if (seller.status === 'pending_kyc') {
    return (
      <section className="mx-auto max-w-4xl px-4 lg:px-8 py-12">
        <Reveal>
          <Card className="border-amber-500/30 bg-amber-500/5 p-8 text-center flex flex-col items-center gap-6">
            <div className="flex size-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
              <Clock className="size-8" />
            </div>
            <div className="flex flex-col gap-2 max-w-md">
              <Badge variant="outline" className="w-fit mx-auto border-amber-500/40 text-amber-400">
                Cadastro em Análise
              </Badge>
              <Text variant="heading-lg">Credenciamento Pendente</Text>
              <Text variant="body-sm" color="secondary" className="leading-relaxed">
                Olá <strong>{profile.name}</strong>! Suas respostas do questionário e a foto da sua coleção com seu rosto foram recebidas com sucesso.
                Nossa equipe de curadoria está avaliando seu cadastro. Assim que aprovado, seu acesso de gestão será liberado!
              </Text>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/conta">Voltar para Minha Conta</Link>
            </Button>
          </Card>
        </Reveal>
      </section>
    );
  }

  // 3. Caso aprovado (seller.status === 'active')
  // Carrega os drops do vendedor
  let myDrops: any[] = [];
  try {
    myDrops = await db
      .select({
        id: drops.id,
        title: drops.title,
        bannerUrl: drops.bannerUrl,
        priceCents: drops.priceCents,
        startsAt: drops.startsAt,
        status: drops.status,
        stockLimit: drops.stockLimit,
        stockSold: drops.stockSold,
      })
      .from(drops)
      .leftJoin(products, eq(drops.productId, products.id))
      .where(eq(products.sellerId, seller.id))
      .orderBy(desc(drops.startsAt));
  } catch (e) {
    console.error('Erro ao carregar drops do colecionador:', e);
  }

  // Carrega leilões do vendedor
  let myAuctions: any[] = [];
  try {
    myAuctions = await db
      .select({
        id: auctions.id,
        title: auctions.title,
        currentBidCents: auctions.currentBidCents,
        minBidCents: auctions.minBidCents,
        startsAt: auctions.startsAt,
        endsAt: auctions.endsAt,
        status: auctions.status,
        images: auctions.images,
      })
      .from(auctions)
      .where(eq(auctions.sellerId, profile.id))
      .orderBy(desc(auctions.createdAt));
  } catch (e) {
    console.error('Erro ao carregar leilões do colecionador:', e);
  }

  // Métricas
  const [metrics] = await db
    .select()
    .from(sellerMetrics)
    .where(eq(sellerMetrics.sellerId, seller.id))
    .limit(1);

  return (
    <section className="mx-auto max-w-6xl px-4 lg:px-8 py-10 lg:py-14">
      {/* Header do Painel */}
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="hype" size="sm">
                <ShieldCheck className="size-3.5" /> Colecionador Credenciado
              </Badge>
            </div>
            <Text as="h1" variant="heading-xl">
              Painel de Gestão do Colecionador
            </Text>
            <Text variant="body-sm" color="secondary" className="mt-1">
              Bem-vindo, <strong>{seller.displayName}</strong>. Cadastre e monitore seus lançamentos e leilões de raridades.
            </Text>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild variant="hype" size="md">
              <Link href="/conta/vendedor/novo-drop">
                <Flame className="size-4" />
                Lançar Novo Drop
              </Link>
            </Button>
            <Button asChild variant="outline" size="md">
              <Link href="/hype-zone/leiloes?aba=novo">
                <Gavel className="size-4" />
                Cadastrar Leilão
              </Link>
            </Button>
          </div>
        </div>
      </Reveal>

      {/* Cartões de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20">
          <CardContent className="p-5">
            <Text variant="caption" color="tertiary" className="uppercase font-mono text-[10px]">Pontuação Geek XP</Text>
            <Text variant="heading-lg" className="font-bold text-[var(--color-accent-primary)] mt-1">{profile.geekPoints || 0} XP</Text>
          </CardContent>
        </Card>
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20">
          <CardContent className="p-5">
            <Text variant="caption" color="tertiary" className="uppercase font-mono text-[10px]">Reputação / Avaliação</Text>
            <Text variant="heading-lg" className="font-bold mt-1">⭐ {metrics?.avgRating ? Number(metrics.avgRating).toFixed(2) : '5.00'}</Text>
          </CardContent>
        </Card>
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20">
          <CardContent className="p-5">
            <Text variant="caption" color="tertiary" className="uppercase font-mono text-[10px]">Vendas Realizadas</Text>
            <Text variant="heading-lg" className="font-bold text-emerald-400 mt-1">{metrics?.totalOrders || 0} pedidos</Text>
          </CardContent>
        </Card>
      </div>

      {/* Seção 1: Meus Drops Hype Zone */}
      <div className="flex flex-col gap-4 mb-12">
        <div className="flex items-center justify-between">
          <Text variant="heading-md" className="font-bold flex items-center gap-2">
            <Flame className="size-5 text-[var(--color-accent-hype)]" /> Meus Lançamentos Hype Zone ({myDrops.length})
          </Text>
          <Button asChild variant="ghost" size="sm">
            <Link href="/conta/vendedor/novo-drop">+ Agendar Item</Link>
          </Button>
        </div>

        {myDrops.length === 0 ? (
          <Card className="border-dashed border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20 p-8 text-center">
            <Text variant="body-sm" color="tertiary">Você ainda não agendou nenhum drop exclusivo.</Text>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myDrops.map((drop) => (
              <Card key={drop.id} className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                <CardContent className="p-4 flex items-center gap-4">
                  {drop.bannerUrl && (
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={drop.bannerUrl} alt={drop.title} className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={drop.status === 'scheduled' ? 'outline' : 'success'} size="sm">
                        {drop.status === 'scheduled' ? 'Agendado' : drop.status === 'live' ? 'AO VIVO' : 'Encerrado'}
                      </Badge>
                      <span className="text-xs font-mono font-bold text-[var(--color-accent-primary)]">
                        {formatBRL(drop.priceCents)}
                      </span>
                    </div>
                    <Text variant="body-sm" className="font-bold truncate">{drop.title}</Text>
                    <Text variant="caption" color="tertiary">
                      Estoque: {drop.stockSold} / {drop.stockLimit} vendidos
                    </Text>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Seção 2: Meus Leilões Geek Hammer */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Text variant="heading-md" className="font-bold flex items-center gap-2">
            <Gavel className="size-5 text-[var(--color-accent-primary)]" /> Meus Leilões ({myAuctions.length})
          </Text>
          <Button asChild variant="ghost" size="sm">
            <Link href="/hype-zone/leiloes?aba=novo">+ Abrir Lote</Link>
          </Button>
        </div>

        {myAuctions.length === 0 ? (
          <Card className="border-dashed border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20 p-8 text-center">
            <Text variant="body-sm" color="tertiary">Você ainda não possui nenhum leilão cadastrado.</Text>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myAuctions.map((auc) => (
              <Card key={auc.id} className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                <CardContent className="p-4 flex items-center gap-4">
                  {Array.isArray(auc.images) && auc.images[0] && (
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={auc.images[0]} alt={auc.title} className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" size="sm">{auc.status}</Badge>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {formatBRL(auc.currentBidCents || auc.minBidCents)}
                      </span>
                    </div>
                    <Text variant="body-sm" className="font-bold truncate">{auc.title}</Text>
                    <Text variant="caption" color="tertiary">
                      Abertura: {new Date(auc.startsAt).toLocaleDateString('pt-BR')}
                    </Text>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
