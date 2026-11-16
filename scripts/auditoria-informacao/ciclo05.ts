/** Ciclo 05: 'Menor preco agora' das paginas /monitoramento/comparar/<id> x banco (amostra estratificada por vertical). Somente leitura. */
import { connect } from '../_dup-shared';
async function main() {
  const sql = connect();
  try {
    const ms = await sql.begin('read only', (tx) => tx`
      select * from (select mp.id, mp.vertical, row_number() over (partition by mp.vertical order by random()) rn from master_products mp
        where coalesce(mp.attributes->'catalogGate'->>'verdict','x')='approved' and (select count(*) from affiliate_offers o where o.master_product_id=mp.id and o.status='active' and o.quarantined_at is null)>=3) t where rn<=5`);
    let ok = 0, dif = 0, sem = 0;
    for (const m of ms) {
      const db = await sql.begin('read only', (tx) => tx`select min(current_price_cents)::int mn, min(current_price_cents) filter (where last_price_confirmed_at>now()-interval '48 hours')::int mn48, count(*)::int n from affiliate_offers where master_product_id=${m.id} and status='active' and quarantined_at is null`);
      const html = await (await fetch(`https://www.egeek86.com/monitoramento/comparar/${m.id}`, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
      const txt = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n');
      const i = txt.indexOf('Menor preço agora'); const mm = i >= 0 ? txt.slice(i, i + 400).match(/R\$\s?([\d.]+,\d{2})/) : null;
      const cents = mm ? Math.round(parseFloat(mm[1]!.replace(/\./g, '').replace(',', '.')) * 100) : null;
      const n = txt.match(/(\d+) vendedores? ativos?/)?.[1];
      if (cents == null) { sem++; console.log('SEM_PRECO', m.vertical, m.id); continue; }
      if (cents === db[0]!.mn) ok++; else { dif++; console.log('DIF', m.vertical, m.id, 'site', cents, 'db_min', db[0]!.mn, 'db_min48h', db[0]!.mn48, 'site_n', n, 'db_n', db[0]!.n); }
    }
    console.log({ ok, dif, sem, total: ms.length });
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
