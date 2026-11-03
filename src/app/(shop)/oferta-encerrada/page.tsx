import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export const metadata = {
  title: 'Oferta encerrada',
  robots: { index: false, follow: true },
};

/**
 * Destino do /go/[slug] quando o link não existe mais (oferta removida,
 * expirada ou slug errado). Antes o visitante caía em /ofertas sem explicação.
 */
export default function OfertaEncerradaPage() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-5 px-4 py-16 lg:py-24">
      <Text as="h1" variant="display-md" className="font-black tracking-tight">
        Essa oferta foi encerrada
      </Text>
      <Text variant="body-lg" color="secondary" className="leading-relaxed">
        O link que você abriu não aponta mais para uma oferta ativa. A loja pode ter tirado o anúncio do ar, o estoque
        acabou ou o endereço está incorreto. Veja as ofertas que estão valendo agora:
      </Text>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="hype" size="md">
          <Link href="/ofertas">Ver ofertas ativas</Link>
        </Button>
        <Button asChild variant="outline" size="md">
          <Link href="/tabela-de-precos">Comparar na tabela de preços</Link>
        </Button>
      </div>
    </section>
  );
}
