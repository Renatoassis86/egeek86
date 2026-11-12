/**
 * Medição SOMENTE LEITURA da régua de destaque em produção (ata 2026-11-12-regua-mensagens).
 *   npx tsx --env-file=.env.local scripts/medir-regua-producao.ts [ISO_DESDE]
 * Mostra, desde o instante dado: envios por loja e degrau (canal tg e wa), termos banidos nos textos enviados, mensagens da régua fora das lojas
 * liberadas, terço do degrau 1 por hora, link curto atribuído, Destaques e a duração/erros do job group-messages. Nunca imprime segredos.
 */
import { connect } from './_dup-shared';

const desde = process.argv[2] ?? new Date(Date.now() - 15 * 60_000).toISOString();

async function main() {
  const sql = connect();
  try {
    console.log('Desde:', desde);
    console.log('\n== Envios Telegram por loja/status (todas as lojas)');
    console.table(await sql`SELECT vertical, status, count(*)::int AS n FROM group_messages WHERE channel = 'tg' AND created_at >= ${desde}::timestamptz GROUP BY 1, 2 ORDER BY 1, 2`);
    console.log('\n== Mensagens com régua por loja, status e degrau (tg)');
    console.table(await sql`
      SELECT vertical, status, candidate -> 'regua' ->> 'degrau' AS degrau, candidate -> 'regua' ->> 'rotulo' AS rotulo, count(*)::int AS n
      FROM group_messages WHERE channel = 'tg' AND created_at >= ${desde}::timestamptz AND candidate ? 'regua' GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3`);
    console.log('\n== Régua fora de loja liberada (deve ser 0)');
    console.table(await sql`SELECT count(*)::int AS n FROM group_messages WHERE created_at >= ${desde}::timestamptz AND candidate ? 'regua' AND vertical NOT IN ('eletrodomesticos', 'esporte')`);
    console.log('\n== Enviadas desde então: termos banidos no texto (deve ser 0)');
    console.table(await sql`
      SELECT count(*)::int AS enviadas,
             count(*) FILTER (WHERE text_body ~* 'afiliad|% ?off\\y|metodologia|amostra pequena|\\(Bras[ií]lia\\)|imperd[ií]vel|vai (cair|baixar|subir)|previs[aã]o')::int AS com_termo_banido,
             count(*) FILTER (WHERE vertical IN ('eletrodomesticos', 'esporte') AND text_body ~ '[🟦🟩🟨🟧🟥]')::int AS com_bloco_de_cor,
             count(*) FILTER (WHERE vertical IN ('eletrodomesticos', 'esporte') AND candidate ? 'regua' AND text_body !~ '▼')::int AS regua_sem_marcas
      FROM group_messages WHERE channel = 'tg' AND status = 'enviada' AND sent_at >= ${desde}::timestamptz`);
    console.log('\n== Terço do degrau 1 por hora e grupo (enviadas)');
    console.table(await sql`
      SELECT vertical, date_trunc('hour', sent_at) AS hora, count(*)::int AS total,
             count(*) FILTER (WHERE candidate -> 'regua' ->> 'degrau' = '1')::int AS degrau1
      FROM group_messages WHERE channel = 'tg' AND status = 'enviada' AND sent_at >= ${desde}::timestamptz AND vertical IN ('eletrodomesticos', 'esporte') GROUP BY 1, 2 ORDER BY 2, 1`);
    console.log('\n== Link curto (wa) e Destaques');
    console.table(await sql`SELECT count(*)::int AS wa_regua, count(short_code)::int AS com_codigo_curto, count(*) FILTER (WHERE text_body ~ 'egeek86\\.com/g/[0-9A-Za-z]{5}')::int AS texto_com_link_curto FROM group_messages WHERE channel = 'wa' AND created_at >= ${desde}::timestamptz AND candidate ? 'regua'`);
    console.table(await sql`SELECT candidate -> 'destaques' ->> 'ok' AS destaques_ok, count(*)::int AS n FROM group_messages WHERE channel = 'tg' AND created_at >= ${desde}::timestamptz AND candidate ? 'destaques' GROUP BY 1`);
    console.log('\n== Job group-messages (collector_runs)');
    console.table(await sql`
      SELECT count(*)::int AS execucoes, round(avg(duration_ms))::int AS media_ms, max(duration_ms)::int AS max_ms,
             count(*) FILTER (WHERE duration_ms > 45000)::int AS acima_45s, count(*) FILTER (WHERE status <> 'ok')::int AS erros,
             sum(checked)::int AS enviadas_total
      FROM collector_runs WHERE job = 'group-messages' AND started_at >= ${desde}::timestamptz`);
    console.log('\n== Amostra das últimas mensagens da régua enviadas (id curto, loja, degrau, preço, média, % abaixo)');
    console.table(await sql`
      SELECT left(message_key, 18) AS chave, vertical, candidate -> 'regua' ->> 'degrau' AS degrau, price_cents_detected AS preco, avg_cents AS media,
             round(((avg_cents - price_cents_detected)::numeric / NULLIF(avg_cents, 0)) * 100, 1) AS pct_abaixo, candidate -> 'regua' ->> 'pct' AS pct_msg, has_card
      FROM group_messages WHERE channel = 'tg' AND status = 'enviada' AND sent_at >= ${desde}::timestamptz AND candidate ? 'regua' ORDER BY sent_at DESC LIMIT 12`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
