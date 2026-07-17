import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Compass } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Glow } from '@/components/motion/glow';

// Página 404 própria (docs/banco-mestre-prompts-imagens.md item 2.2) — antes
// caía no fallback em branco padrão do Next.js. Precisa morar na raiz de
// `app/` (não dentro de um route group como (shop)) pra pegar rotas
// totalmente sem match — route groups só cobrem notFound() disparado de
// dentro deles, não uma URL solta que não bate com nenhuma rota. Por isso
// aplica o AppShell manualmente aqui, já que essa página fica fora do
// layout de (shop).
export default function NotFound() {
  return (
    <AppShell>
      <section className="relative mx-auto flex min-h-[70dvh] w-full max-w-3xl flex-col items-center overflow-hidden px-4 py-16 text-center lg:px-8">
        <Glow color="gold" size="lg" intensity={0.2} className="-top-24" />

        <div className="relative aspect-[4/5] w-full max-w-[280px]">
          <Image
            src="/images/errors/404-illustration.png"
            alt=""
            fill
            sizes="280px"
            className="object-contain"
            priority
          />
        </div>

        <Text variant="label" color="tertiary" className="mt-4 inline-flex items-center gap-1.5">
          <Compass className="size-3.5" aria-hidden />
          Essa página saiu do gráfico
        </Text>
        <Text as="h1" variant="heading-xl" className="mt-3 max-w-[22ch]">
          Não encontramos esse caminho.
        </Text>
        <Text variant="body-md" color="secondary" className="mt-3 max-w-[46ch]">
          O link pode ter mudado ou o produto saiu de catálogo. Volta pra vitrine e continua de onde
          parou.
        </Text>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" rightIcon={<ArrowRight className="size-4" />}>
            <Link href="/">Voltar pra home</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/ofertas">Explorar ofertas</Link>
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
