import 'server-only';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { slugify } from '@/lib/slugify';
import { norm } from '@/lib/affiliate/amazon-identity';
import { IndiceDedup, type MarcasConhecidas, type PropostaMaster } from '@/lib/affiliate/shopee-master-novo';
import { reviewGateFor, VERTICAL_GATE_VERSION } from '@/lib/catalog/vertical/gate';
import type { NonGamesVertical } from '@/lib/catalog/vertical/config';

type Sql = postgres.Sql<{}>;

/** Marcas reais da tabela brands (normalizadas). Sem lista própria: o que não está no catálogo de marcas não vira "marca forte". */
export async function carregarMarcasConhecidas(sql: Sql): Promise<MarcasConhecidas> {
  const rows = await sql<{ name: string }[]>`select name from brands where name is not null`;
  return new Set(rows.map((r) => norm(r.name)).filter((n) => n.length >= 3));
}

/** Todos os masters da vertical (aprovados e em revisão; fora os já fundidos) para a dedup antes de criar. */
export async function carregarIndiceDedup(sql: Sql, vertical: string): Promise<IndiceDedup> {
  const rows = await sql<{ id: string; name: string; ik: string | null; gtin: string | null; seg: string | null; cat: Record<string, unknown> | null }[]>`
    select id::text as id, name, attributes -> 'vertical' ->> 'identityKey' as ik, gtin, attributes -> 'vertical' ->> 'segment' as seg,
           attributes -> 'vertical' -> 'catalogAttributes' as cat
    from master_products where vertical = ${vertical} and (attributes ->> 'mergedInto') is null`;
  return new IndiceDedup(rows.map((r) => ({ id: r.id, name: r.name, chave: r.ik, gtin: r.gtin, segmento: r.seg, catalogAttributes: r.cat })));
}

/**
 * Cria o master NOVO de uma loja Plus, SEMPRE em `review` (ADR 0008: invisível, fora de média e vitrine até a aprovação do catálogo). O parecer do
 * porteiro/escopo fica em `catalogGate.suggested`; a origem em `attributes.shopeeCriacao`. Devolve o id.
 */
export async function criarMasterPlus(
  sql: Sql,
  p: PropostaMaster,
  o: { imageUrl: string | null; itemId: string; sugestao: 'approved' | 'review'; motivo: string; runId: string | null; aprovarAuto?: boolean }
): Promise<string> {
  const now = new Date().toISOString();
  const gateRevisao = reviewGateFor(
      {
        verdict: o.sugestao, category: o.sugestao === 'approved' ? 'ok' : 'unverified',
        reason: o.sugestao === 'approved' ? `evidencia_positiva:${p.keyKind}_shopee` : 'chave_fraca_titulo_shopee', matched: null, version: VERTICAL_GATE_VERSION, vertical: p.loja,
      } as Parameters<typeof reviewGateFor>[0],
      now
    );
  // PRODUTO UNICO E BEM-VINDO (dono, 2026-11-12): chave forte + porteiro/escopo aprovaveis (decidirMasterNovo) = master ja nasce APROVADO, mesmo com uma so
  // oferta. Reversivel: `previousVerdict`/`approvedBy` identificam o lote; a reversao do run (desfazerCobertura) apaga o master sem oferta. Chave fraca nunca chega aqui.
  const catalogGate = o.aprovarAuto && o.sugestao === 'approved'
    ? { ...gateRevisao, verdict: 'approved', category: 'ok', reason: 'aprovado_automatico:produto_unico_chave_forte', approvedBy: 'auto:shopee-cobertura', approvedAt: now, previousVerdict: 'review' }
    : gateRevisao;
  const attributes = {
    catalogGate,
    vertical: {
      segment: p.segmento, identityKey: p.chave, keyKind: p.keyKind, domainId: null, parentId: null, gtins: p.gtin ? [p.gtin] : [], source: 'cobertura-shopee',
      titleDerived: true, seededAt: now, catalogAttributes: p.catalogAttributes,
    },
    shopeeCriacao: { forca: p.forca, motivo: o.motivo, itemId: o.itemId, runId: o.runId, em: now },
  };
  const base = slugify(p.nome);
  for (const slug of [base, `${base}-${randomUUID().slice(0, 6)}`]) {
    const [r] = await sql<{ id: string }[]>`
      insert into master_products (name, slug, gtin, manufacturer, default_images, attributes, vertical, product_type, is_verified)
      values (${p.nome}, ${slug}, ${p.gtin}, ${p.marca}, ${JSON.stringify(o.imageUrl ? [o.imageUrl] : [])}::text::jsonb, ${JSON.stringify(attributes)}::text::jsonb,
              ${p.loja as NonGamesVertical}, 'general'::product_type, false)
      on conflict (slug) do nothing
      returning id::text as id`;
    if (r?.id) return r.id;
  }
  throw new Error('slug_do_master_em_conflito');
}

/**
 * Master novo de GAMES (mesmo caminho da descoberta gamer: dedup já feita, porteiro gamer `entryGateAttributes`). Devolve o id e o veredito do porteiro.
 */
export async function criarMasterGame(
  d: { titulo: string; itemId: string; imageUrl: string | null; productType: string; classified: Record<string, unknown>; gateAttributes: Record<string, unknown>; runId: string | null }
): Promise<string> {
  const { db } = await import('@/lib/db');
  const { masterProducts } = await import('@/db/schema');
  const [created] = await db
    .insert(masterProducts)
    .values({
      name: d.titulo,
      slug: slugify(`${d.titulo}-shopee-${d.itemId.slice(-6)}-${randomUUID().slice(0, 4)}`),
      vertical: 'games',
      productType: d.productType,
      defaultImages: d.imageUrl ? [d.imageUrl] : [],
      ...d.classified,
      attributes: { ...d.gateAttributes, shopeeCriacao: { forca: 'dedup_titulo_plataforma', itemId: d.itemId, runId: d.runId, em: new Date().toISOString() } },
      classifiedAt: new Date(),
    } as never)
    .returning({ id: masterProducts.id });
  return created.id;
}
