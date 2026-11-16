/**
 * MEDIDOR das invariantes de informacao publicada (R-71 a R-77, auditoria independente 2026-11-16). SOMENTE LEITURA. Codigo 1 se alguma invariante falhar.
 *   npx tsx --env-file=.env.local scripts/medir-informacao-publicada.ts [--desde 2026-11-16T12:00:00Z]   (padrao: ultimas 24 h)
 *  i1 R-72: nenhuma mensagem AC com "Novo no monitoramento" cuja oferta ou produto tenha mais de 24 h  (so mensagens enviadas DEPOIS do deploy)
 *  i2 R-77: nenhum master repetido dentro de 72 h sem novidade (queda < 2% e < R$ 10) em gatilho de preco
 *  i3 R-75: nenhuma oferta ativa visivel com Open Box/vitrine/mostruario no titulo
 *  i4 R-73: nenhuma oferta ativa visivel abaixo de 0,50 x a mediana dos outros anuncios (>= 3 vendedores/lojas), por identidade de loja
 *  i5 R-76: nenhuma oferta ativa visivel com auditoria de link bloqueante nas ultimas 6 h
 */
import { connect } from './_dup-shared';
(async () => {
  const sql = connect();
  const a = process.argv.indexOf('--desde');
  const desde = a >= 0 ? process.argv[a + 1]! : new Date(Date.now() - 24 * 3600_000).toISOString();
  const falhas: string[] = [];
  const run = async (nome: string, n: number) => { console.log(`${n === 0 ? 'ok  ' : 'FALHA'} ${nome}: ${n}`); if (n) falhas.push(nome); };
  try {
    await run('i1 AC "Novo no monitoramento" com oferta/produto velho (R-72)', Number((await sql`
      select count(*)::int n from group_messages g join affiliate_offers o on o.id=g.offer_id
      where g.trigger='AC' and g.status='enviada' and g.sent_at>=${desde}::timestamptz and g.text_body ilike '%Novo no monitoramento%'
        and (o.created_at < g.sent_at - interval '24 hours' or (select min(x.created_at) from affiliate_offers x where x.master_product_id=o.master_product_id) < g.sent_at - interval '24 hours')`)[0]!.n));
    await run('i2 master repetido sem novidade em 72 h (R-77)', Number((await sql`
      with s as (select master_product_id mid, sent_at, price_cents_detected p, lag(sent_at) over w ps, lag(price_cents_detected) over w pp
        from group_messages where status='enviada' and channel='tg' and master_product_id is not null and trigger not in ('P1','P2','P3','P4','P5','G4','RADAR','CUPOM')
        window w as (partition by master_product_id order by sent_at))
      select count(*)::int n from s where sent_at>=${desde}::timestamptz and ps is not null and sent_at-ps<interval '72 hours' and not (pp-p>=1000 or p<=pp*0.98)`)[0]!.n));
    await run('i3 oferta visivel com Open Box/vitrine/mostruario (R-75)', Number((await sql`
      select count(*)::int n from affiliate_offers where status='active' and quarantined_at is null and title ~* '(open[[:space:]-]?box|(^|[^a-zà-ú])vitrine([^a-zà-ú]|$)|mostru[aá]rio)' and title !~* '(expositor|estante|nicho|display|suporte|prateleira|cristaleira|armario|armário|acrilic)'`)[0]!.n));
    await run('i4 oferta visivel < 0,50 x mediana por loja (R-73)', Number((await sql`
      with id as (select o.id, o.master_product_id mid, o.current_price_cents p, coalesce(o.seller_id::text, case when nullif(btrim(o.store_name),'') is not null then 'loja:'||n.slug||':'||lower(btrim(o.store_name)) end) v
        from affiliate_offers o join affiliate_networks n on n.id=o.network_id where o.status='active' and o.quarantined_at is null and o.current_price_cents>0 and o.last_checked_at>now()-interval '3 days'),
      g as (select mid, count(distinct v) nv, percentile_cont(.5) within group (order by p) med from id where v is not null group by mid having count(distinct v)>=4)
      select count(*)::int n from id a join g on g.mid=a.mid where a.p<0.5*g.med`)[0]!.n));
    await run('i5 oferta visivel com link divergente auditado (R-76)', Number((await sql`
      select count(*)::int n from affiliate_offers o join lateral (select verdict, checked_at from offer_link_audit x where x.offer_id=o.id order by x.checked_at desc limit 1) a on true
      where o.status='active' and o.quarantined_at is null and a.verdict in ('preco_divergente','item_diferente','pausado','sem_link','pendente_de_anuncio') and a.checked_at>now()-interval '6 hours'`)[0]!.n));
  } finally { await sql.end(); }
  if (falhas.length) { console.error('INVARIANTES FALHARAM:', falhas.join(' | ')); process.exit(1); }
  console.log('todas as invariantes ok');
})().catch((e) => { console.error(String(e.message).slice(0, 300)); process.exit(1); });
