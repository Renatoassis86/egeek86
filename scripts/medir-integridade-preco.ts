/**
 * REVISOR/QA (#119): mede a integridade de preço/anúncio/link das ofertas e das mensagens. SOMENTE LEITURA.
 *   npx tsx --env-file=.env.local scripts/medir-integridade-preco.ts [--json] [--registrar]
 * --registrar: anexa um achado por indicador em FALHA a docs/revisao-integridade-preco-2026-11-15.md.
 * Saída 0 só se TODOS os indicadores do ESCOPO ESTRITO (P2S Combo e P1S Combo) estiverem OK. Nunca imprime segredo.
 *
 * Escopos: estrito = masters do privado (P2S/P1S Combo); amplo = vertical impressao3d (ML/Amazon); geral = todas as redes.
 * Elegível = ativa, fora da quarentena, last_checked_at <= 24 h. Auditoria de links só existe para o ML (offer_link_audit).
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';

const JSON_OUT = process.argv.includes('--json');
const REGISTRAR = process.argv.includes('--registrar');
const DOC = 'docs/revisao-integridade-preco-2026-11-15.md';
const PRIVADO = ['2e4a5bd1-27d7-42c6-bc62-dfa1d5eace45', '23bfa05b-053e-46cc-8308-7d4332fadf18'];
const VALE_MIN = 360;
const dig = (s: string | null) => (s ?? '').replace(/\D/g, '');

type Esc = 'estrito' | 'amplo' | 'geral';
const ESCS: Esc[] = ['estrito', 'amplo', 'geral'];
interface Off {
  id: string; rede: string; master: string; vert: string | null; price: number; ext: string | null; cat: string | null; metaCat: string | null;
  link: string | null; linkItem: string | null; trocado: Date | null; pchg: Date | null; vmin: number | null; vmax: number | null; pending: boolean | null; miss: number; conf: Date | null; checked: Date;
  aV: string | null; aAt: Date | null; aPrice: number | null; okAt: Date | null; aDiff: number | null;
}
const noEsc = (o: Off, e: Esc) => e === 'geral' || (e === 'amplo' ? o.vert === 'impressao3d' && o.rede !== 'shopee' : PRIVADO.includes(o.master));

interface Ind { id: string; nome: string; esc: Esc; valor: string; n: number; ok: boolean; info?: boolean; ids: string[]; invariante: string }
const inds: Ind[] = [];
function add(id: string, nome: string, esc: Esc, n: number, valor: string, ids: string[], invariante: string, ok = n === 0, info = false) {
  inds.push({ id, nome, esc, valor, n, ok, info, ids: ids.slice(0, 8), invariante });
}

(async () => {
  const sql = connect();
  const agora = new Date();
  try {
    const rows = await sql<any[]>`
      SELECT o.id::text id, n.slug rede, o.master_product_id::text master, o.vertical vert, o.current_price_cents::bigint price,
             o.external_item_id ext, o.external_ref cat, m.meli_catalog_id meta_cat, o.affiliate_url link, o.link_item_id link_item,
             o.item_trocado_at trocado, o.last_price_change_at pchg, o.variant_min_cents vmin, o.variant_max_cents vmax, o.affiliate_link_pending pending, o.consecutive_miss_count miss, o.last_price_confirmed_at conf, o.last_checked_at checked,
             a.verdict a_v, a.checked_at a_at, a.price_link_cents a_price, a.diff_pct a_diff, ok.ok_at
      FROM affiliate_offers o
      JOIN affiliate_networks n ON n.id = o.network_id
      JOIN master_products m ON m.id = o.master_product_id
      LEFT JOIN LATERAL (SELECT verdict, checked_at, price_link_cents, diff_pct FROM offer_link_audit x WHERE x.offer_id = o.id ORDER BY checked_at DESC LIMIT 1) a ON true
      LEFT JOIN LATERAL (SELECT max(checked_at) ok_at FROM offer_link_audit x WHERE x.offer_id = o.id AND x.verdict = 'ok') ok ON true
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.last_checked_at > now() - interval '24 hours'`;
    const ofs: Off[] = rows.map((r) => ({
      id: r.id, rede: r.rede, master: r.master, vert: r.vert, price: Number(r.price), ext: r.ext, cat: r.cat, metaCat: r.meta_cat, link: r.link, linkItem: r.link_item,
      trocado: r.trocado, pchg: r.pchg, vmin: r.vmin == null ? null : Number(r.vmin), vmax: r.vmax == null ? null : Number(r.vmax), pending: r.pending, miss: Number(r.miss ?? 0), conf: r.conf, checked: r.checked, aV: r.a_v, aAt: r.a_at, aPrice: r.a_price == null ? null : Number(r.a_price),
      okAt: r.ok_at, aDiff: r.a_diff == null ? null : Number(r.a_diff),
    }));
    const porId = new Map(ofs.map((o) => [o.id, o]));
    const idade = (d: Date | null) => (d ? (agora.getTime() - d.getTime()) / 60000 : Infinity);
    const ml = (o: Off) => o.rede === 'mercado-livre';
    const [{ n: ativasMl }] = await sql<{ n: string }[]>`SELECT count(*)::text n FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id AND n.slug='mercado-livre' WHERE o.status='active'`;
    const [pri] = await sql<{ t: Date | null }[]>`SELECT min(checked_at) t FROM offer_link_audit`;
    const inicioAud = pri?.t ?? agora;

    for (const e of ESCS) {
      const E = ofs.filter((o) => noEsc(o, e));
      const EM = E.filter(ml);
      // (a) elegíveis ML sem veredito ok <= 6 h
      const semOk = EM.filter((o) => !(o.okAt && idade(o.okAt) <= VALE_MIN && o.aV === 'ok' && idade(o.aAt) <= VALE_MIN));
      add('a', `elegíveis ML (${EM.length}) sem veredito ok recente (<=6 h) [${E.length - EM.length} outras redes fora]`, e, semOk.length, `${semOk.length}/${EM.length}`, semOk.map((o) => o.id), 'Só sai/aparece preço com veredito ok <= 6 h da página do link');
      const nv = (v: string) => semOk.filter((o) => (v === 'sem' ? !o.aV : o.aV === v)).length;
      add('a.det', `  detalhe: sem veredito=${nv('sem')} erro_leitura=${nv('erro_leitura')} preco_div=${nv('preco_divergente')} item_dif=${nv('item_diferente')} pausado=${nv('pausado')} ok_velho=${semOk.filter((o) => o.aV === 'ok').length}`, e, 0, '-', [], '', true, true);
      // (c) cobertura
      const cob = EM.length ? ((EM.length - semOk.length) / EM.length) * 100 : 100;
      add('c', 'cobertura de auditoria (ok <= 6 h)', e, EM.length - Math.round((cob / 100) * EM.length), `${cob.toFixed(1)}%`, [], 'Toda oferta elegível tem veredito fresco', cob >= 99.5);
      // (d)
      const d = E.filter((o) => ml(o) && (!o.ext || (/^MLB\d+$/.test(o.ext) && (dig(o.ext) === dig(o.cat) || dig(o.ext) === dig(o.metaCat)))));
      add('d', 'ML ativa/elegível com external_item_id nulo ou igual a catálogo', e, d.length, String(d.length), d.map((o) => o.id), 'Oferta ML aponta para um anúncio concreto, nunca para catálogo');
      // (e)
      const eE = E.filter((o) => ml(o) && o.linkItem && o.ext && dig(o.linkItem) !== dig(o.ext));
      add('e', 'link_item_id != external_item_id (link preso a outro anúncio)', e, eE.length, String(eE.length), eE.map((o) => o.id), 'Link no mesmo anúncio do preço');
      const eN = E.filter((o) => ml(o) && !o.linkItem && o.link && !/\/MLB-?\d/i.test(o.link));
      add('e.2', '  info: ML elegível sem link_item_id registrado (link opaco meli.la)', e, eN.length, String(eN.length), [], 'Link com anúncio rastreável', true, true);
      // (f)
      const f = E.filter((o) => ml(o) && o.trocado && idade(o.trocado) <= 1440 && (o.pending || !o.linkItem || (o.ext && dig(o.linkItem) !== dig(o.ext))));
      add('f', 'item_trocado_at <= 24 h sem link regerado', e, f.length, String(f.length), f.map((o) => o.id), 'Troca de anúncio regera o link');
      // (g)
      const g = E.filter((o) => o.aV === 'pausado' || o.miss >= 3);
      add('g', 'pausado/sumiu (miss>=3 ou veredito pausado) ainda ativa e elegível', e, g.length, String(g.length), g.map((o) => o.id), 'Anúncio pausado/encerrado sai da lista e do site');
      // (h)
      const h = EM.filter((o) => o.aPrice != null && o.price > 0 && o.aAt && idade(o.aAt) <= VALE_MIN && Math.abs(o.aPrice - o.price) > Math.max(100, Math.round(o.price * 0.001)));
      add('h', 'preço da oferta x preço_link do veredito (<=6 h) com |diff| > max(R$ 1; 0,1%) [tolerância nova]', e, h.length, String(h.length), h.map((o) => o.id), 'Preço dito = preço da página');
      // (k) veredito ok que já foi invalidado por mudança de preço/troca de anúncio posterior (corrida entre auditoria e envio)
      const k = EM.filter((o) => o.aV === 'ok' && o.aAt && idade(o.aAt) <= VALE_MIN && ((o.pchg && o.pchg > o.aAt) || (o.trocado && o.trocado > o.aAt)));
      add('k', 'veredito ok (<=6 h) anterior a mudança de preço/troca de anúncio (ok obsoleto ainda vale)', e, k.length, String(k.length), k.map((o) => o.id), 'Veredito ok vale só enquanto preço e anúncio não mudaram');
      // (l) variações de preço sem contexto
      const l = E.filter((o) => ml(o) && o.vmin && o.vmax && o.vmax > o.vmin);
      add('l', 'info: ML elegível com faixa de variações (vmax > vmin): exige "a partir de"', e, l.length, String(l.length), l.map((o) => o.id), 'Variação de preço com contexto', true, true);
      // (i) Amazon/Shopee
      for (const rede of ['amazon', 'shopee'] as const) {
        const R = E.filter((o) => o.rede === rede);
        if (!R.length) continue;
        const ages = R.map((o) => idade(o.conf)).sort((x, y) => x - y);
        const p = (q: number) => (ages[Math.min(ages.length - 1, Math.floor(q * ages.length))]! === Infinity ? 'nunca' : `${Math.round(ages[Math.min(ages.length - 1, Math.floor(q * ages.length))]!)}min`);
        const lim = rede === 'amazon' ? 130 : 360;
        const velhas = R.filter((o) => idade(o.conf) > lim);
        add('i', `${rede}: ${R.length} elegíveis; confirmação mediana ${p(0.5)} p90 ${p(0.9)} máx ${p(1)}; > ${lim} min`, e, velhas.length, `${velhas.length}/${R.length}`, velhas.map((o) => o.id), 'Preço confirmado dentro da janela da rede', velhas.length === 0);
      }
    }

    // (i) divergência de snapshot x oferta (Amazon/Shopee), uma vez, geral
    const dv = await sql<{ id: string; rede: string; price: string; snap: string; at: Date }[]>`
      SELECT o.id::text id, n.slug rede, o.current_price_cents::text price, s.price_cents::text snap, s.collected_at at
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id AND n.slug IN ('amazon','shopee')
      JOIN LATERAL (SELECT price_cents, collected_at FROM affiliate_price_snapshots x WHERE x.offer_id=o.id ORDER BY collected_at DESC LIMIT 1) s ON true
      WHERE o.status='active' AND o.quarantined_at IS NULL AND o.last_checked_at > now() - interval '24 hours' AND s.price_cents <> o.current_price_cents`;
    add('i.div', 'Amazon/Shopee: último snapshot != preço da oferta (leitura de página x banco)', 'geral', dv.length, String(dv.length), dv.map((r) => r.id), 'Preço da oferta = última leitura');
    const dvE = dv.filter((r) => porId.get(r.id) && noEsc(porId.get(r.id)!, 'estrito'));
    add('i.div', 'Amazon/Shopee: último snapshot != preço da oferta', 'estrito', dvE.length, String(dvE.length), dvE.map((r) => r.id), 'Preço da oferta = última leitura');

    // (b) mensagens enviadas 24 h sem veredito ok até o envio
    const janela = new Date(Math.max(agora.getTime() - 86400_000, inicioAud.getTime()));
    interface Env { origem: string; offer: string; at: Date; dropped?: boolean }
    const env: Env[] = [];
    const gm = await sql<{ offer: string | null; at: Date; trig: string; drop: string | null }[]>`
      SELECT COALESCE(offer_id::text, candidate->'offerIds'->>0) offer, sent_at at, trigger trig, candidate->>'dropPct' drop
      FROM group_messages WHERE status='enviada' AND sent_at > now() - interval '24 hours' AND sent_at IS NOT NULL`;
    for (const r of gm) if (r.offer) env.push({ origem: `grupo:${r.trig}`, offer: r.offer, at: r.at, dropped: r.drop != null || /^P[1-4]$/.test(r.trig) });
    const qd = await sql<{ oferta: string; at: Date }[]>`SELECT meta->>'oferta' oferta, started_at at FROM collector_runs WHERE job='lista-impressoras-queda' AND started_at > now() - interval '24 hours' AND meta->>'oferta' IS NOT NULL`;
    for (const r of qd) env.push({ origem: 'privado:queda', offer: r.oferta, at: r.at, dropped: true });
    const ls = await sql<{ at: Date; itens: Record<string, string> | null }[]>`SELECT started_at at, meta->'itens' itens FROM collector_runs WHERE job='lista-impressoras' AND started_at > now() - interval '24 hours'`;
    const por12 = new Map<string, string>();
    for (const o of ofs) por12.set(o.id.replace(/-/g, '').slice(0, 12), o.id);
    let listaForaDoCorte = 0;
    for (const r of ls) for (const k of Object.keys(r.itens ?? {})) { const id = por12.get(k); if (id) env.push({ origem: 'privado:lista', offer: id, at: r.at }); else listaForaDoCorte++; }
    // auditorias ok das ofertas envolvidas
    const idsEnv = [...new Set(env.map((x) => x.offer))];
    const aud = idsEnv.length ? await sql<{ offer: string; at: Date; v: string }[]>`SELECT offer_id::text offer, checked_at at, verdict v FROM offer_link_audit WHERE offer_id = ANY(${idsEnv}::uuid[]) AND checked_at > now() - interval '31 hours'` : [];
    const audPor = new Map<string, { at: Date; v: string }[]>();
    for (const a of aud) (audPor.get(a.offer) ?? audPor.set(a.offer, []).get(a.offer)!).push({ at: a.at, v: a.v });
    const infoOf = await sql<{ id: string; rede: string; master: string; vert: string | null; trocado: Date | null }[]>`
      SELECT o.id::text id, n.slug rede, o.master_product_id::text master, o.vertical vert, o.item_trocado_at trocado FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id WHERE o.id = ANY(${idsEnv}::uuid[])`;
    const info = new Map(infoOf.map((r) => [r.id, r]));
    const semOkEnv = (x: Env) => !(audPor.get(x.offer) ?? []).some((a) => a.v === 'ok' && a.at <= x.at && x.at.getTime() - a.at.getTime() <= VALE_MIN * 60000);
    const dentro = env.filter((x) => x.at >= janela);
    for (const e of ESCS) {
      const sel = dentro.filter((x) => { const i = info.get(x.offer); if (!i) return false; if (i.rede !== 'mercado-livre') return false; return e === 'geral' || (e === 'amplo' ? i.vert === 'impressao3d' : PRIVADO.includes(i.master)); });
      const mal = sel.filter(semOkEnv);
      add('b', `mensagens ML enviadas (janela desde ${janela.toISOString().slice(5, 16)}Z: ${sel.length}) sem veredito ok <= 6 h antes do envio`, e, mal.length, `${mal.length}/${sel.length}`, mal.map((x) => `${x.offer.slice(0, 8)}@${x.origem}`), 'Mensagem só sai com veredito ok recente');
      if (e === 'estrito' && mal.length) {
        const hh = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(11, 16);
        const agr = new Map<string, number>();
        for (const x of mal) { const k = `${hh(x.at)} ${x.origem}`; agr.set(k, (agr.get(k) ?? 0) + 1); }
        add('b.det', `  detalhe (hora de Brasília, origem): ${[...agr].sort().map(([k, n]) => `${k}x${n}`).join('; ')}`, e, 0, '-', [], '', true, true);
      }
      // (j)
      const j = sel.filter((x) => x.dropped).filter((x) => { const t = info.get(x.offer)!.trocado; return t && t <= x.at && x.at.getTime() - t.getTime() <= 12 * 3600_000; });
      add('j', 'mensagens de queda enviadas com troca de anúncio nas 12 h anteriores (queda entre anúncios)', e, j.length, `${j.length}/${sel.filter((x) => x.dropped).length}`, j.map((x) => `${x.offer.slice(0, 8)}@${x.origem}`), 'Queda só entre leituras do mesmo anúncio');
    }
    const naoMl = dentro.filter((x) => info.get(x.offer) && info.get(x.offer)!.rede !== 'mercado-livre').length;
    add('b.info', `info: mensagens 24 h de outras redes (sem auditoria por desenho): ${naoMl}; itens de lista fora do corte 24 h: ${listaForaDoCorte}; auditoria existe desde ${inicioAud.toISOString().slice(0, 16)}Z; ML ativas total ${ativasMl}`, 'geral', 0, '-', [], '', true, true);

    // ---- saída
    const estritoFalha = inds.filter((i) => i.esc === 'estrito' && !i.ok && !i.info);
    const fim = estritoFalha.length === 0;
    if (JSON_OUT) {
      console.log(JSON.stringify({ em: agora.toISOString(), fim, estritoFalha: estritoFalha.map((i) => i.id), indicadores: inds }, null, 1));
    } else {
      console.log(`INTEGRIDADE DE PREÇO — ${agora.toISOString()}  (elegíveis: ${ofs.length}; ML ${ofs.filter(ml).length}, Amazon ${ofs.filter((o) => o.rede === 'amazon').length}, Shopee ${ofs.filter((o) => o.rede === 'shopee').length})`);
      for (const e of ESCS) {
        console.log(`\n== ESCOPO ${e.toUpperCase()} ==`);
        for (const i of inds.filter((x) => x.esc === e)) console.log(`${i.info ? ' i ' : i.ok ? 'OK ' : 'FALHA'.padEnd(3)} [${i.id}] ${i.nome}: ${i.valor}${i.ids.length && !i.ok ? `  ex.: ${i.ids.slice(0, 3).join(', ')}` : ''}`);
      }
      console.log(`\nFIM DO LOOP: ${fim ? 'SIM' : 'NÃO'}`);
      if (!fim) { console.log('Falta (escopo estrito):'); for (const i of estritoFalha) console.log(`  - [${i.id}] ${i.nome}: ${i.valor}`); }
      const amplo = inds.filter((i) => i.esc !== 'estrito' && !i.ok && !i.info).length;
      console.log(`(indicadores FALHA fora do estrito: ${amplo})`);
    }
    if (REGISTRAR) {
      const falhas = inds.filter((i) => !i.ok && !i.info);
      let t = `\n## Medição ${agora.toISOString()} — FIM DO LOOP: ${fim ? 'SIM' : 'NÃO'} (${falhas.length} achados)\n`;
      for (const i of falhas) {
        const sev = i.esc === 'estrito' ? 'bloqueante' : i.esc === 'amplo' ? 'alto' : 'médio';
        t += `- **[${sev}] ${i.id}/${i.esc}** ${i.nome}: ${i.valor}. Invariante violado: ${i.invariante}. Evidência (offer_id): ${i.ids.join(', ') || '-'}\n`;
      }
      if (!fs.existsSync(DOC)) fs.writeFileSync(DOC, '# Revisão de integridade de preço — 2026-11-15\n');
      fs.appendFileSync(DOC, t);
    }
    process.exitCode = fim ? 0 : 1;
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(2); });
