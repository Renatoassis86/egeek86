import Link from 'next/link';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';

const footerSections = [
  {
    title: 'Loja',
    links: [
      { href: '/universos', label: 'Universos' },
      { href: '/categorias', label: 'Categorias' },
      { href: '/hype-zone', label: 'Hype Zone' },
      { href: '/sellers', label: 'Sellers' },
    ],
  },
  {
    title: 'Suporte',
    links: [
      { href: '/faq', label: 'FAQ' },
      { href: '/contato', label: 'Contato' },
      { href: '/trocas', label: 'Trocas & devoluções' },
      { href: '/rastreio', label: 'Rastrear pedido' },
    ],
  },
  {
    title: 'Institucional',
    links: [
      { href: '/sobre', label: 'Sobre nós' },
      { href: '/termos', label: 'Termos de uso' },
      { href: '/privacidade', label: 'Privacidade' },
      { href: '/seja-seller', label: 'Seja um seller' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] pb-safe">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2 w-fit" aria-label="Espaço Geek 86">
              <div className="size-8 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-hype)] flex items-center justify-center font-bold text-[var(--color-text-inverse)] text-sm">
                86
              </div>
              <Text variant="heading-sm" className="font-display tracking-tight">
                ESPAÇO GEEK
              </Text>
            </Link>
            <Text variant="body-sm" color="secondary" className="max-w-[28ch]">
              O cofre da cultura geek. Drops, raridades e curadoria.
            </Text>
          </div>

          {footerSections.map((section) => (
            <div key={section.title}>
              <Text variant="label" color="tertiary" className="mb-3">
                {section.title}
              </Text>
              <ul className="flex flex-col gap-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-body-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
          <Text variant="caption" color="tertiary">
            © {new Date().getFullYear()} Espaço Geek 86. Todos os direitos reservados.
          </Text>
          <Text variant="caption" color="tertiary">
            Feito com cuidado em São Paulo.
          </Text>
        </div>
      </div>
    </footer>
  );
}
