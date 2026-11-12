/**
 * Testes da SEMEADURA NO SERVIDOR (2026-11-12): fatia da fila por cron com dependencias falsas. Sem banco, sem rede.
 * Cobre: desligada por padrao, dry-run (nao grava, nao avanca cursor), apply (grava e avanca), 429 (para e recua),
 * recuo e retomada, teto diario, freio Plus, trava, orcamento de tempo e cursor por tipo.
 * Uso: npx tsx scripts/test-semeadura-servidor.ts   (sai com codigo 1 se algo falhar)
 */
import fs from 'node:fs';
import { createMlClient } from '../src/lib/catalog/vertical/ml-api';
import type { ExistingLookup, SeedPlanEntry } from '../src/lib/catalog/vertical/seed-plan';
import {
  backoffMinutes,
  emptyServerState,
  normalizeServerState,
  parseLojas,
  pruneNotFoundMap,
  runSeedSlice,
  segmentsForLojas,
  settleState,
  usedInWindow,
  type ApplyOutcome,
  type SeedServerState,
  type SeedSliceDeps,
  type SeedSliceOptions,
} from '../src/lib/catalog/vertical/seed-slice';
import { DAILY_CALL_CAP, dayKeySP } from '../src/lib/catalog/vertical/seed-budget';

let fails = 0;
let total = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`);
  }
}

const T0 = Date.parse('2026-11-12T15:00:00.000Z');
const DAY = dayKeySP(new Date(T0));

// Candidato valido do tipo Livros (dominio MLB-BOOKS, ISBN-13 valido): identidade forte, sem marca obrigatoria.
const goodPayload = {
  id: 'MLB9001',
  name: 'Livro Rpg Tormenta20 Edicao Jogo Do Ano',
  domain_id: 'MLB-BOOKS',
  attributes: [{ id: 'GTIN', value_name: '9788535914849' }],
  pictures: [{ secure_url: 'https://x/a.jpg' }],
};
const itemsOk = { paging: { total: 1, offset: 0, limit: 100 }, results: [{ item_id: 'MLBX1', seller_id: 1, condition: 'new', price: 1200 }] };

interface World {
  state: SeedServerState;
  saves: SeedServerState[];
  notFound: Record<string, string>;
  fetched: string[];
  applied: SeedPlanEntry[][];
  runs: Array<{ job: string; fin: unknown }>;
  nowMs: number;
  tickPerCall: number;
  measured: { h1: number; h24: number } | null;
  mode: 'vazio' | 'candidato' | '429' | '429-na-2a';
  stateLoads: number;
}

function mkWorld(over: Partial<World> = {}): World {
  return { state: emptyServerState(), saves: [], notFound: {}, fetched: [], applied: [], runs: [], nowMs: T0, tickPerCall: 0, measured: null, mode: 'vazio', stateLoads: 0, ...over };
}

function deps(w: World): SeedSliceDeps {
  const lookup: ExistingLookup & { remember(e: SeedPlanEntry, id: string): void } = {
    byCatalogId: async () => null, byGtins: async () => null, byIdentityKey: async () => null, byTitleKey: async () => null, remember() {},
  };
  return {
    nowMs: () => w.nowMs,
    async loadState() {
      w.stateLoads++;
      return structuredClone(w.state);
    },
    async saveState(s) {
      w.state = structuredClone(s);
      w.saves.push(structuredClone(s));
    },
    async loadNotFound() {
      return { ...w.notFound };
    },
    async saveNotFound(added) {
      w.notFound = { ...w.notFound, ...added };
    },
    async measuredPlusUsage() {
      return w.measured;
    },
    async makeClient({ maxCalls, beforeCall }) {
      let n = 0;
      const fetchImpl = (async (url: string) => {
        w.fetched.push(url.replace('https://api.mercadolibre.com', ''));
        n++;
        w.nowMs += w.tickPerCall;
        if (w.mode === '429' || (w.mode === '429-na-2a' && n >= 2)) return { status: 429, text: async () => '{}' } as unknown as Response;
        const u = new URL(url);
        let body: unknown = {};
        if (u.pathname === '/products/search') body = { paging: { total: 50, offset: 0, limit: 50 }, results: w.mode === 'candidato' && u.searchParams.get('offset') === '0' ? [goodPayload] : [] };
        else if (/\/items$/.test(u.pathname)) body = itemsOk;
        else body = goodPayload;
        return { status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
      }) as unknown as typeof fetch;
      return createMlClient({ token: 't', maxCalls, fetchImpl, beforeCall });
    },
    async buildLookup() {
      return lookup;
    },
    async applyPlans(plans): Promise<ApplyOutcome> {
      w.applied.push(plans);
      return { masters: plans.map((p) => `m-${p.catalogId}`), offers: plans.map((p) => `o-${p.catalogId}`), skipped: 0 };
    },
    async startRun(job) {
      const h = { counters: { queries: 0, checked: 0, offersCreated: 0, snapshotsWritten: 0, errors: 0 }, addError() {}, async finish(o?: unknown) { w.runs.push({ job, fin: o }); } };
      return h;
    },
  };
}

const base: SeedSliceOptions = { lojas: ['eletroeletronicos'], apply: false, runCap: 120, plusHourlyCap: 8000, plusDailyCap: 150_000 };

async function main() {
  // ---------------- puras ----------------
  check('parseLojas: vazio/undefined = nenhuma (desligada)', parseLojas(undefined).length === 0 && parseLojas('').length === 0 && parseLojas('  ,').length === 0);
  check('parseLojas: eletroeletronicos e apelido "eletronicos"', parseLojas('eletroeletronicos').join() === 'eletroeletronicos' && parseLojas('Eletronicos').join() === 'eletroeletronicos');
  check('parseLojas: varias, sem repetir; games e lixo ficam fora', parseLojas('esporte, livros,esporte,games,xyz').join() === 'esporte,livros');
  check('recuo de 429: 15, 30, 60, 120 e depois fica em 120', [1, 2, 3, 4, 5, 9].map(backoffMinutes).join() === '15,30,60,120,120,120');
  check('estado invalido recomeca do vazio', normalizeServerState({ lixo: 1 }).version === 1 && normalizeServerState(null).backoffStep === 0 && Object.keys(normalizeServerState('x').days).length === 0);
  const sv = settleState(emptyServerState(), { now: new Date(T0), calls: 30, rateLimited: false, cursors: emptyServerState().cursors, day: DAY });
  check('settleState cobra o dia e registra o uso de 24 h', sv.days[DAY] === 30 && usedInWindow(sv, 3_600_000, T0 + 1000) === 30 && sv.lockUntil === null && sv.blockedUntil === null);
  const s429 = settleState(sv, { now: new Date(T0), calls: 5, rateLimited: true, cursors: sv.cursors, day: DAY });
  check('settleState com 429: degrau 1, bloqueio de 15 min e dia acumulado', s429.backoffStep === 1 && Date.parse(s429.blockedUntil!) === T0 + 15 * 60_000 && s429.days[DAY] === 35);
  const s429b = settleState(s429, { now: new Date(T0 + 20 * 60_000), calls: 1, rateLimited: true, cursors: sv.cursors, day: DAY });
  check('segundo 429 seguido: 30 min', s429b.backoffStep === 2 && Date.parse(s429b.blockedUntil!) === T0 + 20 * 60_000 + 30 * 60_000);
  const sok = settleState(s429b, { now: new Date(T0 + 99 * 60_000), calls: 10, rateLimited: false, cursors: sv.cursors, day: DAY });
  check('execucao sem 429 zera o recuo', sok.backoffStep === 0 && sok.blockedUntil === null);
  const old = settleState({ ...sv, usage: [[T0 - 25 * 3_600_000, 99]] }, { now: new Date(T0), calls: 0, rateLimited: false, cursors: sv.cursors, day: DAY });
  check('uso com mais de 24 h sai do registro', old.usage.length === 0);
  const pr = pruneNotFoundMap({ a: new Date(T0 - 8 * 86_400_000).toISOString(), b: new Date(T0 - 86_400_000).toISOString(), c: new Date(T0).toISOString() }, new Date(T0), 7, 1);
  check('cache de 404: vencido sai e o teto de tamanho mantem o mais recente', Object.keys(pr).join() === 'c');
  const segs = segmentsForLojas(['eletroeletronicos']);
  check('a loja Eletronicos tem tipos (incluindo os novos) e so ela', segs.length >= 14 && segs.every((s) => s.vertical === 'eletroeletronicos'), segs.length);

  // ---------------- desligada por padrao ----------------
  {
    const w = mkWorld();
    const r = await runSeedSlice({ ...base, lojas: [] }, deps(w));
    check('desligada: sem lojas nao toca estado, banco nem API', r.skipped === 'desligada' && w.stateLoads === 0 && w.fetched.length === 0 && w.saves.length === 0 && w.runs.length === 0);
  }

  // ---------------- dry-run ----------------
  {
    const w = mkWorld({ mode: 'candidato' });
    const r = await runSeedSlice({ ...base, lojas: ['livros'] }, deps(w));
    check('dry-run: chama a API oficial (busca/items/detalhe)', w.fetched.length > 0 && w.fetched.some((u) => u.startsWith('/products/search')) && w.fetched.every((u) => u.startsWith('/products/')), w.fetched.slice(0, 3));
    check('dry-run: nao chama /sites/MLB/search nem scraping', w.fetched.every((u) => !u.includes('/sites/') && !u.includes('http')));
    check('dry-run: planeja o candidato mas NAO aplica', r.segments.some((s) => s.planned > 0) && w.applied.length === 0 && r.mastersCreated === 0 && r.offersCreated === 0);
    check('dry-run: NAO avanca o cursor', r.cursorAdvanced === false && Object.keys(w.state.cursors.segments).length === 0);
    check('dry-run: cobra o orcamento do dia e o uso (a cota do ML nao distingue)', r.apiCalls === w.fetched.length && w.state.days[DAY] === r.apiCalls && r.dayUsed === r.apiCalls);
    check('dry-run: respeita o teto de chamadas da fatia', r.apiCalls <= 120 && r.callCap === 120);
    check('dry-run: trava solta no fim e registro de execucao fechado', w.state.lockUntil === null && w.runs.length === 1 && w.runs[0].job === 'semear-vertical:livros');
    check('dry-run: 404/cache nao e gravado sem 404', Object.keys(w.notFound).length === 0);
  }

  // ---------------- apply ----------------
  {
    const w = mkWorld({ mode: 'candidato' });
    const r = await runSeedSlice({ ...base, apply: true, lojas: ['livros'] }, deps(w));
    check('apply: aplica os planos e conta masters/ofertas criados', w.applied.length >= 1 && r.mastersCreated >= 1 && r.offersCreated >= 1, r);
    check('apply: avanca o cursor dos tipos tocados', r.cursorAdvanced === true && Object.keys(w.state.cursors.segments).length === r.segments.length && r.segments.length >= 1);
    const fin = w.runs[0].fin as { meta: { mastersCreated: string[]; apiCalls: number } };
    check('apply: lista de reversao (ids criados) vai no meta da execucao', fin.meta.mastersCreated.length === r.mastersCreated && fin.meta.apiCalls === r.apiCalls);
  }

  // ---------------- cursor por tipo ----------------
  {
    const w = mkWorld({ mode: 'vazio' });
    const a = await runSeedSlice({ ...base, apply: true }, deps(w));
    const keys1 = Object.keys(w.state.cursors.segments);
    w.nowMs += 10 * 60_000;
    const b = await runSeedSlice({ ...base, apply: true }, deps(w));
    const keys2 = Object.keys(w.state.cursors.segments);
    check('cursor: a 1a fatia toca tipos e grava lastRunAt', keys1.length >= 1 && keys1.every((k) => w.state.cursors.segments[k].lastRunAt));
    check('cursor: a 2a fatia vai para tipos AINDA NAO semeados (prioridade por antiguidade)', keys2.length > keys1.length && b.segments.every((s) => !a.segments.some((x) => x.key === s.key)), { a: a.segments.map((s) => s.key), b: b.segments.map((s) => s.key) });
    check('cursor: cada tipo respeita o orcamento proprio (<= callsPerRun) e a soma o teto da fatia', a.segments.every((s) => s.calls <= 60) && a.apiCalls <= 120);
  }

  // ---------------- 429: para, recua e retoma ----------------
  {
    const w = mkWorld({ mode: '429' });
    const r = await runSeedSlice({ ...base, apply: true }, deps(w));
    check('429: para no PRIMEIRO (1 chamada, sem espera nem nova tentativa)', r.rateLimited === true && w.fetched.length === 1 && r.apiCalls === 1, w.fetched);
    check('429: grava recuo de 15 min e degrau 1', w.state.backoffStep === 1 && Date.parse(w.state.blockedUntil!) === T0 + 15 * 60_000 && r.blockedUntil === w.state.blockedUntil);
    check('429: o cursor do tipo NAO avanca (a janela se repete)', (w.state.cursors.segments[r.segments[0].key]?.termsFrom ?? 0) === 0);
    check('429: registro da execucao diz http_429', (w.runs[0].fin as { stoppedBecause: string }).stoppedBecause === 'http_429');

    w.mode = 'vazio';
    w.fetched = [];
    w.nowMs = T0 + 5 * 60_000;
    const r2 = await runSeedSlice({ ...base, apply: true }, deps(w));
    check('recuo: dentro dos 15 min nenhuma chamada e skipped recuo_429', r2.skipped === 'recuo_429' && w.fetched.length === 0 && r2.blockedUntil === w.state.blockedUntil);

    w.nowMs = T0 + 16 * 60_000;
    const r3 = await runSeedSlice({ ...base, apply: true }, deps(w));
    check('recuo: vencido, retoma a fila e zera o degrau', !r3.skipped && r3.apiCalls > 0 && w.state.backoffStep === 0 && w.state.blockedUntil === null);

    const w2 = mkWorld({ mode: '429-na-2a' });
    const rr = await runSeedSlice({ ...base, apply: true }, deps(w2));
    check('429 no meio: as chamadas feitas antes ficam cobradas e a fatia para', rr.rateLimited && w2.state.days[DAY] === rr.apiCalls && rr.apiCalls >= 2);
  }

  // ---------------- teto diario / freio / trava / tempo ----------------
  {
    const w = mkWorld();
    w.state.days[DAY] = DAILY_CALL_CAP;
    const r = await runSeedSlice(base, deps(w));
    check('teto diario esgotado: nao chama a API', r.skipped === 'teto_diario' && w.fetched.length === 0 && r.dayLeft === 0);

    const w2 = mkWorld();
    w2.state.days[DAY] = DAILY_CALL_CAP - 25;
    const r2 = await runSeedSlice(base, deps(w2));
    check('teto diario quase no fim: a fatia usa so o que resta (25)', r2.callCap === 25 && r2.apiCalls <= 25 && (w2.state.days[DAY] ?? 0) <= DAILY_CALL_CAP);

    const w3 = mkWorld({ measured: { h1: 8000, h24: 8000 } });
    const r3 = await runSeedSlice(base, deps(w3));
    check('freio Plus: reconfirmacao ja gastou a folga da hora => nao semeia', r3.skipped === 'freio_plus' && w3.fetched.length === 0);

    const w4 = mkWorld({ measured: { h1: 7900, h24: 9000 } });
    const r4 = await runSeedSlice(base, deps(w4));
    check('freio Plus: folga pequena limita o teto da fatia (metade da folga horaria)', r4.callCap === 50 && r4.quotaLimitedBy === 'hora' && r4.apiCalls <= 50, r4);

    const w5 = mkWorld();
    w5.state.usage = [[T0 - 10 * 60_000, 7990]];
    const r5 = await runSeedSlice(base, deps(w5));
    check('sem medicao: o freio usa o registro de uso do proprio estado', r5.skipped === 'freio_plus' || r5.callCap <= 5, r5);

    const w6 = mkWorld();
    w6.state.lockUntil = new Date(T0 + 30_000).toISOString();
    const r6 = await runSeedSlice(base, deps(w6));
    check('trava: execucao em andamento nao duplica', r6.skipped === 'em_andamento' && w6.fetched.length === 0);
    w6.state.lockUntil = new Date(T0 - 1000).toISOString();
    const r6b = await runSeedSlice(base, deps(w6));
    check('trava vencida nao bloqueia', !r6b.skipped);

    const w7 = mkWorld({ tickPerCall: 20_000 });
    const r7 = await runSeedSlice({ ...base, budgetMs: 48_000 }, deps(w7));
    check('orcamento de tempo: para limpo antes de estourar os 60 s (poucas chamadas, timedOut)', r7.timedOut === true && r7.apiCalls <= 4 && w7.state.lockUntil === null, r7.apiCalls);
  }

  // ---------------- fiacao: rota, cron e porteiro ----------------
  const route = fs.readFileSync('src/app/api/cron/semear-vertical/route.ts', 'utf8');
  check('rota protegida por CRON_SECRET (rejectUnlessCronAuthorized)', route.includes('rejectUnlessCronAuthorized'));
  check('rota: dry-run por padrao; apply so com apply=1', route.includes("q.get('apply') === '1'") && route.includes('!apply && override'));
  check('rota: maxDuration de 60 s', /maxDuration = 60/.test(route));
  const vj = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string; schedule: string }> };
  const cron = vj.crons.find((c) => c.path.startsWith('/api/cron/semear-vertical'));
  check('vercel.json: cron a cada 10 min, conservador', !!cron && cron.schedule === '7-57/10 * * * *');
  const server = fs.readFileSync('src/server/collector/vertical/seed-vertical.ts', 'utf8');
  check('servidor: apply exige SEMEADURA_TERMOS_APROVADOS=1 e o master nasce em review/general', server.includes("SEMEADURA_TERMOS_APROVADOS === '1'") && server.includes('reviewGateFor') && server.includes("'general'::product_type"));
  check('servidor: nao usa /sites/MLB/search nem scraping', !/sites\/MLB|puppeteer|cheerio|playwright/i.test(server) && !/sites\/MLB/.test(fs.readFileSync('src/lib/catalog/vertical/seed-slice.ts', 'utf8')));

  console.log(`${total - fails}/${total} verificacoes passaram`);
  if (fails > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
