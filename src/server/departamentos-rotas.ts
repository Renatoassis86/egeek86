import 'server-only';
import { notFound } from 'next/navigation';
import { departamentoPorSlug, type Departamento } from '@/lib/catalog/departamentos';
import { estadoDoDepartamento, viewerEhAdmin } from '@/server/departamentos';

/**
 * Porteiro das rotas /mercado/*: devolve o departamento ou chama notFound() (404 real).
 * Fechado, desconhecido, < 3 masters, trava mestra desligada ou "só admin" sem ser admin => 404.
 */
export async function exigirDepartamento(slug: string): Promise<Departamento> {
  const d = departamentoPorSlug(slug);
  if (!d) notFound();
  const estado = await estadoDoDepartamento(slug);
  if (estado === 'publico') return d;
  if (estado === 'admin' && (await viewerEhAdmin())) return d;
  notFound();
}
