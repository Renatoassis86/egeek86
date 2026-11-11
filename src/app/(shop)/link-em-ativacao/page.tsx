import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export const metadata = {
  title: 'Link em ativação',
  robots: { index: false, follow: true },
};

/** Destino do /go/[slug] quando o link da loja ainda não está ativo (sem rastreio). Aviso neutro, sem dado inventado. */
export default function LinkEmAtivacaoPage() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-5 px-4 py-16 lg:py-24">
      <Text as="h1" variant="display-md" className="font-black tracking-tight">
        Link em ativação
      </Text>
      <Text variant="body-lg" color="secondary" className="leading-relaxed">
        O link desta loja ainda está sendo ativado e por isso não abrimos a compra daqui. Volte em breve ou veja as
        ofertas que já estão com o link ativo.
      </Text>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="hype" size="md">
          <Link href="/ofertas">Ver ofertas ativas</Link>
        </Button>
      </div>
    </section>
  );
}
