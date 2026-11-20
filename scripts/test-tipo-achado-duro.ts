// Dono, 2026-11-18: diversificacao de itens dentro de cada loja. O achado (AC/N1) tem teto horario DURO por tipo e loja (sem exigir alternativa na fila).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TIPO_AC_MAX_PER_HOUR, tipoAcPorHora, tipoAcShareLimite } from '../src/lib/messaging/group-rules';
assert.equal(TIPO_AC_MAX_PER_HOUR, 3);
assert.equal(tipoAcPorHora({}), 3);
assert.equal(tipoAcPorHora({ GROUP_TIPO_AC_POR_HORA: '5' }), 5);
assert.equal(tipoAcPorHora({ GROUP_TIPO_AC_POR_HORA: 'off' }), 0);
assert.equal(tipoAcPorHora({ GROUP_TIPO_AC_POR_HORA: '0' }), 0);
assert.equal(tipoAcPorHora({ GROUP_TIPO_AC_POR_HORA: '99' }), 3, 'valor invalido volta ao padrao');
const r = fs.readFileSync('src/lib/messaging/group-rules.ts', 'utf8');
assert.ok(/acPorHora > 0 && \(c\.trigger === 'AC' \|\| c\.trigger === 'N1'\)/.test(r), 'so o achado/aviso sem comparacao entra no teto duro');
assert.ok(r.includes('tipoHourCount(c.vertical, c.tipo, real, now) >= limiteAc'), 'conta o que a loja ja enviou do tipo na ultima hora');
assert.ok(/achado_limite_\$\{limiteAc\}_por_hora_na_loja/.test(r), 'o excedente espera a hora seguinte (adiado com motivo, nao descartado)');
// teto ADAPTATIVO: 30% do volume horario medio da loja (referencia minima 20/h), nunca abaixo do piso
assert.equal(tipoAcShareLimite(0, 3), 6);
assert.equal(tipoAcShareLimite(100, 3), 6);
assert.equal(tipoAcShareLimite(700, 3), 9);
assert.equal(tipoAcShareLimite(1200, 3), 15);
assert.equal(tipoAcShareLimite(1200, 20), 20, 'o piso configurado nunca e rebaixado');
assert.ok(r.includes('tipoAcShareLimite(storeLast24h(real, c.vertical, now).length, acPorHora)'), 'o teto usa o volume da propria loja');
assert.ok(r.indexOf('achado_limite_') < r.indexOf('cupomOver(c) && ok0Viva.some'), 'o teto duro vem antes das cotas suaves');
console.log('test-tipo-achado-duro: OK');
