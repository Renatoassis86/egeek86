import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { SearchBox } from '@/components/search/search-box';
import { PLATFORM_SHORT } from '@/components/search/platform-short';
import { ContagemBlackFriday } from '@/components/black-friday/contagem-black-friday';
import { PLATAFORMAS_VITRINE } from '@/lib/vitrines/tipos';
import type { HomeSearchData } from '@/server/queries/home-search';

/**
 * Hero compacto da nova landing (checklist #10): busca, chips das plataformas reais do catálogo e entrada da Black Friday
 * com contagem até 27/11. Fundo sólido escuro (sem imagem até o item #20), cantos retos, altura baixa para a primeira oferta
 * aparecer sem rolar no desktop.
 */
export function HeroCompacto({ data }: { data: HomeSearchData }) {
  return (
    <section data-theme="dark" aria-labelledby="hero-compacto-titulo" className="w-full border-b border-[var(--color-border-subtle)] bg-[#120b26] text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 lg:gap-5 lg:px-8 lg:py-8">
        <Text as="h1" id="hero-compacto-titulo" variant="display-md" className="!font-black tracking-tight !text-white">
          Preços reais de games, com o horário de cada leitura
        </Text>
        <SearchBox
          variant="hero"
          platforms={data.platforms
            // Só plataformas em linha (as mesmas das vitrines): Xbox One e 360 não aparecem nos chips.
            .filter((p) => (PLATAFORMAS_VITRINE as readonly string[]).includes(p.platform))
            .map((p) => ({ platform: p.platform, label: PLATFORM_SHORT[p.platform] || p.label }))}
        />
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/black-friday"
            className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-amber-300 hover:underline"
          >
            Black Friday: veja as quedas reais de preço <ArrowRight className="size-4" aria-hidden />
          </Link>
          <ContagemBlackFriday className="!text-white/80" />
        </div>
      </div>
    </section>
  );
}
