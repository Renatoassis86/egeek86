import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dropCurations } from '@/db/schema';
import { CurationPanel } from '@/components/geek-deals/curation-panel';
import { PointsRewardsCard } from '@/components/geek-deals/points-rewards-card';
import { Glow } from '@/components/motion/glow';
import { Reveal } from '@/components/motion/reveal';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
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

  // Carrega votos que o usuário já enviou
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
        
        {/* Lado Esquerdo: Feed de Drops Pendentes */}
        <div className="lg:col-span-2">
          <Reveal delay={0.12}>
            <CurationPanel
              pendingDrops={pendingDrops}
              userCurationVotes={userCurationVotes}
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

    </section>
  );
}
