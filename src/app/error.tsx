'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

// Página de erro da marca (checklist #3): troca a tela padrão do Next quando uma
// rota falha em tempo de execução. Fica dentro do layout raiz (tema e fontes
// presentes). Não mostra a mensagem técnica ao visitante; o `digest` serve para
// casar com o log do servidor.
export default function ErroDaPagina({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('Erro de rota:', error.digest ?? '', error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center lg:px-8">
      <Text variant="label" color="tertiary">
        Espaço Geek 86
      </Text>
      <Text as="h1" variant="heading-xl" className="mt-3 max-w-[24ch]">
        Esta página não carregou agora.
      </Text>
      <Text variant="body-md" color="secondary" className="mt-3 max-w-[46ch]">
        Foi uma falha nossa, não sua. Tente de novo em instantes ou volte para a vitrine de ofertas.
      </Text>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={() => unstable_retry()} leftIcon={<RotateCcw className="size-4" aria-hidden />}>
          Tentar de novo
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/">Voltar para a home</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/ofertas">Ver ofertas</Link>
        </Button>
      </div>
      {error.digest ? (
        <Text variant="caption" color="tertiary" className="mt-6">
          Código do erro: {error.digest}
        </Text>
      ) : null}
    </main>
  );
}
