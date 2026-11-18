/*
 * LOOP DA RASPAGEM GERAL DE CUPONS DA SHOPEE (#116) para a aba logada do dono. SÓ LEITURA. SEM prompt, SEM credencial no arquivo.
 * Lê a página "Pegue mais cupons" (https://shopee.com.br/m/cupom-de-desconto: cartões "TODAS AS LOJAS / 10% OFF / Nas compras acima de R$0 Limitado a R$10 / Eu quero",
 * "R$15 OFF nas compras acima de R$149", "LOJAS OFICIAIS / R$35 OFF", cashback, frete) num iframe oculto de mesma origem e envia para POST /api/ingest/cupons
 * (rede 'shopee'). NUNCA clica em "Eu quero", "Usar", "Resgatar" nem em nada: só lê o texto dos cartões. Cartão "Esgotado" não vira cupom; se estava ativo e sumiu,
 * o servidor o marca vencido (leitura completa da página = leitura_completa:true).
 * Nome: a Shopee não dá nome próprio ao voucher; o nome vira o rótulo do próprio cartão, no formato do mercado ("Cupom de 10% no carrinho"), em condicoes.nome.
 *
 * Como iniciar (aba em https://shopee.com.br, de preferência NÃO a que roda o cupons-24h; token só em memória):
 *   1. window.__SHP_CFG = { api: 'https://www.egeek86.com', token: '...', enviar: false };   // comece em SIMULAÇÃO (lê 1 vez, mostra, para)
 *      opcionais: cicloMin (30, piso 15), paginas (['/m/cupom-de-desconto']), pausaMs ([6000, 12000])
 *   2. Injetar este arquivo inteiro. Ele apaga window.__SHP_CFG, guarda o token na closure e devolve na hora.
 *   3. Acompanhar: JSON.stringify(window.__shp.status()).  Simulação: JSON.stringify(window.__shp.simulacao()).  Parar: window.__shp.stop().
 * NUNCA para sozinho (regra do dono): captcha/login/403/429/5xx/rede/token/origem/exceção viram pausa com recuo (teto 60 min) e retomada. Só stop() do operador para.
 * Uma leitura sem cartões (campanha expirada, página fora do ar, bloqueio) NUNCA fecha nada no servidor. Não envia batimento (collector_runs 'cupons-assistida' grava a cada lote).
 */
(function () {
  'use strict';
  var VERSAO = 'shopee-1.1.0';

  // =====================================================================================================================
  // LÓGICA PURA (sem DOM, sem rede): testada em scripts/test-raspagem-cupons.ts
  // =====================================================================================================================
  var PURO = {};
  var semAcento = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

  PURO.brlCents = function (t) {
    var m = /^\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*$/.exec(String(t || ''));
    if (!m) return null;
    var dec = m[2] ? (m[2].length === 1 ? +m[2] * 10 : +m[2]) : 0;
    return +m[1].replace(/\./g, '') * 100 + dec;
  };
  /** "R$149", "R$1mil", "R$ 1.000", "R$ 12,50" -> centavos; "R$0" -> 0. */
  PURO.reais = function (num, mil) {
    var c = PURO.brlCents(num);
    return c === null ? null : (mil ? c * 1000 : c);
  };
  PURO.fimDoDia = function (y, m, d) { return new Date(Date.UTC(y, m, d + 1, 2, 59, 59)).toISOString(); };

  var BTN = /^(eu quero|esgotado|usar|usar depois|resgatar|resgatado|coletar|coletado)$/i;
  var TITULO = /^(R\$\s*\d[\d.,]*\s*OFF|\d+(?:[.,]\d+)?\s*%\s*(?:OFF|DE CASHBACK)(?:\s+no\s+frete)?|Cupom de Frete Gr[aá]tis)\b/i;
  var GENERICO = /^(cupons? de desconto|cupom|cupons|vouchers?)$/i;

  /**
   * Linhas de UM cartão (texto na ordem da tela) -> { cupom } no contrato de POST /api/ingest/cupons | { descarte }.
   * Estrutura medida em 2026-11-15: [ROTULO] [TÍTULO] [condição] [tags...] Condições [BOTÃO]. Nada é deduzido: o que não foi lido fica de fora.
   */
  PURO.interpretarCartao = function (linhas, agoraMs, fonteUrl) {
    var ls = (linhas || []).map(function (l) { return String(l).replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    var bi = -1;
    for (var i = ls.length - 1; i >= 0; i--) if (BTN.test(ls[i])) { bi = i; break; }
    if (bi < 0) return { descarte: 'sem_botao' };
    var botao = ls[bi];
    if (/^esgotado$/i.test(botao)) return { descarte: 'esgotado' };
    var corpo = ls.filter(function (l, k) { return k !== bi && !/^condi[cç][oõ]es$/i.test(l); });
    var ti = -1;
    for (var j = 0; j < corpo.length; j++) if (TITULO.test(corpo[j])) { ti = j; break; }
    if (ti < 0) return { descarte: 'sem_titulo' };
    var titulo = corpo[ti].replace(/\s+/g, ' ');
    var antes = corpo.slice(0, ti).filter(function (l) { return !GENERICO.test(l); });
    var depois = corpo.slice(ti + 1);
    var rotulo = antes.length ? antes[antes.length - 1] : null;
    if (!rotulo) return { descarte: 'sem_escopo' };
    var cond = [], tags = [], validade = null;
    depois.forEach(function (l) {
      if (/^(v[aá]lido|termina)\b/i.test(l)) validade = l;
      else if (/compras? acima de|limit(?:e|ado)|sem valor m[ií]nimo|confira condi/i.test(l)) cond.push(l);
      else tags.push(l);
    });
    var tipo, valor = null, unidade = null;
    var pct = /(\d+(?:[.,]\d+)?)\s*%/.exec(titulo), brl = /^R\$\s*(\d[\d.,]*)/i.exec(titulo);
    if (/cashback/i.test(titulo)) { tipo = 'cashback'; valor = +pct[1].replace(',', '.'); unidade = 'percentual'; }
    else if (/frete/i.test(titulo)) { tipo = 'frete'; if (pct) { valor = +pct[1].replace(',', '.'); unidade = 'percentual'; } }
    else if (pct) { tipo = 'percentual'; valor = +pct[1].replace(',', '.'); unidade = 'percentual'; }
    else if (brl) { var cv = PURO.brlCents(brl[1]); if (!cv) return { descarte: 'valor_nao_lido' }; tipo = 'valor_fixo'; valor = cv / 100; unidade = 'reais'; }
    else return { descarte: 'valor_nao_lido' };
    var minC = null, tetoC = null, txt = cond.join(' ');
    var mn = /acima de R\$\s*(\d[\d.,]*?)\s*(mil)?(?=\s|$|[A-Za-zÀ-ÿ])/i.exec(txt);
    if (mn) { var mc = PURO.reais(mn[1].replace(/[.,]$/, ''), !!mn[2]); if (mc) minC = mc; }
    var tt = /limit(?:e|ado)(?:\s+de|\s+a)?\s*R\$\s*(\d[\d.,]*?)\s*(mil)?(?=\s|$|[A-Za-zÀ-ÿ])/i.exec(txt);
    if (tt) { var tc = PURO.reais(tt[1].replace(/[.,]$/, ''), !!tt[2]); if (tc) tetoC = tc; }
    var escopo = 'loja_inteira', ref = null;
    if (!/^todas as lojas$/i.test(rotulo)) { escopo = 'categoria'; ref = { categorias: [rotulo.toLowerCase()] }; }
    var restrito = tags.filter(function (t) { return /exclusivo para|indicado|pague com/i.test(t); });
    var nome;
    if (tipo === 'percentual') nome = 'Cupom de ' + String(valor).replace('.', ',') + '% no carrinho';
    else if (tipo === 'valor_fixo') nome = 'Cupom de R$ ' + String(valor).replace('.', ',') + ' no carrinho';
    else if (tipo === 'cashback') nome = 'Cashback de ' + String(valor).replace('.', ',') + '%';
    else nome = valor ? 'Cupom de ' + String(valor).replace('.', ',') + '% no frete' : 'Cupom de frete grátis';
    var c = {
      tipo: tipo, escopo: escopo,
      texto_bruto: ls.join(' | ').slice(0, 1500),
      // estável entre leituras (sem prazo e sem botão): é o que o hash de deduplicação usa
      condicoes_texto: (rotulo + '. ' + titulo + '. ' + cond.join('. ') + (tags.length ? '. ' + tags.join('. ') : '')).slice(0, 1400),
      condicoes: { nome: nome.slice(0, 190), uso: /^eu quero$/i.test(botao) ? 'ativar' : 'carteira', botao: botao.slice(0, 40), escopo_rotulo: rotulo.slice(0, 120), origem: 'pegue_mais_cupons' },
      publico: restrito.length ? 'outro' : 'todos',
      fonte_tipo: 'portal_listagem',
    };
    if (ref) c.escopo_ref = ref;
    if (restrito.length) c.publico_texto = restrito.join('; ').slice(0, 190);
    if (tags.length) c.condicoes.tags = tags.join('; ').slice(0, 190);
    if (fonteUrl) c.fonte_url = fonteUrl;
    if (valor !== null) { c.valor = valor; c.valor_unidade = unidade; }
    if (minC) c.minimo_compra_centavos = minC;
    if (tetoC) c.teto_desconto_centavos = tetoC;
    if (validade) {
      var t = semAcento(validade), d = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t), h = /(?:em|:)\s*(\d{1,3})\s*(hora|horas|minuto|minutos|dia|dias)\b/.exec(t);
      if (d) { c.validade_fim = PURO.fimDoDia(+d[3], +d[2] - 1, +d[1]); c.validade_origem = 'texto_da_pagina'; c.validade_texto = validade.slice(0, 190); }
      else if (h) {
        var ms = +h[1] * (/^min/.test(h[2]) ? 60000 : /^hora/.test(h[2]) ? 3600000 : 86400000);
        c.validade_fim = new Date(agoraMs + ms).toISOString(); c.validade_origem = 'contagem_regressiva'; c.validade_texto = validade.slice(0, 190);
      }
    }
    return { cupom: c };
  };

  /** Texto da página -> 'ok' | 'campanha_expirou' | 'captcha' | 'login'. */
  PURO.tipoPagina = function (o) {
    o = o || {};
    var p = String(o.pathname || ''), t = semAcento(String(o.texto || '').slice(0, 3000));
    if (/\/verify\/|captcha|anti-?bot/.test(p)) return 'captcha';
    if (/\/buyer\/login|\/user\/login/.test(p)) return 'login';
    if (/essa campanha expirou/.test(t) && !o.temCartoes) return 'campanha_expirou';
    if (!o.temCartoes && /(verifique|captcha|nao sou um robo|arraste)/.test(t) && t.length < 800) return 'captcha';
    return 'ok';
  };

  var RECUO = {
    captcha: [30, 60], login: [15, 30, 60], http_429: [30, 60], rede: [1, 2, 5, 10, 20], http_5xx_servidor: [1, 2, 5, 10, 20],
    servidor_desligado: [10, 20, 30, 60], token_recusado: [15, 30, 60], origem_recusada: [15, 30, 60], campanha_expirou: [30, 60], leitura_vazia: [10, 15, 30],
  };
  PURO.politica = function (tipo, seguidos) {
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
  PURO.pausaEntre = function (faixa, rnd, piso) {
    var a = Math.max(piso, faixa[0]), b = Math.max(a, faixa[1]);
    return Math.round(a + (rnd == null ? Math.random() : rnd) * (b - a));
  };
  PURO.validarCfg = function (c, host) {
    if (!c || typeof c !== 'object') return { ok: false, erro: 'window.__SHP_CFG ausente' };
    if (!/(^|\.)shopee\.com\.br$/.test(host)) return { ok: false, erro: 'a aba precisa estar em shopee.com.br' };
    var api = String(c.api || '').replace(/\/+$/, '');
    if (!/^https:\/\/[^/\s]+$/.test(api)) return { ok: false, erro: 'api deve ser https://dominio (sem caminho)' };
    if (typeof c.token !== 'string' || c.token.length < 32) return { ok: false, erro: 'token ausente ou curto' };
    var paginas = Array.isArray(c.paginas) && c.paginas.length ? c.paginas.filter(function (p) { return /^\/[A-Za-z0-9/_-]{2,80}$/.test(p); }).slice(0, 4) : ['/m/cupom-de-desconto'];
    if (!paginas.length) return { ok: false, erro: 'paginas inválidas (caminhos como /m/cupom-de-desconto)' };
    var faixa = Array.isArray(c.pausaMs) && c.pausaMs.length === 2 ? [+c.pausaMs[0] || 6000, +c.pausaMs[1] || 12000] : [6000, 12000];
    return { ok: true, cfg: { api: api, enviar: c.enviar === true, paginas: paginas, pausaMs: faixa, cicloMs: Math.max(15, +c.cicloMin || 30) * 60000 }, token: c.token };
  };

  var PISO_PAUSA_MS = 5000;
  var MIN_CARTOES_PARA_FECHAR = 3;

  if (typeof module !== 'undefined' && module.exports) { module.exports = PURO; return; }

  // =====================================================================================================================
  // LOOP NO NAVEGADOR
  // =====================================================================================================================
  if (window.__shp && typeof window.__shp.stop === 'function') { try { window.__shp.stop('substituido'); } catch (e) { /* ok */ } }
  var entrada = window.__SHP_CFG;
  try { delete window.__SHP_CFG; } catch (e) { window.__SHP_CFG = undefined; }
  var v = PURO.validarCfg(entrada, location.hostname);
  if (!v.ok) { window.__shp = { rodando: false, erro: v.erro, status: function () { return { rodando: false, erro: v.erro }; }, stop: function () {} }; return; }
  var CFG = v.cfg, TOKEN = v.token;
  v = null; entrada = null;

  var S = {
    versao: VERSAO, rodando: true, enviar: CFG.enviar, iniciadoEm: new Date().toISOString(), pausa: null, parou: null, proximoEm: null, seguidos: {},
    ciclos: 0, ultimoCiclo: null, sim: [], maiorLeitura: 0, ultimaLeitura: -1, raf: null,
    totais: { paginas: 0, cartoes: 0, montados: 0, esgotados: 0, descartados: 0, enviados: 0, gravados: 0, novos: 0, rejeitados: 0, vencidosPorAusencia: 0, erros: 0 },
    descartes: {}, rejeicoes: {}, erros: [], linhas: [],
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

  async function pausarOuParar(tipo, detalhe) {
    S.seguidos[tipo] = (S.seguidos[tipo] || 0) + 1;
    var p = PURO.politica(tipo, S.seguidos[tipo]);
    if (detalhe) erro(tipo + ': ' + detalhe);
    S.pausa = { ate: new Date(Date.now() + p.min * 60000).toISOString(), motivo: p.motivo, min: p.min, seguidos: S.seguidos[tipo] };
    agendar(p.min * 60000);
  }

  function fecharFrame(f) { try { if (f && f.parentNode) f.parentNode.removeChild(f); } catch (e) { /* ok */ } if (frameAtual === f) frameAtual = null; }
  function novoFrame(caminho) {
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:3200px;border:0;opacity:0.01;pointer-events:none;z-index:-1';
    f.src = location.origin + caminho;
    document.documentElement.appendChild(f);
    frameAtual = f;
    return f;
  }
  function docDe(f) { try { return f.contentDocument && f.contentDocument.body ? f.contentDocument : null; } catch (e) { return null; } }

  /** Cartões da página: cada botão "Eu quero/Esgotado/Usar" sobe até o menor ancestral com UM só botão; o texto desse ancestral são as linhas do cartão. */
  function lerCartoes(doc) {
    var ehBtn = function (e) { return e.children.length === 0 && BTN.test((e.textContent || '').trim()); };
    var folhas = [].filter.call(doc.querySelectorAll('button,div,span,a'), ehBtn);
    return folhas.map(function (l) {
      var c = l;
      while (c.parentElement) {
        var p = c.parentElement;
        var n = [].filter.call(p.querySelectorAll('button,div,span,a'), ehBtn).length;
        if (n > 1) break;
        c = p;
      }
      return (c.innerText || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    });
  }

  /** Quadros por segundo que a aba consegue desenhar (rAF contado por 1 s com relógio do Worker). */
  async function sondaRaf() {
    var n = 0, vivo = true;
    function q() { if (!vivo) return; n++; requestAnimationFrame(q); }
    requestAnimationFrame(q);
    await sleep(1000);
    vivo = false;
    return n;
  }

  /** Uma página: iframe oculto, rolagem até a contagem de cartões estabilizar. { cartoes } | { bloqueio } | { vazia }. Nada é clicado. */
  async function lerPagina(caminho) {
    var f = novoFrame(caminho);
    try {
      // A Shopee só desenha os cartões com rAF/IntersectionObserver. Em aba em segundo plano/oculta o Chrome estrangula isso (medido: ~1 quadro/s com visibilityState 'visible'),
      // então o iframe demora ou desenha só parte. Sonda a taxa e, se estrangulado, espera bem mais antes de desistir.
      var hz = await sondaRaf();
      S.raf = { hz: hz, em: agora(), visibilidade: document.visibilityState };
      var lento = hz < 20, limiteMs = lento ? 150000 : 45000, minEstavel = lento ? 6 : 3;
      var t0 = Date.now(), ant = -1, estavel = 0, doc = null, cartoes = [];
      while (Date.now() - t0 < limiteMs && !parado) {
        await sleep(lento ? 3000 : 1500);
        doc = docDe(f);
        if (!doc) continue;
        var loc = ''; try { loc = f.contentWindow.location.pathname; } catch (e) { /* ok */ }
        cartoes = lerCartoes(doc);
        var tp = PURO.tipoPagina({ pathname: loc, texto: doc.body.innerText, temCartoes: cartoes.length > 0 });
        if (tp !== 'ok') return tp === 'campanha_expirou' ? { vazia: tp } : { bloqueio: tp };
        try { f.contentWindow.scrollBy(0, 1500); } catch (e) { /* ok */ }
        estavel = cartoes.length === ant ? estavel + 1 : 0; ant = cartoes.length;
        if (cartoes.length > 0 && estavel >= minEstavel) break;
      }
      if (!doc) return { bloqueio: 'rede', detalhe: 'iframe não renderizou' };
      if (!cartoes.length) return { vazia: 'sem_cartoes' };
      return { cartoes: cartoes, estavel: estavel >= minEstavel, lento: lento };
    } finally { fecharFrame(f); }
  }

  async function enviar(cupons, caminho, completa) {
    var corpo = { rede: 'shopee', fonte_url: location.origin + caminho, lidos_em: agora(), leitura_completa: completa, cupons: cupons };
    if (!CFG.enviar) { S.sim.push(corpo); if (S.sim.length > 5) S.sim.shift(); return 'ok'; }
    try {
      var r = await api('/api/ingest/cupons', { method: 'POST', body: JSON.stringify(corpo) });
      var tp = r.status === 400 ? null : PURO.tipoHttp(r.status);
      if (tp) { await pausarOuParar(tp, 'envio respondeu ' + r.status); return 'parar'; }
      var j = await r.json().catch(function () { return {}; });
      S.totais.enviados += cupons.length; S.totais.gravados += j.gravados || 0; S.totais.novos += j.novos || 0; S.totais.vencidosPorAusencia += j.vencidos_por_ausencia || 0;
      (j.rejeitados || []).forEach(function (x) { S.totais.rejeitados++; S.rejeicoes[x.reason] = (S.rejeicoes[x.reason] || 0) + 1; });
      linha({ pagina: caminho, enviados: cupons.length, gravados: j.gravados, novos: j.novos, vencidos_por_ausencia: j.vencidos_por_ausencia, fechamento_recusado: j.fechamento_recusado, erro: r.status === 400 ? (j.error || 'lote_recusado') : undefined, rejeitados: (j.rejeitados || []).slice(0, 4) });
    } catch (e) { await pausarOuParar('rede', 'envio: ' + e.message); return 'parar'; }
    return 'ok';
  }

  async function ciclo() {
    S.pausa = null;
    var c = { n: S.ciclos + 1, inicio: agora(), paginas: 0, cartoes: 0, montados: 0, esgotados: 0, descartados: 0 };
    for (var i = 0; i < CFG.paginas.length && !parado; i++) {
      var caminho = CFG.paginas[i];
      var res = await lerPagina(caminho);
      if (res.vazia === 'sem_cartoes') { linha({ pagina: caminho, vazia: res.vazia, raf: S.raf, nova_tentativa: true }); await sleep(20000); res = await lerPagina(caminho); }
      if (res.bloqueio) return pausarOuParar(res.bloqueio, 'página ' + caminho);
      if (res.vazia) { linha({ pagina: caminho, vazia: res.vazia }); return pausarOuParar(res.vazia === 'campanha_expirou' ? 'campanha_expirou' : 'leitura_vazia', 'página ' + caminho + ' sem cartões (nada é fechado)'); }
      S.seguidos = {};
      var montados = [], resumo = {};
      var url = location.origin + caminho;
      res.cartoes.forEach(function (linhas) {
        var m = PURO.interpretarCartao(linhas, Date.now(), url);
        if (m.cupom) montados.push(m.cupom);
        else { resumo[m.descarte] = (resumo[m.descarte] || 0) + 1; if (m.descarte === 'esgotado') S.totais.esgotados++; else { S.totais.descartados++; S.descartes[m.descarte] = (S.descartes[m.descarte] || 0) + 1; } }
      });
      c.paginas++; c.cartoes += res.cartoes.length; c.montados += montados.length;
      S.totais.paginas++; S.totais.cartoes += res.cartoes.length; S.totais.montados += montados.length;
      if (!CFG.enviar || S.linhas.length === 0) linha({ pagina: caminho, cartoes: res.cartoes.length, montados: montados.length, descartes: resumo, amostra: res.cartoes.slice(0, 2) });
      // leitura completa só com a rolagem estável e cartões suficientes; do contrário só grava (nada fecha por leitura duvidosa)
      // só fecha o que sumiu se a leitura é estável, tem cartões suficientes E não é uma renderização parcial (menos de 80% da maior leitura desta sessão)
      var completa = res.estavel && res.cartoes.length >= MIN_CARTOES_PARA_FECHAR && (res.cartoes.length >= Math.ceil(0.8 * S.maiorLeitura) || res.cartoes.length === S.ultimaLeitura); // mesma contagem 2 ciclos seguidos = a página encolheu de verdade
      if (!completa && res.cartoes.length < Math.ceil(0.8 * S.maiorLeitura)) linha({ pagina: caminho, parcial: res.cartoes.length, maior: S.maiorLeitura, raf: S.raf });
      S.maiorLeitura = res.cartoes.length === S.ultimaLeitura ? res.cartoes.length : Math.max(S.maiorLeitura, res.cartoes.length);
      S.ultimaLeitura = res.cartoes.length;
      if (montados.length || completa) { if (await enviar(montados, caminho, completa) === 'parar') return; }
      if (i < CFG.paginas.length - 1) await sleep(PURO.pausaEntre(CFG.pausaMs, null, PISO_PAUSA_MS));
    }
    if (parado) return;
    S.ciclos = c.n; c.fim = agora(); S.ultimoCiclo = c;
    if (!CFG.enviar) { S.parou = { em: agora(), motivo: 'simulacao_concluida' }; S.rodando = false; return; }
    agendar(CFG.cicloMs);
  }

  function agendar(ms) {
    if (parado || !S.rodando) return;
    clearTimeout(timer);
    S.proximoEm = new Date(Date.now() + ms).toISOString();
    timer = setTimeout(function () {
      S.proximoEm = null;
      ciclo().catch(function (e) { erro('ciclo: ' + e.message); return pausarOuParar('rede', 'exceção no ciclo'); }).catch(function (e2) { erro('recuperação: ' + (e2 && e2.message)); agendar(15 * 60000); });
    }, ms);
  }

  function status() {
    return JSON.parse(JSON.stringify({
      versao: S.versao, rodando: S.rodando, enviar: S.enviar, iniciadoEm: S.iniciadoEm, ciclos: S.ciclos, ultimoCiclo: S.ultimoCiclo, pausa: S.pausa, parou: S.parou,
      proximoEm: S.proximoEm, raf: S.raf, maiorLeitura: S.maiorLeitura, totais: S.totais, descartes: S.descartes, rejeicoes: S.rejeicoes, erros: S.erros.slice(-8), linhas: S.linhas.slice(-12),
    }));
  }
  function stop(motivo) {
    if (parado) return;
    parado = true; clearTimeout(timer); S.rodando = false; S.proximoEm = null; S.parou = { em: agora(), motivo: motivo || 'operador' };
    fecharFrame(frameAtual);
  }
  function simulacao() { return JSON.parse(JSON.stringify(S.sim)); }
  window.__shp = { status: status, stop: stop, simulacao: simulacao, rodando: true, versao: VERSAO };

  agendar(2000);
})();

// BATIMENTO-GERAL v1 (2026-11-18, metodologia Chrome): um batimento por minuto para /api/ingest/loop-saude (estado, versao, atraso do timer, visibilidade, memoria).
// O vigia le o banco (scripts/vigia-loops.ts) em vez de sondar a aba por CDP; atraso grande do timer = aba congelada ou thread principal travada.
(function () {
  try {
    var NOME = 'shopee-cupons', REDE = 'shopee', GLOBAL = '__shp', CFG = window['__SHP_CFG'] || {};
    if (!CFG.api || !CFG.token) return;
    if (window['__loopsaude_' + NOME]) clearInterval(window['__loopsaude_' + NOME]);
    var ESPERADO = 60000, anterior = Date.now();
    function bater() {
      var agora = Date.now(), lag = Math.max(0, agora - anterior - ESPERADO); anterior = agora;
      var g = window[GLOBAL], st = {};
      try { st = (g && g.status && g.status()) || {}; } catch (e) { st = {}; }
      var parado = st.rodando === false || st.running === false || (g && g.rodando === false);
      var corpo = { estado: parado ? 'parado' : 'ok', versao: g && g.versao ? String(g.versao) : null, lagMs: lag, visivel: document.visibilityState,
        memMb: (performance && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, url: location.pathname };
      try {
        fetch(CFG.api + '/api/ingest/loop-saude?rede=' + REDE + '&loop=' + NOME, { method: 'POST', headers: { Authorization: 'Bearer ' + CFG.token, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(function () {});
      } catch (e) { /* o batimento nunca derruba o loop */ }
    }
    window['__loopsaude_' + NOME] = setInterval(bater, ESPERADO);
    setTimeout(bater, 5000);
  } catch (e) { /* ok */ }
})();
