/** Ciclo 01: mensagens enviadas em 7 dias, somente leitura. */
import { connect } from '../_dup-shared';
const brl = (s: string) => Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100);
async function main() {
  const sql = connect();
  try {
    const rows = await sql.begin('read only', (tx) => tx`
      select m.id, m.trigger, m.store_id, m.vertical, m.offer_id, m.master_product_id, m.price_cents_detected p, m.avg_cents a, m.text_body t,
             m.sent_at, m.live_checked_at, m.live_price_cents lp, o.current_price_cents cp, o.status ost, o.title ot, o.last_price_confirmed_at lpc,
             o.network_id, n.slug net
      from group_messages m left join affiliate_offers o on o.id = m.offer_id left join affiliate_networks n on n.id = o.network_id
      where m.status='enviada' and m.sent_at > now() - interval '7 days'`);
    console.log('n', rows.length);
    const cnt: Record<string, number> = {}; const ex: Record<string, string[]> = {};
    const add = (k: string, r: any, extra = '') => { cnt[k] = (cnt[k] ?? 0) + 1; (ex[k] ??= []).length < 4 && ex[k]!.push(`${r.id.slice(0, 8)}/${r.trigger}${extra ? ' ' + extra : ''}`); };
    const banned = [/afiliad/i, /% ?off/i, /\bde\s+R\$[^\n]*\bpor\s+R\$/i, /menor pre[cç]o da internet/i, /da hist[oó]ria/i, /\(Bras[ií]lia\)/i, /amostra/i, /Cupom do an[uú]ncio/i, /comiss[aã]o/i, /corra|últimas unidades|acaba hoje|imperd[ií]vel/i];
    for (const r of rows) {
      const t: string = r.t ?? '';
      const plain = t.replace(/<[^>]+>/g, '');
      // T1 preço no texto
      const m1 = plain.match(/R\$\s?([\d.]+,\d{2})/);
      if (!m1) add('T1_sem_preco_no_texto', r);
      else if (r.p != null && r.trigger !== 'P1' && r.trigger !== 'P2' && r.trigger !== 'P3' && r.trigger !== 'P4' && r.trigger !== 'G5') {
        const tp = brl(m1[1]!); if (Math.abs(tp - Number(r.p)) > 1 && r.trigger !== 'CUPOM') add('T1_preco_texto_diferente_detectado', r, `${tp} vs ${r.p}`);
      }
      // formatação moeda
      if (/R\$\s?\d+(\.\d{3})*\.\d{2}(?!\d)/.test(plain) || /R\$\s?\d{4,},\d{2}/.test(plain)) add('T25_formato_moeda', r);
      // T3 pct abaixo da média
      const pm = plain.match(/([\d,]+)% abaixo da m[eé]dia[^(]*\(R\$\s?([\d.]+,\d{2})\)/);
      if (pm && r.p != null) {
        const pct = parseFloat(pm[1]!.replace(',', '.')); const av = brl(pm[2]!); const real = (1 - Number(r.p) / av) * 100;
        if (Math.abs(real - pct) > 0.15) add('T3_pct_nao_confere', r, `${pct} vs ${real.toFixed(2)}`);
        if (r.a != null && Math.abs(av - Number(r.a)) > 1) add('T3_media_texto_diferente_avg_cents', r, `${av} vs ${r.a}`);
      }
      // T7 conferido
      const cf = plain.match(/(?:Conferido em|lido em)\s*(\d{2})\/(\d{2}) às (\d{2}):(\d{2})/i);
      if (cf) {
        const sentBrt = new Date(new Date(r.sent_at).getTime() - 3 * 3600e3);
        const y = sentBrt.getUTCFullYear(); const conf = Date.UTC(y, +cf[2]! - 1, +cf[1]!, +cf[3]!, +cf[4]!);
        const dmin = (sentBrt.getTime() - conf) / 60000;
        if (dmin < -2) add('T2_conferido_depois_do_envio', r, `${dmin.toFixed(0)}min`);
        if (dmin > 180) add('T2_conferido_ha_mais_de_3h', r, `${dmin.toFixed(0)}min`);
        if (dmin > 24 * 60) add('T2_conferido_ha_mais_de_24h', r, `${dmin.toFixed(0)}min`);
      } else if (!['P5'].includes(r.trigger)) add('T2_sem_carimbo_conferido', r);
      // banidos
      for (const b of banned) if (b.test(plain)) add('T24_proibido_' + b.source.slice(0, 18), r, (plain.match(b) ?? [''])[0]);
      // OK 14 x 15
      if (/14 dias/.test(plain) && /15 dias/.test(plain)) add('T6_14_e_15_dias_no_mesmo_texto', r);
      // oferta
      if (r.offer_id && r.ost && r.ost !== 'active') add('T1_oferta_nao_ativa_agora', r, r.ost);
      if (r.offer_id && r.cp != null && r.p != null && r.trigger !== 'CUPOM') { const d = Math.abs(Number(r.cp) - Number(r.p)) / Number(r.p); if (d > 0.1) add('T1_preco_atual_oferta_difere_10pct_do_detectado', r, `${r.p} vs ${r.cp}`); }
      // link
      if (/mercado livre/i.test(plain) && /https?:\/\//.test(t) && !/meli\.la/.test(t) && !['P1','P2','P3','P4','G5','G2'].includes(r.trigger)) add('T21_ml_sem_meli_la', r);
      if (['AC','CUPOM','N1'].includes(r.trigger) && !/https?:\/\/(meli\.la|amzn\.to|s\.shopee|shope\.ee|www\.amazon)/.test(t)) add('T21_sem_link_de_compra', r);
      // título curto
      const tit = t.match(/<b>([^<]{3,})<\/b>/); 
    }
    console.log(JSON.stringify(cnt, null, 1)); console.log(JSON.stringify(ex, null, 1));
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
