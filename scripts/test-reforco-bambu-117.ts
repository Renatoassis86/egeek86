/**
 * #117: reforco Bambu Lab no canal Impressao 3D (GROUP_REFORCO_BAMBU, padrao desligada).
 * Cooldown por OFERTA com queda real, produto repetido por oferta, so Bambu, flag desligada = comportamento de sempre.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-reforco-bambu-117.ts
 */
import { masterCooldownBlock, productDedupBlock, type SentRecord } from '../src/lib/messaging/group-rules';
import { ehBambuLab3d, reforcoBambuLigado } from '../src/lib/messaging/prioridade-3d';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const now = new Date('2026-11-15T15:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);

ok(ehBambuLab3d('impressao3d', 'Impressora 3D Bambu Lab P2S Combo') === true, 'Bambu P2S Combo');
ok(ehBambuLab3d('impressao3d', 'Impressora 3d Anycubic Kobra X') === false, 'Kobra não é Bambu');
ok(ehBambuLab3d('impressao3d', 'Filamento Pla Bambu Lab Refil 1kg') === false, 'filamento Bambu não entra');
ok(ehBambuLab3d('games', 'Bambu Lab') === false, 'só a vertical impressao3d');

const cand = (price: number, offer: string, trigger = 'G2') => ({
  masterProductId: 'm1', priceCents: price, trigger, offerIds: [offer], couponRef: undefined, regua: undefined,
  vertical: 'impressao3d', name: 'Impressora 3D Bambu Lab P2S Combo', tipo: null,
}) as unknown as Parameters<typeof masterCooldownBlock>[0];
const hist = (min: number, price: number, offerId: string | null): SentRecord[] => [{ masterProductId: 'm1', priceCents: price, sentAt: ago(min), trigger: 'G2', cls: 'insight', vertical: 'impressao3d', offerId }];

// Flag desligada: o cooldown é por master (como sempre), mesmo com oferta diferente.
delete process.env.GROUP_REFORCO_BAMBU;
ok(reforcoBambuLigado() === false, 'padrão desligada');
ok(!!masterCooldownBlock(cand(800000, 'B'), hist(60, 833000, 'A'), now), 'desligada: outra oferta do mesmo master continua em cooldown');
ok(!!masterCooldownBlock(cand(800000, 'A'), hist(60, 833000, 'A'), now), 'desligada: mesma oferta em cooldown');

// Flag ligada.
process.env.GROUP_REFORCO_BAMBU = 'on';
ok(reforcoBambuLigado() === true, 'liga com on');
ok(masterCooldownBlock(cand(833000, 'B'), hist(60, 833000, 'A'), now) === null, 'ligada: outra oferta (outra loja/rede) do mesmo modelo sai');
ok(!!masterCooldownBlock(cand(833000, 'A'), hist(60, 833000, 'A'), now), 'ligada: a MESMA oferta sem queda continua em cooldown');
ok(masterCooldownBlock(cand(833000 - 16660, 'A'), hist(40, 833000, 'A'), now) === null, 'ligada: queda de 2% na mesma oferta volta em 30+ min');
ok(!!masterCooldownBlock(cand(833000 - 16660, 'A'), hist(20, 833000, 'A'), now), 'ligada: antes de 30 min segue bloqueada');
ok(!!masterCooldownBlock(cand(833000 - 16000, 'A'), hist(40, 833000, 'A'), now), 'ligada: queda menor que 2% não rompe');
ok(masterCooldownBlock(cand(100000 - 5000, 'A'), hist(40, 100000, 'A'), now) === null, 'ligada: R$ 50 em produto barato rompe');
// Não é Bambu: nada muda.
const kobra = { ...cand(833000, 'B'), name: 'Impressora 3d Anycubic Kobra X' } as unknown as Parameters<typeof masterCooldownBlock>[0];
ok(!!masterCooldownBlock(kobra, hist(60, 833000, 'A'), now), 'ligada: Kobra segue por master');
// Histórico sem offerId (registros antigos): cai no comportamento por master.
ok(!!masterCooldownBlock(cand(833000, 'B'), hist(60, 833000, null), now), 'registro antigo sem oferta cai no cooldown por master');

// Duplicata do produto (1 h): por oferta no Bambu.
const dup = (offer: string) => ({ masterProductId: 'm1', priceCents: 833000, trigger: 'G2', offerIds: [offer], vertical: 'impressao3d', name: 'Impressora 3D Bambu Lab P2S Combo', tipo: null }) as unknown as Parameters<typeof productDedupBlock>[0];
ok(productDedupBlock(dup('B'), hist(20, 833000, 'A'), now) === null, 'ligada: duplicata por oferta, outra oferta sai');
ok(!!productDedupBlock(dup('A'), hist(20, 833000, 'A'), now), 'ligada: mesma oferta em 20 min continua bloqueada');
delete process.env.GROUP_REFORCO_BAMBU;
ok(!!productDedupBlock(dup('B'), hist(20, 833000, 'A'), now), 'desligada: duplicata por master');

if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
console.log('OK reforço Bambu #117');
export {};
