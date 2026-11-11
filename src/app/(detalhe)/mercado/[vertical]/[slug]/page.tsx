import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { ProductImage } from '@/components/ui/product-image';
import { VerificadoHa } from '@/components/affiliate/verificado-ha';
import { CommissionNotice } from '@/components/legal/commission-notice';
import { LinhaIdentidadeView, PrecoDepartamentoView } from '@/components/mercado/cartao-departamento';
import { exigirDepartamento } from '@/server/departamentos-rotas';
import { detalheDepartamento } from '@/server/queries/departamento';
import { formatBRL } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Produto', robots: { index: false, follow: false } };

export default async function ProdutoDepartamentoPage({ params }: { params: Promise<{ vertical: string; slug: string }> }) {
  const { vertical, slug } = await params;
  const dept = await exigirDepartamento(vertical);
  const d = await detalheDepartamento(dept.slug, slug);
  if (!d) notFound();
  const { master } = d;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-8 lg:py-12">
      <Link href={`/mercado/${dept.slug}`} className="mb-6 inline-flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
        <ArrowLeft className="size-4" aria-hidden /> {dept.rotulo}
      </Link>

      <div className="grid gap-8 md:grid-cols-[minmax(0,320px)_1fr]">
        <ProductImage src={master.imagem} alt={master.nome} ratio="square" priority className="w-full" />
        <div className="flex flex-col gap-5">
          <Text as="h1" variant="display-md" className="font-black leading-tight tracking-tight">{master.nome}</Text>
          <LinhaIdentidadeView tipo={dept.tipoCartao} master={master} />
          <PrecoDepartamentoView master={master} />
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-3">
        <Text as="h2" variant="heading-md" className="font-bold">Menor preço por loja</Text>
        <ul className="grid gap-3 sm:grid-cols-2">
          {d.porLoja.map((v) => (
            <li key={v.rede} className="flex flex-col gap-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
              <Text variant="label" color="tertiary">{v.redeNome}</Text>
              <Text variant="mono-lg" className="font-black">{formatBRL(v.precoCents)}</Text>
              <Text variant="caption" color="tertiary"><VerificadoHa iso={v.verificadoEm} /></Text>
              <Text variant="caption" color="secondary">Você será levado à loja; confirme o preço e as condições por lá.</Text>
              <Button asChild variant="primary" size="md" className="self-start">
                <a href={`/go/${v.ofertaSlug}`} rel="nofollow noopener sponsored">Ir à loja</a>
              </Button>
            </li>
          ))}
        </ul>
        <CommissionNotice />
      </div>

      {d.vendedoresLista.length > 1 ? (
        <div className="mt-10 flex flex-col gap-3">
          <Text as="h2" variant="heading-md" className="font-bold">Vendedores</Text>
          <div className="overflow-x-auto border border-[var(--color-border-subtle)]">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)]">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Vendedor</th>
                  <th scope="col" className="px-3 py-2 font-medium">Loja</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Preço</th>
                  <th scope="col" className="px-3 py-2 font-medium">Verificação</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Ir à loja</span></th>
                </tr>
              </thead>
              <tbody>
                {d.vendedoresLista.map((v) => (
                  <tr key={v.ofertaSlug} className="border-t border-[var(--color-border-subtle)]">
                    <td className="px-3 py-2">{v.vendedor ?? 'Vendedor da loja'}</td>
                    <td className="px-3 py-2">{v.redeNome}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatBRL(v.precoCents)}</td>
                    <td className="px-3 py-2 text-[var(--color-text-tertiary)]"><VerificadoHa iso={v.verificadoEm} /></td>
                    <td className="px-3 py-2 text-right">
                      <a href={`/go/${v.ofertaSlug}`} rel="nofollow noopener sponsored" className="underline underline-offset-2">Ir à loja</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
