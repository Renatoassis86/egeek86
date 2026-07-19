'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Mail, Lock, User, Phone, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { CornerBrackets } from '@/components/motion/corner-brackets';
import { PLATFORM_VALUES, PLATFORM_LABELS, type Platform } from '@/lib/auth/platforms';
import { completeRegistration } from '@/server/actions/auth';

const MIN_PASSWORD_LENGTH = 8;

function EntrarForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/conta';

  const [mode, setMode] = React.useState<'login' | 'register'>('login');

  return (
    <div className="grid min-h-dvh bg-[var(--color-bg-canvas)] lg:grid-cols-2">
      {/* Painel visual — split-screen só em lg+ (docs/dimensoes-imagens.md
          item 17). Em telas menores o form volta a ser centralizado sozinho,
          sem cortar a foto num painel baixo demais pra fazer sentido. */}
      <div className="relative hidden overflow-hidden lg:block">
        <Image
          src="/images/login/split-panel.png"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-canvas)] via-transparent to-[var(--color-bg-canvas)]/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[var(--color-bg-canvas)]/50" />
        <CornerBrackets inset={28} size={32} />
        <div className="absolute inset-x-10 bottom-12">
          <Text variant="label" color="tertiary">
            Espaço Geek 86
          </Text>
          <Text as="p" variant="heading-md" className="mt-2 max-w-[22ch]">
            Sua conta, seu painel de dado.
          </Text>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-10">
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
  
  // Perfil e Questionário de Credenciais
  const [roleChoice, setRoleChoice] = React.useState<'comprador' | 'afiliado' | 'colecionador'>('comprador');
  const [affiliateSocialLink, setAffiliateSocialLink] = React.useState('');
  const [affiliateAudience, setAffiliateAudience] = React.useState('1k-10k');
  const [collectorSize, setCollectorSize] = React.useState('');
  const [collectorFocus, setCollectorFocus] = React.useState('');
  const [collectorFacePhoto, setCollectorFacePhoto] = React.useState('');

  const [sending, setSending] = React.useState(false);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = React.useState(false);
  const [registrationError, setRegistrationError] = React.useState<string | null>(null);

  function togglePlatform(value: Platform) {
    setPlatforms((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));
  }

  const handleFacePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCollectorFacePhoto(reader.result);
        toast.success('Foto da coleção com seu rosto carregada com sucesso!');
      }
    };
    reader.readAsDataURL(file);
  };

  function validateClientSide(): string | null {
    if (name.trim().length < 2) return 'Informe seu nome completo.';
    if (phone.replace(/\D/g, '').length < 10) return 'Informe um WhatsApp válido, com DDD.';
    if (platforms.length === 0) return 'Selecione ao menos uma plataforma.';
    if (password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    if (password !== confirmPassword) return 'As senhas não coincidem.';
    
    if (roleChoice === 'afiliado' && !affiliateSocialLink.trim()) {
      return 'Informe o link da sua rede social principal para credenciamento.';
    }
    
    if (roleChoice === 'colecionador') {
      if (!collectorSize || Number(collectorSize) <= 0) {
        return 'Informe o número aproximado de itens da sua coleção.';
      }
      if (!collectorFocus.trim()) {
        return 'Informe sua principal franquia ou foco de coleção.';
      }
      if (!collectorFacePhoto) {
        return 'Por segurança, você deve enviar uma foto da sua coleção contendo o seu rosto.';
      }
    }
    return null;
  }

  async function finishRegistration() {
    const result = await completeRegistration({
      name,
      phone,
      platforms,
      roleChoice,
      affiliateSocialLink,
      affiliateAudience,
      collectorSize: collectorSize ? Number(collectorSize) : undefined,
      collectorFocus,
      collectorFacePhoto,
    });
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

      {/* Seleção do Tipo de Acesso */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
        <Text variant="caption" color="tertiary" className="font-bold">
          Qual seu objetivo na plataforma?
        </Text>
        <div className="grid grid-cols-1 gap-2">
          <Button
            type="button"
            size="sm"
            variant={roleChoice === 'comprador' ? 'primary' : 'outline'}
            className="justify-start text-left"
            onClick={() => setRoleChoice('comprador')}
          >
            🛒 Comprador (Acompanhar ofertas e compras)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={roleChoice === 'afiliado' ? 'primary' : 'outline'}
            className="justify-start text-left"
            onClick={() => setRoleChoice('afiliado')}
          >
            🔗 Afiliado (Gerar links e comissões)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={roleChoice === 'colecionador' ? 'primary' : 'outline'}
            className="justify-start text-left"
            onClick={() => setRoleChoice('colecionador')}
          >
            🏆 Colecionador / Leiloeiro (Vender e curadoria)
          </Button>
        </div>
      </div>

      {/* Questionário de Afiliado */}
      {roleChoice === 'afiliado' && (
        <div className="flex flex-col gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)]/40 border border-[var(--color-border-subtle)]">
          <Text variant="caption" className="font-bold text-[var(--color-accent-primary)]">
            Credenciais do Afiliado
          </Text>
          <Input
            type="url"
            required
            placeholder="Link do Instagram, YouTube ou site"
            value={affiliateSocialLink}
            onChange={(e) => setAffiliateSocialLink(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <Text variant="caption" color="tertiary">Média de Seguidores/Público</Text>
            <select
              value={affiliateAudience}
              onChange={(e) => setAffiliateAudience(e.target.value)}
              className="h-10 px-3 rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)] border border-[var(--color-border-default)] text-[14px] text-[var(--color-text-primary)]"
            >
              <option value="1k-10k">1.000 a 10.000 inscritos/seguidores</option>
              <option value="10k-50k">10.000 a 50.000 inscritos/seguidores</option>
              <option value="50k+">Mais de 50.000 inscritos/seguidores</option>
            </select>
          </div>
        </div>
      )}

      {/* Questionário de Colecionador / Leiloeiro */}
      {roleChoice === 'colecionador' && (
        <div className="flex flex-col gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)]/40 border border-[var(--color-border-subtle)]">
          <Text variant="caption" className="font-bold text-[var(--color-accent-hype)]">
            Credenciamento do Colecionador
          </Text>
          <Input
            type="number"
            required
            placeholder="Qtd. aproximada de itens da coleção"
            value={collectorSize}
            onChange={(e) => setCollectorSize(e.target.value)}
          />
          <Input
            type="text"
            required
            placeholder="Foco principal (Ex: Jogos Retro, Consoles)"
            value={collectorFocus}
            onChange={(e) => setCollectorFocus(e.target.value)}
          />

          <div className="flex flex-col gap-2">
            <Text variant="caption" color="tertiary" className="font-medium">
              Foto da coleção mostrando seu rosto (Obrigatório)
            </Text>
            <input
              type="file"
              id="collectorFacePhotoInput"
              accept="image/*"
              onChange={handleFacePhotoUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('collectorFacePhotoInput')?.click()}
            >
              📸 {collectorFacePhoto ? 'Trocar Foto Selecionada' : 'Upload Foto de Rosto + Coleção'}
            </Button>
            {collectorFacePhoto && (
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={collectorFacePhoto} alt="Foto de validação" className="h-full w-full object-cover" />
              </div>
            )}
          </div>
        </div>
      )}

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
