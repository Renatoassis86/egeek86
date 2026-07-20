import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Glow } from '@/components/motion/glow';
import { Reveal } from '@/components/motion/reveal';
import { Trophy, Award, ShieldCheck, Sparkles, HelpCircle, Zap } from 'lucide-react';

export const metadata = { title: 'Ranking de Colecionadores & Gamificação | Espaço Geek 86' };
export const dynamic = 'force-dynamic';

interface LeaderboardUser {
  rank: number;
  id: string;
  name: string;
  avatarUrl: string;
  xpLevel: number;
  xpPoints: number;
  positivityRate: number;
  totalDeals: number;
  badgeTitle: string;
  badgeVariant: 'legend' | 'hype' | 'success' | 'primary';
  verified: boolean;
  role: string;
}

const TOP_USERS: LeaderboardUser[] = [
  {
    rank: 1,
    id: 'user-1',
    name: 'Renato Assis',
    avatarUrl: '/images/home/tile-1.png',
    xpLevel: 99,
    xpPoints: 48500,
    positivityRate: 100,
    totalDeals: 342,
    badgeTitle: 'Lenda Geek 👑',
    badgeVariant: 'legend',
    verified: true,
    role: 'Colecionador Master',
  },
  {
    rank: 2,
    id: 'user-2',
    name: 'CyberCollector_86',
    avatarUrl: '/images/home/tile-2.png',
    xpLevel: 87,
    xpPoints: 39200,
    positivityRate: 99.5,
    totalDeals: 289,
    badgeTitle: 'Mestre Collector 🏆',
    badgeVariant: 'hype',
    verified: true,
    role: 'Leiloeiro Hype',
  },
  {
    rank: 3,
    id: 'user-3',
    name: 'PixelHunter_PB',
    avatarUrl: '/images/home/tile-3.png',
    xpLevel: 79,
    xpPoints: 31400,
    positivityRate: 99.1,
    totalDeals: 215,
    badgeTitle: 'Pro Trader ⚡',
    badgeVariant: 'success',
    verified: true,
    role: 'Caçador de Raridades',
  },
  {
    rank: 4,
    id: 'user-4',
    name: 'VaporGamer_80s',
    avatarUrl: '/images/home/tile-4.png',
    xpLevel: 68,
    xpPoints: 24800,
    positivityRate: 98.7,
    totalDeals: 178,
    badgeTitle: 'Caçador Hype 🎯',
    badgeVariant: 'primary',
    verified: true,
    role: 'Comprador Ativo',
  },
  {
    rank: 5,
    id: 'user-5',
    name: 'RetroVault_Nordeste',
    avatarUrl: '/images/home/tile-5.png',
    xpLevel: 62,
    xpPoints: 21300,
    positivityRate: 98.2,
    totalDeals: 142,
    badgeTitle: 'Colecionador Gold ⭐',
    badgeVariant: 'primary',
    verified: true,
    role: 'Vendedor Verificado',
  },
  {
    rank: 6,
    id: 'user-6',
    name: 'ArcadeMaster_JP',
    avatarUrl: '/images/home/tile-6.png',
    xpLevel: 55,
    xpPoints: 18400,
    positivityRate: 97.9,
    totalDeals: 119,
    badgeTitle: 'Trader Geek 🚀',
    badgeVariant: 'primary',
    verified: false,
    role: 'Membro Comunidade',
  },
];

export default function RankingPage() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16 overflow-hidden">
      {/* Glows de Fundo */}
      <Glow color="gold" size="lg" className="-top-36 -right-24" intensity={0.15} />
      <Glow color="hype" size="md" className="top-1/2 -left-20" intensity={0.1} />

      {/* Hero Banner do Ranking */}
      <div className="relative border border-[var(--color-accent-gold)]/40 bg-[var(--color-bg-inset)]/60 rounded-[var(--radius-xl)] p-6 md:p-10 lg:p-12 overflow-hidden mb-12 z-10 backdrop-blur-md">
        <div className="absolute right-0 top-0 bottom-0 w-full md:w-[45%] hidden md:block z-0 overflow-hidden select-none pointer-events-none rounded-r-[var(--radius-xl)]">
          <div 
            className="relative w-full h-full"
            style={{ clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 0% 100%)' }}
          >
            <Image
              src="/images/ranking/hero-banner.png"
              alt="Ranking de Colecionadores"
              fill
              className="object-cover object-[center_top]"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-inset)] via-transparent to-transparent opacity-80 pointer-events-none" />
          </div>
        </div>

        <div className="flex flex-col gap-4 relative z-10 max-w-2xl">
          <Reveal>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="legend" size="lg" className="animate-pulse">
                👑 Hall da Fama Espaço Geek 86
              </Badge>
              <Badge variant="outline" size="sm" className="bg-[var(--color-bg-inset)] text-[var(--color-accent-gold)]">
                ⭐ Atualizado em Tempo Real
              </Badge>
            </div>
          </Reveal>

          <Reveal delayMs={100}>
            <Text as="h1" variant="heading-xl" className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              Ranking de Gamificação & Positivação
            </Text>
          </Reveal>

          <Reveal delayMs={200}>
            <Text variant="body-md" color="secondary" className="leading-relaxed">
              Confira os membros mais engajados e bem avaliados da nossa comunidade. Quanto maior a sua pontuação de XP e positividade nas negociações, maior o seu nível e destaque nas buscas e leilões da plataforma!
            </Text>
          </Reveal>

          <Reveal delayMs={300}>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild size="lg" variant="primary" className="font-bold">
                <Link href="/conta?aba=visao-geral">
                  <Sparkles className="mr-2 size-5" /> Ver Meu Nível de XP
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/conta/vendedor/onboarding">Subir no Ranking</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>

      {/* Pódio dos 3 Melhores Colocados (Top 3 Hall da Fama) */}
      <div className="mb-14">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Text as="h2" variant="heading-lg" className="flex items-center gap-2 font-black">
              <Trophy className="size-6 text-[var(--color-accent-gold)]" />
              Pódio dos Campeões (Top 3)
            </Text>
            <Text variant="body-sm" color="tertiary">
              Os colecionadores com os maiores níveis de reputação e positividade do mês.
            </Text>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          {/* 2º Lugar (Silver) */}
          <Card className="border-slate-500/40 bg-[var(--color-bg-surface)] hover:border-slate-400 transition-all md:order-1">
            <CardContent className="p-6 flex flex-col items-center text-center gap-3 relative overflow-hidden">
              <div className="absolute top-3 right-3 text-2xl font-black text-slate-400">#2</div>
              <div className="size-20 rounded-full border-4 border-slate-400 p-1 bg-slate-500/20 relative">
                <div className="size-full rounded-full overflow-hidden relative">
                  <Image src={TOP_USERS[1].avatarUrl} alt={TOP_USERS[1].name} fill className="object-cover" />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-slate-400 text-slate-950 font-black text-xs px-2 py-0.5 rounded-full shadow-md">
                  🥈 2º
                </div>
              </div>
              <div>
                <Text variant="heading-md" className="font-bold">{TOP_USERS[1].name}</Text>
                <Text variant="caption" color="tertiary">{TOP_USERS[1].role}</Text>
              </div>
              <Badge variant="hype" size="sm">{TOP_USERS[1].badgeTitle}</Badge>
              <div className="w-full pt-3 border-t border-[var(--color-border-subtle)] grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[var(--color-bg-inset)] p-2 rounded">
                  <Text variant="caption" color="tertiary">Nível XP</Text>
                  <Text variant="body-sm" className="font-bold font-mono text-slate-300">Lvl {TOP_USERS[1].xpLevel}</Text>
                </div>
                <div className="bg-[var(--color-bg-inset)] p-2 rounded">
                  <Text variant="caption" color="tertiary">Positivação</Text>
                  <Text variant="body-sm" className="font-bold font-mono text-emerald-400">{TOP_USERS[1].positivityRate}%</Text>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 1º Lugar (Gold) - Destaque Principal */}
          <Card className="border-[var(--color-accent-gold)] bg-gradient-to-b from-[var(--color-accent-gold)]/15 via-[var(--color-bg-surface)] to-[var(--color-bg-surface)] hover:border-[var(--color-accent-gold)] transition-all shadow-[var(--shadow-xl)] md:order-2 md:-translate-y-4">
            <CardContent className="p-8 flex flex-col items-center text-center gap-4 relative overflow-hidden">
              <div className="absolute top-3 right-3 text-3xl font-black text-[var(--color-accent-gold)]">#1</div>
              <div className="size-24 rounded-full border-4 border-[var(--color-accent-gold)] p-1.5 bg-[var(--color-accent-gold)]/20 relative shadow-lg">
                <div className="size-full rounded-full overflow-hidden relative">
                  <Image src={TOP_USERS[0].avatarUrl} alt={TOP_USERS[0].name} fill className="object-cover" />
                </div>
                <div className="absolute -bottom-3 -right-2 bg-[var(--color-accent-gold)] text-black font-black text-sm px-2.5 py-0.5 rounded-full shadow-lg animate-bounce">
                  🥇 1º LUGAR
                </div>
              </div>
              <div>
                <Text variant="heading-lg" className="font-black text-[var(--color-accent-gold)]">{TOP_USERS[0].name}</Text>
                <Text variant="body-sm" color="secondary" className="font-medium">{TOP_USERS[0].role}</Text>
              </div>
              <Badge variant="legend" size="md" className="py-1 px-3 text-xs font-bold shadow-md">
                {TOP_USERS[0].badgeTitle}
              </Badge>
              <div className="w-full pt-4 border-t border-[var(--color-accent-gold)]/30 grid grid-cols-2 gap-3 text-xs">
                <div className="bg-[var(--color-bg-inset)] p-2.5 rounded border border-[var(--color-accent-gold)]/20">
                  <Text variant="caption" color="tertiary">Nível XP</Text>
                  <Text variant="body-md" className="font-black font-mono text-[var(--color-accent-gold)]">Lvl {TOP_USERS[0].xpLevel}</Text>
                </div>
                <div className="bg-[var(--color-bg-inset)] p-2.5 rounded border border-emerald-500/30">
                  <Text variant="caption" color="tertiary">Positivação</Text>
                  <Text variant="body-md" className="font-black font-mono text-emerald-400">{TOP_USERS[0].positivityRate}% 👍</Text>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3º Lugar (Bronze) */}
          <Card className="border-amber-700/40 bg-[var(--color-bg-surface)] hover:border-amber-600 transition-all md:order-3">
            <CardContent className="p-6 flex flex-col items-center text-center gap-3 relative overflow-hidden">
              <div className="absolute top-3 right-3 text-2xl font-black text-amber-600">#3</div>
              <div className="size-20 rounded-full border-4 border-amber-600 p-1 bg-amber-700/20 relative">
                <div className="size-full rounded-full overflow-hidden relative">
                  <Image src={TOP_USERS[2].avatarUrl} alt={TOP_USERS[2].name} fill className="object-cover" />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-amber-600 text-white font-black text-xs px-2 py-0.5 rounded-full shadow-md">
                  🥉 3º
                </div>
              </div>
              <div>
                <Text variant="heading-md" className="font-bold">{TOP_USERS[2].name}</Text>
                <Text variant="caption" color="tertiary">{TOP_USERS[2].role}</Text>
              </div>
              <Badge variant="success" size="sm">{TOP_USERS[2].badgeTitle}</Badge>
              <div className="w-full pt-3 border-t border-[var(--color-border-subtle)] grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[var(--color-bg-inset)] p-2 rounded">
                  <Text variant="caption" color="tertiary">Nível XP</Text>
                  <Text variant="body-sm" className="font-bold font-mono text-amber-400">Lvl {TOP_USERS[2].xpLevel}</Text>
                </div>
                <div className="bg-[var(--color-bg-inset)] p-2 rounded">
                  <Text variant="caption" color="tertiary">Positivação</Text>
                  <Text variant="body-sm" className="font-bold font-mono text-emerald-400">{TOP_USERS[2].positivityRate}%</Text>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabela de Classificação Geral da Comunidade */}
      <div className="mb-16">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-4">
          <div>
            <Text as="h3" variant="heading-md" className="font-bold flex items-center gap-2">
              <Award className="size-5 text-[var(--color-accent-primary)]" />
              Tabela de Positivação e Reputação Geral
            </Text>
            <Text variant="caption" color="tertiary">
              Ordene os membros conforme o nível de engajamento, aprovação e total de negócios na plataforma.
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" className="text-xs">
              🔥 Todos os Membros
            </Button>
            <Button size="sm" variant="outline" className="text-xs">
              👍 Maior Positivação
            </Button>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)] text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  <th className="py-3.5 px-4 text-center w-16">Posição</th>
                  <th className="py-3.5 px-4">Membro da Comunidade</th>
                  <th className="py-3.5 px-4 text-center">Nível XP</th>
                  <th className="py-3.5 px-4 text-center">Positivação</th>
                  <th className="py-3.5 px-4 text-center">Negócios Realizados</th>
                  <th className="py-3.5 px-4 text-right">Selo de Nível</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)] text-sm">
                {TOP_USERS.map((user) => (
                  <tr key={user.id} className="hover:bg-[var(--color-bg-inset)]/50 transition-colors">
                    <td className="py-4 px-4 text-center font-mono font-black text-base">
                      {user.rank === 1 ? '🥇 #1' : user.rank === 2 ? '🥈 #2' : user.rank === 3 ? '🥉 #3' : `#${user.rank}`}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="relative size-10 rounded-full overflow-hidden border border-[var(--color-border-subtle)]">
                          <Image src={user.avatarUrl} alt={user.name} fill className="object-cover" />
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 font-bold text-[var(--color-text-primary)]">
                            {user.name}
                            {user.verified && <ShieldCheck className="size-4 text-emerald-400" />}
                          </div>
                          <span className="text-xs text-[var(--color-text-tertiary)]">{user.role}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center font-mono font-bold">
                      <span className="px-2.5 py-1 rounded bg-[var(--color-bg-inset)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-accent-gold)]">
                        Lvl {user.xpLevel} ({user.xpPoints.toLocaleString('pt-BR')} XP)
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="inline-flex items-center gap-1 font-mono font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 text-xs">
                        👍 {user.positivityRate}%
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center font-mono font-medium text-[var(--color-text-secondary)]">
                      {user.totalDeals} transações
                    </td>
                    <td className="py-4 px-4 text-right">
                      <Badge variant={user.badgeVariant} size="sm">
                        {user.badgeTitle}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Como Funciona o Sistema de Gamificação & Positivação */}
      <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/40 rounded-[var(--radius-xl)] p-6 md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="size-10 rounded-full bg-[var(--color-accent-gold)]/20 flex items-center justify-center text-[var(--color-accent-gold)]">
            <HelpCircle className="size-6" />
          </div>
          <div>
            <Text variant="heading-md" className="font-bold">Como Funciona a Positivação & Gamificação?</Text>
            <Text variant="caption" color="tertiary">Entenda como subir no ranking e ganhar destaque no Espaço Geek 86.</Text>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col gap-2 p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
            <div className="flex items-center gap-2 text-[var(--color-accent-gold)] font-bold text-sm">
              <Zap className="size-4" /> 1. Acumule XP em Negócios
            </div>
            <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
              Cada transação concluída com sucesso, lance em leilão honrado ou oferta compartilhada gera pontos de XP para o seu perfil de colecionador.
            </Text>
          </div>

          <div className="flex flex-col gap-2 p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <ShieldCheck className="size-4" /> 2. Mantenha 100% de Positivação
            </div>
            <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
              Receba avaliações positivas de outros membros compradores e vendedores. Perfis com positividade acima de 98% ganham o selo de Verificado.
            </Text>
          </div>

          <div className="flex flex-col gap-2 p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
            <div className="flex items-center gap-2 text-[var(--color-accent-hype)] font-bold text-sm">
              <Trophy className="size-4" /> 3. Destaque Máximo na Vitrine
            </div>
            <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
              Usuários no topo do ranking recebem prioridade em leilões, distintivos exclusivos no perfil e taxas reduzidas em novos drops.
            </Text>
          </div>
        </div>
      </div>
    </section>
  );
}
