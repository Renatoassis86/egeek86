import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { listNetworks } from '@/server/queries/affiliate';
import { createCoupon } from '@/server/actions/affiliate';

// Sem searchParams — força dinâmica (ver nota em src/app/admin/page.tsx).
export const dynamic = 'force-dynamic';

export default async function NewCouponPage() {
  const networks = await listNetworks();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Button asChild variant="ghost" size="sm" className="w-fit -ml-2 text-[var(--color-text-secondary)]">
          <Link href="/admin/cupons">
            <ArrowLeft className="size-4" />
            Cupons
          </Link>
        </Button>
        <Text as="h1" variant="heading-xl">
          Novo cupom
        </Text>
      </div>

      <Card className="max-w-xl">
        <CardContent className="p-4 sm:p-6">
          <form action={createCoupon} className="flex flex-col gap-4">
            <Field label="Rede" htmlFor="networkId" required>
              <Select name="networkId" required>
                <SelectTrigger id="networkId">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {networks.map((network) => (
                    <SelectItem key={network.id} value={network.id}>
                      {network.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Código do cupom" htmlFor="code" required>
              <Input id="code" name="code" placeholder="GEEK10" required />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo de desconto" htmlFor="discountType" required>
                <Select name="discountType" defaultValue="percentage" required>
                  <SelectTrigger id="discountType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">% (percentual)</SelectItem>
                    <SelectItem value="fixed">R$ (fixo)</SelectItem>
                    <SelectItem value="free_shipping">Frete grátis</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Valor" htmlFor="discountValue" required>
                <Input id="discountValue" name="discountValue" placeholder="10" required />
              </Field>
            </div>

            <Field label="Válido até (opcional)" htmlFor="validUntil">
              <Input id="validUntil" name="validUntil" type="date" />
            </Field>

            <Field label="Descrição (opcional)" htmlFor="description">
              <Input id="description" name="description" placeholder="10% off em toda a loja" />
            </Field>

            <Button type="submit" size="lg" fullWidth className="sm:w-fit">
              Criar cupom
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
