import Link from 'next/link';
import { Text } from '@/components/ui/text';
import { ProductImage } from '@/components/ui/product-image';
import { VerificadoHa } from '@/components/affiliate/verificado-ha';
import { formatBRL } from '@/lib/format';
import { ROTULO_REDE_GUIA, linhasAviso, variacaoSobreRegistrado } from '@/lib/catalog/guia-3d';
import type { ItemGuiaComRegistro } from '@/server/queries/guia-3d';

/**
 * GUIA DAS IMPRESSORAS 3D PRIORITARIAS (dono, 2026-11-15, #111). Componente de servidor (recebe os dados prontos; nao importa banco).
 * Ordem fixa: a impressora COM COMBO primeiro (P2S Combo, P1S Combo, A1 Combo, A1 Mini Combo), depois as sem combo (mesma coluna da irma com
 * combo, logo abaixo no desktop), por ultimo a Kobra. Mostra o MENOR preco do modelo entre as lojas; loja sem oferta diz "sem oferta nesta loja agora".
 * Sem selo, sem media inventada: "menor preco registrado" vem da estatistica oficial e a variacao e so a conta (atual contra registrado).
 */
function CartaoGuia({ item, destaque, priority }: { item: ItemGuiaComRegistro; destaque: boolean; priority: boolean }) {
  const variacao = item.menor ? variacaoSobreRegistrado(item.menor.precoCents, item.registradoCents) : null;
  const detalhe = item.masterSlug ? `/mercado/impressao3d/${item.masterSlug}` : null;
  const corpo = (
    <>
      <ProductImage src={item.imagem} alt={item.nome} ratio="square" priority={priority} className="w-full" />
      <div className="flex flex-col gap-1">
        {item.combo ? <Text variant="label" className="text-[var(--color-accent-primary)]">Com combo</Text> : <Text variant="label" color="tertiary">{item.familia === 'kobra' ? 'Anycubic Kobra' : 'Sem combo'}</Text>}
        <Text as="h3" variant="heading-sm" className="line-clamp-2 font-bold leading-snug">{item.familia === 'kobra' ? item.nome : item.rotulo}</Text>
      </div>
    </>
  );
  return (
    <div className={`flex h-full flex-col gap-3 border p-4 ${destaque ? 'border-[var(--color-accent-primary)] bg-[var(--color-bg-surface)]' : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]'}`}>
      {detalhe ? (
        <Link href={detalhe} className="flex flex-col gap-3 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]">{corpo}</Link>
      ) : (
        <div className="flex flex-col gap-3">{corpo}</div>
      )}
      {item.menor ? (
        <div className="flex flex-col gap-1">
          <Text variant="label" color="tertiary">Menor preço agora</Text>
          <Text variant="mono-lg" className="font-black text-[var(--color-accent-primary)]">{formatBRL(item.menor.precoCents)}</Text>
          <Text variant="caption" color="tertiary">
            em {item.menor.redeNome} · <VerificadoHa iso={item.menor.verificadoEm} />
          </Text>
          {item.registradoCents ? (
            <Text variant="caption" color="secondary">
              Menor registrado: {formatBRL(item.registradoCents)}
              {variacao !== null ? ` · agora ${variacao === 0 ? 'igual' : variacao > 0 ? `${variacao}% acima` : `${Math.abs(variacao)}% abaixo`}` : ''}
            </Text>
          ) : null}
        </div>
      ) : (
        <Text variant="body-sm" color="secondary">Sem oferta confirmada agora em nenhuma loja.</Text>
      )}
      <ul className="mt-auto flex flex-col gap-1 border-t border-[var(--color-border-subtle)] pt-2">
        {item.lojas.map((l) => (
          <li key={l.rede} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="text-[var(--color-text-secondary)]">{l.redeNome}</span>
              <a href={`/go/${l.ofertaSlug}`} rel="nofollow noopener sponsored" className="inline-flex min-h-11 items-center font-mono font-bold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]">
                {formatBRL(l.precoCents)}{item.menor?.rede === l.rede ? ' · menor' : ''}
              </a>
            </div>
            {linhasAviso(l.aviso).map((t) => (
              <span key={t} className="break-words text-[12px] leading-snug text-[var(--color-text-secondary)]">{t}</span>
            ))}
          </li>
        ))}
        {item.semOferta.map((r) => (
          <li key={r} className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-text-tertiary)]">
            <span>{ROTULO_REDE_GUIA[r]}</span>
            <span>sem oferta nesta loja agora</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GuiaImpressoras3d({ itens }: { itens: ItemGuiaComRegistro[] }) {
  if (!itens.some((i) => i.menor)) return null;
  const principais = itens.filter((i) => i.familia !== 'kobra');
  const kobras = itens.filter((i) => i.familia === 'kobra');
  return (
    <section id="guia" aria-labelledby="guia-3d-titulo" className="mb-10 scroll-mt-24">
      <div className="mb-4 flex max-w-[70ch] flex-col gap-1 border-l-2 border-[var(--color-accent-primary)] pl-4">
        <Text variant="label" color="tertiary">Espaço Geek Plus · Guia</Text>
        <Text as="h2" id="guia-3d-titulo" variant="heading-lg" className="font-black tracking-tight">Guia das impressoras 3D Bambu Lab</Text>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {principais.map((i, idx) => (
          <li key={i.slug} className="min-w-0">
            <CartaoGuia item={i} destaque={i.combo} priority={idx < 4} />
          </li>
        ))}
      </ul>
      {kobras.length > 0 ? (
        <div className="mt-8">
          <Text as="h3" variant="heading-md" className="mb-3 font-bold">Anycubic Kobra</Text>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kobras.map((i) => (
              <li key={i.slug} className="min-w-0">
                <CartaoGuia item={i} destaque={false} priority={false} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
