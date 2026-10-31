import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  detectNonGameByRules,
  isBundleTitle,
  type NonGameKind,
} from '../src/lib/affiliate/product-type-classifier';

config({ path: '.env.local' });

/**
 * EG-04 — DRY-RUN de reclassificação de não-jogos.
 *
 * Lê master_products (somente SELECT, em transação READ ONLY) e lista o que
 * as regras de título (detectNonGameByRules) reclassificariam. NÃO executa
 * UPDATE: o resultado é um relatório CSV + markdown em docs/. A aplicação
 * real (UPDATE com backup do tipo anterior) depende de autorização do dono.
 *
 * Uso: npx tsx scripts/reclassify-non-games.ts
 */

interface Row {
  id: string;
  name: string;
  product_type: string;
  platform: string;
  active_offers: number;
  min_price_cents: number | null;
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });

  const rows = await sql.begin('read only', async (tx) =>
    tx<Row[]>`
      SELECT m.id, m.name, m.product_type::text AS product_type,
             m.game_platform_gen::text AS platform,
             COUNT(o.id) FILTER (WHERE o.status = 'active' AND o.current_price_cents > 0)::int AS active_offers,
             MIN(o.current_price_cents) FILTER (WHERE o.status = 'active' AND o.current_price_cents > 0) AS min_price_cents
      FROM master_products m
      LEFT JOIN affiliate_offers o ON o.master_product_id = m.id
      GROUP BY m.id
    `
  );
  await sql.end();

  type Out = Row & { proposed: string; kind: NonGameKind | 'bundle_review'; matched: string; action: string };
  const changes: Out[] = [];
  for (const r of rows) {
    if (r.product_type !== 'game') continue; // alvo: o que está indevidamente como 'game'
    const hit = detectNonGameByRules(r.name);
    if (hit) {
      changes.push({
        ...r,
        proposed: hit.productType,
        kind: hit.kind,
        matched: hit.matched,
        action: hit.kind === 'part_or_packaging' ? 'reclassificar (peça/embalagem: dono decide esconder ou categoria própria)' : 'reclassificar',
      });
    } else if (isBundleTitle(r.name)) {
      changes.push({ ...r, proposed: r.product_type, kind: 'bundle_review', matched: 'kit/lote/combo', action: 'revisar manualmente (sem mudança automática)' });
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  mkdirSync('docs', { recursive: true });
  const header = ['id', 'nome', 'tipo_atual', 'tipo_proposto', 'regra', 'termo', 'plataforma', 'ofertas_ativas', 'menor_preco_cents', 'acao'];
  const csv = [header.join(',')]
    .concat(
      changes.map((c) =>
        [c.id, c.name, c.product_type, c.proposed, c.kind, c.matched, c.platform, c.active_offers, c.min_price_cents, c.action].map(csvCell).join(',')
      )
    )
    .join('\n');
  writeFileSync(`docs/reclassify-non-games-dryrun-${date}.csv`, '﻿' + csv, 'utf8');

  const count = (k: string) => changes.filter((c) => c.kind === k).length;
  const totalGames = rows.filter((r) => r.product_type === 'game').length;
  const md = [
    `# Dry-run de reclassificação de não-jogos (EG-04) — ${date}`,
    '',
    'Nenhum UPDATE foi executado. Fonte: `master_products` (somente SELECT, transação read only) + regras de `detectNonGameByRules`.',
    '',
    `- Masters totais: ${rows.length}; como 'game': ${totalGames}`,
    `- Reclassificações propostas: ${changes.length - count('bundle_review')}`,
    `  - peça/embalagem (encarte, caixa vazia, faceplate, réplica...): ${count('part_or_packaging')}`,
    `  - acessório: ${count('accessory')}`,
    `  - console: ${count('console')}`,
    `- Kits/lotes/combos para revisão manual (sem mudança proposta): ${count('bundle_review')}`,
    '',
    '| id | nome | atual | proposto | regra | termo | ofertas ativas | menor preço (R$) |',
    '|---|---|---|---|---|---|---|---|',
    ...changes.map(
      (c) =>
        `| ${c.id} | ${c.name.replace(/\|/g, '/')} | ${c.product_type} | ${c.proposed} | ${c.kind} | ${c.matched} | ${c.active_offers} | ${c.min_price_cents == null ? '-' : (c.min_price_cents / 100).toFixed(2)} |`
    ),
    '',
    'Antes de aplicar: backup de `master_products`, gravar o tipo anterior por id (reversível), autorização do dono. Peça/embalagem hoje cai em `accessory` (o enum só tem game/console/accessory).',
  ].join('\n');
  writeFileSync(`docs/reclassify-non-games-dryrun-${date}.md`, md, 'utf8');

  console.log(JSON.stringify({ totalMasters: rows.length, totalGames, proposed: changes.length - count('bundle_review'), part_or_packaging: count('part_or_packaging'), accessory: count('accessory'), console: count('console'), bundle_review: count('bundle_review') }));
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
