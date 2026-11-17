// R-77 x pool do aviso (dono, 2026-11-17): o pool do "Em monitoramento" exclui o master pela MESMA janela da R-77 (72 h; 24 h na impressão 3D), não por 24 h fixas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { masterRepeatHoursFor } from '../src/lib/messaging/group-rules';
assert.equal(masterRepeatHoursFor('games', {}), 72);
assert.equal(masterRepeatHoursFor('impressao3d', {}), 24);
const s = fs.readFileSync('src/server/messaging/group-offers.ts', 'utf8');
assert.ok(s.includes("CASE l.v WHEN 'impressao3d' THEN ${janelaAc3d}::int ELSE ${janelaAcPadrao}::int END"), 'exclusão do pool usa a janela da R-77');
assert.ok(!/g\.sent_at >= now\(\) - interval '24 hours'\n\s*\)` : sql``\}\n\s*\)`\);/.test(s), 'sem o intervalo fixo de 24 h na base do aviso');
assert.ok(s.includes("masterRepeatHoursFor('games') || 24") && s.includes("masterRepeatHoursFor('impressao3d') || 24"), 'janelas vêm da regra (24 h se a R-77 estiver desligada)');
console.log('test-pool-aviso-r77: OK');
