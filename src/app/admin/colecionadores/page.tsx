import type { Metadata } from 'next';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sellers, profiles, sellerMetrics, dropCurations, reviewCurations, reviews, products } from '@/db/schema';
import { CurationPanel } from '@/components/geek-deals/curation-panel';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { getUpcomingDrops, getBadgeName } from '@/server/queries/hype';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { DeleteSellerButton } from '@/components/admin/delete-seller-button';

export const metadata: Metadata = {
  title: 'Admin: Colecionadores e Curadoria',
  description: 'Gerenciamento de colecionadores vendedores, auditorias de drops e revisões de consumo.',
};

export const dynamic = 'force-dynamic';

export default async function AdminCollectorsPage() {
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === 'admin';

  // 1. Carrega dados de todos os colecionadores cadastrados
  const collectorsList = await db
    .select({
      id: sellers.id,
      displayName: sellers.displayName,
      email: sellers.emailBusiness,
      status: sellers.status,
      geekPoints: profiles.geekPoints,
      avgRating: sellerMetrics.avgRating,
      totalOrders: sellerMetrics.totalOrders,
      totalReviews: sellerMetrics.totalReviews,
    })
    .from(sellers)
    .leftJoin(profiles, eq(sellers.userId, profiles.id))
    .leftJoin(sellerMetrics, eq(sellers.id, sellerMetrics.sellerId));

  // 2. Carrega drops pendentes (scheduled)
  const pendingDrops = await getUpcomingDrops();

  // 3. Carrega avaliações pendentes de consumidores
  const pendingReviewsList = await db
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

  // Votos de curadoria do admin atual
  const userCurationVotes: Record<string, { verdict: string; confidence: number; notes: string }> = {};
  const userReviewVotes: Record<string, { verdict: 'approve' | 'reject'; notes: string }> = {};

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
      console.error('Erro ao carregar votos do admin:', err);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Text as="h1" variant="heading-xl">
          Conselho & Colecionadores: Administração
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Aprove e rejeite drops de C2C, audite reviews e monitore reputações.
        </Text>
      </div>

      {/* Tabela de Colecionadores (Vendedores) */}
      <Card className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/10">
        <CardContent className="p-6 flex flex-col gap-4">
          <Text variant="body-md" className="font-bold">
            Métricas de Vendedores Colecionadores
          </Text>

          <div className="overflow-x-auto border border-[var(--color-border-subtle)] rounded-[var(--radius-sm)] bg-[var(--color-bg-surface)]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/40 font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider h-10">
                  <th className="px-4">Colecionador</th>
                  <th className="px-4">Status</th>
                  <th className="px-4">XP / Nível</th>
                  <th className="px-4">Nota Média</th>
                  <th className="px-4">Vendas</th>
                  <th className="px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)] text-[var(--color-text-secondary)] font-mono">
                {collectorsList.length === 0 ? (
                  <tr className="h-12">
                    <td colSpan={6} className="px-4 text-center italic text-[var(--color-text-tertiary)]">
                      Nenhum colecionador cadastrado no momento.
                    </td>
                  </tr>
                ) : (
                  collectorsList.map((col) => (
                    <tr key={col.id} className="h-12 hover:bg-[var(--color-bg-inset)]/20 transition-colors">
                      <td className="px-4 font-sans font-bold text-[var(--color-text-primary)]">
                        {col.displayName}
                        <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] block font-normal">{col.email}</span>
                      </td>
                      <td className="px-4">
                        <Badge variant={col.status === 'active' ? 'success' : 'outline'}>
                          {col.status === 'active' ? 'Ativo' : 'Pendente'}
                        </Badge>
                      </td>
                      <td className="px-4">
                        <span className="text-[var(--color-accent-primary)] font-bold">{col.geekPoints || 0} XP</span>
                        <span className="text-[10px] text-[var(--color-text-tertiary)] block">({getBadgeName(col.geekPoints || 0)})</span>
                      </td>
                      <td className="px-4 font-bold text-[var(--color-text-primary)]">
                        ⭐ {col.avgRating ? Number(col.avgRating).toFixed(2) : '5.00'}
                        <span className="text-[10px] text-[var(--color-text-tertiary)] font-normal block">({col.totalReviews || 0} reviews)</span>
                      </td>
                      <td className="px-4">{col.totalOrders || 0} pedidos</td>
                      <td className="px-4 text-right">
                        <DeleteSellerButton sellerId={col.id} displayName={col.displayName} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Moderador de Votações Integrado */}
      <div className="border-t border-[var(--color-border-subtle)] pt-8">
        <Text variant="body-md" className="font-bold mb-4">
          Fila de Moderação e Consenso
        </Text>
        <CurationPanel
          pendingDrops={pendingDrops}
          userCurationVotes={userCurationVotes}
          pendingReviews={typedReviews}
          userReviewVotes={userReviewVotes}
          isAdmin={isAdmin}
          isAuthenticated={true}
          userGeekPoints={profile?.geekPoints || 0}
        />
      </div>
    </div>
  );
}
