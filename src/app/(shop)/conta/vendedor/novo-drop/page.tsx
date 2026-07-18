import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sellers } from '@/db/schema';
import { CreateDropForm } from '@/components/geek-deals/create-drop-form';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { getCurrentProfile } from '@/lib/auth/require-admin';

export const metadata: Metadata = {
  title: 'Criar Novo Drop',
  description: 'Cadastre e agende seu item colecionável de edição limitada na Hype Zone.',
};

export const dynamic = 'force-dynamic';

export default async function NewCollectorDropPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/entrar?next=/conta/vendedor/novo-drop');
  }

  // Verifica se o usuário já completou o onboarding e é um vendedor ativo
  const [seller] = await db
    .select()
    .from(sellers)
    .where(and(eq(sellers.userId, profile.id), eq(sellers.status, 'active')))
    .limit(1);

  if (!seller) {
    redirect('/conta/vendedor/onboarding');
  }

  return (
    <section className="mx-auto max-w-4xl px-4 lg:px-8 py-10 lg:py-14">
      <Reveal>
        <div className="text-center mb-8">
          <Text as="h1" variant="heading-xl">
            Lançar Novo Item
          </Text>
          <Text variant="body-sm" color="secondary" className="mt-2 max-w-lg mx-auto">
            Preencha os detalhes e a história do seu item colecionável e agende o horário em que o botão de 
            compra será liberado na Hype Zone.
          </Text>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <CreateDropForm />
      </Reveal>
    </section>
  );
}
