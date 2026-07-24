interface PartnerLink {
  label: string;
  href: string;
}

/**
 * Acessos discretos pra plataformas parceiras (mesmo padrão de barra
 * superior fina usado por sites institucionais do setor, ex: Cidade Viva).
 * Arkos Intelligence é quem constrói/mantém o Espaço Geek 86 — outros
 * parceiros entram aqui conforme surgirem, nunca inventados de antemão.
 */
const partnerLinks: PartnerLink[] = [{ label: 'Arkos Intelligence', href: 'https://arkosintelligence.com' }];

export function TopUtilityBar() {
  if (partnerLinks.length === 0) return null;

  return (
    <div className="w-full border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-inset)]">
      <div className="mx-auto flex h-7 max-w-7xl items-center justify-end gap-4 px-4 lg:px-8">
        {partnerLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent-primary)]"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
