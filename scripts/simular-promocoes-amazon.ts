/**
 * SIMULAÇÃO (somente SELECT, nada gravado/enviado) das promoções da Amazon com o código REAL da ingestão, a partir de leituras de páginas
 * /promotion/psp/<ID> feitas pela aba (NDJSON: { id, titulo, banner, termos, lista[{a,t,p}], fora[{a,t,p}] }; `fora` = cards de carrosséis).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/simular-promocoes-amazon.ts <arquivo.ndjson>
 * Por promoção: lista principal x fora da lista (carrosséis) x ligados a oferta x descartados por departamento/preço x casados; amostra de casados.
 */
import fs from 'node:fs';
import { sql } from 'drizzle-orm';

async function main() {
  const file = process.argv[2];
  const { db } = await import('../src/lib/db');
  const L = await import('../src/lib/coupons/amazon-promocoes');
  const linhas = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { id: string; titulo: string; banner: string; termos: string; lista: { a: string; t: string; p: string | null }[]; fora: { a: string; t: string; p: string | null }[] });
  const offers = (await db.execute<{ ref: string; price: string; vert: string | null; title: string }>(sql`
    SELECT o.external_ref AS ref, o.current_price_cents::text AS price, COALESCE(o.vertical, mp.vertical) AS vert, o.title
    FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id LEFT JOIN master_products mp ON mp.id = o.master_product_id
    WHERE nn.slug = 'amazon' AND o.status = 'active'`)) as unknown as { ref: string; price: string; vert: string | null; title: string }[];
  const byRef = new Map(offers.map((o) => [o.ref, o]));
  const now = new Date();
  const tabela: Record<string, unknown>[] = [];
  const amostra: { promo: string; asin: string; vert: string | null; produto: string; card: string }[] = [];
  let tot = { lista: 0, fora: 0, foraEOfertaNossa: 0, ofertaNaLista: 0, depto: 0, preco: 0, casados: 0 };
  for (const l of linhas) {
    const parsed = L.parsePromoPage({ id: l.id, titulo: l.titulo, banner: l.banner, termos: l.termos }, now);
    const nome = l.titulo.slice(0, 44);
    const fora = l.fora.filter((c) => byRef.has(`amazon-${c.a}`)).length;
    if (!parsed.ok) { tabela.push({ promo: nome, lista: l.lista.length, carrossel: l.fora.length, estado: `recusada:${parsed.reason}` }); tot.lista += l.lista.length; tot.fora += l.fora.length; tot.foraEOfertaNossa += fora; continue; }
    const p = parsed.promo;
    if (p.restricao || (p.minItens != null && p.minItens >= 2)) { tabela.push({ promo: nome, lista: 0, carrossel: l.fora.length, estado: `restrita:${p.restricao ?? 'quantidade'}` }); tot.fora += l.fora.length; tot.foraEOfertaNossa += fora; continue; }
    const cards = L.parsePromoCards(l.lista.map((c) => ({ a: c.a, t: c.t, p: c.p })));
    let ofertaNaLista = 0, depto = 0, preco = 0, casados = 0;
    for (const c of cards) {
      const o = byRef.get(`amazon-${c.asin}`);
      if (!o) continue;
      ofertaNaLista++;
      if (!L.departamentoCompativel(p.categoria, o.vert)) { depto++; continue; }
      if (!L.precoCasa(c.priceCents, Number(o.price))) { preco++; continue; }
      casados++;
      amostra.push({ promo: p.id, asin: c.asin, vert: o.vert, produto: o.title.slice(0, 60), card: c.titulo.slice(0, 50) });
    }
    tabela.push({ promo: nome, cat: p.categoria, lista: cards.length, carrossel: l.fora.length, 'carrossel que e oferta nossa': fora, 'oferta nossa na lista': ofertaNaLista, 'fora do depto': depto, 'preco nao casa': preco, casados });
    tot = { lista: tot.lista + cards.length, fora: tot.fora + l.fora.length, foraEOfertaNossa: tot.foraEOfertaNossa + fora, ofertaNaLista: tot.ofertaNaLista + ofertaNaLista, depto: tot.depto + depto, preco: tot.preco + preco, casados: tot.casados + casados };
  }
  console.table(tabela);
  console.log('TOTAL', JSON.stringify(tot));
  console.log('AMOSTRA de casados (até 10):');
  console.table(amostra.slice(0, 10));
  fs.writeFileSync(file.replace(/\.ndjson$/, '') + '-casados.json', JSON.stringify(amostra, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e.cause?.message ?? e); process.exit(1); });
