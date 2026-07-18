import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dropCurations, reviewCurations, reviews, products, profiles, sellers } from '@/db/schema';
import { CurationPanel } from '@/components/geek-deals/curation-panel';
import { PointsRewardsCard } from '@/components/geek-deals/points-rewards-card';
import { Glow } from '@/components/motion/glow';
import { Reveal } from '@/components/motion/reveal';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { getUpcomingDrops } from '@/server/queries/hype';

export const metadata: Metadata = {
  title: 'Conselho de Curadores',
  description: 'Curadoria comunitária de drops colecionáveis e resgate de milhas de desconto.',
};

export const dynamic = 'force-dynamic';

export default async function CurationPage() {
  const profile = await getCurrentProfile();
  const isAuthenticated = !!profile;
  const isAdmin = profile?.role === 'admin';

  // Carrega drops pendentes (scheduled)
  const pendingDrops = await getUpcomingDrops();

  // Carrega votos de drops que o usuário já enviou
  const userCurationVotes: Record<string, { verdict: string; confidence: number; notes: string }> = {};
  if (profile) {
    try {
      const userVotes = await db
        .select()
        .from(dropCurations)
        .where(eq(dropCurations.userId, profile.id));

      for (const vote of userVotes) {
        userCurationVotes[vote.dropId] = {
          verdict: vote.verdict,
          confidence: vote.confidence,
          notes: vote.notes,
        };
      }
    } catch (err) {
      console.error('Erro ao carregar votos de curadoria do usuário:', err);
    }
  }

  // Carrega avaliações pendentes do banco
  let pendingReviewsList: any[] = [];
  const userReviewVotes: Record<string, { verdict: 'approve' | 'reject'; notes: string }> = {};

  if (profile) {
    try {
      pendingReviewsList = await db
        .select({
          id: reviews.id,
          productId: reviews.productId,
          productTitle: products.title,
          buyerName: profiles.name,
          sellerName: sellers.displayName,
          rating: reviews.rating,
          comment: reviews.comment,
          images: reviews.images,
          createdAt: reviews.createdAt,
        })
        .from(reviews)
        .leftJoin(products, eq(reviews.productId, products.id))
        .leftJoin(profiles, eq(reviews.userId, profiles.id))
        .leftJoin(sellers, eq(products.sellerId, sellers.id))
        .where(eq(reviews.status, 'pending'))
        .limit(10);

      const reviewVotesList = await db
        .select()
        .from(reviewCurations)
        .where(eq(reviewCurations.userId, profile.id));

      for (const vote of reviewVotesList) {
        userReviewVotes[vote.reviewId] = {
          verdict: vote.verdict as 'approve' | 'reject',
          notes: vote.notes,
        };
      }
    } catch (err) {
      console.error('Erro ao carregar avaliações pendentes:', err);
    }
  }

  const typedReviews = pendingReviewsList.map((r) => ({
    id: r.id,
    productId: r.productId || 'unknown',
    productTitle: r.productTitle || 'Item Colecionável',
    buyerName: r.buyerName || 'Comprador Anônimo',
    sellerName: r.sellerName || 'Vendedor',
    rating: Number(r.rating || 5),
    comment: r.comment || '',
    images: Array.isArray(r.images) ? (r.images as string[]) : [],
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
  }));

  const activeCoupons = (profile?.preferences as any)?.coupons || [];

  return (
    <section className="relative mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16 overflow-hidden">
      
      {/* Background Glows */}
      <Glow color="gold" size="lg" className="-top-36 -right-24" intensity={0.12} />
      <Glow color="hype" size="md" className="-bottom-28 -left-16" intensity={0.08} />

      {/* Header */}
      <div className="flex flex-col gap-3 mb-10">
        <Reveal>
          <Badge variant="hype" size="md">
            Conselho de Curadores
          </Badge>
        </Reveal>
        <Reveal delay={0.05}>
          <Text as="h1" variant="heading-xl" className="text-[32px] md:text-[40px] font-black">
            Curadoria Comunitária & Milhas Geek
          </Text>
        </Reveal>
        <Reveal delay={0.1}>
          <Text variant="body-sm" color="secondary" className="max-w-2xl leading-relaxed">
            Aqui os colecionadores seniores avaliam as especificações, storytelling e fotos dos novos itens 
            lançados na Hype Zone. Analise as fotos, dê seu veredicto e converta seus acertos em cupons 
            de milhas com descontos reais para a loja.
          </Text>
        </Reveal>
      </div>

      {/* Grid: Coluna do Feed de Curadoria & Recompensas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 z-10 relative items-start">
        
        {/* Lado Esquerdo: Feed de Drops e Avaliações Pendentes */}
        <div className="lg:col-span-2">
          <Reveal delay={0.12}>
            <CurationPanel
              pendingDrops={pendingDrops}
              userCurationVotes={userCurationVotes}
              pendingReviews={typedReviews}
              userReviewVotes={userReviewVotes}
              isAdmin={isAdmin}
              isAuthenticated={isAuthenticated}
              userGeekPoints={profile?.geekPoints || 0}
            />
          </Reveal>
        </div>

        {/* Lado Direito: Widget de Recompensas e Conversão */}
        <div>
          <Reveal delay={0.15}>
            <PointsRewardsCard
              geekPoints={profile?.geekPoints || 0}
              activeCoupons={activeCoupons}
              isAuthenticated={isAuthenticated}
            />
          </Reveal>
        </div>

      </div>

      {/* Bloco de Regulamento e Metodologia de Pontuação */}
      <Reveal delay={0.2} className="mt-12">
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/15">
          <CardContent className="p-6 lg:p-8 flex flex-col gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <Text variant="heading-sm" className="font-bold">Regulamento & Metodologia das Milhas Geek</Text>
                <Text variant="caption" color="tertiary">Entenda como acumular pontos, subir de nível e resgatar descontos reais.</Text>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-[var(--color-text-secondary)]">
              {/* Coluna 1: Como Acumular */}
              <div className="flex flex-col gap-2 p-4 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded">
                <span className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  📥 1. Como Acumular XP e Pontos
                </span>
                <ul className="list-disc pl-4 flex flex-col gap-1.5 text-[11px] leading-relaxed">
                  <li><strong className="font-bold text-[var(--color-text-primary)]">+10 XP imediato</strong> por participar de qualquer curadoria de drop ou auditoria de review.</li>
                  <li><strong className="font-bold text-[var(--color-text-primary)]">+50 Geek Points</strong> adicionais quando seu veredicto for correto e bater com a decisão final da moderação.</li>
                  <li>Pontos bônus por positivação recebida de compradores em seus próprios drops.</li>
                </ul>
              </div>

              {/* Coluna 2: Regra de Conversão */}
              <div className="flex flex-col gap-2 p-4 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded">
                <span className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  💸 2. Regra de Resgate (Milhas)
                </span>
                <ul className="list-disc pl-4 flex flex-col gap-1.5 text-[11px] leading-relaxed">
                  <li><strong className="font-bold text-[var(--color-text-primary)]">Taxa Conversora</strong>: 100 Geek Points = R$ 1,00 de desconto na loja do administrador.</li>
                  <li>Resgates podem ser feitos em qualquer múltiplo de 100 pontos.</li>
                  <li>O sistema gera um código de cupom exclusivo na hora para você aplicar no carrinho.</li>
                </ul>
              </div>

              {/* Coluna 3: Níveis de Classificação */}
              <div className="flex flex-col gap-2 p-4 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded">
                <span className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  🎖️ 3. Níveis de Reputação
                </span>
                <ul className="list-disc pl-4 flex flex-col gap-1 text-[11px] leading-relaxed">
                  <li><strong className="font-bold text-[var(--color-text-primary)]">Iniciante</strong>: 0 a 199 XP (Votos não-oficiais).</li>
                  <li><strong className="font-bold text-[var(--color-text-primary)]">Explorador</strong>: 200 a 799 XP (Libera voto oficial de peso 1).</li>
                  <li><strong className="font-bold text-[var(--color-text-primary)]">Veterano</strong>: 800 a 1999 XP (Voto de peso 2 + descontos).</li>
                  <li><strong className="font-bold text-[var(--color-text-primary)]">Mestre</strong>: 2000 a 4999 XP (Voto de peso 3 + taxas de venda reduzidas).</li>
                  <li><strong className="font-bold text-[var(--color-text-primary)]">Lendário</strong>: 5000+ XP (Acesso a drops ultra-restritos).</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </Reveal>

    </section>
  );
}
