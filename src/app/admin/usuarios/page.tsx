import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, sellers } from '@/db/schema';
import { requireAdmin } from '@/lib/auth/require-admin';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { UserApprovalActions, PhotoPreviewModal } from '@/components/admin/user-approval-actions';
import { Shield, UserCheck, ShoppingCart, Users, Sparkles } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Admin: Gestão de Usuários & Credenciamento',
  description: 'Gerencie usuários, permissões, aprovações de colecionadores e credenciais de afiliados.',
};

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  await requireAdmin();

  // Busca todos os perfis e relaciona com vendedores se houver
  const userList = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      status: profiles.status,
      geekPoints: profiles.geekPoints,
      preferences: profiles.preferences,
      createdAt: profiles.createdAt,
      sellerId: sellers.id,
      sellerStatus: sellers.status,
    })
    .from(profiles)
    .leftJoin(sellers, eq(profiles.id, sellers.userId))
    .orderBy(desc(profiles.createdAt));

  const totalUsers = userList.length;
  const countAdmins = userList.filter((u) => u.role === 'admin' || u.role === 'super_admin').length;
  const countSellers = userList.filter((u) => u.role === 'seller' || u.sellerStatus === 'active').length;
  const countAffiliates = userList.filter((u) => u.role === 'affiliate').length;
  const countCustomers = userList.filter((u) => u.role === 'customer' && !u.sellerId).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Text as="h1" variant="heading-xl">
          Gestão de Usuários & Credenciamento
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Controle de permissões, auditoria de fotos de coleção de colecionadores e aprovação de novos vendedores.
        </Text>
      </div>

      {/* Cards de Métricas de Usuários */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <Text variant="caption" color="tertiary" className="uppercase font-mono text-[10px]">Total de Usuários</Text>
              <Text variant="heading-lg" className="font-bold">{totalUsers}</Text>
            </div>
            <Users className="size-6 text-[var(--color-accent-primary)] opacity-80" />
          </CardContent>
        </Card>

        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <Text variant="caption" color="tertiary" className="uppercase font-mono text-[10px]">Colecionadores</Text>
              <Text variant="heading-lg" className="font-bold text-[var(--color-accent-hype)]">{countSellers}</Text>
            </div>
            <Sparkles className="size-6 text-[var(--color-accent-hype)] opacity-80" />
          </CardContent>
        </Card>

        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <Text variant="caption" color="tertiary" className="uppercase font-mono text-[10px]">Afiliados</Text>
              <Text variant="heading-lg" className="font-bold">{countAffiliates}</Text>
            </div>
            <UserCheck className="size-6 text-blue-400 opacity-80" />
          </CardContent>
        </Card>

        <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <Text variant="caption" color="tertiary" className="uppercase font-mono text-[10px]">Administradores</Text>
              <Text variant="heading-lg" className="font-bold text-emerald-400">{countAdmins}</Text>
            </div>
            <Shield className="size-6 text-emerald-400 opacity-80" />
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Usuários */}
      <Card className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/10">
        <CardContent className="p-6 flex flex-col gap-4">
          <Text variant="body-md" className="font-bold">
            Lista Completa de Usuários Cadastrados
          </Text>

          <div className="overflow-x-auto border border-[var(--color-border-subtle)] rounded-[var(--radius-sm)] bg-[var(--color-bg-surface)]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/40 font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider h-10">
                  <th className="px-4">Usuário</th>
                  <th className="px-4">Papel / Acesso</th>
                  <th className="px-4">Questionário de Credenciais</th>
                  <th className="px-4">Foto Coleção + Rosto</th>
                  <th className="px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)] text-[var(--color-text-secondary)] font-mono">
                {userList.length === 0 ? (
                  <tr className="h-12">
                    <td colSpan={5} className="px-4 text-center italic text-[var(--color-text-tertiary)]">
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                ) : (
                  userList.map((u) => {
                    const prefs = (u.preferences as Record<string, any>) || {};
                    const collectorOnb = prefs.collectorOnboarding;
                    const affiliateOnb = prefs.affiliateOnboarding;
                    const facePhoto = collectorOnb?.facePhotoBase64;

                    const hasPendingCollector = u.sellerStatus === 'pending_kyc' || (collectorOnb && collectorOnb.status === 'pending_kyc');
                    const hasPendingAffiliate = affiliateOnb && affiliateOnb.status === 'pending' && u.role !== 'affiliate';

                    return (
                      <tr key={u.id} className="h-16 hover:bg-[var(--color-bg-inset)]/20 transition-colors">
                        {/* Nome e E-mail */}
                        <td className="px-4 font-sans font-bold text-[var(--color-text-primary)]">
                          {u.name}
                          <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] block font-normal">
                            {u.email}
                          </span>
                        </td>

                        {/* Papel */}
                        <td className="px-4 font-sans">
                          {u.role === 'admin' || u.role === 'super_admin' ? (
                            <Badge variant="success">Administrador</Badge>
                          ) : u.role === 'seller' || u.sellerStatus === 'active' ? (
                            <Badge variant="hype">Colecionador / Leiloeiro</Badge>
                          ) : u.role === 'affiliate' ? (
                            <Badge variant="outline" className="border-blue-500 text-blue-400">Afiliado</Badge>
                          ) : (
                            <Badge variant="outline">Comprador</Badge>
                          )}
                          {hasPendingCollector && (
                            <span className="text-[10px] font-mono text-amber-400 block mt-1">⚠️ Cadastro em análise</span>
                          )}
                        </td>

                        {/* Questionário */}
                        <td className="px-4 font-sans text-xs">
                          {collectorOnb ? (
                            <div className="flex flex-col text-[11px] gap-0.5">
                              <span className="font-semibold text-[var(--color-text-primary)]">Coleção: {collectorOnb.focus || 'N/I'}</span>
                              <span className="text-[var(--color-text-tertiary)]">Tamanho: ~{collectorOnb.collectionSize} itens</span>
                            </div>
                          ) : affiliateOnb ? (
                            <div className="flex flex-col text-[11px] gap-0.5">
                              <span className="font-semibold text-[var(--color-text-primary)]">Rede: {affiliateOnb.socialLink}</span>
                              <span className="text-[var(--color-text-tertiary)]">Público: {affiliateOnb.audience}</span>
                            </div>
                          ) : (
                            <span className="text-[var(--color-text-tertiary)] italic">Cadastro direto de Comprador</span>
                          )}
                        </td>

                        {/* Foto Coleção + Rosto */}
                        <td className="px-4">
                          {facePhoto ? (
                            <PhotoPreviewModal photoBase64={facePhoto} title={`Coleção de ${u.name}`} />
                          ) : (
                            <span className="text-[10px] text-[var(--color-text-tertiary)] italic">Sem foto</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="px-4 text-right">
                          <UserApprovalActions
                            userId={u.id}
                            role={u.role}
                            hasPendingCollector={!!hasPendingCollector}
                            hasPendingAffiliate={!!hasPendingAffiliate}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
