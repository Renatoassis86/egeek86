import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export const metadata = { title: 'Ranking de Colecionadores' };

/**
 * Ranking de colecionadores — ainda sem dado real.
 *
 * A versão anterior listava 6 usuários, níveis de XP e "positivação" escritos
 * à mão no código sob um selo de atualização instantânea (auditoria 2026-10-30).
 * Não existe no banco nenhuma tabela de XP/positivação, então a regra de dado
 * real (AGENTS.md) impede qualquer lista aqui. Esta página volta a mostrar um
 * ranking quando houver métrica real de colecionadores.
 */
export default function RankingPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 lg:px-8 py-16 lg:py-24 text-center">
      <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-[var(--color-accent-gold)]/15 text-[var(--color-accent-gold)]">
        <Trophy className="size-7" />
      </div>
      <Text as="h1" variant="heading-xl" className="font-black tracking-tight">
        Ranking de colecionadores
      </Text>
      <Text variant="body-md" color="secondary" className="mt-4 leading-relaxed">
        Ainda não há ranking publicado. Ele só será exibido quando existirem pontuações reais de
        colecionadores medidas na plataforma — não mostramos nomes ou números de exemplo.
      </Text>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg" variant="primary">
          <Link href="/ofertas">Ver ofertas com preço real</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/monitoramento">Monitorar preços</Link>
        </Button>
      </div>
    </section>
  );
}
