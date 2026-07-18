import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/geek-deals/onboarding-form';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { getCurrentProfile } from '@/lib/auth/require-admin';

export const metadata: Metadata = {
  title: 'Onboarding de Colecionador',
  description: 'Seja um Colecionador Vendedor no Espaço Geek 86 e agende seus próprios drops na Hype Zone.',
};

export const dynamic = 'force-dynamic';

export default async function CollectorOnboardingPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/entrar?next=/conta/vendedor/onboarding');
  }

  return (
    <section className="mx-auto max-w-4xl px-4 lg:px-8 py-10 lg:py-14">
      <Reveal>
        <div className="text-center mb-8">
          <Text as="h1" variant="heading-xl">
            Qualificação do Colecionador
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-2 max-w-lg mx-auto">
            Ao se tornar um Colecionador Vendedor, você poderá agendar seus próprios lançamentos de itens 
            raros. Responda às perguntas abaixo de forma sincera e clara para construir sua reputação.
          </Text>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <OnboardingForm />
      </Reveal>
    </section>
  );
}
