// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Hero com busca.
import { Sparkles } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Glow } from '@/components/motion/glow';
import type { HomeSearchData } from '@/server/queries/home-search';
import { SearchBox } from '@/components/search/search-box';
import { PLATFORM_SHORT } from '@/components/search/platform-short';

// ----- Hero ---------------------------------------------------
// Primeira tela = a função principal do site: BUSCAR PREÇOS. Sempre dark
// (data-theme="dark"), foto real tratada com overlay em gradiente (contraste
// AA do texto), busca à esquerda e carrossel vertical de notícias reais à
// direita (some se não houver notícia; nada é inventado).
export function Hero({ data }: { data: HomeSearchData }) {
  const { platforms } = data;
  return (
    <section
      data-theme="dark"
      aria-labelledby="hero-title"
      className="relative isolate w-full overflow-hidden border-b border-amber-500/20 bg-gradient-to-b from-[#1a1033] via-[#120b26] to-[#0c0616] text-white"
    >
      <Glow color="gold" size="xl" intensity={0.2} className="-top-64 -left-48" />
      <Glow color="hype" size="xl" intensity={0.18} className="-bottom-72 -right-40" />

      <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-12 text-center lg:px-8 lg:pb-24 lg:pt-20">
        <span className="inline-flex items-center gap-2 border border-amber-400/40 bg-white/10 px-3 py-1.5 text-[14px] font-semibold text-amber-100">
          <Sparkles aria-hidden className="size-4 text-amber-400" />
          Ofertas reais. Decisões inteligentes.
        </span>
        <Text
          as="h1"
          id="hero-title"
          variant="display-xl"
          className="mt-5 !font-black tracking-tight !text-white !text-[36px] !leading-[40px] sm:!text-[44px] sm:!leading-[48px] lg:!text-[56px] lg:!leading-[60px]"
        >
          Informação real sobre games{' '}
          <span className="bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-hype)] bg-clip-text text-transparent">
            Decisões inteligentes.
          </span>
        </Text>

        <div className="mx-auto mt-8 max-w-3xl text-left">
          <SearchBox
            variant="hero"
            platforms={platforms.map((p) => ({ platform: p.platform, label: PLATFORM_SHORT[p.platform] || p.label }))}
          />
        </div>
      </div>
    </section>
  );
}
