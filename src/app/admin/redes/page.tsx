import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { listNetworks } from '@/server/queries/affiliate';
import { createNetwork, toggleNetworkActive } from '@/server/actions/affiliate';

export default async function AdminNetworksPage() {
  const networks = await listNetworks();

  return (
    <div className="flex flex-col gap-6">
      <Text as="h1" variant="heading-xl">
        Redes de afiliado
      </Text>

      <Card>
        <CardContent className="p-5">
          <Text variant="heading-sm" className="mb-4">
            Nova rede
          </Text>
          <form action={createNetwork} className="grid gap-3 sm:grid-cols-2">
            <Input name="name" placeholder="Nome (ex: Amazon)" required />
            <Input name="websiteUrl" placeholder="https://amazon.com.br" type="url" />
            <Input name="colorHex" placeholder="#FF9900 (cor do badge)" />
            <Input name="trackingNote" placeholder="Nota de tracking (ex: usar ?tag=...)" />
            <Button type="submit" className="sm:col-span-2 sm:w-fit">
              Adicionar rede
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {networks.length === 0 && (
          <Text variant="body-sm" color="secondary">
            Nenhuma rede cadastrada ainda.
          </Text>
        )}
        {networks.map((network) => (
          <Card key={network.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: network.colorHex ?? 'var(--color-text-tertiary)' }}
                  aria-hidden
                />
                <div>
                  <Text variant="body-md">{network.name}</Text>
                  <Text variant="caption" color="tertiary">
                    {network.slug}
                  </Text>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={network.isActive ? 'primary' : 'outline'}>
                  {network.isActive ? 'Ativa' : 'Inativa'}
                </Badge>
                <form action={toggleNetworkActive}>
                  <input type="hidden" name="id" value={network.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {network.isActive ? 'Desativar' : 'Ativar'}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
