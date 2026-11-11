/*
 * LOOP DE LEITURA DE CUPOM (Amazon e Shopee) para o Chrome logado do dono. Sem credenciais no arquivo.
 *
 * Como usar (uma rede por aba):
 *   1. Abra uma aba logada em https://www.amazon.com.br (ou https://shopee.com.br).
 *   2. Console (F12) -> cole este arquivo inteiro -> Enter.
 *   3. Ele pergunta: endereço do site Espaço Geek 86 (https://...) e o token de ingestão (o mesmo valor das rotas assistidas; fica só na
 *      memória desta execução, não é gravado em lugar nenhum). Sem token o servidor responde 503 (kill-switch).
 *   4. Começa em SIMULAÇÃO (CFG.enviar = false): só mostra no console o que leria. Confira os rótulos e preços; depois rode de novo com
 *      CFG.enviar = true (mude a linha abaixo) para gravar.
 *
 * O que lê: só a fila devolvida por GET /api/ingest/cupons-revalidar?rede=... (no máximo CFG.lote itens por ciclo, com pausa entre eles).
 * Nada de varredura fora da fila. Para no primeiro captcha, login ou status diferente de 200 (nunca tenta contornar).
 * Lê só: o preço do item na página, o selo de cupom/voucher e o ASIN/itemId. Não lê conta, carrinho, endereço nem dados pessoais.
 *
 * ATENÇÃO: os seletores abaixo são o melhor palpite sobre o HTML atual e NÃO foram validados em produção. Por isso a simulação é o padrão.
 * Linha sem preço lido ou sem selo legível é descartada (nada é inventado).
 */
(async () => {
  const CFG = {
    enviar: false,          // false = simulação (não grava). Mude para true só depois de conferir a simulação.
    lote: 15,               // itens por ciclo (a rota limita a 40)
    pausaMs: [5000, 9000],  // pausa aleatória entre itens (ms)
    cicloMin: 45,           // meta de releitura das ofertas que importam (min)
    ciclos: Infinity,       // quantos ciclos antes de parar
  };

  const host = location.hostname;
  const rede = /amazon\.com\.br$/.test(host) ? 'amazon' : /shopee\.com\.br$/.test(host) ? 'shopee' : null;
  if (!rede) { console.error('[cupons] abra a aba em amazon.com.br ou shopee.com.br'); return; }
  const API = (prompt('Endereço do site Espaço Geek 86 (https://...)') || '').replace(/\/+$/, '');
  const TOKEN = prompt('Token de ingestão (não é gravado)') || '';
  if (!/^https:\/\//.test(API) || TOKEN.length < 32) { console.error('[cupons] endereço ou token inválido'); return; }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = ([a, b]) => a + Math.random() * (b - a);
  const hdr = { Authorization: `Bearer ${TOKEN}` };
  const centsFrom = (t) => {
    const m = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/.exec(t || '');
    if (!m) return null;
    const dec = m[2] ? (m[2].length === 1 ? +m[2] * 10 : +m[2]) : 0;
    return +m[1].replace(/\./g, '') * 100 + dec;
  };
  const txt = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const bloqueio = (doc) => /captcha|digite os caracteres|robot|verifique que voc[eê] [eé] humano|fazer login|entrar na sua conta/i.test(doc.body ? doc.body.innerText.slice(0, 3000) : '');

  // ---------- AMAZON: HTML da página do produto (mesma origem, sessão logada) ----------
  function lerAmazon(doc, finalUrl) {
    const asin = (doc.querySelector('#ASIN, input[name="ASIN"]') || {}).value || (/\/dp\/([A-Z0-9]{10})/.exec(finalUrl || '') || [])[1];
    const precoEl = doc.querySelector('#corePrice_feature_div .a-price .a-offscreen, #apex_desktop .a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen');
    const seen = centsFrom(txt(precoEl));
    const selos = [];
    // selo de cupom ("Aplicar cupom de R$ 20", "Economize 10% ao aplicar o cupom")
    doc.querySelectorAll('[id^="couponText"], #couponBadgeRegularVpc, #couponBadgeSubtext, [data-csa-c-content-id*="coupon" i], #promoPriceBlockMessage_feature_div').forEach((el) => {
      const t = txt(el);
      if (t && /cupom/i.test(t) && t.length < 200) selos.push(t);
    });
    return { asin, seen, selos: [...new Set(selos)] };
  }

  // ---------- SHOPEE: página renderizada (SPA): abre a página na mesma origem, espera, lê e fecha ----------
  async function lerShopee(item) {
    const w = window.open(item.url, '_blank', 'width=900,height=700');
    if (!w) throw new Error('popup bloqueado: permita pop-ups para shopee.com.br nesta aba');
    try {
      let doc = null;
      for (let i = 0; i < 20; i++) { // até ~10 s para renderizar
        await sleep(500);
        try { doc = w.document; if (doc && doc.body && doc.body.innerText.length > 500 && /R\$/.test(doc.body.innerText)) break; } catch (e) { /* ainda redirecionando */ }
      }
      if (!doc) throw new Error('página não renderizou');
      if (bloqueio(doc)) throw new Error('verificação/login detectado');
      const m = /(?:-i\.\d+\.|\/product\/\d+\/)(\d{6,19})/.exec(w.location.href);
      const preco = doc.querySelector('[class*="price" i] , section [class*="Price" i]');
      const seen = centsFrom(txt(preco));
      const selos = [];
      doc.querySelectorAll('[class*="voucher" i], [class*="coupon" i]').forEach((el) => {
        const t = txt(el);
        if (t && /OFF|desconto|gasto/i.test(t) && t.length < 160) selos.push('Voucher ' + t);
      });
      return { asin: m ? m[1] : null, seen, selos: [...new Set(selos)] };
    } finally { try { w.close(); } catch (e) { /* ok */ } }
  }

  async function ciclo(n) {
    const r = await fetch(`${API}/api/ingest/cupons-revalidar?rede=${rede}&n=${CFG.lote}`, { headers: hdr });
    if (!r.ok) { console.error(`[cupons] fila respondeu ${r.status} (503 = desligado no servidor; 401 = token; 403 = origem)`); return false; }
    const fila = await r.json();
    console.log(`[cupons] ciclo ${n}: ${fila.items.length} itens na fila (${rede})`);
    const rows = [];
    for (const item of fila.items) {
      try {
        let lido;
        if (rede === 'amazon') {
          const res = await fetch(item.url, { credentials: 'include' });
          if (res.status !== 200) { console.error(`[cupons] ${item.url} -> ${res.status}: parando`); return false; }
          const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
          if (bloqueio(doc)) { console.error('[cupons] captcha/login: parando'); return false; }
          lido = lerAmazon(doc, res.url);
        } else {
          lido = await lerShopee(item);
        }
        if (!lido.seen || String(lido.asin || '').toUpperCase() !== String(item.ref).toUpperCase()) {
          console.warn('[cupons] descartado (sem preço lido ou ref diferente)', item.ref, lido);
        } else {
          rows.push({ id: item.id, ref: lido.asin, price_seen_cents: lido.seen, coupons: lido.selos.map((label) => ({ label })) });
          console.log(`[cupons] ${item.ref}: preço ${lido.seen / 100}, selos`, lido.selos);
        }
      } catch (e) { console.warn('[cupons] falha no item', item.ref, String(e.message || e)); if (/bloqueado|verifica/.test(String(e.message))) return false; }
      await sleep(rnd(CFG.pausaMs));
    }
    if (!rows.length) return true;
    if (!CFG.enviar) { console.log('[cupons] SIMULAÇÃO: nada enviado. Linhas que iriam:', rows); return true; }
    const p = await fetch(`${API}/api/ingest/cupons-revalidar?rede=${rede}`, { method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
    console.log('[cupons] enviado ->', p.status, await p.json().catch(() => ({})));
    return p.ok;
  }

  for (let n = 1; n <= CFG.ciclos; n++) {
    const t0 = Date.now();
    if (!(await ciclo(n))) { console.error('[cupons] parado.'); return; }
    const resto = CFG.cicloMin * 60_000 - (Date.now() - t0);
    if (resto > 0) await sleep(resto);
  }
})();
