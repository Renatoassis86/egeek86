import Link from 'next/link';
import Image from 'next/image';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { Send } from 'lucide-react';

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.56 49.56 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <polygon points="10 15 15 12 10 9 10 15" />
    </svg>
  );
}

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
            <Link href="/" className="flex items-center w-fit" aria-label="Espaço Geek 86">
              <Image src="/geek 86.webp" alt="Espaço Geek 86" width={4220} height={1568} className="theme-logo h-7 w-auto" />
            </Link>
            <Text variant="body-sm" color="secondary" className="max-w-[28ch]">
              O cofre da cultura geek. Drops, raridades e curadoria.
            </Text>
            {/* Redes Sociais */}
            <div className="flex items-center gap-3.5 mt-2">
              <a
                href="https://instagram.com/espacogeek86"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] transition-colors"
                aria-label="Instagram"
              >
                <InstagramIcon className="size-5" />
              </a>
              <a
                href="https://youtube.com/@espacogeek86"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] transition-colors"
                aria-label="YouTube"
              >
                <YoutubeIcon className="size-5" />
              </a>
              <a
                href="https://t.me/espacogeek86"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] transition-colors"
                aria-label="Telegram"
              >
                <Send className="size-4.5" />
              </a>
            </div>
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
          <a
            href="https://arkosintelligence.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <Text variant="caption" color="tertiary" className="flex items-center gap-1.5 select-none font-medium">
              Criado por
              <span className="relative h-5 w-5 overflow-hidden inline-block align-middle rounded-sm">
                <Image
                  src="/arkos.png"
                  alt="Arkos Logo"
                  fill
                  sizes="20px"
                  className="object-cover object-[50%_16%]"
                />
              </span>
              <span className="font-bold text-[var(--color-text-primary)] hover:underline">Arkos Intelligence</span>
            </Text>
          </a>
        </div>
      </div>
    </footer>
  );
}
