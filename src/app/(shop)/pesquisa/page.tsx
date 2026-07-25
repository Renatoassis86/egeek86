import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { SurveyForm } from '@/components/survey/survey-form';

export const metadata: Metadata = {
  title: 'Pesquisa de Satisfação',
  description: 'Ajude o Espaço Geek 86 a entender melhor os hábitos de compra e consumo do mercado gamer.',
};

export default function PesquisaPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 lg:px-8 py-10 lg:py-16">
      <Reveal>
        <Badge variant="primary" size="md">
          <ClipboardList className="size-3.5" />
          Pesquisa de Mercado
        </Badge>
        <Text as="h1" variant="display-md" className="mt-3">
          Ajude a gente a entender o mercado gamer.
        </Text>
        <Text variant="body-md" color="secondary" className="mt-3 max-w-[62ch]">
          Leva menos de 2 minutos. Não precisa estar logado. As respostas entram na nossa pesquisa
          de mercado de forma agregada — nunca identificadas publicamente.
        </Text>
      </Reveal>

      <div className="mt-8">
        <SurveyForm />
      </div>
    </section>
  );
}
