/** Renderiza 1 cartao REAL por loja (somente leitura) em uma pasta: npx tsx --conditions=react-server --env-file=.env.local scripts/render-cards-lojas.ts <pasta> */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
async function main() {
  const out = process.argv[2] ?? 'cards-lojas';
  mkdirSync(out, { recursive: true });
  const { loadOfferCardInput, renderOfferCard } = await import('../src/server/messaging/offer-card');
  for (const v of ['games', 'impressao3d', 'tecnologia', 'livros', 'eletrodomesticos', 'eletroeletronicos', 'esporte']) {
    const ids = await db.execute<{ id: string }>(sql`SELECT o.id FROM affiliate_offers o WHERE o.vertical=${v} AND o.status='active' AND o.quarantined_at IS NULL AND o.current_price_cents>0 ORDER BY o.last_price_confirmed_at DESC NULLS LAST LIMIT 12`);
    let done = false;
    for (const r of ids) {
      const input = await loadOfferCardInput(String(r.id));
      if (!input) continue;
      const card = await renderOfferCard(input);
      if (!card) continue;
      writeFileSync(join(out, `${v}.png`), card.png);
      console.log(v, 'ok', input.vertical, input.title.slice(0, 40));
      done = true;
      break;
    }
    if (!done) console.log(v, 'sem oferta fresca');
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
