import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { CartaoLojaPlus } from '@/components/plus/cartao-loja-plus';
import { GruposWhatsapp } from '@/components/plus/grupos-whatsapp';
import { getLojasPlus, getGruposWhatsapp } from '@/server/plus';
import { getCurrentProfile } from '@/lib/auth/require-admin';

/** Seção "Espaço Geek Plus" da home: um cartão por departamento além de games. Dado real (estado e contagem vêm do catálogo). */
export async function SecaoPlusHome() {
  const perfil = await getCurrentProfile().catch(() => null);
  const [lojas, grupos] = await Promise.all([getLojasPlus(perfil?.role), getGruposWhatsapp()]);
  return (
    <section aria-labelledby="plus-titulo" className="w-full border-y border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-[62ch] flex-col gap-2 border-l-2 border-[var(--color-accent-primary)] pl-4">
            <Text variant="label" color="tertiary">Plus</Text>
            <Text as="h2" id="plus-titulo" variant="display-md" className="font-black tracking-tight">Espaço Geek Plus</Text>
            <Text variant="body-md" color="secondary">
              Games continua sendo o nosso foco. O Plus traz os outros departamentos que o mesmo motor de preço monitora: Impressão 3D, Tecnologia, Livros, Casa, Eletrônicos e Esporte.
            </Text>
          </div>
          <Link href="/plus" className="inline-flex min-h-11 items-center gap-2 text-[14px] font-bold text-[var(--color-accent-primary)] hover:underline">
            Ver todo o Plus <ArrowRight className="size-4" />
          </Link>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lojas.map((l) => (
            <li key={l.dept}>
              <CartaoLojaPlus loja={l} />
            </li>
          ))}
        </ul>
        <GruposWhatsapp grupos={grupos} id="plus-grupos-titulo" />
      </div>
    </section>
  );
}
