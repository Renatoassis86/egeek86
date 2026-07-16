import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldGroupTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { listNetworks } from '@/server/queries/affiliate';
import { createAffiliateOffer } from '@/server/actions/affiliate';

export default async function NewOfferPage() {
  const networks = await listNetworks();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Button asChild variant="ghost" size="sm" className="w-fit -ml-2 text-[var(--color-text-secondary)]">
          <Link href="/admin/ofertas">
            <ArrowLeft className="size-4" />
            Ofertas
          </Link>
        </Button>
        <Text as="h1" variant="heading-xl">
          Nova oferta
        </Text>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="p-4 sm:p-6">
          <form action={createAffiliateOffer} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <FieldGroupTitle>Produto</FieldGroupTitle>
              <Field label="Nome do produto (catálogo canônico)" htmlFor="productName" required>
                <Input id="productName" name="productName" placeholder="Funko Pop Naruto #71" required />
              </Field>
              <Field label="Título da oferta" htmlFor="title" required>
                <Input id="title" name="title" placeholder="Funko Pop Naruto #71 (Amazon)" required />
              </Field>
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              <FieldGroupTitle>Rede e link de afiliado</FieldGroupTitle>
              <Field label="Rede de afiliado" htmlFor="networkId" required>
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
              <Field label="Link de afiliado" htmlFor="affiliateUrl" required>
                <Input id="affiliateUrl" name="affiliateUrl" type="url" placeholder="https://..." required />
              </Field>
              <Field
                label="ID de catálogo (Mercado Livre, opcional)"
                htmlFor="externalRef"
                hint="Necessário pro rastreamento automático de preço e pra classificação (físico/digital, geração do Switch, tipo de edição)."
              >
                <Input id="externalRef" name="externalRef" placeholder="MLB50667133" />
              </Field>
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              <FieldGroupTitle>Preço</FieldGroupTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Preço atual (R$)" htmlFor="priceReais" required>
                  <Input id="priceReais" name="priceReais" placeholder="199.90" required />
                </Field>
                <Field label={'Preço "de" (opcional)'} htmlFor="listPriceReais">
                  <Input id="listPriceReais" name="listPriceReais" placeholder="249.90" />
                </Field>
              </div>
              <Field label="Cupom aplicado neste preço (opcional)" htmlFor="couponCode">
                <Input id="couponCode" name="couponCode" placeholder="GEEK10" />
              </Field>
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              <FieldGroupTitle>Apresentação</FieldGroupTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Imagem (URL, opcional)" htmlFor="imageUrl">
                  <Input id="imageUrl" name="imageUrl" type="url" placeholder="https://..." />
                </Field>
                <Field label="Loja (opcional)" htmlFor="storeName">
                  <Input id="storeName" name="storeName" placeholder="Loja Oficial Kabum" />
                </Field>
              </div>
              <Field label="Nota de destaque (opcional)" htmlFor="highlightNote">
                <Input id="highlightNote" name="highlightNote" placeholder="Menor preço em 3 meses!" />
              </Field>
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              <FieldGroupTitle>Publicação</FieldGroupTitle>
              <Field label="Status" htmlFor="status">
                <Select name="status" defaultValue="active">
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativa (aparece na vitrine)</SelectItem>
                    <SelectItem value="draft">Rascunho</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Button type="submit" size="lg" fullWidth className="sm:w-fit">
              Criar oferta
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
