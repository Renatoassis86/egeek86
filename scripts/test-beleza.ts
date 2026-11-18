// Vertical Beleza (dono, 2026-11-17): maquiagem primeiro, melhores marcas primeiro, so produto novo (sem amostra/miniatura/brinde).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERTICALS, isVertical } from '../src/lib/catalog/verticais';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';
import { departamentoPorSlug } from '../src/lib/catalog/departamentos';
import { NOVOS_SEGMENTOS_TIPOS, MARCAS_MAQUIAGEM_TOP } from '../src/lib/catalog/vertical/config-tipos';
import { VERTICAIS_SHOPEE_OUTRAS } from '../src/lib/catalog/vertical/shopee-rodizio';
import { parseLojas } from '../src/lib/catalog/vertical/seed-slice';

assert.ok(isVertical('beleza') && VERTICALS.includes('beleza'));
assert.equal(departamentoPorSlug('beleza')?.flag, 'dept_beleza');
assert.deepEqual(parseLojas('beleza'), ['beleza']);
assert.deepEqual(parseLojas('maquiagem'), ['beleza'], 'apelido maquiagem');
assert.ok((VERTICAIS_SHOPEE_OUTRAS as readonly string[]).includes('beleza'), 'Shopee entra no rodizio');

// tipos
const t = (s: string) => classificarTipo('beleza', s);
assert.equal(t('Batom Mac Frost - Fabby'), 'batom-labios');
assert.equal(t('Base Liquida Dior Forever Matte 30ml'), 'base-corretivo');
assert.equal(t('Paleta de Sombras Urban Decay Naked 3'), 'olhos');
assert.equal(t('Mascara de Cilios Maybelline Lash Sensational'), 'olhos');
assert.equal(t('Perfume Carolina Herrera Good Girl Eau de Parfum 80ml'), 'perfumaria');
assert.equal(t('Shampoo Kerastase Nutritive 250ml'), 'cabelo');
assert.equal(t('Serum Facial Vitamina C La Roche-Posay'), 'skincare');
assert.equal(t('Esmalte Risque Cremoso Vermelho'), 'unhas');

// segmentos: maquiagem abre (rank menor), e as melhores marcas abrem cada lista de termos
const bel = NOVOS_SEGMENTOS_TIPOS.filter((s) => s.vertical === 'beleza');
assert.ok(bel.length >= 10, 'segmentos de beleza');
const ranks = bel.map((s) => s.seedRank);
assert.equal(bel.find((s) => s.seedRank === Math.min(...ranks))?.key, 'batom', 'maquiagem (batom) e a primeira');
assert.ok(bel.filter((s) => s.seedRank < 310).every((s) => /batom|base|po-|olhos|esmalte|pinceis/.test(s.key)), 'rank < 210 e so maquiagem');
const batom = bel.find((s) => s.key === 'batom')!;
assert.ok(/mac/.test(batom.terms[0]) && MARCAS_MAQUIAGEM_TOP[0] === 'mac', 'a melhor marca abre a lista de termos');

// porteiro: amostra, miniatura, brinde e infantil fora
const gate = fs.readFileSync('src/lib/catalog/vertical/gate.ts', 'utf8');
const m = gate.match(/beleza: \/(.+)\/,/);
assert.ok(m, 'OUT_OF_SCOPE de beleza');
const re = new RegExp(m![1]);
for (const x of ['amostra batom', 'miniatura perfume 5ml', 'brinde necessaire', 'maquiagem infantil kit']) assert.ok(re.test(x), x);
for (const x of ['batom mac frost', 'base dior forever', 'perfume carolina herrera 80ml']) assert.ok(!re.test(x), x);

const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { crons: { path: string }[] };
assert.ok(cfg.crons.some((c) => c.path === '/api/cron/collect-vertical?v=beleza'), 'cron de coleta da beleza');
console.log('test-beleza: OK');
