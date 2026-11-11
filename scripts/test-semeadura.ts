/**
 * Testes unitarios da AMPLIACAO DA SEMEADURA (2026-11-10): orcamento diario, cache de 404, paginacao por offset,
 * geracao/deduplicacao de termos, nicho dos segmentos novos e o planejador com cliente ML falso. Sem banco, sem rede.
 * Uso: npx tsx scripts/test-semeadura.ts   (sai com codigo 1 se algo falhar)
 */
import {
  backfillFromHistory,
  charge,
  dayKeySP,
  DAILY_CALL_CAP,
  effectiveMaxCalls,
  emptyState,
  isKnownNotFound,
  markNotFound,
  NOT_FOUND_TTL_DAYS,
  pruneNotFound,
  remainingOn,
  stampToIso,
  usedOn,
} from '../src/lib/catalog/vertical/seed-budget';
import { combineTerms, dedupeTerms, estimateMasters, formatSummary, pagingDecision, searchPath, summarizeReports, termKey } from '../src/lib/catalog/vertical/seed-utils';
import { domainMatches, SEGMENTS, segmentByKey } from '../src/lib/catalog/vertical/config';
import { scopeIssue } from '../src/lib/catalog/vertical/scope';
import { createMlClient, DailyBudgetExceeded } from '../src/lib/catalog/vertical/ml-api';
import { planSeed, type ExistingLookup } from '../src/lib/catalog/vertical/seed-plan';
import { isValidGtin } from '../src/lib/catalog/vertical/identity';

let fails = 0;
let total = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`);
  }
}

const run = { runId: 'r1', startedAt: '2026-11-10T15:00:00.000Z', mode: 'dry-run' as const };

async function main() {
  // ---------------- orcamento diario ----------------
  check('teto diario autorizado = 480', DAILY_CALL_CAP === 480);
  check('dia de Sao Paulo, nao UTC (02:30Z do dia 10 ainda e dia 09)', dayKeySP(new Date('2026-11-10T02:30:00.000Z')) === '2026-11-09');
  check('dia de Sao Paulo (03:00Z ja e dia 10)', dayKeySP(new Date('2026-11-10T03:00:00.000Z')) === '2026-11-10');
  let st = emptyState();
  check('estado vazio: 0 usadas, 480 restam', usedOn(st, '2026-11-10') === 0 && remainingOn(st, '2026-11-10') === 480);
  for (let i = 0; i < 480; i++) {
    const n = charge(st, '2026-11-10', run, 1);
    if (!n) {
      check(`cobranca ${i + 1} deveria caber`, false);
      break;
    }
    st = n;
  }
  check('apos 480 cobrancas: 480 usadas, 0 restam', usedOn(st, '2026-11-10') === 480 && remainingOn(st, '2026-11-10') === 0);
  check('a 481a cobranca e RECUSADA (null) e nada muda', charge(st, '2026-11-10', run, 1) === null && usedOn(st, '2026-11-10') === 480);
  check('outro dia comeca zerado', remainingOn(st, '2026-11-11') === 480);
  check('cobranca imutavel (estado original intacto)', usedOn(emptyState(), '2026-11-10') === 0);
  const s1 = charge(emptyState(), '2026-11-10', run, 5)!;
  check('registro da execucao soma as chamadas', s1.days['2026-11-10'].runs.length === 1 && s1.days['2026-11-10'].runs[0].calls === 5);
  const s2 = charge(s1, '2026-11-10', run, 2)!;
  check('mesma execucao acumula numa linha so', s2.days['2026-11-10'].runs.length === 1 && s2.days['2026-11-10'].runs[0].calls === 7 && usedOn(s2, '2026-11-10') === 7);
  const s3 = charge(s2, '2026-11-10', { ...run, runId: 'r2' }, 3)!;
  check('execucao nova abre outra linha', s3.days['2026-11-10'].runs.length === 2 && usedOn(s3, '2026-11-10') === 10);
  check('cobrar n maior que o saldo recusa sem cobrar nada', charge(s3, '2026-11-10', run, 471) === null);
  check('cobrar exatamente o saldo cabe', usedOn(charge(s3, '2026-11-10', run, 470)!, '2026-11-10') === 480);
  check('effectiveMaxCalls limita ao saldo do dia', effectiveMaxCalls(s3, '2026-11-10', 1000) === 470);
  check('effectiveMaxCalls respeita o pedido menor', effectiveMaxCalls(s3, '2026-11-10', 40) === 40);
  check('effectiveMaxCalls com dia esgotado = 0', effectiveMaxCalls(st, '2026-11-10', 40) === 0);
  check('effectiveMaxCalls com cap reduzido', effectiveMaxCalls(emptyState(), '2026-11-10', 100, 60) === 60);

  // historico (execucoes anteriores ao arquivo de estado)
  check('stampToIso converte o carimbo do diretorio', stampToIso('2026-11-10T19-13-56-477Z') === '2026-11-10T19:13:56.477Z');
  check('stampToIso rejeita lixo', stampToIso('qualquer-coisa') === null);
  const bf = backfillFromHistory(emptyState(), [
    { stamp: '2026-11-10T19-13-56-477Z', calls: 39, apply: true },
    { stamp: '2026-11-10T19-16-04-163Z', calls: 40, apply: true },
    { stamp: '2026-11-10T19-18-26-056Z', calls: 11, apply: true },
    { stamp: '2026-11-09T02-06-41-176Z', calls: 39, apply: true }, // 23:06 de 08/11 em Sao Paulo
    { stamp: 'lixo', calls: 99, apply: false },
  ]);
  check('backfill soma o dia de hoje (90)', usedOn(bf, '2026-11-10') === 90, bf.days);
  check('backfill respeita o fuso (02:06Z cai no dia 08)', usedOn(bf, '2026-11-08') === 39 && usedOn(bf, '2026-11-09') === 0, bf.days);
  const bf2 = backfillFromHistory(s3, [{ stamp: '2026-11-10T19-13-56-477Z', calls: 39, apply: true }]);
  check('backfill NAO sobrescreve dia que ja tem registro', usedOn(bf2, '2026-11-10') === 10);

  // cache de 404
  const t0 = new Date('2026-11-10T12:00:00.000Z');
  let nf = markNotFound(emptyState(), 'MLB1', t0);
  check('404 recem-marcado e conhecido', isKnownNotFound(nf, 'MLB1', new Date('2026-11-10T13:00:00.000Z')));
  check('catalogo nunca visto nao e 404 conhecido', !isKnownNotFound(nf, 'MLB2', t0));
  check(`404 vence apos ${NOT_FOUND_TTL_DAYS} dias (tenta de novo)`, !isKnownNotFound(nf, 'MLB1', new Date(t0.getTime() + (NOT_FOUND_TTL_DAYS * 24 + 1) * 3600_000)));
  nf = markNotFound(nf, 'MLB2', new Date(t0.getTime() - 10 * 86_400_000));
  const pr = pruneNotFound(nf, t0);
  check('prune remove vencidos e mantem os vigentes', 'MLB1' in pr.notFound && !('MLB2' in pr.notFound));

  // ---------------- termos ----------------
  check('termKey ignora acento, caixa e pontuacao', termKey('  Mangá  Pokémon! ') === 'manga pokemon');
  check('dedupeTerms remove repetidos por acento/caixa e vazios, mantem a ordem', JSON.stringify(dedupeTerms(['Mangá', 'manga', ' ', 'rpg', 'RPG', 'fantasia'])) === JSON.stringify(['Mangá', 'rpg', 'fantasia']));
  const comb = combineTerms('ssd', ['nvme 1tb', 'sata'], ['kingston', 'wd']);
  check('combineTerms intercala por marca (1a marca de todos os modelos primeiro)', JSON.stringify(comb) === JSON.stringify(['ssd nvme 1tb kingston', 'ssd sata kingston', 'ssd nvme 1tb wd', 'ssd sata wd']), comb);
  check('combineTerms com modelo vazio gera "prefixo marca"', JSON.stringify(combineTerms('soundbar', [''], ['jbl'])) === JSON.stringify(['soundbar jbl']));
  check('combineTerms sem marcas gera so modelos', JSON.stringify(combineTerms('x', ['a', 'b'], [])) === JSON.stringify(['x a', 'x b']));
  check('combineTerms deduplica', combineTerms('x', ['a', 'a'], ['b']).length === 1);

  // todos os segmentos: termos e dominios coerentes
  const keys = new Set<string>();
  for (const seg of SEGMENTS) {
    check(`segmento ${seg.key}: chave unica`, !keys.has(seg.key));
    keys.add(seg.key);
    check(`segmento ${seg.key}: tem termos`, seg.terms.length >= 1);
    check(`segmento ${seg.key}: termos sem duplicata`, new Set(seg.terms.map(termKey)).size === seg.terms.length);
    check(`segmento ${seg.key}: nenhum termo vazio ou gigante`, seg.terms.every((t) => t.trim().length >= 3 && t.length <= 80));
    if (seg.searchDomain) check(`segmento ${seg.key}: searchDomain "${seg.searchDomain}" passa no proprio filtro de dominio`, domainMatches(seg, seg.searchDomain));
  }
  check('seedRank unicos', new Set(SEGMENTS.map((s) => s.seedRank)).size === SEGMENTS.length);
  const totalTerms = SEGMENTS.reduce((n, s) => n + s.terms.length, 0);
  check('lista ampla: mais de 250 termos no total', totalTerms > 250, totalTerms);
  check('livros: 60+ termos especificos (RPG, programacao, ficcao, manga, arte, guias)', segmentByKey('livros')!.terms.length >= 60);
  for (const k of ['teclado', 'mouse', 'headset-gamer', 'monitor', 'cadeira-gamer', 'memoria-ram', 'processador', 'fone-de-ouvido', 'caixa-de-som', 'robo-aspirador', 'cafeteira', 'esteira', 'bicicleta-ergometrica']) {
    check(`segmento novo existe: ${k}`, !!segmentByKey(k));
  }
  check('bola: mais de 1 termo (antes era 1)', segmentByKey('bola')!.terms.length > 8);
  check('tenis segue review_only', segmentByKey('tenis-de-corrida')!.profile.strategy === 'review_only');

  // ---------------- nicho dos segmentos novos ----------------
  check('cadeira de escritorio comum NAO e cadeira gamer', scopeIssue('cadeira-gamer', 'Cadeira De Escritório Presidente Giratória Preta')?.reason === 'fora_do_nicho');
  check('cadeira gamer entra', scopeIssue('cadeira-gamer', 'Cadeira Gamer Dt3 Elite Reclinável Preta') === null);
  check('capa de cadeira gamer e acessorio', scopeIssue('cadeira-gamer', 'Capa Para Cadeira Gamer Elastano')?.reason === 'acessorio_ou_peca');
  check('rodinhas de cadeira gamer sao peca', scopeIssue('cadeira-gamer', 'Rodinhas Para Cadeira Gamer Kit 5') !== null);
  check('teclado mecanico entra', scopeIssue('teclado', 'Teclado Mecânico Gamer Redragon Kumara K552 Rgb') === null);
  check('teclado de escritorio comum fica fora do nicho', scopeIssue('teclado', 'Teclado Usb Abnt2 Preto Padrão')?.reason === 'fora_do_nicho');
  check('keycaps sao acessorio de teclado', scopeIssue('teclado', 'Keycaps Pbt Teclado Mecânico 130 Teclas')?.reason === 'acessorio_ou_peca');
  check('mouse gamer entra', scopeIssue('mouse', 'Mouse Gamer Logitech G203 Rgb 8000 Dpi') === null);
  check('mousepad nao e mouse', scopeIssue('mouse', 'Mousepad Gamer Speed Grande Rgb')?.reason === 'acessorio_ou_peca');
  check('headset gamer entra', scopeIssue('headset-gamer', 'Headset Gamer Hyperx Cloud Stinger 2') === null);
  check('fone comum nao entra como headset gamer', scopeIssue('headset-gamer', 'Fone De Ouvido Bluetooth Sem Fio Jbl Tune 520bt')?.reason === 'fora_do_nicho');
  check('fone comum entra no segmento de fone', scopeIssue('fone-de-ouvido', 'Fone De Ouvido Bluetooth Sem Fio Jbl Tune 520bt') === null);
  check('headset gamer NAO entra no segmento de fone (tem o seu)', scopeIssue('fone-de-ouvido', 'Headset Gamer Hyperx Cloud Stinger 2')?.reason === 'fora_do_nicho');
  check('almofada de headset e acessorio', scopeIssue('headset-gamer', 'Almofada Espuma Para Headset Hyperx Cloud')?.reason === 'acessorio_ou_peca');
  check('robo aspirador entra', scopeIssue('robo-aspirador', 'Robô Aspirador Xiaomi Mop 2 Pro Wifi') === null);
  check('filtro de robo aspirador e acessorio', scopeIssue('robo-aspirador', 'Filtro Hepa Para Robô Aspirador Roborock')?.reason === 'acessorio_ou_peca');
  check('capsula nao e cafeteira', scopeIssue('cafeteira', 'Cápsulas De Café Nespresso Compatível Kit 50')?.reason === 'combo_pacote' || scopeIssue('cafeteira', 'Cápsulas De Café Nespresso Compatível Kit 50')?.reason === 'acessorio_ou_peca');
  check('esteira ergometrica entra', scopeIssue('esteira', 'Esteira Elétrica Dobrável Movement Lx 160') === null);
  check('correia de esteira e peca', scopeIssue('esteira', 'Correia Lona Para Esteira Ergométrica Movement')?.reason === 'acessorio_ou_peca');
  check('combo "A + B" continua pego nos novos segmentos', scopeIssue('mouse', 'Mouse Gamer Redragon Cobra + Mouse Gamer Havit')?.reason === 'combo_pacote');
  check('monitor com suporte no inicio e acessorio', scopeIssue('monitor', 'Suporte Articulado Para Monitor 17 a 32')?.reason === 'acessorio_ou_peca');
  check('monitor gamer entra', scopeIssue('monitor', 'Monitor Gamer Lg Ultragear 27 144hz Ips') === null);

  // ---------------- URL de busca e paginacao ----------------
  check('searchPath sem dominio', searchPath('livro rpg', 20, 40) === '/products/search?status=active&site_id=MLB&q=livro%20rpg&limit=20&offset=40');
  check('searchPath com dominio', searchPath('livro rpg', 50, 0, 'MLB-BOOKS').endsWith('&limit=50&offset=0&domain_id=MLB-BOOKS'));
  check('searchPath codifica acento e simbolos', searchPath('mangá & hq', 10, 0).includes('q=mang%C3%A1%20%26%20hq'));
  const pg = (o: Partial<Parameters<typeof pagingDecision>[0]>) => pagingDecision({ returned: 20, limit: 20, offset: 0, total: 1000, inDomain: 15, fresh: 10, ...o });
  check('pagina cheia e rendosa: segue', pg({}).next === true);
  check('pagina curta: fim dos resultados', JSON.stringify(pg({ returned: 7 })) === JSON.stringify({ next: false, reason: 'fim_dos_resultados' }));
  check('pagina vazia: fim', pg({ returned: 0 }).next === false);
  check('offset+retornados >= total: fim', JSON.stringify(pg({ offset: 980, total: 1000 })) === JSON.stringify({ next: false, reason: 'fim_dos_resultados' }));
  check('nada no dominio: ruido, para', JSON.stringify(pg({ inDomain: 0 })) === JSON.stringify({ next: false, reason: 'pagina_sem_dominio' }));
  check('nada novo: para', JSON.stringify(pg({ fresh: 0 })) === JSON.stringify({ next: false, reason: 'pagina_sem_novidade' }));
  check('total desconhecido (null) nao trava', pg({ total: null }).next === true);

  // ---------------- relatorio ----------------
  const rep = (segment: string, calls: number, plans: number, counts: Record<string, number>) => ({
    segment, vertical: 'tecnologia', termsSearched: 1, searchResults: 20, counts: { planejado_criar: plans, ...counts }, plans: new Array(plans).fill(0), reviews: [], callsSpent: calls, stoppedBecause: null,
  });
  const sm = summarizeReports([rep('a', 10, 2, { sem_vendedor_404: 5, sem_vendedor_404_cache: 3, dominio_fora_do_segmento: 1 }), rep('b', 10, 0, { sem_vendedor_404: 1 })], 2);
  check('resumo: chamadas somam', sm.calls === 20);
  check('resumo: planejados e criados', sm.planned === 2 && sm.created === 2);
  check('resumo: 404 separa gasto e evitado', sm.notFound.fresh === 6 && sm.notFound.cached === 3);
  check('resumo: descartados em ordem decrescente e sem "planejado_criar"', sm.discarded[0].reason === 'sem_vendedor_404' && !sm.discarded.some((d) => d.reason === 'planejado_criar'));
  check('resumo: rendimento = planejados/chamadas', Math.abs((sm.yieldPerCall ?? 0) - 0.1) < 1e-9);
  check('resumo: linhas de texto trazem os 404', formatSummary(sm, true).some((l) => l.includes('404 sem vendedor: 6')));
  check('resumo sem chamadas: rendimento null', summarizeReports([], 0).yieldPerCall === null);
  check('estimateMasters arredonda para baixo', estimateMasters(480, 0.2) === 96 && estimateMasters(10, 0.25) === 2 && estimateMasters(-5, 1) === 0);

  // ---------------- planSeed com cliente falso ----------------
  const ISBN_A = '9788575321553';
  const ISBN_B = '9786584852051';
  const ISBN_C = '9786587374024';
  const ISBN_D = '9788535914849';
  check('ISBNs de teste sao validos', [ISBN_A, ISBN_B, ISBN_C, ISBN_D].every(isValidGtin));
  const book = (id: string, isbn: string, name: string, domain = 'MLB-BOOKS') => ({ id, name, domain_id: domain, attributes: [{ id: 'GTIN', value_name: isbn }], pictures: [{ secure_url: `https://x/${id}.jpg` }] });
  const itemsOk = { paging: { total: 1, offset: 0, limit: 100 }, results: [{ item_id: 'MLBX1', seller_id: 1, condition: 'new', price: 50 }] };

  interface FakeCfg {
    pages: Record<string, unknown[]>; // chave: offset
    notFound?: Set<string>;
    totalByTerm?: number;
  }
  function fake(cfg: FakeCfg, maxCalls = 100, beforeCall?: () => void) {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url.replace('https://api.mercadolibre.com', ''));
      const u = new URL(url);
      let body: unknown = {};
      let status = 200;
      if (u.pathname === '/products/search') {
        const off = u.searchParams.get('offset') ?? '0';
        body = { paging: { total: cfg.totalByTerm ?? 1000, offset: Number(off), limit: Number(u.searchParams.get('limit')) }, results: cfg.pages[off] ?? [] };
      } else if (/\/items$/.test(u.pathname)) {
        const id = u.pathname.split('/')[2];
        if (cfg.notFound?.has(id)) {
          status = 404;
          body = { message: 'No winners found' };
        } else body = itemsOk;
      } else {
        const id = u.pathname.split('/')[2];
        const all = Object.values(cfg.pages).flat() as Array<{ id: string }>;
        body = all.find((x) => x.id === id) ?? {};
      }
      return { status, text: async () => JSON.stringify(body) } as unknown as Response;
    }) as unknown as typeof fetch;
    const client = createMlClient({ token: 't', maxCalls, fetchImpl, beforeCall });
    return { client, urls };
  }
  const lookupNone: ExistingLookup = { byCatalogId: async () => null, byGtins: async () => null, byIdentityKey: async () => null, byTitleKey: async () => null };
  const livros = segmentByKey('livros')!;
  const term1 = livros.terms.slice(0, 1);
  void term1;

  // (a) paginacao por offset: pages=3, limit=2; paginas 0 e 2 cheias com dominio, pagina de offset 4 curta
  {
    const { client, urls } = fake({
      pages: {
        '0': [book('MLB1', ISBN_A, 'Livro Rpg Alfa'), book('MLB2', ISBN_B, 'Livro Rpg Beta')],
        '2': [book('MLB3', ISBN_C, 'Livro Rpg Gama'), book('MLB4', ISBN_D, 'Livro Rpg Delta')],
        '4': [book('MLB5', '9788535914849', 'Livro Rpg Repetido')],
      },
    });
    const r = await planSeed(client, livros, lookupNone, { pageLimit: 2, pages: 3, termsLimit: 1, useSearchDomain: true });
    const searches = urls.filter((u) => u.startsWith('/products/search'));
    check('paginacao: pede offset 0, 2 e 4 (offset += limit)', searches.length === 3 && searches[1].includes('offset=2') && searches[2].includes('offset=4'), searches);
    check('paginacao: filtro de dominio vai na URL quando o segmento declara', searches.every((u) => u.includes('domain_id=MLB-BOOKS')));
    check('paginacao: pagina curta encerra o termo', Object.values(r.termStops)[0]?.startsWith('fim_dos_resultados'), r.termStops);
    check('paginacao: 3 buscas contadas', r.pagesFetched === 3 && r.termsSearched === 3);
    check('dedup na execucao: o ISBN repetido (MLB5 = ISBN_D) nao vira 2o master', r.plans.filter((p) => p.identity.key === `isbn:${ISBN_D}`).length === 1 && r.plans.length === 4, r.plans.map((p) => p.catalogId));
    check('dedup na execucao: o repetido foi contado como ja_planejado', (r.counts['ja_planejado_chave_identidade'] ?? 0) + (r.counts['ja_planejado_gtin'] ?? 0) === 1, r.counts);
    check('callsSpent confere com o cliente', r.callsSpent === client.used());
  }
  // (b) sem filtro de dominio quando desligado
  {
    const { client, urls } = fake({ pages: { '0': [book('MLB1', ISBN_A, 'Livro Rpg Alfa')] } });
    await planSeed(client, livros, lookupNone, { pageLimit: 5, pages: 1, termsLimit: 1, useSearchDomain: false });
    check('--sem-dominio: URL sem domain_id', !urls[0].includes('domain_id'));
  }
  // (c) pagina sem nenhum resultado no dominio para o termo (ruido): nao pede a proxima
  {
    const { client, urls } = fake({ pages: { '0': [book('MLB1', ISBN_A, 'Camiseta Rpg', 'MLB-SHIRTS'), book('MLB2', ISBN_B, 'Caneca Rpg', 'MLB-MUGS')], '2': [book('MLB3', ISBN_C, 'Livro Gama')] } });
    const r = await planSeed(client, livros, lookupNone, { pageLimit: 2, pages: 5, termsLimit: 1 });
    check('ruido: para na 1a pagina (pagina_sem_dominio) e nao gasta a 2a', urls.filter((u) => u.startsWith('/products/search')).length === 1 && Object.values(r.termStops)[0]?.startsWith('pagina_sem_dominio'), r.termStops);
  }
  // (d) cache de 404: nao chama /items de catalogo ja conhecido
  {
    const { client, urls } = fake({ pages: { '0': [book('MLB1', ISBN_A, 'Livro Rpg Alfa'), book('MLB2', ISBN_B, 'Livro Rpg Beta')] }, notFound: new Set(['MLB2']) });
    const learned: string[] = [];
    const r1 = await planSeed(client, livros, lookupNone, { pageLimit: 2, pages: 1, termsLimit: 1, onNotFound: (id) => learned.push(id) });
    check('404 novo e anotado via onNotFound e descartado', learned.join() === 'MLB2' && r1.counts['sem_vendedor_404'] === 1, { learned, c: r1.counts });
    const second = fake({ pages: { '0': [book('MLB1', ISBN_A, 'Livro Rpg Alfa'), book('MLB2', ISBN_B, 'Livro Rpg Beta')] }, notFound: new Set(['MLB2']) });
    const r2 = await planSeed(second.client, livros, lookupNone, { pageLimit: 2, pages: 1, termsLimit: 1, isKnownNotFound: (id) => learned.includes(id) });
    check('404 conhecido NAO gasta chamada de /items', !second.urls.some((u) => u.includes('/products/MLB2')) && r2.counts['sem_vendedor_404_cache'] === 1, second.urls);
    void urls;
  }
  // (e) teto diario: beforeCall lanca DailyBudgetExceeded -> relatorio parcial com motivo teto_diario (nada estoura)
  {
    let n = 0;
    const { client } = fake({ pages: { '0': [book('MLB1', ISBN_A, 'Livro Rpg Alfa'), book('MLB2', ISBN_B, 'Livro Rpg Beta')] } }, 100, () => {
      if (++n > 3) throw new DailyBudgetExceeded('teto diario');
    });
    const r = await planSeed(client, livros, lookupNone, { pageLimit: 2, pages: 2, termsLimit: 1 });
    check('teto diario: para com motivo teto_diario e mantem o que ja planejou', r.stoppedBecause === 'teto_diario' && client.used() === 3, { s: r.stoppedBecause, u: client.used() });
  }
  // (f) teto por execucao
  {
    const { client } = fake({ pages: { '0': [book('MLB1', ISBN_A, 'Livro Rpg Alfa'), book('MLB2', ISBN_B, 'Livro Rpg Beta')] } }, 2);
    const r = await planSeed(client, livros, lookupNone, { pageLimit: 2, pages: 1, termsLimit: 1 });
    check('teto por execucao: para com teto_de_chamadas', r.stoppedBecause === 'teto_de_chamadas' && client.used() <= 2, { s: r.stoppedBecause, u: client.used() });
  }
  // (g) interrupcao segura (Ctrl+C): shouldStop antes da busca -> 0 chamadas; durante -> para entre candidatos
  {
    const { client } = fake({ pages: { '0': [book('MLB1', ISBN_A, 'Livro Rpg Alfa')] } });
    const r = await planSeed(client, livros, lookupNone, { pageLimit: 2, pages: 1, termsLimit: 1, shouldStop: () => true });
    check('interrupcao antes de comecar: 0 chamadas e motivo "interrompido"', client.used() === 0 && r.stoppedBecause === 'interrompido');
    const f2 = fake({ pages: { '0': [book('MLB1', ISBN_A, 'Livro Rpg Alfa'), book('MLB2', ISBN_B, 'Livro Rpg Beta')] } });
    let after = 0;
    const r2 = await planSeed(f2.client, livros, lookupNone, { pageLimit: 2, pages: 1, termsLimit: 1, shouldStop: () => ++after > 1 });
    check('interrupcao no meio: relatorio parcial valido, para antes do 2o candidato', r2.stoppedBecause === 'interrompido' && r2.plans.length <= 1, { p: r2.plans.length });
  }
  // (h) duplicata com master existente continua evitando criacao (e sem gastar /items)
  {
    const { client, urls } = fake({ pages: { '0': [book('MLB1', ISBN_A, 'Livro Rpg Alfa')] } });
    const lk: ExistingLookup = { ...lookupNone, byGtins: async () => ({ id: 'm1', name: 'Livro Rpg Alfa' }) };
    const r = await planSeed(client, livros, lk, { pageLimit: 1, pages: 1, termsLimit: 1 });
    check('master ja existente por GTIN: nao planeja e nao chama /items', r.plans.length === 0 && !urls.some((u) => u.includes('/items')) && r.counts['ja_existe_gtin'] === 1, r.counts);
  }
  // (i) termsFrom continua a lista de onde parou
  {
    const { client, urls } = fake({ pages: { '0': [] } });
    await planSeed(client, livros, lookupNone, { pageLimit: 5, pages: 1, termsFrom: 3, termsLimit: 2 });
    const qs = urls.map((u) => decodeURIComponent(new URL('https://x' + u).searchParams.get('q') ?? ''));
    check('termsFrom/termsLimit pegam a janela certa da lista', qs[0] === livros.terms[3] && qs[1] === livros.terms[4] && qs.length === 2, qs);
  }
  // (j) plataforma 'unknown' nunca aparece: os planos de games nao passam por aqui e nenhum segmento usa o termo
  check("nenhum segmento menciona platform 'unknown'", SEGMENTS.every((s) => !JSON.stringify(s.terms).includes('unknown')));

  console.log(`${total} verificacoes; falhas: ${fails}`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
