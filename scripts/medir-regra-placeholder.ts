/**
 * Medicao SOMENTE LEITURA: impacto de excluir o placeholder (seller_id NULL) das metricas oferta-dia quando ja
 * existe oferta COM vendedor na mesma rede dentro do mesmo master_product.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/medir-regra-placeholder.ts [AAAA-MM-DD]
 * Base: ultimo dia fechado de price_daily_state (ou o dia passado) e o campo `members` (offer_id -> preco).
 * Compara media, mediana, n_offers e minimo com e sem os placeholders redundantes. Grava CSV em docs/.
 * Transacao READ ONLY. Nenhum dado e escrito no banco.
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

async function main() {
  const sql = connect();
  try {
    await sql.begin('read only', async (tx) => {
      await tx`SET LOCAL statement_timeout = '120s'`;
      const dayArg = process.argv[2];
      const dayRow = dayArg
        ? [{ day: dayArg }]
        : await tx`SELECT max(day)::text AS day FROM price_daily_state WHERE closed`;
      const day = String(dayRow[0].day);
      console.log('Dia medido:', day);

      const states = await tx`
        SELECT master_product_id::text AS mid, members, n_offers, avg_cents, median_offer_day_cents, min_cents
        FROM price_daily_state WHERE day = ${day}::date AND members IS NOT NULL`;
      const ids = new Set<string>();
      for (const s of states) for (const k of Object.keys(s.members as Record<string, number>)) ids.add(k);
      const offers = await tx`
        SELECT id::text AS id, network_id::text AS net, seller_id::text AS seller
        FROM affiliate_offers WHERE id = ANY(${[...ids]}::uuid[])`;
      const info = new Map(offers.map((o) => [String(o.id), o]));

      let comPlaceholder = 0;
      let redundantes = 0;
      let afetados = 0;
      let divergeReplica = 0;
      const rows: Array<Record<string, string | number>> = [];
      for (const s of states) {
        const m = s.members as Record<string, number>;
        const entries = Object.entries(m).map(([id, p]) => ({ id, p: Number(p), o: info.get(id) }));
        const vals = entries.map((e) => e.p);
        if (vals.length && s.median_offer_day_cents != null && Math.abs(median(vals) - Number(s.median_offer_day_cents)) > 1) divergeReplica++;
        const sellerNets = new Set(entries.filter((e) => e.o?.seller).map((e) => e.o!.net));
        const isPh = (e: (typeof entries)[number]) => !!e.o && !e.o.seller;
        if (entries.some(isPh)) comPlaceholder++;
        const red = entries.filter((e) => isPh(e) && sellerNets.has(e.o!.net));
        if (!red.length) continue;
        redundantes += red.length;
        const keep = entries.filter((e) => !red.includes(e)).map((e) => e.p);
        if (!keep.length) continue;
        const oldAvg = avg(vals), newAvg = avg(keep), oldMed = median(vals), newMed = median(keep);
        const changed = Math.round(oldAvg) !== Math.round(newAvg) || Math.round(oldMed) !== Math.round(newMed) || Math.min(...vals) !== Math.min(...keep);
        if (changed) afetados++;
        rows.push({
          master_product_id: String(s.mid), n_antes: vals.length, n_depois: keep.length, placeholders_redundantes: red.length,
          media_antes: Math.round(oldAvg), media_depois: Math.round(newAvg), media_var_pct: +pct(newAvg, oldAvg).toFixed(2),
          mediana_antes: Math.round(oldMed), mediana_depois: Math.round(newMed), mediana_var_pct: +pct(newMed, oldMed).toFixed(2),
          min_antes: Math.min(...vals), min_depois: Math.min(...keep),
          cai_abaixo_3_ofertas: vals.length >= 3 && keep.length < 3 ? 1 : 0,
        });
      }
      console.log({ produtos_no_dia: states.length, com_placeholder: comPlaceholder, placeholders_redundantes: redundantes, produtos_com_redundante: rows.length, produtos_com_metrica_alterada: afetados, divergencia_replica_mediana: divergeReplica });

      const q = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
      const mv = rows.map((r) => Math.abs(Number(r.mediana_var_pct)));
      const av = rows.map((r) => Math.abs(Number(r.media_var_pct)));
      console.log('|variacao mediana| p50/p90/max:', q(mv, 0.5), q(mv, 0.9), Math.max(0, ...mv));
      console.log('|variacao media|   p50/p90/max:', q(av, 0.5), q(av, 0.9), Math.max(0, ...av));
      console.log('mediana mudou >5%:', mv.filter((x) => x > 5).length, ' >10%:', mv.filter((x) => x > 10).length);
      console.log('perdem veredito (3+ -> <3 ofertas):', rows.filter((r) => r.cai_abaixo_3_ofertas).length);
      console.log('minimo mudou:', rows.filter((r) => r.min_antes !== r.min_depois).length);
      console.table([...rows].sort((a, b) => Math.abs(Number(b.mediana_var_pct)) - Math.abs(Number(a.mediana_var_pct))).slice(0, 10));

      const cols = rows.length ? Object.keys(rows[0]) : [];
      fs.writeFileSync(`docs/medicao-regra-placeholder-${day}.csv`, '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => r[c]).join(';'))].join('\n') + '\n');
      console.log(`Gravado docs/medicao-regra-placeholder-${day}.csv (centavos)`);
    });
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
