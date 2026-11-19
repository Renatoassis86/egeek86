// R-104: hierarquia da vitrine (src/lib/vitrine/hierarquia.ts). So ORDENA: determinismo, nenhum ativo perdido, diversidade, popularidade pesa, isca nao sobe, inativo nao entra.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { diversidadeNoTopo, ehIsca, hierarquiaLigada, hierarquizar, pontuar, type ItemHierarquia } from '../src/lib/vitrine/hierarquia';
import { familiaDoNome, subtipoAcessorio } from '../src/lib/vitrine/hierarquia-ofertas';

const base = (o: Partial<ItemHierarquia> & { id: string }): ItemHierarquia => ({
  tipo: 'a', marca: null, loja: 'ml', familia: null, popularidade: 0, quedaMediaPct: null, proximidadeMinimo: null, noMenorRegistrado: false,
  baixaConfianca: false, quedaBrutaPct: null, vendedor: 'ok', idadeMin: 30, ...o,
});
const ler = (x: ItemHierarquia) => x;

// 1) determinismo: qualquer embaralhamento da entrada gera a mesma saida
const tipos = ['mouse', 'teclado', 'headset', 'monitor', 'bola', 'tenis'];
const fx: ItemHierarquia[] = Array.from({ length: 120 }, (_, i) =>
  base({ id: `i${String(i).padStart(3, '0')}`, tipo: tipos[i % 3 === 0 ? 0 : i % 6], marca: `m${i % 7}`, loja: i % 2 ? 'ml' : 'shopee', familia: `f${i % 40}`, quedaMediaPct: (i * 7) % 35, popularidade: i % 10 === 0 ? 0.9 : 0, idadeMin: (i * 13) % 600 }));
const ordem = (xs: ItemHierarquia[]) => hierarquizar(xs, ler).map((x) => x.id).join(',');
const ref = ordem(fx);
for (let k = 0; k < 5; k++) {
  const emb = [...fx].sort(() => Math.random() - 0.5);
  assert.equal(ordem(emb), ref, 'determinismo: mesma saida para qualquer ordem de entrada');
}
assert.equal(ordem(fx), ref, 'idempotente');

// 2) nenhuma oferta ativa perdida: mesmo conjunto antes/depois, sem duplicata
const saida = hierarquizar(fx, ler);
assert.equal(saida.length, fx.length);
assert.deepEqual(saida.map((x) => x.id).sort(), fx.map((x) => x.id).sort(), 'so ordem: mesmo conjunto');
assert.equal(new Set(saida.map((x) => x.id)).size, fx.length);
assert.deepEqual(hierarquizar([], ler), []);
assert.equal(hierarquizar([base({ id: 'x' })], ler).length, 1);

// 3) diversidade: lista dominada por um tipo (mouse barato) abre o topo com varios tipos
const dominada: ItemHierarquia[] = [
  ...Array.from({ length: 60 }, (_, i) => base({ id: `m${String(i).padStart(2, '0')}`, tipo: 'mouse', marca: 'logitech', familia: `mouse ${i}`, quedaMediaPct: 30 })),
  ...['teclado', 'headset', 'monitor', 'ssd', 'webcam'].flatMap((t) => Array.from({ length: 4 }, (_, i) => base({ id: `${t}${i}`, tipo: t, marca: `b${t}${i}`, familia: `${t} ${i}`, quedaMediaPct: 12 }))),
];
const antes = diversidadeNoTopo([...dominada].sort((a, b) => (b.quedaMediaPct ?? 0) - (a.quedaMediaPct ?? 0) || (a.id < b.id ? -1 : 1)), 20);
const depois = diversidadeNoTopo(hierarquizar(dominada, ler), 20);
assert.equal(antes.tipos, 1, 'antes: so mouse');
assert.ok(depois.tipos >= 5, `depois: ao menos 5 tipos no top 20 (veio ${depois.tipos})`);
assert.ok(depois.topoTipoPct <= 40, `teto de tipo no topo (veio ${depois.topoTipoPct}%)`);
// tipo unico nao e preso: lista inteira segue ordenada e completa
const unico = Array.from({ length: 30 }, (_, i) => base({ id: `u${String(i).padStart(2, '0')}`, tipo: 'game:ps5', quedaMediaPct: i }));
assert.equal(hierarquizar(unico, ler).length, 30);
assert.equal(hierarquizar(unico, ler)[0].id, 'u29', 'tipo unico: ordem pela pontuacao (maior queda primeiro)');

// 4) popularidade pesa (mesma qualidade, a popular vem antes) e nao exclui
const pop = hierarquizar([base({ id: 'a', tipo: 'x1' }), base({ id: 'b', tipo: 'x2', popularidade: 1 })], ler);
assert.equal(pop[0].id, 'b');
assert.ok(pontuar(base({ id: 'p', popularidade: 1 })).score > pontuar(base({ id: 'q' })).score);
assert.equal(pop.length, 2);

// 5) isca nao sobe: queda bruta >= 60% vai para o fim, continua na lista
const comIsca = hierarquizar([base({ id: 'isca', tipo: 'y', quedaMediaPct: 75, quedaBrutaPct: 75, noMenorRegistrado: true, popularidade: 1 }), base({ id: 'normal1', tipo: 'z1', quedaMediaPct: 5 }), base({ id: 'normal2', tipo: 'z2' })], ler);
assert.equal(comIsca.at(-1)?.id, 'isca');
assert.equal(comIsca.length, 3);
assert.ok(ehIsca(base({ id: 'i', quedaBrutaPct: 60 })) && !ehIsca(base({ id: 'i', quedaBrutaPct: 59 })));
// baixa confianca nao ganha pela queda
assert.ok(pontuar(base({ id: 'bc', quedaMediaPct: 30, baixaConfianca: true })).qualidade === 0 || pontuar(base({ id: 'bc', quedaMediaPct: 30, baixaConfianca: true })).score < pontuar(base({ id: 'ok', quedaMediaPct: 30 })).score);

// 6) frescor e confianca ordenam, sem excluir; vendedor de reputacao baixa vai atras mas permanece
const conf = hierarquizar([base({ id: 'fraco', tipo: 't1', vendedor: 'low' }), base({ id: 'bom', tipo: 't2', vendedor: 'ok' }), base({ id: 'velho', tipo: 't3', idadeMin: 5000 })], ler);
assert.equal(conf[0].id, 'bom');
assert.equal(conf.length, 3);

// 7) inativo nao entra: a hierarquia nao recebe nem devolve o que a consulta nao trouxe; o modulo nao filtra nem inventa item; a consulta segue so com oferta ativa (R-90, ADR 0002)
const hier = fs.readFileSync('src/lib/vitrine/hierarquia.ts', 'utf8');
assert.ok(!/\.filter\(\(?[a-z]/.test(hier.replace(/\.filter\(Boolean\)/g, '')), 'o modulo nao filtra item algum');
const ofertasTs = fs.readFileSync('src/server/queries/affiliate.ts', 'utf8');
assert.ok(ofertasTs.includes("o.status = 'active'"), 'consulta de destaques segue so com oferta ativa (inativo fora)');

// 8) flag
assert.equal(hierarquiaLigada({}), true);
assert.equal(hierarquiaLigada({ VITRINE_HIERARQUIA: 'off' }), false);
assert.equal(hierarquiaLigada({ VITRINE_HIERARQUIA: '0' }), false);
assert.equal(hierarquiaLigada({ VITRINE_HIERARQUIA: 'on' }), true);

// 9) aplicacao nos blocos atras da flag, sem tocar nas consultas
for (const [arq, marca] of [
  ['src/app/(shop)/ofertas/page.tsx', 'hierarquizarOfertas'],
  ['src/components/geek-deals/weekly-promos-section.tsx', 'hierarquizarOfertas'],
  ['src/components/geek-deals/sales-highlights.tsx', 'hierarquizarOfertas'],
  ['src/server/plus-destaques.ts', 'hierarquizarCartoes'],
] as const) assert.ok(fs.readFileSync(arq, 'utf8').includes(marca), `${arq} usa a hierarquia`);
for (const arq of ['src/server/queries/public-offers.ts', 'src/server/queries/product-price-stats.ts', 'src/server/queries/departamento.ts']) assert.ok(!fs.readFileSync(arq, 'utf8').includes('vitrine/hierarquia'), `${arq} (consultas) nao importa a hierarquia`);
assert.ok(!/hierarquia|pontuar/i.test(fs.readFileSync('src/components/geek-deals/weekly-promos-carousel.tsx', 'utf8')), 'criterios internos nao aparecem no front');

// 10) auxiliares
assert.equal(familiaDoNome('Jogo God of War Ragnarok - PS5'), 'god of war');
assert.equal(subtipoAcessorio('Controle DualSense Branco'), 'controle');
assert.equal(subtipoAcessorio('Headset Gamer HyperX'), 'headset');
console.log('OK test-vitrine-hierarquia', JSON.stringify({ antes, depois }));
