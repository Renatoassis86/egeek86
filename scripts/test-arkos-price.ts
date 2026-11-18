// Dono, 2026-11-18: "Espaço Geek Plus" passa a se chamar "Arkos Price". O endereço antigo responde 308; nenhum link novo aponta para /plus.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const cfg = fs.readFileSync('next.config.ts', 'utf8');
assert.ok(/source: '\/plus', destination: '\/arkos-price', permanent: true/.test(cfg), 'redirect 308 de /plus para /arkos-price');
assert.ok(fs.existsSync('src/app/(shop)/arkos-price/page.tsx') && !fs.existsSync('src/app/(shop)/plus/page.tsx'), 'a página mora em /arkos-price');
for (const f of ['src/components/layout/app-header.tsx', 'src/components/layout/mobile-nav-drawer.tsx', 'src/components/layout/site-footer.tsx', 'src/components/plus/secao-plus-home.tsx', 'src/app/sitemap.ts', 'src/app/(shop)/arkos-price/page.tsx']) {
  const t = fs.readFileSync(f, 'utf8');
  assert.ok(!/Espaço Geek Plus/.test(t), `${f}: nome antigo visível`);
  assert.ok(!/href[=:] ?['"{]?\/plus['"}]/.test(t) && !t.includes('}/plus`'), `${f}: link para /plus`);
}
assert.ok(fs.readFileSync('src/components/layout/app-header.tsx', 'utf8').includes("label: 'Arkos Price'"), 'menu com o nome novo');
console.log('test-arkos-price: OK');
