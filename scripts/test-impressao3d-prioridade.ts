/**
 * Prioridade de impressão 3D (dono, 2026-11-14): Kobra e Bambu Lab. Funções puras, sem banco e sem rede.
 * Uso: npx tsx scripts/test-impressao3d-prioridade.ts (sai com código 1 se algo falhar).
 */
import { applyLimits, evaluateProductV2, type Candidate, type OfferFact, type ProductFacts, type SentRecord } from '../src/lib/messaging/group-rules';
import { ehPrioridade3d, prioridade3dLigada } from '../src/lib/messaging/prioridade-3d';
import { priorizarImpressao3d } from '../src/lib/messaging/prioridade-3d';
import { TERMOS_3D_PRIORIDADE } from '../src/lib/catalog/vertical/config-tipos';

let fails = 0;
let total = 0;
function ok(c: boolean, n: string, x?: unknown) { total++; if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }

// Reconhecimento
ok(ehPrioridade3d('impressao3d', 'Impressora 3D Bambu Lab A1 Combo AMS Lite'), 'Bambu A1 Combo');
ok(ehPrioridade3d('impressao3d', 'Impressora 3d Anycubic Kobra S1 Combo Multicolor'), 'Kobra S1 Combo');
ok(ehPrioridade3d('impressao3d', 'Bambu Lab P2S Combo FDM'), 'P2S sem a palavra impressora');
ok(ehPrioridade3d('impressao3d', 'Anycubic Kobra 3 V2 Combo'), 'Kobra 3 V2');
ok(!ehPrioridade3d('impressao3d', 'Filamento Bambu Lab PLA Basic 1kg'), 'filamento Bambu não é impressora');
ok(!ehPrioridade3d('impressao3d', 'Kit Extrusor Original Bambu Lab com Motor'), 'extrusor Bambu é peça');
ok(!ehPrioridade3d('impressao3d', 'Resina Anycubic 1kg'), 'resina Anycubic não é impressora');
ok(!ehPrioridade3d('impressao3d', 'Impressora 3D Creality Ender 3 V3'), 'outra marca não entra');
ok(!ehPrioridade3d('games', 'Bambu Lab A1 Combo'), 'fora da vertical não entra');
ok(prioridade3dLigada({}) && !prioridade3dLigada({ GROUP_PRIORIDADE_3D: 'off' }), 'flag liga e desliga');

// Front: Kobra/Bambu abrem o destaque por preço, deixando vagas para outros itens
const it = (nome: string, min: number) => ({ name: nome, nome, min_cents: min });
const lista = [
  it('Impressora 3D Creality Ender 3 V3', 90000),
  it('Impressora 3D Bambu Lab A1 Mini', 180000),
  it('Impressora 3D Anycubic Kobra X Multicor', 234000),
  it('Impressora 3D Bambu Lab A1 Combo', 389999),
  it('Impressora 3D Elegoo Neptune 4', 120000),
  it('Impressora 3D Bambu Lab P1S Combo', 599900),
  it('Impressora 3D Anycubic Kobra S1 Combo', 370389),
  it('Filamento PLA 1kg', 9000),
];
const divers = <T,>(_v: string, l: readonly T[], n: number): T[] => l.slice(0, n);
const d = priorizarImpressao3d('impressao3d', lista, 6, divers);
ok(d.length === 6, 'destaque tem 6 itens', d.length);
ok(d.slice(0, 4).every((x) => ehPrioridade3d('impressao3d', x.name)), 'abre com Kobra/Bambu', d.map((x) => x.name));
ok(d[0].name.includes('A1 Mini'), 'ordenado por preço dentro da prioridade', d[0].name);
ok(d.filter((x) => !ehPrioridade3d('impressao3d', x.name)).length >= 1, 'deixa vaga para outros itens', d.map((x) => x.name));
const so = priorizarImpressao3d('impressao3d', lista.filter((x) => ehPrioridade3d('impressao3d', x.name)), 3, divers);
ok(so.length === 3, 'sem outros itens, só prioridade');
const outro = priorizarImpressao3d('tecnologia', [it('Notebook X', 1), it('Mouse Y', 2)], 2, divers);
ok(outro.length === 2, 'outros departamentos seguem a diversidade de sempre');

// Coleta: termos por modelo cobrem o que faltava
for (const t of ['anycubic kobra s1', 'anycubic kobra 3 combo', 'anycubic kobra neo', 'bambu lab x1 carbon', 'bambu lab p1p', 'bambu lab h2s']) ok(TERMOS_3D_PRIORIDADE.includes(t), `termo ${t}`);

// Mensagens: a prioridade só reordena o que já passou pelos bloqueios (applyLimits)
const H = 3600_000;
const MIN = 60_000;
const NOW = new Date('2026-11-12T15:00:00Z');
const ctx = { now: NOW, maxAgeMin: 180, adTag: '#publicidade', amazonMaxAgeMin: 60, amazonPaused: false, achado: true };
const offer = (id: string): OfferFact => ({
  offerId: id, priceCents: 280000, slug: `s-${id}`, title: 'Impressora 3D FDM', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', sellerId: `v-${id}`,
  sellerReputation: '5_green', sellerTotalSales: 900, confirmedAt: new Date(NOW.getTime() - 10 * MIN), priceSince: new Date(NOW.getTime() - 3 * H),
  affiliateLinkPending: false, officialLink: true, affiliateUrl: 'https://meli.la/AbCd123', quarantined: false, missCount: 0, returnedAt: null,
});
const facts = (id: string, nome: string, tipo: string): ProductFacts => ({
  masterProductId: id, masterName: nome, vertical: 'impressao3d', productType: 'product', platformLabel: null, format: 'unknown', catalogGate: 'approved',
  offers: [offer(id)], avg: null, minEvent: null, record: null, series: [], amazonSeries: [], tipo, tipoMedianCents: 280000, tipoSample: 12,
});
const base = evaluateProductV2(facts('p0', 'Impressora 3D Creality Ender 3 V3', 'impressora-3d'), ctx).candidates.find((c) => c.trigger === 'AC') as Candidate | undefined;
if (base) {
  const mk = (id: string, nome: string, over: Partial<Candidate> = {}): Candidate => ({ ...base, masterProductId: id, name: nome, vertical: 'impressao3d', tipo: 'impressora-3d', dedupKey: `${id}:AC:w`, messageKey: `k-${id}`, ...over });
  const outra = mk('c1', 'Impressora 3D Creality Ender 3 V3', { moveScore: 50 });
  const kobra = mk('k1', 'Impressora 3D Anycubic Kobra S1 Combo', { moveScore: 0 });
  const plan = applyLimits([outra, kobra], [], NOW);
  ok(plan.next?.masterProductId === 'k1', 'Kobra passa à frente de outra marca elegível', plan.next?.masterProductId);
  // cota suave de tipo: Kobra não é freada mesmo com a loja saturada de impressoras
  const hist: SentRecord[] = Array.from({ length: 10 }, (_, i) => ({ masterProductId: `h${i}`, priceCents: 1000, sentAt: new Date(NOW.getTime() - (120 + i * 30) * MIN), trigger: 'G2', cls: 'insight', vertical: 'impressao3d', tipo: 'impressora-3d' }));
  const p2 = applyLimits([kobra, mk('o2', 'Filamento PLA 1kg', { tipo: 'filamento-3d' })], hist, NOW);
  ok(p2.next?.masterProductId === 'k1', 'Kobra isenta da cota suave de tipo', p2.next?.masterProductId);
  // bloqueios continuam valendo: mesmo produto enviado há 30 min segue barrado
  const recente: SentRecord[] = [{ masterProductId: 'k1', priceCents: 280000, sentAt: new Date(NOW.getTime() - 30 * MIN), trigger: 'G2', cls: 'insight', vertical: 'impressao3d', tipo: 'impressora-3d' }];
  const p3 = applyLimits([kobra, outra], recente, NOW);
  ok(p3.next?.masterProductId !== 'k1', 'dedup do produto continua barrando a Kobra', p3.next?.masterProductId);
  // desligado por env: volta à ordem de sempre
  process.env.GROUP_PRIORIDADE_3D = 'off';
  const p4 = applyLimits([outra, kobra], [], NOW);
  ok(p4.next?.masterProductId === 'c1', 'com GROUP_PRIORIDADE_3D=off volta a ordem de sempre', p4.next?.masterProductId);
  delete process.env.GROUP_PRIORIDADE_3D;
} else ok(false, 'candidato base não gerado');

console.log(`test-impressao3d-prioridade: ${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
