import { Text } from '@/components/ui/text';
import { getTopMovers, type MoverPeriod, type MoverDirection } from '@/server/queries/price-history';
import { TopMoversTable } from '@/components/monitoring/top-movers-table';

export const metadata = { title: 'Altas e baixas' };

const VALID_PERIODS: MoverPeriod[] = ['24h', '7d', '30d'];
const VALID_DIRECTIONS: MoverDirection[] = ['up', 'down'];

/**
 * Ranking de maiores variações de preço, público (não personalizado — mesma
 * postura de acesso de /ofertas, sem gate de login).
 */
export default async function AltasEBaixasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; direcao?: string }>;
}) {
  const { periodo, direcao } = await searchParams;
  const period: MoverPeriod = VALID_PERIODS.includes(periodo as MoverPeriod) ? (periodo as MoverPeriod) : '24h';
  const direction: MoverDirection = VALID_DIRECTIONS.includes(direcao as MoverDirection)
    ? (direcao as MoverDirection)
    : 'down';

  const items = await getTopMovers({ period, direction, limit: 30 });

  return (
    <section className="mx-auto max-w-5xl px-4 lg:px-8 py-10 lg:py-14">
      <div className="mb-8">
        <Text as="h1" variant="heading-xl">
          Altas e baixas
        </Text>
        <Text variant="body-md" color="secondary" className="mt-1">
          Os jogos com a maior variação de preço no período, em todo o catálogo monitorado.
        </Text>
      </div>

      <TopMoversTable items={items} period={period} direction={direction} />
    </section>
  );
}
