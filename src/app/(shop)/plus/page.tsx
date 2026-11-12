import type { Metadata } from 'next';
import Link from 'next/link';
import { Text } from '@/components/ui/text';
import { CartaoLojaPlus } from '@/components/plus/cartao-loja-plus';
import { GruposWhatsapp } from '@/components/plus/grupos-whatsapp';
import { getLojasPlus, getGruposWhatsapp } from '@/server/plus';
import { getTiposPrincipaisPlus } from '@/server/plus-tipos';
import { getCurrentProfile } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Espaço Geek Plus',
  description: 'Além dos games: Impressão 3D, Tecnologia, Livros, Casa, Eletrônicos e Esporte, monitorados pelo mesmo motor de preço do Espaço Geek 86.',
};

export default async function PlusPage() {
  const perfil = await getCurrentProfile().catch(() => null);
  const [lojas, grupos] = await Promise.all([getLojasPlus(perfil?.role), getGruposWhatsapp()]);
  const tipos = await getTiposPrincipaisPlus(lojas.filter((l) => l.aberta).map((l) => l.dept));
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <header className="mb-8 flex flex-col gap-2 border-l-2 border-[var(--color-accent-primary)] pl-4">
        <Text variant="label" color="tertiary">Espaço Geek Plus</Text>
        <Text as="h1" variant="display-md" className="font-black tracking-tight">Os outros departamentos, no mesmo motor de preço</Text>
        <Text variant="body-md" color="secondary" className="max-w-[62ch]">
          Games continua sendo o foco do Espaço Geek 86. O Plus reúne os demais departamentos que monitoramos com o mesmo método: só anúncios ativos, com link verificado nas últimas horas e preço lido na fonte.
        </Text>
        <Text variant="caption" color="tertiary" className="max-w-[62ch]">
          Nos departamentos mostramos o menor preço do momento, a loja e o horário da verificação. Média e histórico aparecem só quando houver base robusta.
        </Text>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lojas.map((l) => (
          <li key={l.dept}>
            <CartaoLojaPlus loja={l} tipos={tipos[l.dept]} />
          </li>
        ))}
      </ul>

      <GruposWhatsapp grupos={grupos} />

      <p className="mt-8 text-[14px]">
        <Link href="/ofertas" className="underline underline-offset-2">Voltar para as ofertas de games</Link>
      </p>
    </section>
  );
}
