/** Ciclo 01c: mensagens de plataforma (P1..P5): o 'menor registrado' vem de oferta Amazon (excluida do 'hoje')? */
import { connect } from '../_dup-shared';
const brl = (s: string) => Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100);
async function main() {
  const sql = connect();
  try {
    const rows = await sql.begin('read only', (tx) => tx`
      select id, trigger, sent_at, text_body t from group_messages where status='enviada' and trigger in ('P1','P3','P4','P5','P2') and sent_at >= '2026-11-11'`);
    const out: any = { total: rows.length, comAmazonMenor: 0, amazonAtivaMaisBarataQueHoje: 0, minDiaNaoBateComEstado: 0, ex: [] as string[] };
    for (const r of rows) {
      const plain = String(r.t).replace(/<[^>]+>/g, '');
      const mid = String(r.t).match(/comparar\/([0-9a-f-]{36})/)?.[1]; if (!mid) continue;
      const hoje = plain.match(/hoje R\$\s?([\d.]+,\d{2})/); if (!hoje) continue;
      const today = brl(hoje[1]!);
      const mn = plain.match(/menor(?: registrado)?\s+R\$\s?([\d.]+,\d{2})/); const minC = mn ? brl(mn[1]!) : null;
      const am = await sql.begin('read only', (tx) => tx`select o.id, o.current_price_cents p, o.last_price_confirmed_at c from affiliate_offers o join affiliate_networks n on n.id=o.network_id where o.master_product_id=${mid} and n.slug='amazon' and o.status='active' and o.current_price_cents < ${today}`);
      if (am.length) { out.amazonAtivaMaisBarataQueHoje++; if (out.ex.length < 8) out.ex.push(`${r.id.slice(0, 8)}/${r.trigger} hoje=${today} amazonAtiva=${am[0]!.p} min_dito=${minC}`); }
      if (minC != null && minC < today) {
        const a = await sql.begin('read only', (tx) => tx`select count(*)::int c from price_daily_offer d join affiliate_offers o on o.id=d.offer_id join affiliate_networks n on n.id=o.network_id where d.master_product_id=${mid} and d.min_cents=${minC} and n.slug='amazon'`);
        if (a[0]!.c > 0) out.comAmazonMenor++;
      }
    }
    console.log(JSON.stringify(out, null, 1));
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
