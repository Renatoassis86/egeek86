/*
 * LOOP DA RASPAGEM GERAL DO PORTAL DE CUPONS DO MERCADO LIVRE (#116) para a aba logada do dono. SÓ LEITURA. SEM prompt, SEM credencial no arquivo.
 * Percorre a lista do portal (GET /cupons/filter?all=true&page=N, página a página), monta um cupom por campanha (nome/título, valor, mínimo, limite,
 * escopo, validade, tipo de uso) e envia cada página como um lote para POST /api/ingest/cupons. No fim da lista, sem erro de página, pede o FECHAMENTO da
 * varredura: o que o portal deixou de listar vira 'vencido' no servidor (com travas: queda brusca de leitura não fecha nada).
 * Substitui a varredura avulsa de 2026-11-12 (sem código no repositório; as 4.622 linhas dela nunca mais foram atualizadas).
 *
 * Como iniciar (aba em https://www.mercadolivre.com.br, de preferência NÃO a do gerador de links nem a do loop de cupom de item; token só em memória):
 *   1. window.__MLP_CFG = { api: 'https://www.egeek86.com', token: '...', enviar: false };   // comece em SIMULAÇÃO (lê 2 páginas, mostra, para)
 *      opcionais: pausaMs ([4000, 8000], piso 4000), cicloMin (90, piso 60), maxPaginas (150 por ciclo), simPaginas (2)
 *   2. Injetar este arquivo inteiro. Ele apaga window.__MLP_CFG, guarda o token na closure e devolve na hora.
 *   3. Acompanhar: JSON.stringify(window.__mlp.status()).  Simulação: JSON.stringify(window.__mlp.simulacao()).  Parar: window.__mlp.stop().
 *   CONFIRA na simulação (status().linhas[0].diagnostico e simulacao()): título, escopo, mínimo, limite e validade lidos de cada campanha. Só então enviar:true.
 *
 * Gentil com o ML (o __mlc tomou captcha em 2026-11-15): 1 requisição a cada 4 a 8 s, no máximo 150 páginas por ciclo, ciclo a cada 90 min (piso 60).
 * NUNCA para sozinho (regra do dono): captcha/login/403/429/5xx/rede/token/origem/exceção viram pausa com recuo (teto 60 min) e retomada na MESMA página;
 * nunca contorna captcha. Só window.__mlp.stop() do operador para. Reinjetar sobre um loop vivo o substitui. Recarregar a aba o mata.
 * Nada é clicado, ativado, aplicado ou seguido: só GET de listagem. Não envia batimento (usa collector_runs 'cupons-assistida', gravado a cada lote).
 */
(function () {
  'use strict';
  var VERSAO = 'portal-1.0.0';
  var BASE = '/cupons/filter?all=true&page=';

  // =====================================================================================================================
  // LÓGICA PURA (sem DOM, sem rede): testada em scripts/test-raspagem-cupons.ts
  // =====================================================================================================================
  var PURO = {};

  PURO.un = function (s) {
    s = String(s == null ? '' : s);
    try { return JSON.parse('"' + s.replace(/(^|[^\\])"/g, '$1\\"') + '"').replace(/\s+/g, ' ').trim(); } catch (e) { /* cai no manual */ }
    return s.replace(/\\u0026/gi, '&').replace(/\\u002f/gi, '/').replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
  };

  /** "1.000" -> 100000; "12,50" -> 1250; "13" -> 1300; senão null. */
  PURO.brlCents = function (t) {
    var m = /^\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*$/.exec(String(t || ''));
    if (!m) return null;
    var dec = m[2] ? (m[2].length === 1 ? +m[2] * 10 : +m[2]) : 0;
    return +m[1].replace(/\./g, '') * 100 + dec;
  };

  var MESES = { janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11 };
  var semAcento = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

  /** Fim do dia (23:59:59) em Brasília (UTC-3, sem horário de verão) como ISO UTC. */
  PURO.fimDoDia = function (y, m, d) { return new Date(Date.UTC(y, m, d + 1, 2, 59, 59)).toISOString(); };

  /**
   * "Vence hoje!", "Vence amanhã", "Vence 21 de novembro", "Vence 1 de dezembro de 2026", "Vence em 3 dias", "Válido até 30/11/2026" -> { iso, raw } (fim do dia, BRT).
   * "Encerra em" sem número (contagem) e qualquer outro texto -> null (validade fica ausente; nada é deduzido).
   */
  PURO.vencimento = function (texto, agoraMs) {
    var raw = String(texto || '').replace(/\s+/g, ' ').trim();
    var t = semAcento(raw);
    if (!/^(vence|valido|encerra|expira|termina|ate)/.test(t)) return null;
    var b = new Date(agoraMs - 3 * 3600000), y = b.getUTCFullYear(), mo = b.getUTCMonth(), d = b.getUTCDate();
    if (/\bhoje\b/.test(t)) return { iso: PURO.fimDoDia(y, mo, d), raw: raw };
    if (/\bamanha\b/.test(t)) return { iso: PURO.fimDoDia(y, mo, d + 1), raw: raw };
    var n = /\bem\s+(\d{1,3})\s+dias?\b/.exec(t);
    if (n) return { iso: PURO.fimDoDia(y, mo, d + (+n[1])), raw: raw };
    var num = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
    if (num) return { iso: PURO.fimDoDia(+num[3], +num[2] - 1, +num[1]), raw: raw };
    var x = /(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/.exec(t);
    if (x && MESES[x[2]] !== undefined) {
      var ano = x[3] ? +x[3] : y;
      var iso = PURO.fimDoDia(ano, MESES[x[2]], +x[1]);
      if (!x[3] && Date.parse(iso) < agoraMs - 86400000) iso = PURO.fimDoDia(ano + 1, MESES[x[2]], +x[1]);
      return { iso: iso, raw: raw };
    }
    return null;
  };

  /**
   * Blocos de campanha no HTML da página (estado embutido): cada "campaignId" abre um bloco que vai até o próximo campaignId (máx. 3500 caracteres).
   * Em cada bloco guarda os TEXTOS na ordem (title.text, subtítulos, "Compra mínima ...", "Limite de ...", "Vence ...") e as fichas de tipo de uso.
   */
  PURO.blocos = function (html) {
    var cru = String(html || ''), re = /"campaignId"\s*:\s*"?(\d{3,12})"?/g, m, marcas = [], out = [], vistos = {};
    while ((m = re.exec(cru))) marcas.push({ id: m[1], i: m.index });
    for (var k = 0; k < marcas.length; k++) {
      var id = marcas[k].id;
      if (vistos[id]) continue;
      vistos[id] = 1;
      var fim = k + 1 < marcas.length ? marcas[k + 1].i : marcas[k].i + 3500;
      var bloco = cru.slice(marcas[k].i, Math.min(fim, marcas[k].i + 3500));
      // textos na ordem: valores das chaves de conteúdo (title.text, subtitle, label...) e, em listas, as strings que têm cara de condição do cupom
      var textos = [], rt = /(?:"([A-Za-z_]+)"\s*:\s*|[\[,]\s*)"((?:[^"\\]|\\.){2,200})"(?!\s*:)/g, q;
      var CHAVES = { text: 1, label: 1, title: 1, subtitle: 1, description: 1, name: 1, srLabel: 1, accessibilityLabel: 1 };
      var CARA = /^(Em\s|Compra m[ií]nima|Limite|Vence|V[aá]lido|Encerra|Expira|Termina)/i;
      while ((q = rt.exec(bloco))) {
        var s = PURO.un(q[2]);
        if (!s || /https?:|\/\/|[{}<>]/.test(s) || s.length > 160) continue;
        if (!((q[1] && CHAVES[q[1]]) || CARA.test(s))) continue;
        if (textos.indexOf(s) < 0) textos.push(s);
      }
      var cat = /"category"\s*:\s*"((?:[^"\\]|\\.){1,60})"/.exec(bloco);
      var at = /"(?:activation|activationType|activation_type|ativacao)"\s*:\s*"([A-Z_]{4,20})"/.exec(bloco) || /"(AUTOMATIC|EU_QUERO)"/.exec(bloco);
      var ac = /"action"\s*:\s*\{[^}]{0,200}?"type"\s*:\s*"(\w+)"/.exec(bloco);
      out.push({
        id: id, textos: textos, categoria: cat ? PURO.un(cat[1]) : null, ativacao: at ? at[1] : null, acao: ac ? ac[1] : null,
        seguir: /"isNewFollowerCoupon"\s*:\s*true/.test(bloco), bruto: bloco.slice(0, 400),
      });
    }
    return out;
  };

  /** "Em todo o Mercado Livre", "Em todo o site", "Em todos os produtos do Mercado Livre", "Em todas as categorias": o cartão declara plataforma inteira. */
  PURO.ehEscopoPlataforma = function (t) {
    var x = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    return /^em (todo o|todo|todos os|todas as) (site|mercado ?livre|marketplace|anuncios|produtos do mercado ?livre|produtos do site|categorias|produtos e categorias)$/.test(x)
      || /^em (todo o|toda a) (plataforma|loja do mercado ?livre)$/.test(x) || /^em todo o mercado ?livre$/.test(x);
  };

  /** Um bloco -> { cupom } no contrato de POST /api/ingest/cupons, ou { descarte: 'motivo' }. Nada é deduzido: o que não foi lido fica de fora. */
  PURO.montarCupom = function (b, pagina, agoraMs, origem) {
    var tx = b.textos || [];
    var find = function (re) { for (var i = 0; i < tx.length; i++) if (re.test(tx[i])) return tx[i]; return null; };
    var titulo = null;
    for (var i = 0; i < tx.length && !titulo; i++) if (/(\d+(?:[.,]\d+)?\s*%|R\$\s*\d)/.test(tx[i]) && /off|desconto|cashback/i.test(tx[i]) && tx[i].length <= 60) titulo = tx[i];
    if (!titulo) { var fr = find(/frete\s+gr[aá]tis/i); if (fr && fr.length <= 60) titulo = fr; }
    if (!titulo) return { descarte: 'sem_titulo' };
    var tipo, valor = null, unidade = null;
    var pct = /(\d+(?:[.,]\d+)?)\s*%/.exec(titulo), brl = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/.exec(titulo);
    if (/cashback/i.test(titulo)) { tipo = 'cashback'; if (pct) { valor = +pct[1].replace(',', '.'); unidade = 'percentual'; } else if (brl) { valor = PURO.brlCents(brl[1] + (brl[2] ? ',' + brl[2] : '')) / 100; unidade = 'reais'; } else return { descarte: 'cashback_sem_valor' }; }
    else if (/frete/i.test(titulo) && !pct && !brl) tipo = 'frete';
    else if (pct) { tipo = 'percentual'; valor = +pct[1].replace(',', '.'); unidade = 'percentual'; }
    else if (brl) { tipo = 'valor_fixo'; valor = PURO.brlCents(brl[1] + (brl[2] ? ',' + brl[2] : '')) / 100; unidade = 'reais'; }
    else return { descarte: 'valor_nao_lido' };
    if (valor !== null && !(valor > 0)) return { descarte: 'valor_nao_lido' };
    var escTxt = find(/^em\s/i);
    var mm = /compra m[ií]nima\s*(?:de\s*)?R\$\s*([\d.]+(?:,\d{1,2})?)/i, ll = /limite(?:\s*de)?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i;
    var minT = find(mm), limT = find(ll);
    var minC = minT ? PURO.brlCents(mm.exec(minT)[1]) : null, limC = limT ? PURO.brlCents(ll.exec(limT)[1]) : null;
    var escopo, ref = {};
    var loja = escTxt ? /^em produtos d[eao]s?\s+(.{1,80})$/i.exec(escTxt) : null;
    if (loja) { escopo = 'lista_itens'; ref = { vendedores: [loja[1].trim()] }; }
    // Cupom de PLATAFORMA INTEIRA (2026-11-16): só quando o cartão DECLARA que vale em todo o site; sem declaração, nada é presumido (cai em categoria ou descarte).
    else if (escTxt && PURO.ehEscopoPlataforma(escTxt)) { escopo = 'loja_inteira'; ref = {}; }
    else if (escTxt && escTxt.length <= 80) { escopo = 'categoria'; ref = { categorias: [escTxt.replace(/^em\s+/i, '').trim()] }; }
    else return { descarte: 'sem_escopo_lido' };
    var vtx = find(/^(vence|v[aá]lido|encerra|expira|termina)/i);
    var venc = vtx ? PURO.vencimento(vtx, agoraMs) : null;
    var uso = b.seguir ? 'seguir_loja' : /AUTOMATIC/i.test(b.ativacao || '') ? 'automatico' : /EU_QUERO|MANUAL/i.test(b.ativacao || '') || b.acao === 'apply' ? 'ativar' : null;
    var cond = [escTxt, minT, limT].filter(Boolean).join('. ');
    var c = {
      tipo: tipo, escopo: escopo, escopo_ref: ref,
      texto_bruto: tx.join(' | ').slice(0, 1500),
      // estável entre leituras (sem "Vence ..."): o hash de deduplicação usa isto; o id da campanha separa campanhas iguais de lojas diferentes.
      condicoes_texto: ('Campanha ' + b.id + '. ' + titulo + '. ' + cond).slice(0, 1400),
      condicoes: { campanha_id: String(b.id), uso: uso, ativacao: b.ativacao || null, origem: origem || 'portal_cupons' },
      publico: 'todos',
      fonte_url: location.origin + BASE + pagina, fonte_tipo: 'portal_listagem',
    };
    if (valor !== null) { c.valor = valor; c.valor_unidade = unidade; }
    if (minC) c.minimo_compra_centavos = minC;
    if (limC) c.teto_desconto_centavos = limC;
    if (!c.condicoes.uso) delete c.condicoes.uso;
    if (!c.condicoes.ativacao) delete c.condicoes.ativacao;
    if (b.seguir) { c.publico = 'outro'; c.publico_texto = 'Exige seguir a loja'; }
    if (venc) { c.validade_fim = venc.iso; c.validade_origem = 'texto_da_pagina'; c.validade_texto = venc.raw.slice(0, 190); }
    return { cupom: c };
  };

  /** Resposta da página do ML -> 'ok' | 'http_429' | 'http_5xx' | 'login' | 'captcha' | 'nao_encontrada'. */
  PURO.tipoPagina = function (o) {
    o = o || {};
    var u = String(o.finalUrl || '');
    if (/captcha|account-verification|\/security/i.test(u)) return 'captcha';
    if (/\/login|\/jms\/mlb\/lgz|\/registration/i.test(u)) return 'login';
    if (o.status === 429 || o.status === 403) return 'http_429';
    if (o.status >= 500) return 'http_5xx';
    if (o.status === 404 || o.status === 410) return 'nao_encontrada';
    if (o.status !== 200) return 'http_5xx';
    if (/n[aã]o sou um rob[oô]|por seguran[cç]a, complete esta etapa/i.test(String(o.texto || '').slice(0, 3000))) return 'captcha';
    return 'ok';
  };

  var RECUO = {
    captcha: [30, 60], login: [15, 30, 60], http_429: [30, 60], http_5xx: [2, 5, 10, 20], rede: [1, 2, 5, 10, 20],
    http_5xx_servidor: [1, 2, 5, 10, 20], servidor_desligado: [10, 20, 30, 60], token_recusado: [15, 30, 60], origem_recusada: [15, 30, 60],
    leitura_vazia: [30, 60],
  };
  /** Nunca devolve 'parar' (regra do dono): tipo + seguidos => { acao:'pausar', min }. */
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
    if (!c || typeof c !== 'object') return { ok: false, erro: 'window.__MLP_CFG ausente' };
    if (!/(^|\.)mercadolivre\.com\.br$/.test(host)) return { ok: false, erro: 'a aba precisa estar em mercadolivre.com.br' };
    var api = String(c.api || '').replace(/\/+$/, '');
    if (!/^https:\/\/[^/\s]+$/.test(api)) return { ok: false, erro: 'api deve ser https://dominio (sem caminho)' };
    if (typeof c.token !== 'string' || c.token.length < 32) return { ok: false, erro: 'token ausente ou curto' };
    var faixa = Array.isArray(c.pausaMs) && c.pausaMs.length === 2 ? [+c.pausaMs[0] || 4000, +c.pausaMs[1] || 8000] : [4000, 8000];
    return { ok: true, cfg: { api: api, enviar: c.enviar === true, pausaMs: faixa, cicloMs: Math.max(60, +c.cicloMin || 90) * 60000, maxPaginas: Math.min(300, Math.max(5, +c.maxPaginas || 150)), simPaginas: Math.min(5, Math.max(1, +c.simPaginas || 2)) }, token: c.token };
  };

  var PISO_PAUSA_MS = 4000;
  var VARREDURA_MAX_MS = 6 * 3600000;

  if (typeof module !== 'undefined' && module.exports) { module.exports = PURO; return; }

  // =====================================================================================================================
  // LOOP NO NAVEGADOR
  // =====================================================================================================================
  if (window.__mlp && typeof window.__mlp.stop === 'function') { try { window.__mlp.stop('substituido'); } catch (e) { /* ok */ } }
  var entrada = window.__MLP_CFG;
  try { delete window.__MLP_CFG; } catch (e) { window.__MLP_CFG = undefined; }
  var v = PURO.validarCfg(entrada, location.hostname);
  if (!v.ok) { window.__mlp = { rodando: false, erro: v.erro, status: function () { return { rodando: false, erro: v.erro }; }, stop: function () {} }; return; }
  var CFG = v.cfg, TOKEN = v.token;
  v = null; entrada = null;

  var S = {
    versao: VERSAO, rodando: true, enviar: CFG.enviar, iniciadoEm: new Date().toISOString(), pausa: null, parou: null, proximoEm: null, seguidos: {},
    ciclos: 0, varredura: null, ultimaVarredura: null, sim: [],
    totais: { paginas: 0, blocos: 0, montados: 0, enviados: 0, gravados: 0, novos: 0, rejeitados: 0, descartados: 0, fechamentos: 0, vencidosPorFechamento: 0, erros: 0 },
    descartes: {}, rejeicoes: {}, erros: [], linhas: [],
  };
  var parado = false, timer = null;

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

  function novaVarredura() { return { inicio: agora(), inicioMs: Date.now(), proxima: 1, paginas: 0, cupons: 0, erros: 0, vazias: 0, fim: false, vistos: {} }; }

  /** Lê UMA página da lista. { blocos } | { bloqueio } | { descarte }. */
  async function lerPagina(n) {
    var r;
    try { r = await fetch(BASE + n, { credentials: 'include', redirect: 'follow' }); }
    catch (e) { return { bloqueio: 'rede', detalhe: e.message }; }
    var html = await r.text().catch(function () { return ''; });
    var tp = PURO.tipoPagina({ status: r.status, finalUrl: r.url, texto: html.length < 4000 ? html.replace(/<[^>]+>/g, ' ') : '' });
    if (tp === 'nao_encontrada') return { blocos: [], fimPorStatus: true };
    if (tp !== 'ok') return { bloqueio: tp, detalhe: 'página ' + n + ' status ' + r.status };
    return { blocos: PURO.blocos(html) };
  }

  async function enviarLote(cupons, pagina) {
    var corpo = { rede: 'mercado-livre', fonte_url: location.origin + BASE + pagina, lidos_em: agora(), leitura_completa: false, cupons: cupons };
    if (!CFG.enviar) { S.sim.push(corpo); if (S.sim.length > 5) S.sim.shift(); return 'ok'; }
    try {
      var r = await api('/api/ingest/cupons', { method: 'POST', body: JSON.stringify(corpo) });
      var tp = r.status === 400 ? null : PURO.tipoHttp(r.status); // 400 = lote recusado inteiro: segue (o motivo vai no log), não é falha do servidor
      if (tp) { await pausarOuParar(tp, 'envio respondeu ' + r.status); return 'parar'; }
      var j = await r.json().catch(function () { return {}; });
      S.totais.enviados += cupons.length; S.totais.gravados += j.gravados || 0; S.totais.novos += j.novos || 0;
      (j.rejeitados || []).forEach(function (x) { S.totais.rejeitados++; S.rejeicoes[x.reason] = (S.rejeicoes[x.reason] || 0) + 1; });
      if (r.status === 400) linha({ pagina: pagina, recusado: j.error || 'lote_recusado' });
    } catch (e) { await pausarOuParar('rede', 'envio: ' + e.message); return 'parar'; }
    return 'ok';
  }

  async function fecharVarredura(vv) {
    var corpo = { rede: 'mercado-livre', fonte_url: location.origin + BASE + '1', lidos_em: agora(),
      fechar_varredura: { inicio_em: vv.inicio, fonte_prefixo: location.origin + '/cupons/filter', cupons_lidos: vv.cupons, paginas_lidas: vv.paginas, fim_da_lista: true, paginas_com_erro: vv.erros } };
    if (!CFG.enviar) { linha({ fechamento_simulado: { cupons: vv.cupons, paginas: vv.paginas } }); return 'ok'; }
    try {
      var r = await api('/api/ingest/cupons', { method: 'POST', body: JSON.stringify(corpo) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) { linha({ fechamento_recusado: j.error || r.status }); return 'ok'; }
      if (j.fechado) { S.totais.fechamentos++; S.totais.vencidosPorFechamento += j.vencidos || 0; }
      linha({ fechamento: j.fechado === true, motivo: j.motivo, vencidos: j.vencidos, sumidos_recentes: j.vistos_recentes_sumidos });
    } catch (e) { erro('fechamento: ' + e.message); }
    return 'ok';
  }

  async function ciclo() {
    S.pausa = null;
    if (!S.varredura || Date.now() - S.varredura.inicioMs > VARREDURA_MAX_MS) S.varredura = novaVarredura();
    var vv = S.varredura, feitas = 0, limite = CFG.enviar ? CFG.maxPaginas : CFG.simPaginas;
    while (!parado && feitas < limite && !vv.fim) {
      var res = await lerPagina(vv.proxima);
      if (res.bloqueio) return pausarOuParar(res.bloqueio, res.detalhe || 'página ' + vv.proxima);
      feitas++; S.seguidos = {};
      var novos = res.blocos.filter(function (b) { return !vv.vistos[b.id]; });
      if (!res.blocos.length || !novos.length) {
        // página vazia ou só repetida (o portal repete a última página além do fim): duas seguidas = fim da lista
        vv.vazias++;
        if (vv.paginas === 0) return pausarOuParar('leitura_vazia', 'a primeira página não trouxe campanhas (estrutura mudou ou sessão sem lista)');
        if (vv.vazias >= 2 || res.fimPorStatus) { vv.fim = true; break; }
        vv.proxima++; await sleep(PURO.pausaEntre(CFG.pausaMs, null, PISO_PAUSA_MS)); continue;
      }
      vv.vazias = 0;
      var montados = [], descartes = {};
      novos.forEach(function (b) {
        vv.vistos[b.id] = 1;
        var m = PURO.montarCupom(b, vv.proxima, Date.now());
        if (m.cupom) montados.push(m.cupom); else { descartes[m.descarte] = (descartes[m.descarte] || 0) + 1; S.descartes[m.descarte] = (S.descartes[m.descarte] || 0) + 1; S.totais.descartados++; }
      });
      S.totais.paginas++; S.totais.blocos += novos.length; S.totais.montados += montados.length; vv.paginas++; vv.cupons += montados.length;
      if (S.linhas.length === 0 || (!CFG.enviar && vv.paginas === 1)) linha({ pagina: vv.proxima, diagnostico: { blocos: novos.length, montados: montados.length, descartes: descartes, primeiroBloco: novos[0] && { id: novos[0].id, textos: novos[0].textos.slice(0, 8), ativacao: novos[0].ativacao, acao: novos[0].acao, bruto: novos[0].bruto.slice(0, 300) } } });
      else linha({ pagina: vv.proxima, blocos: novos.length, montados: montados.length, descartes: descartes });
      if (montados.length && await enviarLote(montados, vv.proxima) === 'parar') return;
      vv.proxima++;
      await sleep(PURO.pausaEntre(CFG.pausaMs, null, PISO_PAUSA_MS));
    }
    if (parado) return;
    S.ciclos++;
    if (vv.fim) {
      if (vv.erros === 0) await fecharVarredura(vv);
      S.ultimaVarredura = { inicio: vv.inicio, fim: agora(), paginas: vv.paginas, cupons: vv.cupons, erros: vv.erros };
      S.varredura = null;
    }
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
    var vv = S.varredura;
    return JSON.parse(JSON.stringify({
      versao: S.versao, rodando: S.rodando, enviar: S.enviar, iniciadoEm: S.iniciadoEm, ciclos: S.ciclos,
      varredura: vv && { inicio: vv.inicio, proxima: vv.proxima, paginas: vv.paginas, cupons: vv.cupons, erros: vv.erros, fim: vv.fim }, ultimaVarredura: S.ultimaVarredura,
      pausa: S.pausa, parou: S.parou, proximoEm: S.proximoEm, totais: S.totais, descartes: S.descartes, rejeicoes: S.rejeicoes, erros: S.erros.slice(-8), linhas: S.linhas.slice(-12),
    }));
  }
  function stop(motivo) {
    if (parado) return;
    parado = true; clearTimeout(timer); S.rodando = false; S.proximoEm = null; S.parou = { em: agora(), motivo: motivo || 'operador' };
  }
  function simulacao() { return JSON.parse(JSON.stringify(S.sim)); }
  window.__mlp = { status: status, stop: stop, simulacao: simulacao, rodando: true, versao: VERSAO };

  agendar(2000);
})();
