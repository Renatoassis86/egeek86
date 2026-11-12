/*
 * LOOP DE PROMOÇÕES DA AMAZON (modo 'promocoes' da aba Amazon) para a aba logada do dono. SÓ LEITURA. SEM prompt, SEM credencial no arquivo.
 * Percorre as páginas de promoção por tema (https://www.amazon.com.br/promotion/psp/<ID>), lê regra, validade e os ASINs listados e envia a
 * POST /api/ingest/amazon-promocoes. O servidor decide o que vira cupom (src/lib/coupons/amazon-promocoes.ts): a aba só informa o que leu.
 *
 * Como iniciar (token vem de fora e fica só na closure; nunca em localStorage):
 *   1. Aba logada em https://www.amazon.com.br (use a aba da Amazon que já roda os outros loops; este loop NÃO navega nem recarrega a aba:
 *      lê cada página num iframe oculto de mesma origem, como o cupons-24h.js).
 *   2. Injetar window.__PROMO_CFG = { api: 'https://www.egeek86.com', token: '...', enviar: true|false }
 *      (opcionais: pausaMs:[min,max] entre páginas, cicloMin (pausa entre varreduras, padrão 30), maxPaginas (padrão 60), extras:['A123...'] IDs de promoção).
 *   3. Injetar este arquivo inteiro (ele apaga window.__PROMO_CFG, guarda o token só na closure e devolve na hora).
 *   4. Acompanhar: JSON.stringify(window.__promo.status())  (nunca contém o token).  Parar: window.__promo.stop().
 *   Com enviar:false o loop só lê e mostra em status().linhas e window.__promo.simulacao() (simulação). Reinjetar sobre um loop vivo o substitui. Recarregar a aba o mata.
 *
 * NUNCA para sozinho (regra do dono, 2026-11-12): captcha/login/403/429/rede/token/exceção viram pausa com recuo (teto 30 min) e retomada automática
 * (nunca contorna); só window.__promo.stop() do operador para. Cada varredura e cada pausa mandam batimento a /api/ingest/cupons-heartbeat?rede=amazon
 * (versao 'promocoes-...'); o servidor avisa a equipe se a rede ficar mais de 60 min sem batimento ok.
 * Descoberta das páginas: links /promotion/psp/<ID> em /blackfriday e /blackfriday/2/ (a vitrine "Cupons em destaque só no app").
 */
(function () {
  'use strict';
  var VERSAO = 'promocoes-1.0.0';

  // =====================================================================================================================
  // LÓGICA PURA (sem DOM, sem rede): testada em scripts/test-amazon-promocoes.ts
  // =====================================================================================================================
  var PURO = {};

  /** IDs de promoção (/promotion/psp/<ID>) no HTML de uma página da Amazon, sem repetição, na ordem em que aparecem. */
  PURO.idsDePromocao = function (html) {
    var out = [], visto = {}, re = /promotion\/psp\/([A-Z0-9]{8,20})/g, m;
    while ((m = re.exec(String(html || '')))) { if (!visto[m[1]]) { visto[m[1]] = 1; out.push(m[1]); } }
    return out;
  };

  /** Título que NUNCA gera cupom para todos (Prime, compre N, seguir a loja): o loop manda só o cabeçalho e o servidor fecha o que houver. */
  PURO.tituloRestrito = function (titulo, banner) {
    var t = (String(titulo || '') + ' ' + String(banner || '').slice(0, 140)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/\bseguir\b|\bprime\b/.test(t)) return true;
    var q = /\b(?:compre|leve)\s+(\d+)\b(?!\s*%)/.exec(t) || /\bem\s+(\d+)\s+(?:item|itens|produtos?|bebidas?|livros?|unidades?|pecas?|artigos?)\b/.exec(t);
    return !!(q && +q[1] >= 2);
  };

  /** "431,06" a partir de whole/fraction do preço da Amazon ("1.234" + "56"). */
  PURO.precoDe = function (whole, fraction) {
    var w = String(whole || '').replace(/\D/g, ''), f = String(fraction || '').replace(/\D/g, '');
    if (!w) return null;
    return w + ',' + (f.length === 2 ? f : (f + '00').slice(0, 2));
  };

  /** Bloqueio -> 'captcha' | 'login' | 'http_403' | 'http_429' | null. Texto de login só vale sem cards lidos. */
  PURO.detectarBloqueio = function (o) {
    o = o || {};
    if (o.status === 429) return 'http_429';
    if (o.status === 403) return 'http_403';
    var p = String(o.pathname || '');
    if (/validatecaptcha|\/errors\/|captcha/i.test(p)) return 'captcha';
    if (/\/ap\/signin|\/ap\/|\/buyer\/login|\/login/i.test(p)) return 'login';
    var t = String(o.texto || '').slice(0, 3000);
    if (/digite os caracteres|n[aã]o sou um rob[oô]|verifique que voc[eê] [eé] humano|verifica[cç][aã]o de seguran[cç]a|robot check/i.test(t)) return 'captcha';
    if (!o.temCards && /fazer login|entrar na sua conta|fa[cç]a login|identifique-se/i.test(t)) return 'login';
    return null;
  };

  var RECUO = {
    captcha: [15, 30], http_403: [15, 30], http_429: [15, 30], login: [15, 30],
    token_recusado: [15, 30], origem_recusada: [15, 30],
    servidor_desligado: [10, 20, 30], servidor_instavel: [2, 5, 10, 20, 30],
  };
  /** n-ésima ocorrência seguida do mesmo problema -> pausa com recuo (min, teto 30). Nunca devolve 'parar'. */
  PURO.politica = function (tipo, seguidos) {
    var rec = RECUO[tipo] || [5, 15, 30];
    return { acao: 'pausar', motivo: String(tipo), min: rec[Math.min(Math.max(1, seguidos | 0), rec.length) - 1] };
  };

  PURO.pausaEntre = function (faixa, rnd, piso) {
    var a = Math.max(piso, faixa[0]), b = Math.max(a, faixa[1]);
    return Math.round(a + (rnd == null ? Math.random() : rnd) * (b - a));
  };

  PURO.validarCfg = function (c, host) {
    if (!c || typeof c !== 'object') return { ok: false, erro: 'window.__PROMO_CFG ausente' };
    if (!/(^|\.)amazon\.com\.br$/.test(host)) return { ok: false, erro: 'a aba precisa estar em amazon.com.br' };
    var api = String(c.api || '').replace(/\/+$/, '');
    if (!/^https:\/\/[^/\s]+$/.test(api)) return { ok: false, erro: 'api deve ser https://dominio (sem caminho)' };
    if (typeof c.token !== 'string' || c.token.length < 32) return { ok: false, erro: 'token ausente ou curto' };
    var faixa = Array.isArray(c.pausaMs) && c.pausaMs.length === 2 ? [+c.pausaMs[0] || 6000, +c.pausaMs[1] || 11000] : [6000, 11000];
    var extras = (Array.isArray(c.extras) ? c.extras : []).filter(function (x) { return /^[A-Z0-9]{8,20}$/.test(String(x)); });
    return {
      ok: true,
      cfg: { api: api, enviar: c.enviar === true, pausaMs: faixa, cicloMs: Math.max(5, +c.cicloMin || 30) * 60000, maxPaginas: Math.min(120, Math.max(1, +c.maxPaginas || 60)), extras: extras },
      token: c.token,
    };
  };

  var PISO_PAUSA_MS = 4000;

  if (typeof module !== 'undefined' && module.exports) { module.exports = PURO; return; }

  // =====================================================================================================================
  // LOOP NO NAVEGADOR
  // =====================================================================================================================
  if (window.__promo && typeof window.__promo.stop === 'function') { try { window.__promo.stop('substituido'); } catch (e) { /* ok */ } }

  var entrada = window.__PROMO_CFG;
  try { delete window.__PROMO_CFG; } catch (e) { window.__PROMO_CFG = undefined; }
  var v = PURO.validarCfg(entrada, location.hostname);
  if (!v.ok) { window.__promo = { rodando: false, erro: v.erro, status: function () { return { rodando: false, erro: v.erro }; }, stop: function () {} }; return; }
  var CFG = v.cfg;
  var TOKEN = v.token; // só na closure
  v = null; entrada = null;

  var S = {
    versao: VERSAO, rodando: true, enviar: CFG.enviar, iniciadoEm: new Date().toISOString(), ciclos: 0, ciclo: null, ultimoCiclo: null,
    pausa: null, parou: null, proximoEm: null, seguidos: {}, erros: [], linhas: [], ids: [], sim: [], batimento: { okEm: null, falhas: 0, ultimoStatus: null },
    totais: { paginas: 0, itens: 0, casados: 0, novosAsins: 0, restritas: 0, descartadas: 0, erros: 0, fechados: 0 },
  };
  var timer = null, parado = false, frameAtual = null;

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function agora() { return new Date().toISOString(); }
  function erro(msg) { S.totais.erros++; S.erros.push({ t: agora(), msg: String(msg).slice(0, 200) }); if (S.erros.length > 20) S.erros.shift(); }
  function linha(o) { o.t = agora(); S.linhas.push(o); if (S.linhas.length > 40) S.linhas.shift(); }
  var limpa = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };

  // ----- servidor -----
  function comTimeout(ms) { var c = new AbortController(); var t = setTimeout(function () { c.abort(); }, ms); return { signal: c.signal, fim: function () { clearTimeout(t); } }; }
  async function api(caminho, opts) {
    var to = comTimeout(30000);
    try {
      var h = { Authorization: 'Bearer ' + TOKEN };
      if (opts && opts.body) h['Content-Type'] = 'application/json';
      return await fetch(CFG.api + caminho, { method: (opts && opts.method) || 'GET', headers: h, body: opts && opts.body, signal: to.signal });
    } finally { to.fim(); }
  }
  function tipoServidor(status) {
    if (status === 401) return 'token_recusado';
    if (status === 403) return 'origem_recusada';
    if (status === 503) return 'servidor_desligado';
    return 'servidor_instavel';
  }
  async function batimento(estado, motivo) {
    var c = S.ciclo || S.ultimoCiclo || {};
    var corpo = { estado: estado, motivo: motivo || undefined, ciclo: S.ciclos, fila: c.paginas || 0, lidas: c.itens || 0, enviadas: c.casados || 0, descartadas: c.descartadas || 0, erros: c.erros || 0, versao: VERSAO };
    try {
      var r = await api('/api/ingest/cupons-heartbeat?rede=amazon', { method: 'POST', body: JSON.stringify(corpo) });
      S.batimento.ultimoStatus = r.status;
      if (r.ok) { if (estado === 'ok') S.batimento.okEm = agora(); } else S.batimento.falhas++;
    } catch (e) { S.batimento.falhas++; S.batimento.ultimoStatus = 'rede'; }
  }

  // ----- leitura da página (iframe oculto de mesma origem) -----
  function novoFrame(url) {
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none';
    f.src = url;
    document.body.appendChild(f);
    frameAtual = f;
    return f;
  }
  function fecharFrame(f) { try { if (f && f.parentNode) f.parentNode.removeChild(f); } catch (e) { /* ok */ } if (frameAtual === f) frameAtual = null; }
  function docDe(f) { try { return f.contentDocument && f.contentDocument.body ? f.contentDocument : null; } catch (e) { return null; } }

  /** Cards da promoção: ASIN do link /dp/, título, preço atual (a-price-whole/fraction) e preço anterior ("De"). Ignora o carrinho e a barra de navegação. */
  function lerCards(doc) {
    var vistos = {}, cards = [];
    doc.querySelectorAll('a[href*="/dp/"]').forEach(function (a) {
      if (a.closest('.ewc-item,#nav-flyout-ewc,#nav-cart,#navbar')) return;
      var m = /\/dp\/([A-Z0-9]{10})/.exec(a.pathname);
      if (!m || vistos[m[1]]) return;
      var c = a;
      for (var i = 0; i < 10 && c; i++, c = c.parentElement) { if (c.querySelector('.a-price-whole') && c.innerText.length > 40) break; }
      if (!c) return;
      vistos[m[1]] = 1;
      var w = c.querySelector('.a-price-whole'), f = c.querySelector('.a-price-fraction');
      var t = limpa(c.innerText);
      // preço anterior: "R$ 13,90 ... R$ 19,90" -> segundo valor com vírgula (R$ x,xx) depois do preço atual
      var valores = t.match(/R\$\s*\d[\d.]*,\d{2}/g) || [];
      var preco = PURO.precoDe(w && w.textContent, f && f.textContent);
      var l = null;
      for (var k = 0; k < valores.length; k++) { var cand = valores[k].replace(/R\$\s*/, ''); if (cand !== preco) { l = cand; break; } }
      cards.push({ a: m[1], t: t.slice(0, 140), p: preco, l: l });
    });
    return cards;
  }

  /** Banner (título + "De ... até ...") e termos da promoção. Os termos ficam no popover "Ver os termos": lê o que já está na página e, se faltar, abre o popover (só leitura). */
  async function lerCabecalho(doc, win) {
    var titulo = limpa(doc.title).replace(/^Amazon\.com\.br:\s*/i, '').replace(/\s+promoção$/i, '');
    var b = doc.querySelector('.topBanner_gridItem');
    var banner = b ? limpa(b.textContent).replace(/\.[\w-]+\s*\{[^}]*\}/g, '').trim() : '';
    function acharTermos() {
      var out = '';
      doc.querySelectorAll('.a-popover-preload,[id*="popover"],.a-popover').forEach(function (e) {
        var t = limpa(e.textContent);
        if (!out && /^Termos da promo/i.test(t) && t.length < 6000) out = t;
      });
      return out;
    }
    var termos = acharTermos();
    if (!termos) {
      var el = [].filter.call(doc.querySelectorAll('a,span,button'), function (e) { return /^Ver os termos$/i.test(limpa(e.innerText)); })[0];
      if (el) { try { (el.closest('a') || el).click(); } catch (e) { /* ok */ } await sleep(1500); termos = acharTermos(); }
    }
    return { titulo: titulo, banner: banner.slice(0, 600), termos: termos.slice(0, 2500) };
  }

  /** Uma página de promoção. Devolve { ok, promo, itens } | { bloqueio } | { descarte }. */
  async function lerPromocao(id) {
    var f = novoFrame('/promotion/psp/' + encodeURIComponent(id));
    try {
      var t0 = Date.now(), ant = -1, estavel = 0, doc = null, win = null, n = 0;
      while (Date.now() - t0 < 30000 && !parado) {
        await sleep(1000);
        doc = docDe(f);
        if (!doc) continue;
        win = f.contentWindow;
        var loc = ''; try { loc = win.location.pathname; } catch (e) { /* ok */ }
        n = doc.querySelectorAll('a[href*="/dp/"]').length;
        var bl = PURO.detectarBloqueio({ pathname: loc, texto: doc.body ? doc.body.innerText : '', temCards: n > 0 });
        if (bl) return { bloqueio: bl };
        if (!/\/promotion\/psp\//.test(loc)) return { descarte: 'redirecionada:' + loc.slice(0, 40) };
        try { win.scrollBy(0, 1800); } catch (e) { /* ok */ }
        estavel = n === ant ? estavel + 1 : 0; ant = n;
        if (n > 0 && estavel >= 3) break;
        if (n === 0 && Date.now() - t0 > 12000 && doc.querySelector('.topBanner_gridItem')) break; // promoção sem cards (encerrada)
      }
      if (!doc) return { descarte: 'nao_renderizou' };
      var cab = await lerCabecalho(doc, win);
      if (!cab.titulo || !cab.banner) return { descarte: 'sem_cabecalho' };
      var restrito = PURO.tituloRestrito(cab.titulo, cab.banner);
      var itens = restrito ? [] : lerCards(doc).slice(0, 300);
      return { ok: true, promo: { id: id, titulo: cab.titulo, banner: cab.banner, termos: cab.termos }, itens: itens, restrito: restrito };
    } finally { fecharFrame(f); }
  }

  async function descobrirIds() {
    var ids = [], visto = {};
    function add(x) { if (!visto[x]) { visto[x] = 1; ids.push(x); } }
    var bloqueio = null;
    for (var p of ['/blackfriday', '/blackfriday/2/']) {
      try {
        var r = await fetch(p, { credentials: 'include' });
        if (r.status === 429 || r.status === 403) { bloqueio = 'http_' + r.status; break; }
        if (r.status === 200) {
          var html = await r.text();
          var rb = PURO.detectarBloqueio({ pathname: new URL(r.url).pathname, texto: html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '), temCards: /promotion\/psp\//.test(html) });
          if (rb) { bloqueio = rb; break; }
          PURO.idsDePromocao(html).forEach(add);
        }
      } catch (e) { erro('descobrir ' + p + ': ' + e.message); }
      await sleep(1500);
    }
    CFG.extras.forEach(add);
    return { ids: ids, bloqueio: bloqueio };
  }

  // ----- ciclo -----
  async function pausarOuParar(tipo, detalhe) {
    S.seguidos[tipo] = (S.seguidos[tipo] || 0) + 1;
    var p = PURO.politica(tipo, S.seguidos[tipo]);
    if (detalhe) erro(tipo + ': ' + detalhe);
    S.pausa = { ate: new Date(Date.now() + p.min * 60000).toISOString(), motivo: p.motivo, min: p.min, seguidos: S.seguidos[tipo] };
    await batimento('pausado', p.motivo);
    agendar(p.min * 60000);
  }

  async function enviar(res, c) {
    // até 100 cards por chamada (o servidor grava um a um; lotes pequenos poupam o banco); sem cards (restrita) vai uma chamada só com o cabeçalho
    var partes = [];
    for (var k = 0; k < Math.max(1, res.itens.length); k += 100) partes.push(res.itens.slice(k, k + 100));
    for (var q = 0; q < partes.length; q++) {
      var parcial = { promo: res.promo, itens: partes[q], restrito: res.restrito };
      if (await enviarParte(parcial, c) === 'parar') return 'parar';
    }
    return 'ok';
  }

  async function enviarParte(res, c) {
    var corpo = { lidos_em: agora(), promo: res.promo, itens: res.itens };
    if (!CFG.enviar) { S.sim.push(corpo); if (S.sim.length > 80) S.sim.shift(); linha({ simulacao: true, promo: res.promo.id, titulo: res.promo.titulo.slice(0, 60), itens: res.itens.length, restrito: res.restrito }); return 'ok'; }
    try {
      var r = await api('/api/ingest/amazon-promocoes', { method: 'POST', body: JSON.stringify(corpo) });
      if (!r.ok) { await pausarOuParar(tipoServidor(r.status), 'envio respondeu ' + r.status); return 'parar'; }
      var j = await r.json().catch(function () { return {}; });
      c.casados += j.casados || 0; c.novosAsins += j.total_asins_novos || 0; c.fechados += j.fechados || 0;
      if (j.motivo && /^restrita/.test(j.motivo)) c.restritas++;
      linha({ promo: res.promo.id, titulo: res.promo.titulo.slice(0, 60), itens: res.itens.length, casados: j.casados, novos: j.total_asins_novos, naoCasa: j.preco_nao_casa, motivo: j.motivo || null, fechados: j.fechados || 0 });
    } catch (e) { await pausarOuParar('servidor_instavel', 'envio: ' + e.message); return 'parar'; }
    return 'ok';
  }

  async function ciclo() {
    var t0 = Date.now();
    S.pausa = null;
    var c = S.ciclo = { n: S.ciclos + 1, inicio: agora(), paginas: 0, itens: 0, casados: 0, novosAsins: 0, restritas: 0, fechados: 0, descartadas: 0, erros: 0 };
    var d = await descobrirIds();
    if (d.bloqueio) return pausarOuParar(d.bloqueio, 'descoberta das promoções');
    S.ids = d.ids;
    if (!d.ids.length) { c.descartadas++; await batimento('ok', 'sem_promocoes_descobertas'); S.ciclos = c.n; S.ultimoCiclo = c; S.ciclo = null; return agendar(CFG.cicloMs); }
    var lista = d.ids.slice(0, CFG.maxPaginas);
    for (var i = 0; i < lista.length && !parado; i++) {
      var res;
      try { res = await lerPromocao(lista[i]); }
      catch (e) { c.erros++; erro('promo ' + lista[i] + ': ' + e.message); res = null; }
      if (res && res.bloqueio) return pausarOuParar(res.bloqueio, 'promoção ' + lista[i]);
      if (res && res.ok) {
        c.paginas++; c.itens += res.itens.length;
        if (await enviar(res, c) === 'parar') return;
      } else if (res) { c.descartadas++; linha({ promo: lista[i], descartado: res.descarte || 'sem_leitura' }); }
      if (i % 12 === 11) await batimento('ok', 'em_andamento'); // batimento durante a varredura longa
      if (i < lista.length - 1) await sleep(PURO.pausaEntre(CFG.pausaMs, null, PISO_PAUSA_MS));
    }
    if (parado) return;
    S.seguidos = {};
    S.totais.paginas += c.paginas; S.totais.itens += c.itens; S.totais.casados += c.casados; S.totais.novosAsins += c.novosAsins;
    S.totais.restritas += c.restritas; S.totais.descartadas += c.descartadas; S.totais.fechados += c.fechados;
    S.ciclos = c.n; c.fim = agora(); c.duracaoS = Math.round((Date.now() - t0) / 1000);
    S.ultimoCiclo = c; S.ciclo = null;
    await batimento('ok', null);
    agendar(CFG.cicloMs);
  }

  function agendar(ms) {
    if (parado || !S.rodando) return;
    clearTimeout(timer);
    S.proximoEm = new Date(Date.now() + ms).toISOString();
    timer = setTimeout(function () {
      S.proximoEm = null;
      ciclo().catch(function (e) { erro('ciclo: ' + e.message); return pausarOuParar('servidor_instavel', 'exceção no ciclo'); }).catch(function (e2) { erro('recuperação: ' + (e2 && e2.message)); agendar(15 * 60000); });
    }, ms);
  }

  function status() {
    return JSON.parse(JSON.stringify({
      versao: S.versao, rodando: S.rodando, enviar: S.enviar, iniciadoEm: S.iniciadoEm, ciclos: S.ciclos, ciclo: S.ciclo, ultimoCiclo: S.ultimoCiclo,
      pausa: S.pausa, parou: S.parou, proximoEm: S.proximoEm, batimento: S.batimento, totais: S.totais, seguidos: S.seguidos, promocoes: S.ids.length,
      erros: S.erros.slice(-8), linhas: S.linhas.slice(-12),
    }));
  }
  function stop(motivo) {
    if (parado) return;
    parado = true; clearTimeout(timer);
    S.rodando = false; S.proximoEm = null; S.parou = { em: agora(), motivo: motivo || 'operador' };
    fecharFrame(frameAtual);
    if (S.parou.motivo === 'operador') { batimento('parado', 'operador'); }
  }
  // simulação (enviar:false): o que SERIA enviado, para conferir antes de ligar (nunca contém token)
  function simulacao() { return JSON.parse(JSON.stringify(S.sim)); }
  window.__promo = { status: status, stop: stop, simulacao: simulacao, rodando: true, versao: VERSAO };

  batimento('ok', 'iniciado').finally(function () { agendar(2000); });
})();
