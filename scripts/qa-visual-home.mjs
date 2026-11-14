// QA visual (Playwright): npx next dev (REDESENHO_HOME_DEV=100) e depois  node scripts/qa-visual-home.mjs [base]
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:3111';
const OUT = 'docs/redesenho-site/capturas-2026-11-14';
const PAGES = [['home', '/'], ['plus', '/plus'], ['contatos', '/contatos'], ['ofertas', '/ofertas'], ['impressao3d', '/mercado/impressao3d']];
const VIEWS = [['mobile', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }], ['desktop', { width: 1440, height: 900 }]];
const SCHEMES = (process.env.QA_TEMAS ?? 'light,dark').split(',');
const report = [];
const EXE = process.env.PW_CHROME || undefined;
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
for (const [vn, vp] of VIEWS) for (const scheme of SCHEMES) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'theme', value: scheme, url: BASE }]); // o tema vem do cookie `theme` (SSR), não do prefers-color-scheme
  for (const [pn, path] of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 140)));
    let status = 0;
    try {
      const r = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 90000 });
      status = r?.status() ?? 0;
      await page.waitForTimeout(2500);
      // rola para disparar lazy/reveal
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const bad = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map((i) => i.src.slice(0, 100));
        const wide = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > de.clientWidth + 2 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 5).map((e) => (e.tagName + '.' + String(e.className).slice(0, 50)));
        const bg = getComputedStyle(document.body).backgroundColor;
        const hrefs = [...document.querySelectorAll('a')].filter((a) => /whatsapp|t\.me|wa\.me/i.test(a.href)).length;
        return { overflowX: de.scrollWidth > de.clientWidth + 2, scrollW: de.scrollWidth, clientW: de.clientWidth, bad, wide, bg, h: de.scrollHeight, chatLinks: hrefs, v2: !!document.querySelector('[data-home-v2], [data-redesenho]') };
      });
      await page.screenshot({ path: `${OUT}/${pn}-${vn}-${scheme}.jpg`, type: 'jpeg', quality: 45, fullPage: false });
      report.push({ pagina: pn, vista: vn, tema: scheme, status, ...m, erros: errs.slice(0, 3) });
    } catch (e) {
      report.push({ pagina: pn, vista: vn, tema: scheme, status, falha: String(e).slice(0, 160) });
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/resultado.json`, JSON.stringify(report, null, 1));
for (const r of report) console.log(JSON.stringify({ p: r.pagina, v: r.vista, t: r.tema, s: r.status, ox: r.overflowX, sw: r.scrollW, cw: r.clientW, bad: r.bad?.length, wide: r.wide?.length, ch: r.chatLinks, err: r.erros?.length, f: r.falha }));
