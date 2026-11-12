import 'server-only';
import { createCachedQuery } from '@/lib/cache/server-cache';
import { destaquesDepartamento, type CartaoDepartamento } from '@/server/queries/departamento';
import type { DepartamentoSlug } from '@/lib/catalog/departamentos';

/** Mínimo de produtos para a faixa aparecer na home (menos que isso = faixa escondida). */
export const MIN_DESTAQUES_HOME = 4;

const porDept = createCachedQuery(
  async (dept: DepartamentoSlug) => destaquesDepartamento(dept, 8),
  ['home-plus-destaques-v2'],
  { revalidate: 120, maxStaleSeconds: 900 }
);

/** Destaques por departamento, em paralelo e com cache SWR (a home nunca espera o recálculo). Falha de uma loja = loja sem faixa. */
export async function getDestaquesPlus(depts: DepartamentoSlug[]): Promise<Record<string, CartaoDepartamento[]>> {
  const res = await Promise.all(
    depts.map(async (d) => {
      try {
        const itens = await porDept(d);
        return [d, itens.length >= MIN_DESTAQUES_HOME ? itens : []] as const;
      } catch (e) {
        console.error(`Destaques Plus (${d}) indisponíveis:`, e);
        return [d, []] as const;
      }
    })
  );
  return Object.fromEntries(res);
}
