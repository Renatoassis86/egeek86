// R-106 (dono, 2026-11-20): (A) ferramentas na Tecnologia, (B) teto horario especial por loja|tipo (mouse: 5/h menor preco; air fryer: 2/h). Sem banco, sem rede.
import assert from 'node:assert/strict';
import { applyLimits, iscaSuspeita, tipoTetoHoraEspecial, type Candidate, type SentRecord } from '../src/lib/messaging/group-rules';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';
import { marcaDoItem } from '../src/lib/messaging/marcas-lojas';
import { normalizaNome } from '../src/lib/messaging/cota-item';
import { segmentByKey } from '../src/lib/catalog/vertical/config';
import { scopeIssue } from '../src/lib/catalog/vertical/scope';
import { ehItemMiudo } from '../src/lib/catalog/item-miudo';

// ---- configuracao do teto especial ----
assert.deepEqual(tipoTetoHoraEspecial('tecnologia', 'mouse', {}), { porHora: 5, ordem: 'menor_preco' });
assert.deepEqual(tipoTetoHoraEspecial('tecnologia', 'mouse', { TECNOLOGIA_MOUSE_POR_HORA: '3' }), { porHora: 3, ordem: 'menor_preco' });
assert.equal(tipoTetoHoraEspecial('tecnologia', 'mouse', { TECNOLOGIA_MOUSE_POR_HORA: 'off' }), null);
assert.equal(tipoTetoHoraEspecial('tecnologia', 'mouse', { TECNOLOGIA_MOUSE_POR_HORA: '999' })?.porHora, 5, 'valor invalido volta ao padrao');
assert.deepEqual(tipoTetoHoraEspecial('eletrodomesticos', 'air-fryer', {}), { porHora: 2, ordem: 'normal' });
assert.equal(tipoTetoHoraEspecial('eletrodomesticos', 'air-fryer', { CASA_AIRFRYER_POR_HORA: '0' }), null);
assert.deepEqual(tipoTetoHoraEspecial('esporte', 'bola', {}), { porHora: 2, ordem: 'normal' });
assert.equal(tipoTetoHoraEspecial('esporte', 'bola', { ESPORTE_BOLA_POR_HORA: 'off' }), null);
assert.equal(tipoTetoHoraEspecial('esporte', 'tenis', {}), null);
for (const [v, t] of [['esporte', 'mouse'], ['tecnologia', 'teclado'], ['eletrodomesticos', 'geladeira'], ['games', 'mouse'], ['tecnologia', 'air-fryer']] as const) assert.equal(tipoTetoHoraEspecial(v, t, {}), null, `${v}|${t} sem teto especial`);

// ---- plano (applyLimits) ----
const now = new Date('2026-11-20T15:00:00-03:00');
let n = 0;
function cand(vertical: string, tipo: string, priceCents: number, extra: Partial<Candidate> = {}): Candidate {
  n++;
  return {
    messageKey: `k${n}`, trigger: 'G2', model: 'M1', masterProductId: `m${n}`, offerIds: [`o${n}`], vertical, networkSlug: 'mercado-livre', name: `${tipo} ${n}`, priceCents,
    avgCents: priceCents * 1.2, belowAvgPct: 10, dropPct: 8, reason: 't', status: 'auto', reviewReasons: [], cls: 'alerta', held: false, heldReasons: [], moveScore: 1, tipo,
    offerSlug: `s${n}`, networkName: 'Mercado Livre', sendable: true, notSendableReason: null, confirmedAt: now.toISOString(), dedupKey: `d${n}`, ...extra,
  } as unknown as Candidate;
}
function sent(vertical: string, tipo: string, minAgo: number): SentRecord {
  n++;
  return { sentAt: new Date(now.getTime() - minAgo * 60_000), masterProductId: `h${n}`, vertical, tipo, cls: 'alerta', trigger: 'G2', priceCents: 1000, offerId: `ho${n}`, networkSlug: 'mercado-livre' } as unknown as SentRecord;
}
const motivo = (plan: ReturnType<typeof applyLimits>, c: Candidate) => plan.deferred.find((d) => d.messageKey === c.messageKey)?.reason ?? null;
const noTeto = (plan: ReturnType<typeof applyLimits>, c: Candidate, h: number) => !motivo(plan, c)?.includes(`_teto_${h}_por_hora`);

// mouse: 8 candidatos; so os 5 menores seguem e o mais barato sai primeiro
const precos = [9900, 4500, 12000, 3000, 8000, 2500, 15000, 7000];
const mouses = precos.map((p) => cand('tecnologia', 'mouse', p));
const plano = applyLimits(mouses, [], now);
assert.ok(plano.next, 'algo sai');
assert.equal(plano.next!.priceCents, 2500, 'o mouse mais barato sai primeiro');
assert.deepEqual(mouses.filter((c) => !noTeto(plano, c, 5)).map((c) => c.priceCents).sort((a, b) => a - b), [9900, 12000, 15000], 'excedente (os 3 mais caros) adiado com motivo');
// ja saiu 3 mouses na ultima hora: restam 2 vagas
const plano2 = applyLimits(mouses, [10, 25, 50].map((m) => sent('tecnologia', 'mouse', m)), now);
assert.deepEqual(mouses.filter((c) => noTeto(plano2, c, 5)).map((c) => c.priceCents).sort((a, b) => a - b), [2500, 3000], 'com 3 enviados restam 2 vagas, as dos mais baratos');
// 5 enviados na hora: nenhum mouse sai; outro tipo da Tecnologia segue
const teclado = cand('tecnologia', 'teclado', 20000);
const plano3 = applyLimits([...mouses, teclado], [10, 15, 20, 30, 40].map((m) => sent('tecnologia', 'mouse', m)), now);
assert.ok(mouses.every((c) => !noTeto(plano3, c, 5)), 'teto atingido: todos os mouses adiados');
assert.equal(plano3.next?.messageKey, teclado.messageKey, 'outro tipo da Tecnologia sai normalmente');
// enviado ha mais de 1 h nao conta
const plano4 = applyLimits(mouses, [65, 70, 80, 90, 100].map((m) => sent('tecnologia', 'mouse', m)), now);
assert.equal(mouses.filter((c) => !noTeto(plano4, c, 5)).length, 3, 'so a ultima hora conta');

// preco-isca nao sobe: suspeito (queda >= 60%) fica fora dos 5 mesmo sendo o mais barato
const isca = cand('tecnologia', 'mouse', 500, { dropPct: 70 });
const normais = [3000, 3500, 4000, 4500, 5000].map((p) => cand('tecnologia', 'mouse', p));
assert.ok(iscaSuspeita(isca) && !iscaSuspeita(normais[0]));
const planoIsca = applyLimits([isca, ...normais], [], now);
assert.ok(!noTeto(planoIsca, isca, 5), 'a isca fica fora dos 5 (adiada) em vez de subir');
assert.equal(planoIsca.next!.priceCents, 3000, 'o menor preco NAO suspeito sai primeiro');
const retido = cand('tecnologia', 'mouse', 400, { held: true });
assert.equal(iscaSuspeita(retido), true);
assert.equal(applyLimits([retido, ...normais], [], now).next!.priceCents, 3000, 'retido nunca sai');

// outras lojas e tipos intactos
for (const lote of [precos.map((p) => cand('tecnologia', 'teclado', p)), precos.map((p) => cand('esporte', 'mouse', p))]) {
  const pl = applyLimits(lote, [], now);
  assert.ok(lote.every((c) => !(motivo(pl, c) ?? '').includes('_teto_')), 'sem teto especial fora de tecnologia|mouse e eletrodomesticos|air-fryer');
}

// air fryer: 2 por hora; os demais tipos de Casa intactos
const fryers = [1, 2, 3, 4, 5].map((i) => cand('eletrodomesticos', 'air-fryer', 30000 + i * 1000));
const outrosCasa = ['geladeira', 'micro-ondas', 'aspirador'].map((t) => cand('eletrodomesticos', t, 50000));
const planoCasa = applyLimits([...fryers, ...outrosCasa], [], now);
assert.equal(fryers.filter((c) => !noTeto(planoCasa, c, 2)).length, 3, 'so 2 air fryers seguem; 3 adiados');
assert.ok(outrosCasa.every((c) => !(motivo(planoCasa, c) ?? '').includes('_teto_')), 'demais tipos de Casa sem teto especial');
const planoCasa2 = applyLimits(fryers, [sent('eletrodomesticos', 'air-fryer', 5), sent('eletrodomesticos', 'air-fryer', 30)], now);
assert.ok(fryers.every((c) => !noTeto(planoCasa2, c, 2)) && planoCasa2.next === null, '2 enviados na hora: air fryer espera a hora seguinte');

// bola (Esporte): 2 por hora; os demais tipos de Esporte intactos
const bolas = [1, 2, 3, 4].map((i) => cand('esporte', 'bola', 5000 + i * 500));
const outrosEsporte = ['tenis', 'halter-peso', 'bicicleta'].map((t) => cand('esporte', t, 20000));
const planoEsp = applyLimits([...bolas, ...outrosEsporte], [], now);
assert.equal(bolas.filter((c) => !noTeto(planoEsp, c, 2)).length, 2, 'so 2 bolas seguem; 2 adiadas');
assert.ok(outrosEsporte.every((c) => !(motivo(planoEsp, c) ?? '').includes('_teto_')), 'demais tipos de Esporte sem teto especial');
const planoEsp2 = applyLimits(bolas, [sent('esporte', 'bola', 5), sent('esporte', 'bola', 40)], now);
assert.ok(bolas.every((c) => !noTeto(planoEsp2, c, 2)) && planoEsp2.next === null, '2 bolas na hora: espera a hora seguinte');

// ---- (A) ferramentas ----
assert.equal(classificarTipo('tecnologia', 'Furadeira de Impacto Bosch GSB 13 RE 650W'), 'ferramentas-eletricas');
assert.equal(classificarTipo('tecnologia', 'Parafusadeira Furadeira A Bateria Dewalt 20v 2 Baterias'), 'ferramentas-eletricas');
assert.equal(classificarTipo('tecnologia', 'Esmerilhadeira Angular Makita 9557 710w'), 'ferramentas-eletricas');
assert.equal(classificarTipo('tecnologia', 'Jogo de Chaves Combinadas Gedore 12 Peças'), 'ferramentas-manuais');
assert.equal(classificarTipo('tecnologia', 'Kit de Ferramentas Tramontina Pro 129 Peças com Maleta'), 'ferramentas-manuais');
assert.equal(classificarTipo('tecnologia', 'Mouse Gamer Logitech G502'), 'mouse', 'mouse segue classificado');
assert.equal(classificarTipo('tecnologia', 'Multimetro Digital Hikari'), 'medicao-eletrica', 'multimetro continua no seu tipo');
const marcas: Array<[string, string]> = [['Furadeira Bosch GSB 13 RE', 'bosch'], ['Parafusadeira DeWalt 20v', 'dewalt'], ['Serra Circular Makita 5007', 'makita'], ['Jogo de Soquetes Stanley', 'stanley'], ['Kit Ferramentas Black+Decker', 'black decker'], ['Serra Tico Tico Vonder', 'vonder'], ['Retífica Dremel 4000', 'dremel'], ['Soprador Térmico Einhell', 'einhell'], ['Ferro de Solda Hikari 60w', 'hikari'], ['Lixadeira Worx', 'worx'], ['Martelete Milwaukee', 'milwaukee'], ['Chave Irwin', 'irwin'], ['Kit Tramontina Pro Ferramentas', 'tramontina pro']];
for (const [t, m] of marcas) assert.equal(marcaDoItem('tecnologia', normalizaNome(t)), m, `marca reconhecida: ${t}`);
for (const k of ['ferramenta-eletrica', 'ferramenta-manual']) {
  const s = segmentByKey(k);
  assert.ok(s, `${k} criado`);
  assert.equal(s!.vertical, 'tecnologia', 'sem departamento novo');
  assert.equal(s!.requireBrand, true);
  assert.ok(s!.terms[0].includes('bosch') && s!.terms.findIndex((t) => t.includes('dewalt')) < s!.terms.findIndex((t) => t.includes('stanley')), `${k}: as melhores marcas abrem a lista de termos`);
}
const ok = (k: string, nome: string) => scopeIssue(k, nome) === null;
assert.ok(ok('ferramenta-eletrica', 'Furadeira de Impacto Bosch GSB 13 RE 650W com Maleta'));
assert.ok(ok('ferramenta-eletrica', 'Parafusadeira Furadeira Dewalt 20v com 2 Baterias e Carregador'));
assert.ok(ok('ferramenta-manual', 'Kit de Ferramentas Tramontina Pro 129 Peças com Maleta'));
assert.ok(!ok('ferramenta-eletrica', 'Furadeira Sem Marca 500w'), 'marca reconhecida obrigatoria');
assert.ok(!ok('ferramenta-eletrica', 'Broca para Furadeira Bosch Kit 10'), 'broca avulsa barrada');
assert.ok(!ok('ferramenta-eletrica', 'Disco de Corte para Esmerilhadeira Makita 4 1/2'), 'disco avulso barrado');
assert.ok(!ok('ferramenta-eletrica', 'Bateria 18v Makita para Furadeira'), 'bateria avulsa barrada');
assert.ok(!ok('ferramenta-manual', 'Faca Tática Tramontina Pro'), 'faca/arma barrada');
assert.ok(!ok('ferramenta-manual', 'Kit Ferramentas Pos Processamento Impressao 3d Stanley'), 'ferramenta de impressao 3d pertence a outra loja');
assert.ok(!ok('ferramenta-eletrica', 'Máquina de Solda Inversora Bosch MIG'), 'maquina de solda industrial fora');
assert.ok(!ok('ferramenta-eletrica', 'Furadeira Bosch Usada'), 'so novo');
// item miudo (regra do dono, 2026-11-13)
for (const t of ['Broca Aço Rápido Bosch 6mm', 'Jogo de Brocas Makita 19 Peças', 'Disco de Corte Inox Bosch 4 1/2', 'Kit Bits Parafusadeira Dewalt']) assert.equal(ehItemMiudo(t, 3000, 'general', 'tecnologia'), true, `miudo: ${t}`);
for (const t of ['Furadeira de Impacto Bosch GSB 13 RE 650W', 'Parafusadeira Furadeira Dewalt 20v 2 Baterias', 'Kit de Ferramentas Tramontina Pro 129 Peças com Maleta', 'Jogo de Chaves Combinadas Gedore 12 Peças']) assert.equal(ehItemMiudo(t, 30000, 'general', 'tecnologia'), false, `principal: ${t}`);
console.log('test-tecnologia-ferramentas-mouse: OK');
