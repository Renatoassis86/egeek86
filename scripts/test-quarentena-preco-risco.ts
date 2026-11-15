export {};
import assert from 'node:assert/strict';
import { avaliarPrecoAbsoluto, avaliarPrecoPlausivel, avaliarPrecoRelativo } from '../src/lib/pricing/plausibilidade-tipo';
import { avaliarTituloRisco } from '../src/lib/catalog/titulo-risco';

const R = (reais: number) => Math.round(reais * 100);
const abs = (reais: number, vertical: string, productType: string, titulo: string) => avaliarPrecoAbsoluto({ priceCents: R(reais), vertical, productType, titulo });
let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log('ok -', nome); };

ok('caro legítimo: drone profissional R$ 74.284 passa', () => assert.equal(abs(74284, 'eletroeletronicos', 'general', 'Drone Dji Matrice 4t (thermal)'), null));
ok('caro legítimo: impressora 3D R$ 35.935 passa', () => assert.equal(abs(35935, 'impressao3d', 'general', 'Impressora 3d Fdm Fechada H2d Combo Ams Bambu Lab'), null));
ok('caro legítimo: câmera mirrorless R$ 36.338 passa', () => assert.equal(abs(36338, 'eletroeletronicos', 'general', 'Câmera Mirrorless Canon R5 Mark Ii'), null));
ok('caro legítimo: osciloscópio R$ 21.472 passa', () => assert.equal(abs(21472, 'tecnologia', 'general', 'Osciloscópio Digital Rigol MSO5354'), null));
ok('R$ 7,77 milhões (câmera) cai no teto absoluto', () => assert.equal(abs(7_770_000, 'eletroeletronicos', 'general', 'Câmera Compacta Canon PowerShot G3 X'), 'preco_acima_do_teto_absoluto'));
ok('caro por natureza não passa do teto geral (R$ 150 mil)', () => assert.equal(abs(160_000, 'eletroeletronicos', 'general', 'Drone DJI'), 'preco_acima_do_teto_absoluto'));
ok('item que não é caro por natureza: R$ 40 mil em livro cai no teto do tipo', () => assert.equal(abs(40_000, 'livros', 'general', 'Box de livros'), 'preco_acima_do_teto_do_tipo'));
ok('R$ 30.000 em acessório de games cai no teto do tipo', () => assert.equal(abs(30_000, 'games', 'accessory', 'Controle Sony DualSense'), 'preco_acima_do_teto_do_tipo'));
ok('console R$ 4.470 passa; R$ 447.009 cai', () => {
  assert.equal(abs(4470, 'games', 'console', 'Console Nintendo Switch 2'), null);
  assert.equal(abs(447_009, 'games', 'console', 'Console Nintendo Switch 2'), 'preco_acima_do_teto_absoluto');
});
ok('console nunca é "caro por natureza": PS5 comemorativo a R$ 23 mil cai', () => assert.equal(abs(23_000, 'games', 'console', 'Console PlayStation 5 Slim 30º Aniversário'), 'preco_acima_do_teto_do_tipo'));
ok('master de console mal tipado como game usa o teto de console (Switch 2 Zelda R$ 12 mil passa)', () => assert.equal(abs(12_000, 'games', 'game', 'Nintendo Switch 2 - The Legend Of Zelda 40th Anniversary Edition'), null));
ok('jogo a R$ 9.000 cai; jogo a R$ 299 passa', () => {
  assert.equal(abs(9000, 'games', 'game', "God of War Ragnarök Collector's Editions"), 'preco_acima_do_teto_do_tipo');
  assert.equal(abs(299, 'games', 'game', 'God of War Ragnarök'), null);
});
ok('barato legítimo: jogo digital R$ 4,99 e cabo R$ 4,99 passam (miúdo é do porteiro)', () => {
  assert.equal(abs(4.99, 'games', 'game', 'Jogo indie digital'), null);
  assert.equal(abs(4.99, 'games', 'accessory', 'Cabo USB'), null);
});
ok('isca: R$ 1,00 e R$ 2,00 caem no piso; R$ 3,00 passa', () => {
  assert.equal(abs(1, 'games', 'game', 'Jogos xbox one xbox series'), 'preco_irrisorio_abaixo_do_piso');
  assert.equal(abs(2, 'games', 'accessory', 'Borracha'), 'preco_irrisorio_abaixo_do_piso');
  assert.equal(abs(3, 'games', 'accessory', 'Borracha'), null);
});
ok('preço 0 ou negativo não é julgado', () => {
  assert.equal(abs(0, 'games', 'game', 'x'), null);
  assert.equal(avaliarPrecoAbsoluto({ priceCents: -5, vertical: 'games', productType: 'game', titulo: 'x' }), null);
});
ok('relativo: precisa de 2+ referências', () => {
  assert.equal(avaliarPrecoRelativo(R(10), [R(100)]), null);
  assert.equal(avaliarPrecoRelativo(R(10), [R(100), R(110)]), 'preco_abaixo_de_35pct_da_mediana');
});
ok('relativo: exatamente 35% e 300% passam; além disso cai', () => {
  assert.equal(avaliarPrecoRelativo(R(35), [R(100), R(100)]), null);
  assert.equal(avaliarPrecoRelativo(R(300), [R(100), R(100)]), null);
  assert.equal(avaliarPrecoRelativo(R(301), [R(100), R(100)]), 'preco_acima_de_300pct_da_mediana');
  assert.equal(avaliarPrecoRelativo(R(34), [R(100), R(100)]), 'preco_abaixo_de_35pct_da_mediana');
});
ok('completo: absoluto vence o relativo', () => assert.equal(avaliarPrecoPlausivel({ priceCents: R(7_770_000), vertical: 'eletroeletronicos', productType: 'general', titulo: 'Câmera', referenciasCents: [R(3000), R(3200)] }), 'preco_acima_do_teto_absoluto'));
ok('completo: oferta normal passa', () => assert.equal(avaliarPrecoPlausivel({ priceCents: R(3100), vertical: 'eletroeletronicos', productType: 'general', titulo: 'Câmera', referenciasCents: [R(3000), R(3200)] }), null));

const g = (t: string, productType: 'game' | 'console' | 'accessory' = 'console') => avaliarTituloRisco(t, { vertical: 'games', productType });
ok('título de risco: Switch desbloqueado, tinfoil, modificado, paralelo', () => {
  assert.match(g('Nintendo Switch OLED Desbloqueado Novo')?.motivo ?? '', /destravado_modificado/);
  assert.ok(g('Nintendo Switch Oled com Tinfoil'));
  assert.ok(g('Console modificado destravado'));
  assert.ok(g('Jogo Paralelo Switch', 'game'));
});
ok('título limpo: Switch OLED original lacrado e controle compatível não são risco', () => {
  assert.equal(g('Console Nintendo Switch OLED 64GB Original Lacrado'), null);
  assert.equal(g('Controle compatível com PS5 Gamer', 'accessory'), null);
});
ok('fora de games: celular "desbloqueado" e impressora com "cópia" NÃO são risco', () => {
  assert.equal(avaliarTituloRisco('Samsung Galaxy A15 128GB desbloqueado', { vertical: 'eletroeletronicos', productType: 'game' }), null);
  assert.equal(avaliarTituloRisco('Impressora multifuncional cópia e digitalização', { vertical: 'tecnologia', productType: 'game' }), null);
});
ok('fora de games: falsificado/réplica/primeira linha SÃO risco', () => {
  assert.ok(avaliarTituloRisco('Tênis réplica primeira linha', { vertical: 'esporte', productType: 'game' }));
  assert.ok(avaliarTituloRisco('Relógio falsificado', { vertical: 'eletroeletronicos', productType: 'game' }));
});
console.log(`\n${n} grupos de testes OK`);
