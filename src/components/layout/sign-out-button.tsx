'use client';

import * as React from 'react';
import { LogOut } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

/**
 * Encerra a sessão do Supabase no navegador e recarrega a página inicial,
 * para o servidor reler os cookies e o cabeçalho voltar ao estado de visitante.
 */
export function SignOutButton({
  className,
  children = 'Sair',
  onDone,
}: {
  className?: string;
  children?: React.ReactNode;
  onDone?: () => void;
}) {
  const [pending, setPending] = React.useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } finally {
      onDone?.();
      window.location.assign('/');
    }
  }

  return (
    <button type="button" onClick={handleSignOut} disabled={pending} className={cn('cursor-pointer disabled:opacity-60', className)}>
      <LogOut className="size-3.5" aria-hidden />
      <span>{pending ? 'Saindo...' : children}</span>
    </button>
  );
}
