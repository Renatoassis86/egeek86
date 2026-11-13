// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Convite do canal e lojas.
import Link from 'next/link';
import { getStores } from '@/server/stores';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';

// ----- Newsletter CTA ----------------------------------------
const STORE_BLURB: Record<string, string> = {
  games: 'Games',
  'impressao-3d': 'Impressão 3D',
  tecnologia: 'Tecnologia',
  livros: 'Livros',
  eletrodomesticos: 'Casa',
  eletroeletronicos: 'Eletrônicos',
  esporte: 'Esporte',
};
const STORE_ORDER = Object.keys(STORE_BLURB);

export async function NewsletterCTA() {
  // Canais públicos de cada loja (Telegram e WhatsApp) vêm do cadastro das lojas; loja sem link não aparece. Falha segura: lista vazia.
  const stores = (await getStores().catch(() => []))
    .filter((s) => STORE_ORDER.includes(s.slug))
    .sort((x, y) => STORE_ORDER.indexOf(x.slug) - STORE_ORDER.indexOf(y.slug));
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 pb-20 lg:pb-28">
      <Card variant="elevated" className="relative overflow-hidden bg-brand-orange-depth border bg-brand-orange-glow">
        <Glow color="hype" size="lg" intensity={0.35} className="-bottom-32 -left-24" />

        <div className="relative grid items-center gap-8 p-8 lg:grid-cols-12 lg:gap-12 lg:p-14">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <Reveal>
              <Badge variant="outline" size="md" className="mb-5 border-amber-500/40 text-amber-400">
                Comunidade
              </Badge>
              <Text as="h2" variant="display-lg" className="max-w-[18ch]">
                Avisamos quando o preço cair.
              </Text>
              <Text variant="body-lg" color="secondary" className="mt-4 max-w-[48ch]">
                Cada loja tem o seu canal no Telegram e o seu grupo no WhatsApp. Você recebe só o menor preço monitorado, com a média das lojas e o histórico para decidir a compra.
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

          <div className="lg:col-span-6">
            <Reveal delay={0.1}>
              <ul className="grid gap-px border border-[var(--color-border-subtle)] bg-[var(--color-border-subtle)] sm:grid-cols-2">
                {stores.map((s) => (
                  <li key={s.slug} className="flex flex-col gap-2 bg-[var(--color-bg-inset)] p-4">
                    <Text variant="heading-sm">{STORE_BLURB[s.slug]}</Text>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {s.telegramInviteUrl && (
                        <a className="border border-[var(--color-border-default)] px-3 py-1 hover:border-amber-500/60" href={s.telegramInviteUrl} target="_blank" rel="noopener noreferrer">Telegram</a>
                      )}
                      {s.whatsappGroupUrl && (
                        <a className="border border-[var(--color-border-default)] px-3 py-1 hover:border-amber-500/60" href={s.whatsappGroupUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </Card>
    </section>
  );
}
