import type { ComponentType } from 'react';
import { Boxes, Gamepad2, Joystick, Newspaper, Zap, Sparkles } from 'lucide-react';

export interface CategoryCard {
  href: string;
  label: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
  /** Texto do link do cartão; padrão 'Ver ofertas' (só correto quando o destino lista ofertas). */
  cta?: string;
}

/** Lado GAMER (produto: jogo/console/acessório) — fonte única, usada em /categorias e /sobre. */
export const gamerCards: CategoryCard[] = [
  { href: '/ofertas?tipo=game', label: 'Jogos', description: 'Mídia física, todas as plataformas.', Icon: Gamepad2 },
  { href: '/ofertas?tipo=console', label: 'Consoles', description: 'Consoles novos, com histórico de preço.', Icon: Joystick },
  { href: '/ofertas?tipo=accessory', label: 'Acessórios', description: 'Controle, headset, carregador e mais para o seu console.', Icon: Boxes },
];

/** Lado GEEK (cultura: franquia/drop/notícia) — fonte única, usada em /categorias e /sobre. */
export const geekCards: CategoryCard[] = [
  { href: '/hype-zone', label: 'Hype Zone', description: 'Lançamentos e cultura geek para acompanhar.', Icon: Zap, cta: 'Abrir Hype Zone' },
  { href: '/noticias', label: 'Notícias', description: 'Cultura pop, sinopse de jogo e tecnologia geek.', Icon: Newspaper, cta: 'Ler notícias' },
  { href: '/inteligencia-gamer', label: 'Observatório Gamer', description: 'Notícias, artigos e pesquisas sobre o mercado de games.', Icon: Sparkles, cta: 'Acessar portal' },
];
