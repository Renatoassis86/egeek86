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
            Qualificação do Colecionador / Leiloeiro
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-2 max-w-lg mx-auto">
            Ao se tornar um Colecionador Vendedor ou Leiloeiro, você poderá agendar seus próprios lançamentos de itens 
            raros. Responda às perguntas abaixo para enviar seu perfil à validação.
          </Text>

          {/* Banner Explicativo de Validação em até 48h */}
          <div className="mt-6 p-5 rounded-[var(--radius-lg)] border border-[var(--color-accent-gold)]/40 bg-[var(--color-accent-gold)]/5 text-left flex flex-col gap-3 max-w-2xl mx-auto">
            <div className="flex items-center gap-2 text-[var(--color-accent-gold)] font-bold text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-accent-gold)]/20 text-xs">⏱️</span>
              <span>Como funciona o processo de validação e aprovação (Prazo de até 48h)</span>
            </div>
            <Text variant="body-sm" color="secondary" className="text-xs leading-relaxed">
              Para garantir a máxima segurança, transparência e autenticidade da nossa comunidade, todas as solicitações de credenciamento passam por um processo interno de auditoria:
            </Text>
            <ul className="list-disc pl-5 text-xs text-[var(--color-text-secondary)] flex flex-col gap-1.5 leading-relaxed">
              <li><strong>1. Análise de Dados e Perfil:</strong> Nossa moderação analisa a biografia e o histórico informado sobre sua coleção.</li>
              <li><strong>2. Validação de Autenticidade:</strong> Conferimos a documentação básica e as referências da sua atuação no mercado geek.</li>
              <li><strong>3. Retorno da Análise em até 48 horas:</strong> Em <strong>até 48 horas</strong>, enviaremos o resultado por e-mail e liberaremos a criação de Drops na Hype Zone e Lotes no Geek Hammer!</li>
            </ul>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <OnboardingForm />
      </Reveal>
    </section>
  );
}
