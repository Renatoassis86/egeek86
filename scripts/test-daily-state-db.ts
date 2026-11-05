/**
 * Verificações CONTRA O BANCO das métricas diárias (somente leitura).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-daily-state-db.ts
 * 1) a elegibilidade nova (`eligibleOfferSql`) é IDÊNTICA a offerIdentityVisibleSql + catalogGateVisibleSql;
 * 2) invariantes das linhas de price_daily_state e price_daily_offer.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eligibleOfferSql } from '@/server/pricing/eligibility-sql';
import { catalogGateVisibleSql, offerIdentityVisibleSql } from '@/server/queries/public-offers';

let fails = 0;
let total = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  } else console.log(`ok: ${name}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`);
}
const one = async (q: ReturnType<typeof sql>) => (await db.execute<Record<string, number | string | null>>(q))[0];

async function main() {
  const eq = await one(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE ${eligibleOfferSql('o')})::int AS novo,
           count(*) FILTER (WHERE ${offerIdentityVisibleSql('o.id')} AND ${catalogGateVisibleSql('o.master_product_id')})::int AS antigo,
           count(*) FILTER (WHERE (${eligibleOfferSql('o')}) <> (${offerIdentityVisibleSql('o.id')} AND ${catalogGateVisibleSql('o.master_product_id')}))::int AS divergentes,
           count(*) FILTER (WHERE o.quarantined_at IS NOT NULL AND ${eligibleOfferSql('o')})::int AS quarentena_elegivel
    FROM affiliate_offers o`);
  check('elegibilidade nova == identidade+porteiro do site (0 divergentes)', Number(eq.divergentes) === 0, eq);
  check('nenhuma oferta em quarentena é elegível', Number(eq.quarentena_elegivel) === 0);

  const st = await one(sql`
    SELECT count(*)::int AS n,
      count(*) FILTER (WHERE quality = 'complete' AND avg_cents IS NULL)::int AS complete_sem_media,
      count(*) FILTER (WHERE quality IN ('partial', 'gap', 'legacy') AND avg_cents IS NOT NULL)::int AS media_com_n_menor_3,
      count(*) FILTER (WHERE quality = 'gap' AND (min_cents IS NOT NULL OR n_offers <> 0))::int AS gap_com_valor,
      count(*) FILTER (WHERE avg_cents IS NOT NULL AND (avg_cents < min_cents OR avg_cents > max_cents))::int AS media_fora_min_max,
      count(*) FILTER (WHERE median_offer_day_cents IS NOT NULL AND (median_offer_day_cents < min_cents OR median_offer_day_cents > max_cents))::int AS mediana_fora_min_max,
      count(*) FILTER (WHERE quality <> 'legacy' AND n_offers > fresh_offers)::int AS n_maior_que_frescas,
      count(*) FILTER (WHERE quality IN ('complete', 'partial') AND jsonb_object_keys_count <> n_offers)::int AS members_diferente_n,
      count(*) FILTER (WHERE avg_cents IS NOT NULL AND abs(avg_cents - members_avg) > 0.5)::int AS media_diferente_dos_members,
      count(*) FILTER (WHERE quality = 'legacy' AND day >= '2026-10-31')::int AS legacy_no_regime_novo,
      count(*) FILTER (WHERE quality <> 'legacy' AND day < '2026-10-31')::int AS regime_novo_no_legacy,
      count(*) FILTER (WHERE day < (now() AT TIME ZONE 'America/Sao_Paulo')::date AND NOT closed)::int AS dia_passado_aberto,
      count(*) FILTER (WHERE closed AND day >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS hoje_ou_futuro_fechado
    FROM (SELECT s.*, (SELECT count(*) FROM jsonb_object_keys(COALESCE(s.members, '{}'::jsonb)))::int AS jsonb_object_keys_count,
                 (SELECT avg(v::numeric) FROM jsonb_each_text(COALESCE(s.members, '{}'::jsonb)) AS e(k, v)) AS members_avg
          FROM price_daily_state s) s`);
  console.log('estado diário:', st);
  for (const k of ['complete_sem_media', 'media_com_n_menor_3', 'gap_com_valor', 'media_fora_min_max', 'mediana_fora_min_max', 'n_maior_que_frescas', 'members_diferente_n', 'media_diferente_dos_members', 'legacy_no_regime_novo', 'regime_novo_no_legacy', 'dia_passado_aberto', 'hoje_ou_futuro_fechado']) {
    check(`invariante ${k} = 0`, Number(st[k]) === 0, st[k]);
  }

  const od = await one(sql`
    SELECT count(*)::int AS n,
      count(*) FILTER (WHERE min_cents > median_cents OR median_cents > max_cents OR last_cents < min_cents OR last_cents > max_cents)::int AS incoerentes,
      count(*) FILTER (WHERE n_collected < 1)::int AS sem_cotacao
    FROM price_daily_offer`);
  check('oferta-dia: min <= mediana <= max e última dentro', Number(od.incoerentes) === 0, od);
  check('oferta-dia: toda linha tem cotação', Number(od.sem_cotacao) === 0);

  // Cada oferta-dia reflete os snapshots reais (amostra: 200 linhas recentes recalculadas do bruto).
  const mism = await one(sql`
    WITH samp AS (SELECT * FROM price_daily_offer WHERE day >= '2026-10-31' ORDER BY random() LIMIT 200)
    SELECT count(*)::int AS amostra,
           count(*) FILTER (WHERE r.n IS DISTINCT FROM s.n_collected OR r.mn IS DISTINCT FROM s.min_cents OR r.mx IS DISTINCT FROM s.max_cents)::int AS divergentes
    FROM samp s LEFT JOIN LATERAL (
      SELECT count(*)::int AS n, min(x.price_cents)::bigint AS mn, max(x.price_cents)::bigint AS mx FROM affiliate_price_snapshots x
      WHERE x.offer_id = s.offer_id AND x.price_cents > 0
        AND (x.collected_at AT TIME ZONE 'America/Sao_Paulo')::date = s.day) r ON true`);
  // diferença esperada só para o dia de HOJE (coleta ao vivo entre o cálculo e a conferência)
  console.log('amostra oferta-dia x bruto:', mism);
  check('oferta-dia confere com o bruto (tolerância: dia de hoje em andamento)', Number(mism.divergentes) <= Math.ceil(Number(mism.amostra) * 0.05), mism);

  console.log(fails ? `${fails} de ${total} FALHARAM` : `OK: ${total} verificações`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
