'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Maximize2 } from 'lucide-react';
import type { ParecerProduto } from '@/lib/pricing/parecer-produto';

/**
 * Botão do cartão-pai que abre a camada (Fase 2). É o ÚNICO JavaScript do cartão além do "verificado há".
 * A camada (dialog + conteúdo) é um chunk separado, importado só ao abrir; pré-carregado em pointerenter/foco/toque
 * para o clique não esperar a rede. O retângulo de origem da animação é o do próprio cartão.
 * `aria-expanded` reflete a camada; `aria-controls` só existe enquanto ela está montada; `aria-haspopup="dialog"`
 * é verdadeiro: o botão abre um <dialog> modal de verdade.
 */

const carregar = () => import('@/components/affiliate/camada-produto');
const CamadaProduto = dynamic(carregar, { ssr: false });

export interface CamadaGatilhoProps {
  parecer: ParecerProduto;
  produtoNome: string;
  rotulo: string;
  identidade: string | null;
  compraHref: string | null;
  produtoId: string | null;
}

export function CamadaGatilho({ parecer, produtoNome, rotulo, identidade, compraHref, produtoId }: CamadaGatilhoProps) {
  const [aberta, setAberta] = React.useState(false);
  const [origem, setOrigem] = React.useState<DOMRect | null>(null);
  const botao = React.useRef<HTMLButtonElement>(null);
  const uid = React.useId();
  const id = `camada-${uid}`;
  const titleId = `camada-titulo-${uid}`;

  const preCarregar = React.useCallback(() => {
    void carregar();
  }, []);

  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-label={rotulo}
        aria-haspopup="dialog"
        aria-expanded={aberta}
        aria-controls={aberta ? id : undefined}
        data-camada="pronta"
        onPointerEnter={preCarregar}
        onFocus={preCarregar}
        onTouchStart={preCarregar}
        onClick={() => {
          if (aberta) return;
          const el = botao.current;
          const cartao = el?.closest('article') ?? el;
          setOrigem(cartao ? cartao.getBoundingClientRect() : null);
          setAberta(true);
        }}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 pt-1 text-left text-body-sm font-medium text-[var(--color-text-secondary)] outline-none after:absolute after:inset-0 after:content-['']"
      >
        <span>Ver detalhes</span>
        <Maximize2 className="size-4" aria-hidden />
      </button>
      {aberta && (
        <CamadaProduto
          parecer={parecer}
          produtoNome={produtoNome}
          identidade={identidade}
          compraHref={compraHref}
          produtoId={produtoId}
          id={id}
          titleId={titleId}
          origem={origem}
          onFechada={() => setAberta(false)}
          retornoFoco={botao}
        />
      )}
    </>
  );
}
