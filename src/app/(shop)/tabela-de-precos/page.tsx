import { Metadata } from 'next';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { getPriceTableData } from '@/server/queries/price-table';
import { PriceTableBoard } from '@/components/price-table/price-table-board';

export const metadata: Metadata = {
  title: 'Tabela Geral de Preços | Espaço Geek 86',
  description: 'Tabela dinâmica e contínua de preços para todos os jogos, consoles e acessórios em ordem alfabética com indicadores de decisão do consumidor.',
};

export const dynamic = 'force-dynamic';

export default async function TabelaDePrecosPage() {
  const { items, totalCount } = await getPriceTableData({ limit: 100 });

  return (
    <div className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16 flex flex-col gap-8">
      <Reveal>
        <div className="flex flex-col gap-2 max-w-3xl">
          <Text variant="label" color="tertiary" className="uppercase tracking-widest">
            Monitoramento Abrangente
          </Text>
          <Text as="h1" variant="display-lg">
            Tabela Geral de Preços
          </Text>
          <Text variant="body-md" color="secondary" className="mt-1">
            Explore todo o catálogo monitorado em ordem alfabética. Filtre por área (Jogos, Consoles e Acessórios) e compare cotações, médias históricas e os principais indicadores para sua decisão de compra.
          </Text>
        </div>
      </Reveal>

      <PriceTableBoard initialItems={items} initialTotalCount={totalCount} />
    </div>
  );
}
