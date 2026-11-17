// E1 (#142): testa a régua pura do medidor de frescor e o rótulo "coletado há X" (R-90).
import assert from 'node:assert/strict';
import { distribuicao, idadeMin, percentil, rotuloColetadoHa, violacoesEnvio } from '../src/lib/frescor/medidor';

assert.equal(percentil([], 50), null);
assert.equal(percentil([10, 20, 30, 40, 50], 50), 30);
assert.equal(percentil([10, 20, 30, 40, 50], 90), 50);
assert.equal(percentil([5], 90), 5);

const d = distribuicao([10, 30, 50, 200, null, undefined], { '45min': 45, '2h': 120 });
assert.equal(d.n, 6);
assert.equal(d.semLeitura, 2);
assert.equal(d.ate['45min'], 2);
assert.equal(d.ate['2h'], 3);
assert.equal(d.max, 200);

const now = new Date('2026-11-17T12:00:00Z');
assert.equal(idadeMin('2026-11-17T11:30:00Z', now), 30);
assert.equal(idadeMin(null, now), null);
assert.equal(idadeMin('2026-11-17T12:05:00Z', now), 0, 'relógio adiantado não gera idade negativa');

assert.equal(rotuloColetadoHa(0.5), 'coletado agora');
assert.equal(rotuloColetadoHa(12), 'coletado há 12 min');
assert.equal(rotuloColetadoHa(180), 'coletado há 3 h');
assert.equal(rotuloColetadoHa(3 * 1440), 'coletado há 3 d');
assert.equal(rotuloColetadoHa(null), 'coleta ainda não registrada');
assert.equal(rotuloColetadoHa(-1), 'coleta ainda não registrada');

assert.equal(violacoesEnvio([10, 44, 46], 45), 1);
assert.equal(violacoesEnvio([], 45), 0);

console.log('test-frescor-medidor: OK');
