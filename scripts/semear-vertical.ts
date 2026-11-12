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
 *   --fila                      FILA POR TIPO (2026-11-12, pedido do dono: "todos os itens de cada area, sem limites"): sem --segmento/--vertical percorre TODOS os
 *                               tipos das 6 lojas; cada tipo tem orcamento PROPRIO de chamadas (--por-tipo, ou callsPerRun do segmento), a ordem e por antiguidade
 *                               (nunca semeado primeiro) e a profundidade de paginacao cresce a cada ciclo (cursor em backup/dados/semear-cursor.json,
 *                               que SO avanca com --apply ou --avancar-cursor). Ver docs/03-metodologia/COBERTURA_DE_TIPOS_LOJAS_PLUS.md.
 *   --por-tipo N                orcamento de chamadas de cada tipo na fila (padrao: callsPerRun do segmento, senao 150).
 *   --max-calls N               teto de chamadas ao ML por execucao (padrao 600; na fila, padrao = o que resta no dia; busca, /items e /products/{id} contam).
 *                               Alem dele vale o ORCAMENTO DIARIO persistente (480/dia, backup/dados/semear-estado.json): toda chamada
 *                               e cobrada ANTES de sair, em dry-run ou apply; esgotado o dia, a execucao para com seguranca.
 *   --daily-cap N               teto diario (padrao 480; so reduzir, nunca passar do autorizado pelo dono).
 *   --max-create N              teto de masters a criar por segmento (padrao: SEM TETO; so o porteiro, a identidade, a duplicata e as chamadas limitam).
 *   --limit N                   resultados por pagina de /products/search (padrao 50 = maximo medido em 10/11).
 *   --pages N                   paginas por termo (offset += limit; padrao 20; na fila 1 por passada). Para o termo se a pagina nao rendeu.
 *   --offset N                  offset da 1a pagina (padrao 0).
 *   --terms N / --terms-from K  usa N termos a partir do K-esimo (0-based) da lista do segmento (padrao todos / 0).
 *   --sem-dominio               nao filtra a busca por domain_id (padrao: filtra onde o segmento declara searchDomain).
 *   --estado                    so mostra o orcamento do dia e o cache de 404 e sai (0 chamadas).
 *   --out-dir <pasta>           onde gravar log.txt, plano.json e revisao.json (padrao backup/dados/semear-vertical-<ts>/).
 *   --apply                     GRAVA (precisa tambem de --termos-aprovados: a whitelist de termos e provisoria ate o dono curar).
 *                               Antes do 1o INSERT grava o BACKUP LOGICO (NDJSON dos masters e ofertas das verticais tocadas) em backup/dados/ e,
 *                               ao final, o LOG de reversao (ids criados) em backup/logs/semear-vertical-<ts>.json.
 *   --rollback <log.json>       desfaz um apply: apaga so o que o log criou (cotacoes, ofertas e masters); dry-run sem --apply.
 *
 * COR JUNTA (filamento/resina, chave por campos): catalogo do ML que e o mesmo produto em outra cor NAO cria master: a oferta dele entra
 * no master que ja existe (ou que este mesmo plano cria). Ver SeedPlanEntry.mergeInto.
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
import { createMlClient, RateLimited, type MlClient } from '../src/lib/catalog/vertical/ml-api';
import { planSeed, type ExistingLookup, type SeedPlanEntry, type SeedReport } from '../src/lib/catalog/vertical/seed-plan';
import { slugify } from '../src/lib/slugify';
import { isVertical } from '../src/lib/catalog/verticais';
import { DAILY_CALL_CAP, dayKeySP, effectiveMaxCalls, isKnownNotFound, remainingOn, usedOn } from '../src/lib/catalog/vertical/seed-budget';
import { formatSummary, summarizeReports } from '../src/lib/catalog/vertical/seed-utils';
import { chargeOne, loadState, rememberNotFound, STATE_FILE } from './_semear-estado';
import { advanceCursor, allocate, cursorFor, DEFAULT_CALLS_PER_TYPE_RUN, MAX_SEARCH_PAGES, nextWindow, SEARCH_PAGE_LIMIT } from '../src/lib/catalog/vertical/seed-schedule';
import { loadCursors, saveCursors, CURSOR_FILE } from './_semear-cursor';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APPLY = flag('--apply');
const FILA = flag('--fila');
const AVANCAR_CURSOR = APPLY || flag('--avancar-cursor');
const POR_TIPO = opt('--por-tipo') ? Math.max(1, Number(opt('--por-tipo'))) : undefined;
const MAX_CALLS = opt('--max-calls') ? Number(opt('--max-calls')) : FILA ? Number.POSITIVE_INFINITY : 600;
const MAX_CREATE = opt('--max-create') ? Number(opt('--max-create')) : Number.POSITIVE_INFINITY;
const PAGE_LIMIT = Math.min(SEARCH_PAGE_LIMIT, Math.max(1, Number(opt('--limit') ?? SEARCH_PAGE_LIMIT)));
const PAGES = Math.max(1, Number(opt('--pages') ?? (FILA ? 1 : MAX_SEARCH_PAGES)));
const OFFSET = Number(opt('--offset') ?? 0);
const TERMS = opt('--terms') ? Number(opt('--terms')) : undefined;
const TERMS_FROM = Number(opt('--terms-from') ?? 0);
const DAILY_CAP = Math.min(DAILY_CALL_CAP, Math.max(0, Number(opt('--daily-cap') ?? DAILY_CALL_CAP)));
const USE_DOMAIN = !flag('--sem-dominio');
let interrupted = false;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(opt('--out-dir') ?? path.join('backup', 'dados', `semear-vertical-${stamp}`));
fs.mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, 'log.txt');
function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`, 'utf8');
}

/**
 * HTTP 429 (decisao do dono, 2026-11-11: o limite real e o 429): ESPERA e retoma, sem contornar. Reenvia a MESMA chamada depois de 60 s,
 * 120 s, 240 s, 480 s e 900 s (cada tentativa e cobrada no orcamento diario, honestamente). Esgotadas, repassa o RateLimited: o segmento para
 * ('http_429') e a execucao inteira para (retomar depois com --terms-from).
 */
const RATE_WAITS_S = [60, 120, 240, 480, 900];
let rateLimitedOut = false;
function withRateLimitWait(inner: MlClient): MlClient {
  return {
    ...inner,
    async get(endpoint: string) {
      for (let i = 0; ; i++) {
        try {
          return await inner.get(endpoint);
        } catch (e) {
          if (!(e instanceof RateLimited)) throw e;
          if (i >= RATE_WAITS_S.length || interrupted) {
            rateLimitedOut = true;
            throw e;
          }
          log(`429 do ML: aguardando ${RATE_WAITS_S[i]} s antes de retomar (tentativa ${i + 1}/${RATE_WAITS_S.length}); nada e contornado`);
          await new Promise((r) => setTimeout(r, RATE_WAITS_S[i] * 1000));
        }
      }
    },
    // maxCalls do cliente interno ja conta as chamadas 429 (cada reenvio gasta 1)
  };
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
  if (FILA) return seedOrder(); // fila: todos os tipos das 6 lojas
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
    // Catalogo ja cadastrado como master OU como oferta-placeholder anexada a um master (cor junta).
    byCatalogId: async (id) =>
      (await one(sql`select id, name from master_products where meli_catalog_id = ${id} limit 1`)) ??
      (await one(sql`select m.id, m.name from affiliate_offers o join master_products m on m.id = o.master_product_id where o.external_ref = ${id} and o.seller_id is null limit 1`)),
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
      const masterName = e.masterName ?? e.name;
      let slug = slugify(masterName);
      const [coll] = await tx`select id from master_products where slug = ${slug} limit 1`;
      if (coll) slug = slugify(`${masterName}-${e.catalogId.slice(-6)}`);
      const gtin = e.identity.keyKind === 'gtin' || e.identity.keyKind === 'isbn' ? e.identity.key!.split(':')[1] : null;
      const [m] = await tx<{ id: string }[]>`
        insert into master_products (name, slug, gtin, mpn, manufacturer, meli_catalog_id, default_images, attributes, vertical, product_type, is_verified)
        values (${masterName}, ${slug}, ${gtin}, ${e.mpn}, ${e.brand}, ${e.catalogId}, ${tx.json(e.pictures)}, ${tx.json(attributes as any)}, ${e.vertical}, 'general'::product_type, false)
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

/** Oferta-placeholder de um catalogo ANEXADO (cor junta) a um master que ja existe. Idempotente por (rede, catalogo). */
async function applyAttach(sql: Sql, e: SeedPlanEntry, networkId: string, masterId: string): Promise<{ masterId: string; offerId: string } | { skipped: string }> {
  const realToolId = process.env.MELI_TOOL_ID;
  const meliUrl = `https://www.mercadolivre.com.br/p/${e.catalogId}`;
  const offerSlug = slugify(`${e.name}-${e.catalogId.slice(-6)}-${randomUUID().slice(0, 6)}`);
  const [o] = await sql<{ id: string }[]>`
    insert into affiliate_offers (master_product_id, network_id, title, slug, affiliate_url, affiliate_link_pending, image_url, external_ref,
                                  current_price_cents, status, published_at, vertical)
    values (${masterId}, ${networkId}, ${e.name}, ${offerSlug}, ${realToolId ? `${meliUrl}?matt_tool=${realToolId}` : meliUrl}, ${!realToolId},
            ${e.pictures[0] ?? null}, ${e.catalogId}, 0, 'active', now(), ${e.vertical})
    on conflict (network_id, external_ref) where external_ref is not null and seller_id is null do nothing
    returning id`;
  return o ? { masterId, offerId: o.id } : { skipped: 'oferta_placeholder_ja_existe' };
}

/** Backup logico (NDJSON) dos masters e ofertas das verticais tocadas, ANTES do primeiro INSERT do apply. */
async function backupLogico(sql: Sql, verticals: string[]): Promise<string> {
  const dir = path.resolve('backup', 'dados');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `semear-vertical-pre-${stamp}.ndjson`);
  const lines: string[] = [];
  for (const v of verticals) {
    for (const r of await sql`select * from master_products where vertical = ${v}`) lines.push(JSON.stringify({ table: 'master_products', row: r }));
    for (const r of await sql`select * from affiliate_offers where vertical = ${v}`) lines.push(JSON.stringify({ table: 'affiliate_offers', row: r }));
  }
  fs.writeFileSync(file, lines.join(String.fromCharCode(10)) + (lines.length ? String.fromCharCode(10) : ''));
  return file;
}

/** Desfaz um apply: so o que o log criou. Dry-run por padrao. */
async function rollbackFromLog(sql: Sql, logPath: string) {
  const l = JSON.parse(fs.readFileSync(path.resolve(logPath), 'utf8')) as { stamp: string; mastersCreated: string[]; offersCreated: string[] };
  log(`ROLLBACK ${APPLY ? '(APPLY)' : '(dry-run)'} do log ${l.stamp}: masters=${l.mastersCreated.length} ofertas=${l.offersCreated.length}`);
  if (!APPLY) return;
  await sql.begin(async (tx) => {
    if (l.offersCreated.length) {
      await tx`delete from affiliate_price_snapshots where offer_id in ${tx(l.offersCreated)}`;
      await tx`delete from affiliate_offers where id in ${tx(l.offersCreated)}`;
    }
    if (l.mastersCreated.length) await tx`delete from master_products where id in ${tx(l.mastersCreated)}`;
  });
  log('ROLLBACK concluido.');
}

async function main() {
  const rbIdx = argv.indexOf('--rollback');
  if (rbIdx >= 0) {
    const sqlRb = connect();
    try {
      return await rollbackFromLog(sqlRb, argv[rbIdx + 1]);
    } finally {
      await sqlRb.end({ timeout: 5 });
    }
  }
  const today = dayKeySP(new Date());
  const state0 = loadState();
  const effectiveCalls = effectiveMaxCalls(state0, today, Number.isFinite(MAX_CALLS) ? MAX_CALLS : DAILY_CAP, DAILY_CAP);
  log(`orcamento diario (${today}): usadas=${usedOn(state0, today)} restam=${remainingOn(state0, today, DAILY_CAP)} de ${DAILY_CAP}; cache de 404: ${Object.keys(state0.notFound).length} catalogos; estado=${STATE_FILE}`);
  if (flag('--estado')) return;
  if (effectiveCalls <= 0) throw new Error(`orcamento diario esgotado (${usedOn(state0, today)}/${DAILY_CAP}); nada executado, 0 chamadas`);
  log(`semear-vertical: modo=${APPLY ? 'APPLY (GRAVA)' : 'DRY-RUN (nada e gravado)'} max-calls=${effectiveCalls}${effectiveCalls < MAX_CALLS ? ` (pedido ${MAX_CALLS}, limitado pelo que resta no dia)` : ''} max-create=${MAX_CREATE} limit=${PAGE_LIMIT} pages=${PAGES} dominio=${USE_DOMAIN ? 'filtra onde declarado' : 'sem filtro'} saida=${outDir}`);
  process.on('SIGINT', () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    log('SIGINT: terminando a chamada em curso e gravando o relatorio parcial (Ctrl+C de novo aborta). O orcamento ja gasto esta salvo.');
  });
  const run = { runId: randomUUID(), startedAt: new Date().toISOString(), mode: (APPLY ? 'apply' : 'dry-run') as 'apply' | 'dry-run' };
  const segments = pickSegments();
  log(`segmentos: ${segments.map((s) => `${s.key}[${s.vertical}]`).join(', ')}`);
  const cursors = FILA ? loadCursors() : null;
  const allocations = FILA ? allocate(segments, cursors!, effectiveCalls).map((a) => (POR_TIPO ? { ...a, calls: Math.min(POR_TIPO, a.calls) } : a)) : null;
  if (allocations) log(`FILA: ${allocations.length} tipos nesta execucao (de ${segments.length}); orcamento por tipo=${POR_TIPO ?? `callsPerRun (padrao ${DEFAULT_CALLS_PER_TYPE_RUN})`}; cursor=${CURSOR_FILE} (avanca: ${AVANCAR_CURSOR ? 'sim' : 'nao, dry-run'})`);
  const jobs: Array<{ seg: SegmentConfig; calls?: number }> = allocations ? allocations.map((a) => ({ seg: a.segment, calls: a.calls })) : segments.map((s) => ({ seg: s }));
  if (APPLY && !flag('--termos-aprovados')) {
    throw new Error(`--apply exige --termos-aprovados: a whitelist de termos esta ${TERMS_STATUS.toUpperCase()} (proposta do engenheiro) ate o dono/guardiao curar.`);
  }
  const sql = connect();
  const reports: SeedReport[] = [];
  const applied: Array<{ catalogId: string; masterId?: string; offerId?: string; skipped?: string; anexadoA?: string }> = [];
  const masterByCatalog = new Map<string, string>(); // catalogo -> master criado nesta execucao (para anexar cores)
  const mastersCreated: string[] = [];
  const offersCreated: string[] = [];
  let backupFile: string | null = null;
  let runHandle: { counters: any; finish(o?: any): Promise<void> } | null = null;
  try {
    const token = await readToken(sql);
    const client = withRateLimitWait(createMlClient({
      token,
      maxCalls: effectiveCalls,
      beforeCall: () => chargeOne(run, DAILY_CAP),
      onCall: (c) => log(`ML #${c.n}/${effectiveCalls} ${c.endpoint} -> ${c.status} (${c.ms} ms)`),
    }));
    let notFoundState = state0;
    const lookup = await buildLookup(sql);
    if (APPLY) {
      const { startCollectorRun } = await import('../src/server/collector/collector-runs');
      runHandle = await startCollectorRun(`semear-vertical:${segments.map((s) => s.key).join('+')}`, 'mercado-livre');
    }
    for (const job of jobs) {
      const seg = job.seg;
      const cur = cursors ? cursorFor(cursors, seg) : null;
      const win = cur ? nextWindow(seg, cur, job.calls ?? DEFAULT_CALLS_PER_TYPE_RUN) : null;
      log(`--- segmento ${seg.key} (${seg.vertical})${win ? ` | fila: profundidade=${win.depth} (offset ${win.offset}) ciclo=${cur!.cycles} orcamento=${job.calls} chamadas` : ''} | termos: ${(win ? win.terms : seg.terms.slice(0, TERMS ?? seg.terms.length)).join(' | ')}${seg.domainUnconfirmed ? ' | DOMINIO A CONFIRMAR (busca sem domain_id)' : ''}`);
      if (interrupted) break;
      if (win && win.terms.length === 0) {
        log('  nenhum termo vivo para esta profundidade; avancando o ciclo.');
        if (AVANCAR_CURSOR) cursors!.segments[seg.key] = advanceCursor(seg, cur!, win, { termsTouched: [], termStops: {}, planned: 0, calls: 0 }, new Date());
        continue;
      }
      const rep = await planSeed(client, seg, lookup, {
        pageLimit: PAGE_LIMIT,
        offset: win ? win.offset : OFFSET,
        pages: PAGES,
        ...(win ? { terms: win.terms, segmentCalls: job.calls } : { termsLimit: TERMS, termsFrom: TERMS_FROM }),
        maxCreate: MAX_CREATE,
        useSearchDomain: USE_DOMAIN && !seg.domainUnconfirmed,
        isKnownNotFound: (id) => isKnownNotFound(notFoundState, id, new Date()),
        onNotFound: (id) => {
          rememberNotFound(id);
          notFoundState = loadState();
        },
        shouldStop: () => interrupted,
        log,
      });
      reports.push(rep);
      if (win && cursors) {
        cursors.segments[seg.key] = advanceCursor(seg, cur!, win, { termsTouched: rep.termsTouched, termStops: rep.termStops, planned: rep.plans.filter((p) => !p.mergeInto).length, calls: rep.callsSpent, rateLimited: rep.stoppedBecause === 'http_429' }, new Date());
        if (AVANCAR_CURSOR) saveCursors(cursors);
      }
      log(`segmento ${seg.key}: buscas=${rep.termsSearched} resultados=${rep.searchResults} chamadas=${rep.callsSpent} planejados=${rep.plans.length} revisao=${rep.reviews.length} parou=${rep.stoppedBecause ?? '-'}`);
      log(`  paradas por termo: ${JSON.stringify(rep.termStops)}`);
      if (rateLimitedOut || rep.stoppedBecause === 'http_429') {
        log('  429 persistente depois de todas as esperas: rodada interrompida. Retomar depois com --terms-from <proximo termo> (ver paradas por termo acima).');
        break;
      }
      if (rep.stoppedBecause === 'teto_diario' || rep.stoppedBecause === 'teto_de_chamadas') {
        log('  orcamento acabou neste segmento; os demais nao serao buscados.');
      }
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
        if (!backupFile) {
          backupFile = await backupLogico(sql, Array.from(new Set(segments.map((s) => s.vertical))));
          log(`BACKUP LOGICO gravado antes do primeiro INSERT: ${backupFile}`);
        }
        for (const p of rep.plans) {
          let r: Awaited<ReturnType<typeof applyEntry>>;
          if (p.mergeInto) {
            const target = p.mergeInto.kind === 'existing' ? p.mergeInto.ref : masterByCatalog.get(p.mergeInto.ref);
            if (!target) {
              applied.push({ catalogId: p.catalogId, skipped: 'master_alvo_da_cor_junta_nao_criado' });
              log(`  PULADO ${p.catalogId}: master alvo da cor junta nao foi criado`);
              continue;
            }
            r = await applyAttach(sql, p, net.id, target);
          } else r = await applyEntry(sql, p, net.id);
          if ('skipped' in r) {
            applied.push({ catalogId: p.catalogId, skipped: r.skipped });
            log(`  PULADO ${p.catalogId}: ${r.skipped}`);
            continue;
          }
          // Cotacao inicial REAL do placeholder = menor preco entre os anuncios novos devolvidos pela API.
          const wrote = await recordPriceSnapshot({ offerId: r.offerId, priceCents: p.priceMinCents!, listPriceCents: p.bestOriginalPriceCents, source: 'api' });
          if (!p.mergeInto) {
            lookup.remember(p, r.masterId);
            masterByCatalog.set(p.catalogId, r.masterId);
            mastersCreated.push(r.masterId);
          }
          offersCreated.push(r.offerId);
          if (runHandle) {
            runHandle.counters.offersCreated++;
            if (wrote) runHandle.counters.snapshotsWritten++;
          }
          applied.push({ catalogId: p.catalogId, masterId: r.masterId, offerId: r.offerId, ...(p.mergeInto ? { anexadoA: r.masterId } : {}) });
          log(`  ${p.mergeInto ? 'ANEXADO (cor junta)' : 'CRIADO'} ${p.catalogId}: master=${r.masterId} oferta=${r.offerId} snapshot=${wrote}`);
        }
      }
    }
    const used = client.used();
    const summary = summarizeReports(reports, mastersCreated.length);
    if (APPLY && (mastersCreated.length || offersCreated.length)) {
      const logsDir = path.resolve('backup', 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
      const logJson = path.join(logsDir, `semear-vertical-${stamp}.json`);
      fs.writeFileSync(logJson, JSON.stringify({ stamp, segmentos: segments.map((s) => s.key), backup: backupFile, mastersCreated, offersCreated, applied }, null, 2));
      fs.copyFileSync(logFile, path.join(logsDir, `semear-vertical-${stamp}.log`));
      log(`LOG DE REVERSAO: ${logJson} (reverter: scripts/semear-vertical.ts --rollback <log> --apply)`);
    }
    for (const line of formatSummary(summary, APPLY)) log(line);
    const after = loadState();
    log(`orcamento diario apos a execucao: usadas=${usedOn(after, today)} restam=${remainingOn(after, today, DAILY_CAP)} de ${DAILY_CAP}`);
    fs.writeFileSync(path.join(outDir, 'relatorio.json'), JSON.stringify({ apply: APPLY, dia: today, resumo: summary, orcamento: { usadas: usedOn(after, today), teto: DAILY_CAP } }, null, 2));
    log(`TOTAL: chamadas ao ML=${used}/${effectiveCalls}; planejados=${reports.reduce((n, r) => n + r.plans.length, 0)}; revisao=${reports.reduce((n, r) => n + r.reviews.length, 0)}; ` +
      `${APPLY ? `masters_criados=${mastersCreated.length} ofertas_criadas=${offersCreated.length}` : 'NADA GRAVADO (dry-run)'}`);
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
