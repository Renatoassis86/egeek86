/** Ciclo 01b: mensagens >= 13/11 (templates atuais): preco x snapshot anterior ao envio, idade, % e media, vendedor. */
import { connect } from '../_dup-shared';
const brl = (s: string) => Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100);
async function main() {
  const sql = connect();
  try {
    const rows = await sql.begin('read only', (tx) => tx`
      select m.id, m.trigger, m.offer_id, m.master_product_id, m.price_cents_detected p, m.avg_cents a, m.text_body t, m.sent_at, m.live_checked_at, m.live_price_cents lp,
        s.price_cents sp, s.collected_at sat, s.source ssrc, s.record_kind skind, n.slug net, o.last_price_confirmed_at lpc
      from group_messages m left join affiliate_offers o on o.id=m.offer_id left join affiliate_networks n on n.id=o.network_id
      left join lateral (select price_cents, collected_at, source, record_kind from affiliate_price_snapshots s where s.offer_id=m.offer_id and s.collected_at<=m.sent_at order by collected_at desc limit 1) s on true
      where m.status='enviada' and m.sent_at >= '2026-11-13T03:00:00Z'`);
    console.log('n', rows.length);
    const cnt: Record<string, number> = {}; const ex: Record<string, string[]> = {};
    const add = (k: string, r: any, e = '') => { cnt[k] = (cnt[k] ?? 0) + 1; ((ex[k] ??= []).length < 5) && ex[k]!.push(`${r.id}/${r.trigger}/${r.net ?? ''} ${e}`); };
    const ages: number[] = [];
    for (const r of rows) {
      const plain = String(r.t ?? '').replace(/<[^>]+>/g, '');
      if (r.offer_id && r.trigger !== 'CUPOM') {
        if (r.sp == null) add('S1_sem_snapshot_antes_do_envio', r);
        else {
          const d = (Number(r.sp) - Number(r.p)) / Number(r.p);
          if (Math.abs(d) > 0.02) add('S1_snapshot_anterior_difere_2pct_do_preco_dito', r, `p=${r.p} snap=${r.sp} @${new Date(r.sat).toISOString()}`);
          const age = (new Date(r.sent_at).getTime() - new Date(r.sat).getTime()) / 60000; ages.push(age);
          const lim = r.net === 'amazon' ? 40 : 30;
          if (age > 180) add('S2_ultimo_snapshot_ha_mais_de_3h_do_envio', r, `${age.toFixed(0)}min`);
          if (r.live_checked_at) { const la = (new Date(r.sent_at).getTime() - new Date(r.live_checked_at).getTime()) / 60000; if (la > lim + 5) add('S2_live_check_velho_no_envio', r, `${la.toFixed(0)}min lim ${lim}`); }
          else add('S2_sem_live_checked_at', r);
          if (r.lp != null && Math.abs(Number(r.lp) - Number(r.p)) / Number(r.p) > 0.02) add('S3_live_price_difere_2pct', r, `${r.p} vs live ${r.lp}`);
        }
      }
      // %/média OK1/OK2
      const pm = plain.match(/([\d,]+)% abaixo da média das lojas \(R\$\s?([\d.]+,\d{2})\)/);
      if (pm) { const pct = parseFloat(pm[1]!.replace(',', '.')); const av = brl(pm[2]!); const real = (1 - Number(r.p) / av) * 100;
        if (Math.abs(real - pct) > 0.06) add('P_pct_nao_confere_com_preco_e_media_do_texto', r, `${pct} vs ${real.toFixed(2)}`);
        if (r.a != null && Math.abs(av - Number(r.a)) > 1) add('P_media_texto_difere_avg_cents', r, `${av} vs ${r.a}`);
        if (/14 dias/.test(plain) && /15 dias/.test(plain)) add('P_14_e_15_dias', r); }
      const g3 = plain.match(/Média das lojas:\s*R\$\s?([\d.]+,\d{2}) \(R\$\s?([\d.]+,\d{2}) abaixo\)/);
      if (g3) { if (Math.abs(brl(g3[1]!) - brl(g3[2]!) - Number(r.p)) > 1) add('P_g3_media_menos_diferenca_nao_e_preco', r, plain.match(g3[0]) ? g3[0] : ''); }
      // vendas "N mil"
      const v = plain.match(/mais de (\d[\d.]*) mil vendas/); if (v && parseInt(v[1]!.replace(/\./g, '')) >= 1000) add('V_mil_vendas_inflado', r, v[0]);
      const mi = plain.match(/mais de (\d+) milh/); 
      // preco sem sentido
      if (Number(r.p) < 500 && /Console|Playstation 5|PS5 Slim/i.test(plain)) add('X_preco_baixo_console', r, plain.slice(0, 60));
      // desconto > 50% mensagens
      if (r.a && Number(r.p) < 0.5 * Number(r.a)) add('X_preco_menos_da_metade_da_media', r, `${r.p} vs ${r.a}`);
      if (r.a && Number(r.p) > Number(r.a)) add('X_preco_acima_da_media_em_mensagem_de_queda', r, `${r.p} vs ${r.a}`);
    }
    ages.sort((a, b) => a - b); const pc = (q: number) => ages[Math.floor(q * (ages.length - 1))]?.toFixed(0);
    console.log('idade snapshot min p50/p90/p99', pc(.5), pc(.9), pc(.99));
    console.log(JSON.stringify(cnt, null, 1)); console.log(JSON.stringify(ex, null, 1));
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
