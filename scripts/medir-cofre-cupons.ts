/**
 * INVARIANTES DO COFRE (R-64 a R-67), somente leitura. Falha (exit 1) se:
 *  (1) existe rede ATIVA sem validador registrado;
 *  (2) existe aviso de cupom ABERTO (coupon_announcements sem ended_at) de ML/Amazon/Shopee sem prova vigente no cofre (divulgado sem prova);
 *  (3) existe mensagem CUPOM enviada nas últimas 24 h sem linha do cofre liberada/vigente no momento do envio (hoje informativo até a 1ª janela completa pós-deploy).
 * Métrica diária por rede: liberados, barrados, revogados (trilha). Uso: npx tsx --env-file=.env.local scripts/medir-cofre-cupons.ts
 */
import { connect } from './_dup-shared';
import { redesSemValidador } from '../src/lib/coupons/cofre';

async function main() {
  const sql = connect();
  let falhas = 0;
  try {
    const redes = (await sql`SELECT DISTINCT n.slug FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.status = 'active'`).map((r) => String(r.slug));
    const sem = redesSemValidador(redes);
    console.log(`${sem.length ? 'FALHA' : 'OK  '} [1] redes ativas sem validador registrado: ${sem.length ? sem.join(', ') : 'nenhuma'} (redes: ${redes.join(', ')})`);
    falhas += sem.length ? 1 : 0;

    const abertos = await sql`
      SELECT a.offer_id::text AS offer, a.network_slug AS rede, left(a.label, 40) AS label FROM coupon_announcements a
      WHERE a.ended_at IS NULL AND a.offer_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM coupon_validations v WHERE v.offer_id = a.offer_id AND v.state IN ('divulgavel', 'revalidando') AND v.expires_at > now())`;
    console.log(`${abertos.length ? 'FALHA' : 'OK  '} [2] avisos de cupom abertos sem prova vigente no cofre: ${abertos.length}${abertos.length ? `  ex.: ${abertos.slice(0, 3).map((x) => `${x.offer.slice(0, 8)}(${x.rede})`).join(', ')}` : ''}`);
    falhas += abertos.length ? 1 : 0;

    const [msg] = await sql`
      SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM coupon_validations v WHERE v.offer_id = m.offer_id AND v.validated_at IS NOT NULL AND v.validated_at <= m.sent_at AND v.expires_at >= m.sent_at))::int AS sem_prova
      FROM group_messages m WHERE m.trigger = 'CUPOM' AND m.sent_at > now() - interval '24 hours' AND m.offer_id IS NOT NULL`;
    console.log(`INFO [3] mensagens CUPOM enviadas em 24 h: ${msg.n}; sem prova vigente no cofre no envio: ${msg.sem_prova} (as anteriores ao cofre não têm linha; a janela fica limpa 24 h depois do deploy)`);

    // [4] PS5/R-61 (preço-isca): informativo aqui; a invariante é m.1/m.2 em scripts/medir-integridade-preco.ts (oferta-isca fora da quarentena = falha).
    const isca = await sql`SELECT count(*)::int AS n FROM affiliate_offers WHERE quarantine_reason = 'preco_isca_abaixo_dos_outros_anuncios' AND status = 'active'`.catch(() => null);
    console.log(`INFO [4] ofertas ativas em quarentena por preço-isca (R-61): ${isca ? isca[0]!.n : 'n/d'} (invariante m.1/m.2 no medidor de integridade)`);

    // [5] retirada dos avisos: a flag está ligada e a função é chamada pelo cron? (informativo; cada ciclo do cron registra em collector_runs 'cofre-cupons')
    const ult = await sql`SELECT max(started_at) AS t FROM collector_runs WHERE job = 'cofre-cupons'`.catch(() => null);
    console.log(`INFO [5] último registro do cofre em collector_runs: ${ult && ult[0]!.t ? new Date(ult[0]!.t).toISOString() : 'nenhum ainda (aparece quando há revogação ou retirada)'}`);

    console.log('== trilha por rede (24 h)');
    console.table(await sql`SELECT network_slug AS rede, count(*) FILTER (WHERE acao IN ('liberado','revalidando'))::int liberados, count(*) FILTER (WHERE acao = 'barrado')::int barrados, count(*) FILTER (WHERE acao = 'revogado')::int revogados FROM coupon_validation_trail WHERE at > now() - interval '24 hours' GROUP BY 1 ORDER BY 1`);
    console.table(await sql`SELECT motivo, count(*)::int n FROM coupon_validation_trail WHERE at > now() - interval '24 hours' AND acao IN ('barrado','revogado') GROUP BY 1 ORDER BY 2 DESC LIMIT 8`);
    console.log(falhas ? `FIM: ${falhas} invariante(s) com falha` : 'FIM: invariantes ok');
  } finally {
    await sql.end();
  }
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
export {};
