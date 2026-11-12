import 'server-only';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { slugify } from '@/lib/slugify';
import { NAO_E_ESTE, NAO_SEI, titleNorm, type QueueOption } from '@/lib/identity-queue/model';
import { recordPriceSnapshot } from './record-price-snapshot';

type Sql = postgres.Sql<{}>;

export const ORIGEM_DUVIDA_SHOPEE = 'shopee_cobertura';

export interface DuvidaShopee {
  networkId: string;
  masterId: string;
  masterNome: string;
  vertical: string;
  itemId: string;
  titulo: string;
  priceCents: number;
  listPriceCents?: number | null;
  imageUrl: string | null;
  shopName: string | null;
  offerLink: string;
  motivo: string;
  score: number;
  fonte: string;
}

/**
 * Item em DÚVIDA de identidade: nunca vai direto para a média. Cria a oferta como RASCUNHO (o código já exclui rascunho de média,
 * mediana, menor preço, selo e vitrine) e uma pergunta pendente na fila de classificação (eixo 'identidade'). Resposta "sim" ativa a
 * oferta (ver applyInTx); "não é este" mantém fora; "não sei" adia. Idempotente: external_ref e (offer, axis) únicos.
 * Devolve o id da oferta criada ou null (já existia).
 */
export async function enfileirarDuvidaShopee(sql: Sql, d: DuvidaShopee): Promise<{ offerId: string; itemFilaId: string | null } | null> {
  const ref = `shopee-${d.itemId}`;
  const slug = slugify(`${d.titulo.slice(0, 100)}-shopee-${randomUUID().slice(0, 6)}`);
  const [o] = await sql<{ id: string }[]>`
    insert into affiliate_offers (master_product_id, network_id, title, slug, affiliate_url, affiliate_link_pending, image_url, store_name,
                                  external_ref, current_price_cents, status, last_checked_at, vertical)
    values (${d.masterId}::uuid, ${d.networkId}, ${d.titulo.slice(0, 200)}, ${slug}, ${d.offerLink}, false, ${d.imageUrl}, ${d.shopName},
            ${ref}, 0, 'draft', now(), ${d.vertical})
    on conflict (network_id, external_ref) where external_ref is not null and seller_id is null do nothing
    returning id::text as id`;
  if (!o) return null;
  await recordPriceSnapshot({ offerId: o.id, priceCents: d.priceCents, listPriceCents: d.listPriceCents ?? null, source: 'api' });
  const options: QueueOption[] = [
    { value: 'sim', label: 'É o mesmo produto', hint: 'Entra na média deste produto', kind: 'escolha' },
    NAO_E_ESTE,
    NAO_SEI,
  ];
  const understood = { origem: ORIGEM_DUVIDA_SHOPEE, master: d.masterNome.slice(0, 160), itemShopee: d.itemId, fonte: d.fonte, score: Number(d.score.toFixed(2)) };
  const [it] = await sql<{ id: string }[]>`
    insert into identity_review_items (offer_id, master_id, vertical, axis, source, reason, understood, options, title, title_norm)
    values (${o.id}::uuid, ${d.masterId}::uuid, ${d.vertical}, 'identidade', 'confianca', ${`Shopee: ${d.motivo}`}, ${JSON.stringify(understood)}::text::jsonb,
            ${JSON.stringify(options)}::text::jsonb, ${d.titulo.slice(0, 300)}, ${titleNorm(d.titulo)})
    on conflict (offer_id, axis) do nothing
    returning id::text as id`;
  return { offerId: o.id, itemFilaId: it?.id ?? null };
}
