import { formatBRL } from '@/lib/format';
import type { ParecerProduto } from '@/lib/pricing/parecer-produto';
import { VerificadoHa } from '@/components/affiliate/verificado-ha';
import { CamadaGatilho } from '@/components/affiliate/camada-gatilho';

/**
 * Cartão-pai "O que sabemos hoje" (atrás de PRODUCT_CARD_V1). Server component, só apresentação do contrato
 * `ParecerProduto`: não calcula nada de negócio. Guia visual: docs/guia-visual-cartao-pai.md.
 *
 * Só tokens existentes; cantos retos; cor só de marca e neutros (nenhuma cor semântica fora de juízo; o juízo está desligado).
 * Estados: `formacao` (contorno tracejado) e `fato` (contorno sólido). `juizo` é slot oculto, sem altura e sem texto.
 *
 * Altura reservada (min-h) = menor altura MEDIDA de cada estado e breakpoint (formacao 332/272 px, fato 436/356 px; mobile 360/desktop), com a linha da última mudança do menor preço; o conteúdo vem do servidor,
 * então o mínimo só protege contra encolhimento. CLS medido do cartão: 0.
 *
 * O cartão inteiro é clicável: o botão (`CamadaGatilho`, componente cliente) tem um pseudo-elemento que cobre o cartão e abre a
 * camada (Fase 2) que cresce a partir dele. O texto do cartão fica fora do botão. A camada é um chunk carregado só ao abrir.
 */

const compactar = (s: string, max = 70) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** "i" com explicação (jargão fora do texto principal). Alvo de 24 px; `relative z-10` para ficar acima da área clicável do cartão. */
function Explica({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <details className="relative z-10 mt-1">
      <summary
        aria-label={rotulo}
        className="inline-flex size-6 cursor-pointer list-none items-center justify-center border border-[var(--color-border-default)] text-[11px] font-semibold leading-none text-[var(--color-text-secondary)] marker:content-none [&::-webkit-details-marker]:hidden"
      >
        i
      </summary>
      <span className="mt-1 block border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-2 text-caption text-[var(--color-text-secondary)]">{children}</span>
    </details>
  );
}

export function ProductCardV1({
  parecer,
  produtoNome,
  identidade = null,
  compraHref = null,
  produtoId = null,
}: {
  parecer: ParecerProduto;
  produtoNome: string;
  /** Identidade da mídia (formato, geração, edição) quando já conhecida; vai ao cabeçalho da camada. */
  identidade?: string | null;
  /** Link de saída já usado pela página ("/go/slug"); vai ao rodapé da camada. */
  compraHref?: string | null;
  /** Id do produto mestre: a camada busca o gráfico por ele, só ao abrir. null = painel do gráfico oculto. */
  produtoId?: string | null;
}) {
  const { preco, comparacao, cobertura, menorRegistrado, ultimaMudanca } = parecer;
  const formacao = parecer.estado === 'formacao';

  return (
    <article
      aria-label={parecer.titulo}
      data-state={parecer.estado}
      className={`relative flex flex-col gap-3 bg-[var(--color-bg-surface)] p-4 lg:p-5 has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-[var(--color-border-focus)] light:has-[button:focus-visible]:outline-[var(--color-accent-cta)] ${
        formacao
          ? 'min-h-[20.75rem] border border-dashed border-[var(--color-border-strong)] lg:min-h-[17rem]'
          : 'min-h-[27.25rem] border border-[var(--color-border-default)] lg:min-h-[22.25rem]'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-label font-medium text-[var(--color-text-tertiary)]">{parecer.titulo}</h2>
        <span className="text-caption text-[var(--color-text-secondary)]">{parecer.rotuloEstado}</span>
      </div>

      {preco ? (
        <div className="flex flex-col gap-2">
          <p className="tabular text-heading-lg leading-none text-[var(--color-text-primary)]">{formatBRL(preco.cents)}</p>
          <p className="text-caption text-[var(--color-text-tertiary)]">
            {preco.loja ?? preco.empateTexto ? `${preco.loja ?? preco.empateTexto} · ` : ''}
            <VerificadoHa iso={preco.verificadoEmIso} />
          </p>
        </div>
      ) : (
        <p className="text-body-sm text-[var(--color-text-tertiary)]">Nenhuma oferta verificada nas últimas 48 h. Não mostramos preço para não exibir dado velho.</p>
      )}

      {comparacao ? (
        <div className="flex flex-col gap-1 border-l-2 border-[var(--color-border-strong)] bg-[var(--color-bg-inset)] p-3">
          <p className="text-body-md text-[var(--color-text-primary)]">{comparacao.frase}</p>
          <div className="text-caption text-[var(--color-text-secondary)]">
            {comparacao.apoio}
            <Explica rotulo="O que é o valor do meio">É o valor do meio: metade das lojas cobra menos, metade cobra mais. Muda a cada coleta.</Explica>
          </div>
        </div>
      ) : (
        preco && <p className="text-body-md text-[var(--color-text-secondary)]">Ainda não dá para dizer se este preço é bom. Estamos acompanhando.</p>
      )}

      {ultimaMudanca && <p className="text-caption text-[var(--color-text-tertiary)]">{ultimaMudanca.texto}</p>}

      {menorRegistrado && <p className="text-caption text-[var(--color-text-tertiary)]">{menorRegistrado.texto}</p>}

      {parecer.menorIgnoraBaixaReputacao && <p className="text-caption text-[var(--color-text-secondary)]">O menor registrado ignora vendedor de baixa reputação.</p>}

      {parecer.baixaReputacao && <p className="text-caption text-[var(--color-text-secondary)]">Vendedor de baixa reputação: confira antes de comprar.</p>}

      <p className="text-caption text-[var(--color-text-tertiary)]">{cobertura.linha}</p>

      {/* Slots reservados, sem altura e sem texto: juízo (desligado até o backtest) e alerta de preço (fase própria). */}
      <div data-slot="juizo" hidden />
      <div data-slot="alerta-preco" className="hidden" aria-hidden />

      <div className="mt-auto border-t border-[var(--color-border-subtle)]">
        <CamadaGatilho parecer={parecer} produtoNome={produtoNome} rotulo={`Abrir detalhes do preço de ${compactar(produtoNome)}`} identidade={identidade} compraHref={compraHref} produtoId={produtoId} />
      </div>
    </article>
  );
}

/** Aviso de transição do método (selo), mantido sob o cartão quando o selo antigo difere do novo. Mesmo texto do bloco anterior. */
export function AvisoTransicaoSelo() {
  return <p className="text-caption text-[var(--color-text-tertiary)]">Método atualizado: cada oferta vale 1 por dia. O selo pode diferir do que você viu antes.</p>;
}
