import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { listNetworks } from '@/server/queries/affiliate';
import { createCoupon } from '@/server/actions/affiliate';

export default async function NewCouponPage() {
  const networks = await listNetworks();

  return (
    <div className="flex flex-col gap-6">
      <Text as="h1" variant="heading-xl">
        Novo cupom
      </Text>

      <Card className="max-w-xl">
        <CardContent className="p-6">
          <form action={createCoupon} className="flex flex-col gap-4">
            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="networkId">
                Rede
              </label>
              <select
                id="networkId"
                name="networkId"
                required
                className="flex h-11 w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)] border border-[var(--color-border-default)] px-4 text-[15px] text-[var(--color-text-primary)]"
              >
                <option value="">Selecione...</option>
                {networks.map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="code">
                Código do cupom
              </label>
              <Input id="code" name="code" placeholder="GEEK10" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="discountType">
                  Tipo de desconto
                </label>
                <select
                  id="discountType"
                  name="discountType"
                  required
                  className="flex h-11 w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)] border border-[var(--color-border-default)] px-4 text-[15px] text-[var(--color-text-primary)]"
                >
                  <option value="percentage">% (percentual)</option>
                  <option value="fixed">R$ (fixo)</option>
                  <option value="free_shipping">Frete grátis</option>
                </select>
              </div>
              <div>
                <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="discountValue">
                  Valor
                </label>
                <Input id="discountValue" name="discountValue" placeholder="10" required />
              </div>
            </div>

            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="validUntil">
                Válido até (opcional)
              </label>
              <Input id="validUntil" name="validUntil" type="date" />
            </div>

            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="description">
                Descrição (opcional)
              </label>
              <Input id="description" name="description" placeholder="10% off em toda a loja" />
            </div>

            <Button type="submit" className="w-fit">
              Criar cupom
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
