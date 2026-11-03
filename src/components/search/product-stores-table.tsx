import { formatBRL } from '@/lib/format';
import { CommissionNotice } from '@/components/legal/commission-notice';
import type { ProductStoreRow } from '@/server/queries/product-stores';

/** "há 3 h", "há 2 dias" a partir de um ISO; vazio se inválido. */
function ago(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'há menos de 1 h';
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/**
 * Menor preço por loja do produto (só ofertas públicas), da mais barata para a
 * mais cara. A diferença é contra a média única do produto (todas as lojas),
 * exibida só quando o histórico é elegível. Sem frete, prazo, estoque ou parcelamento.
 */
export function ProductStoresTable({
  stores,
  avgPriceCents,
}: {
  stores: ProductStoreRow[];
  avgPriceCents: number | null;
}) {
  if (stores.length === 0) return null;
  const lowest = stores[0].priceCents;
  return (
    <section aria-labelledby="menor-preco-loja" className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      <h2 id="menor-preco-loja" className="px-4 pt-4 text-[16px] font-semibold text-[var(--color-text-primary)]">
        Menor preço por loja
      </h2>
      <div className="overflow-x-auto p-2">
        <table className="w-full min-w-[320px] text-left text-[14px]">
          <caption className="sr-only">Menor preço atual em cada loja, da mais barata para a mais cara</caption>
          <thead className="text-[12px] text-[var(--color-text-tertiary)]">
            <tr>
              <th scope="col" className="px-2 py-2 font-medium">Loja</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Preço</th>
              {avgPriceCents != null && <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Vs. média</th>}
              <th scope="col" className="px-2 py-2"><span className="sr-only">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => {
              const diff = avgPriceCents != null && avgPriceCents > 0 ? Math.round(((s.priceCents - avgPriceCents) / avgPriceCents) * 100) : null;
              const when = ago(s.checkedAt);
              return (
                <tr key={s.networkId} className="border-t border-[var(--color-border-subtle)] align-middle">
                  <td className="px-2 py-2">
                    <span className="font-medium text-[var(--color-text-primary)]">{s.storeName}</span>
                    {s.priceCents === lowest && (
                      <span className="mt-1 block w-fit whitespace-nowrap rounded-[var(--radius-full)] bg-[var(--color-accent-primary-muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-accent-primary)]">
                        Menor preço
                      </span>
                    )}
                    {when && <span className="block text-[12px] text-[var(--color-text-tertiary)]">Atualizado {when}</span>}
                  </td>
                  <td className="px-2 py-2 text-right text-[16px] font-bold tabular-nums text-[var(--color-text-primary)]">
                    {formatBRL(s.priceCents)}
                  </td>
                  {avgPriceCents != null && (
                    <td className="hidden px-2 py-2 text-right tabular-nums text-[var(--color-text-secondary)] sm:table-cell">
                      {diff == null ? '' : diff === 0 ? 'na média' : `${diff > 0 ? '+' : ''}${diff}%`}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right">
                    {s.hasOutbound && (
                      <a
                        href={`/go/${s.offerSlug}`}
                        target="_blank"
                        rel="noopener noreferrer nofollow sponsored"
                        className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--color-accent-primary)] px-3 text-[14px] font-semibold text-[var(--color-text-inverse)] hover:bg-[var(--color-accent-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
                      >
                        Ir à loja
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CommissionNotice className="px-4 pb-4" />
    </section>
  );
}
