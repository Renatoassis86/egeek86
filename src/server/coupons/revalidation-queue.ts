import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { AGULHA } from '@/lib/coupons/agulha';
import { verticaisDaCategoria } from '@/lib/coupons/categoria-vertical';
import { leituraUrlFor, type PageNetwork } from '@/lib/coupons/page-read';
import { getValidAccessToken } from '@/server/collector/sources/mercado-livre-auth';

/**
 * FILA DE REVALIDAÇÃO do Agente de Cupons (cupom NA AGULHA). A aba logada do dono consome esta fila e relê o "preço com cupom"
 * da página do anúncio; o POST de resultado continua em /api/ingest/cupons-item. Sem passo manual: o cron dispara o envio, a fila
 * sempre aponta o que precisa ser lido antes de entrar numa mensagem.
 *
 * Prioridade (menor = primeiro; dentro dela, a leitura mais velha primeiro, nunca lida antes de tudo):
 *   0  anúncio com cupom JÁ DIVULGADO e aberto no guardião (a releitura decide se acabou e dispara o card de encerrado);
 *   1  oferta numa mensagem pronta para sair (proposta_auto / aprovada / enviando);
 *   2  anúncio que JÁ mostrou cupom nas últimas 24 h (manter a leitura dentro da janela de 120 min);
 *   3  oferta numa mensagem em proposta/retida;
 *   4  oferta de departamento que uma lista declara com cupom de categoria (candidata: só o anúncio confirma);
 *   5  oferta que já saiu em mensagem nas últimas 3 h;
 *   6  as demais elegíveis (o mais barato de cada produto, link oficial, departamento aprovado).
 * Devida: prioridades 0 a 3 com última leitura há mais de REREAD_TARGET_MIN (45 min); as demais, REREAD_BASE_MIN (90 min).
 */
export const PRIORIDADE_MOTIVO: Record<number, string> = {
  0: 'cupom_divulgado_aberto',
  1: 'mensagem_pronta_na_fila',
  2: 'cupom_visto_nas_ultimas_24h',
  3: 'mensagem_em_proposta',
  4: 'departamento_com_cupom_de_categoria',
  5: 'mensagem_enviada_nas_ultimas_3h',
  6: 'elegivel_sem_leitura_recente',
};

export interface RevalItem {
  id: string;
  ref: string;
  item: string | null;
  seller: string | null;
  price: string;
  prioridade: number;
  motivo: string;
  ultimaLeituraMin: number | null;
  /** Link da oferta (só usado para montar a URL de leitura da Shopee; nunca devolvido ao Chrome). */
  affiliateUrl?: string | null;
}

/** Filtros da fila por rede (ML mantém exatamente o comportamento anterior). */
const REDE_FILA: Record<string, { refRegex: string; linkedCond: string }> = {
  'mercado-livre': { refRegex: '^MLB[0-9]+$', linkedCond: "o.affiliate_url LIKE 'https://meli.la/%'" },
  amazon: { refRegex: '^amazon-[A-Z0-9]{10}$', linkedCond: "o.affiliate_url LIKE 'https://www.amazon.com.br/dp/%'" },
  shopee: { refRegex: '^shopee-[0-9]{1,19}$', linkedCond: "o.affiliate_url LIKE 'https://%shopee.com.br/%'" },
};

/** Departamentos que ALGUMA lista de cupons vigente declara por categoria (casamento conservador: ver categoria-vertical.ts). */
export async function verticaisComCupomDeCategoria(): Promise<string[]> {
  try {
    const rows = (await db.execute<{ cat: string }>(sql`
      SELECT DISTINCT scope->'categorias'->>0 AS cat FROM coupon_items
      WHERE scope_kind = 'categoria' AND network_slug = 'mercado-livre' AND state IN ('verificado', 'nao_verificado')
        AND (valid_until IS NULL OR valid_until > now())`)) as unknown as { cat: string | null }[];
    return [...new Set(rows.flatMap((r) => verticaisDaCategoria(r.cat)))];
  } catch {
    return [];
  }
}

export async function listarFilaRevalidacao(n: number, rede: string = 'mercado-livre'): Promise<RevalItem[]> {
  const cfg = REDE_FILA[rede];
  if (!cfg) return [];
  // Cupom de categoria (lista do portal) só existe no ML; nas outras redes o departamento nunca é candidato por esse motivo.
  const hint = rede === 'mercado-livre' ? await verticaisComCupomDeCategoria() : [];
  const hintCond = hint.length ? sql`c.vertical IN (${sql.join(hint.map((v) => sql`${v}`), sql`, `)})` : sql`false`;
  const rows = (await db.execute<{ id: string; ref: string; item: string | null; seller: string | null; price: string; prio: number; age_min: string | null; aurl: string | null }>(sql`
    WITH ml AS (
      SELECT o.id, o.external_ref AS ref, o.external_item_id AS item, s.external_seller_id AS seller, o.current_price_cents AS price, o.vertical, o.affiliate_url AS aurl,
             row_number() OVER (PARTITION BY o.master_product_id ORDER BY o.current_price_cents ASC, o.id) AS rn,
             (m.vertical = 'games' OR (m.attributes->'catalogGate'->>'verdict') = 'approved') AS gate,
             (${sql.raw(cfg.linkedCond)}) AS linked
      FROM affiliate_offers o
      JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = ${rede}
      JOIN master_products m ON m.id = o.master_product_id
      LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = m.vertical AND o.current_price_cents > 0 AND o.external_ref ~ ${cfg.refRegex}
    ),
    ann AS (SELECT DISTINCT coupon_ref AS oid FROM coupon_announcements WHERE kind = 'anuncio' AND ended_at IS NULL),
    q AS (
      SELECT offer_id, bool_or(status IN ('proposta_auto', 'aprovada', 'enviando')) AS ready FROM group_messages
      WHERE channel = 'tg' AND status IN ('proposta_auto', 'aprovada', 'enviando', 'proposta', 'retida') AND created_at > now() - interval '6 hours' AND offer_id IS NOT NULL
      GROUP BY offer_id
    ),
    sent AS (SELECT DISTINCT offer_id FROM group_messages WHERE channel = 'tg' AND status = 'enviada' AND sent_at > now() - interval '3 hours' AND offer_id IS NOT NULL),
    cand AS (
      SELECT ml.*, (a.oid IS NOT NULL) AS announced, q.offer_id IS NOT NULL AS queued, COALESCE(q.ready, false) AS ready, sent.offer_id IS NOT NULL AS was_sent
      FROM ml LEFT JOIN ann a ON a.oid = ml.id::text LEFT JOIN q ON q.offer_id = ml.id LEFT JOIN sent ON sent.offer_id = ml.id
      WHERE a.oid IS NOT NULL OR q.offer_id IS NOT NULL OR (ml.rn = 1 AND ml.gate AND ml.linked)
    ),
    scored AS (
      SELECT c.*, lr.last_read, lp.last_pos,
             CASE WHEN c.announced THEN 0 WHEN c.ready THEN 1 WHEN lp.last_pos > now() - interval '24 hours' THEN 2 WHEN c.queued THEN 3
                  WHEN ${hintCond} THEN 4
                  WHEN c.was_sent THEN 5 ELSE 6 END AS prio
      FROM cand c
      LEFT JOIN LATERAL (SELECT max(r.read_at) AS last_read FROM offer_coupon_reads r WHERE r.offer_id = c.id AND r.source <> 'amazon-promocoes') lr ON true
      LEFT JOIN LATERAL (SELECT max(r.read_at) AS last_pos FROM offer_coupon_reads r WHERE r.offer_id = c.id AND r.price_with_coupon_cents IS NOT NULL AND r.source <> 'amazon-promocoes') lp ON true
    )
    SELECT id::text AS id, ref, item, seller, price::text AS price, prio, aurl,
           CASE WHEN last_read IS NULL THEN NULL ELSE round(extract(epoch FROM now() - last_read) / 60)::text END AS age_min
    FROM scored
    WHERE last_read IS NULL
       OR last_read < now() - make_interval(mins => (CASE WHEN prio <= 3 THEN ${sql.raw(String(AGULHA.REREAD_TARGET_MIN))} ELSE ${sql.raw(String(AGULHA.REREAD_BASE_MIN))} END)::int)
    ORDER BY prio ASC, last_read ASC NULLS FIRST
    LIMIT ${Math.min(Math.max(1, n), 60)}`)) as unknown as { id: string; ref: string; item: string | null; seller: string | null; price: string; prio: number; age_min: string | null; aurl: string | null }[];
  return rows.map((r) => ({
    id: r.id, ref: r.ref, item: r.item, seller: r.seller, price: r.price, prioridade: Number(r.prio),
    motivo: PRIORIDADE_MOTIVO[Number(r.prio)] ?? 'outro', ultimaLeituraMin: r.age_min == null ? null : Number(r.age_min), affiliateUrl: r.aurl,
  }));
}

export interface RevalUrl {
  id: string;
  url: string;
  prioridade: number;
  motivo: string;
  ultima_leitura_min: number | null;
}

/**
 * URL de leitura de cada oferta: o id do anúncio vem da API oficial (vendedor da oferta) quando ainda não está gravado.
 * Mesma página do catálogo com o anúncio escolhido (embute o cupom daquele anúncio). Sem id do anúncio, a oferta é pulada.
 */
export async function resolverUrlsLeitura(items: RevalItem[]): Promise<RevalUrl[]> {
  const out: RevalUrl[] = [];
  let token: string | null = null;
  for (const r of items) {
    let itemId = r.item && /^MLB\d{6,}$/.test(r.item) ? r.item : null;
    if (!itemId) {
      try {
        token ??= await getValidAccessToken();
        const res = await fetch(`https://api.mercadolibre.com/products/${r.ref}/items?limit=100`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = (await res.json()) as { results?: Array<{ item_id?: string; seller_id?: number | string; condition?: string | null; price?: number }> };
          const list = Array.isArray(data.results) ? data.results.filter((x) => x.condition === 'new') : [];
          // Por vendedor; sem vendedor gravado, só o anúncio de MESMO preço da oferta (o mesmo preço ao centavo identifica o mesmo anúncio).
          const cents = Number(r.price);
          const hit = (r.seller ? list.find((x) => x.seller_id != null && String(x.seller_id) === r.seller) : undefined) ?? list.find((x) => Math.round(Number(x.price) * 100) === cents);
          if (hit?.item_id && /^MLB\d{6,}$/.test(hit.item_id)) {
            itemId = hit.item_id;
            await db.execute(sql`UPDATE affiliate_offers SET external_item_id = ${itemId} WHERE id = ${r.id}::uuid AND external_item_id IS NULL`);
          }
        }
      } catch {
        // sem id do anúncio: a oferta é pulada nesta rodada
      }
    }
    if (itemId) {
      out.push({ id: r.id, url: `https://www.mercadolivre.com.br/p/${r.ref}?pdp_filters=item_id%3A${itemId}`, prioridade: r.prioridade, motivo: r.motivo, ultima_leitura_min: r.ultimaLeituraMin });
    }
  }
  return out;
}

/**
 * Fila por rede para Amazon/Shopee: a URL da página do item sai do external_ref (Amazon: /dp/<ASIN> sem tag) ou do link oficial da oferta
 * (Shopee). Item sem URL resolvível é pulado. `ref` é devolvido para a aba conferir que abriu o item certo (ASIN / itemId).
 */
export function resolverUrlsLeituraRede(items: RevalItem[], rede: PageNetwork): (RevalUrl & { ref: string; preco_cents: number })[] {
  const out: (RevalUrl & { ref: string; preco_cents: number })[] = [];
  for (const r of items) {
    const url = leituraUrlFor(rede, r.ref, r.affiliateUrl);
    if (!url) continue;
    out.push({ id: r.id, url, ref: r.ref.replace(/^(amazon|shopee)-/, ''), preco_cents: Number(r.price), prioridade: r.prioridade, motivo: r.motivo, ultima_leitura_min: r.ultimaLeituraMin });
  }
  return out;
}

export interface ListaDevida {
  rede: string;
  fonte_url: string;
  ultima_leitura_min: number;
  devida: boolean;
  cupons_vivos: number;
}

/** Listas de cupons (portal) conhecidas e há quanto tempo foram lidas; devida = acima da meta de releitura. */
export async function listasDeCupons(): Promise<ListaDevida[]> {
  try {
    const rows = (await db.execute<{ net: string; url: string; age: string; vivos: string }>(sql`
      SELECT network_slug AS net, source_url AS url, round(extract(epoch FROM now() - max(last_seen_at)) / 60)::text AS age,
             count(*) FILTER (WHERE state IN ('verificado', 'nao_verificado') AND (valid_until IS NULL OR valid_until > now()))::text AS vivos
      FROM coupon_items WHERE source_kind <> 'manual_dono' GROUP BY 1, 2 ORDER BY 1, 2`)) as unknown as { net: string; url: string; age: string; vivos: string }[];
    return rows.map((r) => ({ rede: r.net, fonte_url: r.url, ultima_leitura_min: Number(r.age), devida: Number(r.age) > AGULHA.REREAD_TARGET_MIN, cupons_vivos: Number(r.vivos) }));
  } catch {
    return [];
  }
}
