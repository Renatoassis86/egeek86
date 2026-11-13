// Secao da home (modulo extraido de app/(shop)/page.tsx, checklist #5). Pesquisa da comunidade na home.
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import type { SurveyAggregation } from '@/server/queries/survey';
import { GamerSurvey } from '@/components/home/gamer-survey';

export function SurveySection({ surveyData }: { surveyData: SurveyAggregation }) {
  const platformQuestion = surveyData.questions.find((q) => q.key === 'platform');
  const initialOptions = (platformQuestion?.options ?? []).map((opt) => ({
    id: opt.value,
    label: opt.label,
    votes: opt.count,
  }));

  return (
    <section data-theme="light" className="w-full bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-amber-600/10 border-b border-amber-300/40 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-14 lg:items-center">
        <Reveal>
          <GamerSurvey initialOptions={initialOptions} />
        </Reveal>
        <Reveal delay={0.08}>
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 border border-amber-500/40 w-fit">
              Voz da Comunidade
            </span>
            <Text as="h2" variant="display-lg" className="font-black text-zinc-900 tracking-tight">
              Responda às enquetes sobre games.
            </Text>
            <Text variant="body-lg" className="leading-relaxed text-zinc-700 font-medium">
              Os resultados ao lado são a contagem das respostas já enviadas na pesquisa.
            </Text>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
