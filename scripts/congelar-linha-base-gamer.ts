/**
 * LINHA DE BASE GAMER (Fase 0, ata 2026-11-08 sub-plataforma). SOMENTE LEITURA:
 * uma transação READ ONLY via connect() de _dup-shared.ts; nenhum INSERT/UPDATE/DDL.
 *
 * Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/congelar-linha-base-gamer.ts [saida.json]
 * Padrão de saída: docs/linha-base-gamer-2026-11-08.json
 *
 * Cada campo traz `estabilidade`:
 *  - 'estavel'  : não muda com a coleta ao vivo; após a migração 0027 DEVE ser idêntico (diferença zero).
 *  - 'volatil'  : muda naturalmente com a coleta (preço, ofertas ativas, frescor); comparar por tolerância.
 *  - 'append'   : só cresce (histórico append-only); comparar como piso (>= baseline).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import { connect, type Tx } from './_dup-shared';
import { publicOffersCtes, catalogGateVisibleSql } from '../src/server/queries/public-offers';
import { priceQuotesCtes, statsAggCtes } from '../src/server/queries/product-price-stats';
import { GAMES } from '../src/lib/catalog/verticais';

const dialect = new PgDialect();
async function run<T = Record<string, unknown>>(tx: Tx, q: SQL): Promise<T[]> {
  const { sql: text, params } = dialect.sqlToQuery(q);
  return (await tx.unsafe(text, params as never[])) as unknown as T[];
}
const num = (v: unknown) => (v == null ? null : Number(v));
type Stab = 'estavel' | 'volatil' | 'append';
const campo = <T>(estabilidade: Stab, valor: T, nota?: string) => ({ estabilidade, valor, ...(nota ? { nota } : {}) });

async function main() {
  const out = process.argv[2] ?? path.resolve(process.cwd(), 'docs/linha-base-gamer-2026-11-08.json');
  const db = connect();
  const result: Record<string, unknown> = {};
  try {
    await db.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY', async (tx) => {
      // 1) masters. master_products NAO tem coluna status: o equivalente real é o veredito do porteiro.
      const byType = await run<{ product_type: string; n: number }>(tx, sql`SELECT product_type::text, COUNT(*)::int AS n FROM master_products GROUP BY 1 ORDER BY 1`);
      const byVerdict = await run<{ product_type: string; verdict: string; n: number }>(tx, sql`
        SELECT product_type::text,
               COALESCE(attributes -> 'catalogGate' ->> 'verdict', '(sem veredito)') AS verdict, COUNT(*)::int AS n
        FROM master_products GROUP BY 1, 2 ORDER BY 1, 2`);
      const merged = await run<{ n: number }>(tx, sql`SELECT COUNT(*)::int AS n FROM master_products WHERE attributes ? 'mergedInto'`);
      const verticalCol = await run<{ n: number }>(tx, sql`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name='master_products' AND column_name='vertical'`);
      result.masters = {
        total: campo('estavel', byType.reduce((s, r) => s + r.n, 0), 'muda se a descoberta cadastrar master novo; comparar total gamer'),
        por_product_type: campo('estavel', Object.fromEntries(byType.map((r) => [r.product_type, r.n]))),
        por_veredito_porteiro: campo('estavel', byVerdict, 'master_products nao tem coluna status; veredito do porteiro e o mais proximo'),
        mesclados_mergedInto: campo('estavel', merged[0].n),
        coluna_vertical_existia_na_linha_base: campo('estavel', verticalCol[0].n > 0),
      };

      // 2) ofertas por rede e status
      const offers = await run<{ rede: string; status: string; n: number }>(tx, sql`
        SELECT n.slug::text AS rede, o.status::text AS status, COUNT(*)::int AS n
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id GROUP BY 1, 2 ORDER BY 1, 2`);
      result.ofertas_por_rede_status = campo('volatil', offers, 'ativas/expiradas mudam com a coleta; comparar por tolerancia');

      // 3) superficies publicas (mesmas CTEs do site)
      const pub = await run<{ offers: number; masters: number }>(tx, sql`
        WITH ${publicOffersCtes(GAMES)}
        SELECT COUNT(*)::int AS offers, COUNT(DISTINCT master_product_id)::int AS masters FROM public_offers`);
      const gate = await run<{ n: number }>(tx, sql`SELECT COUNT(*)::int AS n FROM master_products m WHERE ${catalogGateVisibleSql('m.id')}`);
      const quotes = await run<{ quotes: number; masters: number }>(tx, sql`
        WITH ${priceQuotesCtes(sql`TRUE`, GAMES)}
        SELECT COUNT(*)::int AS quotes, COUNT(DISTINCT master_product_id)::int AS masters FROM q`);
      result.superficies_publicas = {
        public_offers_ofertas: campo('volatil', pub[0].offers, 'publicOffersCtes(): frescor 7d, plausibilidade, porteiro, identidade'),
        public_offers_masters: campo('volatil', pub[0].masters),
        masters_visiveis_pelo_porteiro: campo('estavel', gate[0].n, 'catalogGateVisibleSql sobre todos os masters'),
        priceQuotes_cotacoes_plausiveis: campo('append', quotes[0].quotes, 'priceQuotesCtes(TRUE): historico cresce com a coleta'),
        priceQuotes_masters_com_cotacao: campo('append', quotes[0].masters),
      };

      // 4) sitemap: mesma query de src/app/sitemap.ts (sem HTTP, sem LIMIT, sem o filtro TS hidden)
      const sm = await run<{ masters: number; ofertas: number }>(tx, sql`
        SELECT COUNT(DISTINCT o.master_product_id)::int AS masters, COUNT(*)::int AS ofertas
        FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id
        WHERE o.status = 'active' AND o.current_price_cents > 0 AND o.quarantined_at IS NULL
          AND o.image_url IS NOT NULL AND o.image_url <> ''
          AND NOT (m.attributes ? 'mergedInto')
          AND (COALESCE(m.attributes -> 'catalogGate' ->> 'verdict', 'approved') = 'approved'
               OR m.attributes -> 'catalogGate' ->> 'manual' = 'approved')`);
      const arts = await run<{ n: number }>(tx, sql`SELECT COUNT(*)::int AS n FROM news_articles WHERE status = 'published' AND kind = 'original'`);
      result.sitemap = {
        urls_de_oferta_masters_distintos_antes_do_limite: campo('volatil', sm[0].masters,
          'sitemap real aplica LIMIT 5000 ofertas por updated_at e o filtro TS getDimensionOverrides().hidden (nao reproduzido aqui)'),
        ofertas_elegiveis_antes_do_limite: campo('volatil', sm[0].ofertas),
        urls_fixas: campo('estavel', 4),
        urls_noticias: campo('estavel', Math.min(arts[0].n, 500)),
      };

      // 5) price_daily_state
      const st = await run<Record<string, unknown>>(tx, sql`
        SELECT COUNT(*)::int AS linhas,
               COUNT(*) FILTER (WHERE closed)::int AS fechadas,
               COALESCE(SUM(min_cents),0)::text AS soma_min_cents,
               COALESCE(SUM(avg_cents),0)::text AS soma_avg_cents,
               COALESCE(SUM(n_offers),0)::text AS soma_n_offers,
               MIN(day)::text AS dia_min, MAX(day)::text AS dia_max,
               (MAX(day) FILTER (WHERE closed))::text AS dia_max_fechado
        FROM price_daily_state`);
      const closedRows = await run<{ k: string }>(tx, sql`
        SELECT master_product_id::text || '|' || day::text || '|' || COALESCE(min_cents::text,'') || '|' || COALESCE(round(avg_cents)::text,'') || '|' || n_offers::text AS k
        FROM price_daily_state WHERE closed ORDER BY master_product_id, day`);
      const h = crypto.createHash('sha256');
      for (const r of closedRows) h.update(r.k + '\n');
      result.price_daily_state = {
        linhas_total: campo('append', st[0].linhas, 'dia corrente reescreve; novos dias entram'),
        linhas_fechadas: campo('append', st[0].fechadas),
        soma_min_cents_total: campo('volatil', st[0].soma_min_cents),
        soma_avg_cents_total: campo('volatil', st[0].soma_avg_cents),
        soma_n_offers_total: campo('volatil', st[0].soma_n_offers),
        dia_min: campo('estavel', st[0].dia_min),
        dia_max: campo('append', st[0].dia_max),
        dia_max_fechado: campo('append', st[0].dia_max_fechado),
        hash_sha256_dias_fechados: campo('append', h.digest('hex'),
          'hash de TODAS as linhas fechadas (master|dia|min|round(avg)|n_offers). Para comparar depois, restrinja a day <= dia_max_fechado desta base; o hash completo so coincide se nenhum dia novo fechou'),
      };

      // 6) amostra deterministica
      const sample = await run<{ id: string; name: string }>(tx, sql`
        SELECT m.id::text, m.name
        FROM master_products m JOIN affiliate_offers o ON o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0
        WHERE ${catalogGateVisibleSql('m.id')}
        GROUP BY m.id, m.name HAVING COUNT(*) >= 3 ORDER BY m.id LIMIT 20`);
      const ids = sample.map((s) => s.id);
      const idList = sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
      const now = await run<{ master_product_id: string; n: number; min_cents: string; avg_cents: string }>(tx, sql`
        WITH ${publicOffersCtes(GAMES)}
        SELECT master_product_id::text, COUNT(*)::int AS n, MIN(current_price_cents)::text AS min_cents, ROUND(AVG(current_price_cents))::text AS avg_cents
        FROM public_offers WHERE master_product_id IN (${idList}) GROUP BY 1`);
      const hist = await run<{ master_product_id: string; avg_cents: string | null; min_all: string | null; quote_count: number }>(tx, sql`
        WITH ${statsAggCtes(sql`o.master_product_id IN (${idList})`, GAMES)}
        SELECT master_product_id::text, ROUND(avg_cents)::text AS avg_cents, min_all::text, quote_count FROM product_stats`);
      const nowM = new Map(now.map((r) => [r.master_product_id, r]));
      const histM = new Map(hist.map((r) => [r.master_product_id, r]));
      result.amostra_20_masters = {
        criterio: 'ORDER BY master_products.id, primeiros 20 com >=3 ofertas ativas e porteiro visivel. A selecao pode mudar se uma oferta expirar; comparar pelos ids gravados aqui.',
        itens: sample.map((s) => ({
          id: s.id,
          name: s.name,
          preco_do_momento: { estabilidade: 'volatil', ofertas_publicas: num(nowM.get(s.id)?.n), minimo_cents: num(nowM.get(s.id)?.min_cents), media_cents: num(nowM.get(s.id)?.avg_cents) },
          historico: { estabilidade: 'append', media_historica_cents: num(histM.get(s.id)?.avg_cents), menor_historico_cents: num(histM.get(s.id)?.min_all), cotacoes: num(histM.get(s.id)?.quote_count) },
        })),
      };

      // 7) price_min_events
      const ev = await run<{ n: number; live: number; recon: number }>(tx, sql`
        SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE source='live')::int AS live, COUNT(*) FILTER (WHERE source='reconstructed')::int AS recon FROM price_min_events`);
      result.price_min_events = {
        total: campo('append', ev[0].n), live: campo('append', ev[0].live), reconstructed: campo('estavel', ev[0].recon),
      };
    });
  } finally {
    await db.end({ timeout: 5 });
  }
  const doc = {
    descricao: 'Linha de base GAMER antes das verticais (migracao 0027). Somente leitura. Sem horario de coleta de proposito.',
    regra_de_comparacao: { estavel: 'deve ser identico apos a migracao', volatil: 'varia com a coleta ao vivo; comparar por tolerancia/ordem de grandeza', append: 'so cresce; comparar como piso (>= baseline)' },
    ...result,
  };
  fs.writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log('Linha de base gravada em', out);
}
main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
