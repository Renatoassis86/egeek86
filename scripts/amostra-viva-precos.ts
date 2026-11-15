/**
 * REVISOR/QA (#119): AMOSTRA VIVA adversarial. Lê a PÁGINA do ML no servidor (sem Chrome) e compara com o preço gravado e com o preço escrito
 * na última mensagem enviada da oferta. SOMENTE LEITURA (nenhuma escrita no banco).
 *   npx tsx --env-file=.env.local scripts/amostra-viva-precos.ts [--n 30] [--seed x] [--registrar]
 * Seleção: todas as P2S/P1S Combo ativas do ML (mencionadas em mensagem/lista nas últimas 24 h primeiro) + aleatórias elegíveis, N <= 40.
 * Ritmo: 1 leitura a cada 2 s pelo controle global auditoria-ritmo; para em 429/captcha. Amazon: usa o último preço lido pelo loop (affiliate_price_snapshots) e a data; a página
 * da Amazon não é lida sem Chrome. Nunca imprime segredo.
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';
import { lerCartoes } from '../src/lib/links/polycard';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1]! : d; };
const N = Math.min(40, Math.max(1, Number(arg('--n', '30'))));
const REGISTRAR = process.argv.includes('--registrar');
const DOC = 'docs/revisao-integridade-preco-2026-11-15.md';
const PRIVADO = ['2e4a5bd1-27d7-42c6-bc62-dfa1d5eace45', '23bfa05b-053e-46cc-8308-7d4332fadf18'];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mobile/15E148 Safari/604.1) AppleWebKit/605.1.15 Version/17.0';
/** Mesmo controle do cron (collector_runs job 'auditoria-ritmo', lock consultivo): 1 leitura a cada 2 s somando todos; recuo de 15 min em captcha/429. */
async function reservar(sql: ReturnType<typeof connect>): Promise<{ ok: true; esperaMs: number } | { ok: false; ateMs: number }> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('auditoria-ritmo'))`;
    const rows = await tx<{ id: string; meta: { prox?: number; bloqueado_ate?: number } | null }[]>`SELECT id::text id, meta FROM collector_runs WHERE job='auditoria-ritmo' ORDER BY started_at DESC LIMIT 1`;
    const agora = Date.now();
    // Mesmo formato saneado de src/lib/links/ritmo.ts: 6 chaves numéricas; lê string jsonb se vier assim; nunca espalha o meta.
    let raw: unknown = rows[0]?.meta ?? {};
    if (typeof raw === 'string') { try { raw = raw.length < 2000 ? JSON.parse(raw) : {}; } catch { raw = {}; } }
    const o = (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw as object).length <= 50 ? raw : {}) as Record<string, unknown>;
    const n6 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e14 ? Math.floor(v) : 0);
    const m = { prox: n6(o.prox), bloqueado_ate: n6(o.bloqueado_ate), janela_ini: n6(o.janela_ini), janela_n: n6(o.janela_n), recuos: n6(o.recuos), ultimo_bloqueio: n6(o.ultimo_bloqueio) };
    if (m.bloqueado_ate > agora) return { ok: false as const, ateMs: m.bloqueado_ate };
    const nova = agora - m.janela_ini >= 10 * 60_000;
    if (!nova && m.janela_n >= 120) return { ok: false as const, ateMs: m.janela_ini + 10 * 60_000 };
    const prox = Math.max(m.prox, agora);
    const novo = JSON.stringify({ ...m, prox: prox + 4000, janela_ini: nova ? agora : m.janela_ini, janela_n: nova ? 1 : m.janela_n + 1 });
    if (rows[0]) await tx`UPDATE collector_runs SET meta = ${novo}::text::jsonb, finished_at = now() WHERE id = ${rows[0].id}::bigint`;
    else await tx`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('auditoria-ritmo','mercado-livre',now(),now(),0,'ok',${novo}::text::jsonb)`;
    return { ok: true as const, esperaMs: prox - agora };
  });
}
async function bloquear(sql: ReturnType<typeof connect>, nota: string) {
  await sql`UPDATE collector_runs SET meta = jsonb_set(jsonb_set(coalesce(meta,'{}'::jsonb),'{bloqueado_ate}',to_jsonb(${Date.now() + 30 * 60_000}::bigint)),'{ultimo_bloqueio}',to_jsonb(${Date.now()}::bigint)) WHERE job='auditoria-ritmo' AND jsonb_typeof(meta)='object'`;
  await sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES ('auditoria-links-bloqueio','mercado-livre',now(),now(),0,'error',${JSON.stringify({ nota, origem: 'amostra-viva-revisor' })}::jsonb)`;
}
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const brl = (c: number | null) => (c == null ? '-' : `R$ ${(c / 100).toFixed(2).replace('.', ',')}`);
const dig = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Primeiro "R$ 1.234,56" do texto (preço principal da mensagem de card), em centavos. */
function precoDaMensagem(t: string | null): number | null {
  if (!t) return null;
  const m = /R\$\s?([\d.]+),(\d{2})/.exec(t.replace(/<[^>]+>/g, ''));
  return m ? Number(m[1]!.replace(/\./g, '')) * 100 + Number(m[2]) : null;
}

interface Pag { ok: boolean; parar?: boolean; nota: string; item?: string | null; produto?: string | null; preco?: number | null; pausado?: boolean; urlFinal?: string }

async function lerPagina(url: string): Promise<Pag> {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' }, signal: AbortSignal.timeout(15000) });
    if (res.status === 429) return { ok: false, parar: true, nota: 'http_429' };
    if (/captcha|account-verification|gz\/user-logged/i.test(res.url)) return { ok: false, parar: true, nota: 'captcha' };
    if (res.status !== 200) return { ok: false, nota: `http_${res.status}` };
    const html = await res.text();
    if (html.includes('"polycards":[')) {
      const c = lerCartoes(html)[0];
      if (!c) return { ok: false, nota: 'polycards_vazio' };
      return { ok: true, nota: 'polycard[0]', item: c.itemId, produto: c.productId, preco: c.precoCents, pausado: c.pausado, urlFinal: res.url.replace(/\?.*/, '') };
    }
    // página direta do anúncio / catálogo: meta itemprop e JSON-LD
    const p = /itemprop="price"\s+content="([\d.]+)"/i.exec(html) ?? /"price":\s*"?([\d.]+)"?/i.exec(html);
    const it = /(MLB-?\d{8,})/i.exec(res.url) ?? /"item_id":"(MLB\d+)"/i.exec(html);
    const pausado = /an[uú]ncio pausado|publica[cç][aã]o pausada|este an[uú]ncio est[aá] pausado/i.test(html) || /itemprop="availability"[^>]*(OutOfStock|Discontinued)/i.test(html);
    if (!p) return { ok: false, nota: html.length < 20000 ? 'pagina_curta' : 'sem_preco_na_pagina', pausado, item: it ? dig(it[1]) && `MLB${dig(it[1])}` : null };
    return { ok: true, nota: 'meta_price', item: it ? `MLB${dig(it[1])}` : null, preco: Math.round(Number(p[1]) * 100), pausado, urlFinal: res.url.replace(/\?.*/, '') };
  } catch (e) {
    return { ok: false, nota: `rede: ${e instanceof Error ? e.message.slice(0, 50) : 'erro'}` };
  }
}

(async () => {
  const sql = connect();
  const achados: string[] = [];
  try {
    const base = await sql<any[]>`
      SELECT o.id::text id, o.master_product_id::text master, o.affiliate_url link, o.external_item_id ext, o.link_item_id link_item, o.current_price_cents::bigint price,
             o.last_price_confirmed_at conf, o.last_checked_at checked, o.item_trocado_at trocado
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id AND n.slug='mercado-livre'
      WHERE o.status='active' AND o.quarantined_at IS NULL AND o.last_checked_at > now() - interval '24 hours' AND o.affiliate_url IS NOT NULL
        AND (o.master_product_id::text = ANY(${PRIVADO}::text[]) OR o.id IN (SELECT offer_id FROM group_messages WHERE status='enviada' AND sent_at > now() - interval '24 hours' AND offer_id IS NOT NULL))`;
    const ult = await sql<{ id: string; msg: string; at: Date }[]>`
      SELECT DISTINCT ON (offer_id) offer_id::text id, text_body msg, sent_at at FROM group_messages
      WHERE status='enviada' AND sent_at > now() - interval '48 hours' AND offer_id = ANY(${base.map((r) => r.id)}::uuid[]) ORDER BY offer_id, sent_at DESC`;
    const [lp] = await sql<{ p: Record<string, number> | null; at: Date | null }[]>`SELECT meta->'precos' p, started_at at FROM collector_runs WHERE job='lista-impressoras' AND meta ? 'precos' ORDER BY started_at DESC LIMIT 1`;
    const um = new Map(ult.map((u) => [u.id, u]));
    for (const r of base) { const u = um.get(r.id); r.msg = u?.msg ?? null; r.msg_at = u?.at ?? null; const v = lp?.p?.[r.id.replace(/-/g, '').slice(0, 12)]; r.lista_preco = v ?? null; r.lista_at = lp?.at ?? null; }
    const combos = base.filter((r) => PRIVADO.includes(r.master));
    const resto = base.filter((r) => !PRIVADO.includes(r.master));
    const semente = Array.from(arg('--seed', String(Date.now())) as unknown as string).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    let s = semente;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const emb = [...resto].sort(() => rnd() - 0.5);
    const escolha = [...combos, ...emb].slice(0, N);
    console.log(`AMOSTRA VIVA — ${new Date().toISOString()} — ${escolha.length} ofertas (${Math.min(combos.length, N)} combos P2S/P1S + ${Math.max(0, escolha.length - combos.length)} aleatórias com mensagem enviada)`);
    let lidas = 0, parou: string | null = null;
    for (const o of escolha) {
      const slot = await reservar(sql);
      if (!slot.ok) { parou = 'recuo_global_ativo'; console.log('PAROU: recuo global (captcha/429 recente) ativo até ' + new Date(slot.ateMs).toISOString()); break; }
      if (slot.esperaMs > 0) await dormir(slot.esperaMs);
      const pag = await lerPagina(o.link);
      lidas++;
      if (!pag.ok && pag.parar) { parou = pag.nota; await bloquear(sql, pag.nota); console.log(`PAROU: ${pag.nota} (recuo global de 15 min aberto)`); break; }
      const banco = Number(o.price);
      const msgP = precoDaMensagem(o.msg);
      const idadeLeitura = o.conf ? Math.round((Date.now() - o.conf.getTime()) / 60000) : null;
      const probs: string[] = [];
      if (!pag.ok) probs.push(`leitura_falhou(${pag.nota})`);
      else {
        if (pag.pausado) probs.push('PAGINA_PAUSADA');
        if (pag.preco != null && Math.abs(pag.preco - banco) > Math.max(100, Math.round(banco * 0.001))) probs.push(`pagina!=banco (${(((pag.preco - banco) / banco) * 100).toFixed(1)}%)`);
        const alvo = o.ext ?? o.link_item;
        if (alvo && pag.item && dig(alvo) !== dig(pag.item)) probs.push(`anuncio_pagina(${pag.item})!=banco(${alvo})`);
        if (pag.preco != null && msgP != null && Math.abs(pag.preco - msgP) / msgP > 0.005) probs.push(`pagina!=mensagem (${brl(msgP)})`);
        if (pag.preco != null && o.lista_preco != null && Math.abs(pag.preco - Number(o.lista_preco)) / Number(o.lista_preco) > 0.005) probs.push(`pagina!=lista_privada (${brl(Number(o.lista_preco))})`);
      }
      if (msgP != null && Math.abs(msgP - banco) / banco > 0.005) probs.push(`mensagem!=banco (${brl(msgP)} vs ${brl(banco)}, msg ${o.msg_at?.toISOString().slice(5, 16)})`);
      const linha = `${probs.length ? 'DISCREPANCIA' : 'ok          '} ${o.id.slice(0, 8)} ${PRIVADO.includes(o.master) ? '[combo]' : '       '} pág ${brl(pag.preco ?? null)} | banco ${brl(banco)} | msg ${brl(msgP)} | lista ${brl(o.lista_preco == null ? null : Number(o.lista_preco))} | leitura há ${idadeLeitura ?? '?'} min${probs.length ? ' :: ' + probs.join('; ') : ''}`;
      console.log(linha);
      if (probs.length) achados.push(`${o.id} link=${o.link} :: ${linha.split('::')[1]?.trim() ?? probs.join('; ')} | pág ${brl(pag.preco ?? null)} banco ${brl(banco)} msg ${brl(msgP)} leitura há ${idadeLeitura} min`);
    }
    // Amazon: último preço lido pelo loop
    const am = await sql<{ id: string; price: string; snap: string | null; at: Date | null; msg: string | null }[]>`
      SELECT o.id::text id, o.current_price_cents::text price, s.price_cents::text snap, s.collected_at at,
             (SELECT text_body FROM group_messages g WHERE g.offer_id=o.id AND g.status='enviada' AND g.sent_at > now() - interval '48 hours' ORDER BY sent_at DESC LIMIT 1) msg
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id AND n.slug='amazon'
      LEFT JOIN LATERAL (SELECT price_cents, collected_at FROM affiliate_price_snapshots x WHERE x.offer_id=o.id ORDER BY collected_at DESC LIMIT 1) s ON true
      WHERE o.status='active' AND o.quarantined_at IS NULL AND o.last_checked_at > now() - interval '24 hours' AND o.master_product_id::text = ANY(${PRIVADO}::text[])`;
    console.log('\nAMAZON (sem Chrome não leio a página; uso o último preço lido pelo loop):');
    for (const r of am) {
      const msgP = precoDaMensagem(r.msg);
      const idade = r.at ? Math.round((Date.now() - r.at.getTime()) / 60000) : null;
      const p: string[] = [];
      if (r.snap && r.snap !== r.price) p.push('snapshot!=banco');
      if (msgP != null && Math.abs(msgP - Number(r.price)) / Number(r.price) > 0.005) p.push('mensagem!=banco');
      if (idade == null || idade > 130) p.push(`leitura_velha(${idade ?? 'nunca'} min)`);
      console.log(`${p.length ? 'DISCREPANCIA' : 'ok          '} ${r.id.slice(0, 8)} banco ${brl(Number(r.price))} | snapshot ${brl(r.snap ? Number(r.snap) : null)} há ${idade ?? '?'} min | msg ${brl(msgP)}${p.length ? ' :: ' + p.join('; ') : ''}`);
      if (p.length) achados.push(`${r.id} (amazon) :: ${p.join('; ')} banco ${brl(Number(r.price))} snapshot ${brl(r.snap ? Number(r.snap) : null)} há ${idade} min msg ${brl(msgP)}`);
    }
    console.log(`\nResumo: ${lidas} páginas lidas${parou ? ` (parou: ${parou})` : ''}; ${achados.length} discrepâncias.`);
    if (REGISTRAR && achados.length) {
      let t = `\n## Amostra viva ${new Date().toISOString()} — ${achados.length} discrepâncias em ${lidas} páginas\n`;
      for (const a of achados) t += `- **[${/combo|PAGINA_PAUSADA|anuncio_pagina/.test(a) ? 'bloqueante' : 'alto'}]** Invariante: preço/anúncio dito = página. ${a}\n`;
      if (!fs.existsSync(DOC)) fs.writeFileSync(DOC, '# Revisão de integridade de preço — 2026-11-15\n');
      fs.appendFileSync(DOC, t);
    }
    process.exitCode = achados.length ? 1 : 0;
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error('FALHA:', e instanceof Error ? (e.stack ?? e.message).split(String.fromCharCode(10)).slice(0, 4).join(' / ') : e); process.exit(2); });
