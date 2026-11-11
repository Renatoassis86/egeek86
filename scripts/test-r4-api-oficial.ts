/**
 * Testes da R4 (confirmacao na API oficial do Mercado Livre para a fila de classificacao). Sem banco, sem rede.
 * Uso: npx tsx scripts/test-r4-api-oficial.ts
 *
 * FIXTURES: todas as respostas abaixo sao SIMULADAS no formato da API (campos reais de GET /items/{id} e /products/{id}/items). Os ids
 * (MLB9000000xxx), vendedores e valores sao ficticios de teste e NAO representam nenhum anuncio nem dado de producao.
 */
import {
  evidenceLines, extractMlEvidence, judgeEvidence, modelOptionValue, parseCapacityGb, storageOptionValue, type MlEvidence, type RawMlItem,
} from '../src/lib/identity-queue/api-evidence';
import { runApiOficial, type ApiItem, type ApiRunDeps, type FetchLike } from '../src/lib/identity-queue/api-run';
import { consoleCandidate, NAO_E_ESTE, NAO_SEI, type QueueOption } from '../src/lib/identity-queue/model';
import fs from 'node:fs';

let fails = 0, total = 0;
function check(name: string, cond: boolean, extra?: unknown) { total++; if (!cond) { fails++; console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } }
const NOW = new Date('2026-11-11T12:00:00Z');

// ---- FIXTURE: resposta simulada de GET /items/{id} (formato da API; valores de teste) ----
const attr = (id: string, value_name: string, extra: Record<string, unknown> = {}) => ({ id, name: id, value_name, ...extra });
const fxItem = (over: Record<string, unknown> = {}): RawMlItem => ({
  id: 'MLB9000000001', title: 'FIXTURE Console Xbox Series X', condition: 'new', status: 'active', price: 1234.5, listing_type_id: 'gold_special', sold_quantity: 7,
  available_quantity: 3, seller_id: 9000001, catalog_product_id: 'MLB9100001', variations: [],
  attributes: [attr('BRAND', 'Microsoft'), attr('MODEL', 'Series X'), attr('INTERNAL_MEMORY', '1 TB'), attr('ITEM_CONDITION', 'Novo'), attr('COLOR', 'Preto')],
  ...over,
}) as RawMlItem;

// Opcoes reais do modelo da fila (armazenamento do Xbox Series X, modelo do PS5), com master de destino por criar.
const xboxCand = consoleCandidate({ id: 'o1', title: 'Console Xbox Series X Microsoft', masterId: 'm1' }, [], { midia: 'disc' });
check('setup: candidato Xbox pede armazenamento', xboxCand?.axis === 'armazenamento', xboxCand?.axis);
const ps5Cand = consoleCandidate({ id: 'o2', title: 'Console PlayStation 5 Sony', masterId: 'm2' }, [], {});
check('setup: candidato PS5 pede modelo', ps5Cand?.axis === 'modelo', ps5Cand?.axis);
const J = (c: NonNullable<typeof xboxCand>) => ({ axis: c.axis, options: c.options, understood: c.understood });

// ---- extracao ----
const ev1 = extractMlEvidence(fxItem(), 'MLB9000000001', NOW);
check('extrai condicao/status/vendedor/catalogo', ev1.condition === 'new' && ev1.status === 'active' && ev1.sellerId === '9000001' && ev1.catalogProductId === 'MLB9100001' && ev1.listingType === 'gold_special' && ev1.soldQuantity === 7);
check('guarda so atributos da lista (COLOR descartado)', ev1.attrs.INTERNAL_MEMORY === '1 TB' && ev1.attrs.COLOR === undefined && ev1.attrs.BRAND === 'Microsoft');
check('value_struct vira numero+unidade', extractMlEvidence(fxItem({ attributes: [{ id: 'INTERNAL_MEMORY', value_name: null, value_struct: { number: 512, unit: 'GB' } }] }), 'x', NOW).attrs.INTERNAL_MEMORY === '512 GB');
check('variacoes contadas', extractMlEvidence(fxItem({ variations: [{}, {}] }), 'x', NOW).variations === 2);

// ---- parsers ----
check('capacidade 1 TB = 1000', parseCapacityGb('1 TB') === 1000 && parseCapacityGb('1TB') === 1000);
check('capacidade 825 GB', parseCapacityGb('825 GB') === 825);
check('capacidade texto sem numero = null', parseCapacityGb('Alta') === null);
check('opcao de armazenamento: 512/1000/2000, 825 nao', storageOptionValue(512) === '512gb' && storageOptionValue(1000) === '1000gb' && storageOptionValue(2000) === '2000gb' && storageOptionValue(825) === null);
check('modelo PS5 por CFI-7xxx = pro', modelOptionValue('ps5', { ALPHANUMERIC_MODEL: 'CFI-7021' }) === 'pro');
check('modelo PS5 por CFI-12xx = slim', modelOptionValue('ps5', { MODEL: 'CFI-1215A' }) === 'slim');
check('modelo PS5 por CFI-10xx = base', modelOptionValue('ps5', { MODEL: 'CFI-1015A' }) === 'base');
check('modelo PS5 contraditorio = null', modelOptionValue('ps5', { MODEL: 'CFI-7021', LINE: 'PS5 Slim' }) === null);
check('modelo Xbox Series S pelo nome', modelOptionValue('xbox_series', { MODEL: 'Xbox Series S' }) === 'series_s');
check('modelo Xbox S e X juntos = null', modelOptionValue('xbox_series', { MODEL: 'Series S / Series X' }) === null);

// ---- prova inequivoca ----
const v1 = judgeEvidence(J(xboxCand!), ev1);
check('1 TB prova armazenamento 1000gb', v1?.value === '1000gb', v1);
const ev825 = extractMlEvidence(fxItem({ attributes: [attr('INTERNAL_MEMORY', '825 GB')] }), 'x', NOW);
check('825 GB nao prova (nao e opcao)', judgeEvidence(J(xboxCand!), ev825) === null);
const evConflict = extractMlEvidence(fxItem({ attributes: [attr('INTERNAL_MEMORY', '1 TB'), attr('STORAGE_CAPACITY', '512 GB')] }), 'x', NOW);
check('capacidades que se contradizem nao provam', judgeEvidence(J(xboxCand!), evConflict) === null);
check('anuncio com variacoes nao prova', judgeEvidence(J(xboxCand!), extractMlEvidence(fxItem({ variations: [{}] }), 'x', NOW)) === null);
check('sem atributo nao prova', judgeEvidence(J(xboxCand!), extractMlEvidence(fxItem({ attributes: [] }), 'x', NOW)) === null);
check('fallback do catalogo (sem atributos) nao prova capacidade', judgeEvidence(J(xboxCand!), { ...ev1, via: 'products_items', attrs: {}, variations: undefined }) === null);
const evUsed = extractMlEvidence(fxItem({ condition: 'used', attributes: [attr('ITEM_CONDITION', 'Usado')] }), 'x', NOW);
const vUsed = judgeEvidence(J(xboxCand!), evUsed);
check('usado => Nao e este produto', vUsed?.value === NAO_E_ESTE.value, vUsed);
check('usado vale em qualquer eixo (identidade)', judgeEvidence({ axis: 'identidade', options: [{ value: 'sim', label: 'E este', kind: 'escolha' }, NAO_E_ESTE, NAO_SEI], understood: {} }, evUsed)?.value === 'nao_e_este');
check('usado pelo atributo (condicao nao especificada) => Nao e este', judgeEvidence(J(xboxCand!), extractMlEvidence(fxItem({ condition: 'not_specified', attributes: [attr('ITEM_CONDITION', 'Usado')] }), 'x', NOW))?.value === 'nao_e_este');
check('condicao nova x atributo Usado: contraditorio, nao prova', judgeEvidence(J(xboxCand!), extractMlEvidence(fxItem({ attributes: [attr('INTERNAL_MEMORY', '1 TB'), attr('ITEM_CONDITION', 'Usado')] }), 'x', NOW)) === null);
check('condicao usada x atributo Novo: contraditorio, nao prova', judgeEvidence(J(xboxCand!), extractMlEvidence(fxItem({ condition: 'used', attributes: [attr('ITEM_CONDITION', 'Novo')] }), 'x', NOW)) === null);
check('erro da API nunca prova', judgeEvidence(J(xboxCand!), { ...ev1, erro: 'api_negou_403' }) === null);
const evPro = extractMlEvidence(fxItem({ attributes: [attr('ALPHANUMERIC_MODEL', 'CFI-7021')] }), 'x', NOW);
check('PS5 CFI-7xxx novo => modelo pro', judgeEvidence({ ...J(ps5Cand!), understood: { familia: 'ps5' } }, evPro)?.value === 'pro');
const semDestino: QueueOption[] = [{ value: 'pro', label: 'PS5 Pro', kind: 'escolha', targetMasterId: null, create: null }, NAO_SEI, NAO_E_ESTE];
check('opcao sem master de destino nao e aplicada', judgeEvidence({ axis: 'modelo', options: semDestino, understood: { familia: 'ps5' } }, evPro) === null);
const midia = consoleCandidate({ id: 'o3', title: 'Console PlayStation 5 Slim Sony', masterId: 'm3' }, [], {});
check('eixo midia nunca e aplicado pela API', midia?.axis === 'midia' && judgeEvidence(J(midia), ev1) === null, midia?.axis);
check('eixo preco nunca e aplicado', judgeEvidence({ axis: 'preco', options: [{ value: 'preco_certo', label: 'ok', kind: 'escolha' }, NAO_E_ESTE], understood: {} }, ev1) === null);

// ---- texto do popup ----
const lines = evidenceLines({ ...ev1, veredito: { value: '1000gb', label: '1 TB', motivo: 'a API do ML informa capacidade 1 TB', aplicado: false } });
check('popup: "A API do Mercado Livre diz:" com condicao e memoria', lines[0].startsWith('A API do Mercado Livre diz:') && lines[0].includes('condição: novo') && lines[0].includes('memória interna: 1 TB'), lines);
check('popup: mostra a sugestao', lines.some((l) => l.startsWith('A API sugere: 1 TB')), lines);
check('popup: erro vira "sem dados"', evidenceLines({ ...ev1, erro: 'anúncio não encontrado' })[0].includes('sem dados'));
check('popup: nulo => vazio', evidenceLines(null).length === 0);

// ---- laco com fetch simulado ----
const mkItem = (n: number, cand = xboxCand!, ml = `MLB900000${String(n).padStart(4, '0')}`): ApiItem => ({ itemId: `i${n}`, offerId: `o${n}`, mlItemId: ml, catalogRef: 'MLB9100001', title: 'x', axis: cand.axis, options: cand.options, understood: cand.understood });
type Reply = { status: number; body?: unknown };
function mkFetch(handler: (url: string) => Reply) {
  const calls: string[] = [];
  const f: FetchLike = async (url) => { calls.push(url); const r = handler(url); return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body }; };
  return { f, calls };
}
function mkDeps(f: FetchLike) {
  const saved: Array<{ id: string; ev: MlEvidence }> = [];
  const applied: Array<{ id: string; value: string }> = [];
  const deps: ApiRunDeps = {
    fetchImpl: f, token: async () => 'FIXTURE-TOKEN', now: () => NOW,
    saveEvidence: async (it, ev) => { saved.push({ id: it.itemId, ev }); },
    applyVerdict: async (it, value) => { applied.push({ id: it.itemId, value }); return { ok: true }; },
  };
  return { deps, saved, applied };
}
const OK1TB: Reply = { status: 200, body: fxItem() };

(async () => {
  // dry-run: consulta, nao grava, nao aplica
  {
    const { f, calls } = mkFetch(() => OK1TB);
    const { deps, saved, applied } = mkDeps(f);
    const r = await runApiOficial([mkItem(1), mkItem(2)], deps, { apply: false, maxCalls: 10 });
    check('dry-run: consulta e acha prova', r.modo === 'dry-run' && r.consultados === 2 && r.comProva === 2 && r.linhas[0].veredito?.value === '1000gb', r);
    check('dry-run: nada gravado nem aplicado', saved.length === 0 && applied.length === 0 && r.aplicados === 0);
    check('url oficial do item com selecao de campos', calls[0].startsWith('https://api.mercadolibre.com/items/MLB9000000001?attributes=id,title,condition'), calls[0]);
  }
  // apply: grava evidencia e aplica quando ha prova
  {
    const { f } = mkFetch((u) => (u.includes('MLB9000000001') ? OK1TB : { status: 200, body: fxItem({ attributes: [attr('INTERNAL_MEMORY', '825 GB')] }) }));
    const { deps, saved, applied } = mkDeps(f);
    const r = await runApiOficial([mkItem(1), mkItem(2)], deps, { apply: true, maxCalls: 10 });
    check('apply: aplica so o que tem prova', applied.length === 1 && applied[0].id === 'i1' && applied[0].value === '1000gb' && r.aplicados === 1, applied);
    check('apply: grava evidencia dos dois (com e sem prova)', saved.length === 2 && saved[0].ev.veredito?.aplicado === true && saved[1].ev.veredito === null);
    check('apply: sem prova fica pendente (resultado sem_prova)', r.linhas[1].resultado === 'sem_prova');
  }
  // 429: para na hora, nao grava o item que levou 429
  {
    let n = 0;
    const { f, calls } = mkFetch(() => (++n === 2 ? { status: 429 } : OK1TB));
    const { deps, saved } = mkDeps(f);
    const r = await runApiOficial([mkItem(1), mkItem(2), mkItem(3)], deps, { apply: true, maxCalls: 10 });
    check('429: para no segundo item, sem tentar o terceiro', r.parou === '429' && calls.length === 2 && saved.length === 1, { parou: r.parou, calls: calls.length });
  }
  // limite de chamadas por execucao
  {
    const { f, calls } = mkFetch(() => OK1TB);
    const { deps } = mkDeps(f);
    const r = await runApiOficial([mkItem(1), mkItem(2), mkItem(3), mkItem(4)], deps, { apply: false, maxCalls: 2 });
    check('limite por execucao respeitado', calls.length === 2 && r.parou === 'limite_de_chamadas' && r.chamadas === 2);
  }
  // mesmo anuncio em dois eixos: 1 chamada so
  {
    const { f, calls } = mkFetch(() => OK1TB);
    const { deps } = mkDeps(f);
    const r = await runApiOficial([mkItem(1, xboxCand!, 'MLB9000000009'), mkItem(2, ps5Cand!, 'MLB9000000009')], deps, { apply: false, maxCalls: 10 });
    check('mesmo anuncio consultado uma vez', calls.length === 1 && r.consultados === 2);
  }
  // 403 com fallback do catalogo: condicao usada prova "nao e este"
  {
    const { f, calls } = mkFetch((u) => (u.includes('/items/') ? { status: 403 } : { status: 200, body: { results: [{ item_id: 'MLB9000000001', price: 999, condition: 'used', seller_id: 9000002 }] } }));
    const { deps, saved } = mkDeps(f);
    const r = await runApiOficial([mkItem(1)], deps, { apply: true, maxCalls: 10 });
    check('403: tenta o catalogo oficial e le a condicao', calls.length === 2 && calls[1].startsWith('https://api.mercadolibre.com/products/MLB9100001/items') && saved[0].ev.via === 'products_items', calls);
    check('403 + catalogo usado => nao e este', r.linhas[0].veredito?.value === 'nao_e_este' && r.aplicados === 1);
  }
  // 403 repetido: para
  {
    const { f } = mkFetch(() => ({ status: 403 }));
    const { deps, saved } = mkDeps(f);
    const r = await runApiOficial([1, 2, 3, 4, 5].map((n) => mkItem(n)), deps, { apply: true, maxCalls: 50 });
    check('403 repetido: para apos 3 e grava "sem dados"', r.parou === '403_repetido' && saved.length === 3 && saved.every((s) => s.ev.erro?.includes('403')), { parou: r.parou, saved: saved.length });
  }
  // 404: evidencia "nao encontrado", sem prova; 500: nada gravado
  {
    const { f } = mkFetch((u) => (u.includes('MLB9000000001') ? { status: 404 } : { status: 500 }));
    const { deps, saved, applied } = mkDeps(f);
    const r = await runApiOficial([mkItem(1), mkItem(2)], deps, { apply: true, maxCalls: 10 });
    check('404: grava sem dados e nao aplica', saved.length === 1 && saved[0].ev.erro != null && applied.length === 0);
    check('500: nao grava (tenta de novo depois) e conta erro', r.erros === 1 && r.linhas[1].resultado === 'erro_http_500');
  }
  // erro de rede (excecao do fetch)
  {
    const f: FetchLike = async () => { throw new Error('rede'); };
    const { deps, saved } = mkDeps(f);
    const r = await runApiOficial([mkItem(1)], deps, { apply: true, maxCalls: 10 });
    check('excecao de rede: nao quebra, nao grava', r.erros === 1 && saved.length === 0);
  }
  // prazo
  {
    const { f, calls } = mkFetch(() => OK1TB);
    const { deps } = mkDeps(f);
    const r = await runApiOficial([mkItem(1)], deps, { apply: false, maxCalls: 10, deadlineAt: NOW.getTime() - 1 });
    check('prazo vencido: nao consulta', r.parou === 'tempo' && calls.length === 0);
  }
  // token nunca vai para a evidencia
  {
    const { f } = mkFetch(() => OK1TB);
    const { deps, saved } = mkDeps(f);
    await runApiOficial([mkItem(1)], deps, { apply: true, maxCalls: 10 });
    check('token nao aparece na evidencia gravada', !JSON.stringify(saved).includes('FIXTURE-TOKEN'));
  }

  // ---- contratos de codigo (leitura de fonte) ----
  const read = (p: string) => fs.readFileSync(p, 'utf8');
  const route = read('src/app/api/cron/fila-api-oficial/route.ts');
  check('rota: Bearer CRON_SECRET (rejectUnlessCronAuthorized) antes de qualquer coisa', route.indexOf('rejectUnlessCronAuthorized(request)') > 0 && route.indexOf('rejectUnlessCronAuthorized(request)') < route.indexOf('runFilaApiOficial('));
  check('rota: dry-run por padrao (apply so com ?apply=1)', route.includes("q.get('apply') === '1'"));
  const vj = JSON.parse(read('vercel.json')) as { crons: Array<{ path: string; schedule: string }> };
  const cron = vj.crons.find((c) => c.path.startsWith('/api/cron/fila-api-oficial'));
  check('vercel.json: cron a cada 20 min', cron?.schedule === '8,28,48 * * * *', cron);
  const q = read('src/server/identity-queue/queue.ts');
  check('queue: decisao da API usa kind auto_regra (nunca regra por titulo)', q.includes("p.ruleSourceId || p.via ? 'auto_regra'"));
  const srv = read('src/server/identity-queue/api-oficial.ts');
  check('servidor: so rede mercado-livre, respeita 429/teto, sem scraping', srv.includes("n.slug = 'mercado-livre'") && srv.includes('em_cooldown_429') && srv.includes('teto_diario') && !/puppeteer|playwright|cheerio/i.test(srv));
  check('servidor: respeita desfazer do dono (exclui itens com decisao api_oficial anterior)', srv.includes("d.decided_via = 'api_oficial'"));
  check('servidor: registra em collector_runs', srv.includes('INSERT INTO collector_runs'));
  const mig = read('drizzle/migrations/0043_fila_evidencia_api.sql');
  check('migration 0043 aditiva (so ADD COLUMN/INDEX) e com rollback', !/DROP|DELETE|UPDATE/i.test(mig.replace(/--.*$/gm, '')) && fs.existsSync('drizzle/migrations/0043_fila_evidencia_api.rollback.sql'));

  console.log(fails ? `\n${fails} de ${total} FALHARAM` : `\nOK: ${total} verificacoes`);
  process.exit(fails ? 1 : 0);
})();
