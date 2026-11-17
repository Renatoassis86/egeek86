// Seção "Jogos de Switch até R$ 200" (dono, 2026-11-17): teto, geração, ordem e paginação.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POR_PAGINA_SWITCH, TETO_SWITCH_CENTAVOS, contarPorGeracao, filtrarSwitchAte200, geracaoValida, paginaValida } from '../src/lib/switch-ate-200';

const o = (id: string, p: number, gen: string, tipo = 'game') => ({ id, currentPriceCents: p, masterProduct: { gamePlatformGen: gen, productType: tipo } });
const L = [o('a', 19990, 'switch_1'), o('b', 20000, 'switch_2'), o('c', 20001, 'switch_1'), o('d', 0, 'switch_1'), o('e', 9900, 'ps5'), o('f', 5000, 'switch_2', 'console'), o('g', 15000, 'switch_2'), o('h', 15000, 'switch_1')];
assert.equal(TETO_SWITCH_CENTAVOS, 20000);
assert.deepEqual(filtrarSwitchAte200(L).map((x) => x.id), ['g', 'h', 'a', 'b'], 'teto inclusivo de R$ 200, sem 0, sem outra plataforma, sem console, ordem por preço e id');
assert.deepEqual(filtrarSwitchAte200(L, 'switch_2').map((x) => x.id), ['g', 'b']);
assert.deepEqual(filtrarSwitchAte200(L, 'switch_1').map((x) => x.id), ['h', 'a']);
assert.deepEqual(contarPorGeracao(L), { total: 4, switch_1: 2, switch_2: 2 });
assert.equal(geracaoValida('switch_1'), 'switch_1');
assert.equal(geracaoValida('ps5'), null);
assert.equal(geracaoValida(undefined), null);
assert.equal(paginaValida('2', POR_PAGINA_SWITCH * 3), 2);
assert.equal(paginaValida('9', POR_PAGINA_SWITCH * 3), 1, 'página fora do intervalo volta à 1');
assert.equal(paginaValida('x', 10), 1);
const page = fs.readFileSync('src/app/(shop)/jogos-switch-ate-200/page.tsx', 'utf8');
assert.ok(page.includes("productType: 'game'") && page.includes("gamePlatformGen: ['switch_1', 'switch_2']"), 'página usa a lista pública de jogos Switch');
assert.ok(page.includes('filtrarSwitchAte200'), 'página aplica o teto pela regra pura');
console.log('test-switch-ate-200: OK');
