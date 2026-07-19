import type { Metadata } from 'next';
import { FileText, ShieldAlert } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { Glow } from '@/components/motion/glow';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Regras de funcionamento, direitos e obrigações para usuários e colecionadores do Espaço Geek 86.',
};

export default function TermosPage() {
  return (
    <section className="relative w-full mx-auto max-w-4xl px-4 lg:px-8 py-14 lg:py-20 overflow-hidden">
      {/* Background Glows */}
      <Glow color="gold" size="lg" className="-top-36 -right-24" intensity={0.10} />
      <Glow color="hype" size="md" className="-bottom-28 -left-16" intensity={0.06} />

      {/* Header */}
      <div className="flex flex-col gap-3 mb-10 relative z-10">
        <Reveal>
          <Text variant="label" color="hype" className="inline-flex items-center gap-1.5">
            <FileText className="size-3.5" aria-hidden />
            Institucional
          </Text>
        </Reveal>
        <Reveal delay={0.05}>
          <Text as="h1" variant="display-xl" className="text-[32px] md:text-[40px] font-black leading-none tracking-tight">
            Termos de Uso
          </Text>
        </Reveal>
        <Reveal delay={0.1}>
          <Text variant="body-sm" color="secondary" className="max-w-[62ch]">
            Última atualização: 18 de julho de 2026. Leia atentamente as regras que regem o uso de nossa plataforma,
            leilões comunitários e serviços de inteligência.
          </Text>
        </Reveal>
      </div>

      <div className="flex flex-col gap-8 relative z-10">
        {/* Intro Card */}
        <Reveal delay={0.12}>
          <Card className="border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]/15">
            <CardContent className="p-6 text-xs text-[var(--color-text-secondary)] leading-relaxed flex items-start gap-3">
              <ShieldAlert className="size-5 shrink-0 text-[var(--color-accent-primary)] mt-0.5" />
              <span>
                <strong>Atenção Colecionador:</strong> Ao acessar e utilizar o portal do Espaço Geek 86, você concorda automaticamente com todas as cláusulas aqui descritas. Caso não concorde com algum dos termos, solicitamos que suspenda o uso de nossa plataforma imediatamente.
              </span>
            </CardContent>
          </Card>
        </Reveal>

        {/* Section 1 */}
        <Reveal delay={0.15}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              1. Visão Geral e Propósito do Serviço
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              O Espaço Geek 86 é uma plataforma especializada no ecossistema geek. Integramos recursos de:
            </Text>
            <ul className="list-disc pl-5 text-xs text-[var(--color-text-secondary)] flex flex-col gap-2 leading-relaxed">
              <li><strong>Geek Deals:</strong> Inteligência, histórico e comparação de ofertas através de coleta oficial via APIs de portais parceiros.</li>
              <li><strong>Hype Zone & Leilões (C2C):</strong> Área dedicada a drops, lançamentos e leilões de itens raros conduzidos e auditados de forma comunitária.</li>
            </ul>
            <Text variant="body-sm" color="secondary" className="leading-relaxed mt-1">
              Operamos primariamente como prestadora de tecnologia e inteligência de dados, não possuindo controle direto sobre estoques de parceiros terceiros divulgados no módulo Geek Deals.
            </Text>
          </div>
        </Reveal>

        {/* Section 2 */}
        <Reveal delay={0.18}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              2. Cadastro e Qualificação de Contas
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              O cadastro em nosso sistema exige dados válidos e é de uso pessoal e intransferível. Para atuar como <strong>Colecionador Vendedor</strong> na criação de lotes ou drops na Hype Zone, o usuário deve:
            </Text>
            <ul className="list-disc pl-5 text-xs text-[var(--color-text-secondary)] flex flex-col gap-2 leading-relaxed">
              <li>Passar pelo onboarding oficial de vendedor e ter o cadastro aprovado administrativamente.</li>
              <li>Comprometer-se a anunciar exclusivamente itens 100% originais e correspondentes às descrições e mídias anexadas.</li>
              <li>Aceitar a auditoria comunitária de suas postagens antes e durante o período ativo dos lotes.</li>
            </ul>
          </div>
        </Reveal>

        {/* Section 3 */}
        <Reveal delay={0.21}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              3. Sistema de Lances e Martelo Hype
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              A Hype Zone utiliza a regra de <strong>Soft Close (fechamento suave)</strong>. Lances realizados nos últimos 2 minutos de um leilão prorrogam o temporizador automaticamente por mais 2 minutos. Esta medida protege a comunidade contra bots de sniping e instabilidades de rede.
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              O lance vencedor constitui um <strong>compromisso legal de compra</strong>. O não pagamento do lote arrematado no prazo estipulado sujeita a conta a:
            </Text>
            <ul className="list-disc pl-5 text-xs text-[var(--color-text-secondary)] flex flex-col gap-2 leading-relaxed">
              <li>Redução imediata de 500 Geek Points (XP) do perfil.</li>
              <li>Status de inadimplência e potencial suspensão permanente da conta de colecionador.</li>
            </ul>
          </div>
        </Reveal>

        {/* Section 4 */}
        <Reveal delay={0.24}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              4. Propriedade Intelectual e Confiabilidade dos Dados
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              Todo o conteúdo visual, algoritmos de preço médio, histórico gráfico e storytelling expostos no portal pertencem ao Espaço Geek 86. É proibida a extração automatizada de dados (scraping em larga escala) de nosso ecossistema sem autorização prévia por escrito.
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              Os preços expostos na vitrine Geek Deals são atualizados em intervalos regulares. Eventuais divergências pontuais com os sites parceiros devem ser reportadas, prevalecendo sempre o preço final exposto no carrinho de compras do vendedor parceiro de origem no momento da transação.
            </Text>
          </div>
        </Reveal>

        {/* Section 5 - Isenção de Responsabilidade */}
        <Reveal delay={0.27}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              5. Isenção de Responsabilidade sobre Itens Negociados
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              O portal Espaço Geek 86 atua exclusivamente como intermediador tecnológico e vitrine de inteligência, disponibilizando a infraestrutura para aproximação de compradores, parceiros afiliados e colecionadores vendedores (C2C e B2C).
            </Text>
            <div className="p-4 rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)]/40 border border-amber-500/30 flex flex-col gap-2 my-1">
              <Text variant="body-sm" className="font-bold text-amber-400">
                ⚠️ Limitação de Responsabilidade da Administração
              </Text>
              <Text variant="caption" color="secondary" className="leading-relaxed">
                A administração do Espaço Geek 86 <strong>não assume qualquer responsabilidade civil, criminal, financeira ou operacional</strong> por problemas, defeitos, vícios ocultos, avarias de transporte, atrasos na entrega, falsificações, divergências de estado de conservação ou descumprimentos contratuais em itens vendidos por terceiros ou colecionadores através dos módulos Geek Deals, Hype Zone ou Geek Hammer.
              </Text>
            </div>
            <ul className="list-disc pl-5 text-xs text-[var(--color-text-secondary)] flex flex-col gap-2 leading-relaxed">
              <li><strong>Responsabilidade do Vendedor:</strong> A veracidade das informações, a qualidade, a autenticidade, o envio e a garantia dos itens anunciados ou leiloados são de responsabilidade integral e exclusiva do vendedor/colecionador que efetuou o anúncio.</li>
              <li><strong>Resolução de Disputas:</strong> Reclamações, trocas, devoluções ou desacordos comerciais referentes a produtos transacionados deverão ser tratados e resolvidos diretamente entre o comprador e o respectivo vendedor titular da oferta.</li>
              <li><strong>Links de Afiliados:</strong> Para produtos adquiridos via links da vitrine Geek Deals em lojas parceiras terceiras (Amazon, Shopee, Mercado Livre, etc.), aplicam-se exclusivamente as políticas de troca, devolução e garantia do e-commerce de destino.</li>
            </ul>
          </div>
        </Reveal>

        {/* Section 6 */}
        <Reveal delay={0.30}>
          <div className="flex flex-col gap-3">
            <Text as="h2" variant="heading-lg" className="font-bold text-[var(--color-text-primary)]">
              6. Foro e Contato
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              Fica eleito o foro da comarca de João Pessoa/PB para dirimir quaisquer controvérsias decorrentes do presente termo.
            </Text>
            <Text variant="body-sm" color="secondary" className="leading-relaxed">
              Dúvidas ou solicitações sobre estes termos podem ser enviadas diretamente para a equipe administrativa através da nossa página de suporte ou pelo e-mail oficial listado em nosso portal.
            </Text>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
