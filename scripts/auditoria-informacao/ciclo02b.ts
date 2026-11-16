/** Ciclo 02b: afirmacoes de media/minimo em OK1/OK2/G3/G2/AC contra price_daily_state. Somente leitura. */
import { connect } from '../_dup-shared';
async function main() {
  const sql = connect();
  try {
    const rows = await sql.begin('read only', (tx) => tx`
      select m.id, m.trigger, m.sent_at, m.master_product_id mp, m.price_cents_detected p, m.avg_cents a, regexp_replace(m.text_body,'<[^>]+>','','g') t,
        (select jsonb_build_object('n', s.n_offers, 'avg', s.avg_cents, 'q', s.quality) from price_daily_state s where s.master_product_id=m.master_product_id and s.day<(m.sent_at at time zone 'America/Sao_Paulo')::date order by s.day desc limit 1) prev,
        (select min(s.min_cents) from price_daily_state s where s.master_product_id=m.master_product_id and s.day<(m.sent_at at time zone 'America/Sao_Paulo')::date and s.day>=(m.sent_at at time zone 'America/Sao_Paulo')::date-14) min14,
        (select count(*) from price_daily_state s where s.master_product_id=m.master_product_id and s.day<(m.sent_at at time zone 'America/Sao_Paulo')::date and s.day>=(m.sent_at at time zone 'America/Sao_Paulo')::date-14 and s.quality in ('complete','partial')) dias14,
        (select count(*) from affiliate_offers o where o.master_product_id=m.master_product_id and o.status='active' and o.avg_excluded_at is null) nativas
      from group_messages m where m.status='enviada' and m.sent_at>='2026-11-13T03:00Z' and m.master_product_id is not null and m.trigger in ('OK1','OK2','G3','G2','G4')`);
    const c: Record<string, number> = {}; const ex: Record<string, string[]> = {};
    const add = (k: string, r: any, e = '') => { c[k] = (c[k] ?? 0) + 1; ((ex[k] ??= []).length < 4) && ex[k]!.push(`${r.id}/${r.trigger} ${e}`); };
    for (const r of rows) {
      const pct = /\d+,\d% abaixo da média/.test(r.t) || /Média das lojas/.test(r.t);
      if (pct) { c.com_pct_ou_media = (c.com_pct_ou_media ?? 0) + 1; if (r.nativas < 5) add('R19_texto_com_media_com_menos_de_5_ofertas_na_media_hoje', r, `nativas=${r.nativas}`); if (r.prev && Number(r.prev.n) < 5) add('R19_n_offers_dia_anterior_menor_que_5', r, `n=${r.prev.n}`); }
      if (/Menor preço dos últimos 14 dias|menor preço dos últimos 14 dias/i.test(r.t)) {
        c.menor14 = (c.menor14 ?? 0) + 1;
        if (r.min14 != null && Number(r.p) > Number(r.min14)) add('C06_menor_14_dias_mas_existe_minimo_menor_no_estado', r, `p=${r.p} min14=${r.min14}`);
        if (Number(r.dias14) < 14) add('C06_menor_14_dias_com_serie_menor_que_14', r, `dias=${r.dias14}`);
      }
      const mm = r.t.match(/Mínimo R\$\s?([\d.]+,\d{2}) · Máximo R\$\s?([\d.]+,\d{2}) \(últimos (\d+) dias\)/);
      if (mm && Number(mm[3]) > Number(r.dias14) + 1) add('C06_mm_dias_citados_maior_que_serie', r, `cita ${mm[3]} serie ${r.dias14}`);
    }
    console.log(rows.length, JSON.stringify(c, null, 1), JSON.stringify(ex, null, 1));
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
