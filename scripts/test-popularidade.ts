// R-103: popularidade das plataformas como criterio de PRIORIDADE (ordem), nunca de exclusao (dono, 2026-11-18).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POPULARIDADE_VALIDADE_DIAS, popularidadeLigada, scoreDeRank, verticalDaJanela } from '../src/lib/popularidade/score';

assert.equal(scoreDeRank(1, 20), 1);
assert.equal(scoreDeRank(20, 20), 0.05);
assert.ok(scoreDeRank(2, 20) < scoreDeRank(1, 20) && scoreDeRank(10, 20) > scoreDeRank(11, 20));
assert.equal(scoreDeRank(0, 20), 0);
assert.equal(scoreDeRank(21, 20), 0);
assert.equal(scoreDeRank(1, 0), 0);
assert.equal(scoreDeRank(Number.NaN, 20), 0);
assert.equal(popularidadeLigada({}), true);
assert.equal(popularidadeLigada({ GROUP_POPULARIDADE: 'off' }), false);
assert.equal(popularidadeLigada({ GROUP_POPULARIDADE: '0' }), false);
assert.equal(POPULARIDADE_VALIDADE_DIAS, 7);
const vs = ['a', 'b', 'c'];
assert.equal(verticalDaJanela(vs, new Date('2026-11-18T12:00:00Z')), verticalDaJanela(vs, new Date('2026-11-18T12:29:59Z')), 'mesma janela de 30 min, mesmo departamento');
assert.notEqual(verticalDaJanela(vs, new Date('2026-11-18T12:00:00Z')), verticalDaJanela(vs, new Date('2026-11-18T12:30:00Z')), 'janela seguinte, outro departamento');
assert.equal(verticalDaJanela([], new Date()), null);

const q = fs.readFileSync('src/server/messaging/group-queue.ts', 'utf8');
assert.ok(q.includes('popularidadeLigada()') && q.includes('offer_popularity'), 'a ordem da fila usa a popularidade (com chave)');
assert.ok(/DESC\$\{popOrdem\}, g\.created_at DESC\) AS rn_fair/.test(q), 'popularidade desempata DENTRO do degrau da regua, antes da recencia');
assert.ok(!/WHERE[^;]{0,200}offer_popularity[^;]{0,60}AND NOT/.test(q), 'popularidade nunca exclui linha da fila');
const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
assert.ok(cfg.crons.some((c) => c.path === '/api/cron/popularidade' && c.schedule === '11,41 * * * *'), 'cron do coletor de popularidade a cada 30 min');
const mig = fs.readFileSync('drizzle/migrations/0067_offer_popularity.sql', 'utf8');
assert.ok(/CREATE TABLE IF NOT EXISTS offer_popularity/.test(mig) && !/ALTER TABLE (affiliate|master|group)/i.test(mig) && /ENABLE ROW LEVEL SECURITY/.test(mig), 'migracao so adiciona tabela nova, com RLS');
assert.ok(fs.existsSync('drizzle/migrations/0067_offer_popularity.rollback.sql'), 'rollback da migracao existe');
console.log('test-popularidade: OK');
