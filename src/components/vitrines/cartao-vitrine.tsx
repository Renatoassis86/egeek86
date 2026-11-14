import Link from 'next/link';
import { ProductImage } from '@/components/ui/product-image';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PlataformaVitrine, PosicaoMedia, VitrineItem } from '@/lib/vitrines/tipos';

/** Sem 'server-only' nem estado: pode ser renderizado no servidor ou dentro da faixa (cliente). */

export const ALTURA_IMAGEM_PX = 120;
/** Altura FIXA do cartão (e do esqueleto): igual em qualquer conteúdo, logo 0 CLS. Teto do checklist #6: 400 px. */
export const ALTURA_CARTAO_PX = 384;
export const ALTURA_MAX_CARTAO_PX = 400;

const ROTULO_PLATAFORMA: Record<PlataformaVitrine, string> = {
  ps5: 'PS5',
  ps4: 'PS4',
  switch_2: 'Switch 2',
  switch_1: 'Switch',
  xbox_series: 'Xbox Series',
  pc: 'PC e portáteis',
};

const FORMATO_HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const FORMATO_DATA_COMPLETA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** "11:42" no mesmo dia (Brasília), senão "12/11 11:42". Data inválida devolve null (nada inventado). */
export function horaDaLeitura(iso: string | null | undefined, agora: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hora = FORMATO_HORA.format(d);
  return FORMATO_DATA.format(d) === FORMATO_DATA.format(agora) ? hora : `${FORMATO_DATA.format(d)} ${hora}`;
}

export function rotuloPlataforma(p: PlataformaVitrine | null): string | null {
  return p ? ROTULO_PLATAFORMA[p] : null;
}

/**
 * Posição contra a média única. `media.cotacoes` é contagem de COTAÇÕES (nunca "ofertas"; ver CHECKLIST, suporte de dados, item 74).
 * Sem base (menos de 5 cotações ou 14 dias): não afirma posição.
 */
function textoPosicao(p: PosicaoMedia, cotacoes: number | null, dias: number | null): { texto: string; bom: boolean } {
  const base = cotacoes != null && dias != null ? ` (${cotacoes.toLocaleString('pt-BR')} cotações, ${dias} dias)` : '';
  switch (p.tipo) {
    case 'abaixo':
      return { texto: `${Math.round(p.pct)}% abaixo da média${base}`, bom: true };
    case 'em_linha':
      return { texto: `Em linha com a média${base}`, bom: false };
    case 'acima':
      return { texto: `${Math.round(p.pct)}% acima da média${base}`, bom: false };
    default:
      return { texto: 'Base de preços ainda curta', bom: false };
  }
}

function textoOfertas(item: VitrineItem): string {
  const o = item.ofertasAtivas;
  const l = item.lojasAtivas;
  return `${o} ${o === 1 ? 'oferta' : 'ofertas'} em ${l} ${l === 1 ? 'loja' : 'lojas'}`;
}

/**
 * Cartão único das vitrines (checklist #9): 6 indicadores com rótulo fixo, nesta ordem:
 * 1 preço agora (com horário de leitura, R-39) · 2 média das lojas · 3 posição contra a média ·
 * 4 menor preço registrado · 5 mudança do menor preço (na lista própria de mudanças) · 6 ofertas ativas.
 * Texto >= 12 px; o cartão inteiro é um alvo de toque de 384 px de altura.
 */
export function CartaoVitrine({ item, prioridade = false, className }: { item: VitrineItem; prioridade?: boolean; className?: string }) {
  const pos = textoPosicao(item.posicao, item.media?.cotacoes ?? null, item.media?.dias ?? null);
  const lido = horaDaLeitura(item.lidoEm);
  const plataforma = rotuloPlataforma(item.plataforma);
  const reg = item.menorRegistrado;
  const promo = item.promoPrime ?? null;

  return (
    <article
      className={cn('border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]', className)}
      style={{ height: ALTURA_CARTAO_PX }}
    >
      <Link href={item.href} className="flex h-full min-h-11 flex-col gap-1.5 overflow-hidden p-3 hover:bg-[var(--color-bg-inset)]">
        <ProductImage
          src={item.imagemUrl}
          alt={item.titulo}
          ratio="none"
          priority={prioridade}
          fallbackLabel={plataforma ?? undefined}
          className="h-[120px] w-full shrink-0"
        />

        <span className="h-4 text-xs font-semibold uppercase leading-4 tracking-wider text-[var(--color-text-tertiary)]">{plataforma ?? ''}</span>
        <h3 className="line-clamp-2 h-10 text-sm font-semibold leading-5 text-[var(--color-text-primary)]">{item.titulo}</h3>

        <p className="text-xl font-black leading-6 tabular-nums text-[var(--color-text-primary)]">
          <span className="sr-only">{promo ? 'Preço com a promoção Prime na finalização: ' : 'Preço agora: '}</span>
          {formatBRL(promo ? promo.finalCentavos : item.precoCentavos)}
        </p>

        <p className="h-4 truncate text-xs leading-4 text-[var(--color-text-secondary)]">
          {promo ? (
            <>
              <s>{formatBRL(item.precoCentavos)}</s> prateleira · {Math.round(promo.pct)}% Prime na finalização
            </>
          ) : item.media ? (
            `Média das lojas: ${formatBRL(item.media.centavos)}`
          ) : (
            ''
          )}
        </p>
        <p className={cn('line-clamp-2 h-8 text-xs leading-4', pos.bom ? 'font-semibold text-[var(--color-accent-primary)]' : 'text-[var(--color-text-secondary)]')}>
          {pos.texto}
        </p>
        <p className={cn('h-4 truncate text-xs leading-4', promo || reg?.noMenor ? 'font-semibold text-[var(--color-accent-primary)]' : 'text-[var(--color-text-secondary)]')}>
          {promo
            ? 'Exclusivo Prime'
            : reg?.noMenor
            ? 'No menor preço registrado'
            : reg?.corroborado
              ? `Menor registrado: ${formatBRL(reg.centavos)} (${FORMATO_DATA_COMPLETA.format(new Date(reg.em))})`
              : ''}
        </p>
        <p className="h-4 truncate text-xs leading-4 text-[var(--color-text-secondary)]">{textoOfertas(item)}</p>

        <p className="mt-auto line-clamp-2 text-xs leading-4 text-[var(--color-text-tertiary)]">
          {item.loja}
          {lido ? ` · preço lido às ${lido}` : ''}
        </p>
      </Link>
    </article>
  );
}
