/** Ciclo 07: paginas /mercado/<dept>/<slug> x banco (menor preco por loja, vendedores), 10 masters por departamento. Somente leitura. */
import { connect } from '../_dup-shared';
const NETS: Record<string, string> = { 'Mercado Livre': 'mercado-livre', Shopee: 'shopee', Amazon: 'amazon' };
async function main() {
  const sql = connect();
  try {
    const ms = await sql.begin('read only', (tx) => tx`
      select * from (select mp.id, mp.slug, mp.vertical, row_number() over (partition by mp.vertical order by random()) rn from master_products mp
        where mp.vertical=coalesce(nullif(current_setting('app.v', true),''),mp.vertical) and mp.vertical<>'games' and coalesce(mp.attributes->'catalogGate'->>'verdict','x')='approved' and (select count(*) from affiliate_offers o where o.master_product_id=mp.id and o.status='active' and o.quarantined_at is null)>=2) t where rn<=10`).then((r) => r.filter((x) => !process.env.AUD_V || x.vertical === process.env.AUD_V));
    const res: Record<string, { ok: number; dif: number; sem: number }> = {}; const lines: string[] = [];
    for (const m of ms) {
      const r = (res[m.vertical] ??= { ok: 0, dif: 0, sem: 0 });
      const resp = await fetch(`https://www.egeek86.com/mercado/${m.vertical}/${m.slug}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (resp.status !== 200) { r.sem++; lines.push(`HTTP ${resp.status} ${m.vertical} ${m.slug.slice(0, 40)}`); continue; }
      const txt = (await resp.text()).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n');
      const i = txt.indexOf('Menor preço por loja'); if (i < 0) { r.sem++; lines.push(`SEM_BLOCO ${m.vertical} ${m.slug.slice(0, 40)}`); continue; }
      const parts = txt.slice(i, i + 1500).split('\n'); const site: Record<string, number> = {};
      for (let k = 0; k < parts.length; k++) { const n = NETS[parts[k]!.trim()]; if (n && !(n in site)) { const pr = parts.slice(k, k + 4).join(' ').match(/R\$\s?([\d.]+,\d{2})/); if (pr) site[n] = Math.round(parseFloat(pr[1]!.replace(/\./g, '').replace(',', '.')) * 100); } }
      const db = await sql.begin('read only', (tx) => tx`select n.slug, min(o.current_price_cents)::int mn, min(o.current_price_cents) filter (where o.last_price_confirmed_at>now()-interval '48 hours')::int mn48 from affiliate_offers o join affiliate_networks n on n.id=o.network_id where o.master_product_id=${m.id} and o.status='active' and o.quarantined_at is null group by 1`);
      let bad = false;
      for (const [n, c] of Object.entries(site)) { const d = db.find((x) => x.slug === n); if (!d || (d.mn !== c && d.mn48 !== c)) { bad = true; lines.push(`DIF ${m.vertical} ${m.slug.slice(0, 36)} ${n} site=${c} db_min=${d?.mn} db_min48=${d?.mn48}`); } }
      if (!Object.keys(site).length) { r.sem++; lines.push(`SEM_PRECO ${m.vertical} ${m.slug.slice(0, 40)}`); } else if (bad) r.dif++; else r.ok++;
    }
    console.log(JSON.stringify(res)); console.log(lines.slice(0, 40).join('\n'));
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
