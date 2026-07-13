'use client';

import * as React from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export default function LoginPage() {
  const [email, setEmail] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin`,
      },
    });

    setSending(false);
    if (error) {
      toast.error('Não foi possível enviar o link. Tente novamente.');
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg-canvas)] px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5 p-8">
          <div>
            <Text as="h1" variant="heading-lg">
              Entrar
            </Text>
            <Text variant="body-sm" color="secondary" className="mt-1">
              Acesso restrito à administração do Espaço Geek 86.
            </Text>
          </div>

          {sent ? (
            <Text variant="body-sm" color="secondary">
              Enviamos um link de acesso para <strong>{email}</strong>. Abra seu e-mail e clique no
              link para entrar.
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
              />
              <Button type="submit" loading={sending} fullWidth>
                Enviar link de acesso
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
