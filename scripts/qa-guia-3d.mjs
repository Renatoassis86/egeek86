// QA da guia/3 secoes da Impressao 3D (Playwright proprio, 1 requisicao por vista, espacadas): node scripts/qa-guia-3d.mjs [base]
import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'https://egeek86.vercel.app';
const OUT = 'docs/amostras-qa-home';
const VIEWS = [['m390', { width: 390, height: 844 }], ['l844', { width: 844, height: 390 }], ['d1440', { width: 1440, height: 900 }]];
const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
try {
  for (const [vn, vp] of VIEWS) for (const scheme of ['light', 'dark']) {
    if (vn !== 'd1440' || scheme === 'light') {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme });
      await ctx.addCookies([{ name: 'theme', value: scheme, url: BASE }]);
      const page = await ctx.newPage();
      const r = await page.goto(`${BASE}/mercado/impressao3d`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(3500);
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const wide = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > de.clientWidth + 2 && getComputedStyle(e).position !== 'fixed' && !e.closest('.overflow-x-auto'); }).slice(0, 4).map((e) => e.tagName + '.' + String(e.className).slice(0, 40));
        const cards = [...document.querySelectorAll('#guia > ul > li')].map((li) => li.innerText.replace(/\s+/g, ' ').slice(0, 230));
        return { overflowX: de.scrollWidth > de.clientWidth + 2, wide, secoes: ['guia', 'impressoras', 'filamentos', 'demais-itens'].map((id) => !!document.getElementById(id)), cards };
      });
      console.log(JSON.stringify({ vn, scheme, status: r?.status(), overflowX: m.overflowX, wide: m.wide, secoes: m.secoes }));
      if (vn === 'm390' && scheme === 'light') for (const c of m.cards) console.log('  ', c);
      if (scheme === 'light' || vn === 'm390') {
        await page.locator('#guia').scrollIntoViewIfNeeded().catch(() => {});
        await page.screenshot({ path: `${OUT}/s11-guia3d-${vn}-${scheme}.jpg`, type: 'jpeg', quality: 45 });
      }
      await ctx.close();
      await new Promise((r) => setTimeout(r, 6000));
    }
  }
} finally {
  await browser.close();
}
