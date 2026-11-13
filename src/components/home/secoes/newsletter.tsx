// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Convite do canal e lojas.
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';

export function NewsletterCTA() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 pb-20 lg:pb-28">
      <Card variant="elevated" className="relative overflow-hidden bg-brand-orange-depth border bg-brand-orange-glow">
        <Glow color="hype" size="lg" intensity={0.35} className="-bottom-32 -left-24" />

        <div className="relative grid items-center gap-8 p-8 lg:grid-cols-12 lg:gap-12 lg:p-14">
          <div className="lg:col-span-12 flex flex-col justify-center">
            <Reveal>
              <Badge variant="outline" size="md" className="mb-5 border-amber-500/40 text-amber-400">
                Comunidade
              </Badge>
              <Text as="h2" variant="display-lg" className="max-w-[18ch]">
                Avisamos quando o preço cair.
              </Text>
              <Text variant="body-lg" color="secondary" className="mt-4 max-w-[48ch]">
                Com a conta você recebe só o menor preço monitorado, com a média das lojas e o histórico para decidir a compra.
              </Text>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="xl" rightIcon={<ArrowRight className="size-4" />}>
                  <Link href="/entrar">Criar minha conta</Link>
                </Button>
                <Button asChild size="xl" variant="outline">
                  <a href="https://instagram.com/espacogeek86" target="_blank" rel="noopener noreferrer">Instagram</a>
                </Button>
              </div>
            </Reveal>
          </div>

        </div>
      </Card>
    </section>
  );
}
