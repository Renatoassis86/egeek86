import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { WhatsappMessageDrawer } from '@/components/affiliate/whatsapp-message-drawer';
import { formatBRL } from '@/lib/format';
import { getOfferByIdForAdmin, getOfferMetrics, listActiveCouponsByNetwork } from '@/server/queries/affiliate';
import {
  logNewPrice,
  updateOfferStatus,
  reclassifyMasterProduct,
  correctGameEditionType,
} from '@/server/actions/affiliate';

const STATUS_OPTIONS = ['draft', 'active', 'paused', 'expired', 'archived'] as const;
const EDITION_TYPE_OPTIONS = ['full_game', 'upgrade_pack', 'dlc', 'bundle', 'unknown'] as const;

export default async function AdminOfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await getOfferByIdForAdmin(id);
  if (!offer) notFound();

  const [metrics, coupons] = await Promise.all([
    getOfferMetrics(id),
    listActiveCouponsByNetwork(offer.networkId),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const shortLink = `${appUrl}/go/${offer.slug}`;
  const coupon = coupons[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="heading-xl">
          {offer.title}
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          {offer.network.name} · {offer.masterProduct.name}
        </Text>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <Text variant="caption" color="tertiary">
              Preço atual
            </Text>
            <Text variant="mono-lg" className="tabular">
              {formatBRL(offer.currentPriceCents)}
            </Text>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Text variant="caption" color="tertiary">
              Menor histórico
            </Text>
            <Text variant="mono-lg" className="tabular">
              {metrics ? formatBRL(metrics.lowestPriceCents) : '—'}
            </Text>
            {metrics && (
              <Text variant="caption" color="tertiary">
                em {metrics.lowestPriceAt.toLocaleDateString('pt-BR')}
              </Text>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Text variant="caption" color="tertiary">
              Tendência ({metrics?.snapshotCount ?? 0} registros)
            </Text>
            <Text variant="mono-lg" className="tabular">
              {metrics?.trend === 'down' ? '📉 Caindo' : metrics?.trend === 'up' ? '📈 Subindo' : '➖ Estável'}
            </Text>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <Text variant="body-sm" color="secondary">
            Status:
          </Text>
          {STATUS_OPTIONS.map((status) => (
            <form action={updateOfferStatus} key={status}>
              <input type="hidden" name="id" value={offer.id} />
              <input type="hidden" name="status" value={status} />
              <Button type="submit" size="sm" variant={offer.status === status ? 'primary' : 'secondary'}>
                {status}
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <Text variant="heading-sm" className="mb-4">
            Registrar novo preço
          </Text>
          <form action={logNewPrice} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="offerId" value={offer.id} />
            <Input name="priceReais" placeholder="Preço atual (R$)" required />
            <Input name="listPriceReais" placeholder="Preço 'de' (opcional)" />
            <Input name="couponCode" placeholder="Cupom usado (opcional)" />
            <Button type="submit" className="sm:col-span-3 sm:w-fit">
              Registrar preço
            </Button>
          </form>
        </CardContent>
      </Card>

      {offer.masterProduct.meliCatalogId && (
        <Card>
          <CardContent className="p-5">
            <Text variant="heading-sm" className="mb-4">
              Classificação do jogo
            </Text>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline">Formato: {offer.masterProduct.gameFormat}</Badge>
              <Badge variant="outline">Geração: {offer.masterProduct.gamePlatformGen}</Badge>
              <Badge variant="outline">Tipo: {offer.masterProduct.gameEditionType}</Badge>
              {offer.masterProduct.gameEditionSource && (
                <Badge variant={offer.masterProduct.gameEditionSource === 'manual' ? 'primary' : 'default'}>
                  fonte: {offer.masterProduct.gameEditionSource}
                </Badge>
              )}
              {offer.masterProduct.gameCollection && <Badge variant="default">{offer.masterProduct.gameCollection}</Badge>}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <form action={reclassifyMasterProduct}>
                <input type="hidden" name="masterProductId" value={offer.masterProduct.id} />
                <input type="hidden" name="offerId" value={offer.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Reclassificar via API
                </Button>
              </form>

              <form action={correctGameEditionType} className="flex items-end gap-2">
                <input type="hidden" name="masterProductId" value={offer.masterProduct.id} />
                <input type="hidden" name="offerId" value={offer.id} />
                <div>
                  <label className="text-caption text-[var(--color-text-tertiary)] mb-1 block" htmlFor="gameEditionType">
                    Corrigir tipo de edição
                  </label>
                  <select
                    id="gameEditionType"
                    name="gameEditionType"
                    defaultValue={offer.masterProduct.gameEditionType}
                    className="flex h-9 rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)] border border-[var(--color-border-default)] px-3 text-body-sm text-[var(--color-text-primary)]"
                  >
                    {EDITION_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="secondary" size="sm">
                  Salvar correção
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      {offer.seller && (
        <Card>
          <CardContent className="p-5">
            <Text variant="heading-sm" className="mb-2">
              Vendedor atual (buy-box)
            </Text>
            <Text variant="body-sm">{offer.seller.nickname ?? '—'}</Text>
            <Text variant="caption" color="tertiary">
              {offer.seller.reputationLevel ?? 'sem nível'}
              {offer.seller.powerSellerStatus && ` · ${offer.seller.powerSellerStatus}`}
              {offer.seller.totalSales != null && ` · ${offer.seller.totalSales.toLocaleString('pt-BR')} vendas`}
              {offer.seller.positiveRatingPercent && ` · ${offer.seller.positiveRatingPercent}% avaliações positivas`}
            </Text>
          </CardContent>
        </Card>
      )}

      <div>
        <WhatsappMessageDrawer
          offerId={offer.id}
          title={offer.title}
          networkName={offer.network.name}
          currentPriceCents={offer.currentPriceCents}
          lowestPriceCents={metrics?.lowestPriceCents ?? offer.currentPriceCents}
          lowestPriceAt={metrics?.lowestPriceAt ?? offer.createdAt}
          coupon={
            coupon
              ? { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue }
              : null
          }
          shortLink={shortLink}
        />
      </div>

      <Card>
        <CardContent className="p-5">
          <Text variant="caption" color="tertiary" className="block mb-1">
            Link de afiliado (não exposto publicamente)
          </Text>
          <Text variant="body-sm" className="break-all">
            {offer.affiliateUrl}
          </Text>
          <Badge variant="outline" className="mt-2">
            Link de rastreio público: {shortLink}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
