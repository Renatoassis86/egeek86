/**
 * Guia das impressoras 3D e 3 secoes da loja (dono, 2026-11-15, #63/#111). Funcoes puras, sem banco e sem rede.
 * Uso: npx tsx scripts/test-guia-3d.ts (sai com codigo 1 se algo falhar).
 */
import { modeloGuia3d, posicaoPrioridade3d, ordenarPorPrioridade3d, priorizarImpressao3d, MODELOS_GUIA_3D } from '../src/lib/messaging/prioridade-3d';
import { montarGuia3d, secoes3dLigada, variacaoSobreRegistrado, type LinhaGuia3d } from '../src/lib/catalog/guia-3d';
import { SECOES_3D, rotuloTipo, tipoPertenceAoFiltro, classificarTipo } from '../src/lib/catalog/tipos-produto';
import { applyLimits, evaluateProductV2, type Candidate, type OfferFact, type ProductFacts } from '../src/lib/messaging/group-rules';

let fails = 0;
let total = 0;
function ok(c: boolean, n: string, x?: unknown) { total++; if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }

const P2SC = 'Impressora 3D Bambu Lab P2S Combo de FDM Automática,';
const P1SC = 'Impressora 3d Bambu Lab P1s Combo';
const A1C = 'Impressora 3d - Bambu Lab A1 Combo';
const A1MC = 'Impressora 3d Bambu Lab A1 Mini Combo - A1MC';
const P2S = 'Impressora 3D Bambu Lab P2s';
const P1S = 'Impressora 3d Bambu Lab Fechada P1s';
const A1 = 'Impressora 3d Bambu Lab A1';
const A1M = 'Impressora 3d Bambu Lab A1 Mini';
const KOBRA = 'Impressora 3d Anycubic Kobra X Multicor';

// Identidade dos 8 modelos
const esperado: [string, string][] = [[P2SC, 'p2s-combo'], [P1SC, 'p1s-combo'], [A1C, 'a1-combo'], [A1MC, 'a1-mini-combo'], [P2S, 'p2s'], [P1S, 'p1s'], [A1, 'a1'], [A1M, 'a1-mini'], ['Impressora 3D Bambu Lab A1, Bivolt', 'a1']];
for (const [n, slug] of esperado) ok(modeloGuia3d(n)?.slug === slug, `modelo ${n}`, modeloGuia3d(n)?.slug);
ok(modeloGuia3d('Impressora 3D Bambu Lab A2l') === null, 'A2L não é um dos 8');
ok(modeloGuia3d('Impressora 3d Bambu Lab X2d') === null, 'X2D não é um dos 8');
ok(modeloGuia3d('Impressora 3d Fdm Fechada H2d Combo Ams Bambu Lab') === null, 'H2D Combo não é um dos 8');
ok(modeloGuia3d('Filamento PLA Bambu Lab P1S 1kg') === null, 'filamento não é modelo');
ok(modeloGuia3d(KOBRA) === null, 'Kobra não é um dos 8');
ok(MODELOS_GUIA_3D.map((m) => m.slug).join() === 'p2s-combo,p1s-combo,a1-combo,a1-mini-combo,p2s,p1s,a1,a1-mini', 'ordem fixa dos 8 modelos');

// Posição: combo primeiro, depois sem combo, Kobra por último; flag off desliga
const pos = (n: string) => posicaoPrioridade3d('impressao3d', n, 'impressora-3d', {});
const seq = [P2SC, P1SC, A1C, A1MC, P2S, P1S, A1, A1M, 'Impressora 3d Bambu Lab X2d', KOBRA].map(pos);
ok(seq.every((p, i) => i === 0 || p > seq[i - 1]), 'posições estritamente crescentes na ordem do dono', seq);
ok(pos('Impressora 3D Creality Ender 3 V3') === 1000, 'outra marca fora da prioridade');
ok(posicaoPrioridade3d('impressao3d', P2SC, 'impressora-3d', { GROUP_PRIORIDADE_3D: 'off' }) === 1000, 'GROUP_PRIORIDADE_3D=off desliga');
ok(posicaoPrioridade3d('games', P2SC, null, {}) === 1000, 'fora da vertical não entra');

// Cobertura: ordena estável, P2S Combo primeiro; flag off mantém a ordem recebida
const masters = [KOBRA, A1M, 'Filamento PLA 1kg', P1S, A1C, P2SC, P1SC, A1MC, P2S, A1].map((name) => ({ name }));
ok(ordenarPorPrioridade3d('impressao3d', masters, {}).slice(0, 9).map((m) => m.name).join('|') === [P2SC, P1SC, A1C, A1MC, P2S, P1S, A1, A1M, KOBRA].join('|'), 'cobertura abre com P2S Combo e termina com Kobra');
ok(ordenarPorPrioridade3d('impressao3d', masters, {})[9].name === 'Filamento PLA 1kg', 'não prioridade fica por último');
ok(ordenarPorPrioridade3d('impressao3d', masters, { GROUP_PRIORIDADE_3D: 'off' }).map((m) => m.name).join() === masters.map((m) => m.name).join(), 'flag off: ordem recebida');
ok(ordenarPorPrioridade3d('games', masters, {})[0].name === KOBRA, 'outras verticais intactas');

// Front (destaque da home): a mais barata não passa o combo
const lista = [{ name: A1M, min_cents: 190000 }, { name: P2SC, min_cents: 833000 }, { name: KOBRA, min_cents: 339000 }, { name: P1S, min_cents: 469900 }, { name: P1SC, min_cents: 599900 }];
const dest = priorizarImpressao3d('impressao3d', lista, 5, (_v, l, n) => l.slice(0, n));
ok(dest.map((x) => x.name).join('|') === [P2SC, P1SC, P1S, A1M, KOBRA].join('|'), 'destaque na ordem do dono', dest.map((x) => x.name));

// Guia: menor preço entre as redes, sem inventar
const L = (nome: string, rede: LinhaGuia3d['rede'], cents: number, id: string, extra: Partial<LinhaGuia3d> = {}): LinhaGuia3d => ({
  masterId: id, masterSlug: `s-${id}`, nome, imagem: 'https://exemplo.test/f.jpg', rede, precoCents: cents, verificadoEm: '2026-11-15T12:00:00.000Z', ofertaSlug: `o-${id}-${rede}-${cents}`, ...extra,
});
const linhas: LinhaGuia3d[] = [
  L(P2SC, 'mercado-livre', 833000, 'm1'), L(P2SC, 'shopee', 939900, 'm1'), L(P2SC, 'amazon', 820000, 'm1'),
  L(P1SC, 'mercado-livre', 599900, 'm2'), L(P1SC, 'shopee', 684674, 'm2'),
  L(A1C, 'mercado-livre', 389999, 'm3'),
  L(A1MC, 'mercado-livre', 323900, 'm4'),
  L(P2S, 'mercado-livre', 679900, 'm5'),
  L(P1S, 'mercado-livre', 469900, 'm6'),
  L(A1, 'mercado-livre', 267297, 'm7'), L(A1, 'amazon', 264412, 'm8', { nome: 'Impressora 3D Bambu Lab A1, Bivolt' }),
  L(A1M, 'mercado-livre', 190699, 'm9'),
  L(KOBRA, 'mercado-livre', 339000, 'm10'), L('Impressora 3D Anycubic Kobra S1 Combo', 'mercado-livre', 460000, 'm11'),
  L('Filamento Bambu Lab PLA 1kg', 'mercado-livre', 9000, 'mf'),
  L('Impressora 3D Creality Ender 3', 'mercado-livre', 90000, 'mc'),
];
const g = montarGuia3d(linhas);
ok(g.slice(0, 8).map((i) => i.slug).join() === 'p2s-combo,p1s-combo,a1-combo,a1-mini-combo,p2s,p1s,a1,a1-mini', 'guia: 8 modelos na ordem do dono', g.map((i) => i.slug));
ok(g[0].menor?.rede === 'amazon' && g[0].menor.precoCents === 820000, 'P2S Combo: menor é o da Amazon quando mais barato', g[0].menor);
ok(g[1].menor?.rede === 'mercado-livre' && g[1].menor.precoCents === 599900, 'P1S Combo: menor do ML (Shopee mais cara)');
ok(g[1].semOferta.join() === 'amazon', 'P1S Combo: Amazon sem oferta agora', g[1].semOferta);
ok(g[1].lojas.map((l) => l.rede).join() === 'mercado-livre,shopee', 'Shopee aparece só quando há oferta');
ok(g[2].lojas.length === 1 && !g[2].lojas.some((l) => l.rede === 'shopee') && g[2].semOferta.join() === 'amazon', 'A1 Combo: sem Shopee listada, Amazon sem oferta');
ok(g[6].menor?.precoCents === 264412 && g[6].menor.rede === 'amazon', 'A1 junta A1 e A1 Bivolt (mesmo modelo): menor da Amazon');
ok(g[2].combo && !g[6].combo && g[3].slug.includes('mini-combo'), 'combo e avulsa em grupos separados');
ok(g[2].menor?.precoCents === 389999 && g[6].menor?.precoCents !== 389999, 'A1 não herda preço do A1 Combo');
ok(g[7].menor?.precoCents === 190699 && g[3].menor?.precoCents === 323900, 'A1 Mini separado de A1 Mini Combo');
ok(g.length === 10 && g.slice(8).every((i) => i.familia === 'kobra'), 'depois dos 8, só Kobra (sem filamento nem outra marca)', g.map((i) => i.slug));
ok(g[8].menor!.precoCents <= g[9].menor!.precoCents, 'Kobra por menor preço');
const vazio = montarGuia3d([]);
ok(vazio.length === 8 && vazio.every((i) => i.menor === null && i.semOferta.join() === 'mercado-livre,amazon'), 'sem dados: 8 modelos com aviso de sem oferta, nada inventado');
ok(variacaoSobreRegistrado(110, 100) === 10 && variacaoSobreRegistrado(90, 100) === -10 && variacaoSobreRegistrado(100, 100) === 0 && variacaoSobreRegistrado(100, null) === null, 'variação sobre o registrado');

// 3 seções
ok(SECOES_3D.map((s) => s.slug).join() === 'impressoras,filamentos,demais' && SECOES_3D.map((s) => s.rotulo).join() === 'Impressoras,Filamentos,Demais itens', 'três seções');
ok(rotuloTipo('impressao3d', 'demais') === 'Demais itens' && rotuloTipo('tecnologia', 'demais') === null, 'rótulo de demais só na impressão 3D');
const tipoDe = (t: string) => classificarTipo('impressao3d', t);
ok(tipoPertenceAoFiltro('impressao3d', tipoDe('Filamento PLA 1kg'), 'filamentos'), 'filamento na seção Filamentos');
ok(tipoPertenceAoFiltro('impressao3d', tipoDe('Impressora 3D Bambu Lab A1'), 'impressoras'), 'impressora na seção Impressoras');
ok(tipoPertenceAoFiltro('impressao3d', tipoDe('Resina 3D UV 1kg'), 'demais') && tipoPertenceAoFiltro('impressao3d', tipoDe('Secador de filamento'), 'demais'), 'resina e secador em Demais itens');
ok(!tipoPertenceAoFiltro('impressao3d', tipoDe('Filamento PLA 1kg'), 'demais') && !tipoPertenceAoFiltro('impressao3d', tipoDe('Impressora 3D Bambu Lab A1'), 'demais'), 'Demais não inclui impressora nem filamento');
ok(secoes3dLigada({}) && !secoes3dLigada({ DEPT_3D_SECOES: 'off' }), 'flag DEPT_3D_SECOES: padrão ligado, off desliga');

// Mensagens: a ordem fixa vale na fila e sem passar por cima de bloqueios
const MIN = 60_000;
const NOW = new Date('2026-11-12T15:00:00Z');
const ctx = { now: NOW, maxAgeMin: 180, adTag: '#publicidade', amazonMaxAgeMin: 60, amazonPaused: false, achado: true };
const offer = (id: string): OfferFact => ({
  offerId: id, priceCents: 280000, slug: `s-${id}`, title: 'Impressora 3D FDM', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', sellerId: `v-${id}`,
  sellerReputation: '5_green', sellerTotalSales: 900, confirmedAt: new Date(NOW.getTime() - 10 * MIN), priceSince: new Date(NOW.getTime() - 180 * MIN),
  affiliateLinkPending: false, officialLink: true, affiliateUrl: 'https://meli.la/AbCd123', quarantined: false, missCount: 0, returnedAt: null,
});
const facts = (id: string, nome: string): ProductFacts => ({
  masterProductId: id, masterName: nome, vertical: 'impressao3d', productType: 'product', platformLabel: null, format: 'unknown', catalogGate: 'approved',
  offers: [offer(id)], avg: null, minEvent: null, record: null, series: [], amazonSeries: [], tipo: 'impressora-3d', tipoMedianCents: 280000, tipoSample: 12,
});
const base = evaluateProductV2(facts('p0', 'Impressora 3D Creality Ender 3 V3'), ctx).candidates.find((c) => c.trigger === 'AC') as Candidate | undefined;
if (base) {
  const mk = (id: string, nome: string, over: Partial<Candidate> = {}): Candidate => ({ ...base, masterProductId: id, name: nome, vertical: 'impressao3d', tipo: 'impressora-3d', dedupKey: `${id}:AC:w`, messageKey: `k-${id}`, ...over });
  const cands = [mk('k', KOBRA), mk('a', A1), mk('c', P2SC), mk('b', P1SC), mk('o', 'Impressora 3D Creality Ender 3 V3', { moveScore: 99 })];
  ok(applyLimits(cands, [], NOW).next?.masterProductId === 'c', 'fila: P2S Combo sai primeiro, à frente de avulsa, Kobra e outra marca');
  const semP2S = cands.filter((c) => c.masterProductId !== 'c');
  ok(applyLimits(semP2S, [], NOW).next?.masterProductId === 'b', 'fila: sem P2S Combo, P1S Combo');
  const hist = [{ masterProductId: 'c', priceCents: 280000, sentAt: new Date(NOW.getTime() - 30 * MIN), trigger: 'G2', cls: 'insight' as const, vertical: 'impressao3d', tipo: 'impressora-3d' }];
  ok(applyLimits(cands, hist, NOW).next?.masterProductId !== 'c', 'bloqueio (dedup) continua valendo sobre a prioridade');
  process.env.GROUP_PRIORIDADE_3D = 'off';
  ok(applyLimits(cands, [], NOW).next?.masterProductId === 'o', 'GROUP_PRIORIDADE_3D=off volta à ordem de sempre');
  delete process.env.GROUP_PRIORIDADE_3D;
} else ok(false, 'candidato base não gerado');

console.log(`test-guia-3d: ${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
export {};
