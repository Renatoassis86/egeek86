// Dono, 2026-11-18: no pool de produtos avaliados, a principal marca da loja entra antes das demais dentro de cada tipo (exceto games); marca preferida da Beleza antes de todas.
import assert from 'node:assert/strict';
import { marcaRank, rodizioPorTipo, type PoolRow } from '../src/lib/messaging/pool-diversidade';

assert.equal(marcaRank('beleza', 'Sérum Medicube Zero Pore'), 0, 'marca preferida do dono');
assert.equal(marcaRank('beleza', 'Batom MAC Ruby Woo'), 1, 'principal marca da loja');
assert.equal(marcaRank('beleza', 'Esmalte Sem Marca Conhecida'), 2);
assert.equal(marcaRank('esporte', 'Bola de Futebol Penalty Campo'), 1);
assert.equal(marcaRank('esporte', 'Bola Generica Praia'), 2);
assert.equal(marcaRank('games', 'Jogo Capcom Resident Evil'), 2, 'games fica de fora');

const r = (mid: string, v: string, name: string, rr = 2): PoolRow => ({ mid, v, r: rr, name });
// 3 bolas: a de marca (Penalty) vem antes da generica mesmo com razao de entrada pior; nada sai do conjunto
const rows = [r('a', 'esporte', 'Bola Generica Praia Inflavel', 1), r('b', 'esporte', 'Bola de Futebol Campo Penalty', 3), r('c', 'esporte', 'Bola de Volei Mikasa V200W', 3)];
const out = rodizioPorTipo(rows, '2026-11-18T14', {}, 10).map((x) => x.mid);
assert.equal(out.length, 3, 'nenhum produto e excluido');
assert.ok(out.indexOf('a') > out.indexOf('b') && out.indexOf('a') > out.indexOf('c'), 'as de marca principal vem antes da generica');
// Beleza: Medicube (preferida) abre antes de MAC e do generico
const bel = [r('x', 'beleza', 'Esmalte Cremoso Qualquer', 1), r('y', 'beleza', 'Esmalte Risque Cremoso', 2), r('z', 'beleza', 'Esmalte Medicube Edicao', 3)];
const ob = rodizioPorTipo(bel, '2026-11-18T14', {}, 10).map((x) => x.mid);
assert.equal(ob[0], 'z', 'marca preferida do dono abre o tipo');
assert.equal(ob[1], 'y', 'depois a principal marca');
console.log('test-pool-marca: OK');
