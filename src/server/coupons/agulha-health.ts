import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { AGULHA } from '@/lib/coupons/agulha';
import { lerBatimentos } from '@/server/coupons/heartbeat-store';
import { situacaoBatimento, type RedeBatimento, type SituacaoBatimento } from '@/lib/coupons/heartbeat';
import { type CoberturaLinha, type ListasLinha, type MensagensLinha, type MotivoSemCupom } from '@/lib/coupons/agulha-health-model';

/**
 * Saúde do cupom na agulha, SOMENTE LEITURA (SELECTs). Usado pelo bloco de /admin/mensagens, pelo diagnóstico (scripts) e como
 * resumo em collector_runs.meta. Cada número vem de contagem direta no banco; nada é estimado.
 */
export interface SaudeAgulha {
  geradoEm: string;
  cobertura: CoberturaLinha[];
  listas: ListasLinha[];
  mensagens24h: MensagensLinha[];
  /** Motivos de "não saiu cupom" registrados pela consulta (coupon_consults.miss_reason, após a migration 0041), 24 h. null = migration ausente. */
  motivosRegistrados: { motivo: string; consultas: number }[] | null;
  guardiao: { abertos: number; encerrados24h: number; avisosPendentes: number } | null;
  /** Último batimento do loop 24 h por rede (Amazon, Shopee). null = collector_runs indisponível. */
  batimentos: (RedeBatimento & { situacao: SituacaoBatimento })[] | null;
}

const num = (v: unknown) => Number(v ?? 0);

export async function saudeAgulha(): Promise<SaudeAgulha> {
  const fresh = sql.raw(String(AGULHA.ITEM_FRESH_MIN));
  const alive = sql.raw(String(AGULHA.LIST_ALIVE_MIN));

  // Cobertura: alvo ML por departamento + redes sem leitura autorizada (só contagem de ofertas ativas).
  const alvo = (await db.execute<{ vertical: string; alvo: string; lidas2h: string; na_agulha: string; velho: string; age: string | null }>(sql`
    WITH alvo AS (
      SELECT o.id, o.vertical, o.current_price_cents AS price,
             row_number() OVER (PARTITION BY o.master_product_id ORDER BY o.current_price_cents ASC, o.id) AS rn,
             (m.vertical = 'games' OR (m.attributes->'catalogGate'->>'verdict') = 'approved') AS gate
      FROM affiliate_offers o
      JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre'
      JOIN master_products m ON m.id = o.master_product_id
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = m.vertical AND o.current_price_cents > 0
        AND o.affiliate_url LIKE 'https://meli.la/%' AND o.external_ref ~ '^MLB[0-9]+$'
    ), t AS (SELECT * FROM alvo WHERE rn = 1 AND gate)
    SELECT t.vertical, count(*)::text AS alvo,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = t.id AND r.read_at > now() - make_interval(mins => ${fresh}::int)))::text AS lidas2h,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM offer_coupon_reads r
             WHERE r.offer_id = t.id AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - make_interval(mins => ${fresh}::int)
               AND r.price_with_coupon_cents < t.price AND r.price_seen_cents = t.price AND COALESCE(r.label, '') !~* 'seguir'
               AND NOT EXISTS (SELECT 1 FROM offer_coupon_reads n WHERE n.offer_id = t.id AND n.price_with_coupon_cents IS NULL AND n.read_at > r.read_at)))::text AS na_agulha,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = t.id AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - interval '24 hours'))::text AS velho,
           round(extract(epoch FROM now() - max((SELECT max(r.read_at) FROM offer_coupon_reads r WHERE r.offer_id = t.id))) / 60)::text AS age
    FROM t GROUP BY t.vertical ORDER BY t.vertical`)) as unknown as { vertical: string; alvo: string; lidas2h: string; na_agulha: string; velho: string; age: string | null }[];

  const semFonte = (await db.execute<{ net: string; vertical: string; n: string }>(sql`
    SELECT nn.slug AS net, o.vertical, count(*)::text AS n FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND nn.slug NOT IN ('mercado-livre', 'amazon', 'shopee') GROUP BY 1, 2 ORDER BY 1, 2`)) as unknown as { net: string; vertical: string; n: string }[];

  // Amazon e Shopee (leitura pela página do item autorizada em 2026-11-11): alvo = o mais barato de cada produto aprovado, mesma contagem do ML.
  const pagina = (await db.execute<{ net: string; vertical: string; alvo: string; lidas2h: string; na_agulha: string; velho: string; age: string | null }>(sql`
    WITH alvo AS (
      SELECT o.id, o.vertical, o.current_price_cents AS price, nn.slug AS net,
             row_number() OVER (PARTITION BY o.master_product_id, nn.slug ORDER BY o.current_price_cents ASC, o.id) AS rn,
             (m.vertical = 'games' OR (m.attributes->'catalogGate'->>'verdict') = 'approved') AS gate
      FROM affiliate_offers o
      JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug IN ('amazon', 'shopee')
      JOIN master_products m ON m.id = o.master_product_id
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = m.vertical AND o.current_price_cents > 0
        AND o.external_ref ~ '^(amazon-[A-Z0-9]{10}|shopee-[0-9]{1,19})$'
    ), t AS (SELECT * FROM alvo WHERE rn = 1 AND gate)
    SELECT t.net, t.vertical, count(*)::text AS alvo,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = t.id AND r.read_at > now() - make_interval(mins => ${fresh}::int)))::text AS lidas2h,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM offer_coupon_reads r
             WHERE r.offer_id = t.id AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - make_interval(mins => ${fresh}::int)
               AND r.price_with_coupon_cents < t.price AND r.price_seen_cents = t.price AND COALESCE(r.label, '') !~* 'seguir|prime|novos? (usu|cli)|primeira compra'
               AND NOT EXISTS (SELECT 1 FROM offer_coupon_reads n WHERE n.offer_id = t.id AND n.price_with_coupon_cents IS NULL AND n.read_at > r.read_at)))::text AS na_agulha,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = t.id AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - interval '24 hours'))::text AS velho,
           round(extract(epoch FROM now() - max((SELECT max(r.read_at) FROM offer_coupon_reads r WHERE r.offer_id = t.id))) / 60)::text AS age
    FROM t GROUP BY t.net, t.vertical ORDER BY t.net, t.vertical`)) as unknown as { net: string; vertical: string; alvo: string; lidas2h: string; na_agulha: string; velho: string; age: string | null }[];

  const cobertura: CoberturaLinha[] = [
    ...alvo.map((r) => ({
      network: 'mercado-livre', vertical: r.vertical, ofertasAlvo: num(r.alvo), lidas2h: num(r.lidas2h), naAgulha: num(r.na_agulha), cupomVelho: Math.max(0, num(r.velho) - num(r.na_agulha)),
      ultimaLeituraMin: r.age == null ? null : num(r.age),
    })),
    ...pagina.map((r) => ({
      network: r.net, vertical: r.vertical, ofertasAlvo: num(r.alvo), lidas2h: num(r.lidas2h), naAgulha: num(r.na_agulha), cupomVelho: Math.max(0, num(r.velho) - num(r.na_agulha)),
      ultimaLeituraMin: r.age == null ? null : num(r.age),
    })),
    ...semFonte.map((r) => ({ network: r.net, vertical: r.vertical, ofertasAlvo: num(r.n), lidas2h: 0, naAgulha: 0, cupomVelho: 0, ultimaLeituraMin: null })),
  ];

  const listasRows = (await db.execute<{ net: string; vivos: string; conf: string; age: string | null }>(sql`
    SELECT network_slug AS net,
           count(*) FILTER (WHERE state IN ('verificado', 'nao_verificado') AND (valid_until IS NULL OR valid_until > now()))::text AS vivos,
           count(*) FILTER (WHERE state = 'verificado' AND (valid_until IS NULL OR valid_until > now()) AND last_seen_at > now() - make_interval(mins => ${alive}::int))::text AS conf,
           round(extract(epoch FROM now() - max(last_seen_at)) / 60)::text AS age
    FROM coupon_items WHERE source_kind <> 'manual_dono' GROUP BY 1 ORDER BY 1`)) as unknown as { net: string; vivos: string; conf: string; age: string | null }[];
  const listas: ListasLinha[] = listasRows.map((r) => ({ network: r.net, vivos: num(r.vivos), conferidos12h: num(r.conf), ultimaLeituraMin: r.age == null ? null : num(r.age) }));

  // Mensagens enviadas em 24 h e por que (não) levaram cupom. Classificação pela leitura ANTERIOR ao envio (janela de 2 h).
  const msgs = (await db.execute<{ net: string; vertical: string; motivo: MotivoSemCupom; n: string }>(sql`
    WITH s AS (
      SELECT g.id, g.offer_id, g.sent_at, g.vertical, nn.slug AS net, (g.text_body ~* 'cupom') AS tem,
             (g.msg_class IN ('alerta', 'insight') AND g.trigger <> 'RADAR') AS consulta
      FROM group_messages g JOIN affiliate_offers o ON o.id = g.offer_id JOIN affiliate_networks nn ON nn.id = o.network_id
      WHERE g.status = 'enviada' AND g.sent_at > now() - interval '24 hours'
    )
    SELECT net, vertical,
      CASE WHEN tem THEN 'com_cupom'
           WHEN NOT consulta THEN 'nao_consultou'
           WHEN net NOT IN ('mercado-livre', 'amazon', 'shopee') THEN 'rede_sem_leitura_autorizada'
           WHEN NOT EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = s.offer_id AND r.read_at <= s.sent_at AND r.read_at > s.sent_at - make_interval(mins => ${fresh}::int)) THEN 'sem_leitura_2h'
           WHEN EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = s.offer_id AND r.price_with_coupon_cents IS NOT NULL AND r.read_at <= s.sent_at AND r.read_at > s.sent_at - make_interval(mins => ${fresh}::int)) THEN 'cupom_lido_reprovado'
           ELSE 'lida_sem_cupom' END AS motivo,
      count(*)::text AS n
    FROM s GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`)) as unknown as { net: string; vertical: string; motivo: MotivoSemCupom; n: string }[];
  const byKey = new Map<string, MensagensLinha>();
  for (const r of msgs) {
    const k = `${r.net}|${r.vertical}`;
    const row = byKey.get(k) ?? { network: r.net, vertical: r.vertical, enviadas: 0, porMotivo: {} };
    row.enviadas += num(r.n);
    row.porMotivo[r.motivo] = num(r.n);
    byKey.set(k, row);
  }

  let motivosRegistrados: SaudeAgulha['motivosRegistrados'] = null;
  try {
    const rows = (await db.execute<{ motivo: string; n: string }>(sql`
      SELECT split_part(split_part(miss_reason, ' | ', 1), ':', 2) AS motivo, count(*)::text AS n FROM coupon_consults
      WHERE found = false AND miss_reason IS NOT NULL AND consulted_at > now() - interval '24 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 12`)) as unknown as { motivo: string; n: string }[];
    motivosRegistrados = rows.map((r) => ({ motivo: r.motivo || 'sem_motivo', consultas: num(r.n) }));
  } catch {
    motivosRegistrados = null; // migration 0041 ainda não aplicada
  }

  let guardiao: SaudeAgulha['guardiao'] = null;
  try {
    const g = (await db.execute<{ abertos: string; enc: string; pend: string }>(sql`
      SELECT count(*) FILTER (WHERE ended_at IS NULL)::text AS abertos,
             count(*) FILTER (WHERE ended_at > now() - interval '24 hours')::text AS enc,
             count(*) FILTER (WHERE ended_at IS NOT NULL AND end_notified_at IS NULL AND (end_reason IN ('sumiu_da_pagina', 'cancelado_pelo_dono') OR (end_reason = 'venceu' AND kind <> 'anuncio')) AND ended_at > now() - interval '6 hours')::text AS pend
      FROM coupon_announcements`)) as unknown as { abertos: string; enc: string; pend: string }[];
    guardiao = { abertos: num(g[0]?.abertos), encerrados24h: num(g[0]?.enc), avisosPendentes: num(g[0]?.pend) };
  } catch {
    guardiao = null;
  }

  let batimentos: SaudeAgulha['batimentos'] = null;
  try {
    const agora = new Date();
    batimentos = (await lerBatimentos()).map((b) => ({ ...b, situacao: situacaoBatimento(b, agora) }));
  } catch {
    batimentos = null; // collector_runs ausente (migration 0025)
  }

  return { geradoEm: new Date().toISOString(), cobertura, listas, mensagens24h: [...byKey.values()], motivosRegistrados, guardiao, batimentos };
}

/** Resumo numérico pequeno para collector_runs.meta (histórico da cobertura a cada ciclo). */
export function resumoSaude(s: SaudeAgulha): Record<string, unknown> {
  const ml = s.cobertura.filter((c) => c.network === 'mercado-livre');
  return {
    agulhaAlvoML: ml.reduce((a, c) => a + c.ofertasAlvo, 0),
    agulhaLidas2h: ml.reduce((a, c) => a + c.lidas2h, 0),
    agulhaComCupom: ml.reduce((a, c) => a + c.naAgulha, 0),
    agulhaCupomVelho: ml.reduce((a, c) => a + c.cupomVelho, 0),
    listasVivas: s.listas.reduce((a, l) => a + l.vivos, 0),
  };
}
