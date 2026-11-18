/*
 * LOOP DE CUPOM DE ITEM do Mercado Livre (leitura da página do anúncio) para a aba logada do dono. SEM prompt, SEM credencial no arquivo.
 * Substitui o antigo window.__CPI (que parou em 'ml_http_429' e não voltava).
 *
 * Contrato real (src/app/api/ingest/cupons-revalidar e cupons-item; docs/03-metodologia/CUPOM_NA_AGULHA.md):
 *   GET  /api/ingest/cupons-revalidar?rede=mercado-livre&n=20 -> { items: [{ id, url, prioridade, motivo, ultima_leitura_min }] }
 *        (já na ordem de prioridade da agulha e SÓ com leitura devida: meta 45 min p/ prioridades 0-3; janela de frescor da agulha = 120 min)
 *   POST /api/ingest/cupons-item { rows: [{ id, coupons: [{ campaign_id?, label, status, name?, code? }] }] }  (coupons vazio = lido e sem cupom)
 *        name/code (opcionais, só o que a página mostrou; validados no servidor): a mensagem ao cliente leva o NOME do cupom com prioridade.
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
 * NUNCA para sozinho: 429/login/captcha/token/origem/5xx/rede/exceção viram pausa com recuo (teto 30 min) e retomada automática. Nunca contorna captcha/login; só __mlc.stop() do operador para.
 */
(function () {
  'use strict';
  var VERSAO = '1.3.3';

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
  /**
   * NOME da promoção do cupom (ordem do dono, 2026-11-12: a mensagem leva o NOME do cupom). Só o que a página escreve junto do campaign_id no estado
   * embutido (JSON: title/text/label/name/description) e que tem a cara de nome de promoção ("R$ 100 OFF em TV Toshiba", "10% OFF"): começa com
   * valor (R$ ou %) seguido de OFF/de desconto, até 80 caracteres, sem marcação. Nada é inventado: sem texto assim, devolve null e o servidor usa o
   * título da lista de cupons ou o passo a passo "ative em Cupons". NÃO VALIDADO em produção: conferir em status().linhas (simulação) antes de enviar:true.
   */
  PURO.nomeDaCampanha = function (cru, campaignId) {
    cru = String(cru || '');
    if (!campaignId) return null;
    var marca = /"campaign_id"\s*:\s*"?(\d{3,12})"?/g, k, achado = null;
    while (!achado && (k = marca.exec(cru))) {
      if (k[1] !== String(campaignId)) continue;
      var janela = cru.slice(Math.max(0, k.index - 1200), k.index + 1200);
      var re = /"(?:title|text|label|name|description|subtitle)"\s*:\s*"((?:[^"\\]|\\.){3,120})"/g, m;
      while (!achado && (m = re.exec(janela))) {
        var t = m[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (t.length <= 80 && /^(?:R\$\s*\d[\d.,]*|\d{1,2}(?:[.,]\d+)?\s*%)\s*(?:OFF|de desconto)(?![A-Za-z])/i.test(t) && !/<|>|http/i.test(t)) achado = t;
      }
    }
    return achado;
  };

  /**
   * RÓTULO DE CATEGORIA do cupom (#115, 2026-11-15): a página do ML NÃO traz nome próprio de cupom; o estado embutido (benefits.coupons[]) traz só
   * { id, source: 'seller_coupon' | 'new_followers_my_page' | ..., label: 'Cupom da loja' | 'R$ x com Cupom por seguir a loja' | ... }. Medido em 2026-11-15.
   * Devolve 'Cupom da loja' (rótulo escrito pela página, ou source seller_coupon) e null para tudo o mais (preço com cupom, seguir a loja, outras fontes).
   * O servidor trata isso como complemento do valor ("Cupom da loja: R$ 200,00 de desconto"), nunca como nome para ativar.
   */
  PURO.rotuloDaCategoria = function (cru, campaignId) {
    cru = String(cru || '');
    if (!campaignId) return null;
    var re = new RegExp('"id"\\s*:\\s*"' + String(campaignId).replace(/\D/g, '') + '"\\s*,\\s*"benefit_type"[^}]{0,300}?"source"\\s*:\\s*"([a-z_]+)"[\\s\\S]{0,400}?"label"\\s*:\\s*"([^"]{3,80})"');
    var m = re.exec(cru);
    if (!m) return null;
    if (/seguir|follow/i.test(m[1] + ' ' + m[2])) return null;
    if (/^cupom (da loja|do vendedor)$/i.test(m[2].trim())) return m[2].trim();
    return m[1] === 'seller_coupon' ? 'Cupom da loja' : null;
  };

  /**
   * CÓDIGO digitável (cupom que se INSERE no checkout, sem botão de ativar; dono, 2026-11-15). NÃO VALIDADO em produção (o anúncio do exemplo não trazia
   * cupom no momento da medição): só devolve código quando a página o ESCREVE: campo code/coupon_code junto do id da campanha no estado embutido, ou
   * frase "use/insira/digite o cupom|código XXXX" no texto. O servidor valida (4 a 20 [A-Z0-9_-], com letra). null = não há código lido.
   */
  PURO.codigoDaCampanha = function (cru, campaignId, texto) {
    cru = String(cru || '');
    var i = cru.indexOf('"id":"' + campaignId + '"');
    if (i >= 0) {
      var j = cru.slice(i, i + 900), m = /"(?:coupon_code|voucher_code|code)"\s*:\s*"([A-Za-z0-9_-]{4,20})"/.exec(j);
      if (m && /[A-Za-z]/.test(m[1])) return m[1].toUpperCase();
    }
    var t = /(?:[Uu]se|[Ii]nsira|[Dd]igite|[Aa]plique)\s+o\s+(?:cupom|c[óo]digo)\s+([A-Z0-9][A-Z0-9_-]{3,19})(?![A-Za-z0-9_-])/.exec(String(texto || ''));
    return t && /[A-Z]/.test(t[1]) ? t[1] : null;
  };


  /**
   * NOME REAL DO CUPOM (#115, 2026-11-15): o nome está no modal "Ver cupons disponíveis" da página do anúncio, que é um iframe de
   * GET /cupons/pdp?item_id=MLB..&unit_price=<reais inteiros>&quantity=1&loyalty=<nível> (HTML com o estado embutido; sem esses 4 parâmetros devolve a home de cupons).
   * Cada cupom traz campaignId (o MESMO id de benefits.coupons[].id), title.text ("5% OFF", "R$ 20 OFF"), category (a loja: "GHOX"), amount.minAmount/capAmount,
   * action.type ('apply' = botão Aplicar; 'search' = Conferir produtos) e isNewFollowerCoupon. Nome = title.text + ' em ' + category (o mesmo texto do srLabel
   * "Aplicar cupom R$ 20 OFF em GHOX"). Só leitura: nada é clicado nem aplicado. O campo "code" do modal é um token assinado da sessão, NÃO é código digitável: ignorado.
   */
  PURO.urlModalCupons = function (html, itemId) {
    var cru = String(html || '');
    var b = /"base_price"\s*:\s*\{\s*"value"\s*:\s*([\d.]+)/.exec(cru);
    var preco = b ? Math.round(+b[1]) : null;
    var l = /"loyalty_level"\s*:\s*(\d{1,2})/.exec(cru);
    if (!itemId || !preco || preco < 1) return null;
    return '/cupons/pdp?item_id=' + encodeURIComponent(itemId) + '&unit_price=' + preco + '&quantity=1&loyalty=' + (l ? l[1] : '1');
  };

  PURO.cuponsDoModal = function (html) {
    var cru = String(html || ''), out = {};
    var re = /"campaignId"\s*:\s*"(\d{3,12})"/g, m, marcas = [];
    while ((m = re.exec(cru))) marcas.push({ id: m[1], i: m.index });
    for (var k = 0; k < marcas.length; k++) {
      var id = marcas[k].id;
      if (out[id]) continue;
      var fim = k + 1 < marcas.length ? marcas[k + 1].i : marcas[k].i + 2500;
      var bloco = cru.slice(marcas[k].i, Math.min(fim, marcas[k].i + 2500));
      var t = /"title"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.){2,60})"/.exec(bloco);
      if (!t) continue;
      var cat = /"category"\s*:\s*"((?:[^"\\]|\\.){1,60})"/.exec(bloco);
      var ac = /"action"\s*:\s*\{[^}]{0,200}?"type"\s*:\s*"(\w+)"/.exec(bloco);
      var mn = /"minAmount"\s*:\s*"([^"]{1,40})"/.exec(bloco), cp = /"capAmount"\s*:\s*"([^"]{1,40})"/.exec(bloco);
      var un = function (x) { return String(x || '').replace(/\u0026/g, '&').replace(/\u002F/g, '/').replace(/\\"/g, '"').replace(/[\s]+/g, ' ').replace(/\\[uU]0026/g, '&').replace(/\\[uU]002[Ff]/g, '/').trim(); };
      var titulo = un(t[1]);
      out[id] = {
        name: titulo + (cat && un(cat[1]) ? ' em ' + un(cat[1]) : ''),
        acao: ac ? ac[1] : null,
        seguir: /"isNewFollowerCoupon"\s*:\s*true/.test(bloco),
        minimo: mn ? un(mn[1]) : null, limite: cp ? un(cp[1]) : null,
      };
    }
    return out;
  };

  /**
   * PROVA NO ITEM (R-63/R-68): dos cupons lidos na página, só entram os que têm campaign_id E que o modal /cupons/pdp do MESMO item confirma (mapa campanha -> dados).
   * `mapa` null = modal não consultado/inconclusivo (nada é confirmado). Cupom do carrossel de relacionados (outro produto) nunca está no modal do item => cai aqui.
   * Devolve { confirmados, semCampanha, naoConfirmados }.
   */
  PURO.filtrarConfirmados = function (cupons, mapa) {
    var out = { confirmados: [], semCampanha: 0, naoConfirmados: 0 };
    (cupons || []).forEach(function (c) {
      if (!c.campaign_id) { out.semCampanha++; return; }
      var d = mapa && mapa[c.campaign_id];
      if (d) { c.name = d.name; c.acao = d.acao; c.seguir = d.seguir; c.status = 'confirmado_modal'; out.confirmados.push(c); }
      else out.naoConfirmados++;
    });
    return out;
  };

  /**
   * QA 2ª validação (F8b): o que o corpo do modal /cupons/pdp quer dizer. 'cupons' = estrutura de campanhas (JSON com campaignId); 'vazio_explicito' = a página diz literalmente que
   * NÃO há cupons; QUALQUER outra coisa (corpo vazio, HTML de erro, página de verificação que mantém a URL) = 'inconclusivo' => a leitura é DESCARTADA, nunca vira "sem cupom".
   */
  PURO.classificarModal = function (corpo) {
    var t = String(corpo || '');
    if (/"campaignId"\s*:\s*"\d{3,12}"/.test(t)) return 'cupons';
    if (/voc[eê]\s+n[aã]o\s+tem\s+cupons\s+dispon[ií]veis/i.test(PURO.textoDoHtml(t))) return 'vazio_explicito';
    return 'inconclusivo';
  };

  /**
   * Decisão final dos cupons lidos de UMA página (testada por comportamento em scripts/test-prova-cupom-121.ts).
   * `mapa` = campanhas do modal do MESMO item (null = modal não consultado ou inconclusivo). Devolve { descarte } (leitura descartada, volta à fila: NUNCA vira "sem cupom") ou { confirmados }.
   */
  PURO.resolverCupons = function (cupons, mapa) {
    cupons = cupons || [];
    var comCamp = cupons.filter(function (c) { return c.campaign_id; });
    if (comCamp.length && mapa === null) return { descarte: 'modal_inconclusivo', confirmados: [], semCampanha: cupons.length - comCamp.length, naoConfirmados: 0 };
    var f = comCamp.length ? PURO.filtrarConfirmados(comCamp, mapa) : { confirmados: [], naoConfirmados: 0 };
    if (cupons.length > 0 && f.confirmados.length === 0 && comCamp.length === 0) return { descarte: 'cupom_sem_campanha', confirmados: [], semCampanha: cupons.length, naoConfirmados: 0 };
    return { descarte: null, confirmados: f.confirmados, semCampanha: cupons.length - comCamp.length, naoConfirmados: f.naoConfirmados };
  };

  /** 2ª captcha seguida no MESMO item => bloquear o item por 24 h. */
  PURO.deveBloquear = function (n) { return n >= 2; };
  PURO.bloqueado = function (mapa, id, agoraMs) { return !!(mapa && mapa[id] && agoraMs < mapa[id]); };
  /** Espera antes da próxima consulta ao modal: 6 a 10 s desde a anterior (0 se já passou). */
  PURO.esperaModal = function (ultimoMs, agoraMs, rnd) {
    var alvo = 6000 + Math.round((rnd == null ? Math.random() : rnd) * 4000);
    return Math.max(0, alvo - (agoraMs - (ultimoMs || 0)));
  };
  /** Nome em cache por campanha (12 h). Devolve o objeto { name, acao, seguir } ou null. */
  PURO.nomeEmCache = function (cache, campaignId, agoraMs) {
    var e = cache && cache[campaignId];
    return e && agoraMs - e.t < 12 * 3600 * 1000 ? e.d : null;
  };

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
      if (k && /coupon|cupom/i.test(janela)) {
        c.campaign_id = k[1];
        var nome = PURO.nomeDaCampanha(cru, k[1]);
        if (nome) c.name = nome;
        else { var cat = PURO.rotuloDaCategoria(cru, k[1]); if (cat) c.name = cat; }
        var cod = PURO.codigoDaCampanha(cru, k[1], texto);
        if (cod) c.code = cod;
      }
    });
    var mencoes = (texto.match(/cupom|cupon/gi) || []).length;
    return { cupons: cupons, mencoes: mencoes, lidas: cupons.length, ambiguo: cupons.length === 0 && mencoes > 0 };
  };

  /** A página é do anúncio pedido? (o itemId aparece no HTML e há preço em R$) */
  /**
   * DESCONTO POR CARTÃO / MEIO DE PAGAMENTO (#112, 2026-11-15): trechos de texto que a página escreve ("18x R$ 547,33 com cartão Mercado Pago",
   * "R$ 46,65 de cashback em Meli Dólar com seu Cartão de Crédito Mercado Pago", "5% OFF no Pix"). Só texto copiado; o servidor interpreta e nunca inventa preço.
   * NÃO VALIDADO em produção: conferir em status().linhas (simulação) antes de enviar:true. Até 6 trechos, 200 caracteres cada.
   */
  PURO.extrairBeneficiosCartao = function (html) {
    var t = PURO.textoDoHtml(html), out = [], vistos = {};
    var res = [
      /\d{1,2}\s*x\s+R\$\s*[\d.]+,\d{2}(?:\s+sem juros|\s+com\s+[Cc]art[ãa]o\s+[A-ZÀ-Ú]\p{L}+(?: [A-ZÀ-Ú]\p{L}+){0,2})/gu,
      /R\$\s*[\d.]+,\d{2}\s+de\s+cashback(?:\s+em\s+[A-ZÀ-Ú]\p{L}+(?: [A-ZÀ-Ú]\p{L}+)?)?(?:\s+com\s+seu\s+[Cc]art[ãa]o\s+de\s+[Cc]r[eé]dito(?:\s+[A-ZÀ-Ú]\p{L}+(?: [A-ZÀ-Ú]\p{L}+){0,2})?)?/gu,
      /\d{1,2}(?:,\d{1,2})?\s*%\s*(?:OFF\s+|off\s+)?(?:no|via|com)\s+(?:o\s+)?Pix/gu,
      /[Cc]art[ãa]o\s+[A-ZÀ-Ú]\p{L}+(?: [A-ZÀ-Ú]\p{L}+){0,2}\s+e\s+ganhe\s+\d{1,2}(?:,\d{1,2})?\s*%/gu,
    ];


    for (var i = 0; i < res.length; i++) {
      var m;
      while ((m = res[i].exec(t)) && out.length < 6) {
        var x = m[0].replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!vistos[x]) { vistos[x] = 1; out.push(x); }
      }
    }
    return out;
  };

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

  // REGRA DO DONO (2026-11-12): NENHUM LOOP PODE PARAR. Todo problema (login, captcha, token, origem, 403/429, 5xx, rede, exceção) vira PAUSA com recuo
  // (teto 30 min) e retomada automática, tentando de novo para sempre. Só window.__mlc.stop() chamado pelo operador para.
  var RECUO = {
    http_429: [15, 30],                   // ML limitando: pausa longa; depois fica em 30 min
    http_5xx: [1, 2, 5, 10],              // erro do ML: recuo curto
    rede: [1, 2, 5, 10, 20],
    http_5xx_servidor: [1, 2, 5, 10, 20],
    servidor_desligado: [10, 20, 30],
    login: [15, 30], captcha: [15, 30], token_recusado: [15, 30], origem_recusada: [15, 30],
  };

  /** Política: tipo + seguidos => { acao, min }. Nunca devolve 'parar'. */
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

  var MODAL_POR_CICLO = 8;                    // consultas ao modal /cupons/pdp por ciclo (o restante usa o cache ou fica sem nome até o próximo ciclo)
  var BLOQUEIO_MS = 24 * 3600 * 1000;         // item com captcha repetido: não relê por 24 h (nesta sessão)
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
    ciclos: 0, ultimoCiclo: null, totais: { fila: 0, lidos: 0, enviados: 0, comCupom: 0, ambiguos: 0, naoConfere: 0, naoEncontrada: 0, bloqueados: 0, erros: 0 },
    pausasLongas: 0, erros: [], linhas: [], captchaItem: {},
  };
  var parado = false;
  var lidosEm = {};
  var bloqueadoAte = {}, nomesCache = {}, modaisNoCiclo = 0, ultimoModalEm = 0;

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
    // PROVA NO ITEM (2026-11-16, "CUPOM ATIVO P1S Combo NIC.3D R$ 5.799" que não existia): o texto "R$ X com cupom" vem do TEXTO INTEIRO da página (a página de catálogo
    // lista várias ofertas) e pode ser de OUTRO vendedor. O cupom só vale se (1) tem campaign_id no estado embutido da página E (2) o modal /cupons/pdp DESTE item
    // (item_id do link) confirma essa campanha. Sem as duas provas = sem cupom (a leitura segue como "sem cupom", nunca como positiva). Cache só serve para o NOME.
    var comCamp = x.cupons.filter(function (c) { return c.campaign_id; });
    var confirmados = [];
    if (comCamp.length) {
      var mapa = null; // null = modal não consultado ou inconclusivo; {} = modal respondeu sem essa campanha
      var mu = modaisNoCiclo < MODAL_POR_CICLO ? PURO.urlModalCupons(html, id) : null;
      if (mu) {
        var espera = PURO.esperaModal(ultimoModalEm, Date.now(), Math.random());
        if (espera > 0) await dormir(espera);
        modaisNoCiclo++; ultimoModalEm = Date.now();
        try {
          var rm = await fetch(mu, { credentials: 'include', redirect: 'follow' });
          if (rm.status === 429 || rm.status === 403) return { problema: 'http_429', detalhe: 'modal de cupons ' + rm.status };
          if (/captcha|account-verification|\/security/i.test(String(rm.url))) return { problema: 'captcha', detalhe: 'item ' + id + ' modal de cupons em página de verificação' };
          if (rm.status === 200 && /\/cupons\/pdp/.test(rm.url)) {
            var corpoModal = await rm.text();
            var tipoModal = PURO.classificarModal(corpoModal);
            if (tipoModal === 'cupons') { mapa = PURO.cuponsDoModal(corpoModal); Object.keys(mapa).forEach(function (k) { nomesCache[k] = { d: mapa[k], t: Date.now() }; }); }
            else if (tipoModal === 'vazio_explicito') mapa = {};
          }
        } catch (e) { /* inconclusivo: sem confirmação nesta leitura */ }
      }
      // QA F8/F8b: modal não consultado, exceção, corpo ilegível ou ambíguo => DESCARTA a leitura (volta à fila); NUNCA vira "sem cupom".
    }
    var dec = PURO.resolverCupons(x.cupons, comCamp.length ? mapa : {});
    if (dec.semCampanha) S.totais.cupomSemCampanha = (S.totais.cupomSemCampanha || 0) + dec.semCampanha;
    if (dec.naoConfirmados) S.totais.cupomNaoConfirmado = (S.totais.cupomNaoConfirmado || 0) + dec.naoConfirmados;
    if (dec.descarte) { S.totais.modalInconclusivo = (S.totais.modalInconclusivo || 0) + (dec.descarte === 'modal_inconclusivo' ? 1 : 0); return { descarte: dec.descarte }; }
    confirmados = dec.confirmados;
    x.cupons = confirmados;
    if (x.ambiguo) { S.totais.ambiguos++; return { descarte: 'ambiguo_mencao_a_cupom_sem_preco' }; }
    if (x.cupons.length) S.totais.comCupom++;
    var bc = PURO.extrairBeneficiosCartao(html);
    var row = { id: item.id, coupons: x.cupons };
    if (bc.length) row.beneficios_cartao = bc;
    return { row: row, cupons: x.cupons.length };
  }

  async function ciclo() {
    var items = await buscarFila();
    if (items === null) return 'fim';
    var c = { n: S.ciclos + 1, inicio: agora(), fila: 0, lidos: 0, enviados: 0, descartados: 0 };
    modaisNoCiclo = 0;
    var novos = PURO.filtrarFila(items, lidosEm, Date.now(), REL_MIN_SESSAO).filter(function (i) { return !PURO.bloqueado(bloqueadoAte, i.id, Date.now()); });
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
        // CAPTCHA REAL (a página final é /captcha/wall/...; confirmado em 2026-11-15, não é falso positivo): o ciclo pausa (insistir agrava), mas o MESMO item
        // não volta para o início da fila sem fim: na 2ª vez seguida vira 'bloqueado' por 24 h nesta sessão e o ciclo segue com os demais depois da pausa.
        var pulou = false;
        if (res.problema === 'captcha') {
          S.captchaItem[it.id] = (S.captchaItem[it.id] || 0) + 1;
          if (PURO.deveBloquear(S.captchaItem[it.id])) { bloqueadoAte[it.id] = Date.now() + BLOQUEIO_MS; S.totais.bloqueados++; pulou = true; linha({ id: it.id, bloqueado: 'captcha_repetido_24h' }); }
        }
        if (await problema(res.problema, res.detalhe)) return 'fim';
        if (!pulou) i--; // refaz o MESMO item depois da pausa
        continue;
      }
      delete S.captchaItem[it.id];
      sucesso();
      lidosEm[it.id] = Date.now(); S.totais.lidos++; c.lidos++;
      if (res.row) { rows.push(res.row); linha({ id: it.id, prio: it.prioridade, cartao: res.row.beneficios_cartao || [], cupons: res.row.coupons.map(function (x) { return x.label + (x.campaign_id ? ' #' + x.campaign_id : '') + (x.name ? ' [nome: ' + x.name + (x.acao ? ' | ' + x.acao : '') + (x.seguir ? ' | seguir loja' : '') + ']' : ''); }) }); }
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

// BATIMENTO-GERAL v1 (2026-11-18, metodologia Chrome): um batimento por minuto para /api/ingest/loop-saude (estado, versao, atraso do timer, visibilidade, memoria).
// O vigia le o banco (scripts/vigia-loops.ts) em vez de sondar a aba por CDP; atraso grande do timer = aba congelada ou thread principal travada.
(function () {
  try {
    var NOME = 'ml-cupons-item', REDE = 'mercado-livre', GLOBAL = '__mlc', CFG = window['__MLC_CFG'] || {};
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
