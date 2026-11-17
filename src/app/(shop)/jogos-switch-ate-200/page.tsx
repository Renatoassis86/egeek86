import type { Metadata } from 'next';
import Link from 'next/link';
import { Text } from '@/components/ui/text';
import { OfferCard } from '@/components/affiliate/offer-card';
import { listRankedOffers, getOfferListingMetrics } from '@/server/queries/affiliate';
import { POR_PAGINA_SWITCH, contarPorGeracao, filtrarSwitchAte200, geracaoValida, paginaValida } from '@/lib/switch-ate-200';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Jogos de Nintendo Switch 1 e 2 até R$ 200',
  description: 'Jogos novos de Nintendo Switch e Switch 2 com preço até R$ 200, do menor para o maior, com a data da última conferência de cada preço.',
};

type SP = { [key: string]: string | string[] | undefined };
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function JogosSwitchAte200({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const geracao = geracaoValida(um(sp.g));
  // Mesma lista pública das demais telas (produto novo, porteiro, sem quarentena); o recorte de preço e de geração é feito aqui.
  const todas = await listRankedOffers({ productType: 'game', gamePlatformGen: ['switch_1', 'switch_2'], sortBy: 'price_asc', limit: 2000 });
  const contagem = contarPorGeracao(todas);
  const lista = filtrarSwitchAte200(todas, geracao);
  const pagina = paginaValida(um(sp.p), lista.length);
  const visiveis = lista.slice((pagina - 1) * POR_PAGINA_SWITCH, pagina * POR_PAGINA_SWITCH);
  const metricsMap = visiveis.length ? await getOfferListingMetrics(visiveis.map((o) => o.id)) : new Map();
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA_SWITCH));

  const href = (g: string | null, p = 1) => {
    const q = new URLSearchParams();
    if (g) q.set('g', g);
    if (p > 1) q.set('p', String(p));
    const s = q.toString();
    return `/jogos-switch-ate-200${s ? `?${s}` : ''}`;
  };
  const chip = (rotulo: string, g: string | null, n: number) => (
    <Link
      key={rotulo}
      href={href(g)}
      aria-current={geracao === g ? 'page' : undefined}
      className={`inline-flex items-center gap-2 border px-3 py-1.5 text-sm font-semibold ${geracao === g ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)] text-[var(--color-bg-base)]' : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
    >
      {rotulo} <span className="tabular-nums opacity-80">{n}</span>
    </Link>
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Text variant="caption" color="tertiary">Nintendo Switch e Switch 2</Text>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-3xl">Jogos de Switch até R$ 200</h1>
        <Text variant="body-sm" color="secondary" className="max-w-prose">
          Jogos novos de Nintendo Switch 1 e Switch 2 com preço de até R$ 200, do menor para o maior. Cada cartão mostra quando o preço foi conferido pela última vez; o preço pode mudar na loja.
        </Text>
      </header>

      <nav aria-label="Geração" className="flex flex-wrap gap-2">
        {chip('Todos', null, contagem.total)}
        {chip('Switch 1', 'switch_1', contagem.switch_1)}
        {chip('Switch 2', 'switch_2', contagem.switch_2)}
      </nav>

      {visiveis.length === 0 ? (
        <Text variant="body-sm" color="secondary">Nenhum jogo nesta faixa agora. Volte em instantes: a lista é atualizada a cada coleta.</Text>
      ) : (
        <>
          <ul className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {visiveis.map((o) => (
              <li key={o.id} className="min-w-0">
                <OfferCard offer={o} metrics={metricsMap.get(o.id)} />
              </li>
            ))}
          </ul>
          {totalPaginas > 1 && (
            <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
              {pagina > 1 ? <Link href={href(geracao, pagina - 1)} className="font-semibold underline">Anterior</Link> : <span />}
              <Text variant="caption" color="tertiary">Página {pagina} de {totalPaginas}</Text>
              {pagina < totalPaginas ? <Link href={href(geracao, pagina + 1)} className="font-semibold underline">Próxima</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
