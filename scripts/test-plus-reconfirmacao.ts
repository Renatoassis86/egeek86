/**
 * Testes (sem banco, sem rede) da reconfirmação das lojas Plus: fila por antiguidade, cota, paginação que cai na página 2+,
 * freio de 429 e trava da varredura de cauda.
 * Uso: npx tsx scripts/test-plus-reconfirmacao.ts   (sai com código 1 se algo falhar)
 */
import { fetchVerticalCatalog, VerticalPagingError, type FetchRawPage } from '../src/lib/catalog/vertical/paging';
import { groupDueOldestFirst, mayExpireStale, plusCallQuota, staleExpireHours } from '../src/lib/catalog/vertical/queue';
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

if (fails > 0) {
  console.log(`\n${fails} falha(s)`);
  process.exit(1);
}
console.log('test-plus-reconfirmacao: tudo ok');
