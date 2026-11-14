import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ingestCouponBatch, recordCouponRun, isMissingCouponTable, type IngestSummary } from '@/server/coupons/store';
import { parseIsoStrict, validateBatch } from '@/server/coupons/normalize';
import {
  confirmarNoItem, cupomDoItem, departamentoCompativel, fonteUrl, nomeDaPromocao, parsePromoCards, parsePromoPage, primeNaFinalizacao, promoDescobertaLigada, promoPrimeLigada,
  type PromoCard, type PromoPayload, precoCasa, verticaisDaCategoria,
} from '@/lib/coupons/amazon-promocoes';
import { agulhaRuleFromLabel } from '@/lib/coupons/page-read';

/**
 * Ingestão das PROMOÇÕES DA AMAZON lidas pela aba logada do dono (loop public/loops/amazon-promocoes.js), SÓ LEITURA.
 * Uma chamada = uma página /promotion/psp/<ID>. O servidor decide tudo (a aba só informa o que leu):
 *  1. lê a regra no título e a validade no banner/termos (src/lib/coupons/amazon-promocoes.ts); sem validade lida = nada é gravado;
 *  2. promoção Prime/quantidade/seguir loja não é para todos: não gera cupom e fecha o que existir dessa promoção;
 *  3. cada card DA LISTA DA REGRA (o leitor só envia #productInfoList, nunca carrosséis de recomendados) cujo ASIN JÁ É oferta ativa da Amazon, de
 *     DEPARTAMENTO compatível com o título da promoção (R-xx: cupom departamental só casa produto do departamento) e com preço coerente, vira um
 *     coupon_items de escopo `produto`. Ele nasce e FICA `nao_verificado` até a página do PRÓPRIO ASIN confirmar a promoção (confirmarItens):
 *     só então vira `verificado` (vale 120 min, depois precisa de nova confirmação) e a leitura derivada alimenta o gatilho CUPOM;
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
  /** Cards cujo produto não é do departamento da promoção (ex.: jogo numa promoção de Relógios): descartados. */
  fora_do_departamento: number;
  fora_do_departamento_amostra?: { asin: string; vertical: string | null }[];
  asins_novos: { asin: string; titulo: string; preco_cents: number }[];
  total_asins_novos: number;
  resumo: IngestSummary | null;
  fechados: number;
  /** Ofertas com cupom verificado que ganharam leitura por anúncio (alimenta o gatilho CUPOM). */
  leituras_item?: number;
  /** Resultado da descoberta de lançamentos (flag PROMO_DESCOBERTA): quantos masters/rascunhos novos nasceram dos ASINs da promoção. */
  descoberta?: { masters_novos: number; rascunhos_novos: number; delegados: number; descartados: Record<string, number> };
}

const vazio = (over: Partial<PromoIngestResult>): PromoIngestResult => ({ ok: false, promo_id: null, itens_lidos: 0, casados: 0, preco_nao_casa: 0, fora_do_departamento: 0, asins_novos: [], total_asins_novos: 0, resumo: null, fechados: 0, ...over });

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
  // Promoção Prime NA FINALIZAÇÃO (dono, 2026-11-14): com a flag PROMO_PRIME_DERIVADA liga os cupons de público `assinantes` (preço derivado da regra escrita);
  // sem a flag (padrão) segue a regra antiga (restrita = descartada).
  const primeCheckout = promoPrimeLigada() && primeNaFinalizacao(p);
  if (!primeCheckout && (p.restricao || (p.minItens != null && p.minItens >= 2))) {
    const fechados = await fechar(p.id, `promocao_restrita_${p.restricao ?? 'quantidade'}`).catch(() => 0);
    return vazio({ promo_id: p.id, motivo: `restrita_${p.restricao ?? 'quantidade'}`, fechados });
  }

  const cards: PromoCard[] = parsePromoCards(b.itens);
  const result = vazio({ ok: true, promo_id: p.id, itens_lidos: cards.length });
  if (!cards.length) return { ...result, motivo: 'sem_itens_lidos' };

  const refs = cards.map((c) => `amazon-${c.asin}`);
  const offers = (await db.execute<{ id: string; ref: string; price: string; vertical: string | null }>(sql`
    SELECT o.id::text AS id, o.external_ref AS ref, o.current_price_cents::text AS price, COALESCE(o.vertical, mp.vertical) AS vertical
    FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id LEFT JOIN master_products mp ON mp.id = o.master_product_id
    WHERE nn.slug = 'amazon' AND o.status = 'active' AND o.external_ref IN (${sql.join(refs.map((r) => sql`${r}`), sql`, `)})`)) as unknown as { id: string; ref: string; price: string; vertical: string | null }[];
  const byRef = new Map(offers.map((o) => [o.ref, o]));

  const fonte = fonteUrl(p.id);
  const cupons: Record<string, unknown>[] = [];
  const casadas: { card: PromoCard; offerId: string }[] = [];
  const novos: PromoCard[] = [];
  for (const c of cards) {
    const o = byRef.get(`amazon-${c.asin}`);
    if (!o) { novos.push(c); continue; }
    if (!departamentoCompativel(p.categoria, o.vertical)) {
      result.fora_do_departamento++;
      if ((result.fora_do_departamento_amostra ??= []).length < 5) result.fora_do_departamento_amostra.push({ asin: c.asin, vertical: o.vertical });
      continue;
    }
    if (!precoCasa(c.priceCents, Number(o.price))) { result.preco_nao_casa++; continue; }
    if (cupons.length < MAX_CUPONS_POR_CHAMADA) { cupons.push(cupomDoItem(p, { asin: c.asin, offerId: o.id }, fonte, { primeCheckout })); casadas.push({ card: c, offerId: o.id }); }
  }
  result.casados = cupons.length;
  result.total_asins_novos = novos.length;
  // DESCOBERTA DE LANÇAMENTOS (dono, 2026-11-14): card de games da promoção que ainda não é oferta nossa entra pelo caminho da vitrine da Amazon (master em REVISÃO + rascunho).
  // Atrás da flag PROMO_DESCOBERTA; nunca derruba a ingestão da promoção.
  if (novos.length && promoDescobertaLigada() && verticaisDaCategoria(p.categoria).includes('games')) {
    try {
      const { descobrirPelaPromocao } = await import('@/server/collector/amazon-vitrine');
      const st = await descobrirPelaPromocao(novos.map((c) => ({ asin: c.asin, titulo: c.titulo, priceCents: c.priceCents, listCents: c.listCents })), { tag: process.env.AMAZON_ASSOCIATE_TAG || 'manusmonteiro-20', apply: true });
      result.descoberta = { masters_novos: st.masters_novos, rascunhos_novos: st.rascunhos_novos, delegados: st.delegados, descartados: st.descartados };
    } catch (e) {
      console.error('[amazon-promocoes] descoberta falhou', e instanceof Error ? e.message.slice(0, 160) : e);
    }
  }
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
    // A lista sozinha NUNCA verifica: só a página do próprio ASIN (confirmarItens). Rebaixa o que a máquina de estados verificou pelas 2 leituras e
    // devolve o que tem confirmação fresca (o UPDATE do upsert apagou o verified_at).
    await reconciliarConfirmacoes(p.id, casadas.map((c) => c.offerId));
    // A regra da promoção mudou (título/percentual): o que foi gravado com a regra antiga deixa de valer.
    const regraAtual = String(cupons[0].condicoes_texto);
    result.fechados = await fechar(p.id, 'promocao_alterada', regraAtual.trim()).catch(() => 0);
    await recordCouponRun('amazon', started, result.resumo, {
      fonte_url: fonte, lidos_em: readAt, promo_id: p.id, promo: p.titulo, itens_lidos: cards.length, casados: cupons.length,
      preco_nao_casa: result.preco_nao_casa, fora_do_departamento: result.fora_do_departamento, asins_novos_total: novos.length, asins_novos: result.asins_novos.slice(0, 20), origem: 'amazon-promocoes',
    });
  }
  return result;
}

export const FONTE_CONFIRMACAO = 'amazon-item-confirmado';
/** Confirmação na página do item vale por 2 h (mesma janela do frescor da agulha e de DEFAULT_MAX_AGE_MINUTES). */
export const CONFIRMACAO_VALE_MIN = 120;

/**
 * Cupom de promoção só é `verificado` com confirmação FRESCA na página do item (offer_coupon_reads source amazon-item-confirmado, campaign_id = promoção).
 * Sem ela: volta a `nao_verificado` (não entra em mensagem). Com ela: restaura `verificado` com verified_at = hora da confirmação.
 */
export async function reconciliarConfirmacoes(promoId: string, offerIds: string[]): Promise<void> {
  const ids = [...new Set(offerIds.filter((x) => UUID.test(x)))];
  if (!ids.length) return;
  const lista = sql.join(ids.map((i) => sql`${i}`), sql`, `);
  await db.execute(sql`
    UPDATE coupon_items ci SET state = 'nao_verificado', state_reason = 'aguardando_confirmacao_no_item', verified_at = NULL, updated_at = now()
    WHERE ci.network_slug = 'amazon' AND ci.source_kind <> 'manual_dono' AND ci.state = 'verificado' AND ci.conditions->>'promo_id' = ${promoId}
      AND ci.scope->'offer_ids'->>0 IN (${lista})
      AND NOT EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = (ci.scope->'offer_ids'->>0)::uuid AND r.campaign_id = ${promoId}
        AND r.source = ${FONTE_CONFIRMACAO} AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - make_interval(mins => ${CONFIRMACAO_VALE_MIN}::int))`);
  await db.execute(sql`
    UPDATE coupon_items ci SET state = 'verificado', state_reason = 'confirmado_na_pagina_do_item', verified_by = 'amazon-item-confirmado', updated_at = now(),
      verified_at = (SELECT max(r.read_at) FROM offer_coupon_reads r WHERE r.offer_id = (ci.scope->'offer_ids'->>0)::uuid AND r.campaign_id = ${promoId}
        AND r.source = ${FONTE_CONFIRMACAO} AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - make_interval(mins => ${CONFIRMACAO_VALE_MIN}::int))
    WHERE ci.network_slug = 'amazon' AND ci.source_kind <> 'manual_dono' AND ci.state = 'nao_verificado' AND ci.conditions->>'promo_id' = ${promoId}
      AND (ci.valid_until IS NULL OR ci.valid_until > now()) AND (ci.valid_from IS NULL OR ci.valid_from <= now())
      AND ci.scope->'offer_ids'->>0 IN (${lista})
      AND EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = (ci.scope->'offer_ids'->>0)::uuid AND r.campaign_id = ${promoId}
        AND r.source = ${FONTE_CONFIRMACAO} AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - make_interval(mins => ${CONFIRMACAO_VALE_MIN}::int))`);
}

export type PendenteConfirmacao = { asin: string; promo_id: string; percentual: number; offer_id: string; preco_cents: number; confirmado_em: string | null };

/** Fila do passo 2 do laço: cupons de promoção abertos (prazo lido no futuro) sem confirmação nos últimos 60 min, os nunca confirmados primeiro. */
export async function pendentesDeConfirmacao(limite = 20): Promise<PendenteConfirmacao[]> {
  const lim = Math.min(Math.max(1, limite), 60);
  return (await db.execute<PendenteConfirmacao>(sql`
    SELECT ci.scope->'item_ids'->>0 AS asin, ci.conditions->>'promo_id' AS promo_id, ci.value_num::float AS percentual, ci.scope->'offer_ids'->>0 AS offer_id,
      o.current_price_cents AS preco_cents,
      (SELECT max(r.read_at)::text FROM offer_coupon_reads r WHERE r.offer_id = o.id AND r.campaign_id = ci.conditions->>'promo_id' AND r.source = ${FONTE_CONFIRMACAO}) AS confirmado_em
    FROM coupon_items ci JOIN affiliate_offers o ON o.id = (ci.scope->'offer_ids'->>0)::uuid AND o.status = 'active'
    WHERE ci.network_slug = 'amazon' AND ci.source_kind <> 'manual_dono' AND ci.state IN ('nao_verificado', 'verificado') AND ci.conditions->>'promo_id' IS NOT NULL
      AND ci.valid_until > now() + interval '15 minutes' AND (ci.valid_from IS NULL OR ci.valid_from <= now())
      AND NOT EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = o.id AND r.campaign_id = ci.conditions->>'promo_id' AND r.source = ${FONTE_CONFIRMACAO}
        AND r.read_at > now() - interval '60 minutes')
    ORDER BY 6 NULLS FIRST, ci.created_at LIMIT ${lim}`)) as unknown as PendenteConfirmacao[];
}

export interface ConfirmacaoResult { ok: boolean; recebidos: number; confirmados: number; recusados: { asin: string; motivo: string }[] }

/**
 * Passo 2: a aba leu a página de cada ASIN pendente. Confirma só com evidência na página (link da MESMA promoção ou selo com o mesmo percentual)
 * e preço coerente; grava a leitura derivada (alimenta o gatilho CUPOM) e verifica o cupom. Sem evidência: nada vale e uma leitura
 * "sem cupom" tira o item do gatilho.
 */
export async function confirmarItens(body: unknown, now: Date = new Date()): Promise<ConfirmacaoResult> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const readAt = parseIsoStrict(b.lidos_em);
  const lista = (Array.isArray(b.confirmacoes) ? b.confirmacoes : []).slice(0, 60) as (Record<string, unknown> & { asin?: unknown; promo_id?: unknown })[];
  const out: ConfirmacaoResult = { ok: !!readAt, recebidos: lista.length, confirmados: 0, recusados: [] };
  if (!readAt || !lista.length) return out;
  if (Math.abs(now.getTime() - Date.parse(readAt)) > 15 * 60_000) return { ...out, ok: false, recusados: [{ asin: '*', motivo: 'lidos_em_fora_da_janela' }] };
  type Row = { pct: number; offer: string; price: string; raw: string; prime: boolean | null };
  for (const it of lista) {
    const asin = String(it.asin ?? '').toUpperCase();
    const promoId = String(it.promo_id ?? '');
    if (!/^[A-Z0-9]{10}$/.test(asin) || !/^[A-Z0-9]{8,20}$/.test(promoId)) { out.recusados.push({ asin, motivo: 'identificacao_invalida' }); continue; }
    const rows = (await db.execute<Row>(sql`
      SELECT ci.value_num::float AS pct, ci.scope->'offer_ids'->>0 AS offer, o.current_price_cents::text AS price, ci.raw_text AS raw, (ci.conditions->>'prime_checkout' = 'true') AS prime
      FROM coupon_items ci JOIN affiliate_offers o ON o.id = (ci.scope->'offer_ids'->>0)::uuid AND o.status = 'active'
      WHERE ci.network_slug = 'amazon' AND ci.source_kind <> 'manual_dono' AND ci.state IN ('nao_verificado', 'verificado') AND ci.conditions->>'promo_id' = ${promoId}
        AND ci.scope->'item_ids'->>0 = ${asin} AND ci.valid_until > ${now.toISOString()}::timestamptz LIMIT 1`)) as unknown as Row[];
    const c = rows[0];
    if (!c) { out.recusados.push({ asin, motivo: 'cupom_nao_aberto' }); continue; }
    const conf = confirmarNoItem(it, { asin, promoId, percentual: Number(c.pct) }, Number(c.price));
    if (!conf.ok) {
      out.recusados.push({ asin, motivo: conf.motivo });
      if (conf.motivo === 'sem_confirmacao_na_pagina' || conf.motivo === 'preco_final_incoerente') {
        await registrarSemCupom([c.offer]).catch(() => 0);
        await reconciliarConfirmacoes(promoId, [c.offer]).catch(() => undefined);
      }
      continue;
    }
    const titulo = String(c.raw).split('|')[0].trim();
    const label = `Promoção Amazon: ${nomeDaPromocao(titulo)}`.slice(0, 120);
    const regra = agulhaRuleFromLabel(label);
    if (!regra || regra.kind !== 'percentual' || regra.valueNum !== Number(c.pct)) { out.recusados.push({ asin, motivo: 'rotulo_sem_regra_legivel' }); continue; }
    await db.execute(sql`
      INSERT INTO offer_coupon_reads (offer_id, campaign_id, status, label, price_with_coupon_cents, price_seen_cents, source, read_at)
      VALUES (${c.offer}::uuid, ${promoId}, 'derivado_do_rotulo', ${label}, ${conf.finalCents}::int, ${conf.priceCents}::int, ${FONTE_CONFIRMACAO}, ${readAt}::timestamptz)`);
    // Promoção Prime: a página do próprio item acabou de mostrar o MESMO preço da oferta; isso é leitura fresca de preço e renova a confirmação (sem ela a oferta da Amazon
    // some das mensagens em 60 min). Só com preço IDÊNTICO; nunca altera o preço.
    if (c.prime && conf.priceCents === Number(c.price)) {
      await db.execute(sql`UPDATE affiliate_offers SET last_price_confirmed_at = ${readAt}::timestamptz, last_checked_at = ${readAt}::timestamptz WHERE id = ${c.offer}::uuid AND current_price_cents = ${conf.priceCents}::int AND status = 'active'`).catch(() => undefined);
    }
    await reconciliarConfirmacoes(promoId, [c.offer]);
    out.confirmados++;
  }
  return out;
}
