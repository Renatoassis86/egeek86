// Vertical Brinquedos e Colecionaveis (dono, 2026-11-20, R-105): so produto novo e em linha de marca; vertical desligada por padrao.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERTICALS, isVertical } from '../src/lib/catalog/verticais';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';
import { departamentoPorSlug } from '../src/lib/catalog/departamentos';
import { NOVOS_SEGMENTOS_TIPOS, MARCAS_BRINQUEDOS_TOP } from '../src/lib/catalog/vertical/config-tipos';
import { VERTICAIS_SHOPEE_OUTRAS } from '../src/lib/catalog/vertical/shopee-rodizio';
import { parseLojas } from '../src/lib/catalog/vertical/seed-slice';
import { RELEASED_VERTICALS } from '../src/lib/messaging/group-rules';
import { MARCAS_POR_LOJA, marcaDoItem } from '../src/lib/messaging/marcas-lojas';
import { killSwitchEnvName, isVerticalEnabled } from '../src/lib/catalog/vertical/config';
const { telegramChatFor } = require('../src/server/messaging/group-queue') as typeof import('../src/server/messaging/group-queue');

assert.ok(isVertical('brinquedos') && VERTICALS.includes('brinquedos'));
assert.equal(departamentoPorSlug('brinquedos')?.flag, 'dept_brinquedos');
assert.deepEqual(parseLojas('brinquedos'), ['brinquedos']);
assert.deepEqual(parseLojas('beleza,brinquedo'), ['beleza', 'brinquedos'], 'apelido brinquedo');
assert.ok(RELEASED_VERTICALS.includes('brinquedos'));
assert.ok((VERTICAIS_SHOPEE_OUTRAS as readonly string[]).includes('brinquedos'), 'R-94: Shopee entra no rodizio');
assert.equal(killSwitchEnvName('brinquedos'), 'VERTICAL_BRINQUEDOS_ENABLED');
assert.equal(isVerticalEnabled('brinquedos', {}), false, 'desligada por padrao');
assert.equal(isVerticalEnabled('brinquedos', { VERTICAL_BRINQUEDOS_ENABLED: '0' }), false);
assert.equal(telegramChatFor('brinquedos', { TELEGRAM_GROUP_CHAT_ID: 'games' }), undefined, 'sem env nunca cai no canal de games');
assert.equal(telegramChatFor('brinquedos', { TELEGRAM_GROUP_CHAT_ID_BRINQUEDOS: '-100123' }), '-100123');

const t = (s: string) => classificarTipo('brinquedos', s);
assert.equal(t('LEGO Star Wars Millennium Falcon 75375'), 'lego-blocos');
assert.equal(t('Funko Pop Homem Aranha Marvel 1234'), 'action-figure');
assert.equal(t('Hot Wheels Carrinho Colecionavel Premium'), 'miniatura-carrinho');
assert.equal(t('Jogo de Tabuleiro Catan Galapagos'), 'jogo-tabuleiro');
assert.equal(t('Quebra Cabeca Grow 1000 Pecas Paisagem'), 'quebra-cabeca');
assert.equal(t('Boneca Barbie Signature Colecionavel'), 'boneca');
assert.equal(t('Gunpla Gundam RG 1/144 Bandai'), 'kits-montar');

const bq = NOVOS_SEGMENTOS_TIPOS.filter((s) => s.vertical === 'brinquedos');
assert.equal(bq.length, 9, 'nove segmentos');
const rankBeleza = Math.max(...NOVOS_SEGMENTOS_TIPOS.filter((s) => s.vertical === 'beleza').map((s) => s.seedRank));
assert.ok(bq.every((s) => s.seedRank > rankBeleza), 'ranks depois dos da Beleza');
assert.equal(bq.find((s) => s.key === 'lego-blocos')?.terms[0].startsWith('lego'), true, 'a melhor marca abre a lista');
assert.deepEqual([...MARCAS_BRINQUEDOS_TOP].slice(0, 3), ['lego', 'hasbro', 'mattel']);
for (const m of MARCAS_BRINQUEDOS_TOP) assert.ok(MARCAS_POR_LOJA.brinquedos.includes(m), `marca ${m} na loja`);
assert.equal(marcaDoItem('brinquedos', 'lego star wars millennium falcon'), 'lego');

// porteiro: usado, retro, slime, fidget, bijuteria, peca/refil, impresso em 3D, imitacao e acessorio avulso fora; produto de marca entra
const gate = fs.readFileSync('src/lib/catalog/vertical/gate.ts', 'utf8');
const m = gate.match(/brinquedos: \/(.+)\/,/);
assert.ok(m, 'OUT_OF_SCOPE de brinquedos');
const re = new RegExp(m![1]);
for (const x of ['slime fluffy kit', 'fidget spinner', 'kit de bijuteria infantil', 'lego usado', 'boneco retro', 'pecas de reposicao lego', 'refil massinha', 'figure impresso em 3d', 'compativel com lego', 'chaveiro funko', 'case para funko pop', 'action figure open box']) assert.ok(re.test(x), x);
for (const x of ['lego star wars 75375', 'funko pop marvel', 'miniatura hot wheels premium', 'jogo de tabuleiro catan', 'gunpla rg 1 144 bandai', 'estatua dragon ball banpresto']) assert.ok(!re.test(x), x);

const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
const cron = cfg.crons.find((c) => c.path === '/api/cron/collect-vertical?v=brinquedos');
assert.ok(cron, 'cron de coleta de brinquedos');
assert.match(cron!.schedule, /^\d+,\d+ \* \* \* \*$/, 'a cada 30 min');
assert.ok(fs.existsSync('drizzle/migrations/0070_vertical_brinquedos.sql') && fs.existsSync('drizzle/migrations/0070_vertical_brinquedos.rollback.sql'), 'migracao e rollback');
console.log('test-brinquedos: OK');
