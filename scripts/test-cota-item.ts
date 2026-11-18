// Dono, 2026-11-18: preferencia de marcas na Beleza (Medicube, Tsubaki, Schwarzkopf, L'Oreal, Biore) e cotas por item em todas as lojas.
// Tudo e ORDEM da fila de envio, nunca bloqueio ("livre acesso ... sem prender o fluxo").
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COTA_FAMILIA_HORAS, COTA_TIPO_HORAS, MARCAS_PREFERIDAS, cotaItemLigada, ehMarcaPreferida, familiaDoItem, marcasPreferidasLigadas, normalizaNome, padraoMarcas } from '../src/lib/messaging/cota-item';
import { segmentsOf } from '../src/lib/catalog/vertical/config';
import { MARCAS_BELEZA_PREFERIDAS, MARCAS_MAQUIAGEM_TOP } from '../src/lib/catalog/vertical/config-tipos';

assert.equal(normalizaNome("Shampoo L'Oréal Paris"), 'shampoo l oreal paris');
for (const nome of ["Sérum Medicube Zero Pore", 'Tsubaki Premium Repair Shampoo 490ml', 'Schwarzkopf Gliss Ultimate Repair', "Shampoo L'Oréal Professionnel Serie Expert", 'Shampoo Elseve Hidra', 'Protetor Solar Bioré UV Aqua Rich', 'Máscara Loreal Paris Voluminous']) {
  assert.ok(ehMarcaPreferida('beleza', nome), `marca preferida: ${nome}`);
}
for (const nome of ['Esmalte Risqué Cremoso', 'Batom MAC Ruby Woo', 'Sérum La Roche-Posay B3', 'Perfume 212 Sexy Carolina Herrera', 'Biorefinaria Natural']) {
  assert.ok(!ehMarcaPreferida('beleza', nome), `NAO e marca preferida: ${nome}`);
}
assert.ok(!ehMarcaPreferida('tecnologia', 'Teclado Medicube'), 'a lista de marcas vale so para a loja que a tem');
assert.equal(padraoMarcas('games'), null);
assert.deepEqual(Object.keys(MARCAS_PREFERIDAS), ['beleza']);

// familia do item: as 3 primeiras palavras; mesma regra do SQL
assert.equal(familiaDoItem('Impressora 3D Bambu Lab A1 Mini'), 'impressora 3d bambu');
assert.equal(familiaDoItem('Esmalte Cremoso  Roxo Sem Crise Risque 8ml'), 'esmalte cremoso roxo');
assert.equal(COTA_FAMILIA_HORAS, 6);
assert.equal(COTA_TIPO_HORAS, 24);
assert.equal(cotaItemLigada({}), true);
assert.equal(cotaItemLigada({ GROUP_COTA_ITEM: 'off' }), false);
assert.equal(marcasPreferidasLigadas({}), true);
assert.equal(marcasPreferidasLigadas({ GROUP_MARCAS_PREFERIDAS: '0' }), false);

// SQL da fila: camadas, tabelas pequenas materializadas, ordem marca > regua > cota de familia > popularidade > recencia; nada exclui
const q = fs.readFileSync('src/server/messaging/group-queue.ts', 'utf8');
assert.ok(q.includes('fam6 AS MATERIALIZED') && q.includes('tipo24 AS MATERIALIZED'), 'cotas em CTE materializada (em subconsulta correlacionada no ORDER BY a consulta estourava 30 s)');
assert.ok(/ORDER BY b\.marca_ord ASC, COALESCE\(\(b\.candidate -> 'regua' ->> 'degrau'\)::int, 0\) DESC, b\.fam_sent6 ASC, b\.pop DESC, b\.created_at DESC\) AS rn_fair/.test(q), 'ordem: marca preferida, degrau da regua, cota de familia, popularidade, recencia');
assert.ok(/ORDER BY q\.rn_fair, q\.tipo_sent24, \(q\.trigger = 'AC'\), q\.created_at\) AS rn_v/.test(q), 'cota de tipo por loja (o tipo menos enviado em 24 h abre a fila)');
assert.ok(!/fam6[^;]{0,120}(AND NOT|NOT EXISTS|WHERE\s+f\.n)/.test(q), 'as cotas nunca excluem linha');

// descoberta: as 5 marcas entram nos termos de semeadura da Beleza
assert.deepEqual([...MARCAS_BELEZA_PREFERIDAS].slice(0, 3), ['medicube', 'tsubaki', 'schwarzkopf']);
assert.equal(MARCAS_MAQUIAGEM_TOP[0], 'mac', 'MAC segue abrindo a maquiagem (dono, 2026-11-17)');
const beleza = segmentsOf('beleza');
const termos = (k: string) => beleza.find((s) => s.key === k)!.terms.join(' | ');
assert.ok(/medicube/.test(termos('skincare')) && /biore/.test(termos('skincare')), 'skincare busca Medicube e Biore');
assert.ok(/tsubaki/.test(termos('cabelo')) && /schwarzkopf/.test(termos('cabelo')) && /loreal professionnel/.test(termos('cabelo')), 'cabelo busca Tsubaki, Schwarzkopf e Loreal');
assert.ok(/loreal paris/.test(termos('batom')), 'maquiagem busca Loreal Paris');
assert.ok(beleza.find((s) => s.key === 'skincare')!.terms[0].startsWith('medicube'), 'as marcas preferidas abrem a lista de skincare');
assert.ok(beleza.find((s) => s.key === 'cabelo')!.terms[0].startsWith('tsubaki'), 'as marcas preferidas abrem a lista de cabelo');
console.log('test-cota-item: OK');
