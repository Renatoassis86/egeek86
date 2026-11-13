import 'server-only';
import { destaquesPlusCached } from '@/server/plus-destaques';
import { departamentosVisiveis } from '@/server/departamentos';
import type { CartaoDepartamento } from '@/server/queries/departamento';
import type { DepartamentoSlug } from '@/lib/catalog/departamentos';
import { VITRINE_REGRAS, type VitrineItem } from '@/lib/vitrines';

/** Ordem da faixa Geek Plus na landing (PROPOSTA_NOVA_VERSAO.md seção 3, sessão 7). */
export const DEPARTAMENTOS_PLUS_HOME: readonly DepartamentoSlug[] = ['impressao3d', 'tecnologia', 'livros', 'eletrodomesticos', 'eletroeletronicos', 'esporte'];

/** Cartão de departamento -> VitrineItem do Plus: SEM média e SEM selo (R-36, até 27/11); só menor preço do momento, loja e horário. Puro. */
export function itemDoDepartamento(dept: string, c: CartaoDepartamento): VitrineItem | null {
  if (!c.imagem || !/^https?:\/\//i.test(c.imagem) || !(c.menorCents > 0) || !c.lojaMenor || !c.verificadoEm) return null;
  return {
    masterProductId: c.id,
    offerId: null,
    slug: c.slug,
    href: `/mercado/${dept}/${c.slug}`,
    titulo: c.nome,
    imagemUrl: c.imagem,
    tipo: 'plus',
    plataforma: null,
    precoCentavos: c.menorCents,
    loja: c.lojaMenor,
    lojaSlug: '',
    lidoEm: new Date(c.verificadoEm).toISOString(),
    ofertasAtivas: c.vendedores,
    lojasAtivas: c.vendedores,
    media: null,
    posicao: { tipo: 'sem_base' },
    menorRegistrado: null,
    evento: null,
    departamento: dept,
  };
}

/** Um produto por departamento visível ao público (o de menor preço do momento, com foto real). Departamento fechado ou sem produto fica de fora. */
export async function carregarPlus(): Promise<{ itens: VitrineItem[]; elegiveis: number }> {
  const visiveis = new Set((await departamentosVisiveis(false)).map((d) => d.slug as string));
  const lista = await Promise.all(
    DEPARTAMENTOS_PLUS_HOME.filter((d) => visiveis.has(d)).map(async (d) => {
      try {
        const cartoes = await destaquesPlusCached(d);
        for (const c of cartoes) {
          const it = itemDoDepartamento(d, c);
          if (it) return it;
        }
      } catch (e) {
        console.error(`[vitrine plus] ${d} indisponível:`, e instanceof Error ? e.message : e);
      }
      return null;
    })
  );
  const itens = lista.filter((x): x is VitrineItem => x != null);
  return { itens: itens.length >= VITRINE_REGRAS.MIN_ITENS ? itens.slice(0, VITRINE_REGRAS.PLUS_DEPARTAMENTOS) : [], elegiveis: itens.length };
}
