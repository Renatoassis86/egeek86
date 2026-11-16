/** Ciclo 02a: minimos de dias FECHADOS vindos de oferta isca/fraca; quantas mensagens citam esse minimo. */
import { connect } from '../_dup-shared';
const fmt = (c: number) => 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function main() {
  const sql = connect();
  try {
    const dias = await sql.begin('read only', (tx) => tx`
      select s.master_product_id mp, s.day::text as dia, s.min_cents::bigint mn, o.quarantine_reason qr, o.avg_excluded_reason aer, (select min(value::numeric) from jsonb_each_text(s.members)) mmin
      from price_daily_state s join affiliate_offers o on o.id=s.min_offer_id where s.day>=current_date-20 and s.quality='complete' and s.members is not null`);
    const iscaDias = dias.filter((d) => Number(d.mn) < Number(d.mmin) && String(d.qr ?? '').startsWith('preco_isca'));
    const fracoDias = dias.filter((d) => Number(d.mn) < Number(d.mmin) && d.aer === 'vendedor-fraco');
    console.log('dias isca', iscaDias.length, 'dias fraco', fracoDias.length);
    const msgs = await sql.begin('read only', (tx) => tx`select id, trigger, sent_at, master_product_id mp, text_body t from group_messages where status='enviada' and sent_at>='2026-11-08'`);
    const byMp = new Map<string, any[]>();
    for (const m of msgs) { const mp = m.mp ?? String(m.t).match(/comparar\/([0-9a-f-]{36})/)?.[1]; if (mp) (byMp.get(mp) ?? byMp.set(mp, []).get(mp)!).push(m); }
    for (const [nome, lista] of [['ISCA', iscaDias], ['FRACO', fracoDias]] as const) {
      let n = 0; const ids = new Set<string>(); const ex: string[] = [];
      for (const d of lista) {
        for (const m of byMp.get(d.mp) ?? []) {
          const plain = String(m.t).replace(/<[^>]+>/g, '');
          if (plain.includes(fmt(Number(d.mn))) ) { if (!ids.has(m.id)) { ids.add(m.id); n++; if (ex.length < 6) ex.push(`${m.id.slice(0,8)}/${m.trigger} cita ${fmt(Number(d.mn))} (${d.dia}) master ${d.mp.slice(0,8)}`); } }
        }
      }
      console.log(nome, 'mensagens enviadas citando o minimo contaminado:', n, JSON.stringify(ex, null, 1));
    }
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
