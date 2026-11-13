// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Faixa-declaracao com 3 numeros reais.
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { CornerBrackets } from '@/components/motion/corner-brackets';

// ----- Statement band ------------------------------------------
// Foto escura tratada (brilho/contraste/saturação + brilho âmbar direcionado)
// para ganhar presença; painel de texto em vidro com borda âmbar nítida, CTA
// para a busca e 3 números reais já carregados pela home (sem query nova).
export function StatementBand({ products, stores, quotes }: { products: number; stores: number; quotes: number }) {
  const numbers = [
    { value: products, label: 'produtos com oferta' },
    { value: stores, label: 'lojas monitoradas' },
    { value: quotes, label: 'cotações registradas' },
  ].filter((n) => n.value > 0);
  return (
    <section data-theme="dark" className="w-full border-b border-[var(--color-border-subtle)] bg-[#0F0C08] py-10 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <Reveal>
          <div className="relative isolate flex min-h-[460px] flex-col justify-center overflow-hidden border border-amber-400/50 bg-[#140d05] shadow-2xl lg:aspect-[21/9] lg:min-h-0">
            <Image
              src="/images/home/hero-watermark.png"
              alt="Mesa gamer com painéis de gráfico de preço em tons de dourado"
              fill
              sizes="(min-width: 1280px) 1280px, 100vw"
              className="object-cover object-left [filter:brightness(1.7)_contrast(1.15)_saturate(1.25)]"
            />
            {/* Brilho âmbar atrás do gráfico + vinheta só no lado do texto */}
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_40%,rgba(245,158,11,0.28),transparent_55%)] mix-blend-screen" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-l from-[#0F0C08]/95 via-[#0F0C08]/55 to-transparent md:from-[#0F0C08]/90 md:via-[#0F0C08]/30" />
            <CornerBrackets inset={16} size={20} />

            <div className="relative z-10 flex h-full items-center justify-end p-4 sm:p-8 lg:p-12">
              <div className="w-full max-w-xl border border-amber-400/60 bg-[#0F0C08]/75 p-5 shadow-[0_0_0_1px_rgba(245,158,11,0.15),0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-8">
                <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-amber-300">
                  <History className="size-4" aria-hidden />
                  <span>Por trás de cada preço</span>
                </div>
                <div aria-hidden className="mt-3 h-0.5 w-14 bg-amber-400" />
                <Text as="h2" variant="display-md" className="mt-3 font-black !text-white tracking-tight text-2xl sm:text-3xl lg:text-4xl leading-tight">
                  Preço, média e menor preço de cada jogo.
                </Text>
                <Text variant="body-md" className="mt-3 font-medium !text-zinc-100 text-sm sm:text-base leading-relaxed">
                  Veja o preço atual, a média e o menor preço já registrado antes de comprar.
                </Text>

                {numbers.length > 0 && (
                  <dl className="mt-5 grid grid-cols-3 gap-px border border-white/15 bg-white/15">
                    {numbers.map((n) => (
                      <div key={n.label} className="flex flex-col-reverse bg-[#0F0C08]/80 px-2 py-2.5 text-center sm:px-3">
                        <dt className="text-[11px] font-semibold leading-tight text-zinc-300">{n.label}</dt>
                        <dd className="font-mono text-lg font-black text-amber-300 sm:text-xl">
                          {n.value.toLocaleString('pt-BR')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg" rightIcon={<ArrowRight className="size-4" />}>
                    <Link href="/ofertas">Buscar preços</Link>
                  </Button>
                  <Link
                    href="/entrar"
                    className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-amber-200 underline decoration-amber-400/60 underline-offset-4 hover:text-amber-100"
                  >
                    Monitorar um jogo
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
