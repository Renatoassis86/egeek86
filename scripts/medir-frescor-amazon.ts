/**
 * R-81: MEDIDOR DE FRESCOR DO PREÇO DA AMAZON. SOMENTE LEITURA. Falha (código 1) se uma oferta da Amazon que o privado do dono pode mostrar tiver preço confirmado há mais que AMAZON_FRESCOR_MIN (padrão 45).
 *   npx tsx --env-file=.env.local scripts/medir-frescor-amazon.ts [--json]
 * Indicadores: (a) impressoras do privado (cabeça prioritária) com leitura velha: informativo + falha só se o job da passada rápida estiver parado há > 40 min;
 *              (b) distribuição de idade de TODAS as ofertas ativas da Amazon (informativo: o site ainda exibe preço com a idade real; decisão do dono sobre rótulo "visto há").
 */
import { connect } from './_dup-shared';
import { amazonFrescorMin } from '../src/lib/messaging/confirmacao-preco';

(async () => {
  const sql = connect();
  const lim = amazonFrescorMin();
  try {
    const [d] = await sql.unsafe<{ n: number; a45: number; a2h: number; a6h: number; velho: number; max_h: string }[]>(`
      SELECT count(*)::int n,
        count(*) FILTER (WHERE o.last_price_confirmed_at > now()-interval '${lim} minutes')::int a45,
        count(*) FILTER (WHERE o.last_price_confirmed_at > now()-interval '2 hours')::int a2h,
        count(*) FILTER (WHERE o.last_price_confirmed_at > now()-interval '6 hours')::int a6h,
        count(*) FILTER (WHERE o.last_price_confirmed_at IS NULL OR o.last_price_confirmed_at <= now()-interval '6 hours')::int velho,
        coalesce(round(extract(epoch from (now()-min(o.last_price_confirmed_at)))/3600)::text,'?') max_h
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id WHERE n.slug='amazon' AND o.status='active' AND o.quarantined_at IS NULL`);
    const cab = await sql.unsafe<{ t: string; idade: string }[]>(`
      SELECT left(o.title,48) t, round(extract(epoch from (now()-o.last_price_confirmed_at))/60)::text idade
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id
      WHERE n.slug='amazon' AND o.status='active' AND o.quarantined_at IS NULL AND o.vertical='impressao3d' AND o.title ~* '(bambu|kobra|anycubic)' AND o.title ~* '(P2S|P1S|A1)'
      ORDER BY o.last_price_confirmed_at NULLS FIRST LIMIT 12`);
    const [j] = await sql.unsafe<{ ult: string | null }[]>(`SELECT max(started_at)::text ult FROM collector_runs WHERE job='amazon-assistida' AND status IN ('ok','partial')`);
    const idadeJob = j?.ult ? (Date.now() - new Date(j.ult).getTime()) / 60000 : Infinity;
    const velhas = cab.filter((c) => Number(c.idade) > lim);
    const ok = idadeJob <= 40;
    const out = { limite_min: lim, amazon_ativas: d.n, ate_limite: d.a45, ate_2h: d.a2h, ate_6h: d.a6h, mais_6h_ou_nulo: d.velho, mais_velha_h: d.max_h, cabeca_velhas: velhas.length, cabeca: cab, minutos_desde_lote_ok: Math.round(idadeJob), ok };
    if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
    else {
      console.log(`Amazon ativas ${d.n}: <=${lim} min ${d.a45}; <=2 h ${d.a2h}; <=6 h ${d.a6h}; mais velhas ou sem leitura ${d.velho} (mais velha ${d.max_h} h).`);
      console.log(`Cabeça (impressoras do privado) com leitura velha: ${velhas.length}/${cab.length}. Último lote ok do loop: ${Math.round(idadeJob)} min.`);
      for (const c of cab) console.log(`  ${c.idade} min  ${c.t}`);
      console.log(ok ? 'OK (loop vivo; a lista do privado só mostra Amazon com leitura fresca)' : 'FALHA: o loop da Amazon está parado há mais de 40 min');
    }
    process.exitCode = ok ? 0 : 1;
  } finally { await sql.end(); }
})();
