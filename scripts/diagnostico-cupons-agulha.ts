/**
 * Diagnóstico MEDIDO do estado dos cupons (somente SELECT). Nada é escrito.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/diagnostico-cupons-agulha.ts
 * Saída: inventário de cupons por loja/escopo/estado e idade da última leitura; cobertura da agulha por departamento; mensagens de 24 h
 * (com cupom ou por que não); listas; fila de revalidação (amostra) e o que a baixa automática faria (dry-run).
 */
import { sql } from 'drizzle-orm';

async function main() {
  const { db } = await import('../src/lib/db');
  const { saudeAgulha } = await import('../src/server/coupons/agulha-health');
  const { baixarCuponsParados } = await import('../src/server/coupons/baixa');
  const { listarFilaRevalidacao } = await import('../src/server/coupons/revalidation-queue');
  const { MOTIVO_LABEL, pct } = await import('../src/lib/coupons/agulha-health-model');
  const q = async <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => (await db.execute<T>(s)) as unknown as T[];
  const p = (t: string, r: unknown) => {
    console.log(`\n## ${t}`);
    console.table(r);
  };

  p(
    '1. Inventário de cupons (coupon_items) por rede / origem / escopo / estado',
    await q(sql`
      SELECT network_slug AS rede, source_kind AS origem, scope_kind AS escopo, state AS estado, count(*)::int AS n,
             count(*) FILTER (WHERE valid_until > now())::int AS validade_futura, count(*) FILTER (WHERE valid_until IS NULL)::int AS sem_validade_lida,
             count(*) FILTER (WHERE valid_until <= now())::int AS prazo_vencido,
             round(extract(epoch FROM now() - max(last_seen_at)) / 3600, 1)::text AS h_desde_ultima_leitura,
             round(extract(epoch FROM now() - min(last_seen_at)) / 3600, 1)::text AS h_leitura_mais_velha,
             round(extract(epoch FROM now() - max(verified_at)) / 3600, 1)::text AS h_desde_ultima_verificacao
      FROM coupon_items GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`)
  );
  p(
    '1b. Cupons verificados e vigentes por idade da última conferência',
    await q(sql`
      SELECT network_slug AS rede, scope_kind AS escopo,
             count(*) FILTER (WHERE last_seen_at > now() - interval '2 hours')::int AS ate_2h,
             count(*) FILTER (WHERE last_seen_at <= now() - interval '2 hours' AND last_seen_at > now() - interval '12 hours')::int AS de_2h_a_12h,
             count(*) FILTER (WHERE last_seen_at <= now() - interval '12 hours')::int AS mais_de_12h
      FROM coupon_items WHERE state = 'verificado' AND (valid_until IS NULL OR valid_until > now()) GROUP BY 1, 2 ORDER BY 1, 2`)
  );
  p(
    '1c. Cupons de categoria: rótulo, departamento que o rótulo declara e se a regra diz "produtos selecionados"',
    await q(sql`
      SELECT scope->'categorias'->>0 AS rotulo, count(*)::int AS n, bool_and(conditions_raw ILIKE '%selecionad%') AS todos_selecionados
      FROM coupon_items WHERE scope_kind = 'categoria' AND state IN ('verificado', 'nao_verificado') AND (valid_until IS NULL OR valid_until > now())
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15`)
  );
  p(
    '2. Leituras por anúncio (offer_coupon_reads)',
    await q(sql`
      SELECT count(*)::int AS leituras, count(DISTINCT offer_id)::int AS ofertas,
             count(DISTINCT offer_id) FILTER (WHERE price_with_coupon_cents IS NOT NULL AND read_at > now() - interval '2 hours')::int AS ofertas_com_cupom_2h,
             count(DISTINCT offer_id) FILTER (WHERE price_with_coupon_cents IS NOT NULL AND read_at > now() - interval '24 hours')::int AS ofertas_com_cupom_24h,
             count(DISTINCT offer_id) FILTER (WHERE read_at > now() - interval '2 hours')::int AS ofertas_lidas_2h,
             round(extract(epoch FROM now() - max(read_at)) / 60)::int AS min_desde_ultima FROM offer_coupon_reads`)
  );
  p(
    '2b. Estabilidade do cupom do anúncio (leitura positiva -> próxima leitura da mesma oferta) por intervalo; base da janela de 120 min',
    await q(sql`
      WITH x AS (SELECT offer_id, read_at, price_with_coupon_cents AS pw, price_seen_cents AS ps,
                        lead(read_at) OVER w AS nxt, lead(price_with_coupon_cents) OVER w AS npw, lead(price_seen_cents) OVER w AS nps
                 FROM offer_coupon_reads WINDOW w AS (PARTITION BY offer_id ORDER BY read_at))
      SELECT CASE WHEN nxt - read_at < interval '1 hour' THEN '<1h' WHEN nxt - read_at < interval '2 hours' THEN '1-2h' WHEN nxt - read_at < interval '4 hours' THEN '2-4h' ELSE '>4h' END AS intervalo,
             count(*)::int AS pares, count(*) FILTER (WHERE npw IS NULL)::int AS cupom_sumiu, count(*) FILTER (WHERE npw IS NOT NULL AND npw <> pw)::int AS valor_mudou,
             count(*) FILTER (WHERE nps <> ps)::int AS preco_do_anuncio_mudou
      FROM x WHERE pw IS NOT NULL AND nxt IS NOT NULL GROUP BY 1 ORDER BY 1`)
  );

  const s = await saudeAgulha();
  p('3. Cobertura na agulha por rede/departamento', s.cobertura);
  p('3b. Listas de cupons', s.listas);
  console.log('\n## 4. Mensagens enviadas em 24 h: com cupom ou por que não');
  for (const m of s.mensagens24h) {
    console.log(`${m.network}/${m.vertical}: ${m.enviadas} enviadas`);
    for (const [k, v] of Object.entries(m.porMotivo)) console.log(`   ${MOTIVO_LABEL[k as keyof typeof MOTIVO_LABEL]}: ${v} (${pct(v, m.enviadas)}%)`);
  }
  console.log('\nMotivos registrados pelo motor (coupon_consults.miss_reason, 24 h):', JSON.stringify(s.motivosRegistrados));
  console.log('Guardião:', JSON.stringify(s.guardiao));

  p(
    '5. Mensagens da fila (proposta/auto/aprovada) hoje: leitura de cupom dentro da janela de 2 h',
    await q(sql`
      SELECT g.status, count(*)::int AS msgs,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = g.offer_id AND r.read_at > now() - interval '2 hours'))::int AS lida_2h,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = g.offer_id AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - interval '2 hours'))::int AS com_cupom_2h
      FROM group_messages g WHERE g.status IN ('proposta', 'proposta_auto', 'aprovada', 'retida') GROUP BY 1 ORDER BY 1`)
  );

  const fila = await listarFilaRevalidacao(40);
  const porPrio = fila.reduce<Record<string, number>>((m, r) => ((m[`${r.prioridade} ${r.motivo}`] = (m[`${r.prioridade} ${r.motivo}`] ?? 0) + 1), m), {});
  p('6. Fila de revalidação (primeiras 40 devidas) por prioridade', porPrio);
  p('6b. Fila (5 primeiras)', fila.slice(0, 5).map((r) => ({ id: r.id.slice(0, 8), prioridade: r.prioridade, motivo: r.motivo, ultimaLeituraMin: r.ultimaLeituraMin })));

  p('7. Baixa automática (dry-run: o que o próximo ciclo faria)', await baixarCuponsParados(new Date(), true));

  // 8. Consulta REAL do motor (consultarCupom) sobre as ofertas-alvo, sem gravar auditoria: quantas saem com cupom e por que as demais não.
  if (process.argv.includes('--consultar')) {
    const { consultarCupom } = await import('../src/server/messaging/agente-cupons');
    const { lookupItemCoupon } = await import('../src/server/messaging/coupon-item-lookup');
    const { lookupCampaignCoupon } = await import('../src/server/messaging/campaign-coupon-lookup');
    const { lookupVerifiedCoupon } = await import('../src/server/messaging/coupon-lookup');
    const ids = await q<{ id: string; vertical: string }>(sql`
      SELECT id::text AS id, vertical FROM (
        SELECT o.id, o.vertical, row_number() OVER (PARTITION BY o.master_product_id ORDER BY o.current_price_cents ASC, o.id) AS rn
        FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre'
        WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0 AND o.affiliate_url LIKE 'https://meli.la/%') t
      WHERE rn = 1 LIMIT 900`);
    const porFonte: Record<string, number> = {};
    const porMotivo: Record<string, number> = {};
    for (const o of ids) {
      const misses: string[] = [];
      const trace = (r: string) => misses.push(r);
      const r = await consultarCupom(o.id, {
        item: (id) => lookupItemCoupon(id, trace),
        campanha: (id) => lookupCampaignCoupon(id, trace),
        lojaCategoria: (id) => lookupVerifiedCoupon(id, trace),
        audit: async () => undefined,
      });
      const k = `${o.vertical} / ${r ? `com cupom (${r.source})` : 'sem cupom'}`;
      porFonte[k] = (porFonte[k] ?? 0) + 1;
      if (!r) for (const m of new Set(misses)) porMotivo[m] = (porMotivo[m] ?? 0) + 1;
    }
    p('8. Consulta real do motor sobre ' + ids.length + ' ofertas-alvo (sem gravar auditoria)', porFonte);
    p('8b. Motivos de descarte (por etapa; uma oferta pode ter um motivo por etapa)', porMotivo);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
