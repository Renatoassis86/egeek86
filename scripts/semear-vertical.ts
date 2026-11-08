/**
 * Semeadura por departamento (vertical): cria masters/ofertas das verticais a partir do catalogo OFICIAL do Mercado Livre.
 * ADR 0008 itens 4 e 5; ata 2026-11-08 (Fase 2). DRY-RUN por padrao: so LE a API do ML e o banco; nada e gravado.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/semear-vertical.ts --segmento livros            # dry-run
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/semear-vertical.ts --vertical tecnologia --max-calls 40
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/semear-vertical.ts --segmento livros --apply --termos-aprovados
 *
 * Opcoes:
 *   --segmento <chave[,chave]>  segmentos (config.ts); --vertical <nome> usa todos do departamento; sem nenhum: o 1o da ordem de semeadura.
 *   --max-calls N               teto de chamadas ao ML por execucao (padrao 40; busca, /items e /products/{id} contam).
 *   --max-create N              teto de masters a criar por segmento (padrao 20).
 *   --limit N / --offset N      pagina de /products/search (padrao 10 / 0).
 *   --terms N                   quantos termos da whitelist usar (padrao todos).
 *   --out-dir <pasta>           onde gravar log.txt, plano.json e revisao.json (padrao backup/dados/semear-vertical-<ts>/).
 *   --apply                     GRAVA (precisa tambem de --termos-aprovados: a whitelist de termos e provisoria ate o dono curar).
 *
 * Fluxo por candidato: /products/search (termo da whitelist) -> filtra domain_id do segmento -> exige identidade FORTE
 * (ISBN/GTIN/MPN/marca+modelo; sem isso vai para revisao, nunca vira master) -> checa duplicata (catalogo ML, GTIN, chave,
 * titulo normalizado; 0 chamadas) -> /products/{id}/items (404 "No winners found" = catalogo sem vendedor: descarta sem retentar)
 * -> /products/{id} -> porteiro do departamento -> plano. Usado/Open Box/recondicionado/importado ficam fora.
 * O master nasce com attributes.catalogGate.verdict='review' (rede de seguranca: invisivel) e product_type 'general' por SQL cru
 * (o valor existe so no banco, nao no enum TypeScript). Dado que a API nao devolve fica NULL. Nunca usa /sites/MLB/search.
 * Shopee: NAO implementada (sem credenciais neste ambiente; ver ADR 0008). Nao ha scraping.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { connect } from './_dup-shared';
import { segmentByKey, segmentsOf, seedOrder, TERMS_STATUS, type NonGamesVertical, type SegmentConfig } from '../src/lib/catalog/vertical/config';
import { reviewGateFor } from '../src/lib/catalog/vertical/gate';
import { normalizeTitleKey } from '../src/lib/catalog/vertical/identity';
import { createMlClient } from '../src/lib/catalog/vertical/ml-api';
import { planSeed, type ExistingLookup, type SeedPlanEntry, type SeedReport } from '../src/lib/catalog/vertical/seed-plan';
import { slugify } from '../src/lib/slugify';
import { isVertical } from '../src/lib/catalog/verticais';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APPLY = flag('--apply');
const MAX_CALLS = Number(opt('--max-calls') ?? 40);
const MAX_CREATE = Number(opt('--max-create') ?? 20);
const PAGE_LIMIT = Number(opt('--limit') ?? 10);
const OFFSET = Number(opt('--offset') ?? 0);
const TERMS = opt('--terms') ? Number(opt('--terms')) : undefined;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(opt('--out-dir') ?? path.join('backup', 'dados', `semear-vertical-${stamp}`));
fs.mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, 'log.txt');
function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`, 'utf8');
}

function pickSegments(): SegmentConfig[] {
  const seg = opt('--segmento');
  const vert = opt('--vertical');
  if (seg) {
    return seg.split(',').map((k) => {
      const s = segmentByKey(k.trim());
      if (!s) throw new Error(`segmento desconhecido: ${k}`);
      return s;
    });
  }
  if (vert) {
    if (!isVertical(vert) || vert === 'games') throw new Error(`vertical invalida: ${vert}`);
    return segmentsOf(vert as NonGamesVertical);
  }
  return [seedOrder()[0]];
}

type Sql = postgres.Sql<{}>;

async function readToken(sql: Sql): Promise<string> {
  if (APPLY) {
    // Com --apply a renovacao do token (que grava no banco) e aceitavel: mesmo caminho do coletor.
    const { getValidAccessToken } = await import('../src/server/collector/sources/mercado-livre-auth');
    return getValidAccessToken();
  }
  // Dry-run: SELECT puro em system_config; token expirado PARA o script (renovar regravaria o refresh_token no banco).
  const rows = await sql`select value from system_config where key = 'mercado_livre_oauth' limit 1`;
  const v = rows[0]?.value as { accessToken?: string; expiresAt?: number } | undefined;
  if (!v?.accessToken) throw new Error('ML: nenhum token salvo em system_config (OAuth nao concluido)');
  const min = Math.round(((v.expiresAt ?? 0) - Date.now()) / 60000);
  if (min < 3) throw new Error(`ML: access_token expirado ou a ${min} min de expirar; o dry-run nao renova (gravaria no banco)`);
  log(`token ML ok (expira em ~${min} min; valor nao impresso)`);
  return v.accessToken;
}

/** Consultas de duplicata (SELECT). Titulos: todos os masters fora de games + consoles/acessorios gamer (duplicata entre departamentos). */
async function buildLookup(sql: Sql): Promise<ExistingLookup & { remember(e: SeedPlanEntry, id: string): void }> {
  const titleRows = await sql<{ id: string; name: string }[]>`
    select id, name from master_products
    where (vertical <> 'games' or product_type in ('console', 'accessory')) and (attributes ->> 'mergedInto') is null`;
  const titles = new Map<string, { id: string; name: string }>();
  for (const r of titleRows) {
    const k = normalizeTitleKey(r.name);
    if (k && !titles.has(k)) titles.set(k, r);
  }
  log(`duplicata por titulo: ${titles.size} titulos normalizados carregados (masters fora de games + console/acessorio gamer)`);
  const one = async (q: Promise<{ id: string; name: string }[]>) => (await q)[0] ?? null;
  return {
    byCatalogId: (id) => one(sql`select id, name from master_products where meli_catalog_id = ${id} limit 1`),
    byGtins: (g) => one(sql`select id, name from master_products where gtin in ${sql(g)} limit 1`),
    byIdentityKey: (k) => one(sql`select id, name from master_products where attributes -> 'vertical' ->> 'identityKey' = ${k} limit 1`),
    byTitleKey: async (k) => titles.get(k) ?? null,
    remember(e, id) {
      const k = normalizeTitleKey(e.name);
      if (k) titles.set(k, { id, name: e.name });
    },
  };
}

function money(c: number | null) {
  return c == null ? 'n/d' : `R$ ${(c / 100).toFixed(2)}`;
}

/** Cria master (review, product_type 'general') + oferta-placeholder do catalogo, numa transacao. Idempotente por catalogo/GTIN/chave. */
async function applyEntry(sql: Sql, e: SeedPlanEntry, networkId: string): Promise<{ masterId: string; offerId: string } | { skipped: string }> {
  const now = new Date().toISOString();
  const attributes = {
    catalogGate: reviewGateFor(e.gate, now),
    vertical: {
      segment: e.segment,
      identityKey: e.identity.key,
      keyKind: e.identity.keyKind,
      domainId: e.domainId,
      parentId: e.parentId,
      gtins: e.identity.gtins,
      source: 'semear-vertical',
      seededAt: now,
      catalogAttributes: e.attributesSnapshot,
    },
  };
  const realToolId = process.env.MELI_TOOL_ID;
  const meliUrl = `https://www.mercadolivre.com.br/p/${e.catalogId}`;
  try {
    return await sql.begin(async (tx) => {
      let slug = slugify(e.name);
      const [coll] = await tx`select id from master_products where slug = ${slug} limit 1`;
      if (coll) slug = slugify(`${e.name}-${e.catalogId.slice(-6)}`);
      const gtin = e.identity.keyKind === 'gtin' || e.identity.keyKind === 'isbn' ? e.identity.key!.split(':')[1] : null;
      const [m] = await tx<{ id: string }[]>`
        insert into master_products (name, slug, gtin, mpn, manufacturer, meli_catalog_id, default_images, attributes, vertical, product_type, is_verified)
        values (${e.name}, ${slug}, ${gtin}, ${e.mpn}, ${e.brand}, ${e.catalogId}, ${tx.json(e.pictures)}, ${tx.json(attributes as any)}, ${e.vertical}, 'general'::product_type, false)
        returning id`;
      const offerSlug = slugify(`${e.name}-${e.catalogId.slice(-6)}-${randomUUID().slice(0, 6)}`);
      const [o] = await tx<{ id: string }[]>`
        insert into affiliate_offers (master_product_id, network_id, title, slug, affiliate_url, affiliate_link_pending, image_url, external_ref,
                                      current_price_cents, status, published_at, vertical)
        values (${m.id}, ${networkId}, ${e.name}, ${offerSlug}, ${realToolId ? `${meliUrl}?matt_tool=${realToolId}` : meliUrl}, ${!realToolId},
                ${e.pictures[0] ?? null}, ${e.catalogId}, 0, 'active', now(), ${e.vertical})
        on conflict (network_id, external_ref) where external_ref is not null and seller_id is null do nothing
        returning id`;
      if (!o) throw new Error('__oferta_ja_existe__'); // desfaz o master criado agora
      return { masterId: m.id, offerId: o.id };
    });
  } catch (err: any) {
    if (err?.message === '__oferta_ja_existe__') return { skipped: 'oferta_placeholder_ja_existe' };
    if (err?.code === '23505') return { skipped: `violacao_unicidade:${err.constraint_name ?? ''}` };
    throw err;
  }
}

async function main() {
  log(`semear-vertical: modo=${APPLY ? 'APPLY (GRAVA)' : 'DRY-RUN (nada e gravado)'} max-calls=${MAX_CALLS} max-create=${MAX_CREATE} saida=${outDir}`);
  const segments = pickSegments();
  log(`segmentos: ${segments.map((s) => `${s.key}[${s.vertical}]`).join(', ')}`);
  if (APPLY && !flag('--termos-aprovados')) {
    throw new Error(`--apply exige --termos-aprovados: a whitelist de termos esta ${TERMS_STATUS.toUpperCase()} (proposta do engenheiro) ate o dono/guardiao curar.`);
  }
  const sql = connect();
  const reports: SeedReport[] = [];
  const applied: Array<{ catalogId: string; masterId?: string; offerId?: string; skipped?: string }> = [];
  let runHandle: { counters: any; finish(o?: any): Promise<void> } | null = null;
  try {
    const token = await readToken(sql);
    const client = createMlClient({ token, maxCalls: MAX_CALLS, onCall: (c) => log(`ML #${c.n}/${MAX_CALLS} ${c.endpoint} -> ${c.status} (${c.ms} ms)`) });
    const lookup = await buildLookup(sql);
    if (APPLY) {
      const { startCollectorRun } = await import('../src/server/collector/collector-runs');
      runHandle = await startCollectorRun(`semear-vertical:${segments.map((s) => s.key).join('+')}`, 'mercado-livre');
    }
    for (const seg of segments) {
      log(`--- segmento ${seg.key} (${seg.vertical}) | termos: ${seg.terms.slice(0, TERMS ?? seg.terms.length).join(' | ')}`);
      const rep = await planSeed(client, seg, lookup, { pageLimit: PAGE_LIMIT, offset: OFFSET, termsLimit: TERMS, maxCreate: MAX_CREATE, log });
      reports.push(rep);
      log(`segmento ${seg.key}: buscas=${rep.termsSearched} resultados=${rep.searchResults} planejados=${rep.plans.length} revisao=${rep.reviews.length} parou=${rep.stoppedBecause ?? '-'}`);
      log(`  contagens: ${JSON.stringify(rep.counts)}`);
      for (const p of rep.plans) {
        log(
          `  CRIARIA: ${p.catalogId} | ${p.name} | chave=${p.identity.key} | dominio=${p.domainId} | anuncios_novos=${p.sellers} (vendedores=${p.distinctSellers}) | ` +
            `${money(p.priceMinCents)}..${money(p.priceMaxCents)} | porteiro=${p.gate.verdict}/${p.gate.reason}${p.partial ? ' | PARCIAL(206/total>itens)' : ''}`
        );
      }
      if (APPLY && rep.plans.length > 0) {
        const [net] = await sql<{ id: string }[]>`select id from affiliate_networks where slug = 'mercado-livre' limit 1`;
        if (!net) throw new Error('rede mercado-livre nao cadastrada em affiliate_networks');
        const { recordPriceSnapshot } = await import('../src/server/collector/record-price-snapshot');
        for (const p of rep.plans) {
          const r = await applyEntry(sql, p, net.id);
          if ('skipped' in r) {
            applied.push({ catalogId: p.catalogId, skipped: r.skipped });
            log(`  PULADO ${p.catalogId}: ${r.skipped}`);
            continue;
          }
          // Cotacao inicial REAL do placeholder = menor preco entre os anuncios novos devolvidos pela API.
          const wrote = await recordPriceSnapshot({ offerId: r.offerId, priceCents: p.priceMinCents!, listPriceCents: p.bestOriginalPriceCents, source: 'api' });
          lookup.remember(p, r.masterId);
          if (runHandle) {
            runHandle.counters.offersCreated++;
            if (wrote) runHandle.counters.snapshotsWritten++;
          }
          applied.push({ catalogId: p.catalogId, masterId: r.masterId, offerId: r.offerId });
          log(`  CRIADO ${p.catalogId}: master=${r.masterId} oferta=${r.offerId} snapshot=${wrote}`);
        }
      }
    }
    const used = client.used();
    log(`TOTAL: chamadas ao ML=${used}/${MAX_CALLS}; planejados=${reports.reduce((n, r) => n + r.plans.length, 0)}; revisao=${reports.reduce((n, r) => n + r.reviews.length, 0)}; ` +
      `${APPLY ? `criados=${applied.filter((a) => a.masterId).length}` : 'NADA GRAVADO (dry-run)'}`);
    if (runHandle) {
      runHandle.counters.queries = used;
      runHandle.counters.checked = used;
      await runHandle.finish({ meta: { segments: segments.map((s) => s.key), planned: reports.reduce((n, r) => n + r.plans.length, 0) } });
    }
    fs.writeFileSync(path.join(outDir, 'plano.json'), JSON.stringify({ apply: APPLY, chamadas: client.history(), reports, applied }, null, 2));
    log(`plano gravado em ${path.join(outDir, 'plano.json')}`);
  } catch (e) {
    if (runHandle) await runHandle.finish({ fatal: true, meta: { error: (e as Error).message.slice(0, 200) } });
    throw e;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  log(`ERRO: ${(e as Error).message}`);
  process.exit(1);
});
