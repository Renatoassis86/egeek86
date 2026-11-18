// Aspiradores na Amazon (dono, 2026-11-17): prioridade para uso doméstico na passada rápida.
import assert from 'node:assert/strict';
import { ASPIRADOR_DOMESTICO_SQL, aspiradorCabecaMax } from '../src/server/collector/amazon-assisted';

assert.equal(aspiradorCabecaMax({}), 12);
assert.equal(aspiradorCabecaMax({ AMAZON_ASPIRADOR_CABECA: '0' }), 0);
assert.equal(aspiradorCabecaMax({ AMAZON_ASPIRADOR_CABECA: '99' }), 12, 'acima do teto volta ao padrão');
const m = ASPIRADOR_DOMESTICO_SQL.match(/m\.name ~\* '([^']+)' AND m\.name !~\* '([^']+)'/);
assert.ok(m, 'forma do filtro');
const inc = new RegExp(m![1], 'i');
const exc = new RegExp(m![2], 'i');
const ok = (t: string) => inc.test(t) && !exc.test(t);
for (const t of ['Aspirador de Pó Vertical Sem Fio Philco', 'Robô Aspirador Xiaomi H50 Pro', 'Aspirador Portátil Recarregável', 'Robo Aspirador Wap Robot W120']) assert.ok(ok(t), t);
for (const t of ['Aspirador Industrial 1600W Profissional', 'Aspirador Automotivo Veicular 12V', 'Extratora Aspirador Estofados', 'Aspirador de Piscina Automático', 'Filtro Hepa Samsung']) assert.ok(!ok(t) || /filtro/i.test(t), t);
console.log('test-amazon-aspirador-cabeca: OK');
