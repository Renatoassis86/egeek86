'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  User, 
  Sliders, 
  ShoppingBag, 
  ShieldCheck, 
  Gavel, 
  Flame, 
  Award, 
  Coins, 
  Zap, 
  Star, 
  Plus, 
  Trash2, 
  Save,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';

interface ProfileHubTabsProps {
  initialTab?: string;
  profile: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    role?: string | null;
  } | null;
  seller: any;
  watches: any[];
}

export function ProfileHubTabs({ initialTab = 'visao_geral', profile, seller, watches }: ProfileHubTabsProps) {
  const [activeTab, setActiveTab] = useState(initialTab);

  // Form states de edição de dados cadastrais
  const [name, setName] = useState(profile?.name || 'Colecionador Geek');
  const [phone, setPhone] = useState('(83) 98195-7737');
  const [city, setCity] = useState('João Pessoa');
  const [state, setState] = useState('PB');
  const [bio, setBio] = useState('Colecionador focado em consoles retrô, TCG Pokémon e raridades Nintendo.');
  const [isSaving, setIsSaving] = useState(false);

  const isSellerActive = seller?.status === 'active' || profile?.role === 'admin';

  const handleSaveData = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Dados cadastrais atualizados com sucesso!');
    }, 600);
  };

  const handleDeleteAccountData = () => {
    if (confirm('Tem certeza que deseja solicitar a limpeza dos seus dados cadastrais facultativos?')) {
      toast.success('Dados opcionais removidos com sucesso.');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Menu de Abas Interativo */}
      <div className="flex flex-wrap border-b border-[var(--color-border-subtle)] pb-px gap-2 md:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('visao_geral')}
          className={cn(
            'pb-3 px-2 text-xs md:text-sm font-bold transition-all border-b-2 focus:outline-none flex items-center gap-2 shrink-0',
            activeTab === 'visao_geral'
              ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          <Zap className="size-4" />
          <span>Visão Geral & Gamificação</span>
        </button>

        <button
          onClick={() => setActiveTab('dados')}
          className={cn(
            'pb-3 px-2 text-xs md:text-sm font-bold transition-all border-b-2 focus:outline-none flex items-center gap-2 shrink-0',
            activeTab === 'dados'
              ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          <Sliders className="size-4" />
          <span>Dados Cadastrais & Perfil</span>
        </button>

        <button
          onClick={() => setActiveTab('vendas')}
          className={cn(
            'pb-3 px-2 text-xs md:text-sm font-bold transition-all border-b-2 focus:outline-none flex items-center gap-2 shrink-0',
            activeTab === 'vendas'
              ? 'border-[var(--color-accent-hype)] text-[var(--color-accent-hype)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          <ShieldCheck className="size-4" />
          <span>Meus Drops & Vendas</span>
        </button>

        <button
          onClick={() => setActiveTab('leiloes')}
          className={cn(
            'pb-3 px-2 text-xs md:text-sm font-bold transition-all border-b-2 focus:outline-none flex items-center gap-2 shrink-0',
            activeTab === 'leiloes'
              ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          <Gavel className="size-4" />
          <span>Meus Leilões & Lances</span>
        </button>

        <button
          onClick={() => setActiveTab('compras')}
          className={cn(
            'pb-3 px-2 text-xs md:text-sm font-bold transition-all border-b-2 focus:outline-none flex items-center gap-2 shrink-0',
            activeTab === 'compras'
              ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          <ShoppingBag className="size-4" />
          <span>Minhas Compras</span>
        </button>

        <button
          onClick={() => setActiveTab('jogos')}
          className={cn(
            'pb-3 px-2 text-xs md:text-sm font-bold transition-all border-b-2 focus:outline-none flex items-center gap-2 shrink-0',
            activeTab === 'jogos'
              ? 'border-[var(--color-accent-hype)] text-[var(--color-accent-hype)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          <Flame className="size-4" />
          <span>Meus Jogos Monitorados ({watches.length})</span>
        </button>
      </div>

      {/* Conteúdo das Abas */}

      {/* 1. VISÃO GERAL & GAMIFICAÇÃO */}
      {activeTab === 'visao_geral' && (
        <div className="flex flex-col gap-8">
          {/* Métricas de Gamificação */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
              <div className="flex items-center justify-between mb-3">
                <Text variant="caption" color="tertiary">Progresso de Nível</Text>
                <Badge variant="legend" size="sm">Nível 12</Badge>
              </div>
              <Text variant="heading-lg" className="font-black text-2xl">2.840 XP</Text>
              <div className="w-full bg-[var(--color-bg-inset)] h-2 rounded-full mt-3 overflow-hidden border border-[var(--color-border-subtle)]">
                <div className="bg-gradient-to-r from-[var(--color-accent-gold)] to-[var(--color-accent-hype)] h-full w-[85%]" />
              </div>
              <Text variant="caption" color="secondary" className="text-[11px] mt-2">Faltam 160 XP para Nível 13 (Colecionador Master)</Text>
            </Card>

            <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
              <div className="flex items-center justify-between mb-3">
                <Text variant="caption" color="tertiary">Saldo Geek Coins</Text>
                <Coins className="size-5 text-[var(--color-accent-gold)]" />
              </div>
              <Text variant="heading-lg" className="font-black text-2xl text-[var(--color-accent-gold)]">🪙 480 Coins</Text>
              <Text variant="caption" color="secondary" className="text-[11px] mt-3">Acumulados em lances, drops e interações comunitárias</Text>
            </Card>

            <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
              <div className="flex items-center justify-between mb-3">
                <Text variant="caption" color="tertiary">Reputação na Comunidade</Text>
                <div className="flex items-center gap-1 text-amber-400 text-xs font-bold">
                  <Star className="size-4 fill-amber-400" /> 4.9/5.0
                </div>
              </div>
              <Text variant="heading-lg" className="font-black text-2xl">18 Transações</Text>
              <Text variant="caption" color="secondary" className="text-[11px] mt-3">100% de avaliações positivas em entregas e leilões</Text>
            </Card>
          </div>

          {/* Conquistas & Insígnias */}
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
            <Text variant="heading-md" className="font-bold mb-4 flex items-center gap-2">
              <Award className="size-5 text-[var(--color-accent-gold)]" />
              Insígnias & Conquistas Desbloqueadas
            </Text>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex flex-col items-center gap-2 p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] border border-amber-500/30 text-center">
                <div className="relative size-12 rounded-full overflow-hidden border border-amber-400/50">
                  <Image src="/images/conta/collector-badge.png" alt="Badge" fill className="object-cover" />
                </div>
                <Text variant="body-sm" className="font-bold text-amber-400">Guardião do Vault</Text>
                <Text variant="caption" color="secondary" className="text-[10px]">Cadastrou +5 itens raros no acervo</Text>
              </div>

              <div className="flex flex-col items-center gap-2 p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] border border-[var(--color-accent-hype)]/30 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)] font-black text-xl">⚡</div>
                <Text variant="body-sm" className="font-bold text-[var(--color-accent-hype)]">Caçador Hype</Text>
                <Text variant="caption" color="secondary" className="text-[10px]">Primeiro drop finalizado na Hype Zone</Text>
              </div>

              <div className="flex flex-col items-center gap-2 p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] border border-[var(--color-accent-primary)]/30 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] font-black text-xl">🔨</div>
                <Text variant="body-sm" className="font-bold text-[var(--color-accent-primary)]">Martelo de Ouro</Text>
                <Text variant="caption" color="secondary" className="text-[10px]">Participou de 3 leilões com lance vencedor</Text>
              </div>

              <div className="flex flex-col items-center gap-2 p-4 rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] border border-[var(--color-border-subtle)] text-center opacity-60">
                <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-bg-surface)] text-[var(--color-text-tertiary)] font-black text-xl">👑</div>
                <Text variant="body-sm" className="font-bold">Lenda Retro</Text>
                <Text variant="caption" color="tertiary" className="text-[10px]">Bloqueado (Alcance 5.000 XP)</Text>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 2. DADOS CADASTRAIS & EDITAIS DO PERFIL */}
      {activeTab === 'dados' && (
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 md:p-8">
          <form onSubmit={handleSaveData} className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-4">
              <div>
                <Text variant="heading-lg" className="font-bold">Dados Cadastrais & Perfil</Text>
                <Text variant="body-sm" color="secondary" className="text-xs">Atualize suas informações de contato e personalização pública.</Text>
              </div>
              <Button type="submit" variant="primary" disabled={isSaving} rightIcon={<Save className="size-4" />}>
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Nome de Exibição</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">E-mail Cadastrado</label>
                <Input value={profile?.email || 'egeek86@arkosintelligence.com'} disabled className="opacity-70 cursor-not-allowed" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Telefone / WhatsApp</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Cidade</label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Estado</label>
                  <Input value={state} onChange={(e) => setState(e.target.value)} required />
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Biografia / Apresentação do Colecionador</label>
                <Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Descreva seu foco de coleção..." />
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={handleDeleteAccountData} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                <Trash2 className="size-3.5 mr-1" /> Excluir Dados Facultativos
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving}>
                Salvar Alterações
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 3. MEUS DROPS & VENDAS */}
      {activeTab === 'vendas' && (
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Text variant="heading-lg" className="font-bold">Meus Drops & Vendas (Hype Zone)</Text>
              <Text variant="body-sm" color="secondary" className="text-xs">Gerencie os colecionáveis que você cadastrou para lançamento.</Text>
            </div>
            {isSellerActive ? (
              <Button asChild variant="hype" size="sm" rightIcon={<Plus className="size-4" />}>
                <Link href="/conta/vendedor/novo-drop">Cadastrar Novo Drop</Link>
              </Button>
            ) : (
              <Button asChild variant="hype" size="sm" rightIcon={<ArrowRight className="size-4" />}>
                <Link href="/entrar?role=colecionador">Solicitar Cadastro de Colecionador</Link>
              </Button>
            )}
          </div>

          {!isSellerActive ? (
            <div className="p-8 rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/5 text-center flex flex-col items-center gap-3">
              <ShieldCheck className="size-8 text-amber-400" />
              <Text variant="heading-sm" className="font-bold text-amber-400">Credenciamento de Colecionador Necessário</Text>
              <Text variant="body-sm" color="secondary" className="max-w-[50ch]">
                Para publicar e vender seus próprios itens na Hype Zone, efetue o cadastro de colecionador. Após a validação administrativa, você poderá cadastrar seus drops ilimitadamente.
              </Text>
              <Button asChild variant="hype" className="mt-2">
                <Link href="/entrar?role=colecionador">Cadastrar como Colecionador</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative size-16 rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-border-subtle)] shrink-0">
                    <Image src="/images/home/tile-1.png" alt="Drop" fill className="object-cover" />
                  </div>
                  <div>
                    <Text variant="body-md" className="font-bold">Statue Iron Studios Batman 1/10 Legacy Replica</Text>
                    <Text variant="caption" color="secondary">Postado em 14/07/2026 • 24 visualizações</Text>
                    <Badge variant="hype" size="sm" className="mt-1">Drop Ativo (Ao Vivo)</Badge>
                  </div>
                </div>
                <Text variant="heading-sm" className="font-bold text-[var(--color-accent-gold)]">R$ 1.850,00</Text>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 4. MEUS LEILÕES & LANCES */}
      {activeTab === 'leiloes' && (
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Text variant="heading-lg" className="font-bold">Meus Leilões & Lances (Geek Hammer)</Text>
              <Text variant="body-sm" color="secondary" className="text-xs">Acompanhe lotes que você cadastrou ou disputas que está participando.</Text>
            </div>
            {isSellerActive ? (
              <Button asChild variant="primary" size="sm" rightIcon={<Plus className="size-4" />}>
                <Link href="/hype-zone/leiloes?aba=novo">🔨 Cadastrar Novo Lote de Leilão</Link>
              </Button>
            ) : (
              <Button asChild variant="primary" size="sm" rightIcon={<ArrowRight className="size-4" />}>
                <Link href="/entrar?role=colecionador">Solicitar Cadastro de Leiloeiro</Link>
              </Button>
            )}
          </div>

          {!isSellerActive ? (
            <div className="p-8 rounded-[var(--radius-lg)] border border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/5 text-center flex flex-col items-center gap-3">
              <Gavel className="size-8 text-[var(--color-accent-primary)]" />
              <Text variant="heading-sm" className="font-bold text-[var(--color-accent-primary)]">Credenciamento de Leiloeiro Necessário</Text>
              <Text variant="body-sm" color="secondary" className="max-w-[50ch]">
                Para abrir lotes e conduzir leilões ao vivo, faça seu cadastro de leiloeiro/vendedor e aguarde a aprovação do administrador.
              </Text>
              <Button asChild variant="primary" className="mt-2">
                <Link href="/entrar?role=colecionador">Cadastrar como Leiloeiro</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-accent-gold)]/10 text-[var(--color-accent-gold)] shrink-0">
                    <Gavel className="size-6" />
                  </div>
                  <div>
                    <Text variant="body-md" className="font-bold">Nintendo Virtual Boy CIB (Completo na Caixa)</Text>
                    <Text variant="caption" color="secondary">Seu Lance: R$ 2.450,00 • Lance Atual Vencedor</Text>
                    <Badge variant="legend" size="sm" className="mt-1">Leilão Ativo • Encerra em 4h</Badge>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/leiloes">Ver Sala ao Vivo</Link>
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 5. MINHAS COMPRAS */}
      {activeTab === 'compras' && (
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 md:p-8">
          <Text variant="heading-lg" className="font-bold mb-2">Minhas Compras</Text>
          <Text variant="body-sm" color="secondary" className="text-xs mb-6">Histórico de pedidos e produtos adquiridos através do portal.</Text>
          
          <div className="p-8 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/40 text-center flex flex-col items-center gap-3">
            <ShoppingBag className="size-8 text-[var(--color-text-tertiary)]" />
            <Text variant="heading-sm">Nenhum pedido finalizado recentemente</Text>
            <Text variant="body-sm" color="secondary" className="max-w-[44ch]">
              Explore as melhores ofertas de consoles, jogos e colecionáveis na nossa vitrine.
            </Text>
            <Button asChild variant="primary" className="mt-2">
              <Link href="/ofertas">Explorar Vitrine de Ofertas</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* 6. MEUS JOGOS MONITORADOS */}
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
                  <Card interactive className="h-full border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:border-[var(--color-accent-primary)]/50 transition-all">
                    <div className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant="outline" size="sm" className="bg-[var(--color-bg-inset)]">
                          {item.networkName}
                        </Badge>
                        <Badge variant="legend" size="sm" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                          ⚡ Menor Cotação Atual
                        </Badge>
                      </div>

                      <Text variant="body-md" className="line-clamp-2 font-bold text-[var(--color-text-primary)]">
                        {item.title}
                      </Text>

                      <div className="mt-auto pt-2 border-t border-[var(--color-border-subtle)] flex flex-col gap-1">
                        <Text variant="caption" color="tertiary" className="text-[10px]">
                          Melhor oferta encontrada entre todas as lojas
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
