import type { ComponentType } from 'react';
import { Boxes, Gamepad2, Joystick, LibraryBig, Newspaper, Zap } from 'lucide-react';

export interface CategoryCard {
  href: string;
  label: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
}

/** Lado GAMER (produto: jogo/console/acessório) — fonte única, usada em /categorias e /sobre. */
export const gamerCards: CategoryCard[] = [
  { href: '/ofertas?tipo=game', label: 'Jogos', description: 'Físico e digital, todas as plataformas.', Icon: Gamepad2 },
  { href: '/ofertas?tipo=console', label: 'Consoles', description: 'Hardware novo e usado, com histórico de preço.', Icon: Joystick },
  { href: '/ofertas?tipo=accessory', label: 'Acessórios', description: 'Controle, headset, cadeira e mais.', Icon: Boxes },
];

/** Lado GEEK (cultura: franquia/drop/notícia) — fonte única, usada em /categorias e /sobre. */
export const geekCards: CategoryCard[] = [
  { href: '/universos', label: 'Universos', description: 'Navegue por franquia: Naruto, One Piece, Marvel e mais.', Icon: LibraryBig },
  { href: '/hype-zone', label: 'Hype Zone', description: 'Drop e lançamento em contagem regressiva real.', Icon: Zap },
  { href: '/noticias', label: 'Notícias', description: 'Cultura pop, sinopse de jogo e tecnologia geek.', Icon: Newspaper },
];
