/**
 * CORRECAO DE DADOS (R-69, dono, 2026-11-16): cotacoes da Amazon gravadas como preco "a vista no Pix" passam a ter o preco CHEIO como preco da serie e o
 * Pix como atributo (pix_cents). So com PROVA da propria serie (classificarSerieAmazon); ambiguas ficam como estao e vao para o relatorio.
 *   npx tsx --env-file=.env.local scripts/corrigir-tipo-preco-amazon-124.ts                 # dry-run
 *   npx tsx --env-file=.env.local scripts/corrigir-tipo-preco-amazon-124.ts --apply         # grava, com backup NDJSON antes
 *   npx tsx --env-file=.env.local scripts/corrigir-tipo-preco-amazon-124.ts --rollback docs/backups/<arquivo>.ndjson
 * Pre-requisito: migration 0062 aplicada (scripts/aplicar-migration-0062.ts --apply). Nunca apaga cotacao: so reescreve preco/lista/tipo, com o original no backup.
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';
import { classificarSerieAmazon } from '../src/lib/pricing/tipo-preco';

const APPLY = process.argv.includes('--apply');
const rb = process.argv.indexOf('--rollback');
const JANELA_DIAS = 60;

(async () => {
  const sql = connect();
  try {
    if (rb > 0) {
      const linhas = fs.readFileSync(process.argv[rb + 1], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      let n = 0;
      await sql.begin(async (tx) => {
        for (const l of linhas) {
          if (l.t === 'snap') {
            await tx`UPDATE affiliate_price_snapshots SET price_cents = ${l.r.price_cents}, list_price_cents = ${l.r.list_price_cents}, price_type = ${l.r.price_type}, pix_cents = ${l.r.pix_cents} WHERE id = ${l.r.id}`;
            n++;
          } else if (l.t === 'oferta') {
            await tx`UPDATE affiliate_offers SET current_price_cents = ${l.r.current_price_cents}, previous_price_cents = ${l.r.previous_price_cents}, pix_cents = ${l.r.pix_cents}, pix_visto_em = ${l.r.pix_visto_em} WHERE id = ${l.r.id}`;
          }
        }
      });
      console.log('rollback: cotacoes restauradas', n, '(refaca a oferta-dia com upsertOfferDays dos dias afetados)');
      return;
    }
    const rows = await sql<{ offer_id: string; id: string; p: string; l: string | null; at: Date }[]>`
      SELECT s.offer_id::text, s.id::text, s.price_cents::text p, s.list_price_cents::text l, s.collected_at at
      FROM affiliate_price_snapshots s JOIN affiliate_offers o ON o.id = s.offer_id JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'amazon'
      WHERE s.collected_at > now() - make_interval(days => ${JANELA_DIAS}) ORDER BY s.offer_id, s.collected_at, s.id`;
    type LinhaCot = { offer_id: string; id: string; p: string; l: string | null; at: Date };
    const por = new Map<string, LinhaCot[]>();
    for (const r of rows) { if (!por.has(r.offer_id)) por.set(r.offer_id, []); por.get(r.offer_id)!.push(r); }
    const plano: { offer: string; id: string; pix: number; cheio: number }[] = [];
    let ambiguas = 0;
    for (const [offer, a] of por) {
      const c = classificarSerieAmazon(a.map((r) => ({ id: r.id, p: Number(r.p), l: r.l ? Number(r.l) : null, at: r.at.getTime() })));
      ambiguas += c.ambiguas.length;
      for (const p of c.provadas) plano.push({ offer, id: String(p.id), pix: p.pixCents, cheio: p.cheioCents });
    }
    const ofertas = [...new Set(plano.map((p) => p.offer))];
    console.log(`${APPLY ? 'APLICA' : 'DRY-RUN'}: cotacoes Amazon (${JANELA_DIAS} dias): ${rows.length} em ${por.size} ofertas; provadas Pix: ${plano.length} em ${ofertas.length} ofertas; ambiguas (nao tocadas): ${ambiguas}`);
    for (const p of plano.slice(0, 8)) console.log('  ex.', p.offer.slice(0, 8), 'cotacao', p.id, 'Pix', p.pix, '-> cheio', p.cheio);
    if (!APPLY || !plano.length) return;

    const ids = plano.map((p) => p.id);
    const snaps = await sql`SELECT * FROM affiliate_price_snapshots WHERE id = ANY(${ids}::bigint[])`;
    const offs = await sql`SELECT id, current_price_cents, previous_price_cents, pix_cents, pix_visto_em FROM affiliate_offers WHERE id = ANY(${ofertas}::uuid[])`;
    const arq = `docs/backups/tipo-preco-amazon-124-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
    fs.mkdirSync('docs/backups', { recursive: true });
    fs.writeFileSync(arq, [...snaps.map((r) => JSON.stringify({ t: 'snap', r })), ...offs.map((r) => JSON.stringify({ t: 'oferta', r }))].join('\n') + '\n');
    console.log('backup:', arq, `(${snaps.length} cotacoes, ${offs.length} ofertas)`);

    await sql.begin(async (tx) => {
      for (const p of plano) {
        await tx`UPDATE affiliate_price_snapshots SET price_cents = ${p.cheio}, list_price_cents = NULL, price_type = 'cheio', pix_cents = ${p.pix} WHERE id = ${p.id}`;
      }
      // cache da oferta = ultima cotacao; anterior = ultimo preco DIFERENTE antes dela (nunca queda entre tipos)
      for (const o of ofertas) {
        const s = await tx<{ price_cents: string; pix_cents: string | null }[]>`SELECT price_cents::text, pix_cents::text FROM affiliate_price_snapshots WHERE offer_id = ${o}::uuid ORDER BY collected_at DESC, id DESC LIMIT 40`;
        if (!s.length) continue;
        const atual = Number(s[0].price_cents);
        const ant = s.find((x) => Number(x.price_cents) !== atual);
        const pix = s[0].pix_cents ? Number(s[0].pix_cents) : null;
        await tx`UPDATE affiliate_offers SET current_price_cents = ${atual}, previous_price_cents = ${ant ? Number(ant.price_cents) : null}, pix_cents = ${pix}, pix_visto_em = ${pix ? new Date() : null} WHERE id = ${o}::uuid`;
      }
    });
    // oferta-dia: refaz os dias afetados (as linhas oferta-dia derivam das cotacoes)
    const { upsertOfferDays } = await import('../src/server/pricing/price-daily');
    const { db } = await import('../src/lib/db');
    const de = new Date(Date.now() - (JANELA_DIAS + 2) * 86400_000).toISOString().slice(0, 10);
    const ate = new Date().toISOString().slice(0, 10);
    for (const o of ofertas) await upsertOfferDays(db as never, de, ate, o);
    console.log('aplicado: cotacoes reescritas', plano.length, '| ofertas atualizadas', ofertas.length, '| oferta-dia refeita', de, 'a', ate);
  } finally {
    await sql.end();
  }
})().then(() => process.exit(0)).catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
