'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Sliders,
  ShoppingBag,
  ShieldCheck,
  Gavel,
  Flame,
  Zap,
  Plus,
  Save,
  ArrowRight,
  Gamepad2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import { MARKETPLACE_PUBLIC } from '@/lib/features';
import { updateOwnProfile } from '@/app/(shop)/conta/actions';

interface ProfileHubTabsProps {
  initialTab?: string;
  profile: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    role?: string | null;
    geekPoints: number;
  } | null;
  seller: any;
  watches: any[];
}

const TAB_BASE =
  'pb-3 px-2 text-xs md:text-sm font-bold transition-all border-b-2 focus:outline-none flex items-center gap-2 shrink-0';
const TAB_IDLE = 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]';

export function ProfileHubTabs({ initialTab = 'visao_geral', profile, seller, watches }: ProfileHubTabsProps) {
  const [rawTab, setActiveTab] = useState(initialTab);
  // Marketplace fechado: abas de drops/leilões não existem, volta para a visão geral.
  const activeTab =
    !MARKETPLACE_PUBLIC && (rawTab === 'vendas' || rawTab === 'leiloes') ? 'visao_geral' : rawTab;

  // useState(initialTab) só roda o inicializador na primeira montagem — se o
  // usuário já está em /conta e clica num link tipo /conta?aba=jogos (o
  // coração no topo, por exemplo), o Server Component recalcula initialTab
  // mas esse componente cliente é reaproveitado (mesma posição na árvore),
  // então a aba nunca trocava sozinha. Sincroniza sempre que o valor vindo
  // da URL mudar.
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Só campos que existem em `profiles`: nome e telefone.
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [isSaving, startSaving] = useTransition();

  const isSellerActive = seller?.status === 'active' || profile?.role === 'admin' || profile?.role === 'super_admin';

  const handleSaveData = (e: React.FormEvent) => {
    e.preventDefault();
    startSaving(async () => {
      const result = await updateOwnProfile({ name, phone });
      if (result.ok) toast.success('Dados atualizados.');
      else toast.error(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Menu de Abas */}
      <div className="flex flex-wrap border-b border-[var(--color-border-subtle)] pb-px gap-2 md:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('visao_geral')}
          className={cn(
            TAB_BASE,
            activeTab === 'visao_geral' ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)]' : TAB_IDLE
          )}
        >
          <Zap className="size-4" />
          <span>Visão geral</span>
        </button>

        <button
          onClick={() => setActiveTab('dados')}
          className={cn(
            TAB_BASE,
            activeTab === 'dados' ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]' : TAB_IDLE
          )}
        >
          <Sliders className="size-4" />
          <span>Dados cadastrais</span>
        </button>

        {MARKETPLACE_PUBLIC && (
          <>
        <button
          onClick={() => setActiveTab('vendas')}
          className={cn(
            TAB_BASE,
            activeTab === 'vendas' ? 'border-[var(--color-accent-hype)] text-[var(--color-accent-hype)]' : TAB_IDLE
          )}
        >
          <ShieldCheck className="size-4" />
          <span>Meus drops</span>
        </button>

        <button
          onClick={() => setActiveTab('leiloes')}
          className={cn(
            TAB_BASE,
            activeTab === 'leiloes' ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)]' : TAB_IDLE
          )}
        >
          <Gavel className="size-4" />
          <span>Meus leilões</span>
        </button>
          </>
        )}

        <button
          onClick={() => setActiveTab('compras')}
          className={cn(
            TAB_BASE,
            activeTab === 'compras' ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]' : TAB_IDLE
          )}
        >
          <ShoppingBag className="size-4" />
          <span>Minhas compras</span>
        </button>

        <button
          onClick={() => setActiveTab('jogos')}
          className={cn(
            TAB_BASE,
            activeTab === 'jogos' ? 'border-[var(--color-accent-hype)] text-[var(--color-accent-hype)]' : TAB_IDLE
          )}
        >
          <Flame className="size-4" />
          <span>Jogos acompanhados ({watches.length})</span>
        </button>
      </div>

      {/* 1. VISÃO GERAL — somente dado real da conta */}
      {activeTab === 'visao_geral' && (
        <div className={cn('grid grid-cols-1 gap-6', MARKETPLACE_PUBLIC ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
            <Text variant="caption" color="tertiary">Jogos acompanhados</Text>
            <Text variant="heading-lg" className="mt-2 text-2xl font-black">{watches.length}</Text>
            <Text variant="caption" color="secondary" className="mt-3 text-[11px]">
              {watches.length === 0
                ? 'Acompanhe um jogo na vitrine para ver o menor preço aqui.'
                : 'Veja os preços na aba de jogos acompanhados.'}
            </Text>
          </Card>

          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
            <Text variant="caption" color="tertiary">Pontos</Text>
            <Text variant="heading-lg" className="mt-2 text-2xl font-black">
              {profile && profile.geekPoints > 0 ? profile.geekPoints.toLocaleString('pt-BR') : 'sem pontos ainda'}
            </Text>
            <Text variant="caption" color="secondary" className="mt-3 text-[11px]">
              Saldo gravado na sua conta. Ainda não há regra pública de como ganhar ou usar pontos.
            </Text>
          </Card>

          {MARKETPLACE_PUBLIC && (
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
            <Text variant="caption" color="tertiary">Perfil de colecionador</Text>
            <Text variant="heading-lg" className="mt-2 text-2xl font-black">
              {seller?.status === 'active' ? 'Verificado' : seller ? 'Em análise' : 'Não cadastrado'}
            </Text>
            <Text variant="caption" color="secondary" className="mt-3 text-[11px]">
              {seller
                ? 'Situação do seu cadastro de colecionador.'
                : 'Cadastre-se como colecionador para publicar drops e leilões.'}
            </Text>
          </Card>
          )}
        </div>
      )}

      {/* 2. DADOS CADASTRAIS */}
      {activeTab === 'dados' && (
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 md:p-8">
          <form onSubmit={handleSaveData} className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-4">
              <div>
                <Text variant="heading-lg" className="font-bold">Dados cadastrais</Text>
                <Text variant="body-sm" color="secondary" className="text-xs">Nome de exibição e telefone de contato.</Text>
              </div>
              <Button type="submit" variant="primary" disabled={isSaving} rightIcon={<Save className="size-4" />}>
                {isSaving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="conta-nome" className="text-xs font-semibold text-[var(--color-text-secondary)]">Nome de exibição</label>
                <Input id="conta-nome" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="conta-email" className="text-xs font-semibold text-[var(--color-text-secondary)]">E-mail cadastrado</label>
                <Input id="conta-email" value={profile?.email ?? ''} disabled className="opacity-70 cursor-not-allowed" />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="conta-telefone" className="text-xs font-semibold text-[var(--color-text-secondary)]">Telefone / WhatsApp</label>
                <Input id="conta-telefone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* 3. MEUS DROPS */}
      {MARKETPLACE_PUBLIC && activeTab === 'vendas' && (
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <Text variant="heading-lg" className="font-bold">Meus drops (Hype Zone)</Text>
              <Text variant="body-sm" color="secondary" className="text-xs">Os colecionáveis que você cadastrou para lançamento.</Text>
            </div>
            {isSellerActive ? (
              <Button asChild variant="hype" size="sm" rightIcon={<Plus className="size-4" />}>
                <Link href="/conta/vendedor/novo-drop">Cadastrar novo drop</Link>
              </Button>
            ) : (
              <Button asChild variant="hype" size="sm" rightIcon={<ArrowRight className="size-4" />}>
                <Link href="/entrar?role=colecionador">Solicitar cadastro de colecionador</Link>
              </Button>
            )}
          </div>

          {!isSellerActive ? (
            <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/5 p-8 text-center">
              <ShieldCheck className="size-8 text-amber-400" />
              <Text variant="heading-sm" className="font-bold text-amber-400">Credenciamento de colecionador necessário</Text>
              <Text variant="body-sm" color="secondary" className="max-w-[50ch]">
                Para publicar itens na Hype Zone, faça o cadastro de colecionador. Depois da validação administrativa você poderá cadastrar seus drops.
              </Text>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/40 p-8 text-center">
              <Text variant="body-sm" color="secondary" className="max-w-[50ch]">
                A lista dos seus drops, com situação e visualizações, fica no painel do colecionador.
              </Text>
              <Button asChild variant="primary" size="sm">
                <Link href="/conta/vendedor">Abrir painel do colecionador</Link>
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* 4. MEUS LEILÕES */}
      {MARKETPLACE_PUBLIC && activeTab === 'leiloes' && (
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 md:p-8">
          <div className="mb-6 flex w-full max-w-full flex-col items-start justify-between gap-4 overflow-hidden sm:flex-row sm:items-center">
            <div>
              <Text variant="heading-lg" className="text-lg font-bold sm:text-xl">Meus leilões e lances</Text>
              <Text variant="body-sm" color="secondary" className="text-xs">Lotes que você cadastrou e disputas de que participa.</Text>
            </div>
            {isSellerActive ? (
              <Button asChild variant="primary" size="sm" className="w-full text-xs font-bold sm:w-auto" rightIcon={<Plus className="size-4" />}>
                <Link href="/hype-zone/leiloes?aba=novo">Cadastrar novo lote</Link>
              </Button>
            ) : (
              <Button asChild variant="primary" size="sm" className="w-full text-xs font-bold sm:w-auto" rightIcon={<ArrowRight className="size-4" />}>
                <Link href="/entrar?role=colecionador">Solicitar cadastro de leiloeiro</Link>
              </Button>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/40 p-8 text-center">
            <Gavel className="size-8 text-[var(--color-text-tertiary)]" aria-hidden />
            <Text variant="body-sm" color="secondary" className="max-w-[50ch]">
              {isSellerActive
                ? 'Os lotes que você cadastrou aparecem no painel do colecionador.'
                : 'Para abrir lotes é preciso o cadastro de colecionador, validado pelo administrador.'}
            </Text>
            <Button asChild variant="outline" size="sm">
              <Link href={isSellerActive ? '/conta/vendedor' : '/leiloes'}>
                {isSellerActive ? 'Abrir painel do colecionador' : 'Ver leilões'}
              </Link>
            </Button>
          </div>
        </Card>
      )}

      {/* 5. MINHAS COMPRAS */}
      {activeTab === 'compras' && (
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 md:p-8">
          <Text variant="heading-lg" className="font-bold mb-2">Minhas compras</Text>
          <Text variant="body-sm" color="secondary" className="text-xs mb-6">
            O Espaço Geek 86 compara preços e leva você à loja; a compra acontece no site da loja, então não há pedidos registrados aqui.
          </Text>

          <div className="p-8 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/40 text-center flex flex-col items-center gap-3">
            <ShoppingBag className="size-8 text-[var(--color-text-tertiary)]" />
            <Text variant="heading-sm">Nenhum pedido registrado</Text>
            <Text variant="body-sm" color="secondary" className="max-w-[44ch]">
              Veja as ofertas de jogos e consoles.
            </Text>
            <Button asChild variant="primary" className="mt-2">
              <Link href="/ofertas">Explorar ofertas</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* 6. JOGOS ACOMPANHADOS */}
      {activeTab === 'jogos' && (
        <div>
          {watches.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                <div className="relative mb-2 aspect-[8/5] w-full max-w-sm overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
                  <Image src="/images/conta/empty-state.png" alt="" fill sizes="384px" className="object-cover" />
                </div>
                <Text variant="heading-sm">Você ainda não está acompanhando nenhum jogo</Text>
                <Text variant="body-sm" color="secondary" className="max-w-[46ch]">
                  Encontre um jogo na vitrine e clique em &quot;Acompanhar preço&quot;.
                </Text>
                <Button asChild className="mt-2">
                  <Link href="/ofertas">Explorar ofertas</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {watches.map((item) => (
                <Link key={item.watchId || item.masterProductId} href={`/ofertas/${item.offerSlug || ''}`}>
                  <Card interactive className="h-full overflow-hidden border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:border-[var(--color-accent-primary)]/50 transition-all">
                    <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-[var(--color-bg-inset)]">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura de CDN externa (mesmo padrão de offer-card.tsx)
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="h-full w-full object-contain p-4"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Gamepad2 className="size-10 text-[var(--color-text-tertiary)]" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant="outline" size="sm" className="bg-[var(--color-bg-inset)]">
                          {item.networkName}
                        </Badge>
                        <Badge variant="legend" size="sm" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                          Menor cotação atual
                        </Badge>
                      </div>

                      <Text variant="body-md" className="line-clamp-2 font-bold text-[var(--color-text-primary)]">
                        {item.title}
                      </Text>

                      <div className="mt-auto pt-2 border-t border-[var(--color-border-subtle)] flex flex-col gap-1">
                        <Text variant="caption" color="tertiary" className="text-[10px]">
                          Menor preço entre todas as lojas
                        </Text>
                        <Text variant="heading-md" className="font-mono font-black text-xl text-[var(--color-accent-primary)]">
                          {formatBRL(item.currentPriceCents)}
                        </Text>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
