import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Text } from '@/components/ui/text';

interface PlatformCard {
  href: string;
  label: string;
  description: string;
  image: string;
  bg: string;
}

const PLATFORMS: PlatformCard[] = [
  {
    href: '/ofertas?geracao=ps4,ps5',
    label: 'PlayStation',
    description: 'PS4 e PS5 — jogos e consoles',
    image: '/images/platforms/playstation.png',
    bg: '#1450C4',
  },
  {
    href: '/ofertas?geracao=xbox_one,xbox_series',
    label: 'Xbox',
    description: 'Xbox One e Series — jogos e consoles',
    image: '/images/platforms/xbox.png',
    bg: '#1C7A3B',
  },
  {
    href: '/ofertas?geracao=switch_1,switch_2',
    label: 'Nintendo',
    description: 'Switch e Switch 2 — jogos e consoles',
    image: '/images/platforms/nintendo.png',
    bg: '#C81E2E',
  },
  {
    href: '/ofertas?tipo=accessory',
    label: 'Acessórios',
    description: 'Controle, headset, cadeira gamer',
    image: '/images/platforms/acessorios.png',
    bg: '#5B21B6',
  },
];

/**
 * Vitrine de plataforma estilo "MGU" (referência do usuário) — cards grandes
 * com cor de marca chapada + mascote original em traço retrô 80/90 (nunca
 * personagem licenciado). Substitui o antigo CategoryShortcuts de ícone.
 */
export function PlatformShowcase() {
  return (
    <section className="w-full mx-auto max-w-7xl px-4 lg:px-8 py-8 lg:py-10">
      <Text variant="label" color="hype">
        Geek Deals · Explore por plataforma
      </Text>
      <Text as="h2" variant="display-lg" className="mt-2 mb-4 max-w-[24ch]">
        Ache pela plataforma que você joga.
      </Text>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PLATFORMS.map((platform) => (
          <Link
            key={platform.label}
            href={platform.href}
            className="group relative flex aspect-[2/1] overflow-hidden rounded-[var(--radius-xl)] sm:aspect-[16/9]"
            style={{ backgroundColor: platform.bg }}
          >
            <div className="relative z-10 flex max-w-[58%] flex-col gap-1.5 p-5 sm:p-7">
              <Text as="span" variant="heading-lg" className="text-white">
                {platform.label}
              </Text>
              <Text variant="body-sm" className="text-white/80">
                {platform.description}
              </Text>
              <span className="mt-2 inline-flex items-center gap-1.5 text-body-sm font-medium text-white transition-transform duration-[var(--duration-fast)] group-hover:translate-x-1">
                Ver ofertas
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </div>
            <div className="absolute inset-y-0 right-0 w-[56%] sm:w-[52%]">
              <Image
                src={platform.image}
                alt=""
                fill
                sizes="(min-width: 640px) 320px, 45vw"
                className="object-contain object-bottom"
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
