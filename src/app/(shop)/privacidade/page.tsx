import type { Metadata } from 'next';
import { Eye, ShieldCheck } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Informações sobre como coletamos, tratamos, protegemos e compartilhamos seus dados no Espaço Geek 86.',
};

export default function PrivacidadePage() {
  return (
    <section className="relative w-full mx-auto max-w-4xl px-4 lg:px-8 py-14 lg:py-20 overflow-hidden">
      {/* Background Glows */}
      <Glow color="gold" size="lg" className="-top-36 -right-24" intensity={0.10} />
      <Glow color="hype" size="md" className="-bottom-28 -left-16" intensity={0.06} />

      {/* Header */}
      <div className="flex flex-col gap-3 mb-10 relative z-10">
        <Reveal>
          <Text variant="label" color="hype" className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" aria-hidden />
            Institucional
          </Text>
        </Reveal>
        <Reveal delay={0.05}>
          <Text as="h1" variant="display-xl" className="text-[32px] md:text-[40px] font-black leading-none tracking-tight">
            Política de Privacidade
          </Text>
        </Reveal>
        <Reveal delay={0.1}>
          <Text variant="body-sm" color="secondary" className="max-w-[62ch]">
            Última atualização: 18 de julho de 2026. A sua privacidade é de extrema importância para nós. Detalhamos abaixo
            como gerenciamos e protegemos seus dados pessoais de acordo com a LGPD.
          </Text>
        </Reveal>
      </div>

      <div className="flex flex-col gap-8 relative z-10">
        {/* Intro Card */}
        <Reveal delay={0.12}>
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/15">
            <CardContent className="p-6 text-xs text-[var(--color-text-secondary)] leading-relaxed flex items-start gap-3">
              <ShieldCheck className="size-5 shrink-0 text-[var(--color-accent-primary)] mt-0.5" />
              <span>
                <strong>Privacidade Blindada:</strong> Não comercializamos nem repassamos seus dados cadastrais para fins publicitários de terceiros. As coletas são destinadas unicamente a viabilizar as ferramentas de monitoramento de preços, alertas solicitados e lances da Hype Zone.
              </span>
            </CardContent>
          </Card>
        </Reveal>

        {/* Section 1 */}
        <Reveal delay={0.15}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              1. Dados que Coletamos
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              Coletamos informações necessárias para a prestação adequada dos nossos serviços de inteligência e colecionismo:
            </Text>
            <ul className="list-disc pl-5 text-xs text-[var(--color-text-secondary)] flex flex-col gap-2 leading-relaxed">
              <li><strong>Dados de Acesso (Login):</strong> E-mail fornecido voluntariamente para o login via Magic Link (Supabase Auth).</li>
              <li><strong>Dados de Perfil:</strong> Nome, pontos acumulados (Geek Points) e preferências de notificações ativas (como e-mail de alertas ou Telegram ID do nosso bot).</li>
              <li><strong>Histórico de Interação:</strong> Jogos e ofertas adicionados à sua watchlist particular e lances efetuados em leilões.</li>
            </ul>
          </div>
        </Reveal>

        {/* Section 2 */}
        <Reveal delay={0.18}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              2. Como Utilizamos Seus Dados
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              O processamento de suas informações tem como base legal o cumprimento de contrato e o consentimento explícito:
            </Text>
            <ul className="list-disc pl-5 text-xs text-[var(--color-text-secondary)] flex flex-col gap-2 leading-relaxed">
              <li>Operação e acompanhamento de alertas automáticos quando o preço atinge o patamar configurado na watchlist.</li>
              <li>Condução transparente e auditável dos leilões comunitários (o nome público do arrematante é exibido nos lances vencedores para auditoria coletiva).</li>
              <li>Prevenção a fraudes e bots na Hype Zone através de logs de auditoria interna.</li>
            </ul>
          </div>
        </Reveal>

        {/* Section 3 */}
        <Reveal delay={0.21}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              3. Compartilhamento e Integrações
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              Nosso ecossistema comunica-se com as seguintes ferramentas para funcionamento técnico:
            </Text>
            <ul className="list-disc pl-5 text-xs text-[var(--color-text-secondary)] flex flex-col gap-2 leading-relaxed">
              <li><strong>APIs de Parceiros:</strong> Buscamos preços e estoque diretamente em plataformas parceiras (ex: Mercado Livre) sem compartilhar nenhum dado pessoal de nossos usuários com elas.</li>
              <li><strong>Telegram Bot:</strong> Caso decida receber alertas no aplicativo Telegram, o sistema armazena o número identificador do chat (`Telegram ID`) para despachar as notificações de quedas de preço.</li>
              <li><strong>Resend:</strong> E-mails de transação e alertas de preços são despachados através do gateway do Resend, que cumpre rigorosos padrões de confidencialidade.</li>
            </ul>
          </div>
        </Reveal>

        {/* Section 4 */}
        <Reveal delay={0.24}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              4. Seus Direitos (LGPD)
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              De acordo com a Lei Geral de Proteção de Dados (LGPD), você é o titular dos seus dados e possui direitos garantidos:
            </Text>
            <ul className="list-disc pl-5 text-xs text-[var(--color-text-secondary)] flex flex-col gap-2 leading-relaxed">
              <li><strong>Acesso e Confirmação:</strong> Saber se tratamos dados seus e quais são eles.</li>
              <li><strong>Correção:</strong> Solicitar a alteração de dados incompletos ou inexatos.</li>
              <li><strong>Exclusão:</strong> Requerer a exclusão definitiva dos seus dados e encerramento da conta do portal a qualquer momento.</li>
            </ul>
          </div>
        </Reveal>

        {/* Section 5 */}
        <Reveal delay={0.27}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              5. Contato Encarregado
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              Para exercer qualquer um dos seus direitos de exclusão ou alteração de dados, entre em contato diretamente com o nosso Encarregado de Proteção de Dados pelo e-mail oficial disponível em nosso portal de suporte.
            </Text>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
