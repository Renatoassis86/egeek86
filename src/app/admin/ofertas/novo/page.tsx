import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { listNetworks } from '@/server/queries/affiliate';
import { createAffiliateOffer } from '@/server/actions/affiliate';

export default async function NewOfferPage() {
  const networks = await listNetworks();

  return (
    <div className="flex flex-col gap-6">
      <Text as="h1" variant="heading-xl">
        Nova oferta
      </Text>

      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <form action={createAffiliateOffer} className="flex flex-col gap-4">
            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="productName">
                Nome do produto (catálogo canônico)
              </label>
              <Input id="productName" name="productName" placeholder="Funko Pop Naruto #71" required />
            </div>

            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="title">
                Título da oferta
              </label>
              <Input id="title" name="title" placeholder="Funko Pop Naruto #71 — Amazon" required />
            </div>

            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="networkId">
                Rede de afiliado
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
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="affiliateUrl">
                Link de afiliado
              </label>
              <Input id="affiliateUrl" name="affiliateUrl" type="url" placeholder="https://..." required />
            </div>

            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="externalRef">
                ID de catálogo (Mercado Livre, opcional)
              </label>
              <Input id="externalRef" name="externalRef" placeholder="MLB50667133" />
              <p className="text-caption text-[var(--color-text-tertiary)] mt-1">
                Necessário pro rastreamento automático de preço e pra classificação (físico/digital, geração do
                Switch, tipo de edição).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="priceReais">
                  Preço atual (R$)
                </label>
                <Input id="priceReais" name="priceReais" placeholder="199.90" required />
              </div>
              <div>
                <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="listPriceReais">
                  Preço "de" (opcional)
                </label>
                <Input id="listPriceReais" name="listPriceReais" placeholder="249.90" />
              </div>
            </div>

            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="couponCode">
                Cupom aplicado neste preço (opcional)
              </label>
              <Input id="couponCode" name="couponCode" placeholder="GEEK10" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="imageUrl">
                  Imagem (URL, opcional)
                </label>
                <Input id="imageUrl" name="imageUrl" type="url" placeholder="https://..." />
              </div>
              <div>
                <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="storeName">
                  Loja (opcional)
                </label>
                <Input id="storeName" name="storeName" placeholder="Loja Oficial Kabum" />
              </div>
            </div>

            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="highlightNote">
                Nota de destaque (opcional)
              </label>
              <Input id="highlightNote" name="highlightNote" placeholder="Menor preço em 3 meses!" />
            </div>

            <div>
              <label className="text-body-sm text-[var(--color-text-secondary)] mb-1 block" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue="active"
                className="flex h-11 w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)] border border-[var(--color-border-default)] px-4 text-[15px] text-[var(--color-text-primary)]"
              >
                <option value="active">Ativa (aparece na vitrine)</option>
                <option value="draft">Rascunho</option>
              </select>
            </div>

            <Button type="submit" className="w-fit">
              Criar oferta
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
