import Link from 'next/link';
import { ArrowRight, Box, Cpu, BookOpen, House, Tv, Dumbbell, Send, MessageCircle } from 'lucide-react';
import type { ComponentType } from 'react';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { LojaPlusView } from '@/server/plus';

const ICONES: Record<string, ComponentType<{ className?: string }>> = {
  impressao3d: Box,
  tecnologia: Cpu,
  livros: BookOpen,
  eletrodomesticos: House,
  eletroeletronicos: Tv,
  esporte: Dumbbell,
};

/** Cartão de uma loja do Espaço Geek Plus. Área aberta leva aos produtos; fechada mostra o estado e os canais. Sem imagem (ícone), sem selo. */
export function CartaoLojaPlus({ loja }: { loja: LojaPlusView }) {
  const Icone = ICONES[loja.dept] ?? Box;
  const canais = (
    <div className="flex flex-wrap gap-2 text-[13px]">
      {loja.telegramUrl ? (
        <a
          href={loja.telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 border border-[var(--color-border-default)] px-3 hover:border-[var(--color-accent-primary)]"
        >
          <Send className="size-3.5" /> Telegram
        </a>
      ) : null}
      {loja.whatsappUrl ? (
        <a
          href={loja.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 border border-[var(--color-border-default)] px-3 hover:border-[var(--color-accent-primary)]"
        >
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>
      ) : null}
    </div>
  );
  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-11 items-center justify-center border border-[var(--color-border-default)] text-[var(--color-accent-primary)]">
          <Icone className="size-5" />
        </span>
        <Text variant="label" color="tertiary">
          {loja.aberta ? (loja.produtos > 0 ? `${loja.produtos} ${loja.produtos === 1 ? 'produto' : 'produtos'}` : 'Aberta') : 'Em montagem'}
        </Text>
      </div>
      <div className="flex flex-col gap-1">
        <Text as="h3" variant="heading-md" className="font-bold">{loja.rotulo}</Text>
        <Text variant="body-sm" color="secondary">{loja.chamada}</Text>
        {!loja.aberta ? (
          <Text variant="caption" color="tertiary" className="mt-1">
            A área abre quando houver produtos aprovados com oferta verificada. Enquanto isso, o aviso de preços já corre no canal da loja.
          </Text>
        ) : null}
      </div>
      <div className="mt-auto flex flex-col gap-3">
        {loja.aberta ? (
          <Link
            href={`/mercado/${loja.dept}`}
            className="inline-flex min-h-11 items-center justify-between gap-2 border border-[var(--color-accent-primary)] px-4 text-[14px] font-bold text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
          >
            Ver produtos de {loja.rotulo} <ArrowRight className="size-4" />
          </Link>
        ) : null}
        {canais}
      </div>
    </Card>
  );
}
