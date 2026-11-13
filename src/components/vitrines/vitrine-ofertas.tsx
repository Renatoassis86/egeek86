import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { CartaoVitrine, ALTURA_IMAGEM_PX } from '@/components/vitrines/cartao-vitrine';
import { FaixaVitrine } from '@/components/vitrines/faixa-vitrine';
import { VITRINE_REGRAS } from '@/lib/vitrines/regras';
import type { VitrineItem } from '@/lib/vitrines/tipos';

export type VarianteVitrine = 'grade' | 'faixa';

/** Altura reservada por cartão no esqueleto (imagem + textos). Mesmo valor para esqueleto e conteúdo: 0 CLS. */
const ALTURA_CARTAO_ESQUELETO_PX = ALTURA_IMAGEM_PX + 176;

interface VitrineOfertasProps {
  id?: string;
  titulo: string;
  subtitulo?: string;
  itens: readonly VitrineItem[];
  variante: VarianteVitrine;
  hrefVerTudo?: string;
  /** Teto de itens exibidos (a quantidade oficial de cada vitrine vem de VITRINE_REGRAS). */
  limite?: number;
}

function Cabecalho({ id, titulo, subtitulo, hrefVerTudo }: Pick<VitrineOfertasProps, 'id' | 'titulo' | 'subtitulo' | 'hrefVerTudo'>) {
  return (
    <div className="mb-4 flex min-h-[52px] items-end justify-between gap-3">
      <div className="min-w-0">
        <Text as="h2" id={id ? `${id}-titulo` : undefined} variant="heading-lg" className="font-black tracking-tight">
          {titulo}
        </Text>
        {subtitulo ? (
          <Text variant="body-sm" color="secondary" className="mt-0.5">
            {subtitulo}
          </Text>
        ) : null}
      </div>
      {hrefVerTudo ? (
        <Link
          href={hrefVerTudo}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-[14px] font-semibold text-[var(--color-accent-primary)] hover:underline"
        >
          Ver tudo <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

const GRADE = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-6';

/**
 * Vitrine de ofertas da nova landing (checklist #6). Recebe `VitrineItem[]` já filtrado pelo servidor; aqui não há regra de
 * elegibilidade. Única regra de apresentação: com menos de VITRINE_REGRAS.MIN_ITENS itens o bloco inteiro some
 * (nunca se completa com item fraco).
 */
export function VitrineOfertas({ id, titulo, subtitulo, itens, variante, hrefVerTudo, limite }: VitrineOfertasProps) {
  if (itens.length < VITRINE_REGRAS.MIN_ITENS) return null;
  const lista = limite ? itens.slice(0, limite) : [...itens];
  return (
    <section id={id} aria-labelledby={id ? `${id}-titulo` : undefined} className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-10">
      <Cabecalho id={id} titulo={titulo} subtitulo={subtitulo} hrefVerTudo={hrefVerTudo} />
      {variante === 'faixa' ? (
        <FaixaVitrine itens={lista} rotulo={titulo} />
      ) : (
        <div className={GRADE}>
          {lista.map((item, i) => (
            <CartaoVitrine key={`${item.masterProductId}-${item.offerId ?? i}`} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Esqueleto de altura fixa para o Suspense da vitrine: reserva o espaço do cabeçalho e de uma linha de cartões, sem
 * animação de pulso, para não deslocar o layout quando a vitrine chega.
 */
export function VitrineEsqueleto({ variante, quantidade = 6 }: { variante: VarianteVitrine; quantidade?: number }) {
  const cartoes = Array.from({ length: quantidade }, (_, i) => i);
  return (
    <section aria-hidden className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-10">
      <div className="mb-4 h-[52px]" />
      {variante === 'faixa' ? (
        <div className="flex gap-3 overflow-hidden">
          {cartoes.map((i) => (
            <div
              key={i}
              className="min-w-0 flex-[0_0_72%] bg-[var(--color-bg-inset)] sm:flex-[0_0_42%] md:flex-[0_0_33.333%] lg:flex-[0_0_25%] xl:flex-[0_0_20%]"
              style={{ height: ALTURA_CARTAO_ESQUELETO_PX }}
            />
          ))}
        </div>
      ) : (
        <div className={GRADE}>
          {cartoes.map((i) => (
            <div key={i} className="bg-[var(--color-bg-inset)]" style={{ height: ALTURA_CARTAO_ESQUELETO_PX }} />
          ))}
        </div>
      )}
    </section>
  );
}
