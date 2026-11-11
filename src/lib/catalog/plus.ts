// Sem 'server-only': registro PURO das lojas do Espaço Geek Plus (os demais departamentos além de games).
import type { DepartamentoSlug } from '@/lib/catalog/departamentos';

export interface LojaPlus {
  /** slug em store_sections (canais de Telegram/WhatsApp). */
  storeSlug: string;
  /** slug do departamento no catálogo (rota /mercado/<dept>). */
  dept: DepartamentoSlug;
  rotulo: string;
  chamada: string;
}

export const LOJAS_PLUS: readonly LojaPlus[] = [
  { storeSlug: 'impressao-3d', dept: 'impressao3d', rotulo: 'Impressão 3D', chamada: 'Impressoras, filamentos e resinas.' },
  { storeSlug: 'tecnologia', dept: 'tecnologia', rotulo: 'Tecnologia', chamada: 'Hardware, armazenamento e periféricos.' },
  { storeSlug: 'livros', dept: 'livros', rotulo: 'Livros', chamada: 'Livros identificados por ISBN.' },
  { storeSlug: 'eletrodomesticos', dept: 'eletrodomesticos', rotulo: 'Casa', chamada: 'Eletrodomésticos para a casa.' },
  { storeSlug: 'eletroeletronicos', dept: 'eletroeletronicos', rotulo: 'Eletrônicos', chamada: 'TVs, áudio e vídeo.' },
  { storeSlug: 'esporte', dept: 'esporte', rotulo: 'Esporte', chamada: 'Artigos esportivos.' },
];

export function lojaPlusPorDept(dept: string): LojaPlus | null {
  return LOJAS_PLUS.find((l) => l.dept === dept) ?? null;
}
