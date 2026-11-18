// Dono, 2026-11-18: diversificacao de itens dentro de cada loja. O achado (AC/N1) tem teto horario DURO por tipo e loja (sem exigir alternativa na fila).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TIPO_AC_MAX_PER_HOUR, tipoAcPorHora } from '../src/lib/messaging/group-rules';
assert.equal(TIPO_AC_MAX_PER_HOUR, 3);
assert.equal(tipoAcPorHora({}), 3);
assert.equal(tipoAcPorHora({ GROUP_TIPO_AC_POR_HORA: '5' }), 5);
assert.equal(tipoAcPorHora({ GROUP_TIPO_AC_POR_HORA: 'off' }), 0);
assert.equal(tipoAcPorHora({ GROUP_TIPO_AC_POR_HORA: '0' }), 0);
assert.equal(tipoAcPorHora({ GROUP_TIPO_AC_POR_HORA: '99' }), 3, 'valor invalido volta ao padrao');
const r = fs.readFileSync('src/lib/messaging/group-rules.ts', 'utf8');
assert.ok(/acPorHora > 0 && \(c\.trigger === 'AC' \|\| c\.trigger === 'N1'\)/.test(r), 'so o achado/aviso sem comparacao entra no teto duro');
assert.ok(r.includes("tipoHourCount(c.vertical, c.tipo, real, now) >= acPorHora"), 'conta o que a loja ja enviou do tipo na ultima hora');
assert.ok(/achado_limite_\$\{acPorHora\}_por_hora_na_loja/.test(r), 'o excedente espera a hora seguinte (adiado com motivo, nao descartado)');
assert.ok(r.indexOf('achado_limite_') < r.indexOf('cupomOver(c) && ok0.some'), 'o teto duro vem antes das cotas suaves');
console.log('test-tipo-achado-duro: OK');
