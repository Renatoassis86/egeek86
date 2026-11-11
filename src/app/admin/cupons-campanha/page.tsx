import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { requireAdmin } from '@/lib/auth/require-admin';
import { CampaignCouponForm } from '@/components/admin/campaign-coupon-form';
import { listCampaignCoupons } from '@/server/coupons/campaign-store';
import { describeRule, isCampaignUsable } from '@/server/coupons/campaign';
import { encerrarCupomCampanha, confirmarCupomCampanha } from '@/server/actions/campaign-coupons';

// Dado ao vivo, sem searchParams — força dinâmica (ver nota em src/app/admin/page.tsx).
export const dynamic = 'force-dynamic';

const NET: Record<string, string> = { 'mercado-livre': 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon' };
const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function CampanhasPage() {
  await requireAdmin();
  const now = new Date();
  const items = await listCampaignCoupons();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Text as="h1" variant="heading-xl">
          Códigos de campanha
        </Text>
        <Text variant="body-sm" color="secondary">
          Códigos que você viu e quer divulgar (ex.: TODOSITE1111). Só entram nas mensagens com validade futura e fonte. A confirmação vale 24 h: depois disso o
          código sai das mensagens até você confirmar de novo.
        </Text>
      </div>

      <Card className="max-w-3xl">
        <CardContent className="p-4 sm:p-6">
          <CampaignCouponForm />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Text as="h2" variant="heading-md">
          Cadastrados
        </Text>
        {items.length === 0 && (
          <Text variant="body-sm" color="secondary">
            Nenhum código cadastrado ainda (ou as migrações 0029/0035 ainda não foram aplicadas).
          </Text>
        )}
        {items.map((c) => {
          const expired = !!c.validUntil && Date.parse(c.validUntil) <= now.getTime();
          const active = c.state === 'verificado' && !expired;
          const inMessages = isCampaignUsable(c, now);
          const scopeValue = c.scope.categorias?.[0] ?? c.scope.vendedores?.[0] ?? null;
          const kind = c.kind === 'percentual' || c.kind === 'valor_fixo' || c.kind === 'frete' ? c.kind : 'valor_fixo';
          const rule = describeRule(
            {
              kind, valueNum: c.valueNum, valueUnit: c.valueUnit, minOrderCents: c.minOrderCents, maxDiscountCents: c.maxDiscountCents,
              scopeKind: c.scopeKind === 'categoria' ? 'categoria' : c.scopeKind === 'lista_itens' ? 'lista_itens' : 'loja_inteira', scopeValue,
            },
            NET[c.network] ?? c.network
          );
          return (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text variant="body-md" className="font-mono">
                      {c.code}
                    </Text>
                    <Badge variant={active ? 'primary' : 'danger'} size="sm">
                      {active ? 'ativo' : expired ? 'vencido' : 'encerrado'}
                    </Badge>
                    {active && (
                      <Badge variant={inMessages ? 'primary' : 'outline'} size="sm">
                        {inMessages ? 'nas mensagens' : 'fora das mensagens: confirme de novo'}
                      </Badge>
                    )}
                  </div>
                  <Text variant="caption" color="tertiary" className="mt-0.5">
                    {NET[c.network] ?? c.network} · {rule}
                  </Text>
                  <Text variant="caption" color="tertiary">
                    {c.validUntil ? `válido até ${fmt(c.validUntil)}` : 'sem validade'}
                    {c.verifiedAt ? ` · confirmado em ${fmt(c.verifiedAt)}` : ''} ·{' '}
                    <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      fonte
                    </a>
                  </Text>
                </div>
                {active && (
                  <div className="flex gap-2">
                    <form action={confirmarCupomCampanha}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Confirmar de novo
                      </Button>
                    </form>
                    <form action={encerrarCupomCampanha}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Encerrar
                      </Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export const metadata = { title: 'Admin: Códigos de campanha' };
