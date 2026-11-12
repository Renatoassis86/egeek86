/** Dry-run da descoberta Shopee de calçados (NÃO grava): npx tsx --conditions=react-server --env-file=.env.local scripts/medir-shopee-calcados.ts "<termo>" */
import { discoverShopeeEsporte } from '../src/server/collector/discover-shopee-esporte';
async function main() {
  const q = process.argv[2] ?? 'tenis nike air max';
  const r = await discoverShopeeEsporte({ q, paginas: 2, maxChamadas: 10, apply: false } as never);
  const x = r as unknown as Record<string, unknown>;
  console.log(JSON.stringify({ parou: x.parou, erros: x.erros, skipped: x.skipped, contadores: x.contadores, planejados: x.mastersPlanejados }, null, 1).slice(0, 2500));
  console.log(Object.keys(x));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
