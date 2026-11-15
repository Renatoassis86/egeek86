/**
 * #119: auditoria dos links afiliados do Mercado Livre (o que a página do link mostra x a oferta) e correção em lote.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/auditar-links-119.ts --escopo=combos|impressoras|resto [--limite=150] [--ate-min=0]   # só lê e imprime (nada gravado)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/auditar-links-119.ts --escopo=combos --apply --por=<quem>             # grava auditoria e corrige
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/auditar-links-119.ts --rollback=docs/backups/<arquivo>.ndjson
 *
 * Correção (--apply), por veredito, com backup NDJSON ANTES (estado anterior das colunas tocadas):
 *  - pausado: oferta vira 'expired' (fora de mensagem, lista e site).
 *  - preco_divergente: regrava o preço pela página (fonte da verdade: é o que o cliente vê) com o anúncio do link; previous_price zerado (sem "queda").
 *  - item_diferente: se o catálogo da página é o da oferta, adota o anúncio e o preço da página (idem); se não é, só registra (o porteiro tira a oferta das mensagens).
 *  - erro_leitura / sem_link: só registra.
 * Parada em 429/captcha. Nunca imprime token.
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';
import { auditarLote, carregarAlvos, type Escopo } from '../src/server/links/auditoria-links';
import { recordPriceSnapshot } from '../src/server/collector/record-price-snapshot';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const APPLY = process.argv.includes('--apply');
const POR = arg('por') ?? '';
const ESCOPO = (arg('escopo') ?? 'combos') as Escopo;
const LIMITE = Number(arg('limite') ?? 150);
const ATE_MIN = Number(arg('ate-min') ?? 0);
const ROLLBACK = arg('rollback');
const SHARD = arg('shard') ? { i: Number(arg('shard')!.split('/')[0]), n: Number(arg('shard')!.split('/')[1]) } : undefined; // --shard=0/3: fatia por hash do id (execuções paralelas sem repetir leitura)

async function main() {
  const sql = connect();
  try {
    if (ROLLBACK) {
      const linhas = fs.readFileSync(ROLLBACK, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
      for (const l of linhas) {
        await sql`UPDATE affiliate_offers SET status = ${l.status as string}::affiliate_offer_status, external_item_id = ${(l.external_item_id as string | null) ?? null}, link_item_id = ${(l.link_item_id as string | null) ?? null},
          current_price_cents = ${l.current_price_cents as number}, previous_price_cents = ${(l.previous_price_cents as number | null) ?? null}, last_price_confirmed_at = ${(l.last_price_confirmed_at as string | null) ?? null}
          WHERE id = ${l.id as string}::uuid`;
      }
      console.log(`rollback: ${linhas.length} ofertas restauradas de ${ROLLBACK}`);
      return;
    }
    if (APPLY && !POR) throw new Error('--apply exige --por=<quem>');
    const alvos = await carregarAlvos(ESCOPO, LIMITE, ATE_MIN, SHARD);
    console.log(`escopo ${ESCOPO}: ${alvos.length} links a ler (1 a cada 1,2-2 s, ~${Math.round((alvos.length * 1.6) / 60)} min)`);
    const t0 = Date.now();
    const res = await auditarLote(alvos, Number(arg('minutos') ?? 9) * 60_000, { gravar: APPLY });
    console.log(`lidas ${res.lidas} em ${Math.round((Date.now() - t0) / 1000)} s | por veredito ${JSON.stringify(res.porVeredito)} | parou: ${res.parou ?? 'não'}`);
    const ruins = res.linhas.filter((l) => l.r.verdict !== 'ok');
    for (const l of ruins.slice(0, 40)) console.log(`${l.r.verdict.padEnd(17)} ${l.alvo.offerId.slice(0, 8)} ${l.r.nota} ${l.r.diffPct != null ? `(${l.r.diffPct}%)` : ''}`);

    if (!APPLY) return;
    const arq = `docs/backups/auditar-links-119-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
    fs.mkdirSync('docs/backups', { recursive: true });
    const cont: Record<string, number> = { expiradas: 0, repostas_pela_pagina: 0, so_registradas: 0 };
    for (const l of ruins) {
      const c = l.r.cartao;
      const quer = l.r.verdict === 'pausado' ? 'expirar'
        : (l.r.verdict === 'preco_divergente' || (l.r.verdict === 'item_diferente' && c?.productId && l.alvo.catalogo && c.productId === l.alvo.catalogo)) && c?.precoCents && c.itemId ? 'repor' : 'nada';
      if (quer === 'nada') { cont.so_registradas++; continue; }
      const antes = await sql`SELECT id::text, status::text, external_item_id, link_item_id, current_price_cents::int, previous_price_cents::int, last_price_confirmed_at FROM affiliate_offers WHERE id = ${l.alvo.offerId}::uuid`;
      fs.appendFileSync(arq, antes.map((r) => JSON.stringify(r)).join('\n') + '\n');
      if (quer === 'expirar') {
        await sql`UPDATE affiliate_offers SET status = 'expired', updated_at = now() WHERE id = ${l.alvo.offerId}::uuid AND status = 'active'`;
        cont.expiradas++;
      } else {
        await sql`UPDATE affiliate_offers SET external_item_id = NULL WHERE id = ${l.alvo.offerId}::uuid AND external_item_id IS DISTINCT FROM ${c!.itemId}`; // anúncio antigo não vale mais (evita falsa "troca")
        await recordPriceSnapshot({ offerId: l.alvo.offerId, priceCents: c!.precoCents!, listPriceCents: c!.precoAnteriorCents, source: 'scrape', itemId: c!.itemId });
        await sql`UPDATE affiliate_offers SET previous_price_cents = NULL, link_item_id = ${c!.itemId}, last_price_confirmed_at = now(), last_checked_at = now(), consecutive_miss_count = 0 WHERE id = ${l.alvo.offerId}::uuid`;
        await sql`INSERT INTO offer_link_audit (offer_id, link, item_id_link, product_id_link, price_link_cents, status_link, offer_price_cents, diff_pct, verdict, note)
          VALUES (${l.alvo.offerId}::uuid, ${l.alvo.link}, ${c!.itemId}, ${c!.productId}, ${c!.precoCents}, 'ativo', ${c!.precoCents}, 0, 'ok', ${`corrigido de ${l.r.verdict}; antes ${l.alvo.precoCents}`})`;
        cont.repostas_pela_pagina++;
      }
    }
    console.log('correção:', JSON.stringify(cont), fs.existsSync(arq) ? `backup: ${arq}` : '(nada a corrigir)');
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e, process.env.DEBUG_119 && e instanceof Error ? e.stack : ''); process.exit(1); });
export {};
