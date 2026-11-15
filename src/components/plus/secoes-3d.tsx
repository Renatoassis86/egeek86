import Link from 'next/link';
import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import { CartaoDepartamentoView } from '@/components/mercado/cartao-departamento';
import type { TipoCartao } from '@/lib/catalog/departamentos';
import type { CartaoDepartamento } from '@/server/queries/departamento';

/** Quantos cartões cada seção mostra na vista geral; o resto fica em "Ver todos" (lista paginada do tipo). */
export const ITENS_POR_SECAO_3D = 8;

export interface SecaoLoja3d {
  slug: string;
  rotulo: string;
  ancora: string;
  total: number;
  itens: CartaoDepartamento[];
}

/**
 * As 3 seções da loja de Impressão 3D (dono, 2026-11-15, #63): Impressoras, Filamentos e Demais itens, cada uma com título, contagem e menor preço.
 * Componente de servidor (dados prontos; sem importar banco). Mesmos cartões e mesma regra de elegibilidade do departamento; sem selo e sem média.
 * Itens vêm ordenados por menor preço (o primeiro é o menor da seção).
 */
export function Secoes3d({ dept, tipoCartao, secoes, avisos = {} }: { dept: string; tipoCartao: TipoCartao; secoes: SecaoLoja3d[]; avisos?: Record<string, string[]> }) {
  return (
    <div className="flex flex-col gap-10">
      {secoes.map((s) => {
        const menor = s.itens.length ? Math.min(...s.itens.map((i) => i.menorCents)) : null;
        const mostrados = s.itens.slice(0, ITENS_POR_SECAO_3D);
        return (
          <section key={s.slug} id={s.ancora} aria-labelledby={`${s.ancora}-titulo`} className="scroll-mt-24">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-1 border-l-2 border-[var(--color-accent-primary)] pl-4">
                <Text as="h2" id={`${s.ancora}-titulo`} variant="heading-lg" className="font-black tracking-tight">{s.rotulo}</Text>
                <Text variant="body-sm" color="secondary">
                  {s.total} {s.total === 1 ? 'produto' : 'produtos'}
                  {menor !== null ? ` · a partir de ${formatBRL(menor)}` : ''}
                </Text>
              </div>
              {s.total > mostrados.length ? (
                <Link href={`/mercado/${dept}?tipo=${s.slug}&ordem=menor`} className="inline-flex min-h-11 items-center text-[14px] font-bold text-[var(--color-accent-primary)] hover:underline">
                  Ver todos de {s.rotulo.toLowerCase()} ({s.total})
                </Link>
              ) : null}
            </div>
            {mostrados.length === 0 ? (
              <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
                <Text variant="body-sm" color="secondary">Nenhum produto com oferta verificada nesta seção agora.</Text>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {mostrados.map((m, i) => (
                  <li key={m.id} className="min-w-0">
                    <CartaoDepartamentoView vertical={dept} tipo={tipoCartao} master={m} priority={false} avisos={avisos[m.id]} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
