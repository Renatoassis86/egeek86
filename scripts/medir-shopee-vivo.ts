/**
 * R-119: medicao do leitor de paginas da Shopee. Consultas LEVES (statement_timeout, LIMIT). Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/medir-shopee-vivo.ts [--min 60]
 * Mostra, na janela: paginas verificadas, esgotados/expirados, divergencia de preco banco x pagina, verificacoes anti-robo (deve ser 0), batimento do loop, itens Shopee
 * da vitrine com leitura fresca e o envio de mensagens (enviada/h e p95 do ciclo) para conferir que nada piorou.
 */
import { connect } from './_dup-shared';

const i = process.argv.indexOf('--min');
const MIN = i >= 0 ? Number(process.argv[i + 1]) || 60 : 60;
(async () => {
  const sql = connect();
  try {
    await sql`SET statement_timeout = 8000`;
    const [l] = await sql`SELECT count(*)::int AS lotes, COALESCE(sum(checked), 0)::int AS paginas, COALESCE(sum((meta->>'expiradas')::int), 0)::int AS expiradas, COALESCE(sum((meta->>'disponiveis')::int), 0)::int AS disponiveis,
        COALESCE(sum((meta->>'divergentes')::int), 0)::int AS divergentes, round(avg((meta->>'divMediaPct')::numeric), 1) AS div_media_pct
      FROM collector_runs WHERE job = 'disponibilidade-viva' AND network = 'shopee' AND started_at > now() - make_interval(mins => ${MIN})`;
    console.log('leitura de paginas (Shopee):', l);
    const [b] = await sql`SELECT count(*) FILTER (WHERE status = 'error')::int AS verificacoes, count(*) FILTER (WHERE status = 'ok')::int AS retomadas FROM collector_runs WHERE job = 'shopee-vivo-bloqueio' AND started_at > now() - make_interval(mins => ${MIN})`;
    console.log('verificacao anti-robo (deve ser 0):', b);
    const [h] = await sql`SELECT count(*)::int AS batimentos, max(started_at) AS ultimo, max(meta->>'versao') AS versao FROM collector_runs WHERE job = 'loop:shopee-vivo' AND started_at > now() - make_interval(mins => ${MIN})`;
    console.log('batimento do loop:', h);
    const [v] = await sql`SELECT count(*)::int AS leituras_validas_15min, count(*) FILTER (WHERE NOT disponivel)::int AS esgotadas FROM oferta_verificacao_viva WHERE fonte = 'pagina_shopee' AND verificado_em > now() - interval '15 minutes'`;
    console.log('leituras de pagina com ate 15 min:', v);
    const q = await sql`SELECT count(*)::int AS n FROM affiliate_offers WHERE quarantine_reason = 'esgotado_pagina' AND quarantined_at > now() - make_interval(mins => ${MIN})`;
    console.log('quarentenas esgotado_pagina na janela:', q[0]);
    const vit = await sql`SELECT job, to_char(started_at, 'HH24:MI') AS hora, checked, meta->'vivo' AS vivo FROM collector_runs WHERE job LIKE 'vitrine-games:%' AND started_at > now() - make_interval(mins => ${MIN}) ORDER BY started_at DESC LIMIT 12`;
    console.log('vitrines na janela (checked = jogos listados; vivo = barrados por motivo):');
    for (const r of vit) console.log(' ', r.job, r.hora, r.checked, JSON.stringify(r.vivo));
    const env = await sql`SELECT to_char(date_trunc('hour', started_at), 'HH24') AS h, count(*)::int AS ciclos, sum(checked)::int AS checked, round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95_ms
      FROM collector_runs WHERE job = 'group-messages' AND started_at > now() - interval '4 hours' GROUP BY 1 ORDER BY 1`;
    console.log('envio (group-messages) por hora:'); console.table(env);
    const f = await sql`SELECT status, count(*)::int AS n, max(started_at) AS ultimo, round(avg(duration_ms))::int AS ms FROM collector_runs WHERE job = 'foto-vitrine-pontuar' AND started_at > now() - interval '3 hours' GROUP BY status`;
    console.log('foto-vitrine-pontuar (3 h):', f);
  } finally { await sql.end({ timeout: 5 }); }
})().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
