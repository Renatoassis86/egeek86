import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { ProductImage } from '@/components/ui/product-image';
import { VerificadoHa } from '@/components/affiliate/verificado-ha';
import { formatBRL } from '@/lib/format';
import { linhaIdentidade, rotuloMediana, type TipoCartao } from '@/lib/catalog/departamentos';
import type { CartaoDepartamento } from '@/server/queries/departamento';

/** Linha de identidade: só aparece se o master TEM o dado (nada estimado). */
export function LinhaIdentidadeView({ tipo, master }: { tipo: TipoCartao; master: CartaoDepartamento }) {
  const linhas = linhaIdentidade(tipo, master);
  if (!linhas.length) return null;
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1">
      {linhas.map((l) => (
        <div key={l.rotulo} className="flex gap-1.5 text-[12px]">
          <dt className="text-[var(--color-text-tertiary)]">{l.rotulo}</dt>
          <dd className="font-mono text-[var(--color-text-secondary)]">{l.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Bloco de preço sem selo, sem "de/por", sem percentual e sem histórico. */
export function PrecoDepartamentoView({ master }: { master: CartaoDepartamento }) {
  const mediana = rotuloMediana(master.vendedoresMl);
  return (
    <div className="flex flex-col gap-1">
      <Text variant="label" color="tertiary">Menor preço agora</Text>
      <Text variant="mono-lg" className="font-black text-[var(--color-accent-primary)]">{formatBRL(master.menorCents)}</Text>
      <Text variant="caption" color="tertiary">
        {master.lojaMenor ? `em ${master.lojaMenor} · ` : ''}
        {master.vendedores} {master.vendedores === 1 ? 'vendedor' : 'vendedores'} · <VerificadoHa iso={master.verificadoEm} />
      </Text>
      {mediana && master.medianaCents !== null ? (
        <Text variant="caption" color="secondary">
          {mediana}: {formatBRL(master.medianaCents)}
        </Text>
      ) : null}
    </div>
  );
}

export function CartaoDepartamentoView({ vertical, tipo, master, priority = false }: { vertical: string; tipo: TipoCartao; master: CartaoDepartamento; priority?: boolean }) {
  return (
    <Card interactive className="flex h-full flex-col overflow-hidden">
      <Link href={`/mercado/${vertical}/${master.slug}`} className="flex h-full flex-col gap-3 p-4 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]">
        <ProductImage src={master.imagem} alt={master.nome} ratio="square" priority={priority} className="w-full" />
        <Text as="h2" variant="heading-sm" className="line-clamp-3 font-bold leading-snug">{master.nome}</Text>
        <LinhaIdentidadeView tipo={tipo} master={master} />
        <div className="mt-auto pt-2">
          <PrecoDepartamentoView master={master} />
        </div>
      </Link>
    </Card>
  );
}
