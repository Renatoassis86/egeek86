'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

function EsqueciSenhaForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/conta';

  const [email, setEmail] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);

    const supabase = createSupabaseBrowserClient();
    const redirectNext = `/redefinir-senha?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectNext)}`,
    });

    setSending(false);
    if (error) {
      toast.error('Não foi possível enviar o link agora. Tente novamente em instantes.');
      return;
    }
    // Sempre a mesma mensagem, exista ou não o e-mail — evita revelar se uma conta existe.
    setSent(true);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg-canvas)] px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5 p-8">
          <div>
            <Text as="h1" variant="heading-lg">
              Redefinir senha
            </Text>
            <Text variant="body-sm" color="secondary" className="mt-1">
              Informe seu e-mail e enviamos um link pra você criar uma senha nova.
            </Text>
          </div>

          {sent ? (
            <Text variant="body-sm" color="secondary">
              Se esse e-mail estiver cadastrado, você vai receber um link pra redefinir sua senha em
              instantes.
            </Text>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                type="email"
                required
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftAddon={<Mail />}
                autoComplete="email"
              />
              <Button type="submit" loading={sending} fullWidth>
                Enviar link
              </Button>
            </form>
          )}

          <Link
            href="/entrar"
            className="self-center text-body-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            Lembrou a senha? Entrar
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EsqueciSenhaPage() {
  return (
    <Suspense fallback={null}>
      <EsqueciSenhaForm />
    </Suspense>
  );
}
