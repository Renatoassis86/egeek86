import Link from 'next/link';
import { ProductImage } from '@/components/ui/product-image';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PlataformaVitrine, PosicaoMedia, VitrineItem } from '@/lib/vitrines/tipos';

/** Sem 'server-only' nem estado: pode ser renderizado no servidor ou dentro da faixa (cliente). */

export const ALTURA_IMAGEM_PX = 152;
/** Teto de altura do cartão (critério do checklist #6: <= 400 px). */
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

/** "11:42" no mesmo dia (Brasília), senão "12/11 11:42". Data inválida devolve null (nada inventado). */
export function horaDaLeitura(iso: string | null | undefined, agora: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hora = FORMATO_HORA.format(d);
  return FORMATO_DATA.format(d) === FORMATO_DATA.format(agora) ? hora : `${FORMATO_DATA.format(d)} ${hora}`;
}

function textoPosicao(p: PosicaoMedia): { texto: string; tom: 'bom' | 'neutro' } {
  switch (p.tipo) {
    case 'abaixo':
      return { texto: `${Math.round(p.pct)}% abaixo da média das lojas`, tom: 'bom' };
    case 'em_linha':
      return { texto: 'Em linha com a média das lojas', tom: 'neutro' };
    case 'acima':
      return { texto: `${Math.round(p.pct)}% acima da média das lojas`, tom: 'neutro' };
    default:
      return { texto: 'Média ainda em formação', tom: 'neutro' };
  }
}

export function CartaoVitrine({ item, prioridade = false, className }: { item: VitrineItem; prioridade?: boolean; className?: string }) {
  const pos = textoPosicao(item.posicao);
  const lido = horaDaLeitura(item.lidoEm);
  const plataforma = item.plataforma ? ROTULO_PLATAFORMA[item.plataforma] : null;
  const evento = item.evento;

  return (
    <article className={cn('flex h-full flex-col border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]', className)}>
      <Link href={item.href} className="flex h-full min-h-11 flex-col gap-2 p-3 hover:bg-[var(--color-bg-inset)]">
        <ProductImage
          src={item.imagemUrl}
          alt={item.titulo}
          ratio="none"
          priority={prioridade}
          fallbackLabel={plataforma ?? undefined}
          className="h-[152px] w-full"
        />

        {plataforma ? (
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">{plataforma}</span>
        ) : null}
        <h3 className="line-clamp-2 min-h-[2.5rem] text-[14px] font-semibold leading-5 text-[var(--color-text-primary)]">{item.titulo}</h3>

        <p className="text-[20px] font-black leading-6 tabular-nums text-[var(--color-text-primary)]">{formatBRL(item.precoCentavos)}</p>

        {evento ? (
          <p className="text-[12px] leading-4 text-[var(--color-accent-primary)]">
            Menor preço mudou de {formatBRL(evento.antesCentavos)} para {formatBRL(evento.centavos)} (-{Math.round(evento.quedaPct)}%)
            {evento.loja ? `, ${evento.loja}` : ''}
          </p>
        ) : (
          <p className={cn('text-[12px] leading-4', pos.tom === 'bom' ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-secondary)]')}>
            {pos.texto}
          </p>
        )}

        {item.menorRegistrado?.noMenor ? (
          <p className="text-[12px] font-semibold leading-4 text-[var(--color-accent-primary)]">No menor preço registrado</p>
        ) : null}

        <p className="mt-auto text-[12px] leading-4 text-[var(--color-text-tertiary)]">
          {item.loja}
          {lido ? ` · preço lido às ${lido}` : ''}
        </p>
      </Link>
    </article>
  );
}
