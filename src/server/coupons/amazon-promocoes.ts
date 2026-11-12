import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ingestCouponBatch, recordCouponRun, isMissingCouponTable, type IngestSummary } from '@/server/coupons/store';
import { parseIsoStrict, validateBatch } from '@/server/coupons/normalize';
import {
  cupomDoItem, fonteUrl, nomeDaPromocao, parsePromoCards, parsePromoPage, precoCasa, precoComPromocao, type PromoCard, type PromoPayload,
} from '@/lib/coupons/amazon-promocoes';
import { agulhaRuleFromLabel } from '@/lib/coupons/page-read';

/**
 * Ingestão das PROMOÇÕES DA AMAZON lidas pela aba logada do dono (loop public/loops/amazon-promocoes.js), SÓ LEITURA.
 * Uma chamada = uma página /promotion/psp/<ID>. O servidor decide tudo (a aba só informa o que leu):
 *  1. lê a regra no título e a validade no banner/termos (src/lib/coupons/amazon-promocoes.ts); sem validade lida = nada é gravado;
 *  2. promoção Prime/quantidade/seguir loja não é para todos: não gera cupom e fecha o que existir dessa promoção;
 *  3. cada card cujo ASIN JÁ É oferta ativa da Amazon (preço do card coerente com o da oferta) vira um coupon_items de escopo `produto`
 *     (item_ids = ASIN, offer_ids = oferta), no mesmo contrato e na mesma máquina de estados dos demais cupons (verificado após 2 leituras
 *     separadas por 30 min; vale 120 min; vencido pelo prazo lido);
 *  4. cupom da mesma promoção cuja regra mudou (título/percentual) é fechado como `promocao_alterada`;
 *  5. ASIN que ainda NÃO é oferta é devolvido em `asins_novos` e gravado no registro da corrida (collector_runs.meta) para a vitrine.
 */
const MAX_CUPONS_POR_CHAMADA = 100;
const ABERTOS = sql`state IN ('nao_verificado', 'verificado')`;

export interface PromoIngestResult {
  ok: boolean;
  promo_id: string | null;
  motivo?: string;
  itens_lidos: number;
  casados: number;
  preco_nao_casa: number;
  asins_novos: { asin: string; titulo: string; preco_cents: number }[];
  total_asins_novos: number;
  resumo: IngestSummary | null;
  fechados: number;
  /** Ofertas com cupom verificado que ganharam leitura por anúncio (alimenta o gatilho CUPOM). */
  leituras_item?: number;
}

const vazio = (over: Partial<PromoIngestResult>): PromoIngestResult => ({ ok: false, promo_id: null, itens_lidos: 0, casados: 0, preco_nao_casa: 0, asins_novos: [], total_asins_novos: 0, resumo: null, fechados: 0, ...over });

export const FONTE_LEITURA = 'amazon-promocoes';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Uma leitura "sem cupom" por oferta (fonte amazon-promocoes): a leitura mais nova negativa apaga as positivas anteriores no gatilho CUPOM e o
 * guardião encerra o cupom divulgado com o card "Cupom encerrado" (`sumiu_da_pagina`). Chamada quando a promoção acaba, muda ou é barrada.
 */
export async function registrarSemCupom(offerIds: (string | null | undefined)[]): Promise<number> {
  const ids = [...new Set(offerIds.filter((x): x is string => !!x && UUID.test(x)))];
  if (!ids.length) return 0;
  await db.execute(sql`
    INSERT INTO offer_coupon_reads (offer_id, status, source)
    SELECT x::uuid, 'sem_cupom', ${FONTE_LEITURA} FROM unnest(ARRAY[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::text[]) AS x`);
  return ids.length;
}

/** Fecha os cupons abertos da promoção (opcionalmente só os de regra diferente da atual). */
async function fechar(promoId: string, motivo: string, regraAtual?: string): Promise<number> {
  const r = (await db.execute<{ id: string; oid: string | null }>(sql`
    UPDATE coupon_items SET state = 'vencido', state_reason = ${motivo}, verified_at = NULL, updated_at = now()
    WHERE network_slug = 'amazon' AND source_kind <> 'manual_dono' AND ${ABERTOS} AND conditions->>'promo_id' = ${promoId}
      ${regraAtual ? sql`AND conditions_raw <> ${regraAtual}` : sql``}
    RETURNING id::text AS id, scope->'offer_ids'->>0 AS oid`)) as unknown as { id: string; oid: string | null }[];
  await registrarSemCupom(r.map((x) => x.oid)).catch(() => 0);
  return r.length;
}

export async function ingestPromocaoAmazon(body: unknown, now: Date = new Date()): Promise<PromoIngestResult> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const promo = (b.promo && typeof b.promo === 'object' ? b.promo : {}) as Record<string, unknown>;
  const readAt = parseIsoStrict(b.lidos_em);
  if (!readAt) return vazio({ motivo: 'lidos_em_invalido' });
  const payload: PromoPayload = { id: String(promo.id ?? ''), titulo: String(promo.titulo ?? ''), banner: String(promo.banner ?? '').slice(0, 1500), termos: String(promo.termos ?? '').slice(0, 4000) };
  const parsed = parsePromoPage(payload, now);
  const pid = /^[A-Z0-9]{8,20}$/.test(payload.id) ? payload.id : null;
  if (!parsed.ok) {
    // Promoção que a página mostra sem regra legível ou já encerrada: fecha os cupons dela. Falha de leitura (sem título/validade) não fecha nada.
    let fechados = 0;
    if (pid && (parsed.reason === 'sem_percentual' || parsed.reason === 'promocao_encerrada')) fechados = await fechar(pid, `promocao_${parsed.reason}`).catch(() => 0);
    return vazio({ promo_id: pid, motivo: parsed.reason, fechados });
  }
  const p = parsed.promo;
  if (p.restricao || (p.minItens != null && p.minItens >= 2)) {
    const fechados = await fechar(p.id, `promocao_restrita_${p.restricao ?? 'quantidade'}`).catch(() => 0);
    return vazio({ promo_id: p.id, motivo: `restrita_${p.restricao ?? 'quantidade'}`, fechados });
  }

  const cards: PromoCard[] = parsePromoCards(b.itens);
  const result = vazio({ ok: true, promo_id: p.id, itens_lidos: cards.length });
  if (!cards.length) return { ...result, motivo: 'sem_itens_lidos' };

  const refs = cards.map((c) => `amazon-${c.asin}`);
  const offers = (await db.execute<{ id: string; ref: string; price: string }>(sql`
    SELECT o.id::text AS id, o.external_ref AS ref, o.current_price_cents::text AS price
    FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id
    WHERE nn.slug = 'amazon' AND o.status = 'active' AND o.external_ref IN (${sql.join(refs.map((r) => sql`${r}`), sql`, `)})`)) as unknown as { id: string; ref: string; price: string }[];
  const byRef = new Map(offers.map((o) => [o.ref, o]));

  const fonte = fonteUrl(p.id);
  const cupons: Record<string, unknown>[] = [];
  const casadas: { card: PromoCard; offerId: string }[] = [];
  const novos: PromoCard[] = [];
  for (const c of cards) {
    const o = byRef.get(`amazon-${c.asin}`);
    if (!o) { novos.push(c); continue; }
    if (!precoCasa(c.priceCents, Number(o.price))) { result.preco_nao_casa++; continue; }
    if (cupons.length < MAX_CUPONS_POR_CHAMADA) { cupons.push(cupomDoItem(p, { asin: c.asin, offerId: o.id }, fonte)); casadas.push({ card: c, offerId: o.id }); }
  }
  result.casados = cupons.length;
  result.total_asins_novos = novos.length;
  result.asins_novos = novos.slice(0, 40).map((c) => ({ asin: c.asin, titulo: c.titulo.slice(0, 120), preco_cents: c.priceCents }));

  const started = Date.now();
  if (cupons.length) {
    const v = validateBatch({ rede: 'amazon', fonte_url: fonte, lidos_em: readAt, leitura_completa: false, cupons }, now, MAX_CUPONS_POR_CHAMADA + 10);
    if (!v.ok) return { ...result, ok: false, motivo: v.error };
    try {
      result.resumo = await ingestCouponBatch(v);
    } catch (e) {
      if (isMissingCouponTable(e)) return { ...result, ok: false, motivo: 'migration_0029_nao_aplicada' };
      throw e;
    }
    // Gatilho CUPOM: as ofertas cujo cupom da promoção já está VERIFICADO (2 leituras separadas por 30 min) ganham a leitura por anúncio (preço derivado da regra
    // lida; a validade vem do coupon_items na consulta). Preço visto = o do card (preço de agora na Amazon); a agulha confere com o preço da oferta.
    const label = `Promoção Amazon: ${nomeDaPromocao(p.titulo)}`.slice(0, 120);
    const regra = agulhaRuleFromLabel(label);
    if (regra && regra.kind === 'percentual' && regra.valueNum === p.percentual && casadas.length) {
      const ok = (await db.execute<{ oid: string }>(sql`
        SELECT scope->'offer_ids'->>0 AS oid FROM coupon_items
        WHERE network_slug = 'amazon' AND state = 'verificado' AND conditions->>'promo_id' = ${p.id}
          AND scope->'offer_ids'->>0 IN (${sql.join(casadas.map((c) => sql`${c.offerId}`), sql`, `)})`)) as unknown as { oid: string }[];
      const verificadas = new Set(ok.map((x) => x.oid));
      const linhas = casadas.filter((c) => verificadas.has(c.offerId));
      if (linhas.length) {
        await db.execute(sql`
          INSERT INTO offer_coupon_reads (offer_id, campaign_id, status, label, price_with_coupon_cents, price_seen_cents, source)
          VALUES ${sql.join(linhas.map((c) => sql`(${c.offerId}::uuid, ${p.id}, 'derivado_do_rotulo', ${label}, ${precoComPromocao(c.card.priceCents, p.percentual)}::int, ${c.card.priceCents}::int, ${FONTE_LEITURA})`), sql`, `)}`);
        result.leituras_item = linhas.length;
      }
    }
    // A regra da promoção mudou (título/percentual): o que foi gravado com a regra antiga deixa de valer.
    const regraAtual = String(cupons[0].condicoes_texto);
    result.fechados = await fechar(p.id, 'promocao_alterada', regraAtual.trim()).catch(() => 0);
    await recordCouponRun('amazon', started, result.resumo, {
      fonte_url: fonte, lidos_em: readAt, promo_id: p.id, promo: p.titulo, itens_lidos: cards.length, casados: cupons.length,
      preco_nao_casa: result.preco_nao_casa, asins_novos_total: novos.length, asins_novos: result.asins_novos.slice(0, 20), origem: 'amazon-promocoes',
    });
  }
  return result;
}
