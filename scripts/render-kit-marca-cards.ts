/** Kit de marca: 1 card de oferta REAL por loja (somente leitura) + avatar de cada loja, em docs/marca/kit-chatgpt/cards-lojas. Nao envia nada. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
const PERFIL: Record<string, string> = { games: 'games', impressao3d: 'impressao-3d', tecnologia: 'tecnologia', livros: 'livros', eletrodomesticos: 'casa', eletroeletronicos: 'eletronicos', esporte: 'esporte', beleza: 'beleza' };
async function main() {
  const out = process.argv[2] ?? 'docs/marca/kit-chatgpt/cards-lojas';
  mkdirSync(out, { recursive: true });
  const { loadOfferCardInput, renderOfferCard } = await import('../src/server/messaging/offer-card');
  const { renderStoreProfileCard } = await import('../src/server/messaging/store-profile-card');
  for (const v of ['games', 'tecnologia', 'eletroeletronicos', 'eletrodomesticos', 'esporte', 'livros', 'impressao3d', 'beleza']) {
    const ids = await db.execute<{ id: string }>(sql`SELECT o.id FROM affiliate_offers o WHERE o.vertical=${v} AND o.status='active' AND o.quarantined_at IS NULL AND o.current_price_cents>0 AND coalesce(o.image_url,'')<>'' ORDER BY o.last_price_confirmed_at DESC NULLS LAST LIMIT 12`);
    let done = false;
    for (const r of ids) {
      const input = await loadOfferCardInput(String(r.id));
      if (!input) continue;
      const card = await renderOfferCard(input);
      if (!card) continue;
      writeFileSync(join(out, `card-oferta-${v}.png`), card.png);
      console.log(v, 'card ok', input.title.slice(0, 40));
      done = true; break;
    }
    if (!done) console.log(v, 'sem oferta fresca');
    const slug = PERFIL[v];
    if (slug) { const av = await renderStoreProfileCard(slug); if (av) { writeFileSync(join(out, `avatar-${v}.png`), av); console.log(v, 'avatar ok'); } }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
