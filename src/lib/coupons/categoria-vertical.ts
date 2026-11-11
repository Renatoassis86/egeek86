// Casamento PURO "rótulo de categoria do cupom -> departamentos (verticais) do catálogo". Sem banco, sem rede.
//
// REGRA (dono, 2026-11-11): só casa quando o rótulo que a LOJA publicou na lista de cupons declara a categoria de forma
// inequívoca ("Livros e Jogos", "Casa"). Marca (Samsung, Panasonic, 3C), campanha promocional sem categoria ("LIQUIDA",
// "Volta às Aulas") e rótulo ambíguo ("Smartphones": não existe departamento de celulares) NÃO casam. Nada por suposição.
//
// IMPORTANTE: casar a categoria só diz "este cupom PODE valer para ofertas deste departamento". Como a loja escreve
// "Em produtos selecionados" em todo cupom de categoria lido até hoje (146 de 146), o casamento serve para PRIORIZAR a
// releitura do anúncio; o cupom só entra na mensagem quando o anúncio confirma (preço com cupom da mesma campanha) ou
// quando a regra declara todos os produtos da categoria (ver declaraTodosOsProdutos).

import type { Vertical } from '@/lib/catalog/verticais';

/** Minúsculas, sem acento, espaços colapsados. */
export function canonCategoria(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Regra {
  /** Casa o rótulo canônico inteiro (não por substring: "casa" não pode casar "casacos"). */
  re: RegExp;
  verticais: Vertical[];
}

const REGRAS: Regra[] = [
  { re: /^livros e jogos$/, verticais: ['games', 'livros'] },
  { re: /^(jogos|games|video ?games?|consoles e (jogos|games))$/, verticais: ['games'] },
  { re: /^(livros|livros e revistas)$/, verticais: ['livros'] },
  { re: /^(casa|eletrodomesticos|casa e eletrodomesticos|eletrodomesticos e casa)$/, verticais: ['eletrodomesticos'] },
  { re: /^microondas( [0-9. ]+)?$/, verticais: ['eletrodomesticos'] },
  { re: /^(tvs?|televisores|audio e video|eletronicos)$/, verticais: ['eletroeletronicos'] },
  { re: /^(informatica|computadores|computacao)$/, verticais: ['tecnologia'] },
  { re: /^(esporte|esportes|esportes e fitness|fitness)$/, verticais: ['esporte'] },
  { re: /^impressao 3d$/, verticais: ['impressao3d'] },
];

/** Departamentos que o rótulo declara; [] quando não declara (marca, campanha, ambíguo). */
export function verticaisDaCategoria(label: string | null | undefined): Vertical[] {
  if (!label) return [];
  const c = canonCategoria(label);
  const hit = REGRAS.find((r) => r.re.test(c));
  return hit ? [...hit.verticais] : [];
}

export function categoriaCasaComVertical(label: string | null | undefined, vertical: string | null | undefined): boolean {
  return !!vertical && (verticaisDaCategoria(label) as string[]).includes(vertical);
}

/**
 * A regra lida na loja declara TODOS os produtos da categoria? "Em produtos selecionados" = só alguns: o cupom não vale
 * para a categoria inteira e precisa do anúncio para confirmar. Texto vazio/ausente = não declara (não presume).
 */
export function declaraTodosOsProdutos(conditionsRaw: string | null | undefined): boolean {
  if (!conditionsRaw) return false;
  const t = conditionsRaw.toLowerCase();
  if (/selecionad/.test(t)) return false;
  return /(todos os produtos|toda a categoria|todos os itens)/.test(t);
}
