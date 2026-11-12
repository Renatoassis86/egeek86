/*
 * LOOP DE LINKS meli.la (Mercado Livre) PELA INTERFACE do Gerador de links de afiliado. SEM prompt, SEM credencial no arquivo.
 * Substitui o antigo window.__MLB (que parava por rede e deixava itens com falha travando a cabeça da fila).
 *
 * Como iniciar (aba LOGADA em https://www.mercadolivre.com.br/afiliados/linkbuilder; manter aberta, de preferência em janela própria):
 *   1. Chamada 1 (o token vem do ambiente do operador, fica só na memória; nunca em arquivo/localStorage/log):
 *        window.__MLL_CFG = { api: 'https://SITE', token: '...', enviar: false };      // comece em simulação
 *      opcionais: lote (20..40, padrão 25), pausaMs ([3500, 7000], piso 3000), idleMin (10), itemTimeoutS (30)
 *   2. Chamada 2: o conteúdo inteiro deste arquivo. Ele apaga window.__MLL_CFG, guarda o token só na closure e devolve na hora.
 *   3. Acompanhar: JSON.stringify(window.__mll.status())  (nunca contém o token).  Parar: window.__mll.stop().
 *   Simulação (enviar:false): gera os links de UM lote e para ('simulacao_concluida'); mostra em status().linhas, não grava nada.
 *   Depois de conferir os links, reinjetar com enviar:true para gravar e seguir até zerar a fila.
 *
 * Por item: digita a URL na textarea (setter nativo + evento input), clica "Gerar", espera o resultado, lê o link curto
 * https://meli.la/XXXX e valida ^https://meli.la/[A-Za-z0-9]{4,20}$. O aviso "Este produto não cumpre com os requisitos" vira skip
 * 'nao_elegivel'. Skips ficam retidos até o item seguinte funcionar (se a interface falhar 3 vezes seguidas, NADA é registrado como falha).
 * Erro de rede/500/429 do servidor => recuo exponencial (1, 2, 5, 10, 20 min) e retoma sozinho; NUNCA para por rede. Para só em
 * login/captcha (no site) e em token/origem recusados (401/403). Sem Web Worker (CSP) cai para setTimeout comum.
 */
(function () {
  'use strict';
  var VERSAO = '1.0.0';

  // =====================================================================================================================
  // LÓGICA PURA (sem DOM, sem rede): testada em scripts/test-ml-links-ui.ts
  // =====================================================================================================================
  var PURO = {};
  var LINK_RE = /^https:\/\/meli\.la\/[A-Za-z0-9]{4,20}$/;

  /** Primeiro link curto meli.la dentro de um texto; null se não houver ou se não passar na validação. */
  PURO.extrairLink = function (texto) {
    var m = /https:\/\/meli\.la\/[A-Za-z0-9]{4,20}(?![A-Za-z0-9])/.exec(String(texto || ''));
    return m && LINK_RE.test(m[0]) ? m[0] : null;
  };
  PURO.linkValido = function (l) { return LINK_RE.test(String(l || '')); };

  /** Aviso de produto não elegível exibido pelo gerador. */
  PURO.ehNaoElegivel = function (texto) {
    return /n[aã]o cumpre com os requisitos/i.test(String(texto || ''));
  };

  /** Aviso de limite/erro do próprio gerador (não é falha do item). */
  PURO.ehErroTransitorio = function (texto) {
    return /muitas (solicita|tentativas)|tente novamente|algo deu errado|erro ao gerar|servi[cç]o indispon/i.test(String(texto || ''));
  };

  /** Bloqueio do site: 'login' | 'captcha' | null. */
  PURO.detectarBloqueio = function (o) {
    o = o || {};
    var p = String(o.pathname || ''), t = String(o.texto || '').slice(0, 4000);
    if (/captcha|\/gz\/account-verification|\/security/i.test(p) || /n[aã]o sou um rob[oô]|verifique que voc[eê] [eé] humano|captcha/i.test(t)) return 'captcha';
    if (/\/login|\/jms\/mlb\/lgz|\/registration/i.test(p)) return 'login';
    if (p.indexOf('/afiliados/linkbuilder') < 0 && p.indexOf('/afiliados') < 0) return 'saiu_do_gerador';
    return null;
  };

  var RECUO_REDE = [1, 2, 5, 10, 20];
  var RECUO_DESLIGADO = [10, 20, 40, 60];
  var RECUO_UI = [2, 5, 10, 20];

  /**
   * Política de recuo. tipo: 'rede' | 'http_5xx' | 'http_429' (recuo 1,2,5,10,20 e depois fica em 20 para sempre), 'servidor_desligado' (503),
   * 'ui_instavel' (interface do gerador sem resultado), 'token_recusado' (401) e 'origem_recusada' (403) param; login/captcha param.
   */
  PURO.politica = function (tipo, seguidos) {
    if (tipo === 'token_recusado' || tipo === 'origem_recusada' || tipo === 'login' || tipo === 'captcha' || tipo === 'saiu_do_gerador') return { acao: 'parar', motivo: tipo, min: 0 };
    var lista = tipo === 'servidor_desligado' ? RECUO_DESLIGADO : tipo === 'ui_instavel' ? RECUO_UI : RECUO_REDE;
    var i = Math.max(1, seguidos | 0);
    return { acao: 'pausar', motivo: tipo, min: lista[Math.min(i, lista.length) - 1] };
  };

  /** Status HTTP da API -> tipo de problema (ou null se ok). */
  PURO.tipoHttp = function (status) {
    if (status >= 200 && status < 300) return null;
    if (status === 401) return 'token_recusado';
    if (status === 403) return 'origem_recusada';
    if (status === 503) return 'servidor_desligado';
    return status === 429 ? 'http_429' : 'http_5xx';
  };

  /** Pausa humana entre itens: aleatória em [a, b], nunca abaixo do piso. */
  PURO.pausaEntreItens = function (faixa, rnd, piso) {
    var a = Math.max(piso, faixa[0]), b = Math.max(a, faixa[1]);
    return Math.round(a + (rnd == null ? Math.random() : rnd) * (b - a));
  };

  /** Remove da fila os ids já tratados nesta sessão (evita laço quando o servidor devolve item já enviado). */
  PURO.filtrarNovos = function (items, tratados) {
    return (items || []).filter(function (i) { return i && i.id && i.url && !tratados[i.id]; });
  };

  /** Skips só viram registro se a interface está viva: com `seguidosSemResultado` >= 3 descarta os retidos. */
  PURO.liberarSkips = function (retidos, ultimoItemOk) {
    return ultimoItemOk ? retidos.slice() : [];
  };

  /** Valida a configuração injetada sem nunca devolver o token. */
  PURO.validarCfg = function (c, host) {
    if (!c || typeof c !== 'object') return { ok: false, erro: 'window.__MLL_CFG ausente' };
    if (!/(^|\.)mercadolivre\.com\.br$/.test(host)) return { ok: false, erro: 'a aba precisa estar em mercadolivre.com.br (gerador de links)' };
    var api = String(c.api || '').replace(/\/+$/, '');
    if (!/^https:\/\/[^/\s]+$/.test(api)) return { ok: false, erro: 'api deve ser https://dominio (sem caminho)' };
    if (typeof c.token !== 'string' || c.token.length < 32) return { ok: false, erro: 'token ausente ou curto' };
    var faixa = Array.isArray(c.pausaMs) && c.pausaMs.length === 2 ? [+c.pausaMs[0] || 3500, +c.pausaMs[1] || 7000] : [3500, 7000];
    return {
      ok: true,
      cfg: {
        api: api, enviar: c.enviar === true, lote: Math.min(40, Math.max(5, +c.lote || 25)), pausaMs: faixa,
        idleMs: Math.max(1, +c.idleMin || 10) * 60000, itemTimeoutMs: Math.min(90, Math.max(10, +c.itemTimeoutS || 30)) * 1000,
      },
      token: c.token,
    };
  };

  var PISO_PAUSA_MS = 3000;

  // Ambiente de teste (node): expõe só a lógica pura.
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURO; return; }

  // =====================================================================================================================
  // LOOP NO NAVEGADOR
  // =====================================================================================================================
  if (window.__mll && typeof window.__mll.stop === 'function') { try { window.__mll.stop('substituido'); } catch (e) { /* ok */ } }

  var entrada = window.__MLL_CFG;
  try { delete window.__MLL_CFG; } catch (e) { window.__MLL_CFG = undefined; }
  var v = PURO.validarCfg(entrada, location.hostname);
  if (!v.ok) { window.__mll = { rodando: false, erro: v.erro, status: function () { return { rodando: false, erro: v.erro }; }, stop: function () {} }; return; }
  var CFG = v.cfg;
  var TOKEN = v.token; // só na closure
  v = null; entrada = null;

  var S = {
    versao: VERSAO, rodando: true, enviar: CFG.enviar, iniciadoEm: new Date().toISOString(), pausa: null, parou: null, relogio: 'setTimeout',
    seguidos: {}, pendentes: null, semUrlDeItem: null, lotes: 0,
    totais: { lidos: 0, ok: 0, enviados: 0, nao_elegivel: 0, sem_resultado: 0, erro_pagina: 0, descartados_ui: 0, erros_rede: 0 },
    erros: [], linhas: [], retomadasPorRede: 0,
  };
  var parado = false;
  var tratados = {}; // id -> 1 (nesta sessão)

  function agora() { return new Date().toISOString(); }
  function erro(msg) { S.erros.push({ t: agora(), msg: String(msg).slice(0, 200) }); if (S.erros.length > 20) S.erros.shift(); }
  function linha(o) { o.t = agora(); S.linhas.push(o); if (S.linhas.length > 30) S.linhas.shift(); }

  // ----- relógio: Web Worker evita o throttling de aba em segundo plano; sem CSP que permita, setTimeout comum -----
  var worker = null, workerOk = false, esperas = {}, esperaSeq = 0;
  try {
    var src = 'self.onmessage=function(e){var d=e.data;setTimeout(function(){self.postMessage(d.id)},d.ms)}';
    var blobUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    worker = new Worker(blobUrl);
    worker.onmessage = function (e) { var f = esperas[e.data]; if (f) { delete esperas[e.data]; f(); } };
    worker.onerror = function () { workerOk = false; };
    var pingId = ++esperaSeq;
    esperas[pingId] = function () { workerOk = true; S.relogio = 'worker'; };
    worker.postMessage({ id: pingId, ms: 20 });
  } catch (e) { worker = null; }
  function sleep(ms) {
    return new Promise(function (resolve) {
      if (worker && workerOk) {
        var id = ++esperaSeq;
        var fim = false;
        esperas[id] = function () { if (!fim) { fim = true; resolve(); } };
        worker.postMessage({ id: id, ms: ms });
        // rede de segurança: se o worker morrer, o setTimeout comum ainda destrava
        setTimeout(function () { if (!fim) { fim = true; delete esperas[id]; resolve(); } }, ms + 15000);
      } else setTimeout(resolve, ms);
    });
  }
  // dorme em fatias para o stop() responder rápido
  async function dormir(ms) {
    var fim = Date.now() + ms;
    while (!parado && Date.now() < fim) await sleep(Math.min(5000, fim - Date.now()));
  }

  // ----- servidor -----
  async function api(caminho, opts) {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, 25000);
    try {
      var h = { Authorization: 'Bearer ' + TOKEN };
      if (opts && opts.body) h['Content-Type'] = 'application/json';
      return await fetch(CFG.api + caminho, { method: (opts && opts.method) || 'GET', headers: h, body: opts && opts.body, signal: c.signal });
    } finally { clearTimeout(t); }
  }

  /** Recuo/parada para um problema. Devolve true se deve parar o loop. */
  async function problema(tipo, detalhe) {
    S.seguidos[tipo] = (S.seguidos[tipo] || 0) + 1;
    var p = PURO.politica(tipo, S.seguidos[tipo]);
    if (detalhe) erro(tipo + ': ' + detalhe);
    if (tipo === 'rede' || tipo === 'http_5xx' || tipo === 'http_429') { S.totais.erros_rede++; S.retomadasPorRede++; }
    if (p.acao === 'parar') { S.rodando = false; S.parou = { em: agora(), motivo: p.motivo }; S.pausa = null; return true; }
    S.pausa = { ate: new Date(Date.now() + p.min * 60000).toISOString(), motivo: p.motivo, min: p.min, seguidos: S.seguidos[tipo] };
    await dormir(p.min * 60000);
    S.pausa = null;
    return false;
  }
  function sucesso(tipo) { delete S.seguidos[tipo]; }

  // ----- interface do gerador -----
  var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  function areaTexto() { return document.querySelector('textarea#url-0') || document.querySelector('textarea'); }
  function botaoGerar() {
    var bs = document.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) if (bs[i].textContent.replace(/\s+/g, ' ').trim() === 'Gerar') return bs[i];
    return null;
  }
  function digitar(ta, valor) {
    ta.focus();
    setter.call(ta, valor);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }
  /** Garante o radio "Link curto" marcado (o padrão do gerador). */
  function garantirLinkCurto() {
    var ls = document.querySelectorAll('label');
    for (var i = 0; i < ls.length; i++) {
      if (/^\s*Link curto\s*$/i.test(ls[i].textContent)) {
        var inp = ls[i].querySelector('input[type=radio]') || (ls[i].htmlFor && document.getElementById(ls[i].htmlFor));
        if (inp && !inp.checked) ls[i].click();
        return true;
      }
    }
    return false;
  }
  /** Todo texto de link meli.la visível fora da textarea (inputs readonly, spans, links). */
  function linksNaPagina() {
    var achados = [];
    var ta = areaTexto();
    var els = document.querySelectorAll('input, a, span, p, div');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (ta && (el === ta || ta.contains(el))) continue;
      var t = el.tagName === 'INPUT' ? el.value : (el.children.length === 0 ? el.textContent : '');
      if (t && t.indexOf('meli.la') >= 0) { var l = PURO.extrairLink(t); if (l && achados.indexOf(l) < 0) achados.push(l); }
      if (el.tagName === 'A' && el.href && el.href.indexOf('meli.la') >= 0) { var l2 = PURO.extrairLink(el.href); if (l2 && achados.indexOf(l2) < 0) achados.push(l2); }
    }
    return achados;
  }
  function textoPagina() { return document.body ? document.body.innerText : ''; }
  function bloqueio() { return PURO.detectarBloqueio({ pathname: location.pathname, texto: textoPagina() }); }

  /** Gera o link de UMA url. Devolve { link } | { skip: motivo } | { ui: 'detalhe' } | { bloqueio }. */
  async function gerar(url) {
    var bl = bloqueio();
    if (bl) return { bloqueio: bl };
    var ta = areaTexto();
    if (!ta) return { ui: 'textarea_ausente' };
    garantirLinkCurto();
    var antes = linksNaPagina();
    var avisoAntes = PURO.ehNaoElegivel(textoPagina()), erroAntes = PURO.ehErroTransitorio(textoPagina());
    digitar(ta, url);
    var btn = null, t0 = Date.now();
    while (Date.now() - t0 < 4000) { btn = botaoGerar(); if (btn && !btn.disabled) break; await sleep(150); }
    if (!btn || btn.disabled) return { ui: 'botao_gerar_indisponivel' };
    btn.click();
    var t1 = Date.now();
    while (Date.now() - t1 < CFG.itemTimeoutMs && !parado) {
      await sleep(400);
      var bl2 = bloqueio();
      if (bl2) return { bloqueio: bl2 };
      var links = linksNaPagina();
      var novo = null;
      for (var i = 0; i < links.length; i++) if (antes.indexOf(links[i]) < 0) { novo = links[i]; break; }
      if (novo) return { link: novo };
      var txt = textoPagina();
      if (PURO.ehNaoElegivel(txt) && (!avisoAntes || Date.now() - t1 > 2500)) return { skip: 'nao_elegivel' };
      if (!erroAntes && PURO.ehErroTransitorio(txt) && Date.now() - t1 > 2500) return { ui: 'erro_do_gerador' };
    }
    return { ui: 'sem_resultado_no_prazo' };
  }

  // ----- fila e envio -----
  var buffer = { rows: [], skips: [] };

  async function enviar() {
    if (!buffer.rows.length && !buffer.skips.length) return true;
    if (!CFG.enviar) { linha({ simulacao: true, rows: buffer.rows.length, skips: buffer.skips.length }); buffer = { rows: [], skips: [] }; return true; }
    for (;;) {
      if (parado) return false;
      var r;
      try { r = await api('/api/ingest/ml-links', { method: 'POST', body: JSON.stringify({ rows: buffer.rows.slice(0, 100), skips: buffer.skips.slice(0, 100) }) }); }
      catch (e) { if (await problema('rede', 'envio: ' + e.message)) return false; continue; }
      var tp = PURO.tipoHttp(r.status);
      if (tp) { if (await problema(tp, 'envio respondeu ' + r.status)) return false; continue; }
      var j = await r.json().catch(function () { return {}; });
      sucesso('rede'); sucesso('http_5xx'); sucesso('http_429'); sucesso('servidor_desligado');
      S.totais.enviados += (j && j.gravados) || 0;
      linha({ enviado: { rows: buffer.rows.length, skips: buffer.skips.length }, resposta: { gravados: j.gravados, skips_gravados: j.skips_gravados, tabela_falhas: j.tabela_falhas } });
      buffer = { rows: buffer.rows.slice(100), skips: buffer.skips.slice(100) };
      if (!buffer.rows.length && !buffer.skips.length) return true;
    }
  }

  async function buscarFila() {
    for (;;) {
      if (parado) return null;
      var r;
      try { r = await api('/api/ingest/ml-links?n=' + CFG.lote + '&resumo=1'); }
      catch (e) { if (await problema('rede', 'fila: ' + e.message)) return null; continue; }
      var tp = PURO.tipoHttp(r.status);
      if (tp) { if (await problema(tp, 'fila respondeu ' + r.status)) return null; continue; }
      var j = await r.json().catch(function () { return null; });
      if (!j || !Array.isArray(j.items)) { if (await problema('http_5xx', 'fila ilegível')) return null; continue; }
      sucesso('rede'); sucesso('http_5xx'); sucesso('http_429'); sucesso('servidor_desligado');
      S.pendentes = j.pendentes; S.semUrlDeItem = j.sem_url_de_item; S.resumoFila = j.resumo || null;
      return j.items;
    }
  }

  async function lote() {
    var items = await buscarFila();
    if (items === null) return 'fim';
    var novos = PURO.filtrarNovos(items, tratados);
    if (!novos.length) {
      if (!CFG.enviar) return 'fim';
      linha({ fila: items.length, novos: 0 });
      await dormir(CFG.idleMs); // fila vazia (ou só itens já tratados): espera
      return 'segue';
    }
    S.lotes++;
    var retidos = [];       // skips aguardando o próximo item funcionar
    var semResultadoSeguidos = 0;
    for (var i = 0; i < novos.length && !parado; i++) {
      var it = novos[i], res;
      try { res = await gerar(it.url); } catch (e) { res = { ui: 'excecao:' + e.message }; }
      S.totais.lidos++;
      if (res.bloqueio) { await enviar(); S.rodando = false; S.parou = { em: agora(), motivo: res.bloqueio }; return 'fim'; }
      if (res.link && PURO.linkValido(res.link)) {
        tratados[it.id] = 1; S.totais.ok++; semResultadoSeguidos = 0;
        buffer.rows.push({ id: it.id, link: res.link });
        buffer.skips = buffer.skips.concat(PURO.liberarSkips(retidos, true)); retidos = [];
        linha({ id: it.id, link: res.link });
      } else if (res.skip) {
        S.totais[res.skip] = (S.totais[res.skip] || 0) + 1; semResultadoSeguidos = 0;
        tratados[it.id] = 1;
        retidos.push({ id: it.id, motivo: res.skip });
        linha({ id: it.id, skip: res.skip });
      } else {
        // falha da interface/sem resultado: pode ser o item OU o gerador. Retém como sem_resultado; descarta se a interface estiver instável.
        semResultadoSeguidos++;
        tratados[it.id] = 1;
        retidos.push({ id: it.id, motivo: 'sem_resultado' });
        S.totais.sem_resultado++;
        linha({ id: it.id, ui: res.ui });
        if (semResultadoSeguidos >= 3) {
          S.totais.descartados_ui += retidos.length;
          retidos.forEach(function (r) { delete tratados[r.id]; }); // voltam à fila no futuro; nada é registrado como falha
          retidos = []; semResultadoSeguidos = 0;
          if (await enviar() === false) return 'fim';
          if (await problema('ui_instavel', 'gerador sem resultado 3x: ' + (res.ui || ''))) return 'fim';
          continue;
        }
      }
      if (buffer.rows.length + buffer.skips.length >= 10) { if (await enviar() === false) return 'fim'; }
      if (i < novos.length - 1) await dormir(PURO.pausaEntreItens(CFG.pausaMs, null, PISO_PAUSA_MS));
    }
    // skips retidos no fim do lote: o último item da fila não prova que a interface está viva, mas o lote teve ao menos um sucesso?
    if (retidos.length && S.totais.ok > 0 && semResultadoSeguidos === 0) buffer.skips = buffer.skips.concat(retidos);
    else retidos.forEach(function (r) { delete tratados[r.id]; });
    if (await enviar() === false) return 'fim';
    sucesso('ui_instavel');
    if (!CFG.enviar) { S.parou = { em: agora(), motivo: 'simulacao_concluida' }; S.rodando = false; return 'fim'; }
    await dormir(5000);
    return 'segue';
  }

  async function principal() {
    for (;;) {
      if (parado) break;
      var r;
      try { r = await lote(); } catch (e) { erro('lote: ' + e.message); if (await problema('http_5xx', 'exceção no lote')) break; r = 'segue'; }
      if (r === 'fim') break;
    }
    S.rodando = false; S.pausa = null;
    if (!S.parou) S.parou = { em: agora(), motivo: 'operador' };
    try { if (worker) worker.terminate(); } catch (e) { /* ok */ }
  }

  function status() {
    return JSON.parse(JSON.stringify({
      versao: S.versao, rodando: S.rodando, enviar: S.enviar, iniciadoEm: S.iniciadoEm, relogio: S.relogio, pausa: S.pausa, parou: S.parou,
      pendentes: S.pendentes, sem_url_de_item: S.semUrlDeItem, lotes: S.lotes, totais: S.totais, seguidos: S.seguidos, retomadasPorRede: S.retomadasPorRede,
      bufferNaoEnviado: { rows: buffer.rows.length, skips: buffer.skips.length }, resumoFila: S.resumoFila || null,
      erros: S.erros.slice(-8), linhas: S.linhas.slice(-12),
    }));
  }
  function stop(motivo) {
    if (parado) return;
    parado = true; S.rodando = false; S.parou = { em: agora(), motivo: motivo || 'operador' };
    try { if (worker) worker.terminate(); } catch (e) { /* ok */ }
  }
  window.__mll = { status: status, stop: stop, rodando: true, versao: VERSAO };

  // o worker confirma em ~20 ms; só então o primeiro lote (a chamada que injeta devolve na hora)
  setTimeout(function () { principal(); }, 400);
})();
