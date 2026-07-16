'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MIN_PASSWORD_LENGTH = 8;

export function RedefinirSenhaForm({ next }: { next: string }) {
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [sending, setSending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setSending(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setSending(false);
      toast.error('Não foi possível redefinir sua senha. Tente novamente.');
      return;
    }

    // A sessão de recuperação já é uma sessão válida — vai direto pro destino, sem logar de novo.
    window.location.href = next;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        type="password"
        required
        placeholder="Nova senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        leftAddon={<Lock />}
        autoComplete="new-password"
      />
      <Input
        type="password"
        required
        placeholder="Confirmar nova senha"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        leftAddon={<Lock />}
        autoComplete="new-password"
      />
      <Button type="submit" loading={sending} fullWidth>
        Salvar nova senha
      </Button>
    </form>
  );
}
