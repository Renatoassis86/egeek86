// E2 (#143): o orçamento único governa Amazon (envio/detecção), cupons e não deixa literal de idade nas regras migradas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { orcamentoFrescor, ORCAMENTO } from '../src/lib/frescor/orcamento';
import { RULES } from '../src/lib/messaging/group-rules';
import { AGULHA } from '../src/lib/coupons/agulha';

assert.equal(orcamentoFrescor({}).amazonDizerMin, 45);
assert.equal(orcamentoFrescor({ AMAZON_FRESCOR_MIN: '30' }).amazonDizerMin, 30);
assert.equal(orcamentoFrescor({ AMAZON_FRESCOR_MIN: '5' }).amazonDizerMin, 45, 'valor fora de 10..360 volta ao padrão');
assert.equal(RULES.AMAZON_SEND_MAX_AGE_MIN, ORCAMENTO.amazonDizerMin, 'envio da Amazon = orçamento');
assert.equal(RULES.AMAZON_DETECT_MAX_AGE_MIN, ORCAMENTO.amazonDizerMin, 'detecção da Amazon = orçamento');
assert.equal(AGULHA.ITEM_FRESH_MIN, ORCAMENTO.cupomItemMin);
assert.equal(AGULHA.LIST_FRESH_MIN, ORCAMENTO.cupomListaMin);
assert.equal(AGULHA.CAMPANHA_FRESH_MIN, ORCAMENTO.cupomCampanhaMin);

// Guarda: as chaves migradas não voltam a ter número literal.
const gr = fs.readFileSync('src/lib/messaging/group-rules.ts', 'utf8');
assert.ok(/AMAZON_DETECT_MAX_AGE_MIN:\s*ORCAMENTO\./.test(gr) && /AMAZON_SEND_MAX_AGE_MIN:\s*ORCAMENTO\./.test(gr), 'group-rules deve ler o orçamento');
const ag = fs.readFileSync('src/lib/coupons/agulha.ts', 'utf8');
for (const k of ['ITEM_FRESH_MIN', 'LIST_FRESH_MIN', 'CAMPANHA_FRESH_MIN']) assert.ok(ag.includes(`${k}: ORCAMENTO.`), `${k} deve ler o orçamento`);
console.log('test-orcamento-frescor: OK');
