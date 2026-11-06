'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Camada sobreposta GENÉRICA que CRESCE a partir de um retângulo de origem (ex.: o cartão que a abriu). Fase 2 do cartão-pai
 * (ata 2026-11-05, decisão D1; guia visual seção 9).
 *
 * - `<dialog>` nativo com `showModal()`: foco preso, `inert` no resto da página e Esc de graça; devolvemos o foco a `retornoFoco`.
 * - Animação FLIP com Web Animations API: a caixa sai da geometria de `origem` (getBoundingClientRect) para a final, ~300 ms,
 *   `--ease-out`, sem rebote. Só `transform` e `opacity`. O conteúdo interno recebe a escala inversa, então o texto não estica:
 *   a caixa só "revela" o conteúdo (a caixa tem overflow hidden).
 * - `prefers-reduced-motion: reduce` = só fade de 100 ms, sem crescer nem transladar.
 * - Fecha com Esc, clique fora (fundo), botão "Fechar" (alvo 44 px) e "voltar" do aparelho (um estado de histórico por abertura).
 * - Trava a rolagem da página sem salto de layout (`scrollbar-gutter: stable`).
 * - Mobile: tela cheia (100dvw x 100dvh, fundo sólido); desktop: caixa centralizada de até 960 px, rolagem interna. Cantos retos, sem imagem.
 * O conteúdo é de quem usa (children); este componente não conhece produto. Monte-o só quando a camada deve abrir (carregamento sob demanda).
 */

interface Props {
  id: string;
  titleId: string;
  /** Retângulo de onde a camada cresce. null = sem origem (só fade). */
  origem: DOMRect | null;
  /** Chamado quando a animação de fechar termina e o dialog já fechou: o pai desmonta e pode devolver o foco. */
  onFechada: () => void;
  /** Elemento que recebe o foco ao fechar (o botão do cartão). */
  retornoFoco?: React.RefObject<HTMLElement | null>;
  rotuloFechar?: string;
  /** Desktop: caixa com altura fixa (a máxima), para o conteúdo carregado depois não mover a caixa. Mobile já é tela cheia. */
  alturaFixa?: boolean;
  /** Cabeçalho fixo (ao lado do botão Fechar). */
  cabecalho: React.ReactNode;
  /** Rodapé fixo (ex.: ação de comprar). */
  rodape?: React.ReactNode;
  children: React.ReactNode;
}

const DUR_ABRIR = 300;
const DUR_FECHAR = 250;
const DUR_REDUZIDO = 100;

function easing(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim();
  return v || 'cubic-bezier(0.16, 1, 0.3, 1)';
}

function movimentoReduzido(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Anima (abrindo ou fechando) e resolve ao terminar. Nunca lança: sem WAAPI a camada só aparece/desaparece. */
async function animar(dlg: HTMLDialogElement, interno: HTMLElement, origem: DOMRect | null, abrindo: boolean): Promise<void> {
  if (typeof dlg.animate !== 'function') return;
  const reduzido = movimentoReduzido();
  const fill: FillMode = 'both';
  const direction: PlaybackDirection = abrindo ? 'normal' : 'reverse';
  const anims: Animation[] = [];

  // Fundo escurecido (::backdrop): fade; ignora se o navegador não aceitar pseudoElement.
  try {
    anims.push(dlg.animate({ opacity: [0, 1] }, { duration: reduzido ? DUR_REDUZIDO : 200, easing: 'linear', fill, direction, pseudoElement: '::backdrop' } as KeyframeAnimationOptions));
  } catch {
    /* sem animação de fundo */
  }

  const f = dlg.getBoundingClientRect();
  if (reduzido || !origem || f.width === 0 || f.height === 0 || origem.width === 0 || origem.height === 0) {
    anims.push(dlg.animate({ opacity: [0, 1] }, { duration: DUR_REDUZIDO, easing: 'linear', fill, direction }));
  } else {
    const sx = origem.width / f.width;
    const sy = origem.height / f.height;
    const dx = origem.left - f.left;
    const dy = origem.top - f.top;
    const opts = { duration: abrindo ? DUR_ABRIR : DUR_FECHAR, easing: easing(), fill, direction } as const;
    anims.push(
      dlg.animate(
        [
          { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.55 },
          { transformOrigin: '0 0', transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
        ],
        opts
      ),
      // Escala inversa no conteúdo: o texto mantém o tamanho enquanto a caixa o revela.
      interno.animate(
        [
          { transformOrigin: '0 0', transform: `scale(${1 / sx}, ${1 / sy})` },
          { transformOrigin: '0 0', transform: 'scale(1, 1)' },
        ],
        opts
      )
    );
  }
  await Promise.allSettled(anims.map((a) => a.finished));
}

export function CamadaSobreposta({ id, titleId, origem, onFechada, retornoFoco, rotuloFechar = 'Fechar', alturaFixa = false, cabecalho, rodape, children }: Props) {
  const dlgRef = React.useRef<HTMLDialogElement>(null);
  const internoRef = React.useRef<HTMLDivElement>(null);
  const fechando = React.useRef(false);
  const estadoHistorico = React.useRef(false);
  const [alvo, setAlvo] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => setAlvo(document.body), []);

  const concluir = React.useCallback(() => {
    const dlg = dlgRef.current;
    if (dlg?.open) dlg.close();
    const html = document.documentElement;
    html.style.overflow = '';
    html.style.scrollbarGutter = '';
    retornoFoco?.current?.focus({ preventScroll: true });
    onFechada();
  }, [onFechada, retornoFoco]);

  const solicitarFechar = React.useCallback(
    async (deHistorico = false) => {
      const dlg = dlgRef.current;
      const interno = internoRef.current;
      if (!dlg || !interno || fechando.current) return;
      fechando.current = true;
      // Se fechou por outro caminho, consome o estado de histórico criado na abertura (evita ficar "um voltar" atrás).
      if (!deHistorico && estadoHistorico.current) {
        estadoHistorico.current = false;
        window.history.back();
      }
      await animar(dlg, interno, origem, false);
      concluir();
    },
    [origem, concluir]
  );

  // Abre: showModal, trava rolagem, anima, registra "voltar".
  React.useEffect(() => {
    const dlg = dlgRef.current;
    const interno = internoRef.current;
    if (!alvo || !dlg || !interno) return;
    const html = document.documentElement;
    html.style.scrollbarGutter = 'stable';
    html.style.overflow = 'hidden';
    if (!dlg.open) dlg.showModal();
    void animar(dlg, interno, origem, true);

    // Um estado de histórico por abertura (o modo estrito do React em desenvolvimento roda este efeito duas vezes).
    if (!estadoHistorico.current) {
      window.history.pushState(null, '', window.location.href);
      estadoHistorico.current = true;
    }
    const aoVoltar = () => {
      estadoHistorico.current = false;
      void solicitarFechar(true);
    };
    window.addEventListener('popstate', aoVoltar);
    return () => {
      window.removeEventListener('popstate', aoVoltar);
      html.style.overflow = '';
      html.style.scrollbarGutter = '';
    };
    // Só na montagem: a camada é montada quando deve abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);

  if (!alvo) return null;

  return createPortal(
    <dialog
      ref={dlgRef}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc: fecha com a animação em vez do fechamento seco do navegador.
        e.preventDefault();
        void solicitarFechar();
      }}
      onClick={(e) => {
        // Clique fora: o alvo é o próprio <dialog> (o fundo e a borda), nunca um filho.
        if (e.target === e.currentTarget) void solicitarFechar();
      }}
      className={`inset-0 m-auto h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0 bg-[var(--color-bg-elevated)] p-0 text-[var(--color-text-primary)] shadow-none backdrop:bg-[var(--color-bg-overlay)] ${alturaFixa ? 'md:h-[calc(100dvh-64px)]' : 'md:h-auto'} md:max-h-[calc(100dvh-64px)] md:w-[min(960px,calc(100vw-48px))] md:border md:border-[var(--color-border-default)] md:shadow-[var(--shadow-xl)]`}
    >
      <div ref={internoRef} className={`flex h-dvh flex-col ${alturaFixa ? 'md:h-full' : 'md:h-auto'} md:max-h-[calc(100dvh-64px)]`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border-default)] p-4 md:px-6">
          <div className="min-w-0 flex-1">{cabecalho}</div>
          <button
            type="button"
            onClick={() => void solicitarFechar()}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 border border-[var(--color-border-strong)] px-3 text-body-sm font-medium text-[var(--color-text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] light:focus-visible:outline-[var(--color-accent-cta)]"
          >
            <X className="size-4" aria-hidden />
            <span>{rotuloFechar}</span>
          </button>
        </div>
        <div
          tabIndex={0}
          role="region"
          aria-label="Conteúdo da camada"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-border-focus)] light:focus-visible:outline-[var(--color-accent-cta)] md:px-6"
        >
          {children}
        </div>
        {rodape && <div className="shrink-0 border-t border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-4 md:px-6">{rodape}</div>}
      </div>
    </dialog>,
    alvo
  );
}
