/**
 * Simulacao do gatilho CUPOM com dados REAIS (somente SELECT; nada e gravado, nada e enviado).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/simular-gatilho-cupom.ts
 * Saida: (1) leituras positivas de cupom por hora nas ultimas 6 h (ofertas distintas, quantas "por seguir a loja"); (2) o ciclo de deteccao
 * AGORA (pool com produtos de cupom, candidatos CUPOM gerados e enviaveis por loja, motivos de barra da agulha); (3) o plano de envio
 * (applyLimits) com o historico real do canal: quantos cupons sairiam agora e quem fica adiado, e o que a cota por loja faria em 1 hora.
 */
import { sql } from 'drizzle-orm';

async function main() {
  const { db } = await import('../src/lib/db');
  const { detectGroupCandidates } = await import('../src/server/messaging/group-offers');
  const q = async <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => (await db.execute<T>(s)) as unknown as T[];
  const p = (t: string, r: unknown) => {
    console.log(`\n## ${t}`);
    console.table(r);
  };

  p(
    '1. Leituras de cupom do anuncio por hora (6 h): ofertas distintas com leitura positiva',
    await q(sql`
      SELECT date_trunc('hour', r.read_at AT TIME ZONE 'America/Sao_Paulo')::text AS hora_brt,
             count(*)::int AS leituras, count(*) FILTER (WHERE r.price_with_coupon_cents IS NOT NULL)::int AS positivas,
             count(DISTINCT r.offer_id) FILTER (WHERE r.price_with_coupon_cents IS NOT NULL)::int AS ofertas_positivas,
             count(DISTINCT r.offer_id) FILTER (WHERE r.price_with_coupon_cents IS NOT NULL AND coalesce(r.label, '') !~* 'seguir')::int AS ofertas_positivas_sem_seguir_loja
      FROM offer_coupon_reads r WHERE r.read_at > now() - interval '6 hours' GROUP BY 1 ORDER BY 1`)
  );

  const t0 = Date.now();
  const d = await detectGroupCandidates({ includeSimulated: false });
  console.log(`\n## 2. Deteccao agora (${Math.round((Date.now() - t0) / 1000)} s): produtos avaliados ${d.counts.productsEvaluated}, candidatos ${d.counts.candidates}`);
  console.log('cupom:', JSON.stringify(d.cupom));
  const cups = d.candidates.filter((c) => c.trigger === 'CUPOM');
  p(
    'Candidatos CUPOM por loja',
    Object.entries(
      cups.reduce<Record<string, { gerados: number; enviaveis_auto: number; revisao: number; retidos: number }>>((m, c) => {
        const e = (m[c.vertical] ??= { gerados: 0, enviaveis_auto: 0, revisao: 0, retidos: 0 });
        e.gerados++;
        if (c.sendable && c.status === 'auto' && !c.held) e.enviaveis_auto++;
        if (c.status === 'review') e.revisao++;
        if (c.held) e.retidos++;
        return m;
      }, {})
    ).map(([loja, v]) => ({ loja, ...v }))
  );
  const blockedCup = d.blocked.filter((b) => b.trigger === 'CUPOM');
  const why: Record<string, number> = {};
  for (const b of blockedCup) for (const r of b.reasons.filter((x) => x !== 'cupom' && !x.startsWith('oferta:'))) why[r.replace(/_\d+min$/, '')] = (why[r.replace(/_\d+min$/, '')] ?? 0) + 1;
  p('Barras no gatilho CUPOM (oferta com leitura que nao virou mensagem)', Object.entries(why).sort((a, b) => b[1] - a[1]).map(([motivo, n]) => ({ motivo, n })));
  p(
    'Amostra de mensagens de cupom (sem enviar)',
    cups.slice(0, 5).map((c) => ({ loja: c.vertical, produto: c.name.slice(0, 50), preco_anuncio: c.priceCents / 100, status: c.status, motivo: c.reason.slice(0, 110) }))
  );
  if (cups[0]) console.log('\n--- exemplo de texto (Telegram) ---\n' + cups[0].texts.telegram);

  const plan = d.plan;
  const cupInPlan = plan.next?.trigger === 'CUPOM';
  console.log(`\n## 3. Plano de envio agora: proximo = ${plan.next ? `${plan.next.trigger} (${plan.next.vertical})` : 'nada'}; cupom e o proximo? ${cupInPlan}`);
  const defer: Record<string, number> = {};
  const cupKeys = new Set(cups.map((c) => c.messageKey));
  for (const x of plan.deferred.filter((y) => cupKeys.has(y.messageKey))) defer[x.reason.replace(/_\d+(min|h)$/, '')] = (defer[x.reason.replace(/_\d+(min|h)$/, '')] ?? 0) + 1;
  p('Cupons adiados pelo plano (motivo)', Object.entries(defer).map(([motivo, n]) => ({ motivo, n })));

  p(
    '4. Mensagens de cupom no canal (24 h, tabela group_messages)',
    await q(sql`SELECT status, count(*)::int AS n FROM group_messages WHERE channel = 'tg' AND trigger = 'CUPOM' AND created_at > now() - interval '24 hours' GROUP BY 1`).catch(() => [])
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
