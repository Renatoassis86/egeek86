/*
 * Extensão local "Espaço Geek 86 - Loops" (fila #113, Fase 1).
 * 1) Em cada carregamento das páginas-alvo, injeta (mundo MAIN) a configuração e os arquivos dos loops.
 *    Os arquivos vêm empacotados em ./loops (copiados de public/loops por sync-extension.ps1) e a configuração (token)
 *    vem de ./config.local.json (fora do git). Isso não depende de CSP da página nem de eval.
 * 2) Marca as abas-alvo com autoDiscardable=false: o Chrome (Economia de memória) não as descarta mais.
 * 3) A cada 2 min um alarme reaplica a proteção e reinjeta o que estiver ausente (cura automática).
 */
const ALVOS = [
  {
    id: 'ml', teste: (u) => /^https:\/\/www\.mercadolivre\.com\.br\/afiliados\/linkbuilder/.test(u),
    loops: [
      { global: '__mll', cfg: '__MLL_CFG', arquivo: 'loops/ml-links-ui.js', montar: (c) => ({ api: c.api, token: c.token, enviar: true, lote: 30, pausaMs: [3500, 6500] }) },
      { global: '__mlc', cfg: '__MLC_CFG', arquivo: 'loops/ml-cupons-item.js', montar: (c) => ({ api: c.api, token: c.token, enviar: true }) },
    ],
  },
  {
    id: 'amazon', teste: (u) => /^https:\/\/www\.amazon\.com\.br\/(\?.*)?$/.test(u) || /^https:\/\/www\.amazon\.com\.br\/?$/.test(u),
    loops: [
      { global: '__cup', cfg: '__CUP_CFG', arquivo: 'loops/cupons-24h.js', montar: (c) => ({ api: c.api, token: c.token, rede: 'amazon', enviar: true, lote: 10 }) },
      { global: '__promo', cfg: '__PROMO_CFG', arquivo: 'loops/amazon-promocoes.js', montar: (c) => ({ api: c.api, token: c.token, enviar: true, extras: c.extrasPromo || [] }) },
      { global: '__amza', cfg: '__AMZA_CFG', arquivo: 'loops/amazon-assistida.js', montar: (c) => ({ api: c.api, token: c.token, enviar: true, lote: 10 }) },
    ],
  },
  { id: 'shopee', teste: (u) => /^https:\/\/shopee\.com\.br\//.test(u), loops: [] },
];

let configCache = null;
async function config() {
  if (configCache) return configCache;
  const r = await fetch(chrome.runtime.getURL('config.local.json'));
  configCache = await r.json();
  return configCache;
}

function alvoDe(url) { return ALVOS.find((a) => a.teste(url || '')); }

async function protegerEInjetar(tabId, url) {
  const alvo = alvoDe(url);
  if (!alvo) return;
  try { await chrome.tabs.update(tabId, { autoDiscardable: false }); } catch (e) { /* aba fechada */ }
  if (!alvo.loops.length) return;
  const c = await config();
  for (const l of alvo.loops) {
    try {
      const [{ result: existe }] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: (g) => !!window[g], args: [l.global] });
      if (existe) continue; // já está rodando
      await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: (nome, cfg) => { window[nome] = cfg; }, args: [l.cfg, l.montar(c)] });
      await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: [l.arquivo] });
    } catch (e) { console.warn('[loops]', alvo.id, l.global, String(e && e.message || e)); }
  }
}

chrome.webNavigation.onCompleted.addListener((d) => { if (d.frameId === 0) protegerEInjetar(d.tabId, d.url); });
chrome.tabs.onUpdated.addListener((tabId, info, tab) => { if (info.status === 'complete' && tab && tab.url) protegerEInjetar(tabId, tab.url); });
chrome.tabs.onCreated.addListener((tab) => { if (tab.pendingUrl && alvoDe(tab.pendingUrl)) chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {}); });

async function varrer() {
  const tabs = await chrome.tabs.query({ url: ['https://www.mercadolivre.com.br/*', 'https://www.amazon.com.br/*', 'https://shopee.com.br/*'] });
  for (const t of tabs) { if (t.discarded) { try { await chrome.tabs.reload(t.id); } catch (e) {} continue; } await protegerEInjetar(t.id, t.url); }
}
chrome.alarms.create('varrer', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'varrer') varrer(); });
chrome.runtime.onStartup.addListener(varrer);
chrome.runtime.onInstalled.addListener(varrer);
varrer();
