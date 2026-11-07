'use client';

import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CamadaSobreposta } from '@/components/ui/camada-sobreposta';
import { VerificadoHa } from '@/components/affiliate/verificado-ha';
import { CamadaGrafico } from '@/components/affiliate/camada-grafico';
import { CamadaLojas } from '@/components/affiliate/camada-lojas';
import { formatBRL } from '@/lib/format';
import type { ParecerProduto } from '@/lib/pricing/parecer-produto';
import type { IdentidadeMidia } from '@/lib/pricing/identidade-midia';

/**
 * Conteúdo da camada do produto (Fase 2). Carregado SÓ AO ABRIR (importação dinâmica em `camada-gatilho.tsx`).
 * Só apresenta o contrato `ParecerProduto` (mesma fonte do cartão: paridade); não calcula nada de negócio.
 * Cada painel aparece sozinho quando tem base mínima; sem base, fica oculto. Sem gráficos (Fase 3), sem cor semântica,
 * sem alerta de preço. Dentro da camada (fundo elevado) o texto usa primary/secondary, nunca tertiary (contraste AA).
 */

export interface CamadaProdutoProps {
  parecer: ParecerProduto;
  produtoNome: string;
  /** Identidade da mídia por campo; campo sem dado mostra "não informado". null = não mostra. */
  identidade: IdentidadeMidia | null;
  /** Link de saída da página ("/go/slug"); null = sem botão. */
  compraHref: string | null;
  /** Id do produto mestre para buscar o gráfico (só ao abrir). */
  produtoId: string | null;
  id: string;
  titleId: string;
  origem: DOMRect | null;
  onFechada: () => void;
  retornoFoco: React.RefObject<HTMLElement | null>;
}

function Painel({ titulo, children, ...rest }: { titulo: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className="flex flex-col gap-2 border-b border-[var(--color-border-subtle)] py-4 first:pt-0 last:border-b-0" {...rest}>
      <h3 className="text-label font-medium text-[var(--color-text-secondary)]">{titulo}</h3>
      {children}
    </section>
  );
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-body-md text-[var(--color-text-primary)]">
      {itens.map((t) => (
        <li key={t} className="border-l-2 border-[var(--color-border-strong)] pl-3">
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function CamadaProduto({ parecer, produtoNome, identidade, compraHref, produtoId, id, titleId, origem, onFechada, retornoFoco }: CamadaProdutoProps) {
  const { preco, camada, ultimaMudanca } = parecer;
  return (
    <CamadaSobreposta
      id={id}
      titleId={titleId}
      origem={origem}
      onFechada={onFechada}
      retornoFoco={retornoFoco}
      alturaFixa={Boolean(camada.graficoDisponivel && produtoId)}
      cabecalho={
        <>
          <p className="text-caption text-[var(--color-text-secondary)]">{parecer.titulo}</p>
          <h2 id={titleId} className="text-heading-md font-semibold text-[var(--color-text-primary)]">
            {produtoNome}
          </h2>
          {identidade && (
            <div className="mt-2" data-identidade>
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-[var(--color-text-secondary)]">
                {identidade.itens.map((i) => (
                  <div key={i.rotulo} className="flex gap-1">
                    <dt>{i.rotulo}:</dt>
                    <dd className={i.valor ? 'font-medium text-[var(--color-text-primary)]' : ''}>{i.valor ?? 'não informado'}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-1 text-caption text-[var(--color-text-secondary)]">{identidade.regra}</p>
            </div>
          )}
        </>
      }
      rodape={
        compraHref ? (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <a href={compraHref} target="_blank" rel="noopener noreferrer nofollow sponsored">
              <ShieldCheck className="size-4" aria-hidden />
              Ir à loja
            </a>
          </Button>
        ) : undefined
      }
    >
      <Painel titulo="O que sabemos e o que falta" data-panel="sabemos">
        <Lista itens={camada.sabemos} />
        <p className="mt-2 text-body-sm font-medium text-[var(--color-text-secondary)]">O que ainda não dá para afirmar</p>
        <Lista itens={camada.falta} />
      </Painel>

      <Painel titulo="Preço agora" data-panel="preco">
        {preco ? (
          <div className="flex flex-col gap-1">
            <p className="tabular text-heading-lg leading-none text-[var(--color-text-primary)]">{formatBRL(preco.cents)}</p>
            <p className="text-body-sm text-[var(--color-text-secondary)]">
              {preco.loja ?? preco.empateTexto ?? 'Loja não identificada'} · <VerificadoHa iso={preco.verificadoEmIso} />
            </p>
          </div>
        ) : (
          <p className="text-body-md text-[var(--color-text-secondary)]">Nenhuma oferta verificada nas últimas 48 h.</p>
        )}
      </Painel>

      {camada.lojasHoje && (
        <Painel titulo="Lojas de hoje" data-panel="lojas">
          <p className="text-body-md text-[var(--color-text-primary)]">{camada.lojasHoje.texto} com preço verificado hoje.</p>
          {camada.lojasHoje.valorDoMeioTexto && <p className="text-body-sm text-[var(--color-text-secondary)]">Valor do meio entre as lojas hoje: {camada.lojasHoje.valorDoMeioTexto}.</p>}
          {produtoId && <CamadaLojas produtoId={produtoId} ofertasEsperadas={camada.lojasHoje.ofertas} />}
        </Painel>
      )}

      {ultimaMudanca && (
        <Painel titulo={ultimaMudanca.eDoPrecoAtual ? 'Última mudança do menor preço' : 'Último evento do menor preço'} data-panel="ultima-mudanca">
          <p className="text-body-md text-[var(--color-text-primary)]">{ultimaMudanca.texto}</p>
        </Painel>
      )}

      {camada.metodo && (
        <Painel titulo="Qualidade e método" data-panel="qualidade">
          <p className="text-body-md text-[var(--color-text-primary)]">
            {camada.qualidade.rotulo}. <span className="text-[var(--color-text-secondary)]">{camada.qualidade.resumo}</span>
          </p>
          <dl className="flex flex-col gap-3">
            {camada.metodo.blocos.map((b) => (
              <div key={b.titulo} className="flex flex-col gap-0.5">
                <dt className="text-body-sm font-medium text-[var(--color-text-primary)]">{b.titulo}</dt>
                <dd className="text-body-sm text-[var(--color-text-secondary)]">{b.texto}</dd>
              </div>
            ))}
          </dl>
          {camada.metodo.avisos.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-body-sm font-medium text-[var(--color-text-primary)]">O que pede cuidado</p>
              <ul className="flex flex-col gap-1.5 text-body-sm text-[var(--color-text-secondary)]">
                {camada.metodo.avisos.map((t) => (
                  <li key={t} className="border-l-2 border-[var(--color-border-strong)] pl-3">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Painel>
      )}

      {camada.graficoDisponivel && produtoId && (
        <Painel titulo="Histórico do menor preço" data-panel="grafico">
          <CamadaGrafico produtoId={produtoId} />
        </Painel>
      )}

      {/* Reservado ao futuro alerta de preço (fase própria): sem botão, sem altura. */}
      <div data-slot="alerta-preco" className="hidden" aria-hidden />
    </CamadaSobreposta>
  );
}
