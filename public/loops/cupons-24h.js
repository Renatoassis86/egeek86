/*
 * LOOP DE LEITURA DE CUPOM 24 H (Amazon e Shopee) para a aba logada do dono. SEM prompt, SEM credencial no arquivo.
 * Roda em segundo plano na própria aba (setTimeout encadeado), então quem injeta só inicia e lê o estado.
 *
 * Como iniciar (uma aba por rede; o token vem de fora e fica só na memória desta execução, nunca em localStorage):
 *   1. Aba logada em https://www.amazon.com.br (ou https://shopee.com.br).
 *   2. Injetar window.__CUP_CFG = { api: 'https://SITE', token: '...', rede: 'amazon'|'shopee', enviar: true|false }
 *      (opcionais: lote, pausaMs:[min,max], idleMin, cuponsPaginaMin, cuponsUrl, shopeeLinkCurto:'pular'|'permitir').
 *   3. Injetar este arquivo inteiro. Ele apaga window.__CUP_CFG, guarda o token só na closure e devolve na hora (a chamada não bloqueia).
 *   4. Acompanhar: JSON.stringify(window.__cup.status())  (nunca contém o token).  Parar: window.__cup.stop().
 *   Após recarregar a aba o loop morre: injetar de novo (runbook em docs/03-metodologia/CUPOM_NA_AGULHA.md). Reinjetar sobre um loop vivo o substitui.
 *
 * O que lê: só a fila de GET /api/ingest/cupons-revalidar?rede=...; de cada item, o preço e o selo de cupom/voucher do PRÓPRIO produto.
 * Amazon: página do produto num iframe oculto de mesma origem (o selo é desenhado pelo navegador depois do carregamento; fetch+DOMParser não vê),
 *   só os ids do produto (#couponsInBuybox_feature_div, #couponBadgeRegularVpc, #couponTextpctch*), NUNCA sp_detail* (selos de outros produtos).
 *   Fallback: lista da página oficial de cupons da Amazon (URL descoberta por leitura do menu), só leitura, reordena a fila e cobre o selo
 *   quando o produto não o mostra.
 * Shopee: voucher na página do item (popup/iframe de mesma origem), preferindo o link normal; link curto de afiliado (s.shopee.com.br) é PULADO
 *   por padrão (shopeeLinkCurto: 'permitir' só depois da decisão do dono).
 * Contrato do POST (cupons-revalidar): rows[].coupons[] = { label, price_with_cents?, name?, code? }. `code` = código digitável quando o selo/voucher o escreve
 *   (ex.: 'Código: PRIMEBLACK20'); `name` = título da promoção quando a página o mostra. Opcionais, validados no servidor, nunca inventados: sem eles a mensagem
 *   explica como ativar (Amazon: 'Aplicar cupom' abaixo do preço). NÃO VALIDADO em produção: conferir em status().linhas (simulação) antes de enviar:true.
 * NUNCA para sozinho: captcha/login/403/429/token/origem/pop-up/exceção viram pausa com recuo (teto 30 min) e retomada automática (nunca contorna); só __cup.stop() do operador para; sem preço lido ou sem selo legível a linha é descartada (nada é inventado).
 * Cada ciclo envia batimento a POST /api/ingest/cupons-heartbeat; o servidor avisa a equipe se a rede ficar mais de 60 min sem batimento ok.
 */
(function () {
  'use strict';
  var VERSAO = '1.0.0';

  // =====================================================================================================================
  // LÓGICA PURA (sem DOM, sem rede): testada em scripts/test-cupons-24h.ts
  // =====================================================================================================================
  var PURO = {};

  /** "R$ 1.234,56" -> 123456 (primeiro valor do texto); null se não houver. */
  PURO.centsFrom = function (t) {
    var m = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/.exec(t || '');
    if (!m) return null;
    var dec = m[2] ? (m[2].length === 1 ? +m[2] * 10 : +m[2]) : 0;
    return +m[1].replace(/\./g, '') * 100 + dec;
  };

  var ID_AMAZON_OK = [/^couponsInBuybox_feature_div$/, /^couponBadgeRegularVpc$/, /^couponTextpctch/];
  var ANCESTRAL_PROIBIDO = /sp_detail|sponsored|sims-|similar|a-carousel|ad-feedback|_dp_ads|bundle|recommend/i;

  /** O elemento é selo do PRÓPRIO produto? id permitido, nunca sp_detail*, sem ancestral de carrossel/patrocinado, sem ASIN de outro produto no id. */
  PURO.idProprioAmazon = function (id, ancestorIds, asin) {
    if (!id || /sp_detail/i.test(id)) return false;
    if (!ID_AMAZON_OK.some(function (r) { return r.test(id); })) return false;
    if ((ancestorIds || []).some(function (a) { return ANCESTRAL_PROIBIDO.test(a || ''); })) return false;
    var outro = /(B0[A-Z0-9]{8})/.exec(id);
    if (outro && asin && outro[1].toUpperCase() !== String(asin).toUpperCase()) return false;
    return true;
  };

  /**
   * CÓDIGO digitável do cupom, só quando o texto do selo/voucher o escreve ("Código: PRIMEBLACK20", "Use o código BLACK10"). Ordem do dono, 2026-11-12:
   * a mensagem leva o NOME do cupom com prioridade e, se digitável, "Código: XXXX". Exige o código em MAIÚSCULAS (4 a 20, com letra), logo depois da
   * palavra "código"; palavras comuns ("DESCONTO", "CUPOM") são recusadas. Sem isso devolve null (o servidor também valida). Nada é inventado.
   */
  PURO.codigoDoTexto = function (texto) {
    var t = String(texto || '').replace(/\s+/g, ' ');
    var re = /c[oó]digo(?: promocional)?\s*:?\s*/gi, m;
    var comuns = { CUPOM: 1, CUPONS: 1, VOUCHER: 1, DESCONTO: 1, APLICAR: 1, CODIGO: 1, PROMO: 1, OFERTA: 1, FRETE: 1, GRATIS: 1, ATIVAR: 1, RESGATAR: 1 };
    while ((m = re.exec(t))) {
      var r = /^([A-Z0-9][A-Z0-9_-]{3,19})(?![A-Za-z0-9])/.exec(t.slice(m.index + m[0].length));
      if (r && /[A-Z]/.test(r[1]) && !comuns[r[1]]) return r[1];
    }
    return null;
  };

  /** Anexa o código digitável ao cupom, se o trecho de página próximo dele o escreve. */
  PURO.comCodigo = function (cupom, trecho) {
    var cod = PURO.codigoDoTexto(trecho);
    if (cod) cupom.code = cod;
    return cupom;
  };

  /** Mantém o texto mais completo (descarta o que está contido em outro) e só rótulos com "cupom"/"voucher" curtos. */
  PURO.consolidar = function (textos) {
    var limpos = [];
    (textos || []).forEach(function (t) {
      t = String(t || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 200 && /cupom|cupon|voucher/i.test(t) && limpos.indexOf(t) < 0) limpos.push(t);
    });
    return limpos.filter(function (t) { return !limpos.some(function (o) { return o !== t && o.indexOf(t) >= 0; }); });
  };

  /** candidatos: [{ id, texto, ancestorIds }] -> rótulos do produto. */
  PURO.selosAmazon = function (candidatos, asin) {
    return PURO.consolidar((candidatos || []).filter(function (c) { return PURO.idProprioAmazon(c.id, c.ancestorIds, asin); }).map(function (c) { return c.texto; }));
  };

  /** Descobre a URL oficial de cupons da Amazon pelos links do menu/página: [{ text, href }] -> URL absoluta ou null. */
  PURO.descobrirUrlCupons = function (anchors, base) {
    var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); };
    var cand = null;
    (anchors || []).forEach(function (a) {
      if (cand || !a.href) return;
      var u;
      try { u = new URL(a.href, base); } catch (e) { return; }
      if (!/(^|\.)amazon\.com\.br$/.test(u.hostname)) return;
      var porTexto = /^(cupons?|cupons e ofertas)$/.test(norm(a.text));
      var porRota = /\/(cupons|coupons)(\/|$)|\/promotion\/psp|\/b\/\?node=.*cupon/i.test(u.pathname + u.search);
      if (porTexto || porRota) cand = u.origin + u.pathname + u.search;
    });
    return cand;
  };

  /** Cards da página de cupons: [{ href, texto }] -> [{ asin, label }] (só com cupom escrito e ASIN no link /dp/). */
  PURO.parseListaCupons = function (cards) {
    var out = [], visto = {};
    (cards || []).forEach(function (c) {
      var m = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(c.href || '');
      if (!m || visto[m[1]]) return;
      var t = String(c.texto || '').replace(/\s+/g, ' ').trim();
      var frase = /[^.!?\n]{0,80}cupom[^.!?\n]{0,80}/i.exec(t);
      if (!frase) return;
      var label = frase[0].trim();
      if (label.length < 6) return;
      visto[m[1]] = 1;
      out.push({ asin: m[1], label: label.slice(0, 160) });
    });
    return out;
  };

  /** Reordena a fila: itens cujo ASIN consta na lista oficial de cupons vão para a frente (mantém a ordem relativa). */
  PURO.ordenarFila = function (items, asinsComCupom) {
    var set = {};
    (asinsComCupom || []).forEach(function (a) { set[String(a).toUpperCase()] = 1; });
    var com = [], sem = [];
    (items || []).forEach(function (i) { (set[String(i.ref).toUpperCase()] ? com : sem).push(i); });
    return com.concat(sem);
  };

  /** Shopee: tira parâmetros de rastreio/afiliado; curto = s.shopee.com.br (clique de afiliado, não é o link normal do produto). */
  PURO.limparUrlShopee = function (raw) {
    var u;
    try { u = new URL(raw); } catch (e) { return { url: null, curto: false }; }
    if (!/(^|\.)shopee\.com\.br$/.test(u.hostname)) return { url: null, curto: false };
    if (/^s\.shopee\.com\.br$/i.test(u.hostname)) return { url: u.href, curto: true };
    var drop = [];
    u.searchParams.forEach(function (_v, k) { if (/^(utm_|af_|smtt|mmp_pid|pid$|c$|is_retargeting|sub_id|gads|gclid|fbclid|xptdk)/i.test(k)) drop.push(k); });
    drop.forEach(function (k) { u.searchParams.delete(k); });
    return { url: u.origin + u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : ''), curto: false };
  };

  /** itemId a partir da URL normal da Shopee (-i.<shop>.<item> ou /product/<shop>/<item>). */
  PURO.itemIdShopee = function (href) {
    var m = /(?:-i\.\d+\.|\/product\/\d+\/)(\d{6,19})/.exec(href || '');
    return m ? m[1] : null;
  };

  /** Rótulos de voucher da Shopee: texto com desconto/gasto, prefixo "Voucher " (a rota exige "cupom"/"voucher"). */
  PURO.selosShopee = function (textos) {
    var vistos = [];
    (textos || []).forEach(function (t) {
      t = String(t || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length >= 160 || !/OFF|desconto|gasto|R\$/i.test(t) || !/voucher|cupom|OFF|desconto/i.test(t)) return;
      vistos.push(/voucher|cupom/i.test(t) ? t : 'Voucher ' + t);
    });
    return PURO.consolidar(vistos);
  };

  /** Preço da Shopee: primeiro valor R$ do primeiro texto que tiver um. (O servidor recusa se destoar mais de 50% do preço da oferta.) */
  PURO.precoShopee = function (textos) {
    for (var i = 0; i < (textos || []).length; i++) { var c = PURO.centsFrom(textos[i]); if (c) return c; }
    return null;
  };

  /** Bloqueio -> 'captcha' | 'login' | 'http_403' | 'http_429' | null. Texto de login só vale sem preço lido (o menu da Amazon tem "faça login"). */
  PURO.detectarBloqueio = function (o) {
    o = o || {};
    if (o.status === 429) return 'http_429';
    if (o.status === 403) return 'http_403';
    var p = String(o.pathname || '');
    if (/validatecaptcha|\/errors\/|captcha/i.test(p)) return 'captcha';
    if (/\/ap\/signin|\/ap\/|\/buyer\/login|\/login/i.test(p)) return 'login';
    var t = String(o.texto || '').slice(0, 3000);
    if (/digite os caracteres|n[aã]o sou um rob[oô]|verifique que voc[eê] [eé] humano|verifica[cç][aã]o de seguran[cç]a|robot check/i.test(t)) return 'captcha';
    if (!o.temPreco && /fazer login|entrar na sua conta|fa[cç]a login|identifique-se/i.test(t)) return 'login';
    return null;
  };

  // REGRA DO DONO (2026-11-12): NENHUM LOOP PODE PARAR. Todo problema vira PAUSA com recuo (teto 30 min) e retomada automática, tentando de novo
  // para sempre. Só window.__cup.stop() chamado pelo operador para. Cada pausa manda batimento 'pausado' (o servidor avisa se ficar 60 min sem batimento ok).
  var RECUO = {
    captcha: [15, 30], http_403: [15, 30], http_429: [15, 30], login: [15, 30],
    token_recusado: [15, 30], origem_recusada: [15, 30], popup_bloqueado: [15, 30],
    servidor_desligado: [10, 20, 30], servidor_instavel: [2, 5, 10, 20, 30],
  };

  /** Política: n-ésima ocorrência seguida do mesmo problema -> pausa com recuo (min, teto 30). Nunca devolve 'parar'. */
  PURO.politica = function (tipo, seguidos) {
    var rec = RECUO[tipo] || [5, 15, 30];
    return { acao: 'pausar', motivo: String(tipo), min: rec[Math.min(Math.max(1, seguidos | 0), rec.length) - 1] };
  };

  /** Pausa entre itens: aleatória em [a, b], nunca abaixo do piso. */
  PURO.pausaEntreItens = function (faixa, rnd, piso) {
    var a = Math.max(piso, faixa[0]), b = Math.max(a, faixa[1]);
    return Math.round(a + (rnd == null ? Math.random() : rnd) * (b - a));
  };

  /** Valida a configuração injetada. Devolve { ok, erro? , cfg? } sem nunca devolver o token em mensagem. */
  PURO.validarCfg = function (c, host) {
    if (!c || typeof c !== 'object') return { ok: false, erro: 'window.__CUP_CFG ausente' };
    var rede = c.rede;
    if (rede !== 'amazon' && rede !== 'shopee') return { ok: false, erro: 'rede deve ser amazon ou shopee' };
    var hostOk = rede === 'amazon' ? /(^|\.)amazon\.com\.br$/.test(host) : /(^|\.)shopee\.com\.br$/.test(host);
    if (!hostOk) return { ok: false, erro: 'a aba precisa estar em ' + (rede === 'amazon' ? 'amazon.com.br' : 'shopee.com.br') };
    var api = String(c.api || '').replace(/\/+$/, '');
    if (!/^https:\/\/[^/\s]+$/.test(api)) return { ok: false, erro: 'api deve ser https://dominio (sem caminho)' };
    if (typeof c.token !== 'string' || c.token.length < 32) return { ok: false, erro: 'token ausente ou curto' };
    var faixa = Array.isArray(c.pausaMs) && c.pausaMs.length === 2 ? [+c.pausaMs[0] || 6000, +c.pausaMs[1] || 11000] : [6000, 11000];
    return {
      ok: true,
      cfg: {
        api: api, rede: rede, enviar: c.enviar === true, lote: Math.min(40, Math.max(1, +c.lote || 15)), pausaMs: faixa,
        idleMs: Math.max(1, +c.idleMin || 3) * 60000, // idleMin (minutos) -> ms; intervalo quando a fila está vazia
        cuponsPaginaMin: Math.max(15, +c.cuponsPaginaMin || 60), cuponsUrl: typeof c.cuponsUrl === 'string' ? c.cuponsUrl : null,
        shopeeLinkCurto: c.shopeeLinkCurto === 'permitir' ? 'permitir' : 'pular',
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
  if (window.__cup && typeof window.__cup.stop === 'function') { try { window.__cup.stop('substituido'); } catch (e) { /* ok */ } }

  var entrada = window.__CUP_CFG;
  try { delete window.__CUP_CFG; } catch (e) { window.__CUP_CFG = undefined; } // o token não fica exposto na window
  var v = PURO.validarCfg(entrada, location.hostname);
  if (!v.ok) { window.__cup = { rodando: false, erro: v.erro, status: function () { return { rodando: false, erro: v.erro }; }, stop: function () {} }; return; }
  var CFG = v.cfg;
  var TOKEN = v.token; // só na closure
  v = null; entrada = null;
  var REDE = CFG.rede;

  var S = {
    rede: REDE, versao: VERSAO, rodando: true, enviar: CFG.enviar, iniciadoEm: new Date().toISOString(), ciclos: 0, ultimoCiclo: null, ciclo: null,
    pausa: null, parou: null, proximoEm: null, seguidos: {}, erros: [], linhas: [], cuponsUrl: CFG.cuponsUrl, cuponsPaginaEm: null, cuponsAsins: {},
    puladosLinkCurto: 0, batimento: { okEm: null, falhas: 0, ultimoStatus: null },
    totais: { fila: 0, lidas: 0, enviadas: 0, descartadas: 0, erros: 0 },
  };
  var timer = null;
  var parado = false;
  var frameAtual = null, popupAtual = null;

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function agora() { return new Date().toISOString(); }
  function erro(msg) { S.totais.erros++; S.erros.push({ t: agora(), msg: String(msg).slice(0, 200) }); if (S.erros.length > 20) S.erros.shift(); }
  function linha(o) { o.t = agora(); S.linhas.push(o); if (S.linhas.length > 30) S.linhas.shift(); }
  var txt = function (el) { return el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };

  // ----- servidor -----
  function comTimeout(ms) { var c = new AbortController(); var t = setTimeout(function () { c.abort(); }, ms); return { signal: c.signal, fim: function () { clearTimeout(t); } }; }
  async function api(caminho, opts) {
    var to = comTimeout(25000);
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
    var corpo = { estado: estado, motivo: motivo || undefined, ciclo: S.ciclos, fila: c.fila || 0, lidas: c.lidas || 0, enviadas: c.enviadas || 0, descartadas: c.descartadas || 0, erros: c.erros || 0, versao: VERSAO };
    try {
      var r = await api('/api/ingest/cupons-heartbeat?rede=' + REDE, { method: 'POST', body: JSON.stringify(corpo) });
      S.batimento.ultimoStatus = r.status;
      if (r.ok) { if (estado === 'ok') S.batimento.okEm = agora(); } else S.batimento.falhas++;
    } catch (e) { S.batimento.falhas++; S.batimento.ultimoStatus = 'rede'; }
  }

  // ----- leitores -----
  function bloqueioDoc(doc, win, temPreco) {
    var loc = ''; try { loc = win.location.pathname + win.location.search; } catch (e) { /* ok */ }
    return PURO.detectarBloqueio({ pathname: loc, texto: doc && doc.body ? doc.body.innerText : '', temPreco: temPreco });
  }
  function ancestraisIds(el) { var out = []; for (var n = el && el.parentElement; n; n = n.parentElement) if (n.id) out.push(n.id); return out; }

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

  function precoAmazon(doc) {
    var el = doc.querySelector('#corePrice_feature_div .a-price .a-offscreen, #apex_desktop .a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen');
    return PURO.centsFrom(txt(el));
  }
  function selosAmazonDoc(doc, asin) {
    var cands = [];
    doc.querySelectorAll('#couponsInBuybox_feature_div, #couponBadgeRegularVpc, [id^="couponTextpctch"]').forEach(function (el) {
      cands.push({ id: el.id, texto: txt(el), ancestorIds: ancestraisIds(el) });
    });
    return PURO.selosAmazon(cands, asin);
  }

  /** Produto da Amazon renderizado (iframe oculto de mesma origem). Devolve { ok, asin, seen, selos } | { bloqueio } | { descarte }. */
  async function lerAmazonProduto(item) {
    var f = novoFrame('/dp/' + encodeURIComponent(item.ref));
    try {
      var t0 = Date.now(), viuPreco = null, ultimo = null;
      while (Date.now() - t0 < 24000 && !parado) {
        await sleep(500);
        var doc = docDe(f);
        if (!doc) continue;
        var win = f.contentWindow;
        var seen = precoAmazon(doc);
        var bl = bloqueioDoc(doc, win, !!seen);
        if (bl) return { bloqueio: bl };
        var caixa = doc.querySelector('#buybox, #desktop_buybox, #addToCart_feature_div, #buy-now-button, #rightCol');
        if (seen && caixa) {
          if (viuPreco == null) viuPreco = Date.now();
          ultimo = { doc: doc, win: win, seen: seen };
          var selos = selosAmazonDoc(doc, item.ref);
          var espera = Date.now() - viuPreco;
          if ((selos.length && espera >= 1500) || espera >= 5000) {
            var a = (doc.querySelector('#ASIN, input[name="ASIN"]') || {}).value || (/\/dp\/([A-Z0-9]{10})/.exec(win.location.pathname) || [])[1];
            if (String(a || '').toUpperCase() !== String(item.ref).toUpperCase()) return { descarte: 'asin_diferente:' + a };
            return { ok: true, asin: a, seen: seen, selos: selos, fonte: 'produto' };
          }
        }
      }
      return { descarte: ultimo ? 'selo_nao_estabilizou' : 'nao_renderizou_ou_sem_preco' };
    } finally { fecharFrame(f); }
  }

  /** Descobre (uma vez) a URL da página oficial de cupons da Amazon lendo o menu; só leitura. */
  async function descobrirCuponsUrl() {
    if (S.cuponsUrl) return S.cuponsUrl;
    try {
      var r = await fetch('/', { credentials: 'include' });
      if (r.status !== 200) return null;
      var d = new DOMParser().parseFromString(await r.text(), 'text/html');
      var anchors = [].map.call(d.querySelectorAll('a[href]'), function (a) { return { text: a.textContent, href: a.getAttribute('href') }; });
      S.cuponsUrl = PURO.descobrirUrlCupons(anchors, location.origin);
    } catch (e) { erro('descobrir cupons: ' + e.message); }
    return S.cuponsUrl;
  }

  /** Lê a lista oficial de cupons (no máximo 1 vez por cuponsPaginaMin). Devolve true se não houve bloqueio. */
  async function lerListaCupons() {
    if (REDE !== 'amazon') return true;
    if (S.cuponsPaginaEm && Date.now() - Date.parse(S.cuponsPaginaEm) < CFG.cuponsPaginaMin * 60000) return true;
    var url = await descobrirCuponsUrl();
    S.cuponsPaginaEm = agora(); // mesmo sem URL, não tenta de novo antes do prazo
    if (!url) { erro('página de cupons não descoberta (informe cuponsUrl)'); return true; }
    var f = novoFrame(url);
    try {
      var t0 = Date.now(), ant = -1, estavel = 0, doc = null;
      while (Date.now() - t0 < 25000 && !parado) {
        await sleep(1000);
        doc = docDe(f);
        if (!doc) continue;
        var bl = bloqueioDoc(doc, f.contentWindow, true);
        if (bl) return { bloqueio: bl };
        try { f.contentWindow.scrollBy(0, 900); } catch (e) { /* ok */ }
        var n = doc.querySelectorAll('a[href*="/dp/"]').length;
        estavel = n === ant ? estavel + 1 : 0; ant = n;
        if (n > 0 && estavel >= 3) break;
      }
      if (!doc) return true;
      var cards = [];
      doc.querySelectorAll('a[href*="/dp/"]').forEach(function (a) {
        var c = a, t = '';
        for (var i = 0; i < 6 && c; i++, c = c.parentElement) { t = txt(c); if (t.length > 40 && /cupom/i.test(t)) break; }
        cards.push({ href: a.getAttribute('href'), texto: t.slice(0, 400) });
      });
      var lista = PURO.parseListaCupons(cards);
      S.cuponsAsins = {};
      lista.forEach(function (x) { S.cuponsAsins[x.asin] = x.label; });
      linha({ fonte: 'lista-cupons', url: url, cards: cards.length, comCupom: lista.length });
      return true;
    } finally { fecharFrame(f); }
  }

  /** Shopee: página do item em popup (ou iframe se o popup for bloqueado), mesma origem. */
  async function lerShopee(item) {
    var lim = PURO.limparUrlShopee(item.url);
    if (!lim.url) return { descarte: 'url_invalida' };
    if (lim.curto && CFG.shopeeLinkCurto !== 'permitir') { S.puladosLinkCurto++; return { descarte: 'link_curto_de_afiliado_pulado' }; }
    var w = null, f = null;
    try { w = window.open(lim.url, '_blank', 'width=900,height=700'); } catch (e) { w = null; }
    popupAtual = w;
    var docAtual = function () { try { return w ? w.document : docDe(f); } catch (e) { return null; } };
    var winAtual = function () { return w || (f && f.contentWindow); };
    if (!w) { f = novoFrame(lim.url); }
    try {
      var t0 = Date.now(), pronto = null;
      while (Date.now() - t0 < 25000 && !parado) {
        await sleep(500);
        var doc = docAtual();
        if (!doc || !doc.body) continue;
        var temPreco = doc.body.innerText.length > 500 && /R\$/.test(doc.body.innerText);
        var bl = bloqueioDoc(doc, winAtual(), temPreco);
        if (bl) return { bloqueio: bl };
        if (temPreco) { if (pronto == null) pronto = Date.now(); if (Date.now() - pronto >= 3500) break; }
      }
      var d = docAtual();
      if (!d || pronto == null) return { descarte: w ? 'nao_renderizou' : 'popup_bloqueado' }; // sem popup e iframe vazio: precisa de gesto/permissão do dono
      var id = PURO.itemIdShopee(winAtual().location.href);
      if (String(id || '') !== String(item.ref)) return { descarte: 'item_diferente:' + id };
      // Página real (validada em 2026-11-12): "R$55,25com cupom >ou R$65,00" = preço com cupom e preço sem cupom no bloco de preço do produto.
      var corpo = d.body.innerText.replace(/\s+/g, ' ');
      var mc = /R\$\s*([\d.]+,\d{2})\s*com cupom[\s>]*(?:ou\s*R\$\s*([\d.]+,\d{2}))?/i.exec(corpo);
      if (mc) {
        var com = PURO.centsFrom('R$ ' + mc[1]);
        var base = mc[2] ? PURO.centsFrom('R$ ' + mc[2]) : null;
        if (!base || !com || com >= base) return { descarte: 'cupom_sem_preco_base' };
        return { ok: true, asin: id, seen: base, selos: ['R$ ' + mc[1] + ' com cupom'], cupons: [PURO.comCodigo({ label: 'R$ ' + mc[1] + ' com cupom', price_with_cents: com }, corpo.slice(Math.max(0, mc.index - 250), mc.index + 250))], fonte: 'produto' };
      }
      // Sem o bloco 'com cupom' a página não prova o preço do produto (o texto traz preços de recomendados): não lê nada, nunca chuta preço.
      return { descarte: 'sem_bloco_de_cupom_ou_pagina_sem_detalhe' };
    } finally {
      try { if (w) w.close(); } catch (e) { /* ok */ }
      popupAtual = null; fecharFrame(f);
    }
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

  async function ciclo() {
    var t0 = Date.now();
    S.pausa = null;
    var c = S.ciclo = { n: S.ciclos + 1, inicio: agora(), fila: 0, lidas: 0, enviadas: 0, descartadas: 0, erros: 0 };
    var r;
    try { r = await api('/api/ingest/cupons-revalidar?rede=' + REDE + '&n=' + (REDE === 'amazon' ? 40 : CFG.lote)); }
    catch (e) { return pausarOuParar('servidor_instavel', 'fila: ' + e.message); }
    if (!r.ok) return pausarOuParar(tipoServidor(r.status), 'fila respondeu ' + r.status);
    var fila = await r.json().catch(function () { return null; });
    if (!fila || !Array.isArray(fila.items)) return pausarOuParar('servidor_instavel', 'fila ilegível');
    var items = fila.items;

    if (REDE === 'amazon' && items.length) {
      var lc = await lerListaCupons();
      if (lc && lc.bloqueio) return pausarOuParar(lc.bloqueio, 'página de cupons');
      items = PURO.ordenarFila(items, Object.keys(S.cuponsAsins));
    }
    items = items.slice(0, CFG.lote);
    c.fila = items.length;
    var rows = [];
    for (var i = 0; i < items.length && !parado; i++) {
      var item = items[i], res;
      try { res = REDE === 'amazon' ? await lerAmazonProduto(item) : await lerShopee(item); }
      catch (e) { c.erros++; erro('item ' + item.ref + ': ' + e.message); res = null; }
      if (res && res.bloqueio) { c.lidas = rows.length; await enviarLinhas(rows, c); return pausarOuParar(res.bloqueio, 'item ' + item.ref); }
      if (res && res.descarte === 'popup_bloqueado') { c.lidas = rows.length; await enviarLinhas(rows, c); return pausarOuParar('popup_bloqueado', 'permita pop-ups para shopee.com.br'); }
      if (res && res.ok && res.seen) {
        var selos = res.selos;
        var fonte = res.fonte;
        if (REDE === 'amazon' && !selos.length && S.cuponsAsins[item.ref]) { selos = [S.cuponsAsins[item.ref]]; fonte = 'lista-oficial'; }
        rows.push({ id: item.id, ref: res.asin, price_seen_cents: res.seen, coupons: res.cupons || selos.map(function (label) { var c = { label: label }, cod = PURO.codigoDoTexto(label); if (cod) c.code = cod; return c; }) });
        linha({ ref: item.ref, seen: res.seen, selos: selos, fonte: fonte, codigos: rows[rows.length - 1].coupons.map(function (c) { return c.code || null; }) });
      } else if (res) {
        c.descartadas++;
        linha({ ref: item.ref, descartado: res.descarte || 'sem_preco' });
      }
      if (i < items.length - 1) await sleep(PURO.pausaEntreItens(CFG.pausaMs, null, PISO_PAUSA_MS));
    }
    if (parado) return;
    c.lidas = rows.length;
    var envio = await enviarLinhas(rows, c);
    if (envio === 'parar') return;
    // ciclo concluído sem bloqueio: zera os contadores de recuo
    S.seguidos = {};
    S.totais.fila += c.fila; S.totais.lidas += c.lidas; S.totais.enviadas += c.enviadas; S.totais.descartadas += c.descartadas;
    S.ciclos = c.n; c.fim = agora(); c.duracaoS = Math.round((Date.now() - t0) / 1000);
    S.ultimoCiclo = c; S.ciclo = null;
    await batimento('ok', rows.length === 0 && c.fila === 0 ? 'fila_vazia' : null);
    // fila com itens: segue logo (pausa curta); fila vazia: espera o intervalo ocioso
    agendar(c.fila > 0 ? 30000 : CFG.idleMs);
  }

  /** POST das linhas lidas. Devolve 'parar' se o servidor recusou (já tratado). */
  async function enviarLinhas(rows, c) {
    if (!rows.length) return 'ok';
    if (!CFG.enviar) { linha({ simulacao: true, linhas: rows.length }); return 'ok'; }
    try {
      var p = await api('/api/ingest/cupons-revalidar?rede=' + REDE, { method: 'POST', body: JSON.stringify({ rows: rows }) });
      if (!p.ok) { await pausarOuParar(tipoServidor(p.status), 'envio respondeu ' + p.status); return 'parar'; }
      var j = await p.json().catch(function () { return {}; });
      c.enviadas += (j && j.lidas) || rows.length;
      linha({ enviado: rows.length, resposta: { lidas: j.lidas, com_cupom: j.com_cupom, recusadas: j.recusadas } });
    } catch (e) { await pausarOuParar('servidor_instavel', 'envio: ' + e.message); return 'parar'; }
    return 'ok';
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

  // ----- API pública na window (sem token) -----
  function status() {
    return JSON.parse(JSON.stringify({
      rede: S.rede, versao: S.versao, rodando: S.rodando, enviar: S.enviar, iniciadoEm: S.iniciadoEm, ciclos: S.ciclos, ciclo: S.ciclo, ultimoCiclo: S.ultimoCiclo,
      pausa: S.pausa, parou: S.parou, proximoEm: S.proximoEm, batimento: S.batimento, totais: S.totais, seguidos: S.seguidos,
      cuponsUrl: S.cuponsUrl, cuponsPaginaEm: S.cuponsPaginaEm, cuponsAsins: Object.keys(S.cuponsAsins).length, puladosLinkCurto: S.puladosLinkCurto,
      erros: S.erros.slice(-8), linhas: S.linhas.slice(-12),
    }));
  }
  function stop(motivo) {
    if (parado) return;
    parado = true; clearTimeout(timer);
    S.rodando = false; S.proximoEm = null; S.parou = { em: agora(), motivo: motivo || 'operador' };
    fecharFrame(frameAtual); try { if (popupAtual) popupAtual.close(); } catch (e) { /* ok */ }
    if (S.parou.motivo === 'operador') { batimento('parado', 'operador'); } // substituição por reinjeção não conta como parada
  }
  window.__cup = { status: status, stop: stop, rodando: true, versao: VERSAO };

  // primeiro ciclo logo (assíncrono: a chamada que injeta devolve na hora)
  batimento('ok', 'iniciado').finally(function () { agendar(1500); });
})();
