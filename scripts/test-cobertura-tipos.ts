/**
 * Testes da COBERTURA POR TIPO das lojas Plus (pedido do dono, 2026-11-12): todo tipo esperado tem segmento (ou causa explicita da
 * ausencia), os tipos novos entram com orcamento proprio, a fila de semeadura distribui o tempo e nao ha teto artificial de masters.
 * Sem banco, sem rede. Uso: npx tsx scripts/test-cobertura-tipos.ts   (sai com codigo 1 se algo falhar)
 */
import { SEGMENTS, segmentByKey, segmentsOf, domainMatches, type NonGamesVertical } from '../src/lib/catalog/vertical/config';
import { MIN_TERMOS_COBERTO, TIPOS_ESPERADOS, existiaAntes, situacaoDepois } from '../src/lib/catalog/vertical/cobertura-tipos';
import { NOVOS_SEGMENTOS_TIPOS, PROBE_CALLS_PER_RUN } from '../src/lib/catalog/vertical/config-tipos';
import { hasScopeLexicon, scopeIssue } from '../src/lib/catalog/vertical/scope';
import { evaluateIdentity } from '../src/lib/catalog/vertical/identity';
import { createMlClient } from '../src/lib/catalog/vertical/ml-api';
import { planSeed, type ExistingLookup } from '../src/lib/catalog/vertical/seed-plan';
import { NOT_FOUND_TTL_DAYS } from '../src/lib/catalog/vertical/seed-budget';
import {
  advanceCursor, allocate, callsPerRunOf, cursorFor, DEFAULT_CALLS_PER_TYPE_RUN, emptyCursorState, estimateType, MAX_SEARCH_PAGES, nextWindow,
  priorityOrder, reconfirmCallsPerHour, SEARCH_PAGE_LIMIT, termsSignature,
} from '../src/lib/catalog/vertical/seed-schedule';

let fails = 0;
let total = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`);
  }
}

async function main() {
  const LOJAS: NonGamesVertical[] = ['livros', 'eletrodomesticos', 'eletroeletronicos', 'esporte', 'tecnologia', 'impressao3d'];

  // ---------------- mapa tipo x loja ----------------
  for (const t of TIPOS_ESPERADOS) {
    if (t.segmento) {
      const seg = segmentByKey(t.segmento);
      check(`tipo "${t.tipo}" aponta para segmento existente (${t.segmento})`, !!seg);
      check(`tipo "${t.tipo}" esta na loja do segmento`, !seg || seg.vertical === t.loja, { loja: t.loja, seg: seg?.vertical });
    } else {
      check(`tipo ausente "${t.tipo}" declara a causa`, !!t.causa && !!t.nota);
    }
  }
  const mapped = new Set(TIPOS_ESPERADOS.map((t) => t.segmento).filter(Boolean));
  check('todo segmento de semeadura aparece no mapa tipo x loja (nenhum tipo escondido)', SEGMENTS.every((s) => mapped.has(s.key)), SEGMENTS.filter((s) => !mapped.has(s.key)).map((s) => s.key));
  check('as 6 lojas Plus tem tipos mapeados', LOJAS.every((l) => TIPOS_ESPERADOS.some((t) => t.loja === l)));
  const has = (loja: NonGamesVertical, tipo: RegExp) => TIPOS_ESPERADOS.some((t) => t.loja === loja && t.segmento && tipo.test(t.tipo));

  // Exemplos citados pelo dono, por loja
  for (const r of [/smart tv/i, /soundbar/i, /home theater/i, /caixa de som/i, /fone/i, /projetor/i, /c.mera/i, /tv box/i]) check(`Eletronicos cobre ${r}`, has('eletroeletronicos', r));
  for (const r of [/geladeira/i, /fog/i, /lavar/i, /micro-ondas/i, /aspirador/i, /air fryer/i, /ar-condicionado/i, /ventilador/i]) check(`Casa cobre ${r}`, has('eletrodomesticos', r));
  for (const r of [/notebook/i, /monitor/i, /ssd/i, /placa de v/i, /teclado/i, /mouse/i, /roteador/i]) check(`Tecnologia cobre ${r}`, has('tecnologia', r));
  for (const r of [/t.nis \(/i, /bicicleta$/i, /esteira/i, /bola de futebol/i, /camisa/i, /halter/i]) check(`Esporte cobre ${r}`, has('esporte', r));
  for (const r of [/impressora 3d/i, /filamento/i, /resina/i, /pe.as/i]) check(`Impressao 3D cobre ${r}`, has('impressao3d', r));
  check('Livros cobre generos', has('livros', /g.nero/i));

  // Causas validas e ausencias que dependem de outro agente (porteiro) ou do dono
  check('scanner 3D e caneta 3D ausentes por causa do porteiro (nao por falta de semente)', TIPOS_ESPERADOS.filter((t) => /Scanner 3D|Caneta 3D/.test(t.tipo)).every((t) => t.causa === 'porteiro'));
  check('suplementos dependem de decisao do dono', TIPOS_ESPERADOS.find((t) => /Suplementos/.test(t.tipo))?.causa === 'decisao_dono');

  // situacao calculada da configuracao
  const sTv = TIPOS_ESPERADOS.find((t) => t.segmento === 'smart-tv')!;
  check('smart-tv: existia antes e esta coberto depois', existiaAntes(sTv) && situacaoDepois(sTv) === 'coberto');
  const sCel = TIPOS_ESPERADOS.find((t) => t.segmento === 'celular')!;
  check('celular: tipo novo, parcial (dominio a confirmar)', !existiaAntes(sCel) && situacaoDepois(sCel) === 'parcial');
  check('tipo sem segmento => ausente', situacaoDepois(TIPOS_ESPERADOS.find((t) => !t.segmento)!) === 'ausente');
  check('todo tipo novo e "parcial" ate o dominio ser conferido (nao finge cobertura)', NOVOS_SEGMENTOS_TIPOS.every((s) => situacaoDepois({ loja: s.vertical as NonGamesVertical, tipo: s.label, segmento: s.key }) === 'parcial'));

  // ---------------- tipos novos: integridade ----------------
  check(`ha tipos novos em todas as lojas que pediam (>= 50)`, NOVOS_SEGMENTOS_TIPOS.length >= 50, NOVOS_SEGMENTOS_TIPOS.length);
  const keys = SEGMENTS.map((s) => s.key);
  check('chaves de segmento unicas', new Set(keys).size === keys.length);
  const rankNovos = NOVOS_SEGMENTOS_TIPOS.map((s) => s.seedRank);
  check('seedRank dos tipos novos unico e depois dos antigos', new Set(rankNovos).size === rankNovos.length && Math.min(...rankNovos) > Math.max(...SEGMENTS.filter((s) => !NOVOS_SEGMENTOS_TIPOS.includes(s)).map((s) => s.seedRank)));
  for (const s of NOVOS_SEGMENTOS_TIPOS) {
    check(`${s.key}: dominio nao confirmado => sem searchDomain (busca sem filtro) e flag ligada`, s.domainUnconfirmed === true && !s.searchDomain);
    check(`${s.key}: orcamento proprio por execucao (${s.callsPerRun})`, s.callsPerRun === PROBE_CALLS_PER_RUN && callsPerRunOf(s) <= DEFAULT_CALLS_PER_TYPE_RUN);
    check(`${s.key}: >= ${MIN_TERMOS_COBERTO} consultas`, s.terms.length >= MIN_TERMOS_COBERTO, s.terms.length);
    check(`${s.key}: exige marca real`, s.requireBrand === true);
    check(`${s.key}: perfil de identidade sem cor (cor junta)`, !s.profile.keyExtras.includes('COLOR') && !s.profile.fallbackAttrs.includes('COLOR'));
    check(`${s.key}: nao e games`, s.vertical !== ('games' as string));
    check(`${s.key}: regex de dominio nao casa dominio de outro mundo (livros/jogos)`, !domainMatches(s, 'MLB-BOOKS') && !domainMatches(s, 'MLB-VIDEO_GAMES'));
    check(`${s.key}: tem lexico aparelho x acessorio`, hasScopeLexicon(s.key));
  }
  check('segmentos da loja Esporte passaram de 40', segmentsOf('esporte').length >= 40, segmentsOf('esporte').length);

  // Dominio nao confirmado: nenhum master nasce fora do dominio (o porteiro de identidade barra antes de qualquer chamada)
  const cel = segmentByKey('celular')!;
  const off = evaluateIdentity({ id: 'MLBX', name: 'Capinha Para Celular', domain_id: 'MLB-PHONE_CASES', attributes: [] }, cel);
  check('dominio fora do segmento => off_domain (nunca master)', off.status === 'off_domain', off);

  // Lexico dos tipos novos: aparelho passa; acessorio/peca/nicho errado vai para revisao
  const ok = (seg: string, t: string) => scopeIssue(seg, t) === null;
  const bad = (seg: string, t: string) => scopeIssue(seg, t) !== null;
  check('celular: aparelho passa', ok('celular', 'Smartphone Samsung Galaxy A16 128gb Preto'));
  check('celular: capinha/pelicula/celular de brinquedo vao para revisao', bad('celular', 'Capinha Para Samsung Galaxy A16') && bad('celular', 'Pelicula Para Celular Iphone') && bad('celular', 'Celular De Brinquedo Infantil'));
  check('tv-box: aparelho passa e controle remoto nao', ok('tv-box', 'Tv Box Xiaomi Mi Box S 4k Android') && bad('tv-box', 'Controle Remoto Para Tv Box'));
  check('roteador: aparelho passa e fresa CNC nao', ok('roteador', 'Roteador Tp-link Archer Ax23 Wifi 6') && bad('roteador', 'Roteador Cnc Tupia Fresa'));
  check('switch-rede: switch de rede passa e Nintendo Switch nao', ok('switch-rede', 'Switch Gigabit 8 Portas Tp-link Tl-sg108') && bad('switch-rede', 'Console Nintendo Switch Oled'));
  check('fonte-pc: fonte ATX passa e fonte de impressora/carregador nao', ok('fonte-pc', 'Fonte Atx 650w 80 Plus Bronze Gamer Corsair') && bad('fonte-pc', 'Fonte Carregador Notebook 19v'));
  check('cooler-pc: water cooler passa e pasta termica nao', ok('cooler-pc', 'Water Cooler 240mm Rgb Cpu Deepcool') && bad('cooler-pc', 'Pasta Termica Para Cooler Cpu'));
  check('bicicleta: bike passa e ergometrica/brinquedo/peca nao', ok('bicicleta', 'Bicicleta Aro 29 Caloi Mountain Bike 21 Marchas') && bad('bicicleta', 'Bicicleta Ergometrica Spinning') && bad('bicicleta', 'Pedal Para Bicicleta'));
  check('capacete-de-ciclismo: de bike passa e de moto nao', ok('capacete-de-ciclismo', 'Capacete Ciclismo Mtb Absolute Wild') && bad('capacete-de-ciclismo', 'Capacete De Moto Fechado'));
  check('barra-e-anilha: musculacao passa e barra de cereal nao', ok('barra-e-anilha', 'Barra Olimpica Musculacao 2,20m') && bad('barra-e-anilha', 'Barra De Cereal Integral'));
  check('banco-de-musculacao: supino passa e banqueta nao', ok('banco-de-musculacao', 'Banco De Supino Regulavel Musculacao Acte') && bad('banco-de-musculacao', 'Banco De Bar Banqueta Alta'));
  check('coifa: aparelho passa e filtro de coifa nao', ok('coifa', 'Coifa De Parede Inox 60cm Electrolux') && bad('coifa', 'Filtro Para Coifa Electrolux'));
  check('torradeira: aparelho passa e peca nao', ok('torradeira', 'Torradeira Eletrica Mondial 2 Fatias') && bad('torradeira', 'Resistencia Para Torradeira'));
  check('bebedouro: de agua passa e de animal nao', ok('bebedouro-purificador-agua', 'Bebedouro De Agua Ibbl Fr600 Branco') && bad('bebedouro-purificador-agua', 'Bebedouro Para Cachorro Automatico'));
  check('peca-impressora-3d: bico e hotend passam; capa e suporte nao', ok('peca-impressora-3d', 'Hotend Bambu Lab A1 Bico 0.4mm') && bad('peca-impressora-3d', 'Capa Para Impressora 3d'));
  check('secador-filamento: passa e porta-carretel nao', ok('secador-filamento', 'Secador De Filamento Sunlu Filadryer S2') && bad('secador-filamento', 'Suporte Para Carretel Filamento'));
  check('pendrive: aparelho passa e chaveiro nao', ok('pendrive', 'Pendrive Sandisk Ultra 128gb Usb 3.0') && bad('pendrive', 'Chaveiro Cordao Para Pendrive'));
  check('nobreak: aparelho passa e bateria avulsa nao', ok('nobreak', 'Nobreak Sms 1200va Bivolt') && bad('nobreak', 'Bateria Para Nobreak 12v 7ah'));

  // ---------------- orcamento proprio por tipo e fila ----------------
  const state = emptyCursorState();
  const order0 = priorityOrder(SEGMENTS, state);
  check('fila: sem historico segue o seedRank', order0.every((s, i) => i === 0 || order0[i - 1].seedRank <= s.seedRank));
  const alloc = allocate(SEGMENTS, state, 1000);
  check('fila: cada tipo ganha o seu orcamento (nenhum come o dos outros)', alloc.every((a) => a.calls <= callsPerRunOf(a.segment)) && alloc.reduce((n, a) => n + a.calls, 0) <= 1000);
  check('fila: o ultimo tipo recebe so o que sobra', alloc[alloc.length - 1].calls <= callsPerRunOf(alloc[alloc.length - 1].segment));
  check('fila: orcamento zero => nenhuma alocacao', allocate(SEGMENTS, state, 0).length === 0);

  const seg0 = segmentByKey('smart-tv')!;
  const c0 = cursorFor(state, seg0);
  const w0 = nextWindow(seg0, c0, 150);
  check('janela: 150 chamadas => ~6 termos a partir do inicio, offset 0', w0.terms.length === 6 && w0.indices[0] === 0 && w0.offset === 0 && w0.depth === 0, w0);
  const c1 = advanceCursor(seg0, c0, w0, { termsTouched: w0.terms, termStops: {}, planned: 3, calls: 140 }, new Date('2026-11-12T10:00:00Z'));
  check('cursor: avanca pelos termos tocados e contabiliza', c1.termsFrom === 6 && c1.totalCalls === 140 && c1.totalPlanned === 3 && c1.lastRunAt === '2026-11-12T10:00:00.000Z');
  const part = advanceCursor(seg0, c0, w0, { termsTouched: w0.terms.slice(0, 2), termStops: {}, planned: 0, calls: 30 }, new Date());
  check('cursor: orcamento acabou no 2o termo => retoma do 3o (nada pulado)', part.termsFrom === 2);
  const none = advanceCursor(seg0, c0, w0, { termsTouched: [], termStops: {}, planned: 0, calls: 0 }, new Date());
  check('cursor: nada pedido => a janela se repete', none.termsFrom === 0);
  const rl = advanceCursor(seg0, c0, w0, { termsTouched: w0.terms, termStops: {}, planned: 0, calls: 50, rateLimited: true }, new Date());
  check('cursor: 429 nao avanca (a janela se repete)', rl.termsFrom === 0 && rl.totalCalls === 50);
  const dead = advanceCursor(seg0, c0, w0, { termsTouched: w0.terms, termStops: { [w0.terms[1]]: 'fim_dos_resultados@pagina1', [w0.terms[2]]: 'pagina_sem_novidade@pagina1' }, planned: 0, calls: 10 }, new Date());
  check('cursor: termo esgotado entra em dead; "sem novidade" nao', dead.dead.includes(1) && !dead.dead.includes(2));

  // Passada completa => aprofunda a pagina (profundidade em largura) e depois recomeca
  let cur = cursorFor(emptyCursorState(), seg0);
  let guard = 0;
  while (cur.cycles === 0 && guard++ < 1000) {
    const w = nextWindow(seg0, cur, 150);
    cur = advanceCursor(seg0, cur, w, { termsTouched: w.terms, termStops: {}, planned: 0, calls: 1 }, new Date());
  }
  check('passada completa => profundidade 1 (offset 50), ciclo 1, cursor no inicio', cur.cycles === 1 && cur.depth === 1 && cur.termsFrom === 0, cur);
  check('profundidade 1 pede offset = 1 x pagina', nextWindow(seg0, cur, 150).offset === SEARCH_PAGE_LIMIT);
  let deep = cur;
  for (let i = 0; i < MAX_SEARCH_PAGES + 2; i++) {
    let g = 0;
    const startCycles = deep.cycles;
    while (deep.cycles === startCycles && g++ < 1000) {
      const w = nextWindow(seg0, deep, 150);
      deep = advanceCursor(seg0, deep, w, { termsTouched: w.terms, termStops: {}, planned: 0, calls: 1 }, new Date());
    }
  }
  check(`profundidade nunca passa de ${MAX_SEARCH_PAGES - 1} e recomeca do topo`, deep.depth < MAX_SEARCH_PAGES);
  check('lista de termos mudou => cursor recomeca (assinatura)', cursorFor({ version: 1, segments: { 'smart-tv': { ...cur, termsSig: 'x' } } }, seg0).termsFrom === 0 && termsSignature(['a']) !== termsSignature(['b']));

  // Prioridade por antiguidade
  const st2 = emptyCursorState();
  st2.segments['smart-tv'] = { ...cursorFor(st2, seg0), lastRunAt: '2026-11-12T10:00:00Z' };
  st2.segments['soundbar'] = { ...cursorFor(st2, segmentByKey('soundbar')!), lastRunAt: '2026-11-10T10:00:00Z' };
  const pr = priorityOrder([seg0, segmentByKey('soundbar')!, segmentByKey('celular')!], st2).map((s) => s.key);
  check('prioridade: nunca semeado primeiro, depois o mais antigo', pr.join() === 'celular,soundbar,smart-tv', pr);

  // ---------------- planSeed: orcamento do tipo e SEM teto de masters ----------------
  const isbn = (n: number) => {
    const p = `97865${String(10000 + n).padStart(7, '0')}`; // 12 digitos
    const nums = p.split('').map(Number).reverse();
    const sum = nums.reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
    return p + String((10 - (sum % 10)) % 10);
  };
  const N = 35;
  const books = Array.from({ length: N }, (_, i) => ({ id: `MLBB${i}`, name: `Livro Fantasia Volume ${i}`, domain_id: 'MLB-BOOKS', attributes: [{ id: 'GTIN', value_name: isbn(i) }], pictures: [] as unknown[] }));
  const itemsOk = { paging: { total: 1, offset: 0, limit: 100 }, results: [{ item_id: 'MLBX1', seller_id: 1, condition: 'new', price: 50 }] };
  function fake(maxCalls: number) {
    const fetchImpl = (async (url: string) => {
      const u = new URL(url);
      let body: unknown = {};
      if (u.pathname === '/products/search') body = { paging: { total: N, offset: 0, limit: 50 }, results: u.searchParams.get('offset') === '0' ? books : [] };
      else if (/\/items$/.test(u.pathname)) body = itemsOk;
      else body = books.find((b) => b.id === u.pathname.split('/')[2]) ?? {};
      return { status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
    }) as unknown as typeof fetch;
    return createMlClient({ token: 't', maxCalls, fetchImpl });
  }
  const noDup: ExistingLookup = { byCatalogId: async () => null, byGtins: async () => null, byIdentityKey: async () => null, byTitleKey: async () => null };
  const livros = segmentByKey('livros')!;
  const rep = await planSeed(fake(500), livros, noDup, { pageLimit: 50, termsLimit: 1, pages: 1 });
  check(`SEM teto de masters por padrao: ${N} catalogos validos => ${N} planejados (antes: parava em 20)`, rep.plans.length === N && rep.stoppedBecause === null, { plans: rep.plans.length, stop: rep.stoppedBecause });
  const rep2 = await planSeed(fake(500), livros, noDup, { pageLimit: 50, termsLimit: 1, pages: 1, maxCreate: 10 });
  check('maxCreate explicito ainda funciona (opcional)', rep2.plans.length === 10 && rep2.stoppedBecause === 'teto_de_criacao');
  const rep3 = await planSeed(fake(500), livros, noDup, { pageLimit: 50, termsLimit: 1, pages: 1, segmentCalls: 21 });
  check('orcamento proprio do tipo: para com orcamento_do_tipo sem estourar', rep3.stoppedBecause === 'orcamento_do_tipo' && rep3.callsSpent <= 21 && rep3.plans.length >= 1 && rep3.plans.length < N, { calls: rep3.callsSpent, plans: rep3.plans.length });
  check('termos tocados registrados (base do cursor)', rep3.termsTouched.length === 1 && rep3.termsTouched[0] === livros.terms[0]);
  const rep4 = await planSeed(fake(500), livros, noDup, { pageLimit: 50, terms: ['livro rpg', 'rpg tormenta'], pages: 1, segmentCalls: 3 });
  check('terms explicito vence termsFrom/termsLimit e respeita o orcamento', rep4.termsTouched[0] === 'livro rpg' && rep4.callsSpent <= 3);

  // ---------------- simulacao (formulas) ----------------
  const est = estimateType(segmentByKey('tenis')!, { pagesPerTerm: 3, uniqueFraction: 0.5, callsPerFreshResult: 0.3, mastersPerFreshResult: 0.06 });
  check('estimativa: busca = termos x paginas', est.searchCalls === Math.ceil(segmentByKey('tenis')!.terms.length * 3));
  check('estimativa: saturacao limita os masters e as chamadas de catalogo', (() => {
    const free = estimateType(segmentByKey('tenis')!, { pagesPerTerm: 3, uniqueFraction: 0.5, callsPerFreshResult: 0.3, mastersPerFreshResult: 0.06 });
    const cap = estimateType(segmentByKey('tenis')!, { pagesPerTerm: 3, uniqueFraction: 0.5, callsPerFreshResult: 0.3, mastersPerFreshResult: 0.06, poolPerType: 50 });
    return cap.masters === 50 && cap.masters < free.masters && cap.catalogCalls < free.catalogCalls && cap.searchCalls === free.searchCalls;
  })());
  check('reconfirmacao: 1000 catalogos a cada 15 min = 4400 chamadas/h', reconfirmCallsPerHour(1000, 15) === 4400);
  check('cache de 404 por 7 dias (a fila volta ao tipo em ciclos de dias)', NOT_FOUND_TTL_DAYS === 7);

  console.log(`${total - fails}/${total} verificacoes passaram`);
  if (fails > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
