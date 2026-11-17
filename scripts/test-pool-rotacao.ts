// Cobertura do pool (dono, 2026-11-17): com a semente por MINUTO, o conjunto elegível é percorrido em minutos; com a semente por HORA, ficava preso nos mesmos produtos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POOL, selecionarPool, type PoolRow } from '../src/lib/messaging/pool-diversidade';

const achado: PoolRow[] = Array.from({ length: 600 }, (_, i) => ({ mid: `m${i}`, v: 'eletroeletronicos', r: 5, name: `Produto ${i} fone de ouvido` }));
const cobertura = (chave: (m: number) => string, minutos: number) => {
  const vistos = new Set<string>();
  for (let m = 0; m < minutos; m++) for (const id of selecionarPool({ main: [], achado, hourKey: chave(m), sends: {}, achadoOn: true })) vistos.add(id);
  return vistos.size;
};
const porHora = cobertura(() => '2026-11-17T22', 60);
const porMinuto = cobertura((m) => `2026-11-17T22:${String(m).padStart(2, '0')}`, 60);
assert.equal(porHora, POOL.PLUS_ACHADO, 'por hora: só o mesmo grupo de ' + POOL.PLUS_ACHADO + ' produtos');
assert.ok(porMinuto >= 550, `por minuto: quase todos os 600 em 60 ciclos (visto ${porMinuto})`);
const dezMin = cobertura((m) => `2026-11-17T22:${String(m).padStart(2, '0')}`, 20);
assert.ok(dezMin >= 400, `em 20 ciclos já cobre mais de 2/3 (visto ${dezMin})`);
const src = fs.readFileSync('src/server/messaging/group-offers.ts', 'utf8');
assert.ok(src.includes("hourKey: rotKey") && src.includes("o.now.toISOString().slice(0, 16)"), 'o pick usa a semente por minuto');
assert.ok(src.includes("POOL_ROTACAO"), 'reversível por POOL_ROTACAO=hora');
console.log(`test-pool-rotacao: OK (60 ciclos: hora ${porHora} produtos, minuto ${porMinuto}; 20 ciclos: ${dezMin})`);
