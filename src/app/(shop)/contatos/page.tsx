import type { Metadata } from 'next';
import { Mail, Phone, MapPin, Send, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Glow } from '@/components/motion/glow';
import { Reveal } from '@/components/motion/reveal';

export const metadata: Metadata = {
  title: 'Contatos & Suporte',
  description: 'Fale com a equipe do Espaço Geek 86. Suporte a colecionadores, parcerias e curadoria.',
};

export default function ContatosPage() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 lg:px-8 py-10 lg:py-16 overflow-hidden">
      {/* Background Glows */}
      <Glow color="gold" size="lg" className="-top-36 -right-24" intensity={0.12} />
      <Glow color="hype" size="md" className="-bottom-28 -left-16" intensity={0.08} />

      {/* Header */}
      <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/30 p-8 md:p-12 mb-12">
        <div className="flex flex-col gap-3 max-w-2xl">
          <Reveal>
            <Badge variant="primary" size="md">
              <MessageSquare className="size-3.5" />
              Atendimento ao Colecionador
            </Badge>
          </Reveal>
          <Reveal delay={0.05}>
            <Text as="h1" variant="display-md" className="text-[32px] md:text-[44px] font-black tracking-tight leading-none">
              Contatos & Suporte
            </Text>
          </Reveal>
          <Reveal delay={0.1}>
            <Text variant="body-md" color="secondary" className="leading-relaxed">
              Dúvidas sobre credenciamento de colecionadores, leilões, drops ou parceria de inteligência? Fale diretamente com nossa equipe oficial.
            </Text>
          </Reveal>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Informações Oficiais de Contato */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <Reveal delay={0.12}>
            <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <CardContent className="p-6 flex flex-col gap-6">
                <Text variant="heading-md" className="font-bold">Canais Oficiais</Text>

                <div className="flex items-start gap-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] shrink-0">
                    <Mail className="size-5" />
                  </div>
                  <div className="flex flex-col">
                    <Text variant="caption" color="tertiary">E-mail de Suporte</Text>
                    <Text variant="body-sm" className="font-semibold text-[var(--color-text-primary)]">
                      suporte@espacogeek86.com.br
                    </Text>
                    <Text variant="caption" color="secondary" className="text-[11px] mt-0.5">
                      Atendimento de Segunda a Sexta, das 09h às 18h
                    </Text>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-hype)]/10 text-[var(--color-accent-hype)] shrink-0">
                    <Phone className="size-5" />
                  </div>
                  <div className="flex flex-col">
                    <Text variant="caption" color="tertiary">WhatsApp & Comunidade</Text>
                    <Text variant="body-sm" className="font-semibold text-[var(--color-text-primary)]">
                      +55 (84) 99886-8686
                    </Text>
                    <Text variant="caption" color="secondary" className="text-[11px] mt-0.5">
                      Suporte rápido e avisos de drops
                    </Text>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] shrink-0">
                    <MapPin className="size-5" />
                  </div>
                  <div className="flex flex-col">
                    <Text variant="caption" color="tertiary">Sede Administrativa</Text>
                    <Text variant="body-sm" className="font-semibold text-[var(--color-text-primary)]">
                      Natal / RN - Brasil
                    </Text>
                    <Text variant="caption" color="secondary" className="text-[11px] mt-0.5">
                      Foro da Comarca de Natal/RN
                    </Text>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={0.15}>
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-6 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-amber-400">
                  <ShieldCheck className="size-5" />
                  <Text variant="heading-sm" className="font-bold text-amber-400">Credenciamento de Colecionadores</Text>
                </div>
                <Text variant="caption" color="secondary" className="leading-relaxed">
                  Quer cadastrar seu acervo para vender drops ou abrir leilões? O credenciamento é feito diretamente pelo cadastro com upload de foto da coleção + rosto e fica sujeito à aprovação administrativa.
                </Text>
              </CardContent>
            </Card>
          </Reveal>
        </div>

        {/* Formulário de Envio de Mensagem */}
        <div className="lg:col-span-7">
          <Reveal delay={0.15}>
            <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <CardContent className="p-6 md:p-8 flex flex-col gap-6">
                <div>
                  <Text variant="heading-lg" className="font-bold">Envie sua Mensagem</Text>
                  <Text variant="body-sm" color="secondary" className="mt-1">
                    Preencha o formulário abaixo para entrar em contato com a nossa equipe.
                  </Text>
                </div>

                <form className="flex flex-col gap-4" action={async () => {
                  'use server';
                  // Form action placeholder
                }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Seu Nome</label>
                      <Input name="name" placeholder="Ex: Renato Assis" required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[var(--color-text-secondary)]">E-mail para Resposta</label>
                      <Input name="email" type="email" placeholder="seu@email.com" required />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Assunto</label>
                    <Input name="subject" placeholder="Ex: Dúvida sobre leilões / Credenciamento de Colecionador" required />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Mensagem</label>
                    <Textarea name="message" rows={5} placeholder="Escreva aqui sua dúvida ou solicitação..." required />
                  </div>

                  <Button type="submit" size="lg" variant="hype" className="mt-2 w-full md:w-fit" rightIcon={<Send className="size-4" />}>
                    Enviar Mensagem
                  </Button>
                </form>
              </CardContent>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
