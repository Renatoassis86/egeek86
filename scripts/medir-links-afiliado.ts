/**
 * R-70 / L6: MEDIDOR DE LINK DE AFILIADO. SOMENTE LEITURA (SELECT e GET). Falha com código 1 se qualquer invariante quebrar.
 *   npx tsx --env-file=.env.local scripts/medir-links-afiliado.ts [--json] [--sem-front]
 * Invariantes:
 *  (a) ofertas ATIVAS publicáveis (não pendentes) sem link estrito válido = 0; pendentes nunca passam no predicado público; rede com oferta ativa sem padrão = 0;
 *      config do banco = config do código; trigger da 0063 existe e está ativo.
 *  (b) mensagens ENVIADAS nas últimas 24 h com qualquer URL de produto fora do padrão (texto E botão; /go resolvido na oferta) = 0.
 *  (c) amostra de páginas do site: nenhum href externo de loja sem a marca do dono.
 * Nunca imprime segredo nem a URL completa de nada além do que já é público.
 */
import { connect } from './_dup-shared';
import { REDES_COM_PADRAO, auditarUrlsDeMensagem, configAfiliado, ehLinkAfiliadoValido, linkPublicavelSql, linkValidoEstritoSql, redeDoHost } from '../src/lib/affiliate/link-afiliado';

const JSON_OUT = process.argv.includes('--json');
const SEM_FRONT = process.argv.includes('--sem-front');
const BASE = (process.env.SITE_URL_MEDIDOR ?? 'https://www.egeek86.com').replace(/\/$/, '');
const cfg = configAfiliado();

interface Ind { id: string; nome: string; valor: string; n: number; ok: boolean; info?: boolean; amostra?: string[] }
const inds: Ind[] = [];
const add = (id: string, nome: string, n: number, ok = n === 0, valor = String(n), amostra: string[] = [], info = false) => inds.push({ id, nome, valor, n, ok, info, amostra: amostra.slice(0, 5) });

(async () => {
  const sql = connect();
  try {
    // (a) ofertas
    const estrito = linkValidoEstritoSql('o.affiliate_url', 'n.slug', cfg);
    const [a1] = await sql.unsafe<{ n: string }[]>(`SELECT count(*)::text n FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.status = 'active' AND NOT o.affiliate_link_pending AND NOT ${estrito}`);
    add('a1', 'ofertas ativas publicáveis (não pendentes) sem link de afiliado válido', Number(a1.n));
    const [a2] = await sql.unsafe<{ n: string }[]>(`SELECT count(*)::text n FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.status = 'active' AND o.quarantined_at IS NULL AND ${linkPublicavelSql('o', cfg)} AND NOT ${estrito}`);
    add('a2', 'ofertas que o predicado público do site/mensagens deixaria passar sem link estrito válido', Number(a2.n));
    const pend = await sql<{ rede: string; n: string; visiveis: string }[]>`SELECT n.slug rede, count(*)::text n, 0::text visiveis FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.status = 'active' AND o.affiliate_link_pending GROUP BY 1`;
    const [a3] = await sql.unsafe<{ n: string }[]>(`SELECT count(*)::text n FROM affiliate_offers o WHERE o.status = 'active' AND o.affiliate_link_pending AND ${linkPublicavelSql('o', cfg)}`);
    add('a3', 'ofertas PENDENTES (sem link) que passariam no predicado público', Number(a3.n));
    add('a4', 'ofertas ativas pendentes de link (retidas fora do site e das mensagens) por rede', pend.reduce((s, r) => s + Number(r.n), 0), true, pend.map((r) => `${r.rede}=${r.n}`).join(' '), [], true);
    const [ml] = await sql<{ n: string }[]>`SELECT count(*)::text n FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.status='active' AND n.slug='mercado-livre' AND o.affiliate_url ~ '^https://www[.]mercadolivre[.]com[.]br/p/MLB' AND o.affiliate_url !~* 'matt_tool=' `;
    add('a5', 'ofertas ML ativas com URL crua /p/MLB (retidas; nenhuma chega a site ou mensagem)', Number(ml.n), true, ml.n, [], true);
    const redes = await sql<{ slug: string; ativas: string }[]>`SELECT n.slug, count(*)::text ativas FROM affiliate_networks n JOIN affiliate_offers o ON o.network_id = n.id WHERE o.status='active' GROUP BY 1`;
    const semPadrao = redes.filter((r) => !(REDES_COM_PADRAO as string[]).includes(r.slug));
    add('a6', 'redes com oferta ativa SEM padrão registrado em REGISTRO', semPadrao.length, semPadrao.length === 0, semPadrao.map((r) => r.slug).join(',') || '0');
    const conf = await sql<{ chave: string; valor: string }[]>`SELECT chave, valor FROM affiliate_link_config`;
    const cv = Object.fromEntries(conf.map((c) => [c.chave, c.valor]));
    const diverge = cv.amazon_tag !== cfg.amazonTag || cv.ml_matt_tool !== cfg.mlToolId;
    add('a7', 'config do banco (affiliate_link_config) diverge da config do código/ambiente', diverge ? 1 : 0);
    const [trg] = await sql<{ n: string; hab: string | null }[]>`SELECT count(*)::text n, min(tgenabled::text) hab FROM pg_trigger WHERE tgname = 'affiliate_offers_link_trg' AND NOT tgisinternal`;
    add('a8', 'trigger affiliate_offers_link_trg ausente/desabilitado ou chave trigger_ativo desligada', Number(trg.n) === 1 && trg.hab !== 'D' && cv.trigger_ativo === '1' ? 0 : 1);

    // (b) mensagens enviadas em 24 h
    const msgs = await sql<{ id: string; text_body: string | null; botao: string | null; slug: string | null }[]>`
      SELECT id::text id, text_body, candidate->>'botaoUrl' botao, candidate->>'offerSlug' slug FROM group_messages WHERE status = 'enviada' AND sent_at > now() - interval '24 hours'`;
    const slugs = new Set<string>();
    const ruins: string[] = [];
    let semBotaoAuditado = 0;
    for (const m of msgs) {
      const botoes = m.botao ? [m.botao] : m.slug ? [`https://www.egeek86.com/go/${encodeURIComponent(m.slug)}`] : [];
      if (!m.botao) semBotaoAuditado++;
      const v = auditarUrlsDeMensagem({ texto: m.text_body ?? '', botoes }, cfg);
      if (v.length) ruins.push(`${m.id}:${v[0].motivo}:${v[0].onde}`);
      for (const t of [m.text_body ?? '', ...botoes]) for (const g of t.matchAll(/\/go\/([^/?#\s"'<>]+)/gi)) slugs.add(decodeURIComponent(g[1]));
    }
    add('b1', `mensagens enviadas em 24 h com URL fora do padrão (texto/botão) — de ${msgs.length}`, ruins.length, ruins.length === 0, String(ruins.length), ruins);
    const lista = [...slugs];
    let goRuins: string[] = [];
    if (lista.length) {
      const rs = await sql<{ slug: string; rede: string; url: string; pend: boolean }[]>`SELECT o.slug::text slug, n.slug rede, o.affiliate_url url, o.affiliate_link_pending pend FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.slug = any(${lista})`;
      const por = new Map(rs.map((r) => [r.slug.toLowerCase(), r]));
      goRuins = lista.filter((s) => { const r = por.get(s.toLowerCase()); return r && (r.pend || !ehLinkAfiliadoValido(r.url, r.rede, cfg)); });
    }
    add('b2', `ofertas citadas por /go nas mensagens de 24 h cujo link HOJE não é válido — de ${lista.length}`, goRuins.length, goRuins.length === 0, String(goRuins.length), goRuins);
    add('b3', 'mensagens de 24 h sem URL do botão gravada (anteriores a esta regra; botão deduzido do offerSlug)', semBotaoAuditado, true, String(semBotaoAuditado), [], true);
    const [bl] = await sql<{ n: string }[]>`SELECT count(*)::text n FROM link_afiliado_bloqueios WHERE criado_em > now() - interval '24 hours'`;
    add('b4', 'envios/cliques BARRADOS pelo porteiro nas últimas 24 h (o porteiro funcionando)', Number(bl.n), true, bl.n, [], true);

    // (c) amostra do front
    if (!SEM_FRONT) {
      const paginas = ['/', '/ofertas', '/jogos', '/mercado'];
      const ruinsFront: string[] = [];
      let lidas = 0;
      for (const p of paginas) {
        try {
          const r = await fetch(BASE + p, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'egeek86-medidor-links/1' } });
          if (r.status !== 200) continue;
          const html = await r.text();
          lidas++;
          for (const h of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
            const url = h[1].replace(/&amp;/g, '&');
            let host = '';
            try { host = new URL(url).hostname; } catch { continue; }
            const rede = redeDoHost(host);
            if (rede && !ehLinkAfiliadoValido(url, rede, cfg)) ruinsFront.push(`${p}:${host}`);
          }
        } catch { /* página indisponível: não conta como leitura */ }
      }
      add('c1', `hrefs externos de loja sem a marca do dono na amostra de ${lidas}/${paginas.length} páginas do site`, ruinsFront.length, ruinsFront.length === 0 && lidas > 0, lidas === 0 ? 'nao_medido' : String(ruinsFront.length), ruinsFront);
    }
  } finally {
    await sql.end();
  }
  const falhas = inds.filter((i) => !i.ok);
  if (JSON_OUT) console.log(JSON.stringify({ inds, falhas: falhas.length }, null, 2));
  else {
    for (const i of inds) console.log(`${i.ok ? (i.info ? 'INFO' : 'OK  ') : 'FALHA'} ${i.id} ${i.nome}: ${i.valor}${i.amostra?.length ? `  [${i.amostra.join(' | ')}]` : ''}`);
    console.log(falhas.length ? `\n${falhas.length} INVARIANTE(S) EM FALHA` : '\nTodos os invariantes de link de afiliado OK');
  }
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
