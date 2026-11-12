import 'server-only';
import { createCachedQuery } from '@/lib/cache/server-cache';
import { indiceTiposDepartamento } from '@/server/queries/departamento';
import { TIPO_OUTROS } from '@/lib/catalog/tipos-produto';
import type { DepartamentoSlug } from '@/lib/catalog/departamentos';

export interface TipoLink {
  slug: string;
  rotulo: string;
  n: number;
}

const porDept = createCachedQuery(
  async (dept: DepartamentoSlug) => (await indiceTiposDepartamento(dept)).tipos.filter((t) => t.slug !== TIPO_OUTROS).slice(0, 4),
  ['plus-tipos-principais-v1'],
  { revalidate: 120, maxStaleSeconds: 900 }
);

/** Tipos principais (até 4, com mais produtos) de cada loja Plus, para os atalhos da home e de /plus. Falha de uma loja = sem atalhos. */
export async function getTiposPrincipaisPlus(depts: DepartamentoSlug[]): Promise<Record<string, TipoLink[]>> {
  const res = await Promise.all(
    depts.map(async (d) => {
      try {
        return [d, await porDept(d)] as const;
      } catch (e) {
        console.error(`Tipos Plus (${d}) indisponíveis:`, e);
        return [d, [] as TipoLink[]] as const;
      }
    })
  );
  return Object.fromEntries(res);
}
