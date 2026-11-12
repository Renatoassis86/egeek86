/*
 * LOOP DE CUPOM DE ITEM do Mercado Livre (leitura da página do anúncio) para a aba logada do dono. SEM prompt, SEM credencial no arquivo.
 * Substitui o antigo window.__CPI (que parou em 'ml_http_429' e não voltava).
 *
 * Contrato real (src/app/api/ingest/cupons-revalidar e cupons-item; docs/03-metodologia/CUPOM_NA_AGULHA.md):
 *   GET  /api/ingest/cupons-revalidar?rede=mercado-livre&n=20 -> { items: [{ id, url, prioridade, motivo, ultima_leitura_min }] }
 *        (já na ordem de prioridade da agulha e SÓ com leitura devida: meta 45 min p/ prioridades 0-3; janela de frescor da agulha = 120 min)
 *   POST /api/ingest/cupons-item { rows: [{ id, coupons: [{ campaign_id?, label, status }] }] }  (coupons vazio = lido e sem cupom)
 *        o servidor só aceita rótulo com "cupom" e preço com cupom MENOR que o preço da oferta.
 *
 * Como iniciar (aba em https://www.mercadolivre.com.br, de preferência OUTRA aba que a do gerador de links; token só em memória):
 *   1. window.__MLC_CFG = { api: 'https://SITE', token: '...', enviar: false };   // comece em simulação
 *      opcionais: lote (20), pausaMs ([4000, 9000], piso 3000), idleMin (3)
 *   2. Injetar este arquivo inteiro. Ele apaga window.__MLC_CFG, guarda o token na closure e devolve na hora.
 *   3. Acompanhar: JSON.stringify(window.__mlc.status()).  Parar: window.__mlc.stop().
 *   Simulação (enviar:false): lê UM lote, mostra o que leria em status().linhas e para; não grava nada. CONFIRA os rótulos antes de enviar:true.
 *
 * Segurança da leitura: só conta "sem cupom" quando a página provou ser o anúncio certo (o itemId aparece nela) E nenhuma menção a cupom
 * ficou sem ser lida (menção a cupom que não virou "R$ x com cupom" = leitura ambígua: NADA é enviado, o item volta à fila).
 * 429 do ML => pausa longa (15, 30, 60 min; fica em 60) e retoma sozinho. 5xx do ML/servidor/rede => recuo curto. Nunca contorna captcha/login: para.
 */
(function () {
  'use strict';
  var VERSAO = '1.0.0';

  // =====================================================================================================================
  // LÓGICA PURA (sem DOM, sem rede): testada em scripts/test-ml-links-ui.ts
  // =====================================================================================================================
  var PURO = {};

  PURO.centsFrom = function (t) {
    var m = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/.exec(t || '');
    if (!m) return null;
    var dec = m[2] ? (m[2].length === 1 ? +m[2] * 10 : +m[2]) : 0;
    return +m[1].replace(/\./g, '') * 100 + dec;
  };

  PURO.itemIdDaUrl = function (url) {
    var m = /item_id(?:%3A|:|=)(MLB\d{6,})/i.exec(String(url || '')) || /(MLB-?\d{6,})/i.exec(String(url || ''));
    return m ? m[1].replace('-', '').toUpperCase() : null;
  };

  /** HTML -> texto corrido (sem script/style/tags; entidades comuns). */
  PURO.textoDoHtml = function (html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;/g, '$')
      .replace(/\s+/g, ' ');
  };

  /**
   * Lê os cupons do anúncio no HTML da página: "R$ 315,46 com Cupom" (texto visível) e, se existir logo ao lado no estado embutido
   * (JSON), o campaign_id. Devolve { cupons: [{ campaign_id?, label, status }], mencoes, lidas, ambiguo }.
   *  - mencoes: quantas vezes "cupom" aparece no texto (fora de scripts);
   *  - lidas: quantas viraram "R$ x com cupom";
   *  - ambiguo: há menção a cupom no texto mas nenhuma foi lida como preço com cupom => não afirmar "sem cupom".
   */
  PURO.extrairCupons = function (html) {
    var texto = PURO.textoDoHtml(html);
    var vistos = {}, cupons = [];
    var re = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s*com\s*cupom/gi, m;
    while ((m = re.exec(texto))) {
      var label = m[0].replace(/\s+/g, ' ').trim();
      if (vistos[label]) continue;
      vistos[label] = 1;
      cupons.push({ label: label, status: 'lido_na_pagina' });
    }
    // campaign_id: só quando o estado embutido tem um id de campanha de CUPOM perto do rótulo (PIX/outras campanhas não valem).
    var cru = String(html || '');
    cupons.forEach(function (c) {
      var preco = c.label.replace(/\s*com\s*cupom/i, '').replace(/R\$\s*/, '');
      var pos = cru.indexOf(preco);
      if (pos < 0) return;
      var janela = cru.slice(Math.max(0, pos - 800), pos + 800);
      var k = /"campaign_id"\s*:\s*"?(\d{3,12})"?/.exec(janela);
      if (k && /coupon|cupom/i.test(janela)) c.campaign_id = k[1];
    });
    var mencoes = (texto.match(/cupom|cupon/gi) || []).length;
    return { cupons: cupons, mencoes: mencoes, lidas: cupons.length, ambiguo: cupons.length === 0 && mencoes > 0 };
  };

  /** A página é do anúncio pedido? (o itemId aparece no HTML e há preço em R$) */
  PURO.paginaConfere = function (html, itemId) {
    return !!itemId && String(html || '').toUpperCase().indexOf(itemId) >= 0 && /R\$|"price"|price_/i.test(String(html || ''));
  };

  /** Resposta da página do ML -> 'ok' | 'http_429' | 'http_5xx' | 'login' | 'captcha' | 'nao_encontrada'. */
  PURO.tipoPagina = function (o) {
    o = o || {};
    if (o.status === 429) return 'http_429';
    var u = String(o.finalUrl || '');
    if (/captcha|account-verification|\/security/i.test(u)) return 'captcha';
    if (/\/login|\/jms\/mlb\/lgz|\/registration/i.test(u)) return 'login';
    if (o.status >= 500) return 'http_5xx';
    if (o.status === 404 || o.status === 410) return 'nao_encontrada';
    if (o.status === 403) return 'http_429'; // o ML responde 403 quando limita o ritmo: tratar como limite (pausa longa), nunca insistir
    if (o.status !== 200) return 'http_5xx';
    if (/n[aã]o sou um rob[oô]|captcha/i.test(String(o.texto || '').slice(0, 3000))) return 'captcha';
    return 'ok';
  };

  var RECUO = {
    http_429: [15, 30, 60],               // ML limitando: pausa longa; depois fica em 60 min para sempre
    http_5xx: [1, 2, 5, 10],              // erro do ML: recuo curto
    rede: [1, 2, 5, 10, 20],
    http_5xx_servidor: [1, 2, 5, 10, 20],
    servidor_desligado: [10, 20, 40, 60],
  };

  /** Política: tipo + seguidos => { acao, min }. Login/captcha/token/origem param; o resto recua e volta sozinho. */
  PURO.politica = function (tipo, seguidos) {
    if (tipo === 'login' || tipo === 'captcha' || tipo === 'token_recusado' || tipo === 'origem_recusada') return { acao: 'parar', motivo: tipo, min: 0 };
    var lista = RECUO[tipo] || RECUO.rede;
    return { acao: 'pausar', motivo: tipo, min: lista[Math.min(Math.max(1, seguidos | 0), lista.length) - 1] };
  };

  PURO.tipoHttp = function (status) {
    if (status >= 200 && status < 300) return null;
    if (status === 401) return 'token_recusado';
    if (status === 403) return 'origem_recusada';
    if (status === 503) return 'servidor_desligado';
    return 'http_5xx_servidor';
  };

  PURO.pausaEntreItens = function (faixa, rnd, piso) {
    var a = Math.max(piso, faixa[0]), b = Math.max(a, faixa[1]);
    return Math.round(a + (rnd == null ? Math.random() : rnd) * (b - a));
  };

  /** Mantém a ordem da fila (prioridade) e descarta o que esta sessão leu há menos de `minMin` minutos. */
  PURO.filtrarFila = function (items, lidosEm, agoraMs, minMin) {
    return (items || []).filter(function (i) { return i && i.id && i.url && !(lidosEm[i.id] && agoraMs - lidosEm[i.id] < minMin * 60000); });
  };

  PURO.validarCfg = function (c, host) {
    if (!c || typeof c !== 'object') return { ok: false, erro: 'window.__MLC_CFG ausente' };
    if (!/(^|\.)mercadolivre\.com\.br$/.test(host)) return { ok: false, erro: 'a aba precisa estar em mercadolivre.com.br' };
    var api = String(c.api || '').replace(/\/+$/, '');
    if (!/^https:\/\/[^/\s]+$/.test(api)) return { ok: false, erro: 'api deve ser https://dominio (sem caminho)' };
    if (typeof c.token !== 'string' || c.token.length < 32) return { ok: false, erro: 'token ausente ou curto' };
    var faixa = Array.isArray(c.pausaMs) && c.pausaMs.length === 2 ? [+c.pausaMs[0] || 4000, +c.pausaMs[1] || 9000] : [4000, 9000];
    return { ok: true, cfg: { api: api, enviar: c.enviar === true, lote: Math.min(40, Math.max(5, +c.lote || 20)), pausaMs: faixa, idleMs: Math.max(1, +c.idleMin || 3) * 60000 }, token: c.token };
  };

  var PISO_PAUSA_MS = 3000;
  var REL_MIN_SESSAO = 40; // não relê na mesma sessão antes de 40 min (a meta do servidor é 45)

  if (typeof module !== 'undefined' && module.exports) { module.exports = PURO; return; }

  // =====================================================================================================================
  // LOOP NO NAVEGADOR
  // =====================================================================================================================
  if (window.__mlc && typeof window.__mlc.stop === 'function') { try { window.__mlc.stop('substituido'); } catch (e) { /* ok */ } }

  var entrada = window.__MLC_CFG;
  try { delete window.__MLC_CFG; } catch (e) { window.__MLC_CFG = undefined; }
  var v = PURO.validarCfg(entrada, location.hostname);
  if (!v.ok) { window.__mlc = { rodando: false, erro: v.erro, status: function () { return { rodando: false, erro: v.erro }; }, stop: function () {} }; return; }
  var CFG = v.cfg;
  var TOKEN = v.token;
  v = null; entrada = null;

  var S = {
    versao: VERSAO, rodando: true, enviar: CFG.enviar, iniciadoEm: new Date().toISOString(), pausa: null, parou: null, relogio: 'setTimeout', seguidos: {},
    ciclos: 0, ultimoCiclo: null, totais: { fila: 0, lidos: 0, enviados: 0, comCupom: 0, ambiguos: 0, naoConfere: 0, naoEncontrada: 0, erros: 0 },
    pausasLongas: 0, erros: [], linhas: [],
  };
  var parado = false;
  var lidosEm = {};

  function agora() { return new Date().toISOString(); }
  function erro(msg) { S.totais.erros++; S.erros.push({ t: agora(), msg: String(msg).slice(0, 200) }); if (S.erros.length > 20) S.erros.shift(); }
  function linha(o) { o.t = agora(); S.linhas.push(o); if (S.linhas.length > 30) S.linhas.shift(); }

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
        setTimeout(function () { if (!fim) { fim = true; delete esperas[id]; resolve(); } }, ms + 15000);
      } else setTimeout(resolve, ms);
    });
  }
  async function dormir(ms) {
    var fim = Date.now() + ms;
    while (!parado && Date.now() < fim) await sleep(Math.min(5000, fim - Date.now()));
  }

  async function api(caminho, opts) {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, 25000);
    try {
      var h = { Authorization: 'Bearer ' + TOKEN };
      if (opts && opts.body) h['Content-Type'] = 'application/json';
      return await fetch(CFG.api + caminho, { method: (opts && opts.method) || 'GET', headers: h, body: opts && opts.body, signal: c.signal });
    } finally { clearTimeout(t); }
  }

  /** Recuo/parada. Devolve true se deve parar. */
  async function problema(tipo, detalhe) {
    S.seguidos[tipo] = (S.seguidos[tipo] || 0) + 1;
    var p = PURO.politica(tipo, S.seguidos[tipo]);
    if (detalhe) erro(tipo + ': ' + detalhe);
    if (p.acao === 'parar') { S.rodando = false; S.parou = { em: agora(), motivo: p.motivo }; S.pausa = null; return true; }
    if (tipo === 'http_429') S.pausasLongas++;
    S.pausa = { ate: new Date(Date.now() + p.min * 60000).toISOString(), motivo: p.motivo, min: p.min, seguidos: S.seguidos[tipo] };
    await dormir(p.min * 60000);
    S.pausa = null;
    return false;
  }
  function sucesso() { S.seguidos = {}; }

  async function buscarFila() {
    for (;;) {
      if (parado) return null;
      var r;
      try { r = await api('/api/ingest/cupons-revalidar?rede=mercado-livre&n=' + CFG.lote); }
      catch (e) { if (await problema('rede', 'fila: ' + e.message)) return null; continue; }
      var tp = PURO.tipoHttp(r.status);
      if (tp) { if (await problema(tp, 'fila respondeu ' + r.status)) return null; continue; }
      var j = await r.json().catch(function () { return null; });
      if (!j || !Array.isArray(j.items)) { if (await problema('http_5xx_servidor', 'fila ilegível')) return null; continue; }
      sucesso();
      return j.items;
    }
  }

  async function enviar(rows, c) {
    if (!rows.length) return true;
    if (!CFG.enviar) { linha({ simulacao: true, linhas: rows.length }); return true; }
    for (;;) {
      if (parado) return false;
      var r;
      try { r = await api('/api/ingest/cupons-item', { method: 'POST', body: JSON.stringify({ rows: rows }) }); }
      catch (e) { if (await problema('rede', 'envio: ' + e.message)) return false; continue; }
      var tp = PURO.tipoHttp(r.status);
      if (tp) { if (await problema(tp, 'envio respondeu ' + r.status)) return false; continue; }
      var j = await r.json().catch(function () { return {}; });
      sucesso();
      c.enviados += (j && j.lidas) || rows.length;
      S.totais.enviados += (j && j.lidas) || rows.length;
      linha({ enviado: rows.length, resposta: { lidas: j.lidas, com_cupom: j.com_cupom } });
      return true;
    }
  }

  /** Lê UMA página de item. Devolve { row } | { descarte } | { problema }. */
  async function lerItem(item) {
    var id = PURO.itemIdDaUrl(item.url);
    var r;
    try { r = await fetch(item.url, { credentials: 'include', redirect: 'follow' }); }
    catch (e) { return { problema: 'rede', detalhe: e.message }; }
    var html = await r.text().catch(function () { return ''; });
    var tp = PURO.tipoPagina({ status: r.status, finalUrl: r.url, texto: html.length < 3000 ? PURO.textoDoHtml(html) : '' });
    if (tp === 'nao_encontrada') { S.totais.naoEncontrada++; return { descarte: 'nao_encontrada' }; }
    if (tp !== 'ok') return { problema: tp, detalhe: 'item ' + id + ' status ' + r.status };
    if (!PURO.paginaConfere(html, id)) { S.totais.naoConfere++; return { descarte: 'pagina_nao_confere' }; }
    var x = PURO.extrairCupons(html);
    if (x.ambiguo) { S.totais.ambiguos++; return { descarte: 'ambiguo_mencao_a_cupom_sem_preco' }; }
    if (x.cupons.length) S.totais.comCupom++;
    return { row: { id: item.id, coupons: x.cupons }, cupons: x.cupons.length };
  }

  async function ciclo() {
    var items = await buscarFila();
    if (items === null) return 'fim';
    var c = { n: S.ciclos + 1, inicio: agora(), fila: 0, lidos: 0, enviados: 0, descartados: 0 };
    var novos = PURO.filtrarFila(items, lidosEm, Date.now(), REL_MIN_SESSAO);
    c.fila = novos.length; S.totais.fila += novos.length;
    if (!novos.length) {
      S.ultimoCiclo = c; S.ciclos = c.n;
      if (!CFG.enviar) { S.parou = { em: agora(), motivo: 'simulacao_concluida' }; S.rodando = false; return 'fim'; }
      await dormir(CFG.idleMs); // fila vazia: nada devido na janela de frescor
      return 'segue';
    }
    var rows = [];
    for (var i = 0; i < novos.length && !parado; i++) {
      var it = novos[i], res;
      try { res = await lerItem(it); } catch (e) { res = { problema: 'rede', detalhe: e.message }; }
      if (res.problema) {
        await enviar(rows, c); rows = [];
        if (await problema(res.problema, res.detalhe)) return 'fim';
        i--; // refaz o MESMO item depois da pausa
        continue;
      }
      sucesso();
      lidosEm[it.id] = Date.now(); S.totais.lidos++; c.lidos++;
      if (res.row) { rows.push(res.row); linha({ id: it.id, prio: it.prioridade, cupons: res.row.coupons.map(function (x) { return x.label + (x.campaign_id ? ' #' + x.campaign_id : ''); }) }); }
      else { c.descartados++; linha({ id: it.id, descartado: res.descarte }); }
      if (i < novos.length - 1) await dormir(PURO.pausaEntreItens(CFG.pausaMs, null, PISO_PAUSA_MS));
    }
    if (await enviar(rows, c) === false) return 'fim';
    c.fim = agora(); S.ultimoCiclo = c; S.ciclos = c.n;
    if (!CFG.enviar) { S.parou = { em: agora(), motivo: 'simulacao_concluida' }; S.rodando = false; return 'fim'; }
    await dormir(20000);
    return 'segue';
  }

  async function principal() {
    for (;;) {
      if (parado) break;
      var r;
      try { r = await ciclo(); } catch (e) { erro('ciclo: ' + e.message); if (await problema('rede', 'exceção no ciclo')) break; r = 'segue'; }
      if (r === 'fim') break;
    }
    S.rodando = false; S.pausa = null;
    if (!S.parou) S.parou = { em: agora(), motivo: 'operador' };
    try { if (worker) worker.terminate(); } catch (e) { /* ok */ }
  }

  function status() {
    return JSON.parse(JSON.stringify({
      versao: S.versao, rodando: S.rodando, enviar: S.enviar, iniciadoEm: S.iniciadoEm, relogio: S.relogio, pausa: S.pausa, parou: S.parou,
      ciclos: S.ciclos, ultimoCiclo: S.ultimoCiclo, totais: S.totais, seguidos: S.seguidos, pausasLongas: S.pausasLongas, erros: S.erros.slice(-8), linhas: S.linhas.slice(-12),
    }));
  }
  function stop(motivo) {
    if (parado) return;
    parado = true; S.rodando = false; S.parou = { em: agora(), motivo: motivo || 'operador' };
    try { if (worker) worker.terminate(); } catch (e) { /* ok */ }
  }
  window.__mlc = { status: status, stop: stop, rodando: true, versao: VERSAO };

  setTimeout(function () { principal(); }, 400);
})();
