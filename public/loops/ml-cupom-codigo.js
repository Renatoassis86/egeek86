/*
 * VALIDADOR DE CÓDIGO DE CUPOM DO MERCADO LIVRE (R-79) para a aba logada do dono, na página https://www.mercadolivre.com.br/cupons.
 * Pega os CANDIDATOS (pistas de comunidade) da fila do servidor, abre "Inserir código", digita UM código, lê o resultado e o manda ao servidor.
 * Só vale o que a LOJA mostrou. Sem token na linha de comando: a configuração vem de window.__MLCOD_CFG (apagado ao injetar; token só na closure).
 * NÃO compra, NÃO abre carrinho, NÃO toca em cartão, NÃO clica em "Aplicar" de nenhum cartão da lista; o único clique de escrita é "Inserir" do código.
 * Atenção: código aceito pela loja fica na lista "Meus cupons" da conta (é o efeito normal de inserir um cupom).
 *
 * Como iniciar (aba em /cupons, janela visível; NÃO a do portal nem a do item; token só em memória):
 *   1. window.__MLCOD_CFG = { api: 'https://www.egeek86.com', token: '...', enviar: false };   // comece em SIMULAÇÃO (só lê e mostra)
 *      opcionais: cicloMin (15, piso 10), maxPorCiclo (3), maxPorHora (8), pausaMs ([20000, 40000], piso 15000)
 *   2. Injetar este arquivo inteiro.
 *   3. Acompanhar: JSON.stringify(window.__mlcod.status()).  Testar códigos à mão (sem servidor): await window.__mlcod.testar(['CODIGO1','CODIGO2']).  Parar: window.__mlcod.stop().
 * O servidor só atende com CUPOM_PISTAS_COMUNIDADE ligada (desligada = 503 e o ciclo só espera). Captcha/login/403/429 viram pausa com recuo; nunca contorna captcha.
 */
(function () {
  'use strict';
  var VERSAO = 'codigo-1.0.0';
  var cfg = window.__MLCOD_CFG || {};
  try { delete window.__MLCOD_CFG; } catch (e) { window.__MLCOD_CFG = undefined; }
  if (window.__mlcod && window.__mlcod.stop) { try { window.__mlcod.stop(); } catch (e) { /* reinjetar substitui */ } }
  var API = String(cfg.api || '').replace(/\/$/, '');
  var TOKEN = String(cfg.token || '');
  var ENVIAR = cfg.enviar === true;
  var CICLO_MIN = Math.max(10, Number(cfg.cicloMin) || 15);
  var MAX_CICLO = Math.min(5, Math.max(1, Number(cfg.maxPorCiclo) || 3));
  var MAX_HORA = Math.min(12, Math.max(1, Number(cfg.maxPorHora) || 8));
  var PAUSA = (cfg.pausaMs && cfg.pausaMs.length === 2) ? [Math.max(15000, +cfg.pausaMs[0]), Math.max(15000, +cfg.pausaMs[1])] : [20000, 40000];

  var est = { versao: VERSAO, enviar: ENVIAR, ciclos: 0, ultimoCiclo: null, erro: null, pausaAte: 0, feitos: [], historicoHora: [], parado: false, linhas: [] };
  var timer = null;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var rnd = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };

  function modalDoCodigo() { return document.querySelector('.input-code-modal__modal-container'); }
  function setValor(inp, v) {
    var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function bloqueio() {
    var t = (document.body.innerText || '').slice(0, 3000).toLowerCase();
    if (/captcha|n[aã]o sou um rob[oô]|verifica[cç][aã]o de seguran[cç]a/.test(t)) return 'captcha';
    if (/\b(entre|ingresse)\b.*\b(conta|mercado livre)\b/.test(t) && !document.querySelector('.input-code-modal__action-button')) return 'login';
    return null;
  }

  /** Insere UM código e devolve o texto que a loja mostrou. */
  async function inserir(codigo) {
    if (!/^\/cupons/.test(location.pathname)) throw new Error('aba_fora_de_cupons');
    var b = bloqueio(); if (b) throw new Error('bloqueio_' + b);
    var abrir = document.querySelector('.input-code-modal__action-button');
    if (!abrir) throw new Error('botao_inserir_codigo_nao_achado');
    if (!modalDoCodigo()) { abrir.click(); await sleep(1500); }
    var inp = document.getElementById('inputcode-textfield-with-link');
    var mod = modalDoCodigo();
    if (!inp || !mod) throw new Error('campo_do_codigo_nao_achado');
    setValor(inp, codigo); await sleep(600);
    var bt = Array.prototype.filter.call(mod.querySelectorAll('button'), function (x) { return (x.innerText || '').trim() === 'Inserir'; })[0];
    if (!bt) throw new Error('botao_inserir_nao_achado');
    bt.click(); await sleep(4000);
    var m2 = modalDoCodigo();
    var texto = ((m2 || document.body).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    var fechar = document.querySelector('.andes-modal__close-button'); if (fechar) fechar.click();
    await sleep(900);
    return texto;
  }

  async function api(metodo, corpo) {
    var r = await fetch(API + '/api/ingest/cupom-candidato', { method: metodo, headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    var j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ }
    return { status: r.status, json: j };
  }

  /** Teste à mão: lê o resultado de cada código e NÃO envia nada ao servidor. */
  async function testar(codigos) {
    var out = [];
    for (var i = 0; i < codigos.length; i++) {
      var c = String(codigos[i]).toUpperCase();
      try { out.push({ codigo: c, texto: await inserir(c) }); } catch (e) { out.push({ codigo: c, erro: String(e && e.message || e) }); break; }
      if (i + 1 < codigos.length) await sleep(rnd(PAUSA[0], PAUSA[1]));
    }
    return JSON.stringify(out);
  }

  async function ciclo() {
    if (est.parado) return;
    var agora = Date.now();
    est.historicoHora = est.historicoHora.filter(function (t) { return agora - t < 3600000; });
    if (agora < est.pausaAte) return;
    est.ultimoCiclo = new Date().toISOString(); est.ciclos++;
    try {
      var g = await api('GET');
      if (g.status === 503) { est.erro = 'servidor_desligado_ou_pistas_desligadas'; est.pausaAte = Date.now() + 30 * 60000; return; }
      if (g.status !== 200 || !g.json) { est.erro = 'fila_http_' + g.status; est.pausaAte = Date.now() + 10 * 60000; return; }
      var fila = (g.json.fila || []).slice(0, MAX_CICLO); est.linhas = [];
      for (var i = 0; i < fila.length; i++) {
        if (est.historicoHora.length >= MAX_HORA) { est.erro = 'limite_por_hora'; break; }
        var c = fila[i].codigo;
        var texto = await inserir(c);
        est.historicoHora.push(Date.now());
        var linha = { codigo: c, texto: texto.slice(0, 160), enviado: false };
        if (ENVIAR) { var p = await api('POST', { codigo: c, texto: texto }); linha.enviado = p.status === 200; linha.resposta = p.json && { resultado: p.json.resultado, estado: p.json.estado, ingestao: p.json.ingestao }; if (p.status === 429) est.pausaAte = Date.now() + 60 * 60000; }
        est.linhas.push(linha); est.feitos.push(c); if (est.feitos.length > 50) est.feitos.shift();
        if (i + 1 < fila.length) await sleep(rnd(PAUSA[0], PAUSA[1]));
      }
      est.erro = est.erro === 'limite_por_hora' ? est.erro : null;
    } catch (e) {
      est.erro = String(e && e.message || e);
      var m = /bloqueio_(captcha|login)/.exec(est.erro);
      est.pausaAte = Date.now() + (m ? 60 : 15) * 60000; // erro = recua e tenta de novo; nunca para sozinho nem contorna captcha
    }
  }

  function agendar() { if (est.parado) return; timer = setTimeout(function () { ciclo().then(agendar, agendar); }, CICLO_MIN * 60000); }
  if (API && TOKEN) { ciclo().then(agendar, agendar); }

  window.__mlcod = {
    status: function () { return { versao: est.versao, enviar: est.enviar, ciclos: est.ciclos, ultimoCiclo: est.ultimoCiclo, erro: est.erro, pausaAteMin: Math.max(0, Math.round((est.pausaAte - Date.now()) / 60000)), naUltimaHora: est.historicoHora.length, feitos: est.feitos.slice(-10), linhas: est.linhas }; },
    testar: testar,
    stop: function () { est.parado = true; if (timer) clearTimeout(timer); return 'parado'; },
  };
  return 'ml-cupom-codigo ' + VERSAO + (API && TOKEN ? ' ciclo iniciado' : ' (sem api/token: só testar())');
})();
