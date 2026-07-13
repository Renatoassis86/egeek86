import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatDiscountLabel } from '@/lib/format';
import { listCouponsForAdmin, listNetworks } from '@/server/queries/affiliate';
import { updateCouponStatus } from '@/server/actions/affiliate';

const statusVariant = {
  active: 'primary',
  paused: 'outline',
  expired: 'danger',
  used_up: 'default',
} as const;

export default async function AdminCouponsPage() {
  const [coupons, networks] = await Promise.all([listCouponsForAdmin(), listNetworks()]);
  const networkNameById = new Map(networks.map((n) => [n.id, n.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Text as="h1" variant="heading-xl">
          Cupons
        </Text>
        <Button asChild>
          <Link href="/admin/cupons/novo">Novo cupom</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {coupons.length === 0 && (
          <Text variant="body-sm" color="secondary">
            Nenhum cupom cadastrado ainda.
          </Text>
        )}
        {coupons.map((coupon) => (
          <Card key={coupon.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <Text variant="body-md" className="font-mono">
                    {coupon.code}
                  </Text>
                  <Badge variant={statusVariant[coupon.status]} size="sm">
                    {coupon.status}
                  </Badge>
                </div>
                <Text variant="caption" color="tertiary" className="mt-0.5">
                  {networkNameById.get(coupon.networkId) ?? 'Rede'} ·{' '}
                  {formatDiscountLabel(coupon.discountType, coupon.discountValue)}
                  {coupon.validUntil && ` · válido até ${coupon.validUntil.toLocaleDateString('pt-BR')}`}
                </Text>
              </div>
              <div className="flex gap-2">
                {coupon.status === 'active' ? (
                  <form action={updateCouponStatus}>
                    <input type="hidden" name="id" value={coupon.id} />
                    <input type="hidden" name="status" value="paused" />
                    <Button type="submit" variant="secondary" size="sm">
                      Pausar
                    </Button>
                  </form>
                ) : (
                  <form action={updateCouponStatus}>
                    <input type="hidden" name="id" value={coupon.id} />
                    <input type="hidden" name="status" value="active" />
                    <Button type="submit" variant="secondary" size="sm">
                      Ativar
                    </Button>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
