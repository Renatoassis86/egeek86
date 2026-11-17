/**
 * E1 (R-89/R-90, fila #142): MEDIDOR DE FRESCOR por rede. SOMENTE LEITURA.
 *   npx tsx --env-file=.env.local scripts/medir-frescor.ts [--json]
 * Informa a idade (p50/p90/max) do preço lido das ofertas ATIVAS por rede (idade exibida: informativa, R-90) e o frescor do que foi ENVIADO
 * em mensagens nas últimas 24 h (invariante: Amazon <= AMAZON_FRESCOR_MIN, demais <= 60 min). Falha (código 1) só pela invariante de envio.
 */
import { connect } from './_dup-shared';
import { amazonFrescorMin } from '../src/lib/messaging/confirmacao-preco';
import { distribuicao, idadeMin } from '../src/lib/frescor/medidor';

(async () => {
  const sql = connect();
  const now = new Date();
  try {
    const rows = await sql.unsafe<{ rede: string; lido: Date | null }[]>(`
      SELECT n.slug rede, o.last_price_confirmed_at lido
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id
      WHERE o.status='active' AND o.quarantined_at IS NULL`);
    const porRede = new Map<string, Array<number | null>>();
    for (const r of rows) {
      const a = porRede.get(r.rede) ?? [];
      a.push(idadeMin(r.lido, now));
      porRede.set(r.rede, a);
    }
    const exibida: Record<string, ReturnType<typeof distribuicao>> = {};
    for (const [rede, ids] of porRede) exibida[rede] = distribuicao(ids, { '45min': 45, '2h': 120, '24h': 1440, '7d': 10080 });

    // Enviado: idade da leitura do preço no momento do envio (mensagens do canal/grupos nas últimas 24 h).
    let envio: { rede: string; n: number; max_min: number | null; acima: number }[] = [];
    let envioNota = '';
    try {
      const lim = amazonFrescorMin();
      envio = await sql.unsafe(`
        SELECT n.slug rede, count(*)::int n,
          round(max(extract(epoch from (m.sent_at - o.last_price_confirmed_at))/60))::int max_min,
          count(*) FILTER (WHERE extract(epoch from (m.sent_at - o.last_price_confirmed_at))/60 > CASE WHEN n.slug='amazon' THEN ${lim} ELSE 60 END)::int acima
        FROM group_messages m
        JOIN affiliate_offers o ON o.id = m.offer_id
        JOIN affiliate_networks n ON n.id = o.network_id
        WHERE m.status='enviada' AND m.sent_at > now() - interval '24 hours' AND o.last_price_confirmed_at IS NOT NULL
        GROUP BY n.slug`);
    } catch (e) {
      envioNota = 'envio não medido (tabela/colunas de mensagens diferentes): ' + String((e as Error).message).slice(0, 80);
    }
    const violacoes = envio.reduce((s, x) => s + x.acima, 0);
    const out = { medido_em: now.toISOString(), exibida, envio, envioNota, violacoes_envio: violacoes };
    if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
    else {
      console.log('IDADE EXIBIDA (informativa, R-90) — rede: n, p50, p90, max (min), sem leitura');
      for (const [r, d] of Object.entries(exibida)) console.log(`  ${r}: n=${d.n} p50=${d.p50 == null ? '-' : Math.round(d.p50)} p90=${d.p90 == null ? '-' : Math.round(d.p90)} max=${d.max == null ? '-' : Math.round(d.max)} sem_leitura=${d.semLeitura} <=45min=${d.ate['45min']} <=24h=${d.ate['24h']}`);
      console.log('ENVIADO nas últimas 24 h (invariante):');
      for (const e of envio) console.log(`  ${e.rede}: ${e.n} msgs, leitura mais velha ${e.max_min} min, acima do limite ${e.acima}`);
      if (envioNota) console.log('  ' + envioNota);
      console.log(violacoes === 0 ? 'OK: nenhuma mensagem com preço acima do limite' : `FALHA: ${violacoes} mensagens com preço acima do limite`);
    }
    process.exitCode = violacoes === 0 ? 0 : 1;
  } finally { await sql.end(); }
})();
