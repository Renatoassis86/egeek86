// E4 (#145, R-90): aviso "Em monitoramento" com diagnóstico quando há base, "sendo monitorado" quando não há; TTL/motivo/prioridade na fila.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatAchadoMessage } from '../src/lib/messaging/group-messages';
import { diagnosticoAchado } from '../src/lib/messaging/group-rules';
import { orcamentoFrescor } from '../src/lib/frescor/orcamento';
import { textProblems } from '../src/lib/messaging/group-messages';

// diagnóstico puro
assert.equal(diagnosticoAchado(19900, [20000, 20000]), null, 'menos de 3 dias = sem base');
assert.equal(diagnosticoAchado(0, [1, 2, 3, 4]), null);
assert.match(diagnosticoAchado(18000, [20000, 20000, 20000])!, /^10% abaixo da mediana dos últimos 3 dias/);
assert.match(diagnosticoAchado(22000, [20000, 20000, 20000, 20000])!, /^10% acima da mediana/);
assert.match(diagnosticoAchado(20100, [20000, 20000, 20000])!, /^em linha com a mediana/);

const base = { model: 'achado', name: 'Panela X', offer: { slug: 'panela-x', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 19900, confirmedAt: new Date() }, offersCount: 8, isLowest: true, vertical: 'eletrodomesticos', messageKey: 'ac-261117-abc123', adTag: '#publicidade' };
const sem = formatAchadoMessage({ ...base, novo: true } as never, 'tg');
assert.match(sem, /Novo no monitoramento/);
assert.match(sem, /estamos monitorando o preço deste produto/, 'sem base: diz que está sendo monitorado');
assert.doesNotMatch(sem, /%/, 'sem base: nenhuma comparação inventada');
const com = formatAchadoMessage({ ...base, novo: false, diagnostico: '10% abaixo da mediana dos últimos 5 dias de coleta deste produto' } as never, 'tg');
assert.match(com, /Em monitoramento/);
assert.match(com, /Diagnóstico/);
assert.match(com, /10% abaixo da mediana/);
assert.doesNotMatch(com, /estamos monitorando o preço/);
assert.deepEqual(textProblems(sem, 'tg'), [], 'sem termo banido (sem base)');

// TTL do aviso
assert.equal(orcamentoFrescor({}).avisoMonitoramentoTtlMin, 90);
assert.equal(orcamentoFrescor({ GROUP_AC_TTL_MIN: '120' }).avisoMonitoramentoTtlMin, 120);
assert.equal(orcamentoFrescor({ GROUP_AC_TTL_MIN: '5' }).avisoMonitoramentoTtlMin, 90);

// Fila: expiração com motivo e queda antes do aviso
const q = fs.readFileSync('src/server/messaging/group-queue.ts', 'utf8');
assert.ok(q.includes("'expirada sem envio: aviso de monitoramento não coube no ritmo em '"), 'AC expira com motivo');
assert.ok(q.includes("'expirada sem envio: retida por 24 h sem liberação (gatilho '"), 'retida expira com motivo');
assert.ok(!q.includes("COALESCE(error, 'expirada sem envio')\n    WHERE (status IN ('proposta', 'proposta_auto')"), 'sem expiração muda');
assert.ok(q.includes("ORDER BY q.rn_fair, (q.trigger = 'AC'), q.created_at"), 'queda antes do aviso dentro do rodízio');
console.log('test-aviso-monitoramento-r90: OK');
