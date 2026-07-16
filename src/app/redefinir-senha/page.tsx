import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RedefinirSenhaForm } from './redefinir-senha-form';

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg-canvas)] px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <Text as="h1" variant="heading-lg">
              Link expirado
            </Text>
            <Text variant="body-sm" color="secondary">
              Esse link de redefinição de senha expirou ou já foi usado.
            </Text>
            <Button asChild fullWidth>
              <Link href="/esqueci-senha">Solicitar novo link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg-canvas)] px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5 p-8">
          <div>
            <Text as="h1" variant="heading-lg">
              Nova senha
            </Text>
            <Text variant="body-sm" color="secondary" className="mt-1">
              Escolha uma senha nova pra sua conta.
            </Text>
          </div>
          <RedefinirSenhaForm next={next ?? '/conta'} />
        </CardContent>
      </Card>
    </div>
  );
}
