'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Mail, Lock, User, Phone, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { PLATFORM_VALUES, PLATFORM_LABELS, type Platform } from '@/lib/auth/platforms';
import { completeRegistration } from '@/server/actions/auth';

const MIN_PASSWORD_LENGTH = 8;

function EntrarForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/conta';

  const [mode, setMode] = React.useState<'login' | 'register'>('login');

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg-canvas)] px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5 p-8">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[var(--color-accent-hype)]">
              <Sparkles className="size-4" />
              <Text variant="label">Geek Deals</Text>
            </div>
            <Text as="h1" variant="heading-lg">
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Text>
            <Text variant="body-sm" color="secondary" className="mt-1">
              Acompanhe preços e receba alertas dos jogos que você quer.
            </Text>
          </div>

          {mode === 'login' ? <LoginForm next={next} /> : <RegisterForm next={next} />}

          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="self-center text-body-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            {mode === 'login' ? 'Ainda não tem conta? Cadastrar' : 'Já tem conta? Entrar'}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [sending, setSending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setSending(false);
      toast.error('E-mail ou senha inválidos.');
      return;
    }

    // Navegação completa (não router.push) pra garantir que o próximo
    // Server Component leia o cookie de sessão recém-criado.
    window.location.href = next;
  }

  return (
    <>
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
        <Input
          type="password"
          required
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftAddon={<Lock />}
          autoComplete="current-password"
        />
        <Button type="submit" loading={sending} fullWidth>
          Entrar
        </Button>
      </form>
      <Link
        href={`/esqueci-senha?next=${encodeURIComponent(next)}`}
        className="self-center text-body-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
      >
        Esqueceu a senha ou nunca criou uma?
      </Link>
    </>
  );
}

function RegisterForm({ next }: { next: string }) {
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [platforms, setPlatforms] = React.useState<Platform[]>([]);
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = React.useState(false);
  const [registrationError, setRegistrationError] = React.useState<string | null>(null);

  function togglePlatform(value: Platform) {
    setPlatforms((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));
  }

  function validateClientSide(): string | null {
    if (name.trim().length < 2) return 'Informe seu nome completo.';
    if (phone.replace(/\D/g, '').length < 10) return 'Informe um WhatsApp válido, com DDD.';
    if (platforms.length === 0) return 'Selecione ao menos uma plataforma.';
    if (password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    if (password !== confirmPassword) return 'As senhas não coincidem.';
    return null;
  }

  async function finishRegistration() {
    const result = await completeRegistration({ name, phone, platforms });
    if (!result.ok) {
      setSending(false);
      setRegistrationError(result.error);
      return;
    }
    window.location.href = next;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientError = validateClientSide();
    if (clientError) {
      toast.error(clientError);
      return;
    }

    setSending(true);
    setRegistrationError(null);

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, phone } },
    });

    if (error) {
      setSending(false);
      if (error.status === 422 || error.message.toLowerCase().includes('registered')) {
        toast.error('Esse e-mail já tem uma conta. Tente entrar ou redefinir a senha.');
      } else if (error.message.toLowerCase().includes('password')) {
        toast.error(`Senha muito curta ou fraca. Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      } else {
        toast.error('Não foi possível criar sua conta. Tente novamente.');
      }
      return;
    }

    if (!data.session) {
      setSending(false);
      setAwaitingEmailConfirmation(true);
      return;
    }

    await finishRegistration();
  }

  if (awaitingEmailConfirmation) {
    return (
      <Text variant="body-sm" color="secondary">
        Enviamos um link de confirmação pra <strong>{email}</strong>. Abra seu e-mail e clique no
        link pra ativar sua conta.
      </Text>
    );
  }

  if (registrationError) {
    return (
      <div className="flex flex-col gap-3">
        <Text variant="body-sm" color="danger">
          {registrationError}
        </Text>
        <Button
          type="button"
          fullWidth
          loading={sending}
          onClick={() => {
            setSending(true);
            finishRegistration();
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        type="text"
        required
        placeholder="Nome completo"
        value={name}
        onChange={(e) => setName(e.target.value)}
        leftAddon={<User />}
        autoComplete="name"
      />
      <Input
        type="tel"
        required
        placeholder="WhatsApp (com DDD)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        leftAddon={<Phone />}
        autoComplete="tel"
      />
      <Input
        type="email"
        required
        placeholder="seu@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        leftAddon={<Mail />}
        autoComplete="email"
      />

      <div className="flex flex-col gap-2">
        <Text variant="caption" color="tertiary">
          Quais plataformas você joga?
        </Text>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_VALUES.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={platforms.includes(value) ? 'primary' : 'outline'}
              onClick={() => togglePlatform(value)}
            >
              {PLATFORM_LABELS[value]}
            </Button>
          ))}
        </div>
      </div>

      <Input
        type="password"
        required
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        leftAddon={<Lock />}
        autoComplete="new-password"
      />
      <Input
        type="password"
        required
        placeholder="Confirmar senha"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        leftAddon={<Lock />}
        autoComplete="new-password"
      />

      <Button type="submit" loading={sending} fullWidth>
        Criar conta
      </Button>
    </form>
  );
}

export default function EntrarPage() {
  return (
    <Suspense fallback={null}>
      <EntrarForm />
    </Suspense>
  );
}
