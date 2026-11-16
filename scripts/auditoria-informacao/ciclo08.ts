/** Ciclo 08: selo/regua recomputado de forma independente a partir do TEXTO enviado + estado do dia anterior. Somente leitura. */
import { connect } from '../_dup-shared';
const LIM = [3, 6, 12, 20, 30];
const ROT: Record<number, string> = { 1: 'BOM PREÇO', 2: 'BOA COMPRA', 3: 'ÓTIMA COMPRA', 4: 'COMPRE AGORA', 5: 'CONFIRA ANTES DE COMPRAR' };
function deg(p: number) { const r = Math.round(p * 10) / 10; if (r < LIM[0]!) return null; if (r < LIM[1]!) return 1; if (r < LIM[2]!) return 2; if (r < LIM[3]!) return 3; if (r <= LIM[4]!) return 4; return 5; }
async function main() {
  const sql = connect();
  try {
    const rows = await sql.begin('read only', (tx) => tx`
      select m.id, m.trigger, m.sent_at, m.price_cents_detected p, m.avg_cents a, regexp_replace(m.text_body,'<[^>]+>','','g') t,
       (select s.n_offers from price_daily_state s where s.master_product_id=m.master_product_id and s.day<(m.sent_at at time zone 'America/Sao_Paulo')::date order by s.day desc limit 1) n,
       (select count(*) from price_daily_state s where s.master_product_id=m.master_product_id and s.day<(m.sent_at at time zone 'America/Sao_Paulo')::date and s.quality in ('complete','partial')) dias
      from group_messages m where m.status='enviada' and m.sent_at>='2026-11-13T03:00Z' and m.trigger in ('G2','OK1','OK2','G3','G4')`);
    const c: Record<string, number> = {}; const ex: Record<string, string[]> = {};
    const add = (k: string, r: any, e = '') => { c[k] = (c[k] ?? 0) + 1; ((ex[k] ??= []).length < 4) && ex[k]!.push(`${r.id}/${r.trigger} ${e}`); };
    for (const r of rows) {
      const rot = Object.entries(ROT).find(([, v]) => r.t.includes(v)); const g = rot ? Number(rot[0]) : null;
      const pm = r.t.match(/([\d,]+)% abaixo da média/); const pct = pm ? parseFloat(pm[1]!.replace(',', '.')) : (r.a ? (1 - Number(r.p) / Number(r.a)) * 100 : null);
      c.total = (c.total ?? 0) + 1;
      if (g == null) { add('sem_rotulo_de_degrau', r); continue; }
      if (pct == null) { add('rotulo_sem_pct_calculavel', r); continue; }
      const esperado = deg(pct);
      if (esperado == null) add('rotulo_com_queda_abaixo_de_3pct', r, `rot=${g} pct=${pct.toFixed(1)}`);
      else if (esperado !== g) { if (g < esperado) add('rotulo_MENOR_que_a_queda_(cautela)', r, `rot=${g} esp=${esperado} pct=${pct.toFixed(1)}`); else add('rotulo_MAIOR_que_a_queda', r, `rot=${g} esp=${esperado} pct=${pct.toFixed(1)}`); }
      if (g === 4 && Number(r.n) < 5) add('compre_agora_com_menos_de_5_ofertas', r, `n=${r.n}`);
      if (g === 4 && Number(r.dias) < 14) add('compre_agora_com_menos_de_14_dias', r, `dias=${r.dias}`);
      if (g === 5 && !/muito abaixo do normal|Confira/.test(r.t)) add('degrau5_sem_aviso', r);
    }
    console.log(JSON.stringify(c, null, 1), JSON.stringify(ex, null, 1));
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
