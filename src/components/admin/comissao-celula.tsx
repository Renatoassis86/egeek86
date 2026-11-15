import { formatBRL } from '@/lib/format';
import { pctTexto, type ComissaoOferta, type ComissaoProduto } from '@/lib/admin-gestao/taxas-comissao';

/** Selo "estimada" (taxa não confirmada em fonte oficial). Só admin. */
export function SeloEstimada({ title }: { title?: string }) {
  return (
    <span
      title={title ?? 'Taxa estimada (não confirmada em tabela oficial ou no painel da rede)'}
      className="ml-1 inline-block border border-[var(--color-border-strong)] px-1 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]"
    >
      estimada
    </span>
  );
}

const brl = (c: number) => formatBRL(c);

/** Duas linhas compactas: percentual e valor (R$) da comissão prevista de uma oferta. */
export function ComissaoOfertaTexto({ c }: { c: ComissaoOferta | undefined }) {
  if (!c) return <span>—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {pctTexto(c.taxa)} · {brl(c.cents)}
      {c.confianca === 'estimada' ? <SeloEstimada /> : null}
    </span>
  );
}

/** Produto: comissão da oferta de menor preço + faixa mín/máx entre as ofertas ativas. */
export function celulasComissaoProduto(p: ComissaoProduto | undefined) {
  if (!p || !p.menor) return { pct: <span>—</span>, valor: <span>—</span> };
  const faixa = p.ofertas > 1 && p.minCents != null && p.maxCents != null && p.minCents !== p.maxCents;
  return {
    pct: (
      <span className="whitespace-nowrap tabular-nums">
        {pctTexto(p.menor.taxa)}
        {p.estimada ? <SeloEstimada /> : null}
        {p.ofertas > 1 && p.minTaxa !== p.maxTaxa ? (
          <div className="text-[11px] text-[var(--color-text-tertiary)]">
            faixa {pctTexto(p.minTaxa)} a {pctTexto(p.maxTaxa)}
          </div>
        ) : null}
      </span>
    ),
    valor: (
      <span className="whitespace-nowrap tabular-nums">
        {brl(p.menor.cents)}
        {faixa ? (
          <div className="text-[11px] text-[var(--color-text-tertiary)]">
            faixa {brl(p.minCents!)} a {brl(p.maxCents!)}
          </div>
        ) : null}
      </span>
    ),
  };
}
