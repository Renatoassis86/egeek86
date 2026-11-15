/**
 * Amostras REAIS dos cards v2 (fila #58). SOMENTE LEITURA do banco; NÃO envia nada a canal/grupo.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/render-amostras-cards-v2.ts [pasta]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';

export {};

async function main() {
  const out = process.argv[2] ?? 'docs/amostras-cards';
  mkdirSync(out, { recursive: true });
  const { db } = await import('../src/lib/db');
  const { loadOfferCardInput, renderOfferCard } = await import('../src/server/messaging/offer-card');
  const { renderEndedCouponCard } = await import('../src/server/messaging/ended-coupon-card');
  const sharp = (await import('sharp')).default;

  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT o.id, o.image_url, o.current_price_cents AS p, length(mp.name) AS len, n.slug AS net, o.vertical
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id JOIN master_products mp ON mp.id = o.master_product_id
    WHERE o.status = 'active' AND o.current_price_cents > 0 AND coalesce(o.image_url,'') <> ''
      AND coalesce(o.last_price_confirmed_at, o.last_checked_at) > CASE WHEN n.slug = 'amazon' THEN now() - interval '20 hours' ELSE now() - interval '5 hours' END
    ORDER BY random() LIMIT 400`);
  console.log('candidatas frescas:', rows.length);

  // Proporção real da foto de cada candidata (cabeçalho de 1 requisição; limite de 120 para ser rápido).
  type C = { id: string; len: number; p: number; net: string; vertical: string; ar: number };
  const cands: C[] = [];
  const titles = new Set<string>();
  for (const r of rows) {
    if (cands.length >= 70) break;
    try {
      const ok = await loadOfferCardInput(String(r.id), { simple: true });
      if (!ok || titles.has(ok.title)) continue;
      titles.add(ok.title);
      const res = await fetch(String(r.image_url), { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const m = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      if (m.width && m.height) cands.push({ id: String(r.id), len: Number(r.len), p: Number(r.p), net: String(r.net), vertical: String(r.vertical), ar: m.width / m.height });
    } catch {
      /* ignora */
    }
  }
  console.log('com foto legível:', cands.length);

  const used = new Set<string>();
  const pickBy = (label: string, f: (c: C) => boolean, sort?: (a: C, b: C) => number): C | null => {
    const list = cands.filter((c) => !used.has(c.id) && f(c));
    if (sort) list.sort(sort);
    const c = list[0] ?? null;
    if (c) used.add(c.id);
    else console.log('SEM candidata:', label);
    return c;
  };

  const plan: Array<[string, C | null, { simple?: boolean; cupom?: boolean; regua?: boolean; semFoto?: boolean }]> = [
    ['nome-curto', pickBy('curto', () => true, (a, b) => a.len - b.len), {}],
    ['nome-longo', pickBy('longo', () => true, (a, b) => b.len - a.len), {}],
    ['foto-vertical', pickBy('vertical', (c) => c.ar < 0.8, (a, b) => a.ar - b.ar), {}],
    ['foto-horizontal', pickBy('horizontal', (c) => c.ar > 1.3, (a, b) => b.ar - a.ar), {}],
    ['foto-quadrada', pickBy('quadrada', (c) => c.ar > 0.95 && c.ar < 1.05), {}],
    ['preco-4-digitos', pickBy('4d', (c) => c.p >= 1000 && c.p < 10000), {}],
    ['preco-6-digitos', pickBy('6d', (c) => c.p >= 100000 && c.p < 1000000, (a, b) => b.p - a.p), {}],
    ['com-cupom', pickBy('cupom', (c) => c.p > 5000), { simple: true, cupom: true }],
    ['com-regua', pickBy('regua', (c) => c.net !== 'amazon'), { regua: true }],
    ['amazon', pickBy('amazon', (c) => c.net === 'amazon'), {}],
    ['sem-foto', pickBy('semfoto', () => true), { semFoto: true }],
    ['games', pickBy('games', (c) => c.vertical === 'games'), {}],
    ['livros', pickBy('livros', (c) => c.vertical === 'livros'), {}],
  ];

  const files: string[] = [];
  for (const [name, c, o] of plan) {
    if (!c) continue;
    const input = await loadOfferCardInput(c.id, o.simple ? { simple: true, couponFinalCents: o.cupom ? Math.round(c.p * 0.9) : null, couponName: o.cupom ? 'CUPOM10' : null } : undefined);
    if (!input) {
      console.log(name, 'sem input (preço velho?)');
      continue;
    }
    if (o.semFoto) input.imageUrl = null;
    if (o.regua) input.regua = { degrau: 4, rotulo: 'Ótimo preço', cor: '#E8742A', corTexto: '#1B1408', pctTexto: '12,4% abaixo da média das lojas', faixaTexto: 'Faixa baseada em 9 ofertas medidas' };
    process.env.GROUP_CARD_V2 = 'on';
    const card = await renderOfferCard(input);
    if (!card) continue;
    const f = join(out, `v2-${name}.png`);
    writeFileSync(f, card.png);
    files.push(f);
    console.log(name, '|', input.title.slice(0, 60), '|', input.priceCents, '|', f);
    if (['nome-longo', 'foto-vertical', 'com-cupom'].includes(name)) {
      process.env.GROUP_CARD_V2 = 'off';
      const old = await renderOfferCard(input);
      if (old) writeFileSync(join(out, `antigo-${name}.png`), old.png);
    }
  }
  process.env.GROUP_CARD_V2 = 'on';
  for (const [slug, label] of [['games', 'TODOSITE1111'], ['tecnologia', 'Cupom de R$ 30 acima de R$ 299 em eletrônicos selecionados']] as const) {
    const png = await renderEndedCouponCard({ storeSlug: slug, label, networkName: 'Mercado Livre', at: new Date() });
    if (png) {
      const f = join(out, `v2-cupom-encerrado-${slug}.png`);
      writeFileSync(f, png);
      files.push(f);
    }
  }
  const { renderStoreProfileCard } = await import('../src/server/messaging/store-profile-card');
  const prof = await renderStoreProfileCard('games');
  if (prof) {
    writeFileSync(join(out, 'v2-perfil-games.png'), prof);
    files.push(join(out, 'v2-perfil-games.png'));
  }
  const { renderHistoryCard } = await import('../src/server/messaging/price-card');
  const masters = await db.execute<Record<string, unknown>>(sql`SELECT DISTINCT master_product_id AS id FROM affiliate_offers WHERE status = 'active' AND last_price_confirmed_at > now() - interval '5 hours' AND vertical = 'games' LIMIT 60`);
  for (const m of masters) {
    const h = await renderHistoryCard(String(m.id));
    if (!h) continue;
    writeFileSync(join(out, 'v2-historico.png'), h.png);
    files.push(join(out, 'v2-historico.png'));
    process.env.GROUP_CARD_V2 = 'off';
    const ho = await renderHistoryCard(String(m.id));
    if (ho) writeFileSync(join(out, 'antigo-historico.png'), ho.png);
    process.env.GROUP_CARD_V2 = 'on';
    break;
  }
  console.log(files.join('\n'));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
