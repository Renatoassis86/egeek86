// E6 (#147): o job fecha também os dias passados que ficaram abertos (lote que falhou / orçamento esgotado), com teto de catch-up.
import assert from 'node:assert/strict';
import { primeiroDiaATratar } from '../src/lib/pricing/daily-state';
const base = { today: '2026-11-17', regimeStart: '2026-10-31' };
// sem dia aberto: igual ao comportamento antigo
assert.equal(primeiroDiaATratar({ ...base, lastClosed: '2026-11-16', menorAbertoPassado: null }), '2026-11-17');
assert.equal(primeiroDiaATratar({ ...base, lastClosed: '2026-11-01', menorAbertoPassado: null }), '2026-11-10', 'teto de 7 dias');
// com dia passado aberto antes do último fechado: volta até ele
assert.equal(primeiroDiaATratar({ ...base, lastClosed: '2026-11-16', menorAbertoPassado: '2026-11-13' }), '2026-11-13');
// dia aberto muito antigo: teto de 14 dias
assert.equal(primeiroDiaATratar({ ...base, lastClosed: '2026-11-16', menorAbertoPassado: '2026-11-05' }), '2026-11-05'.replace('05', '05'));
assert.equal(primeiroDiaATratar({ ...base, lastClosed: '2026-11-16', menorAbertoPassado: '2026-11-01' }), '2026-11-03', 'teto de 14 dias com dia aberto');
// aberto = hoje não conta (hoje fica aberto por desenho)
assert.equal(primeiroDiaATratar({ ...base, lastClosed: '2026-11-16', menorAbertoPassado: '2026-11-17' }), '2026-11-17');
// nunca antes do início do regime
assert.equal(primeiroDiaATratar({ today: '2026-11-05', regimeStart: '2026-10-31', lastClosed: null, menorAbertoPassado: '2026-10-20' }), '2026-10-31');
console.log('test-fechamento-dia-r90: OK');
