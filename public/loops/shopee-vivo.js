/*
 * LOOP DA VERDADE VIVA DA SHOPEE (R-119) para a aba logada do dono. SÓ LEITURA, em ritmo baixo e humano. SEM prompt, SEM credencial no arquivo.
 * Para cada item da Shopee que VAI APARECER na vitrine de jogos (fila do servidor: GET /api/ingest/shopee-fila, só nos 14 min que antecedem cada vitrine, só os mais baratos de cada
 * plataforma), abre a página do anúncio num iframe oculto de mesma origem, lê preço de lista e disponibilidade ("Esgotado", "indisponível", estoque) e grava o resultado em
 * POST /api/ingest/disponibilidade-viva. Esgotado/indisponível expira a oferta e a põe em quarentena (esgotado_pagina); disponível carimba a leitura com o preço vivo.
 * NUNCA clica em nada, NUNCA abre mais de uma página por vez, NUNCA tenta resolver verificação anti-robô: se a Shopee mostrar verify/captcha/crawler_item o loop PARA de ler,
 * registra no servidor (a fila fecha por 90 min) e só volta quando o dono resolver na aba e o tempo passar. Leitura duvidosa NÃO grava nada (o item segue fora da vitrine).
 *
 * Como iniciar (aba em https://shopee.com.br, de preferência NÃO a do cupons-24h; token só em memória):
 *   1. window.__SHPV_CFG = { api: 'https://www.egeek86.com', token: '...', enviar: false };   // SIMULAÇÃO: lê até 3 itens da fila, mostra, não grava, para
 *      opcionais: pausaMs ([20000, 45000]), maxPorHora (70, teto 90), loteMax (8)
 *   2. Injetar este arquivo inteiro. Ele apaga window.__SHPV_CFG, guarda o token na closure e devolve na hora.
 *   3. Acompanhar: JSON.stringify(window.__shpv.status()).  Simulação: JSON.stringify(window.__shpv.simulacao()).  Parar: window.__shpv.stop().
 * NUNCA morre sozinho (regra do dono): erro/rede/token/exceção viram pausa com recuo e retomada; só stop() do operador para. Batimento por minuto em /api/ingest/loop-saude (loop 'shopee-vivo').
 */
(function () {
  'use strict';
  var VERSAO = 'shopee-vivo-1.0.0';

  // =====================================================================================================================
  // LÓGICA PURA (sem DOM, sem rede): testada em scripts/test-shopee-vivo.ts
  // =====================================================================================================================
  var PURO = {};
  var semAcento = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

  /** "1.299,90" -> 129990; "119,62" -> 11962; "119" -> 11900; inválido -> null. */
  PURO.brlCents = function (t) {
    var m = /^\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*$/.exec(String(t || ''));
    if (!m) return null;
    var dec = m[2] ? (m[2].length === 1 ? +m[2] * 10 : +m[2]) : 0;
    return +m[1].replace(/\./g, '') * 100 + dec;
  };

  /** itemId da URL da página: /product/<loja>/<item>, /product/<item> ou slug-i.<loja>.<item>. */
  PURO.itemIdDaUrl = function (u) {
    var s = String(u || '');
    var m = /-i\.(\d+)\.(\d+)(?:[/?#]|$)/.exec(s) || /\/product\/(\d+)\/(\d+)(?:[/?#]|$)/.exec(s);
    if (m) return m[2];
    m = /\/product\/(\d+)(?:[/?#]|$)/.exec(s);
    return m ? m[1] : null;
  };

  var STOP = /^(descri[cç][aã]o do produto|especifica[cç][oõ]es do produto|avalia[cç][oõ]es do produto|produtos? semelhantes?|mais produtos da loja|voc[eê] tamb[eé]m pode gostar|outros produtos|perguntas e respostas|talvez voc[eê] goste)/i;
  var PRECO_TOKEN = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g;
  var LINHA_DE_PRECO = /^[\sR$\d.,\-–—%]*(?:off|de desconto|desconto)?[\sR$\d.,\-–—%]*$/i;
  var LIXO_NA_LINHA_DE_PRECO = /frete|cashback|parcel|\bx\b|cupom|vale|compras? acima|m[ií]n|reembolso|pix|moedas/i;

  /** Texto da página (innerText) -> linhas do bloco principal do anúncio (corta nos "produtos semelhantes", descrição, avaliações...). */
  PURO.blocoPrincipal = function (texto) {
    var ls = String(texto || '').split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    var fim = ls.length;
    for (var i = 0; i < ls.length; i++) if (STOP.test(ls[i])) { fim = i; break; }
    return ls.slice(0, fim);
  };

  /** Primeiro GRUPO de preços do bloco (original riscado + atual, ou faixa de variações): o menor valor do grupo é o preço de lista vivo. */
  PURO.precoDeLista = function (linhas) {
    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i];
      if (!/R\$\s*\d/.test(l) || LIXO_NA_LINHA_DE_PRECO.test(l) || !LINHA_DE_PRECO.test(l)) continue;
      var toks = [];
      for (var j = i; j < Math.min(linhas.length, i + 4); j++) {
        var lj = linhas[j];
        if (!LINHA_DE_PRECO.test(lj) || LIXO_NA_LINHA_DE_PRECO.test(lj)) break;
        var m; PRECO_TOKEN.lastIndex = 0;
        while ((m = PRECO_TOKEN.exec(lj))) { var c = PURO.brlCents(m[1]); if (c) toks.push(c); }
      }
      if (!toks.length) continue;
      var min = Math.min.apply(null, toks), max = Math.max.apply(null, toks);
      return { precoCents: min, maxCents: max, grupo: toks.length };
    }
    return null;
  };

  /**
   * Página do anúncio -> estado. { pathname, search, texto, itemIdEsperado }.
   *   verificacao | login | item_diferente | indisponivel | esgotado | disponivel | carregando (nada conclusivo ainda)
   * Esgotado vence "Comprar agora" (padrão negado: na dúvida o item sai da vitrine; é reversível por nova leitura). Disponível exige preço E estoque/botão de compra.
   */
  PURO.analisarPagina = function (o) {
    o = o || {};
    var p = String(o.pathname || ''), q = String(o.search || ''), t = semAcento(String(o.texto || ''));
    if (/\/verify\/|captcha|anti-?bot|scene=crawler_item/.test(p + '?' + q)) return { estado: 'verificacao', motivo: 'url' };
    if (/\/buyer\/login|\/user\/login/.test(p)) return { estado: 'login' };
    if (t.length < 800 && /(verifique|verificacao de seguranca|captcha|nao sou um robo|nao e um robo|arraste|deslize para)/.test(t)) return { estado: 'verificacao', motivo: 'texto' };
    var idUrl = PURO.itemIdDaUrl(p);
    if (o.itemIdEsperado && idUrl && idUrl !== String(o.itemIdEsperado)) return { estado: 'item_diferente', motivo: 'url_com_outro_item' };
    var ls = PURO.blocoPrincipal(o.texto);
    var bloco = semAcento(ls.join('\n'));
    if (/(este produto nao esta mais disponivel|produto nao esta mais disponivel|este produto nao existe|produto nao existe|produto indisponivel|este item nao esta mais disponivel|este anuncio nao esta mais disponivel|link do produto (esta )?quebrado)/.test(t.slice(0, 4000))) return { estado: 'indisponivel', motivo: 'pagina_indisponivel' };
    if (bloco.length < 120) return { estado: 'carregando', motivo: 'bloco_curto' };
    var estoque = null, me;
    var reEst = /(\d[\d.]*)\s+(?:pecas?|unidades?|itens?)\s+disponive(?:l|is)/g;
    while ((me = reEst.exec(bloco))) estoque = +me[1].replace(/\./g, '');
    var linhasSem = ls.map(semAcento);
    var temEsgotado = linhasSem.some(function (l) { return /^((o )?(produto|item|anuncio) )?(esta )?esgotad[oa]!?$/.test(l) || /^sem estoque$/.test(l) || /^produto esgotado/.test(l); });
    var botoes = linhasSem.some(function (l) { return /^(comprar agora|adicionar ao carrinho)$/.test(l); });
    if (estoque === 0 || (temEsgotado && !(estoque > 0))) return { estado: 'esgotado', motivo: estoque === 0 ? 'estoque_zero' : 'esgotado_na_pagina' };
    var pr = PURO.precoDeLista(ls);
    if (!pr) return { estado: 'carregando', motivo: 'sem_preco' };
    if (!(estoque > 0) && !botoes) return { estado: 'carregando', motivo: 'sem_estoque_nem_botao' };
    return { estado: 'disponivel', precoCents: pr.precoCents, faixa: pr.maxCents > pr.precoCents, estoque: estoque };
  };

  /** O preço lido precisa ser coerente com o esperado (0,4x a 2,5x): barra "R$ 9,90 de frete" lido como preço, anúncio trocado, parser desalinhado. */
  PURO.precoCoerente = function (lido, esperado) {
    if (!(lido > 0) || !(esperado > 0)) return false;
    return lido >= esperado * 0.4 && lido <= esperado * 2.5;
  };

  /** Resultado final da leitura de UM item -> linha para a rota (ou null = nada a gravar: item segue NÃO verificado). */
  PURO.linhaParaGravar = function (offerId, analise, precoEsperado) {
    if (!analise) return null;
    if (analise.estado === 'esgotado') return { offer_id: offerId, disponivel: false, motivo: 'esgotado' };
    if (analise.estado === 'indisponivel') return { offer_id: offerId, disponivel: false, motivo: 'indisponivel' };
    if (analise.estado === 'disponivel' && PURO.precoCoerente(analise.precoCents, precoEsperado)) return { offer_id: offerId, disponivel: true, preco_cents: analise.precoCents };
    return null;
  };

  /** Pausa humana entre páginas (nunca abaixo do piso de 15 s). rnd em [0,1). */
  PURO.pausaEntre = function (faixa, rnd) {
    var a = Math.max(15000, +faixa[0] || 20000), b = Math.max(a, +faixa[1] || 45000);
    return Math.round(a + (rnd == null ? Math.random() : rnd) * (b - a));
  };
  /** Descanso longo depois de cada lote de páginas (2 a 4 min). */
  PURO.descansoDeLote = function (rnd) { return Math.round(120000 + (rnd == null ? Math.random() : rnd) * 120000); };

  /**
   * REGRA DE RITMO do loop. lidas = instantes (ms) das últimas leituras. Devolve { pode, esperaMs, motivo }:
   *  - nunca duas páginas em menos de 15 s; no máximo `loteMax` seguidas (depois, descanso longo); no máximo `maxPorHora` na última hora.
   */
  PURO.podeLer = function (agora, lidas, o) {
    o = o || {};
    var maxHora = Math.min(90, Math.max(1, o.maxPorHora || 70)), loteMax = Math.max(1, o.loteMax || 8);
    var hora = (lidas || []).filter(function (t) { return agora - t < 3600000; }).sort(function (a, b) { return a - b; });
    if (hora.length >= maxHora) return { pode: false, esperaMs: Math.max(60000, 3600000 - (agora - hora[0])), motivo: 'teto_por_hora' };
    var ultimo = hora.length ? hora[hora.length - 1] : 0;
    if (ultimo && agora - ultimo < 15000) return { pode: false, esperaMs: 15000 - (agora - ultimo), motivo: 'piso_entre_paginas' };
    // lote: leituras com intervalo < 6 min entre si contam como a mesma rajada
    var rajada = 0;
    for (var i = hora.length - 1; i >= 0; i--) { rajada++; if (i > 0 && hora[i] - hora[i - 1] > 360000) break; }
    if (rajada >= loteMax) { var desde = agora - ultimo; if (desde < 120000) return { pode: false, esperaMs: 120000 - desde, motivo: 'descanso_de_lote' }; }
    return { pode: true, esperaMs: 0, motivo: 'ok' };
  };

  /** Recuo (min) por tipo de problema. Verificação anti-robô: longo e crescente; NUNCA há tentativa de contornar. */
  var RECUO = { verificacao: [90, 180, 360], login: [15, 30, 60], rede: [1, 2, 5, 10, 20], http_5xx_servidor: [1, 2, 5, 10, 20], servidor_desligado: [10, 20, 30, 60],
    token_recusado: [15, 30, 60], origem_recusada: [15, 30, 60], iframe_bloqueado: [20, 40, 60], fila_fechada: [2], leituras_inuteis: [20, 40, 60] };
  PURO.politica = function (tipo, seguidos) { var l = RECUO[tipo] || RECUO.rede; return { motivo: tipo, min: l[Math.min(Math.max(1, seguidos | 0), l.length) - 1] }; };
  PURO.tipoHttp = function (status) {
    if (status >= 200 && status < 300) return null;
    if (status === 401) return 'token_recusado';
    if (status === 403) return 'origem_recusada';
    if (status === 503) return 'servidor_desligado';
    return 'http_5xx_servidor';
  };
  PURO.validarCfg = function (c, host) {
    if (!c || typeof c !== 'object') return { ok: false, erro: 'window.__SHPV_CFG ausente' };
    if (!/(^|\.)shopee\.com\.br$/.test(host)) return { ok: false, erro: 'a aba precisa estar em shopee.com.br' };
    var api = String(c.api || '').replace(/\/+$/, '');
    if (!/^https:\/\/[^/\s]+$/.test(api)) return { ok: false, erro: 'api deve ser https://dominio (sem caminho)' };
    if (typeof c.token !== 'string' || c.token.length < 32) return { ok: false, erro: 'token ausente ou curto' };
    var faixa = Array.isArray(c.pausaMs) && c.pausaMs.length === 2 ? [Math.max(15000, +c.pausaMs[0] || 20000), +c.pausaMs[1] || 45000] : [20000, 45000];
    return { ok: true, cfg: { api: api, enviar: c.enviar === true, pausaMs: faixa, maxPorHora: Math.min(90, Math.max(1, +c.maxPorHora || 70)), loteMax: Math.min(12, Math.max(1, +c.loteMax || 8)) }, token: c.token };
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = PURO; return; }

  // =====================================================================================================================
  // LOOP NO NAVEGADOR
  // =====================================================================================================================
  if (window.__shpv && typeof window.__shpv.stop === 'function') { try { window.__shpv.stop('substituido'); } catch (e) { /* ok */ } }
  var entrada = window.__SHPV_CFG;
  try { delete window.__SHPV_CFG; } catch (e) { window.__SHPV_CFG = undefined; }
  var v = PURO.validarCfg(entrada, location.hostname);
  if (!v.ok) { window.__shpv = { rodando: false, erro: v.erro, status: function () { return { rodando: false, erro: v.erro }; }, stop: function () {} }; return; }
  var CFG = v.cfg, TOKEN = v.token;
  v = null; entrada = null;

  var S = {
    versao: VERSAO, rodando: true, enviar: CFG.enviar, iniciadoEm: new Date().toISOString(), pausa: null, parou: null, proximoEm: null, seguidos: {},
    bloqueio: null, sim: [], lidasEm: [], erros: [], linhas: [],
    totais: { filas: 0, abertas: 0, disponiveis: 0, esgotados: 0, indisponiveis: 0, duvidosas: 0, incoerentes: 0, gravadas: 0, expiradas: 0, verificacoes: 0, iframeBloqueado: 0, erros: 0 },
  };
  var parado = false, timer = null, frameAtual = null;

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
    esperas[pingId] = function () { workerOk = true; };
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
  async function api(path, opts) {
    opts = opts || {};
    return fetch(CFG.api + path, { method: opts.method || 'GET', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: opts.body, credentials: 'omit' });
  }

  function agendar(ms) {
    if (parado || !S.rodando) return;
    clearTimeout(timer);
    S.proximoEm = new Date(Date.now() + ms).toISOString();
    timer = setTimeout(function () {
      S.proximoEm = null;
      ciclo().catch(function (e) { erro('ciclo: ' + e.message); return pausar('rede', 'exceção no ciclo'); }).catch(function (e2) { erro('recuperação: ' + (e2 && e2.message)); agendar(5 * 60000); });
    }, ms);
  }
  async function pausar(tipo, detalhe) {
    S.seguidos[tipo] = (S.seguidos[tipo] || 0) + 1;
    var p = PURO.politica(tipo, S.seguidos[tipo]);
    if (detalhe) erro(tipo + ': ' + detalhe);
    S.pausa = { ate: new Date(Date.now() + p.min * 60000).toISOString(), motivo: p.motivo, min: p.min, seguidos: S.seguidos[tipo] };
    agendar(p.min * 60000);
  }

  function fecharFrame(f) { try { if (f && f.parentNode) f.parentNode.removeChild(f); } catch (e) { /* ok */ } if (frameAtual === f) frameAtual = null; }
  function novoFrame(url) {
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:2400px;border:0;opacity:0.01;pointer-events:none;z-index:-1';
    f.src = url;
    document.documentElement.appendChild(f);
    frameAtual = f;
    return f;
  }
  function docDe(f) { try { return f.contentDocument && f.contentDocument.body ? f.contentDocument : null; } catch (e) { return null; } }

  /**
   * UMA página. Conclusivo só depois de 2 leituras iguais seguidas (preço igual, ou o mesmo estado esgotado/indisponível): a Shopee desenha por partes.
   * Devolve { analise } | { bloqueio: 'verificacao'|'login' } | { falha: 'iframe_bloqueado'|'nao_conclusiva' }. Nada é clicado, nada é rolado.
   */
  async function lerItem(item) {
    var f = novoFrame(item.url);
    try {
      var t0 = Date.now(), ant = null, iguais = 0, docVisto = false, ultima = null;
      while (Date.now() - t0 < 50000 && !parado) {
        await sleep(2500);
        var doc = docDe(f);
        if (!doc) continue;
        docVisto = true;
        var loc = null; try { loc = f.contentWindow.location; } catch (e) { loc = null; }
        var a = PURO.analisarPagina({ pathname: loc ? loc.pathname : '', search: loc ? loc.search : '', texto: doc.body.innerText, itemIdEsperado: item.item_id });
        ultima = a;
        if (a.estado === 'verificacao' || a.estado === 'login') return { bloqueio: a.estado };
        if (a.estado === 'item_diferente') return { analise: a };
        if (a.estado === 'carregando') { ant = null; iguais = 0; continue; }
        var chave = a.estado + ':' + (a.precoCents || '');
        iguais = chave === ant ? iguais + 1 : 0; ant = chave;
        if (iguais >= 1) return { analise: a };
      }
      if (!docVisto) return { falha: 'iframe_bloqueado' };
      return { falha: 'nao_conclusiva', ultima: ultima && ultima.estado };
    } finally { fecharFrame(f); }
  }

  async function gravar(linhaRota) {
    if (!CFG.enviar) { S.sim.push(linhaRota); if (S.sim.length > 6) S.sim.shift(); return 'ok'; }
    try {
      var r = await api('/api/ingest/disponibilidade-viva', { method: 'POST', body: JSON.stringify({ rows: [linhaRota] }) });
      var tp = r.status === 400 ? null : PURO.tipoHttp(r.status);
      if (tp) { await pausar(tp, 'gravação respondeu ' + r.status); return 'parar'; }
      var j = await r.json().catch(function () { return {}; });
      S.totais.gravadas += j.gravadas || 0; S.totais.expiradas += j.expiradas || 0;
      if (r.status === 400) erro('rota recusou: ' + (j.error || '400') + ' ' + JSON.stringify(j.recusadas || []).slice(0, 80));
    } catch (e) { await pausar('rede', 'gravação: ' + e.message); return 'parar'; }
    return 'ok';
  }

  async function avisarBloqueio(evento, detalhe) {
    try { await api('/api/ingest/shopee-fila', { method: 'POST', body: JSON.stringify({ evento: evento, detalhe: detalhe }) }); } catch (e) { /* o servidor também fecha a fila no próximo batimento */ }
  }

  async function ciclo() {
    S.pausa = null;
    var r;
    try { r = await api('/api/ingest/shopee-fila'); } catch (e) { return pausar('rede', 'fila: ' + e.message); }
    var tp = PURO.tipoHttp(r.status);
    if (tp) return pausar(tp, 'fila respondeu ' + r.status);
    var fila = await r.json().catch(function () { return null; });
    if (!fila) return pausar('rede', 'fila ilegível');
    S.seguidos = {};
    if (!fila.servir || !fila.itens || !fila.itens.length) { S.fila = { servir: !!fila.servir, motivo: fila.motivo || (fila.servir ? 'sem_itens' : null), em: agora() }; return agendar(fila.motivo === 'verificacao_antirrobo' ? 10 * 60000 : fila.motivo === 'teto_por_hora' ? 10 * 60000 : 60000); }
    S.totais.filas++;
    var itens = fila.itens.slice(0, CFG.enviar ? 60 : 3);
    var inuteis = 0;
    for (var i = 0; i < itens.length && !parado; i++) {
      var it = itens[i];
      var pr = PURO.podeLer(Date.now(), S.lidasEm, { maxPorHora: CFG.maxPorHora, loteMax: CFG.loteMax });
      if (!pr.pode) { if (pr.motivo === 'teto_por_hora') break; await sleep(pr.esperaMs + PURO.pausaEntre([1000, 4000])); }
      // uma página por vez; a espera aleatória acontece ANTES de abrir
      if (i > 0) await sleep(PURO.pausaEntre(CFG.pausaMs));
      if (parado) return;
      S.lidasEm.push(Date.now()); S.lidasEm = S.lidasEm.filter(function (t) { return Date.now() - t < 3600000; });
      S.totais.abertas++;
      var res = await lerItem(it);
      if (res.bloqueio) {
        S.totais.verificacoes++;
        S.bloqueio = { em: agora(), tipo: res.bloqueio };
        linha({ item: it.item_id, bloqueio: res.bloqueio });
        if (res.bloqueio === 'verificacao') await avisarBloqueio('verificacao', 'item ' + it.item_id);
        return pausar(res.bloqueio, 'página de ' + res.bloqueio + ' no item ' + it.item_id + ' (nada é contornado; o dono resolve na aba)');
      }
      if (res.falha === 'iframe_bloqueado') { S.totais.iframeBloqueado++; return pausar('iframe_bloqueado', 'a página do anúncio não abriu no iframe'); }
      var linhaRota = res.analise ? PURO.linhaParaGravar(it.offer_id, res.analise, it.preco_esperado_cents) : null;
      if (res.analise) {
        var e = res.analise.estado;
        if (e === 'esgotado') S.totais.esgotados++; else if (e === 'indisponivel') S.totais.indisponiveis++; else if (e === 'disponivel') { if (linhaRota) S.totais.disponiveis++; else S.totais.incoerentes++; }
        linha({ item: it.item_id, estado: e, preco: res.analise.precoCents, esperado: it.preco_esperado_cents, grava: !!linhaRota });
      } else { S.totais.duvidosas++; inuteis++; linha({ item: it.item_id, falha: res.falha, ultima: res.ultima }); }
      if (linhaRota && (await gravar(linhaRota)) === 'parar') return;
    }
    if (parado) return;
    if (!CFG.enviar) { S.parou = { em: agora(), motivo: 'simulacao_concluida' }; S.rodando = false; return; }
    if (itens.length >= 3 && inuteis === itens.length) return pausar('leituras_inuteis', 'nenhuma leitura conclusiva neste lote');
    S.seguidos = {};
    await sleep(PURO.descansoDeLote());
    agendar(30000);
  }

  function status() {
    return JSON.parse(JSON.stringify({ versao: S.versao, rodando: S.rodando, enviar: S.enviar, iniciadoEm: S.iniciadoEm, pausa: S.pausa, parou: S.parou, proximoEm: S.proximoEm, bloqueio: S.bloqueio,
      fila: S.fila, totais: S.totais, lidasUltimaHora: S.lidasEm.length, erros: S.erros.slice(-8), linhas: S.linhas.slice(-12) }));
  }
  function stop(motivo) {
    if (parado) return;
    parado = true; clearTimeout(timer); S.rodando = false; S.proximoEm = null; S.parou = { em: agora(), motivo: motivo || 'operador' };
    fecharFrame(frameAtual);
  }
  function simulacao() { return JSON.parse(JSON.stringify(S.sim)); }
  window.__shpv = { status: status, stop: stop, simulacao: simulacao, rodando: true, versao: VERSAO };

  agendar(5000);
  // BATIMENTO-GERAL v1: um batimento por minuto para /api/ingest/loop-saude (loop 'shopee-vivo'); grava collector_runs 'loop:shopee-vivo'. Usa CFG/TOKEN da closure.
  (function () {
    try {
      var NOME = 'shopee-vivo', REDE_BAT = 'shopee', GLOBAL = '__shpv';
      if (!CFG.api || !TOKEN) return;
      if (window['__loopsaude_' + NOME]) clearInterval(window['__loopsaude_' + NOME]);
      var ESPERADO = 60000, anterior = Date.now();
      var bater = function () {
        var ag = Date.now(), lag = Math.max(0, ag - anterior - ESPERADO); anterior = ag;
        var g = window[GLOBAL], st = {};
        try { st = (g && g.status && g.status()) || {}; } catch (e) { st = {}; }
        var stop_ = st.rodando === false || (g && g.rodando === false);
        var corpo = { estado: stop_ ? 'parado' : 'ok', versao: g && g.versao ? String(g.versao) : null, lagMs: lag, visivel: document.visibilityState,
          memMb: (performance && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, url: location.pathname };
        try {
          fetch(CFG.api + '/api/ingest/loop-saude?rede=' + REDE_BAT + '&loop=' + NOME, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(function () {});
        } catch (e) { /* o batimento nunca derruba o loop */ }
      };
      window['__loopsaude_' + NOME] = setInterval(bater, ESPERADO);
      setTimeout(bater, 5000);
    } catch (e) { /* ok */ }
  })();
})();
