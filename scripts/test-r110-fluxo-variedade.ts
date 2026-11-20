// R-110 (dono, 2026-11-20): maior fluxo com maior variedade. Sem banco, sem rede.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES, neutroLimites, masterRepeatHoursFor } from '../src/lib/messaging/group-rules';
import { resumoVariedade } from './medir-variedade-envio';

// N1 dobrado (o env so baixa)
assert.equal(RULES.N1_MAX_PER_HOUR, 2);
assert.equal(RULES.N1_MAX_PER_DAY, 12);
assert.deepEqual(neutroLimites({ GROUP_N1_POR_HORA: '9', GROUP_N1_POR_DIA: '99' }), { porHora: 2, porDia: 12 });
assert.equal(masterRepeatHoursFor('games', { GROUP_MASTER_REPEAT_SEM_NOVIDADE_H: '24' }), 24);

// medidor de variedade
const r = resumoVariedade([
  { vertical: 'esporte', tipo: 'bola' }, { vertical: 'esporte', tipo: 'bola' }, { vertical: 'esporte', tipo: 'tenis' },
  { vertical: 'livros', tipo: null },
], 2);
const esp = r.find((x) => x.loja === 'esporte')!;
assert.equal(esp.envios, 3); assert.equal(esp.tipos_distintos, 2); assert.equal(esp.por_hora, 1.5); assert.match(esp.maior_tipo, /^bola 67%/);
assert.equal(r.find((x) => x.loja === 'livros')!.tipos_distintos, 1);
assert.equal(r[0].loja, 'esporte', 'ordenado por envios');

// pre-filtro da janela: presente, com desligador e sem tocar CUPOM/G4/RADAR/plataforma/G1/OK1
const q = fs.readFileSync('src/server/messaging/group-queue.ts', 'utf8');
assert.match(q, /GROUP_JANELA_PREFILTRO/);
assert.match(q, /g\.trigger NOT IN \('CUPOM', 'G4', 'RADAR'\)/);
assert.match(q, /g\.trigger NOT IN \('G1', 'OK1'\)/);
assert.match(q, /NOT EXISTS \(SELECT 1 FROM group_messages s WHERE \$\{noR77\}/);
console.log('OK: R-110 (N1 2/h e 12/dia, medidor de variedade, pre-filtro da janela).');
