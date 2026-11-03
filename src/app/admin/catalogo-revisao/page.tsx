import { sql } from 'drizzle-orm';
import { ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import { requireAdmin } from '@/lib/auth/require-admin';

/**
 * Tela de REVISÃO do catálogo (somente leitura; decisão 7 adotada por delegação em 2026-11-03, ADR 0005/0006).
 * Mostra o que o porteiro tirou da vitrine por dúvida: masters com veredito `review`, ofertas em `draft`
 * (identidade divergente, Open Box, cross-gen) e ofertas em quarentena de preço. Não grava nada: aprovar ou
 * rejeitar continua por `attributes.catalogGate.manual` (scripts/apply-catalog-gate.ts) até a próxima rodada.
 * Nada é apagado. Cantos retos (padrão visual).
 */
export const dynamic = 'force-dynamic';

const LIMIT = 150;

type ReviewMaster = {
  id: string;
  name: string;
  category: string | null;
  reason: string | null;
  matched: string | null;
  active_offers: number;
  min_cents: string | null;
};
type DraftOffer = {
  id: string;
  title: string;
  master_name: string;
  price: string;
};
type QuarantinedOffer = {
  id: string;
  title: string;
  master_name: string;
  price: string;
  status: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  unverified: 'Sem prova de que é jogo',
  owner_decision: 'Decisão do dono',
  suspect_price: 'Preço suspeito',
};

function money(cents: string | number | null): string {
  return cents == null ? '—' : formatBRL(Number(cents));
}

export default async function CatalogReviewPage() {
  await requireAdmin();
  const [masters, mastersTotal, drafts, draftsTotal, quarantined, quarantinedTotal] = await Promise.all([
    db.execute<ReviewMaster>(sql`
      SELECT m.id, m.name,
             m.attributes -> 'catalogGate' ->> 'category' AS category,
             m.attributes -> 'catalogGate' ->> 'reason' AS reason,
             m.attributes -> 'catalogGate' ->> 'matched' AS matched,
             COUNT(o.id) FILTER (WHERE o.status = 'active')::int AS active_offers,
             MIN(o.current_price_cents) FILTER (WHERE o.status = 'active' AND o.current_price_cents > 0) AS min_cents
      FROM master_products m
      LEFT JOIN affiliate_offers o ON o.master_product_id = m.id
      WHERE m.attributes -> 'catalogGate' ->> 'verdict' = 'review' AND NOT (m.attributes ? 'mergedInto')
      GROUP BY m.id
      ORDER BY active_offers DESC, m.name
      LIMIT ${LIMIT}
    `),
    db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM master_products m WHERE m.attributes -> 'catalogGate' ->> 'verdict' = 'review' AND NOT (m.attributes ? 'mergedInto')`
    ),
    db.execute<DraftOffer>(sql`
      SELECT o.id, o.title, m.name AS master_name, o.current_price_cents AS price
      FROM affiliate_offers o INNER JOIN master_products m ON m.id = o.master_product_id
      WHERE o.status = 'draft' AND o.current_price_cents > 0
      ORDER BY o.updated_at DESC LIMIT ${LIMIT}
    `),
    db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM affiliate_offers WHERE status = 'draft' AND current_price_cents > 0`),
    db.execute<QuarantinedOffer>(sql`
      SELECT o.id, o.title, m.name AS master_name, o.current_price_cents AS price, o.status
      FROM affiliate_offers o INNER JOIN master_products m ON m.id = o.master_product_id
      WHERE o.quarantined_at IS NOT NULL
      ORDER BY o.current_price_cents DESC LIMIT ${LIMIT}
    `),
    db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM affiliate_offers WHERE quarantined_at IS NOT NULL`),
  ]);

  const th = 'px-4 py-3 text-caption font-medium text-[var(--color-text-tertiary)]';
  const td = 'px-4 py-3 align-top text-[14px] text-[var(--color-text-secondary)]';
  const wrap = 'overflow-x-auto border border-[var(--color-border-subtle)]';
  const headRow = 'border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]';
  const bodyRow = 'border-b border-[var(--color-border-subtle)] last:border-b-0';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Text as="h1" variant="heading-xl">
          Revisão do catálogo
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Somente leitura. Itens aqui estão fora da vitrine, da busca e de todo indicador; nada é apagado.
        </Text>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="rev-masters">
        <Text as="h2" variant="heading-md" id="rev-masters">
          Produtos em revisão ({mastersTotal[0]?.n ?? 0})
        </Text>
        {masters.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-2 p-6">
              <ShieldCheck className="size-5 text-[var(--color-text-tertiary)]" aria-hidden />
              <Text variant="body-sm">Nenhum produto em revisão.</Text>
            </CardContent>
          </Card>
        ) : (
          <div className={wrap}>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className={headRow}>
                  <th className={th}>Produto</th>
                  <th className={th}>Motivo</th>
                  <th className={`${th} text-right`}>Ofertas ativas</th>
                  <th className={`${th} text-right`}>Menor preço</th>
                </tr>
              </thead>
              <tbody>
                {masters.map((m) => (
                  <tr key={m.id} className={bodyRow}>
                    <td className={`${td} max-w-[420px] text-[var(--color-text-primary)]`}>{m.name}</td>
                    <td className={td}>
                      <Badge variant="outline">{CATEGORY_LABEL[m.category ?? ''] ?? m.category ?? 'revisão'}</Badge>
                      <div className="mt-1 text-[13px]">
                        {m.reason}
                        {m.matched ? ` (${m.matched})` : ''}
                      </div>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{m.active_offers}</td>
                    <td className={`${td} text-right tabular-nums`}>{money(m.min_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(mastersTotal[0]?.n ?? 0) > LIMIT && (
          <Text variant="caption" color="secondary">
            Mostrando {LIMIT} de {mastersTotal[0]?.n}.
          </Text>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="rev-drafts">
        <Text as="h2" variant="heading-md" id="rev-drafts">
          Ofertas em rascunho por identidade ({draftsTotal[0]?.n ?? 0})
        </Text>
        <Text variant="body-sm" color="secondary">
          Anúncio cujo título diverge do produto ao qual estava ligado (edição, região, geração, condição). Fora dos indicadores até conferência.
        </Text>
        <div className={wrap}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className={headRow}>
                <th className={th}>Título do anúncio</th>
                <th className={th}>Produto ligado</th>
                <th className={`${th} text-right`}>Preço</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((o) => (
                <tr key={o.id} className={bodyRow}>
                  <td className={`${td} max-w-[380px] text-[var(--color-text-primary)]`}>{o.title}</td>
                  <td className={`${td} max-w-[320px]`}>{o.master_name}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(o.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="rev-quarentena">
        <Text as="h2" variant="heading-md" id="rev-quarentena">
          Ofertas em quarentena de preço ({quarantinedTotal[0]?.n ?? 0})
        </Text>
        <Text variant="body-sm" color="secondary">
          Preço absurdo (acima de 3 vezes ou abaixo de 0,35 vez a mediana do produto). Reverter: scripts/quarentena-precos-absurdos.ts --revert.
        </Text>
        <div className={wrap}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className={headRow}>
                <th className={th}>Título do anúncio</th>
                <th className={th}>Produto</th>
                <th className={`${th} text-right`}>Preço</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {quarantined.map((o) => (
                <tr key={o.id} className={bodyRow}>
                  <td className={`${td} max-w-[380px] text-[var(--color-text-primary)]`}>{o.title}</td>
                  <td className={`${td} max-w-[320px]`}>{o.master_name}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(o.price)}</td>
                  <td className={td}>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
