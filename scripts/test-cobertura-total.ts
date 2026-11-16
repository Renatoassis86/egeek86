/**
 * Testes da cobertura total (fase 1, 2026-11-16): registro de áreas, árvore/destaques do ML, agrupamento por segmento, flag desligada e a fonte
 * por candidatos do planejador (planSeed) com cliente falso. Sem banco, sem rede.  npx tsx --conditions=react-server scripts/test-cobertura-total.ts
 */
import { AREAS, areaDe, segmentosDaArea, validarAreas } from '../src/lib/catalog/cobertura/areas';
import { agruparPorSegmento, candidatosDeDestaques, CATEGORIA_FORA, coberturaDeDestaques, descobertaArvoreLigada, escolherCategorias, LIMITES_API_ML, parseCategoria, termosDeTendencias, type CategoriaML } from '../src/lib/catalog/cobertura/arvore-ml';
import { segmentByKey } from '../src/lib/catalog/vertical/config';
import { planSeed, type ExistingLookup } from '../src/lib/catalog/vertical/seed-plan';
import { createMlClient } from '../src/lib/catalog/vertical/ml-api';

let fails = 0, total = 0;
const check = (n: string, c: boolean, e?: unknown) => { total++; if (!c) { fails++; console.log(`FALHA: ${n}${e !== undefined ? ' => ' + JSON.stringify(e) : ''}`); } };

// ---- registro de áreas
check('registro de áreas válido', validarAreas().length === 0, validarAreas());
check('todas as 7 áreas', AREAS.length === 7 && ['games', 'eletrodomesticos', 'eletroeletronicos', 'tecnologia', 'esporte', 'livros', 'impressao3d'].every((d) => !!areaDe(d)));
check('Casa tem segmentos derivados da semeadura (aspirador, cadeirinha)', segmentosDaArea('eletrodomesticos').includes('aspirador-de-po') && segmentosDaArea('eletrodomesticos').includes('cadeirinha-auto'));
check('validação pega prioridade repetida e raiz inválida', validarAreas([{ ...AREAS[0] }, { ...AREAS[1], prioridade: AREAS[0].prioridade, fontes: { ml: { raizes: ['X1'], profundidade: 1, minAnuncios: 1, destaques: true, tendencias: false } } }]).length >= 2);
check('área nova entra só por configuração (sem fonte = erro)', validarAreas([{ departamento: 'livros', rotulo: 'x', prioridade: 99, coberturaMinima: 0.5, fontes: {} }]).some((e) => /sem nenhuma fonte/.test(e)));

// ---- árvore de categorias
const nodo = (id: string, name: string, total: number, kids: Array<[string, string, number]> = []) => ({ id, name, total_items_in_this_category: total, children_categories: kids.map(([i, n, t]) => ({ id: i, name: n, total_items_in_this_category: t })) });
const raiz = parseCategoria(nodo('MLB5726', 'Eletrodomésticos', 3_000_000, [['MLB1576', 'Refrigeração', 578029], ['MLB1899', 'Outros', 21269], ['MLB900', 'Peças e Acessórios', 90000], ['MLB901', 'Cuidado Pessoal', 500]]))!;
const refri = parseCategoria(nodo('MLB1576', 'Refrigeração', 578029, [['MLB1577', 'Geladeiras', 8913], ['MLB1578', 'Filtros de Água', 50000], ['MLB1579', 'Frigobar', 1200]]))!;
check('parseCategoria lê id, nome, total e filhos', raiz.id === 'MLB5726' && raiz.children.length === 4 && raiz.total === 3_000_000);
check('parseCategoria rejeita lixo', parseCategoria(null) === null && parseCategoria({ id: 'XYZ' }) === null && parseCategoria({ id: 'MLB1', children_categories: 'x' })!.children.length === 0);
const arvore = new Map<string, CategoriaML>([[raiz.id, raiz], [refri.id, refri]]);
const n1 = escolherCategorias(arvore, ['MLB5726'], { profundidade: 1, minAnuncios: 1000 });
check('nível 1: tira "Outros", "Peças e Acessórios" e cauda abaixo do mínimo', n1.length === 1 && n1[0].id === 'MLB1576', n1);
const n2 = escolherCategorias(arvore, ['MLB5726'], { profundidade: 2, minAnuncios: 1000 });
check('nível 2: desce em Refrigeração, tira "Filtros", ordena pela maior', n2.map((c) => c.id).join() === 'MLB1576,MLB1577,MLB1579', n2.map((c) => c.id));
check('caminho legível', n2[1].path === 'Eletrodomésticos > Refrigeração > Geladeiras', n2[1].path);
check('max limita', escolherCategorias(arvore, ['MLB5726'], { profundidade: 2, minAnuncios: 1000, max: 1 }).length === 1);
check('CATEGORIA_FORA pega peça/acessório/cabo e deixa geladeira', ['Peças para TV', 'Acessórios para Áudio', 'Cabos', 'Outros'].every((n) => CATEGORIA_FORA.test(n)) && !CATEGORIA_FORA.test('Geladeiras') && !CATEGORIA_FORA.test('Aspiradores'));

// ---- destaques e tendências
const dest = { content: [{ id: 'MLB50196682', position: 1, type: 'PRODUCT' }, { id: 'MLB6613364946', position: 9, type: 'ITEM' }, { id: 'MLB23487120', position: 3, type: 'PRODUCT' }, { id: 'lixo', position: 4, type: 'PRODUCT' }] };
check('destaques: só PRODUCT válido (ITEM livre e id inválido ficam fora)', candidatosDeDestaques(dest).map((c) => c.id).join() === 'MLB50196682,MLB23487120');
check('destaques: resposta inesperada vira lista vazia', candidatosDeDestaques(null).length === 0 && candidatosDeDestaques({ content: 'x' }).length === 0);
check('tendências: normaliza, tira o que o segmento já tem e repete', termosDeTendencias([{ keyword: 'Air Fryer Mondial' }, { keyword: 'air fryer mondial' }, { keyword: 'fritadeira oven' }, { keyword: 'tv' }], ['air fryer mondial']).join() === 'fritadeira oven');

// ---- agrupamento por segmento (domínio) e tipo sem semente
const ag = agruparPorSegmento('eletrodomesticos', [
  { id: 'MLB1', name: 'Geladeira X', domain_id: 'MLB-REFRIGERATORS' },
  { id: 'MLB2', name: 'Air Fryer Y', domain_id: 'MLB-AIR_FRYERS' },
  { id: 'MLB3', name: 'Panela de pressão elétrica', domain_id: 'MLB-ELECTRIC_PRESSURE_COOKERS_ZZ' },
]);
check('agrupa por segmento pelo domínio', ag.porSegmento.get('air-fryer')?.length === 1, Array.from(ag.porSegmento.keys()));
check('domínio sem segmento = tipo sem semente', ag.semSegmento.get('MLB-ELECTRIC_PRESSURE_COOKERS_ZZ')?.length === 1);

// ---- cobertura e alerta
const cobA = coberturaDeDestaques(['MLB1', 'MLB2', 'MLB3', 'MLB4', 'MLB4'], new Set(['MLB1']), new Set(['MLB2']), 0.6);
check('cobertura: únicos, 404 fora do denominador, alerta abaixo da meta', cobA.total === 4 && cobA.noBanco === 1 && cobA.semVendedorConhecido === 1 && cobA.faltam === 2 && Math.abs(cobA.cobertura - 1 / 3) < 1e-9 && cobA.alerta === true, cobA);
check('cobertura: tudo coberto não alerta; lista vazia não alerta', !coberturaDeDestaques(['MLB1'], new Set(['MLB1']), new Set(), 0.6).alerta && !coberturaDeDestaques([], new Set(), new Set(), 0.6).alerta);

// ---- flag desligada por padrão e limites medidos
check('flag DESCOBERTA_ARVORE_ML desligada por padrão', !descobertaArvoreLigada(undefined) && !descobertaArvoreLigada('') && !descobertaArvoreLigada('true') && descobertaArvoreLigada('1'));
check('limites medidos da API (offset 100, destaques 20)', LIMITES_API_ML.searchOffsetMax === 100 && LIMITES_API_ML.highlightsPorCategoria === 20);

// ---- planSeed com candidatos (fonte por árvore): cliente falso
const GELADEIRA_OK: any = { id: 'MLB77000001', name: 'Geladeira Brastemp Frost Free 385 Litros Duplex Inox BRM45', domain_id: 'MLB-REFRIGERATORS', status: 'active', attributes: [{ id: 'BRAND', value_name: 'Brastemp' }, { id: 'MODEL', value_name: 'BRM45' }, { id: 'ALPHANUMERIC_MODEL', value_name: 'BRM45HB' }, { id: 'VOLTAGE', value_name: '127V' }, { id: 'GTIN', value_name: '7891129999994' }] };
const GELADEIRA_404: any = { ...GELADEIRA_OK, id: 'MLB77000002', name: 'Geladeira Consul CRM50 Frost Free 410 Litros', attributes: [{ id: 'BRAND', value_name: 'Consul' }, { id: 'MODEL', value_name: 'CRM50' }, { id: 'ALPHANUMERIC_MODEL', value_name: 'CRM50HB' }, { id: 'VOLTAGE', value_name: '127V' }, { id: 'GTIN', value_name: '7891129999987' }] };
const JA_TEM: any = { ...GELADEIRA_OK, id: 'MLB77000003', name: 'Geladeira Electrolux IF55 Inverter 431 Litros', attributes: [{ id: 'BRAND', value_name: 'Electrolux' }, { id: 'MODEL', value_name: 'IF55' }, { id: 'ALPHANUMERIC_MODEL', value_name: 'IF55S' }, { id: 'VOLTAGE', value_name: '127V' }, { id: 'GTIN', value_name: '7891129999970' }] };
const chamadas: string[] = [];
const fakeFetch = (async (url: string) => {
  const ep = String(url).replace('https://api.mercadolibre.com', '');
  chamadas.push(ep);
  if (ep.startsWith('/products/MLB77000001/items')) return new Response(JSON.stringify({ paging: { total: 1, offset: 0, limit: 100 }, results: [{ item_id: 'MLB9001', price: 3299, original_price: null, currency_id: 'BRL', condition: 'new', seller_id: 11, shipping: { free_shipping: true } }] }), { status: 200 });
  if (ep.includes('/items')) return new Response(JSON.stringify({ message: 'No winners found', error: 'not_found' }), { status: 404 });
  return new Response('{}', { status: 500 });
}) as unknown as typeof fetch;
const lookup: ExistingLookup = {
  byCatalogId: async (id) => (id === 'MLB77000003' ? { id: 'm1', name: 'já existe' } : null),
  byGtins: async () => null,
  byIdentityKey: async () => null,
  byTitleKey: async () => null,
};
(async () => {
  const seg = segmentByKey('geladeira')!;
  const client = createMlClient({ token: 't', maxCalls: 20, fetchImpl: fakeFetch });
  const rep = await planSeed(client, seg, lookup, { candidates: [GELADEIRA_OK, GELADEIRA_404, JA_TEM], candidatesPrefetched: true, candidatesLabel: 'arvore:destaques' });
  check('candidatos: cria 1, barra o 404 e a duplicata', rep.plans.length === 1 && rep.plans[0].catalogId === 'MLB77000001' && rep.counts.sem_vendedor_404 === 1 && rep.counts.ja_existe_catalogo_ml === 1, { counts: rep.counts, plans: rep.plans.length });
  check('candidatos: o termo do plano é o rótulo da fonte', rep.plans[0]?.term === 'arvore:destaques');
  check('candidatos: NÃO faz busca por termo e NÃO pede o detalhe de novo (prefetched)', !chamadas.some((c) => c.startsWith('/products/search')) && !chamadas.some((c) => /^\/products\/MLB\d+$/.test(c)), chamadas);
  check('candidatos: 1 chamada /items por candidato novo (duplicata não gasta)', chamadas.length === 2, chamadas);
  // sem o modo candidatos o comportamento antigo (busca por termo) continua: a busca é pedida
  chamadas.length = 0;
  const c2 = createMlClient({ token: 't', maxCalls: 5, fetchImpl: (async (u: string) => { chamadas.push(String(u)); return new Response(JSON.stringify({ paging: { total: 0, offset: 0, limit: 10 }, results: [] }), { status: 200 }); }) as unknown as typeof fetch });
  await planSeed(c2, seg, lookup, { terms: ['geladeira frost free'], pageLimit: 10 });
  check('sem candidatos, a busca por termo segue igual', chamadas.length === 1 && chamadas[0].includes('/products/search'), chamadas);

  console.log(`${total - fails}/${total} verificações`);
  if (fails) process.exit(1);
})();
