import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { PlusDestaquesLista, type FaixaPlus } from '@/components/plus/plus-destaques-lista';
import { getLojasPlus } from '@/server/plus';
import { getDestaquesPlus } from '@/server/plus-destaques';
import { getCurrentProfile } from '@/lib/auth/require-admin';

/** Itens por departamento na home (destaques de preço; o catálogo completo fica em /mercado/<dept>). */
const ITENS_POR_ABA = 5;

/**
 * Seção "Espaço Geek Plus" da home, resumida: só destaques de preço, uma faixa compacta por departamento, uma abaixo da outra.
 * Mesma fonte de /mercado/<dept> (destaquesPlusCached, com cache SWR; a home nunca espera o banco). Sem selo, sem média, sem grupos de mensagens.
 * Departamento fechado para quem vê, ou com menos de 4 produtos, não aparece; sem nenhuma faixa a seção some.
 */
export async function SecaoPlusHome() {
  const perfil = await getCurrentProfile().catch(() => null);
  const lojas = (await getLojasPlus(perfil?.role)).filter((l) => l.aberta);
  if (lojas.length === 0) return null;
  const destaques = await getDestaquesPlus(lojas.map((l) => l.dept));
  const abas: FaixaPlus[] = lojas
    .filter((l) => (destaques[l.dept] ?? []).length > 0)
    .map((l) => ({
      dept: l.dept,
      rotulo: l.rotulo,
      itens: destaques[l.dept].slice(0, ITENS_POR_ABA).map((m) => ({
        id: m.id,
        slug: m.slug,
        nome: m.nome,
        imagem: m.imagem ?? null,
        menorCents: m.menorCents,
        lojaMenor: m.lojaMenor ?? null,
        verificadoEm: m.verificadoEm,
      })),
    }));
  if (abas.length === 0) return null;
  return (
    <section aria-labelledby="plus-titulo" className="w-full border-y border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] py-8 lg:py-10">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-[62ch] flex-col gap-1 border-l-2 border-[var(--color-accent-primary)] pl-4">
            <Text variant="label" color="tertiary">Plus</Text>
            <Text as="h2" id="plus-titulo" variant="display-md" className="font-black tracking-tight">Espaço Geek Plus</Text>
            <Text variant="body-sm" color="secondary">Os menores preços do momento nos outros departamentos, com anúncio confirmado nas últimas horas.</Text>
          </div>
          <Link href="/plus" className="inline-flex min-h-11 items-center gap-2 text-[14px] font-bold text-[var(--color-accent-primary)] hover:underline">
            Ver todo o Plus <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <PlusDestaquesLista faixas={abas} />
      </div>
    </section>
  );
}
