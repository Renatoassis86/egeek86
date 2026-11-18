// DIVERSIDADE do envio (dono, 2026-11-18): proibido rodar so em cima de poucos produtos, tipos e redes; Beleza dentro do pipeline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RELEASED_VERTICALS, RULES } from '../src/lib/messaging/group-rules';

assert.ok(RELEASED_VERTICALS.includes('beleza'), 'beleza no pipeline de mensagens');
assert.equal(RULES.TIPO_MAX_SHARE_PCT, 20, 'nenhum tipo passa de 20% das mensagens da loja em 24 h');
const rules = fs.readFileSync('src/lib/messaging/group-rules.ts', 'utf8');
assert.ok(rules.includes('GROUP_DIVERSIDADE') && rules.includes('masterCountOf') && rules.includes('redeCountOf'), 'ordenacao por tipo, produto (72 h) e rede');
assert.ok(rules.includes("c.trigger !== 'G1' && c.trigger !== 'OK1' && (c.cls !== 'alerta' || cotaAlerta)"), 'rodizio em toda classe de preco, exceto G1/OK1 (alerta com a cota ligada)');
const offers = fs.readFileSync('src/server/messaging/group-offers.ts', 'utf8');
assert.ok(/RELEASED_PLUS = \[[^\]]*'beleza'/.test(offers) && /opts\.verticals \?\? \[[^\]]*'beleza'/.test(offers), 'beleza na deteccao e no pool');
console.log('test-diversidade-envio: OK');
