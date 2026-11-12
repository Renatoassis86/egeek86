/*
 * COLETA ASSISTIDA DA AMAZON (loop da aba logada do dono). SEM prompt, SEM credencial no arquivo. Reconstrução em código versionado do loop antigo (window.__AMZ4).
 * Contrato real: src/app/api/ingest/amazon-assistida/route.ts + src/server/collector/amazon-assisted.ts + src/lib/affiliate/amazon-identity.ts (AmzCand).
 *
 * Como iniciar (aba logada em https://www.amazon.com.br; o token vem de fora e fica só na closure desta execução, nunca em localStorage):
 *   window.__AMZA_CFG = { api: 'https://www.egeek86.com', token: '...', enviar: false, lote: 10 };
 *   fetch('https://www.egeek86.com/loops/amazon-assistida.js').then(r => r.text()).then(eval);
 *   (opcionais: modos ['refresh','discover'], vertical 'games'..., pausaMs [4000,9000], cicloMin 120, idleMin 10)
 * Acompanhar: JSON.stringify(window.__amza.status()) (nunca contém o token). Parar: window.__amza.stop(). Reinjetar substitui o loop vivo.
 *
 * Fluxo: GET fila (mode=refresh e mode=discover; foto da fila no começo do ciclo, porque a fila se reordena a cada gravação) -> para cada item
 *   busca na Amazon (fetch same-origin do HTML de /s?k=) -> parser puro -> POST { rows:[{id, r:[{a,t,p,l,s,i}]}], round } -> o servidor responde
 *   stats.paginas_pendentes [{id,a}] (patrocinados que seriam aceitos): abre /dp/ASIN, lê o preço DA PÁGINA e reenvia { a,t,p,l,s:1,pg:1,i }.
 *   O servidor carimba o horário (now()) e registra collector_runs; o cliente não manda carimbo.
 * REGRA DO DONO: NENHUM LOOP PARA. Rede/5xx/429/captcha/login/token/origem/layout viram pausa com recuo (teto 30 min) e retomada sozinha;
 *   exceção no ciclo é registrada e o loop segue; só window.__amza.stop() do operador para. Nada é inventado: sem preço lido, sem candidato.
 * NÃO HÁ batimento próprio: o POST de cada lote já grava collector_runs ('amazon-assistida'), que é o sinal que o servidor usa (> 90 min sem lote).
 */
(function () {
  'use strict';
  var VERSAO = '1.0.0';

  // =====================================================================================================================
  // LÓGICA PURA (sem DOM, sem rede): testada em scripts/test-amazon-assistida.ts
  // =====================================================================================================================
  var PURO = {};
  var ASIN_RE = /^[A-Z0-9]{10}$/;
  var UUID_RE = /^[0-9a-f-]{36}$/i;
  var AMZ_IMG_RE = /^https:\/\/m\.media-amazon\.com\/images\/[A-Za-z0-9_\-\/.%+,]{6,200}$/;
  var MAX_ROWS = 40, MAX_CANDS = 10, MAX_BODY = 400000;

  PURO.decodificar = function (s) {
    return String(s || '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&#(\d+);/g, function (_m, n) { return String.fromCharCode(+n); }).replace(/ /g, ' ');
  };
  PURO.textoDe = function (html) {
    return PURO.decodificar(String(html || '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  };

  /** "R$ 1.299,90" (com nbsp/espaços) -> "R$ 1.299,90" normalizado; null se não houver valor. Mesmo formato que o servidor lê em parseBrl. */
  PURO.normalizarPreco = function (t) {
    var m = /R\$\s*(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})/.exec(PURO.decodificar(t));
    return m ? 'R$ ' + m[1] + ',' + m[2] : null;
  };
  /** Espelho de parseBrl do servidor (centavos). */
  PURO.parseBrl = function (p) {
    if (!p) return null;
    var v = Number(String(p).replace(/[^\d,]/g, '').replace(',', '.'));
    return isFinite(v) && v > 0 ? Math.round(v * 100) : null;
  };

  /** Pares (classe, texto) dos <span class="a-price ..."><span class="a-offscreen">R$ ..</span>: preço atual (sem a-text-price) e preço de lista (a-text-price). */
  PURO.precosDe = function (html) {
    var re = /<span[^>]*\bclass="(a-price(?:\s[^"]*)?)"[^>]*>\s*<span[^>]*\bclass="a-offscreen"[^>]*>([^<]*)<\/span>/g, m, p = null, l = null;
    while ((m = re.exec(html))) {
      var preco = PURO.normalizarPreco(m[2]);
      if (!preco) continue;
      if (/\ba-text-price\b/.test(m[1])) { if (!l) l = preco; } else if (!p) p = preco;
    }
    return { p: p, l: l };
  };

  var NENHUM_RESULTADO = /nenhum resultado para|n[aã]o encontr(?:amos|ou) nenhum resultado|did not match any products|sua pesquisa.{0,40}n[aã]o corresponde/i;

  /**
   * HTML da busca (/s?k=) -> { ok, candidatos:[{a,t,p,l,s,i}], motivo? }. ok=false quando não reconhece nem cards nem "nenhum resultado" (layout desconhecido
   * ou página de bloqueio): o loop NÃO envia linha vazia nesse caso (marcaria a busca como sem_match por engano). Candidato sem preço e não patrocinado é omitido
   * (o servidor o recusaria como sem_preco). Patrocinado vai com p null: o servidor ignora o preço do card e devolve paginas_pendentes se valer a pena.
   */
  PURO.parseBusca = function (html) {
    html = String(html || '');
    if (!html) return { ok: false, candidatos: [], motivo: 'html_vazio' };
    var tagRe = /<div\b[^>]*\bdata-component-type="s-search-result"[^>]*>/g, m, marcas = [];
    while ((m = tagRe.exec(html))) marcas.push({ idx: m.index, tag: m[0] });
    var out = [], vistos = {};
    for (var i = 0; i < marcas.length; i++) {
      var tag = marcas[i].tag, chunk = html.slice(marcas[i].idx, i + 1 < marcas.length ? marcas[i + 1].idx : html.length);
      var am = /\bdata-asin="([A-Z0-9]{10})"/.exec(tag);
      if (!am || vistos[am[1]]) continue;
      var h2 = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/i.exec(chunk);
      var titulo = h2 ? PURO.textoDe(h2[2]) : '';
      if (!titulo && h2) { var al = /aria-label="([^"]*)"/.exec(h2[1]); titulo = al ? PURO.textoDe(al[1]) : ''; }
      if (!titulo) continue;
      var patro = /puis-sponsored-label|s-sponsored-label|\bAdHolder\b|\/sspa\/click|>\s*Patrocinado\s*</i.test(chunk) || /\bAdHolder\b/.test(tag);
      var pr = PURO.precosDe(chunk);
      if (!patro && !pr.p) continue;
      var im = /<img\b[^>]*\bclass="[^"]*\bs-image\b[^"]*"[^>]*\bsrc="([^"]+)"/.exec(chunk) || /<img\b[^>]*\bsrc="([^"]+)"[^>]*\bclass="[^"]*\bs-image\b/.exec(chunk);
      var img = im && AMZ_IMG_RE.test(PURO.decodificar(im[1])) ? PURO.decodificar(im[1]) : null;
      vistos[am[1]] = 1;
      var c = { a: am[1], t: titulo.slice(0, 300), p: patro ? null : pr.p, l: patro ? null : pr.l, s: patro ? 1 : 0 };
      if (img) c.i = img;
      out.push(c);
      if (out.length >= MAX_CANDS) break;
    }
    if (marcas.length) return { ok: true, candidatos: out, cartoes: marcas.length };
    if (NENHUM_RESULTADO.test(PURO.textoDe(html).slice(0, 20000))) return { ok: true, candidatos: [], cartoes: 0, semResultados: true };
    return { ok: false, candidatos: [], motivo: 'layout_desconhecido' };
  };

  /** HTML da página /dp/ASIN -> { ok, p, l } | { ok:false, motivo }. O preço vem SÓ do bloco de preço do produto (nunca de recomendados). */
  PURO.parsePagina = function (html, asin) {
    html = String(html || '');
    if (!html) return { ok: false, motivo: 'html_vazio' };
    var A = String(asin);
    var confere = new RegExp('(?:id="ASIN"|name="ASIN")[^>]*value="' + A + '"|value="' + A + '"[^>]*(?:id="ASIN"|name="ASIN")|rel="canonical"[^>]*\\/dp\\/' + A + '|\\/dp\\/' + A + '[^>]*rel="canonical"|data-asin="' + A + '"', 'i');
    if (!confere.test(html)) return { ok: false, motivo: 'asin_diferente_ou_nao_confirmado' };
    var ini = -1, ids = ['id="corePrice_feature_div"', 'id="corePriceDisplay_desktop_feature_div"', 'id="apex_desktop"'];
    for (var i = 0; i < ids.length; i++) { var k = html.indexOf(ids[i]); if (k >= 0 && (ini < 0 || k < ini)) ini = k; }
    if (ini < 0) return { ok: false, motivo: 'sem_bloco_de_preco' };
    // até o próximo bloco irmão (id="..._feature_div" ou "similar"/"sims"/"sp_detail"), para nunca ler preço de recomendados
    var resto = html.slice(ini + 10, ini + 4000), fim = resto.search(/id="[^"]*(?:_feature_div|similar|sims|sp_detail|carousel)[^"]*"/i);
    var pr = PURO.precosDe(html.slice(ini, fim >= 0 ? ini + 10 + fim : ini + 4000));
    if (!pr.p) return { ok: false, motivo: 'sem_preco' };
    return { ok: true, p: pr.p, l: pr.l };
  };

  /** Candidato reenviado após a página: { a,t,p,l,s:1,pg:1,i } (contrato AmzCand). */
  PURO.candidatoDePagina = function (cand, pagina) {
    var c = { a: cand.a, t: cand.t, p: pagina.p, l: pagina.l || null, s: 1, pg: 1 };
    if (cand.i) c.i = cand.i;
    return c;
  };

  PURO.montarUrlBusca = function (q) { return '/s?k=' + encodeURIComponent(String(q || '').trim()).replace(/%20/g, '+'); };

  /**
   * Valida/saneia as linhas contra o contrato da rota: <= 40 linhas, id UUID, r array, <= 10 candidatos por linha, a=ASIN, t texto 1..300,
   * p com valor BRL (obrigatório, exceto patrocinado sem pg), s 0/1, pg só 1 e só com p, i só CDN da Amazon. Corpo <= 400 KB.
   * Devolve { rows, descartes:[motivo] }; linha ou candidato inválido é descartado, nunca "consertado" com dado inventado.
   */
  PURO.validarPayload = function (rows) {
    var ok = [], desc = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r || typeof r.id !== 'string' || !UUID_RE.test(r.id) || !Array.isArray(r.r)) { desc.push('linha_invalida'); return; }
      var cs = [];
      r.r.slice(0, MAX_CANDS).forEach(function (c) {
        if (!c || typeof c.a !== 'string' || !ASIN_RE.test(c.a)) { desc.push('asin_invalido'); return; }
        var t = typeof c.t === 'string' ? c.t.trim().slice(0, 300) : '';
        if (!t) { desc.push('titulo_vazio'); return; }
        var s = c.s ? 1 : 0, pg = c.pg === 1 ? 1 : 0;
        var p = typeof c.p === 'string' && PURO.parseBrl(c.p) ? c.p : null;
        if (pg && !s) { desc.push('pg_sem_patrocinado'); return; }
        if (pg && !p) { desc.push('pg_sem_preco'); return; }
        if (!p && !(s && !pg)) { desc.push('sem_preco'); return; }
        var o = { a: c.a, t: t, p: p, l: typeof c.l === 'string' && PURO.parseBrl(c.l) ? c.l : null, s: s };
        if (pg) o.pg = 1;
        if (typeof c.i === 'string' && AMZ_IMG_RE.test(c.i)) o.i = c.i;
        cs.push(o);
      });
      var linha = { id: r.id, r: cs };
      if (typeof r.q === 'string') linha.q = r.q.slice(0, 300);
      ok.push(linha);
    });
    if (ok.length > MAX_ROWS) { desc.push('linhas_alem_do_teto'); ok = ok.slice(0, MAX_ROWS); }
    return { rows: ok, descartes: desc };
  };
  PURO.tamanhoOk = function (corpo) { return String(corpo).length <= MAX_BODY; };

  /** Lê paginas_pendentes da resposta do POST: [{id,a}] saneado (<= 40). */
  PURO.paginasPendentes = function (resp) {
    var l = resp && resp.stats && Array.isArray(resp.stats.paginas_pendentes) ? resp.stats.paginas_pendentes : [];
    var vistos = {}, out = [];
    l.forEach(function (x) {
      if (!x || !UUID_RE.test(String(x.id)) || !ASIN_RE.test(String(x.a)) || vistos[x.id + x.a]) return;
      vistos[x.id + x.a] = 1; out.push({ id: x.id, a: x.a });
    });
    return out.slice(0, 40);
  };

  /** Bloqueio -> 'captcha' | 'login' | 'http_403' | 'http_429' | 'http_503' | 'amazon_5xx' | null. Login por texto só vale sem cards/preço. */
  PURO.detectarBloqueio = function (o) {
    o = o || {};
    if (o.status === 429) return 'http_429';
    if (o.status === 403) return 'http_403';
    if (o.status === 503) return 'http_503';
    if (o.status >= 500) return 'amazon_5xx';
    var p = String(o.pathname || '');
    if (/validatecaptcha|\/errors\/|captcha/i.test(p)) return 'captcha';
    if (/\/ap\/signin|\/ap\/|\/login/i.test(p)) return 'login';
    var t = String(o.texto || '').slice(0, 4000);
    if (/digite os caracteres|n[aã]o sou um rob[oô]|verifique que voc[eê] [eé] humano|robot check|verifica[cç][aã]o de seguran[cç]a/i.test(t)) return 'captcha';
    if (!o.temConteudo && /fazer login|entrar na sua conta|fa[cç]a login|identifique-se/i.test(t)) return 'login';
    return null;
  };

  // REGRA DO DONO: NENHUM LOOP PARA. Todo problema vira PAUSA com recuo (teto 30 min); a n-ésima ocorrência seguida avança na tabela.
  var RECUO = {
    captcha: [15, 30], login: [15, 30], http_403: [15, 30], http_429: [15, 30], http_503: [10, 20, 30], amazon_5xx: [2, 5, 10, 20, 30],
    token_recusado: [15, 30], origem_recusada: [15, 30], servidor_desligado: [10, 20, 30], servidor_instavel: [2, 5, 10, 20, 30],
    rede: [1, 2, 5, 10, 20, 30], layout: [5, 15, 30],
  };
  /** Política: pausa (min) para a n-ésima ocorrência seguida; respeita Retry-After (segundos) mas nunca passa de 30 min. NUNCA devolve 'parar'. */
  PURO.politica = function (tipo, seguidos, retryAfterS) {
    var rec = RECUO[tipo] || [5, 15, 30];
    var min = rec[Math.min(Math.max(1, seguidos | 0), rec.length) - 1];
    if (retryAfterS > 0) min = Math.max(min, Math.ceil(retryAfterS / 60));
    return { acao: 'pausar', motivo: String(tipo), min: Math.min(30, min) };
  };
  PURO.parseRetryAfter = function (v) {
    if (v == null || v === '') return 0;
    var n = Number(v);
    if (isFinite(n)) return Math.max(0, n);
    var d = Date.parse(v);
    return isFinite(d) ? Math.max(0, Math.round((d - Date.now()) / 1000)) : 0;
  };
  /** Pausa entre buscas: aleatória em [a,b] ms, nunca abaixo do piso; `cadenciaS` do servidor (se vier) sobe o piso. */
  PURO.pausaEntreItens = function (faixa, rnd, piso, cadenciaS) {
    var p = Math.max(piso || 0, cadenciaS > 0 ? cadenciaS * 1000 : 0);
    var a = Math.max(p, faixa[0]), b = Math.max(a, faixa[1]);
    return Math.round(a + (rnd == null ? Math.random() : rnd) * (b - a));
  };
  PURO.tipoServidor = function (status, erroCodigo) {
    if (status === 401) return 'token_recusado';
    if (status === 403) return 'origem_recusada';
    if (status === 429) return 'http_429';
    if (status === 503) return erroCodigo === 'desligado' || !erroCodigo ? 'servidor_desligado' : 'servidor_instavel';
    return 'servidor_instavel';
  };

  var MODOS = { refresh: 1, discover: 1, queue: 1, vitrine: 1 }; // vitrine = opt-in (modos:['refresh','discover','vitrine'])
  var VERTICAIS = /^[a-z0-9_-]{2,30}$/;
  /** Valida a configuração injetada sem devolver o token em mensagem. */
  PURO.validarCfg = function (c, host) {
    if (!c || typeof c !== 'object') return { ok: false, erro: 'window.__AMZA_CFG ausente' };
    if (!/(^|\.)amazon\.com\.br$/.test(String(host))) return { ok: false, erro: 'a aba precisa estar em amazon.com.br' };
    var api = String(c.api || '').replace(/\/+$/, '');
    if (!/^https:\/\/[^/\s]+$/.test(api)) return { ok: false, erro: 'api deve ser https://dominio (sem caminho)' };
    if (typeof c.token !== 'string' || c.token.length < 32) return { ok: false, erro: 'token ausente ou curto' };
    var faixa = Array.isArray(c.pausaMs) && c.pausaMs.length === 2 ? [+c.pausaMs[0] || 4000, +c.pausaMs[1] || 9000] : [4000, 9000];
    var modos = (Array.isArray(c.modos) ? c.modos : ['refresh', 'discover']).filter(function (m) { return MODOS[m]; });
    if (!modos.length) modos = ['refresh', 'discover'];
    return {
      ok: true,
      cfg: {
        api: api, enviar: c.enviar === true, lote: Math.min(MAX_ROWS, Math.max(1, +c.lote || 10)), pausaMs: faixa, modos: modos,
        vertical: typeof c.vertical === 'string' && VERTICAIS.test(c.vertical) ? c.vertical : null,
        cicloMin: Math.max(5, +c.cicloMin || 120), idleMs: Math.max(1, +c.idleMin || 10) * 60000,
      },
      token: c.token,
    };
  };

  var PISO_PAUSA_MS = 4000;

  // Ambiente de teste (node): expõe só a lógica pura.
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURO; return; }

  // =====================================================================================================================
  // LOOP NO NAVEGADOR
  // =====================================================================================================================
  if (window.__amza && typeof window.__amza.stop === 'function') { try { window.__amza.stop('substituido'); } catch (e) { /* ok */ } }

  var entrada = window.__AMZA_CFG;
  try { delete window.__AMZA_CFG; } catch (e) { window.__AMZA_CFG = undefined; } // o token não fica exposto na window
  var v = PURO.validarCfg(entrada, location.hostname);
  if (!v.ok) { window.__amza = { rodando: false, erro: v.erro, status: function () { return { running: false, erro: v.erro }; }, stop: function () {} }; return; }
  var CFG = v.cfg;
  var TOKEN = v.token; // só na closure
  v = null; entrada = null;

  var S = {
    versao: VERSAO, running: true, stopped: null, enviar: CFG.enviar, iniciadoEm: new Date().toISOString(), relogio: 'setTimeout',
    cycle: 0, cycleStart: null, modo: null, done: 0, total: 0, posted: 0, errs: 0, redeRetry: 0, lastOk: null,
    buscas: 0, semResultados: 0, paginasLidas: 0, descartes: 0, enviosFalhos: 0, excecoes: 0,
    pausa: null, seguidos: {}, cadenciaS: 0, erros: [], linhas: [], ultimaAmostra: null, stats: {}, legadoAMZ4: false,
  };
  var parado = false;

  function agora() { return new Date().toISOString(); }
  function erro(msg) { S.errs++; S.erros.push({ t: agora(), msg: String(msg).slice(0, 200) }); if (S.erros.length > 20) S.erros.shift(); }
  function linha(o) { o.t = agora(); S.linhas.push(o); if (S.linhas.length > 30) S.linhas.shift(); }

  // ----- relógio: Web Worker evita o throttling de aba em segundo plano; sem permissão (CSP), setTimeout comum -----
  var worker = null, workerOk = false, esperas = {}, esperaSeq = 0;
  try {
    var src = 'self.onmessage=function(e){var d=e.data;setTimeout(function(){self.postMessage(d.id)},d.ms)}';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = function (e) { var f = esperas[e.data]; if (f) { delete esperas[e.data]; f(); } };
    worker.onerror = function () { workerOk = false; };
    var pingId = ++esperaSeq;
    esperas[pingId] = function () { workerOk = true; S.relogio = 'worker'; };
    worker.postMessage({ id: pingId, ms: 20 });
  } catch (e) { worker = null; }
  function sleep(ms) {
    return new Promise(function (resolve) {
      if (worker && workerOk) {
        var id = ++esperaSeq, fim = false;
        esperas[id] = function () { if (!fim) { fim = true; resolve(); } };
        worker.postMessage({ id: id, ms: ms });
        setTimeout(function () { if (!fim) { fim = true; delete esperas[id]; resolve(); } }, ms + 15000); // se o worker morrer, o setTimeout destrava
      } else setTimeout(resolve, ms);
    });
  }
  /** Dorme em fatias para o stop() do operador ser atendido logo. */
  async function dormir(ms) { var fim = Date.now() + ms; while (!parado && Date.now() < fim) await sleep(Math.min(15000, Math.max(250, fim - Date.now()))); }

  // ----- rede -----
  function comTimeout(ms) { var c = new AbortController(); var t = setTimeout(function () { c.abort(); }, ms); return { signal: c.signal, fim: function () { clearTimeout(t); } }; }
  async function servidor(caminho, opts) {
    var to = comTimeout(30000);
    try {
      var h = { Authorization: 'Bearer ' + TOKEN };
      if (opts && opts.body) h['Content-Type'] = 'application/json';
      return await fetch(CFG.api + caminho, { method: (opts && opts.method) || 'GET', headers: h, body: opts && opts.body, signal: to.signal });
    } finally { to.fim(); }
  }
  async function amazon(caminho) {
    var to = comTimeout(30000);
    try { return await fetch(caminho, { credentials: 'include', headers: { Accept: 'text/html' }, redirect: 'follow', signal: to.signal }); }
    finally { to.fim(); }
  }
  /** GET na Amazon -> { html } | { falha, det, retryAfter }. Bloqueio/erro HTTP viram falha com tipo da política. */
  async function lerAmazon(caminho) {
    var r;
    try { r = await amazon(caminho); } catch (e) { S.redeRetry++; return { falha: 'rede', det: 'amazon: ' + e.message }; }
    var pathname = ''; try { pathname = new URL(r.url).pathname; } catch (e) { /* ok */ }
    var html = r.status === 200 ? await r.text().catch(function () { return ''; }) : '';
    var tipo = PURO.detectarBloqueio({ status: r.status, pathname: pathname, texto: html ? PURO.textoDe(html.slice(0, 40000)) : '', temConteudo: /data-component-type="s-search-result"|id="productTitle"/.test(html) });
    if (tipo) return { falha: tipo, det: 'amazon ' + r.status + ' ' + pathname, retryAfter: PURO.parseRetryAfter(r.headers.get('retry-after')) };
    if (r.status !== 200) return { falha: 'amazon_5xx', det: 'amazon respondeu ' + r.status };
    return { html: html };
  }

  /** Repete `op` até dar certo: cada falha vira pausa com recuo (nunca desiste); só o stop() do operador interrompe (devolve null). */
  async function persistir(op, rotulo) {
    while (!parado) {
      var r;
      try { r = await op(); } catch (e) { r = { falha: 'rede', det: String(e && e.message) }; S.redeRetry++; }
      if (!r || !r.falha) { return r; }
      if (r.nao_repetir) return r;
      S.seguidos[r.falha] = (S.seguidos[r.falha] || 0) + 1;
      var p = PURO.politica(r.falha, S.seguidos[r.falha], r.retryAfter);
      erro(rotulo + ' ' + r.falha + (r.det ? ': ' + r.det : ''));
      S.pausa = { ate: new Date(Date.now() + p.min * 60000).toISOString(), motivo: p.motivo, min: p.min, seguidos: S.seguidos[r.falha] };
      await dormir(p.min * 60000);
      S.pausa = null;
    }
    return null;
  }
  function sucesso() { S.seguidos = {}; S.lastOk = agora(); }

  // ----- fila (foto no início do ciclo) -----
  async function baixarFila(modo) {
    var itens = [], total = null, off = 0, vistos = {};
    while (!parado) {
      var r = await persistir(async function () {
        var resp = await servidor('/api/ingest/amazon-assistida?mode=' + modo + '&offset=' + off + '&n=200' + (CFG.vertical ? '&vertical=' + CFG.vertical : ''));
        if (!resp.ok) { var j0 = await resp.json().catch(function () { return {}; }); return { falha: PURO.tipoServidor(resp.status, j0 && j0.error), det: 'fila ' + modo + ' respondeu ' + resp.status, retryAfter: PURO.parseRetryAfter(resp.headers.get('retry-after')) }; }
        var j = await resp.json().catch(function () { return null; });
        if (!j || !Array.isArray(j.items)) return { falha: 'servidor_instavel', det: 'fila ilegível' };
        return { j: j };
      }, 'fila ' + modo);
      if (!r) break;
      sucesso();
      var j = r.j;
      if (typeof j.cadencia_s === 'number' && j.cadencia_s > 0) S.cadenciaS = Math.min(120, j.cadencia_s); // campo opcional: a rota atual não envia
      if (total == null) total = Number(j.total) || 0;
      var novos = 0;
      j.items.forEach(function (it) {
        if (it && typeof it.id === 'string' && UUID_RE.test(it.id) && typeof it.q === 'string' && it.q.trim() && !vistos[it.id]) { vistos[it.id] = 1; itens.push({ id: it.id, q: it.q, modo: modo }); novos++; }
      });
      off += j.items.length;
      if (!j.items.length || !novos || off >= total) break;
    }
    return itens;
  }

  // ----- busca e páginas -----
  /** Uma busca. Devolve { row } | { pular: motivo } | { falha ... } (a falha é tratada por persistir). */
  async function buscar(item) {
    var r = await lerAmazon(PURO.montarUrlBusca(item.q));
    if (r.falha) return r;
    var pb = PURO.parseBusca(r.html);
    if (!pb.ok) {
      S.seguidos.layout = (S.seguidos.layout || 0) + 1;
      item.layoutFalhas = (item.layoutFalhas || 0) + 1;
      if (item.layoutFalhas > 3) { S.seguidos.layout = 0; return { nao_repetir: true, pular: pb.motivo + '_apos_3_pausas' }; } // item teimoso: segue para o próximo
      if (S.seguidos.layout >= 4) return { falha: 'layout', det: 'busca sem cards reconhecíveis (' + pb.motivo + ') ' + S.seguidos.layout + 'x seguidas' }; // provável bloqueio/mudança de layout: pausa e tenta de novo
      return { nao_repetir: true, pular: pb.motivo };
    }
    delete S.seguidos.layout;
    return { row: { id: item.id, q: item.q, r: pb.candidatos }, semResultados: !!pb.semResultados };
  }
  async function lerPagina(asin) {
    var r = await lerAmazon('/dp/' + encodeURIComponent(asin));
    if (r.falha) return r;
    return { pag: PURO.parsePagina(r.html, asin) };
  }

  // ----- envio -----
  async function postar(rows, round) {
    var v = PURO.validarPayload(rows);
    v.descartes.forEach(function (d) { S.descartes++; linha({ descarte: d }); });
    if (!v.rows.length) return { resp: null };
    var corpo = JSON.stringify({ rows: v.rows, round: round });
    if (!PURO.tamanhoOk(corpo)) { // corpo grande: divide ao meio (nunca perde linha)
      if (v.rows.length === 1) { erro('linha acima de 400 KB descartada'); return { resp: null }; }
      var m = Math.ceil(v.rows.length / 2);
      var a = await postar(v.rows.slice(0, m), round), b = await postar(v.rows.slice(m), round);
      return { resp: a.resp || b.resp, extras: [a.resp, b.resp] };
    }
    if (!CFG.enviar) {
      var cands = 0; v.rows.forEach(function (r) { cands += r.r.length; });
      S.ultimaAmostra = v.rows.slice(0, 3);
      linha({ simulacao: true, linhas: v.rows.length, candidatos: cands, patrocinados: v.rows.reduce(function (n, r) { return n + r.r.filter(function (c) { return c.s; }).length; }, 0) });
      return { resp: null, simulado: true };
    }
    var res = await persistir(async function () {
      var p = await servidor('/api/ingest/amazon-assistida', { method: 'POST', body: corpo });
      if (p.ok) return { j: await p.json().catch(function () { return {}; }) };
      var j0 = await p.json().catch(function () { return {}; });
      if (p.status === 400 || p.status === 413) return { falha: 'x', nao_repetir: true, det: 'rejeitado ' + p.status + ' ' + (j0 && j0.error) , descartar: true };
      return { falha: PURO.tipoServidor(p.status, j0 && j0.error), det: 'envio respondeu ' + p.status, retryAfter: PURO.parseRetryAfter(p.headers.get('retry-after')) };
    }, 'envio');
    if (!res) return { resp: null };
    if (res.descartar) { S.enviosFalhos++; erro(res.det); return { resp: null }; }
    sucesso();
    S.posted += v.rows.length;
    var st = res.j && res.j.stats;
    if (st) S.stats = { aceitos: st.aceitos, novos: st.novos, atualizados: st.atualizados, rejeitados: st.rejeitados, sem_candidato: st.sem_candidato, fronteira: st.fronteira, paginas_pendentes: (st.paginas_pendentes || []).length };
    linha({ enviado: v.rows.length, stats: S.stats });
    return { resp: res.j, rows: v.rows };
  }

  /** Patrocinados pendentes: abre /dp/ASIN, lê o preço da página e reenvia com pg=1 (uma única vez; a resposta desse reenvio não gera nova volta). */
  async function resolverPaginas(pend, rowsEnviadas, round) {
    var porId = {}; rowsEnviadas.forEach(function (r) { porId[r.id] = r; });
    var novas = {}, n = 0;
    for (var i = 0; i < pend.length && !parado; i++) {
      var row = porId[pend[i].id], cand = row && row.r.filter(function (c) { return c.a === pend[i].a && c.s; })[0];
      if (!cand) continue;
      if (n++ > 0) await dormir(PURO.pausaEntreItens(CFG.pausaMs, null, PISO_PAUSA_MS, S.cadenciaS));
      var lp = await persistir(function () { return lerPagina(pend[i].a); }, 'pagina ' + pend[i].a);
      if (!lp) break;
      sucesso();
      S.paginasLidas++;
      if (lp.pag && lp.pag.ok) (novas[pend[i].id] = novas[pend[i].id] || []).push(PURO.candidatoDePagina(cand, lp.pag));
      else linha({ pagina: pend[i].a, descartado: lp.pag && lp.pag.motivo });
    }
    var rows = Object.keys(novas).map(function (id) { return { id: id, q: porId[id].q, r: novas[id] }; });
    if (rows.length && !parado) await postar(rows, round + '-pg');
  }

  async function enviarLote(batch, round) {
    if (!batch.length) return;
    var r = await postar(batch, round);
    var pend = PURO.paginasPendentes(r.resp);
    if (pend.length && r.rows) await resolverPaginas(pend, r.rows, round);
  }

  // ----- ciclo -----
  async function umCiclo() {
    S.cycle++; S.cycleStart = agora(); S.done = 0; S.total = 0;
    var todos = [];
    for (var m = 0; m < CFG.modos.length && !parado; m++) { S.modo = 'fila:' + CFG.modos[m]; todos = todos.concat(await baixarFila(CFG.modos[m])); }
    var vistoCiclo = {}; todos = todos.filter(function (it) { if (vistoCiclo[it.id]) return false; vistoCiclo[it.id] = 1; return true; });
    S.total = todos.length;
    var batch = [], modoLote = null;
    for (var i = 0; i < todos.length && !parado; i++) {
      var it = todos[i];
      S.modo = it.modo;
      var b = await persistir(function () { return buscar(it); }, 'busca');
      if (!b) break;
      S.buscas++;
      if (b.row) { sucesso(); if (b.semResultados) S.semResultados++; batch.push(b.row); modoLote = it.modo; }
      else { erro('busca ' + it.id.slice(0, 8) + ' pulada: ' + b.pular); }
      S.done = i + 1;
      if (batch.length >= CFG.lote) { var b1 = batch; batch = []; await enviarLote(b1, 'amza-c' + S.cycle + '-' + modoLote); }
      if (i < todos.length - 1) await dormir(PURO.pausaEntreItens(CFG.pausaMs, null, PISO_PAUSA_MS, S.cadenciaS));
    }
    if (batch.length && !parado) await enviarLote(batch, 'amza-c' + S.cycle + '-' + modoLote);
    S.modo = null;
  }

  async function principal() {
    while (!parado) {
      var ini = Date.now();
      try { await umCiclo(); }
      catch (e) { S.excecoes++; erro('ciclo: ' + (e && e.message)); await dormir(60000); } // exceção: registra e segue
      if (parado) return;
      var espera = S.total === 0 ? CFG.idleMs : Math.max(60000, CFG.cicloMin * 60000 - (Date.now() - ini));
      S.proximoCicloEm = new Date(Date.now() + espera).toISOString();
      await dormir(espera);
      S.proximoCicloEm = null;
    }
  }

  // ----- API pública na window (sem token) -----
  function status() {
    S.legadoAMZ4 = !!(window.__AMZ4 && window.__AMZ4.running);
    return JSON.parse(JSON.stringify({
      versao: S.versao, running: S.running, stopped: S.stopped, enviar: S.enviar, relogio: S.relogio, iniciadoEm: S.iniciadoEm,
      cycle: S.cycle, cycleStart: S.cycleStart, modo: S.modo, done: S.done, total: S.total, posted: S.posted, errs: S.errs, redeRetry: S.redeRetry, lastOk: S.lastOk,
      buscas: S.buscas, semResultados: S.semResultados, paginasLidas: S.paginasLidas, descartes: S.descartes, enviosFalhos: S.enviosFalhos, excecoes: S.excecoes,
      pausa: S.pausa, seguidos: S.seguidos, cadenciaS: S.cadenciaS, proximoCicloEm: S.proximoCicloEm || null, stats: S.stats,
      legadoAMZ4: S.legadoAMZ4, erros: S.erros.slice(-8), linhas: S.linhas.slice(-12), ultimaAmostra: S.ultimaAmostra,
    }));
  }
  function stop(motivo) {
    if (parado) return;
    parado = true; S.running = false; S.stopped = { em: agora(), motivo: motivo || 'operador' };
    try { if (worker) worker.terminate(); } catch (e) { /* ok */ }
  }
  window.__amza = { status: status, stop: stop, running: true, versao: VERSAO };

  // defesa final: principal já captura as exceções do ciclo; se algo ainda escapar, registra e reinicia em 60 s (só o stop() do operador encerra)
  function arrancar() {
    principal().catch(function (e) { S.excecoes++; erro('principal: ' + (e && e.message)); }).then(function () { if (!parado) setTimeout(arrancar, 60000); });
  }
  arrancar();
})();
