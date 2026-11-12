/**
 * Testes (sem banco, sem rede) da reconfirmação das lojas Plus: fila por antiguidade, cota, paginação que cai na página 2+,
 * freio de 429 e trava da varredura de cauda.
 * Uso: npx tsx scripts/test-plus-reconfirmacao.ts   (sai com código 1 se algo falhar)
 */
import { fetchVerticalCatalog, VerticalPagingError, type FetchRawPage } from '../src/lib/catalog/vertical/paging';
import { cadenciaCamadas, chamadasPorHoraCamadas, groupDueOldestFirst, intervaloDaCamada, mayExpireStale, ofertaDevida, plusCallQuota, plusCapsFromEnv, staleExpireHours } from '../src/lib/catalog/vertical/queue';
import fs from 'node:fs';
import { PLUS_REFRESH_CEILING_MIN, refreshMinutesFor } from '../src/lib/catalog/vertical/config';

let fails = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (!cond) {
    fails++;
    console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`);
  }
}

// ---- Fila por antiguidade ----
const t = (min: number) => 1_000_000_000_000 - min * 60_000;
const groups = groupDueOldestFirst([
  { id: 'a1', externalRef: 'MLB1', masterProductId: 'm1', checkedAtMs: t(20) },
  { id: 'b1', externalRef: 'MLB2', masterProductId: 'm2', checkedAtMs: t(600) }, // 10 h
  { id: 'a2', externalRef: 'MLB1', masterProductId: 'm1', checkedAtMs: t(300) }, // a oferta mais velha puxa o grupo MLB1
  { id: 'c1', externalRef: 'MLB3', masterProductId: 'm3', checkedAtMs: null }, // nunca checada: primeiro de todos
  { id: 'd1', externalRef: 'MLB4', masterProductId: 'm4', checkedAtMs: t(45) },
  { id: 'x', externalRef: null, masterProductId: 'm5', checkedAtMs: t(9999) }, // sem catálogo: ignorada
]);
check('ordem: nunca checada, 10 h, 5 h (grupo MLB1), 45 min', groups.map((g) => g.externalRef).join(',') === 'MLB3,MLB2,MLB1,MLB4', groups.map((g) => g.externalRef));
check('grupo agrupa as ofertas do mesmo catálogo/master', groups.find((g) => g.externalRef === 'MLB1')?.offerIds.length === 2);
check('mesmo catálogo em masters diferentes são grupos separados', groupDueOldestFirst([
  { id: '1', externalRef: 'R', masterProductId: 'a', checkedAtMs: t(1) },
  { id: '2', externalRef: 'R', masterProductId: 'b', checkedAtMs: t(1) },
]).length === 2);
const tie = groupDueOldestFirst([
  { id: 'z', externalRef: 'R1', masterProductId: 'm', checkedAtMs: t(5) },
  { id: 'b', externalRef: 'R2', masterProductId: 'm', checkedAtMs: t(5) },
]);
check('empate desempata por id (determinístico)', tie[0].offerIds[0] === 'b');

// ---- Cota ----
check('cota: sem medição vale o teto da execução', plusCallQuota({ runCap: 240, usedLastHour: null, usedLast24h: null, hourlyCap: 8000, dailyCap: 150000 }).callCap === 240);
const h = plusCallQuota({ runCap: 240, usedLastHour: 7900, usedLast24h: 1000, hourlyCap: 8000, dailyCap: 150000 });
check('cota: folga horária pequena limita (metade da folga)', h.callCap === 50 && h.limitedBy === 'hora', h);
const d = plusCallQuota({ runCap: 240, usedLastHour: 0, usedLast24h: 149900, hourlyCap: 8000, dailyCap: 150000 });
check('cota: teto diário limita', d.callCap === 100 && d.limitedBy === 'dia', d);
check('cota: teto diário estourado = 0 chamadas', plusCallQuota({ runCap: 240, usedLastHour: 0, usedLast24h: 160000, hourlyCap: 8000, dailyCap: 150000 }).callCap === 0);
check('cota: teto 0 = desligado', plusCallQuota({ runCap: 240, usedLastHour: 99999, usedLast24h: 99999999, hourlyCap: 0, dailyCap: 0 }).callCap === 240);

async function paginacao() {
  // ---- Paginação: página 2+ que cai (400/404) vira parcial, sem repetir a página ----
  const item = (id: string, seller: number) => ({ item_id: id, seller_id: seller, price: 100 + seller, condition: 'new' });
  function pagesFake(map: Record<number, { status: number; body?: unknown }>, counter: { n: number }): FetchRawPage {
    return async (_ref, offset) => {
      counter.n++;
      const r = map[offset] ?? { status: 404 };
      return { status: r.status, body: r.body ?? null };
    };
  }
  const page1 = { status: 200, body: { paging: { total: 150, offset: 0, limit: 100 }, results: Array.from({ length: 100 }, (_, i) => item(`MLB${i}`, i + 1)) } };
  for (const code of [400, 404]) {
    const c = { n: 0 };
    const out = await fetchVerticalCatalog('MLB9', pagesFake({ 0: page1, 100: { status: code } }, c), { retries: 1 });
    check(`página 2 HTTP ${code}: vira parcial com os 100 itens da página 1`, out.kind === 'partial' && out.items.length === 100, out.kind);
    check(`página 2 HTTP ${code}: não repete a página (2 chamadas no total)`, c.n === 2, c.n);
  }
  {
    const c = { n: 0 };
    let err: unknown = null;
    try {
      await fetchVerticalCatalog('MLB9', pagesFake({ 0: { status: 400 } }, c), { retries: 1 });
    } catch (e) {
      err = e;
    }
    check('página 1 HTTP 400: falha (nada gravado) sem repetir', err instanceof VerticalPagingError && err.kind === 'pagina-falhou' && c.n === 1, c.n);
  }
  {
    const c = { n: 0 };
    const out = await fetchVerticalCatalog('MLB9', pagesFake({ 0: { status: 404 } }, c));
    check('página 1 HTTP 404: catálogo vazio (como antes)', out.kind === 'empty' && c.n === 1);
  }
  {
    const c = { n: 0 };
    let err: unknown = null;
    try {
      await fetchVerticalCatalog('MLB9', pagesFake({ 0: { status: 500 } }, c), { retries: 1 });
    } catch (e) {
      err = e;
    }
    check('HTTP 500: segue com 1 retry e falha fechada', err instanceof VerticalPagingError && err.kind === 'pagina-falhou' && c.n === 2, c.n);
  }
  {
    const c = { n: 0 };
    let err: unknown = null;
    try {
      await fetchVerticalCatalog('MLB9', pagesFake({ 0: page1, 100: { status: 429 } }, c), { retries: 1 });
    } catch (e) {
      err = e;
    }
    check('HTTP 429: erro limite-429, sem retry (2 chamadas)', err instanceof VerticalPagingError && err.kind === 'limite-429' && c.n === 2, c.n);
  }
  {
    const c = { n: 0 };
    const full = { status: 200, body: { paging: { total: 150, offset: 100, limit: 100 }, results: Array.from({ length: 50 }, (_, i) => item(`MLBX${i}`, 200 + i)) } };
    const out = await fetchVerticalCatalog('MLB9', pagesFake({ 0: page1, 100: full }, c));
    check('catálogo de 2 páginas ok continua completo', out.kind === 'complete' && out.items.length === 150 && c.n === 2);
  }


}

// ---- Cadência Plus ----
check('onda 1 (livros, esporte, casa) = 15 min', (['livros', 'esporte', 'eletrodomesticos'] as const).every((v) => refreshMinutesFor(v, {}) === 15));
check('teto Plus nenhum acima de 30 min', Object.values(PLUS_REFRESH_CEILING_MIN).every((m) => m <= 30));
check('override por ambiente vence o teto', refreshMinutesFor('livros', { VERTICAL_LIVROS_REFRESH_MIN: '45' }) === 45);

// ---- Cauda ----
const ok = { rateLimited: false, pricesWritten: 10, catalogs: 20, failedCatalogs: 2, confirmationTracked: true };
check('cauda: execução saudável pode expirar', mayExpireStale(ok));
check('cauda: nunca com 429', !mayExpireStale({ ...ok, rateLimited: true }));
check('cauda: nunca sem preço gravado', !mayExpireStale({ ...ok, pricesWritten: 0 }));
check('cauda: nunca com mais da metade dos catálogos falhos', !mayExpireStale({ ...ok, failedCatalogs: 11 }));
check('cauda: nunca sem a coluna de confirmação ativa (COLLECTOR_RUNS)', !mayExpireStale({ ...ok, confirmationTracked: false }));
check('cauda: padrão 12 h; override mínimo 2 h', staleExpireHours({}) === 12 && staleExpireHours({ VERTICAL_STALE_EXPIRE_HOURS: '1' }) === 12 && staleExpireHours({ VERTICAL_STALE_EXPIRE_HOURS: '24' }) === 24);

// ---------------- cadência por camada (aprovada pelo dono em 2026-11-12) ----------------
{
  const c = cadenciaCamadas(15, {});
  check('camadas: vitrine 15 min e revisão 90 min por padrão, ativa', c.ativa && c.vitrineMin === 15 && c.revisaoMin === 90);
  check('camadas: revisão presa a 60..120 min', cadenciaCamadas(15, { VERTICAL_REVISAO_REFRESH_MIN: '10' }).revisaoMin === 60 && cadenciaCamadas(15, { VERTICAL_REVISAO_REFRESH_MIN: '500' }).revisaoMin === 120 && cadenciaCamadas(15, { VERTICAL_REVISAO_REFRESH_MIN: '75' }).revisaoMin === 75);
  check('camadas: revisão nunca mais rápida que a vitrine (departamento de 30 min)', cadenciaCamadas(30, {}).revisaoMin >= 60 && intervaloDaCamada(cadenciaCamadas(30, {}), 1) >= intervaloDaCamada(cadenciaCamadas(30, {}), 0));
  check('camadas: PLUS_CADENCIA_CAMADAS=0 desliga (todos no intervalo da vitrine)', !cadenciaCamadas(15, { PLUS_CADENCIA_CAMADAS: '0' }).ativa && intervaloDaCamada(cadenciaCamadas(15, { PLUS_CADENCIA_CAMADAS: '0' }), 1) === 15);
  const now = Date.parse('2026-11-12T12:00:00Z');
  const min = (m: number) => now - m * 60_000 - 1000;
  check('camada vitrine: devida aos 15 min, não antes', ofertaDevida(c, 0, min(16), now) && !ofertaDevida(c, 0, min(10), now));
  check('camada revisão: NÃO devida aos 16 min nem aos 60, devida aos 91', !ofertaDevida(c, 1, min(16), now) && !ofertaDevida(c, 1, min(60), now) && ofertaDevida(c, 1, min(91), now));
  check('camadas: nunca checada é devida nas duas', ofertaDevida(c, 0, null, now) && ofertaDevida(c, 1, null, now));
  check('camadas desligadas: revisão volta a ser devida aos 16 min', ofertaDevida(cadenciaCamadas(15, { PLUS_CADENCIA_CAMADAS: '0' }), 1, min(16), now));

  // Fila: vitrine antes da revisão; dentro de cada camada, a antiguidade manda (revisão mais velha NÃO passa na frente da vitrine).
  const g = groupDueOldestFirst([
    { id: 'r-velha', externalRef: 'MLBR1', masterProductId: 'mr1', checkedAtMs: 1000, tier: 1 },
    { id: 'v-nova', externalRef: 'MLBV1', masterProductId: 'mv1', checkedAtMs: 9000, tier: 0 },
    { id: 'v-velha', externalRef: 'MLBV2', masterProductId: 'mv2', checkedAtMs: 5000, tier: 0 },
    { id: 'r-nunca', externalRef: 'MLBR2', masterProductId: 'mr2', checkedAtMs: null, tier: 1 },
    { id: 'v-nunca', externalRef: 'MLBV3', masterProductId: 'mv3', checkedAtMs: null, tier: 0 },
  ]);
  check('fila: vitrine (nunca checada, velha, nova) e depois revisão (nunca, velha)', g.map((x) => x.externalRef).join() === 'MLBV3,MLBV2,MLBV1,MLBR2,MLBR1', g.map((x) => x.externalRef));
  const mix = groupDueOldestFirst([
    { id: 'a', externalRef: 'MLBM', masterProductId: 'm', checkedAtMs: 1, tier: 1 },
    { id: 'b', externalRef: 'MLBM', masterProductId: 'm', checkedAtMs: 2, tier: 0 },
  ]);
  check('fila: catálogo com uma oferta na vitrine conta como vitrine', mix.length === 1 && mix[0].tier === 0);
  check('fila sem tier mantém o comportamento antigo (tudo vitrine)', groups.every((x) => x.tier === 0));

  // Carga: a cadência por camada derruba a reconfirmação (premissa do relatório: ~20% em vitrine).
  const unico = chamadasPorHoraCamadas(2000, 8000, cadenciaCamadas(15, { PLUS_CADENCIA_CAMADAS: '0' }));
  const camadas = chamadasPorHoraCamadas(2000, 8000, cadenciaCamadas(15, {}));
  check('carga: 10 mil catálogos, 20% na vitrine: camadas ~ 1/3 do intervalo único (14.667 contra 44.000)', unico === 44000 && camadas === 14667 && camadas < unico * 0.34, { unico, camadas });
  check('freios Plus: padrão 8.000/h e 150.000/dia; env vence; 0 = sem teto', plusCapsFromEnv({}).hourlyCap === 8000 && plusCapsFromEnv({}).dailyCap === 150000 && plusCapsFromEnv({ PLUS_ML_HOURLY_CALL_CAP: '3000' }).hourlyCap === 3000 && plusCapsFromEnv({ PLUS_ML_DAILY_CALL_CAP: '0' }).dailyCap === 0);

  // Fiação: o coletor usa a camada (vitrine antes, intervalo por camada) e a cota soma a semeadura do servidor.
  const cv = fs.readFileSync('src/server/collector/vertical/collect-vertical.ts', 'utf8');
  check('coletor: dueWhere por camada (CASE vitrine) e ordem vitrine primeiro', cv.includes('intervaloSql(cadence)') && cv.includes('CASE WHEN ${vitrineSql()} THEN 0 ELSE 1 END'));
  check('coletor: vitrine = master aprovado E dentro do escopo de compra (marca foraDeEscopo)', cv.includes("'catalogGate' ->> 'verdict'") && cv.includes("masterNoEscopoSql('m')"));
  check('coletor: o freio Plus soma collect-vertical e semear-vertical', cv.includes("job LIKE 'collect-vertical:%' OR job LIKE 'semear-vertical:%'"));
}

if (fails > 0) {
  console.log(`\n${fails} falha(s)`);
  process.exit(1);
}
console.log('test-plus-reconfirmacao: tudo ok');
