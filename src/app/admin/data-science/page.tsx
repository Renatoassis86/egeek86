import { Database, Layers, Package, Tags, Clock3, CheckCircle2, Hourglass } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { getAdminCatalogMetrics } from '@/server/queries/admin-metrics';
import { requireAdmin } from '@/lib/auth/require-admin';

export const metadata = { title: 'Admin: Ciência de dados' };
export const dynamic = 'force-dynamic';

// Estado dos métodos conforme o código existente no repositório. Nenhuma taxa
// de acurácia é exibida: não há avaliação de modelo registrada para citar.
const IMPLEMENTED = [
  {
    name: 'Veredito de preço',
    description:
      'Compara o menor preço ativo do produto com a média única de todas as cotações de todas as lojas. Só exibe veredito com pelo menos 5 cotações e 14 dias de histórico.',
    source: 'src/lib/affiliate/price-verdict.ts',
  },
  {
    name: 'Classificador de tipo de produto',
    description: 'Separa jogos de acessórios e outros itens a partir do título, antes do cadastro no catálogo.',
    source: 'src/lib/affiliate/product-type-classifier.ts',
  },
];

const PLANNED = [
  'Previsão de preço futuro (séries temporais)',
  'Preço de abertura sugerido para leilões',
  'Análise de sentimento em redes sociais (sem fonte de dados definida)',
];

export default async function AdminDataSciencePage() {
  await requireAdmin();
  const catalog = await getAdminCatalogMetrics();

  const kpis = [
    { label: 'Cotações registradas', value: catalog.priceSnapshots.toLocaleString('pt-BR'), Icon: Database },
    { label: 'Cotações nas últimas 24 h', value: catalog.snapshotsLast24h.toLocaleString('pt-BR'), Icon: Clock3 },
    { label: 'Ofertas ativas', value: catalog.activeOffers.toLocaleString('pt-BR'), Icon: Tags },
    { label: 'Produtos no catálogo', value: catalog.masterProducts.toLocaleString('pt-BR'), Icon: Package },
  ];

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div>
        <Text as="h1" variant="heading-xl">
          Ciência de dados
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1 max-w-[70ch]">
          Base disponível para análise e estado dos métodos. Os números abaixo vêm do banco; o que não existe ainda
          está marcado como planejado.
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, Icon }) => (
          <Card key={label} variant="elevated">
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-[var(--color-text-tertiary)]">
                <Text variant="label">{label}</Text>
                <Icon className="size-4" aria-hidden />
              </div>
              <Text variant="heading-lg" className="tabular mt-2 font-bold">
                {value}
              </Text>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <Text variant="heading-lg" className="flex items-center gap-2 font-bold">
          <Layers className="size-5 text-[var(--color-accent-gold)]" aria-hidden />
          Métodos implementados
        </Text>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {IMPLEMENTED.map((m) => (
            <Card key={m.name}>
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <Text variant="body-md" className="font-bold">
                    {m.name}
                  </Text>
                  <Badge variant="primary" size="sm" className="shrink-0">
                    <CheckCircle2 className="mr-1 size-3" aria-hidden /> Implementado
                  </Badge>
                </div>
                <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
                  {m.description}
                </Text>
                <Text variant="caption" color="tertiary" className="font-mono text-[10px]">
                  {m.source}
                </Text>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Text variant="heading-lg" className="flex items-center gap-2 font-bold">
          <Hourglass className="size-5 text-[var(--color-text-tertiary)]" aria-hidden />
          Planejado, ainda não implementado
        </Text>
        <Card>
          <CardContent className="p-5">
            <ul className="flex flex-col gap-2">
              {PLANNED.map((item) => (
                <li key={item} className="flex items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
                  <span>{item}</span>
                  <Badge variant="outline" size="sm">Planejado</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
